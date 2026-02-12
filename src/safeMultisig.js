import { ethers } from "ethers"

const SAFE_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool success)"
]

const CHAIN_ID = 12248

function getProvider() {
  return new ethers.providers.Web3Provider(window.ethereum)
}

function getSigner() {
  const provider = getProvider()
  return provider.getSigner()
}

/* ===================================================== */
/*                    BUILD SAFE TX                      */
/* ===================================================== */

async function buildSafeTx(safeAddress, to, amount) {
  const provider = getProvider()
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider)

  const nonce = await safe.nonce()

  return {
    to,
    value: ethers.utils.parseEther(amount).toString(),
    data: "0x",
    operation: 0,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
    gasToken: ethers.constants.AddressZero,
    refundReceiver: ethers.constants.AddressZero,
    nonce: nonce.toString()
  }
}

/* ===================================================== */
/*                  EIP712 SIGNATURE                     */
/* ===================================================== */
async function signSafeTx(safeAddress, txData) {
  const signer = getSigner()
  const provider = getProvider()

  const safe = new ethers.Contract(
    safeAddress,
    ["function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)"],
    provider
  )

  const safeTxHash = await safe.getTransactionHash(
    txData.to,
    txData.value,
    txData.data,
    txData.operation,
    txData.safeTxGas,
    txData.baseGas,
    txData.gasPrice,
    txData.gasToken,
    txData.refundReceiver,
    txData.nonce
  )

  const signature = await signer.signMessage(
    ethers.utils.arrayify(safeTxHash)
  )

  return {
    signer: await signer.getAddress(),
    signature
  }
}


/* ===================================================== */
/*                  LOCAL STORAGE POOL                   */
/* ===================================================== */

function getStorageKey(safeAddress, nonce) {
  return `safe-${safeAddress}-nonce-${nonce}`
}

export function saveSignature(safeAddress, nonce, sig) {
  const key = getStorageKey(safeAddress, nonce)
  const existing = JSON.parse(localStorage.getItem(key) || "[]")

  // 防止重复签名
  const filtered = existing.filter(
    (s) => s.signer.toLowerCase() !== sig.signer.toLowerCase()
  )

  filtered.push(sig)
  localStorage.setItem(key, JSON.stringify(filtered))

  return filtered
}

export function getStoredSignatures(safeAddress, nonce) {
  const key = getStorageKey(safeAddress, nonce)
  return JSON.parse(localStorage.getItem(key) || "[]")
}

/* ===================================================== */
/*                    EXECUTE TX                         */
/* ===================================================== */

async function executeSafeTx(safeAddress, txData, signatures) {
  const provider = getProvider()
  const signer = getSigner()
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer)

  // 🔥 按 owner 地址排序
  const sorted = signatures.sort((a, b) =>
    a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())
  )

  const packed =
    "0x" +
    sorted
      .map((s) => s.signature.slice(2))
      .join("")

  const tx = await safe.execTransaction(
    txData.to,
    txData.value,
    txData.data,
    txData.operation,
    txData.safeTxGas,
    txData.baseGas,
    txData.gasPrice,
    txData.gasToken,
    txData.refundReceiver,
    packed
  )

  await tx.wait()
  return tx.hash
}

/* ===================================================== */
/*                 MAIN ENTRY FUNCTION                   */
/* ===================================================== */

export async function submitMultisigTransfer(safeAddress, to, amount) {
  const provider = getProvider()
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider)

  const threshold = await safe.getThreshold()

  const txData = await buildSafeTx(safeAddress, to, amount)

  const sig = await signSafeTx(safeAddress, txData)

  const signatures = saveSignature(
    safeAddress,
    txData.nonce,
    sig
  )

  if (signatures.length < threshold) {
    return {
      status: "waiting",
      signatures: signatures.length,
      required: threshold
    }
  }

  const hash = await executeSafeTx(
    safeAddress,
    txData,
    signatures
  )

  localStorage.removeItem(
    getStorageKey(safeAddress, txData.nonce)
  )

  return {
    status: "executed",
    txHash: hash
  }
}
