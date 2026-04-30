// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TargetBase
 * @notice Base contract for signature-based authorization with smart account enforcement
 * @dev Implements a multi-layered authorization system:
 *      - Signature-based authorization with master key control
 *      - Strict smart account implementation validation
 *      - Replay protection through nonce and hash tracking
 *      - Temporal validation with expiry timestamps
 *      - Emergency recovery mechanisms
 *
 * @dev Architecture:
 *      Uses a modifier-based pattern where protected functions require
 *      an AuthData parameter containing cryptographic proof of authorization.
 *      Only approved DelegatedAccount implementations can call protected functions,
 *      preventing EOA and unauthorized smart contract access.
 *
 * @dev Access Control:
 *      - Master Key: Signs all authorizations, can be rotated via owner/recovery
 *      - Recovery Key: Can update master key in emergency situations
 *      - Owner: Administrative control over contract settings and implementations
 *      - DelegatedAccount: Only approved smart account implementation allowed
 *
 * @dev Replay Protection:
 *      - Sequential nonces per sender address
 *      - Authorization hash tracking (sender, nonce, expiry, data, selector)
 *      - Temporal validation with expiry timestamps
 *      - One-time use enforcement per authorization
 *
 * @dev Usage Pattern:
 * ```solidity
 * contract MyProtectedContract is TargetBase {
 *     function sensitiveOperation(
 *         AuthData calldata authData,    // Required authorization proof
 *         uint256 amount,                // Business logic parameters
 *         address recipient              // Additional parameters
 *     ) external requireAuth(authData) {
 *         // Protected business logic here
 *     }
 * }
 * ```
 *
 * @dev Caller Requirements:
 *      - Must be a deployed smart contract (no EOA access)
 *      - Code hash must exactly match registered DelegatedAccount
 *      - Authorization must be signed by current master key
 *      - Nonce must be sequential and unused
 *      - Authorization must not be expired
 *
 * @author POC Bundler Team
 */
