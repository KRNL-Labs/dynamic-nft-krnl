const { expect } = require("chai");
const { ethers } = require("hardhat");

const coder = ethers.AbiCoder.defaultAbiCoder();
const padUint = (value) => ethers.zeroPadValue(ethers.toBeHex(value), 32);
const EXECUTION_ARRAY_TYPE = "tuple(bytes32 id,bytes request,bytes response)[]";

const encodeQuestResult = (data) =>
  coder.encode(
    [
      "tuple(uint256 brandId,uint256 tokenId,uint256 questId,uint256 xpDelta,tuple(bytes32 key,bytes32 value)[] traits)",
    ],
    [data]
  );

const encodeLootboxResult = (data) =>
  coder.encode(
    ["tuple(uint256 brandId,uint256 tokenId,tuple(bytes32 key,bytes32 value)[] traits)"],
    [data]
  );

describe("QuestProgressNFT", () => {
  let owner;
  let masterKey;
  let recoveryKey;
  let user;
  let delegatedAccount;
  let delegatedSigner;
  let delegatedImpl;
  let nft;
  const brandId = 123n;
  const erc721InterfaceId = "0x80ac58cd";
  const erc7496InterfaceId = (() => {
    const iface = new ethers.Interface([
      "function getTraitValue(uint256,bytes32) view returns (bytes32)",
      "function getTraitMetadataURI() view returns (string)",
    ]);
    const selectors = [
      iface.getFunction("getTraitValue").selector,
      iface.getFunction("getTraitMetadataURI").selector,
    ];
    const id = selectors.reduce((acc, selector) => acc ^ BigInt(selector), 0n);
    return `0x${id.toString(16).padStart(8, "0")}`;
  })();

  const buildAuthData = async ({
    sender,
    nonce,
    expiry,
    result,
    selector,
    signer,
    sponsorExecutionFee = false,
    id = ethers.ZeroHash,
    executions = [],
  }) => {
    const execsHash = ethers.keccak256(coder.encode([EXECUTION_ARRAY_TYPE], [executions]));
    const packed = ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32", "bytes32", "bytes", "bool", "bytes4"],
      [sender, nonce, expiry, id, execsHash, result, sponsorExecutionFee, selector]
    );
    const authHash = ethers.keccak256(packed);
    const signature = await signer.signMessage(ethers.getBytes(authHash));
    return {
      authData: { nonce, expiry, id, executions, result, sponsorExecutionFee, signature },
      authHash,
    };
  };

  const setupDelegatedAccount = async (implAddress) => {
    const delegatedAddress = ethers.Wallet.createRandom().address;
    const eip7702Code = `0xef0100${implAddress.slice(2).toLowerCase()}`;
    await owner.sendTransaction({ to: delegatedAddress, value: ethers.parseEther("1") });
    await ethers.provider.send("hardhat_setCode", [delegatedAddress, eip7702Code]);
    await ethers.provider.send("hardhat_impersonateAccount", [delegatedAddress]);
    const signer = await ethers.getSigner(delegatedAddress);
    return { delegatedAddress, signer };
  };

  beforeEach(async () => {
    [owner, masterKey, recoveryKey, user] = await ethers.getSigners();
    const DelegatedAccountMock = await ethers.getContractFactory("DelegatedAccountMock");
    delegatedImpl = await DelegatedAccountMock.deploy();
    await delegatedImpl.waitForDeployment();

    const Factory = await ethers.getContractFactory("QuestProgressNFT");
    nft = await Factory.deploy(
      "Quest",
      "QST",
      masterKey.address,
      recoveryKey.address,
      owner.address,
      await delegatedImpl.getAddress()
    );
    await nft.waitForDeployment();

    const delegatedSetup = await setupDelegatedAccount(await delegatedImpl.getAddress());
    delegatedAccount = delegatedSetup.delegatedAddress;
    delegatedSigner = delegatedSetup.signer;
  });

  it("mints base NFT with initial traits and emits event", async () => {
    const result = coder.encode(["uint256"], [brandId]);
    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await expect(nft.connect(delegatedSigner).mintBaseNFT(authData, user.address))
      .to.emit(nft, "BaseNFTMinted")
      .withArgs(user.address, 1);

    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.getUintTrait(1, await nft.TRAIT_XP())).to.equal(0n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_LEVEL())).to.equal(1n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_RARITY())).to.equal(0n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_LOOT_KEYS())).to.equal(0n);
    expect(await nft.getNonce(delegatedAccount)).to.equal(1n);
    expect(await nft.brandIds(1)).to.equal(brandId);
    expect(await nft.getTraitValue(1, await nft.TRAIT_LEVEL())).to.equal(padUint(1n));
  });

  it("sets metadata base URI (owner-only) and returns tokenURI", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const baseUri = "https://api.example.com/metadata/brand_123";
    await expect(nft.setMetadataBaseURI(baseUri))
      .to.emit(nft, "MetadataBaseURISet")
      .withArgs(baseUri);

    expect(await nft.metadataBaseURI()).to.equal(baseUri);
    expect(await nft.tokenURI(1)).to.equal(`${baseUri}/1`);
  });

  it("reverts when non-owner sets metadata base URI", async () => {
    await expect(
      nft.connect(user).setMetadataBaseURI("https://api.example.com/metadata/brand_123")
    ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount").withArgs(user.address);
  });

  it("sets trait metadata URI via auth data", async () => {
    const uri = "https://api.example.com/traits";
    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: coder.encode(["string"], [uri]),
      selector: nft.interface.getFunction("setTraitMetadataURIAuth").selector,
      signer: masterKey,
    });

    await expect(nft.connect(delegatedSigner).setTraitMetadataURIAuth(authData))
      .to.emit(nft, "TraitMetadataURISet")
      .withArgs(uri);

    expect(await nft.getTraitMetadataURI()).to.equal(uri);
  });

  it("applies quest result updates and emits event", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const questResult = {
      brandId,
      tokenId: 1n,
      questId: 7n,
      xpDelta: 10n,
      traits: [
        { key: await nft.TRAIT_XP(), value: padUint(10n) },
        { key: await nft.TRAIT_LEVEL(), value: padUint(2n) },
      ],
    };

    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 1,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: encodeQuestResult(questResult),
      selector: nft.interface.getFunction("applyQuestResult").selector,
      signer: masterKey,
    });

    await expect(nft.connect(delegatedSigner).applyQuestResult(authData))
      .to.emit(nft, "TraitUpdated")
      .withArgs(1, await nft.TRAIT_XP(), padUint(0n), padUint(10n))
      .to.emit(nft, "TraitUpdated")
      .withArgs(1, await nft.TRAIT_LEVEL(), padUint(1n), padUint(2n))
      .to.emit(nft, "QuestApplied")
      .withArgs(user.address, 1, 7, 10);

    expect(await nft.getUintTrait(1, await nft.TRAIT_XP())).to.equal(10n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_LEVEL())).to.equal(2n);
    expect(await nft.getNonce(delegatedAccount)).to.equal(2n);
  });

  it("reverts quest result when brandId does not match token", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const questResult = {
      brandId: brandId + 1n,
      tokenId: 1n,
      questId: 7n,
      xpDelta: 10n,
      traits: [{ key: await nft.TRAIT_XP(), value: padUint(10n) }],
    };

    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 1,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: encodeQuestResult(questResult),
      selector: nft.interface.getFunction("applyQuestResult").selector,
      signer: masterKey,
    });

    await expect(
      nft.connect(delegatedSigner).applyQuestResult(authData)
    ).to.be.revertedWith("Brand mismatch");
  });

  it("opens lootbox, updates traits, and emits event", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const lootboxResult = {
      brandId,
      tokenId: 1n,
      traits: [
        { key: await nft.TRAIT_LOOT_KEYS(), value: padUint(3n) },
        { key: await nft.TRAIT_RARITY(), value: padUint(5n) },
      ],
    };

    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 1,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: encodeLootboxResult(lootboxResult),
      selector: nft.interface.getFunction("openLootbox").selector,
      signer: masterKey,
    });

    await expect(nft.connect(delegatedSigner).openLootbox(authData))
      .to.emit(nft, "LootboxOpened")
      .withArgs(user.address, 1, encodeLootboxResult(lootboxResult));

    expect(await nft.getUintTrait(1, await nft.TRAIT_LOOT_KEYS())).to.equal(3n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_RARITY())).to.equal(5n);
    expect(await nft.getNonce(delegatedAccount)).to.equal(2n);
  });

  it("activates traits via auth data and updates storage", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const keys = [await nft.TRAIT_RARITY(), await nft.TRAIT_LOOT_KEYS()];
    const values = [padUint(9n), padUint(2n)];
    const result = coder.encode(["uint256", "bytes32[]", "bytes32[]"], [1n, keys, values]);

    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 1,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result,
      selector: nft.interface.getFunction("setActiveTraitsAuth").selector,
      signer: masterKey,
    });

    await expect(nft.connect(delegatedSigner).setActiveTraitsAuth(authData, keys, values))
      .to.emit(nft, "TraitUpdated")
      .withArgs(1, await nft.TRAIT_RARITY(), padUint(0n), padUint(9n))
      .to.emit(nft, "TraitUpdated")
      .withArgs(1, await nft.TRAIT_LOOT_KEYS(), padUint(0n), padUint(2n))
      .to.emit(nft, "TraitsActivated")
      .withArgs(1, keys, values);

    expect(await nft.getUintTrait(1, await nft.TRAIT_RARITY())).to.equal(9n);
    expect(await nft.getUintTrait(1, await nft.TRAIT_LOOT_KEYS())).to.equal(2n);
  });

  it("reverts when active traits auth data does not match args", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const { authData: mintAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: mintResult,
      selector: nft.interface.getFunction("mintBaseNFT").selector,
      signer: masterKey,
    });

    await nft.connect(delegatedSigner).mintBaseNFT(mintAuth, user.address);

    const keys = [await nft.TRAIT_RARITY()];
    const values = [padUint(9n)];
    const result = coder.encode(["uint256", "bytes32[]", "bytes32[]"], [1n, keys, values]);

    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 1,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result,
      selector: nft.interface.getFunction("setActiveTraitsAuth").selector,
      signer: masterKey,
    });

    const badValues = [padUint(10n)];

    await expect(
      nft.connect(delegatedSigner).setActiveTraitsAuth(authData, keys, badValues)
    ).to.be.revertedWith("Auth data mismatch");
  });

  it("reverts for EOA caller, invalid signature, and expired authorization", async () => {
    const mintResult = coder.encode(["uint256"], [brandId]);
    const selector = nft.interface.getFunction("mintBaseNFT").selector;
    const expiry = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const { authData: eoaAuth } = await buildAuthData({
      sender: owner.address,
      nonce: 0,
      expiry,
      result: mintResult,
      selector,
      signer: masterKey,
    });

    await expect(nft.connect(owner).mintBaseNFT(eoaAuth, user.address)).to.be.revertedWithCustomError(
      nft,
      "NoCode"
    );

    const { authData: badSigAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry,
      result: mintResult,
      selector,
      signer: user,
    });

    await expect(
      nft.connect(delegatedSigner).mintBaseNFT(badSigAuth, user.address)
    ).to.be.revertedWithCustomError(nft, "InvalidSignature");

    const { authData: expiredAuth } = await buildAuthData({
      sender: delegatedAccount,
      nonce: await nft.getNonce(delegatedAccount),
      expiry: (await ethers.provider.getBlock("latest")).timestamp - 1,
      result: mintResult,
      selector,
      signer: masterKey,
    });

    await expect(
      nft.connect(delegatedSigner).mintBaseNFT(expiredAuth, user.address)
    ).to.be.revertedWithCustomError(nft, "AuthorizationExpired");
  });


  it("reverts when applying results or querying traits for non-existent tokens", async () => {
    const questResult = {
      brandId,
      tokenId: 99n,
      questId: 1n,
      xpDelta: 1n,
      traits: [{ key: await nft.TRAIT_XP(), value: padUint(1n) }],
    };
    const { authData } = await buildAuthData({
      sender: delegatedAccount,
      nonce: 0,
      expiry: (await ethers.provider.getBlock("latest")).timestamp + 3600,
      result: encodeQuestResult(questResult),
      selector: nft.interface.getFunction("applyQuestResult").selector,
      signer: masterKey,
    });

    await expect(
      nft.connect(delegatedSigner).applyQuestResult(authData)
    ).to.be.revertedWith("Token does not exist");
    await expect(nft.getTrait(99n, await nft.TRAIT_XP())).to.be.revertedWith("Token does not exist");
    await expect(nft.getUintTrait(99n, await nft.TRAIT_XP())).to.be.revertedWith("Token does not exist");
    await expect(nft.tokenURI(99n)).to.be.revertedWith("Token does not exist");
  });

  it("reports ERC721 and ERC7496 interface support", async () => {
    expect(await nft.supportsInterface(erc721InterfaceId)).to.equal(true);
    expect(await nft.supportsInterface(erc7496InterfaceId)).to.equal(true);
  });
});
