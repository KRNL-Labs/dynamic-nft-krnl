# Step 10 — tokenURI (Dynamic Metadata Endpoint)

Goal: QuestProgressNFT must expose standard ERC-721 `tokenURI(tokenId)` that points to our backend metadata endpoint so NFT images update automatically in wallets/marketplaces.

We deploy one QuestProgressNFT per brand. Therefore each contract can be configured with a base metadata URL that includes the brandId.

Example metadata endpoint:
- `https://api.example.com/metadata/brand_123/<tokenId>`

So contract stores:
- `metadataBaseURI = "https://api.example.com/metadata/brand_123"`

Then:
- `tokenURI(1) = metadataBaseURI + "/1"`

---

## Requirements

1) Add state variable:
```solidity
string public metadataBaseURI;
````

2. Add owner-only setter:

```solidity
function setMetadataBaseURI(string calldata newBaseURI) external onlyOwner;
```

3. Override ERC721 `tokenURI`:

* Revert if token does not exist.
* Return:

  * `string(abi.encodePacked(metadataBaseURI, "/", tokenId.toString()))`

Use OpenZeppelin Strings:

* `@openzeppelin/contracts/utils/Strings.sol`

4. Emit event when base URI changes:

```solidity
event MetadataBaseURISet(string newBaseURI);
```

5. Constructor:

* Keep existing constructor, but optionally accept a base URI:

  * If you prefer, add:

    ```solidity
    constructor(string memory name_, string memory symbol_, string memory baseURI_)
    ```
  * Otherwise initialize empty and set later via setter.

MVP: keep constructor unchanged and set via setter after deploy.

---