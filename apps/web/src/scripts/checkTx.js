const { ethers } = require("hardhat");

async function main() {
  const txHash = "0x2320656060ff1fa79d4accc468b513b9a923732c2b7e952165dd71425d548525";

  const receipt = await ethers.provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Transaction not mined yet.");
    return;
  }

  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "REVERTED");
  console.log("Block:", receipt.blockNumber);
  console.log("Gas Used:", receipt.gasUsed.toString());
}

main();