contract TargetBase is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Data Structures ============

    /**
     * @notice Generic execution structure for chained data sources
     * @dev Used to track individual execution steps in multi-source data flows
     *
     * @param id Hash identifier for this execution
     * @param request ABI-encoded request parameters for this execution
     * @param response ABI-encoded response data from this execution
     */
    struct Execution {
        bytes32 id; // Hash identifier for this execution
        bytes request; // ABI-encoded request parameters
        bytes response; // ABI-encoded response data
    }

    /**
     * @notice Authorization data structure containing all required verification parameters
     * @dev This struct MUST be the first parameter of any function using requireAuth modifier
     *      Enhanced to support multi-source execution chains with generic data handling
     *
     * @param nonce Sequential nonce value (must equal sender's current nonce)
     * @param expiry Unix timestamp after which authorization becomes invalid
     * @param id Overall execution hash ID for the entire operation
     * @param executions Array of all execution steps (optional, can be empty for simple auth)
     * @param result Final result data (for multi-source) or function parameters (for simple auth)
     * @param signature ECDSA signature (65 bytes) from current master key over authorization hash
     *
     * @dev Authorization Hash Composition:
     *      keccak256(abi.encodePacked(sender, nonce, expiry, result, functionSelector))
     *      For backward compatibility, 'result' field is used in hash calculation
     *
     * @dev Security Properties:
     *      - Nonce prevents replay attacks across different transactions
     *      - Expiry prevents long-term signature reuse
     *      - Result binding prevents parameter substitution attacks
     *      - Function selector prevents cross-function signature reuse
     *      - Sender binding prevents signature reuse across different accounts
     *      - Execution chain provides full audit trail for multi-source operations
     */
    struct AuthData {
        uint256 nonce;
        uint256 expiry;
        bytes32 id; // Overall execution hash ID
        Execution[] executions; // Array of all execution steps
        bytes result; // Final result or function parameters
        bool sponsorExecutionFee; // Master key sponsors DelegatedAccount execution fee
        bytes signature;
    }

    // ============ State Variables ============

    /// @notice The trusted master key that signs all authorization requests
    /// @dev This address has exclusive authority to authorize protected operations
    ///      Can be updated by owner or recovery key for security rotation
    address public masterKey;

    /// @notice Emergency recovery key for master key rotation
    /// @dev Separated from owner to provide additional security layer and operational flexibility
    ///      Can update master key but cannot perform other administrative functions
    address public recoveryKey;

    /// @notice Per-sender nonce tracking for replay protection
    /// @dev Maps sender address to current nonce value
    ///      Nonces must be used sequentially starting from 0
    ///      Incremented after each successful authorization
    mapping(address => uint256) public nonces;

    /// @notice Used authorization hash tracking for additional replay protection
    /// @dev Maps authorization hash to usage status (true = used, false = unused)
    ///      Provides secondary replay protection layer beyond nonces
    ///      Hash includes: keccak256(sender, nonce, expiry, data, functionSelector)
    mapping(bytes32 => bool) public usedAuthorizations;

    /// @notice Approved DelegatedAccount implementation code hash
    /// @dev Stores the exact extcodehash of the approved DelegatedAccount implementation
    ///      Only smart contracts with this exact code hash can call protected functions
    ///      Set during construction and updatable by owner for implementation upgrades
    bytes32 public delegatedAccountCodeHash;

    // ============ Events ============

    /**
     * @notice Emitted when an authorization is successfully verified
     * @param authorizer Address of the authorization key that signed
     * @param sender Address that initiated the transaction
     * @param nonce The nonce used for this authorization
     * @param dataHash Hash of the authorized data
     */
    event AuthorizationVerified(address indexed authorizer, address indexed sender, uint256 nonce, bytes32 dataHash);

    /**
     * @notice Emitted when the authorization key is updated
     * @param oldKey Previous authorization key address
     * @param newKey New authorization key address
     * @param updatedBy Address that performed the update (owner or recovery)
     */
    event MasterKeyUpdated(address indexed oldKey, address indexed newKey, address indexed updatedBy);

    /**
     * @notice Emitted when the recovery key is updated
     * @param oldKey Previous recovery key address
     * @param newKey New recovery key address
     */
    event RecoveryKeyUpdated(address indexed oldKey, address indexed newKey);

    /**
     * @notice Emitted when the DelegatedAccount implementation is set
     * @param implementation Address of the DelegatedAccount implementation
     * @param codeHash The extcodehash of the DelegatedAccount implementation
     */
    event DelegatedAccountSet(address indexed implementation, bytes32 indexed codeHash);

    // ============ Custom Errors ============

    /// @notice Signature verification failed - invalid signature or wrong signer
    /// @dev Thrown when ECDSA recovery fails or recovered address != masterKey
    error InvalidSignature();

    /// @notice Authorization has expired based on current block timestamp
    /// @dev Thrown when block.timestamp > authData.expiry
    error AuthorizationExpired();

    /// @notice Nonce value is incorrect - must be sequential
    /// @dev Thrown when authData.nonce != nonces[msg.sender]
    error InvalidNonce();

    /// @notice Authorization has already been consumed (replay attack prevention)
    /// @dev Thrown when authorization hash exists in usedAuthorizations mapping
    error AuthorizationAlreadyUsed();

    /// @notice Caller lacks required permissions for this operation
    /// @dev Thrown when msg.sender != owner && msg.sender != recoveryKey for admin functions
    error UnauthorizedCaller();

    /// @notice Zero address provided where valid address required
    /// @dev Thrown during construction/updates when address(0) is not allowed
    error InvalidAddress();

    /// @notice Caller's contract implementation does not match approved DelegatedAccount
    /// @dev Thrown when extcodehash(caller) != delegatedAccountCodeHash
    error InvalidImplementation();

    /// @notice DelegatedAccount implementation has not been configured
    /// @dev Thrown when delegatedAccountCodeHash == bytes32(0)
    error DelegatedAccountNotSet();

    /// @notice Caller has no code deployed (EOA or empty contract)
    /// @dev Thrown when extcodehash(caller) == 0x0 or == keccak256("")
    error NoCode();

    // ============ Constructor ============

    /**
     * @notice Initializes the TargetBase contract with security parameters
     * @dev Sets up the authorization framework with validation
     *
     * @param _masterKey Address that will sign all authorization requests (cannot be zero)
     * @param _recoveryKey Emergency address that can rotate the master key (cannot be zero)
     * @param _owner Contract owner with administrative privileges (cannot be zero)
     * @param _delegatedAccountImpl Address of deployed DelegatedAccount implementation (cannot be zero)
     *
     * Requirements:
     * - All addresses must be non-zero
     * - _delegatedAccountImpl must be a deployed contract with code
     * - _delegatedAccountImpl cannot be an empty contract (post-selfdestruct)
     *
     * Effects:
     * - Sets masterKey for authorization signing
     * - Sets recoveryKey for emergency master key rotation
     * - Transfers ownership to _owner (via Ownable)
     * - Registers _delegatedAccountImpl as the only approved caller implementation
     * - Emits DelegatedAccountSet event
     *
     * Security:
     * - Validates all addresses are non-zero to prevent misconfiguration
     * - Validates implementation has deployed code to prevent empty contracts
     * - Establishes caller verification from deployment
     */
    constructor(address _masterKey, address _recoveryKey, address _owner, address _delegatedAccountImpl)
        Ownable(_owner)
    {
        if (_masterKey == address(0)) revert InvalidAddress();
        if (_recoveryKey == address(0)) revert InvalidAddress();
        if (_delegatedAccountImpl == address(0)) revert InvalidAddress();

        masterKey = _masterKey;
        recoveryKey = _recoveryKey;

        // Set the approved DelegatedAccount implementation
        _setDelegatedAccountImplementation(_delegatedAccountImpl);
    }

    // ============ Access Control Modifier ============

    /**
     * @notice Authorization modifier enforcing security validation
     * @dev This modifier implements a multi-layered security framework:
     *      1. Smart Contract Validation: Ensures caller is approved DelegatedAccount
     *      2. Nonce Validation: Prevents replay attacks via sequential nonces
     *      3. Temporal Validation: Prevents expired authorization usage
     *      4. Signature Validation: Cryptographically verifies master key authorization
     *      5. Replay Protection: Tracks used authorizations to prevent reuse
     *
     * @param authData Authorization proof structure containing nonce, expiry, data, signature
     *
     * Validation Process:
     * 1. Check caller is DelegatedAccount implementation (not EOA or other contracts)
     * 2. Verify nonce matches expected sequential value for sender
     * 3. Verify current timestamp <= expiry (authorization not expired)
     * 4. Compute authorization hash including sender, nonce, expiry, data, function selector
     * 5. Verify authorization hash hasn't been used before (replay protection)
     * 6. Cryptographically verify signature from current master key
     * 7. Update nonce and mark authorization as used
     * 8. Emit verification event for audit trail
     * 9. Execute protected function
     *
     * Requirements:
     * - msg.sender must be DelegatedAccount with exact matching code hash
     * - authData.nonce must equal nonces[msg.sender] (sequential)
     * - block.timestamp must be <= authData.expiry (not expired)
     * - Authorization hash must not exist in usedAuthorizations (not replayed)
     * - Signature must be valid ECDSA signature from current masterKey
     *
     * Effects:
     * - Increments nonces[msg.sender] by 1
     * - Sets usedAuthorizations[authHash] = true
     * - Emits AuthorizationVerified event
     *
     * Gas Optimization:
     * - Uses nonReentrant for reentrancy protection
     * - Efficient hash computation with abi.encodePacked
     * - Single storage write per nonce increment
     */
    modifier requireAuth(AuthData calldata authData) {
        _verifyAuthorization(authData);
        _;
    }

    // ============ Internal Verification Logic ============

    /**
     * @notice Core verification logic for authorization key signatures
     * @dev This function is automatically invoked by the requireAuth modifier
     *
     * @param authData The authorization data structure to verify
     *
     * Verification Steps:
     * 1. Implementation Check: Verify caller has approved code hash
     * 2. Nonce Validation: Ensures nonce is sequential
     * 3. Temporal Validation: Ensures authorization hasn't expired
     * 4. Replay Protection: Creates unique hash and checks/marks usage
     * 5. Signature Verification: Validates signature from masterKey
     * 6. State Updates: Increments nonce and marks authorization as used
     */
    function _verifyAuthorization(AuthData calldata authData) internal nonReentrant {
        // Verify caller is an approved smart account implementation
        _verifyImplementation();

        // Verify nonce is correct (must be sequential)
        if (authData.nonce != nonces[msg.sender]) revert InvalidNonce();

        // Verify authorization hasn't expired
        if (block.timestamp > authData.expiry) revert AuthorizationExpired();

        // Create unique hash for this authorization (AuthData without signature)
        bytes32 authHash = keccak256(
            abi.encodePacked(
                msg.sender,
                authData.nonce,
                authData.expiry,
                authData.id,
                keccak256(abi.encode(authData.executions)),
                authData.result,
                authData.sponsorExecutionFee,
                msg.sig // Include function selector
            )
        );

        // Check for replay attack
        if (usedAuthorizations[authHash]) revert AuthorizationAlreadyUsed();

        // Verify signature
        bytes32 ethSignedHash = authHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(authData.signature);

        if (signer != masterKey) revert InvalidSignature();

        // Update state to prevent replay
        nonces[msg.sender]++;
        usedAuthorizations[authHash] = true;

        // Emit verification event
        emit AuthorizationVerified(masterKey, msg.sender, authData.nonce, keccak256(authData.result));
    }

    /**
     * @notice Validates caller is an approved DelegatedAccount implementation
     * @dev Performs contract validation using extcodehash comparison
     *      This is a critical security function preventing unauthorized access
     *
     * Validation Steps:
     * 1. Ensures DelegatedAccount implementation is configured
     * 2. Extracts caller's contract code hash using assembly
     * 3. Rejects EOAs (Externally Owned Accounts) - no code deployed
     * 4. Rejects empty contracts (post-selfdestruct) - empty code hash
     * 5. Enforces exact code hash match with approved DelegatedAccount
     *
     * Security Properties:
     * - Prevents EOA direct access (major attack vector prevention)
     * - Prevents unauthorized smart contract access
     * - Enforces implementation exactness (no similar contracts accepted)
     * - Protects against selfdestruct -> recreate attacks
     *
     * Gas Optimization:
     * - Uses inline assembly for efficient extcodehash operation
     * - Early returns on invalid conditions
     * - Minimal storage reads (single delegatedAccountCodeHash check)
     *
     * @dev Implementation Note:
     *      The function uses extcodehash(caller()) to get the actual calling
     *      contract's code hash, not msg.sender which could be manipulated
     *      through delegateCall patterns
     */
    function _verifyImplementation() internal view {
        if (delegatedAccountCodeHash == bytes32(0)) {
            revert DelegatedAccountNotSet();
        }

        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(caller())
        }

        // Reject EOAs (no code) - CRITICAL security requirement
        if (codeHash == 0x0) {
            revert NoCode();
        }

        // Reject empty contracts (selfdestruct remnants)
        // keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
        if (codeHash == 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470) {
            revert NoCode();
        }

        // Only allow exact EIP-7702 wrapper hash match
        if (codeHash != delegatedAccountCodeHash) {
            revert InvalidImplementation();
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the DelegatedAccount implementation
     * @dev Only owner can set the implementation
     * @param implementation Address of the DelegatedAccount implementation
     */
    function setDelegatedAccountImplementation(address implementation) external onlyOwner {
        _setDelegatedAccountImplementation(implementation);
    }

    /**
     * @notice Internal function to set DelegatedAccount implementation
     * @param implementation Address of the DelegatedAccount implementation
     */
    function _setDelegatedAccountImplementation(address implementation) internal {
        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(implementation)
        }

        // Verify implementation has code
        if (codeHash == 0x0 || codeHash == 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470) {
            revert NoCode();
        }

        // Calculate EIP-7702 wrapper hash for EOA delegation
        // EIP-7702 accounts have code: 0xef0100 + implementation_address
        bytes memory eip7702Code = abi.encodePacked(hex"ef0100", implementation);
        delegatedAccountCodeHash = keccak256(eip7702Code);

        emit DelegatedAccountSet(implementation, delegatedAccountCodeHash);
    }

    /**
     * @notice Updates the authorization key address
     * @dev Can be called by owner or recovery key for emergency updates
     * @param newMasterKey The new authorization key address (cannot be zero)
     */
    function updateMasterKey(address newMasterKey) external {
        if (msg.sender != owner() && msg.sender != recoveryKey) {
            revert UnauthorizedCaller();
        }
        if (newMasterKey == address(0)) revert InvalidAddress();

        address oldKey = masterKey;
        masterKey = newMasterKey;

        emit MasterKeyUpdated(oldKey, newMasterKey, msg.sender);
    }

    /**
     * @notice Updates the recovery key address
     * @dev Can only be called by the contract owner
     * @param newRecoveryKey The new recovery key address (cannot be zero)
     */
    function updateRecoveryKey(address newRecoveryKey) external onlyOwner {
        if (newRecoveryKey == address(0)) revert InvalidAddress();

        address oldKey = recoveryKey;
        recoveryKey = newRecoveryKey;

        emit RecoveryKeyUpdated(oldKey, newRecoveryKey);
    }

    /**
     * @notice Emergency function to reset a user's nonce
     * @dev Can only be called by owner, use with extreme caution
     * @param user The user whose nonce to reset
     * @param newNonce The new nonce value
     */
    function emergencyResetNonce(address user, uint256 newNonce) external onlyOwner {
        nonces[user] = newNonce;
    }

    // ============ View Functions ============

    /**
     * @notice Gets the current nonce for a user
     * @param user The user address to query
     * @return The current nonce value
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @notice Check if DelegatedAccount implementation is set
     * @return True if DelegatedAccount implementation is configured
     */
    function isDelegatedAccountSet() external view returns (bool) {
        return delegatedAccountCodeHash != bytes32(0);
    }

    /**
     * @notice Get the code hash of an address
     * @param account Address to check
     * @return The extcodehash of the account
     */
    function getCodeHash(address account) external view returns (bytes32) {
        bytes32 codeHash;
        assembly {
            // Get the code hash directly from the account
            // For EIP-7702 delegated EOAs, this returns keccak256(0xef0100 || implementation)
            // For regular contracts, this returns the keccak256 of their bytecode
            // For EOAs without delegation, this returns 0x0
            codeHash := extcodehash(account)
        }
        return codeHash;
    }

    /**
     * @notice Check if an account is a valid DelegatedAccount implementation
     * @param account Address to check
     * @return Whether the account's code hash matches the DelegatedAccount implementation
     */
    function isDelegatedAccount(address account) external view returns (bool) {
        bytes32 codeHash;
        assembly {
            // Get the code hash directly from the account
            // If this is an EIP-7702 delegated EOA, the hash will be keccak256(0xef0100 || implementation)
            codeHash := extcodehash(account)
        }
        // Check if it matches our stored delegated account code hash
        return codeHash == delegatedAccountCodeHash && delegatedAccountCodeHash != bytes32(0);
    }

    /**
     * @notice Checks if an authorization hash has been used
     * @param authHash The authorization hash to check
     * @return True if the authorization has been used, false otherwise
     */
    function isAuthorizationUsed(bytes32 authHash) external view returns (bool) {
        return usedAuthorizations[authHash];
    }

    /**
     * @notice Computes the hash that needs to be signed for an authorization
     * @dev Helper function for off-chain signing - includes all AuthData except signature
     * @param user The user address that will execute the transaction
     * @param authData The complete authorization data structure (signature field ignored)
     * @param selector The function selector being called
     * @return The hash that should be signed by the authorization key
     */
    function getAuthorizationHash(address user, AuthData calldata authData, bytes4 selector)
        external
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                user,
                authData.nonce,
                authData.expiry,
                authData.id,
                keccak256(abi.encode(authData.executions)),
                authData.result,
                authData.sponsorExecutionFee,
                selector
            )
        );
    }
}