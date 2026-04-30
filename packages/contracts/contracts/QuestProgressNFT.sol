// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./interfaces/IERC7496.sol";
import "./TargetBase.sol";

contract QuestProgressNFT is ERC721, TargetBase, IERC7496 {
    using Strings for uint256;

    uint256 private _nextTokenId;
    mapping(uint256 => mapping(bytes32 => bytes32)) private _traits;
    mapping(uint256 => uint256) public brandIds;

    string public metadataBaseURI;
    string public traitMetadataURI;

    bytes32 public constant TRAIT_XP = keccak256("XP");
    bytes32 public constant TRAIT_LEVEL = keccak256("LEVEL");
    bytes32 public constant TRAIT_RARITY = keccak256("RARITY");
    bytes32 public constant TRAIT_LOOT_KEYS = keccak256("LOOT_KEYS");

    struct TraitUpdate {
        bytes32 key;
        bytes32 value;
    }

    struct QuestResult {
        uint256 brandId;
        uint256 tokenId;
        uint256 questId;
        uint256 xpDelta;
        TraitUpdate[] traits;
    }

    struct LootboxResult {
        uint256 brandId;
        uint256 tokenId;
        TraitUpdate[] traits;
    }

    event BaseNFTMinted(address indexed user, uint256 indexed tokenId);
    event QuestApplied(
        address indexed user,
        uint256 indexed tokenId,
        uint256 indexed questId,
        uint256 xpDelta
    );
    event LootboxOpened(
        address indexed user,
        uint256 indexed tokenId,
        bytes lootData
    );
    event MetadataBaseURISet(string newBaseURI);
    event TraitMetadataURISet(string uri);
    event TraitsActivated(uint256 indexed tokenId, bytes32[] keys, bytes32[] values);

    constructor(
        string memory name_,
        string memory symbol_,
        address masterKey_,
        address recoveryKey_,
        address owner_,
        address delegatedAccountImpl_
    ) ERC721(name_, symbol_) TargetBase(masterKey_, recoveryKey_, owner_, delegatedAccountImpl_) {
        _nextTokenId = 1;
    }

    function setMetadataBaseURI(string calldata baseUri) external onlyOwner {
        metadataBaseURI = baseUri;
        emit MetadataBaseURISet(baseUri);
    }

    function setTraitMetadataURI(string calldata uri) external onlyOwner {
        traitMetadataURI = uri;
        emit TraitMetadataURISet(uri);
    }

    function setTraitMetadataURIAuth(AuthData calldata authData) external requireAuth(authData) {
        string memory uri = abi.decode(authData.result, (string));
        traitMetadataURI = uri;
        emit TraitMetadataURISet(uri);
    }

    function setMetadataBaseURIAuth(AuthData calldata authData) external requireAuth(authData) {
        string memory baseUri = abi.decode(authData.result, (string));
        metadataBaseURI = baseUri;
        emit MetadataBaseURISet(baseUri);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return string(abi.encodePacked(metadataBaseURI, "/", tokenId.toString()));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC7496).interfaceId || super.supportsInterface(interfaceId);
    }

    function getTraitValue(uint256 tokenId, bytes32 traitKey) external view returns (bytes32) {
        require(_exists(tokenId), "Token does not exist");
        return _traits[tokenId][traitKey];
    }

    function getTraitMetadataURI() external view returns (string memory) {
        return traitMetadataURI;
    }

    function setTrait(uint256 tokenId, bytes32 traitKey, bytes32 newValue) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        _setTrait(tokenId, traitKey, newValue);
    }

    function mintBaseNFT(AuthData calldata authData, address to)
        external
        requireAuth(authData)
        returns (uint256 tokenId)
    {
        uint256 brandId = abi.decode(authData.result, (uint256));
        tokenId = _nextTokenId;
        _nextTokenId++;
        _safeMint(to, tokenId);
        brandIds[tokenId] = brandId;

        _setTrait(tokenId, TRAIT_XP, bytes32(uint256(0)));
        _setTrait(tokenId, TRAIT_LEVEL, bytes32(uint256(1)));
        _setTrait(tokenId, TRAIT_RARITY, bytes32(uint256(0)));
        _setTrait(tokenId, TRAIT_LOOT_KEYS, bytes32(uint256(0)));

        emit BaseNFTMinted(to, tokenId);
    }

    function applyQuestResult(AuthData calldata authData) external requireAuth(authData) {
        QuestResult memory r = abi.decode(authData.result, (QuestResult));
        require(_exists(r.tokenId), "Token does not exist");
        require(brandIds[r.tokenId] == r.brandId, "Brand mismatch");

        for (uint256 i = 0; i < r.traits.length; i++) {
            TraitUpdate memory u = r.traits[i];
            _setTrait(r.tokenId, u.key, u.value);
        }

        emit QuestApplied(ownerOf(r.tokenId), r.tokenId, r.questId, r.xpDelta);
    }

    function openLootbox(AuthData calldata authData) external requireAuth(authData) {
        LootboxResult memory r = abi.decode(authData.result, (LootboxResult));
        require(_exists(r.tokenId), "Token does not exist");
        require(brandIds[r.tokenId] == r.brandId, "Brand mismatch");

        for (uint256 i = 0; i < r.traits.length; i++) {
            TraitUpdate memory u = r.traits[i];
            _setTrait(r.tokenId, u.key, u.value);
        }

        emit LootboxOpened(ownerOf(r.tokenId), r.tokenId, authData.result);
    }

    function setActiveTraitsAuth(
        AuthData calldata authData,
        bytes32[] calldata keys,
        bytes32[] calldata values
    ) external requireAuth(authData) {
        require(keys.length == values.length, "Length mismatch");

        (uint256 tokenId, bytes32[] memory authKeys, bytes32[] memory authValues) =
            abi.decode(authData.result, (uint256, bytes32[], bytes32[]));

        require(_exists(tokenId), "Token does not exist");
        require(authKeys.length == keys.length && authValues.length == values.length, "Auth data mismatch");
        require(
            keccak256(abi.encode(authKeys)) == keccak256(abi.encode(keys)) &&
                keccak256(abi.encode(authValues)) == keccak256(abi.encode(values)),
            "Auth data mismatch"
        );

        for (uint256 i = 0; i < keys.length; i++) {
            _setTrait(tokenId, keys[i], values[i]);
        }

        emit TraitsActivated(tokenId, keys, values);
    }

    function getTrait(uint256 tokenId, bytes32 key) external view returns (bytes32) {
        require(_exists(tokenId), "Token does not exist");
        return _traits[tokenId][key];
    }

    function getUintTrait(uint256 tokenId, bytes32 key) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return uint256(_traits[tokenId][key]);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function _setTrait(uint256 tokenId, bytes32 traitKey, bytes32 newValue) internal {
        bytes32 oldValue = _traits[tokenId][traitKey];
        if (oldValue == newValue) {
            return;
        }
        _traits[tokenId][traitKey] = newValue;
        emit TraitUpdated(tokenId, traitKey, oldValue, newValue);
    }
}
