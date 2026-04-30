// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IERC7496 is IERC165 {
    event TraitUpdated(uint256 indexed tokenId, bytes32 indexed traitKey, bytes32 oldValue, bytes32 newValue);

    function getTraitValue(uint256 tokenId, bytes32 traitKey) external view returns (bytes32);

    function getTraitMetadataURI() external view returns (string memory);
}
