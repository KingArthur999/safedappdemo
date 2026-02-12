import { ethers } from "ethers"

const SAFE_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)"
]

export async function readSafeData(safeAddress) {
  if (!window.ethereum) throw new Error("No wallet")

  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const contract = new ethers.Contract(safeAddress, SAFE_ABI, provider)

  const owners = await contract.getOwners()
  const threshold = await contract.getThreshold()
  const nonce = await contract.nonce()

  // 读取 masterCopy (slot 0)
  const raw = await provider.getStorageAt(safeAddress, 0)
  const masterCopy = ethers.utils.getAddress("0x" + raw.slice(26))

  return {
    owners,
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    masterCopy
  }
}
