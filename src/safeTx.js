import { ethers } from "ethers"
import { SAFE_TX_TYPES } from "./safeTypes"

// Safe v1.3 最小 ABI
const SAFE_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
]

// ========= storage helpers =========
function keyForTx(safeAddress, safeTxHash) {
  return `safeSig:${safeAddress.toLowerCase()}:${safeTxHash}`
}
export function loadSigs(safeAddress, safeTxHash) {
  const raw = localStorage.getItem(keyForTx(safeAddress, safeTxHash))
  return raw ? JSON.parse(raw) : {} // { ownerLower: "0x....sig" }
}
export function saveSig(safeAddress, safeTxHash, owner, signature) {
  const sigs = loadSigs(safeAddress, safeTxHash)
  sigs[owner.toLowerCase()] = signature
  localStorage.setItem(keyForTx(safeAddress, safeTxHash), JSON.stringify(sigs))
  return sigs
}
export function clearSigs(safeAddress, safeTxHash) {
  localStorage.removeItem(keyForTx(safeAddress, safeTxHash))
}

// ========= core =========
export async function buildSafeTx(provider, safeAddress, to, amountEth) {
  const signer = provider.getSigner()
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider)

  const value = ethers.utils.parseEther(amountEth || "0")
  const data = "0x"
  const operation = 0

  // ⚠️ 非常重要：nonce 必须来自链上当前 safe.nonce()
  const nonce = await safe.nonce()

  // 一般 ETH 转账，safeTxGas/baseGas/gasPrice 全 0 也行（由 executor 出 gas）
  const safeTxGas = ethers.constants.Zero
  const baseGas = ethers.constants.Zero
  const gasPrice = ethers.constants.Zero
  const gasToken = ethers.constants.AddressZero
  const refundReceiver = ethers.constants.AddressZero

  const tx = {
    to,
    value: value.toString(),
    data,
    operation,
    safeTxGas: safeTxGas.toString(),
    baseGas: baseGas.toString(),
    gasPrice: gasPrice.toString(),
    gasToken,
    refundReceiver,
    nonce: nonce.toString(),
  }

  // 用 safe 合约算 hash，确保与合约一致
  const safeTxHash = await safe.getTransactionHash(
    tx.to,
    tx.value,
    tx.data,
    tx.operation,
    tx.safeTxGas,
    tx.baseGas,
    tx.gasPrice,
    tx.gasToken,
    tx.refundReceiver,
    tx.nonce
  )

  return { tx, safeTxHash }
}

export async function signSafeTx(provider, safeAddress, safeTx) {
  const signer = provider.getSigner()
  const from = await signer.getAddress()

  // ⚠️ chainId 必须从钱包当前网络读，不能写死
  const { chainId } = await provider.getNetwork()

  const domain = {
    chainId,
    verifyingContract: safeAddress,
  }

  // ✅ EIP712 签名（不会走 personal_sign 前缀）
  const signature = await signer._signTypedData(domain, SAFE_TX_TYPES, safeTx)

  // ===== 自检：recover 出来的地址必须等于 signer 地址（否则必 GS026）=====
  const recovered = ethers.utils.verifyTypedData(domain, SAFE_TX_TYPES, safeTx, signature)
  if (recovered.toLowerCase() !== from.toLowerCase()) {
    throw new Error(
      `Signature self-check failed. recovered=${recovered}, signer=${from} (必然 GS026)`
    )
  }

  return { owner: from, signature, chainId }
}

export function buildSignaturesForExec(owners, sigMap) {
  // Safe 要求按 owner 地址升序拼接
  const sortedOwners = [...owners].map(o => o.toLowerCase()).sort()

  const parts = []
  for (const o of sortedOwners) {
    const sig = sigMap[o]
    if (!sig) continue
    // 确保是 65 bytes
    if (!ethers.utils.isHexString(sig) || ethers.utils.arrayify(sig).length !== 65) {
      throw new Error(`Bad signature length for ${o}`)
    }
    parts.push(sig.slice(2))
  }
  return "0x" + parts.join("")
}

export async function executeIfEnough(provider, safeAddress, safeTxHash, safeTx) {
  const signer = provider.getSigner()
  const safeRead = new ethers.Contract(safeAddress, SAFE_ABI, provider)
  const safe = safeRead.connect(signer)

  const owners = await safeRead.getOwners()
  const threshold = (await safeRead.getThreshold()).toNumber()

  const sigMap = loadSigs(safeAddress, safeTxHash)
  const sigCount = Object.keys(sigMap).length

  if (sigCount < threshold) {
    throw new Error(`Not enough signatures: ${sigCount}/${threshold}`)
  }

  // ===== 再做一次强自检：所有签名都能 recover 成 owner =====
  const { chainId } = await provider.getNetwork()
  const domain = { chainId, verifyingContract: safeAddress }

  for (const [owner, sig] of Object.entries(sigMap)) {
    const recovered = ethers.utils.verifyTypedData(domain, SAFE_TX_TYPES, safeTx, sig)
    if (recovered.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(`Stored signature invalid: owner=${owner}, recovered=${recovered} (必 GS026)`)
    }
  }

  const signatures = buildSignaturesForExec(owners, sigMap)

  // ⚠️ 这里很多 RPC 会 estimateGas 失败（尤其 EVA），直接给一个手动 gasLimit
  const txResp = await safe.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    signatures,
    { gasLimit: 2_000_000 }
  )

  return txResp.hash
}
export async function createSafeTransferTx(
  safeAddress,
  to,
  amount
) {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send("eth_requestAccounts", [])

  const { tx, safeTxHash } = await buildSafeTx(
    provider,
    safeAddress,
    to,
    amount
  )

  return { tx, safeTxHash }
}
export async function signOnly(
  safeAddress,
  safeTxHash,
  safeTx
) {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send("eth_requestAccounts", [])

  const { owner, signature } = await signSafeTx(
    provider,
    safeAddress,
    safeTx
  )

  saveSig(safeAddress, safeTxHash, owner, signature)

  return {
    owner,
    signature,
    sigCount: Object.keys(loadSigs(safeAddress, safeTxHash)).length
  }
}

export async function executeOnly(
  safeAddress,
  safeTxHash,
  safeTx
) {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  await provider.send("eth_requestAccounts", [])

  return await executeIfEnough(
    provider,
    safeAddress,
    safeTxHash,
    safeTx
  )
}


// export async function submitSafeTransfer(
//   safeAddress,
//   to,
//   amount
// ) {
//   const provider = new ethers.providers.Web3Provider(window.ethereum)
//   await provider.send("eth_requestAccounts", [])

//   const { tx, safeTxHash } = await buildSafeTx(
//     provider,
//     safeAddress,
//     to,
//     amount
//   )

//   const { owner, signature } = await signSafeTx(
//     provider,
//     safeAddress,
//     tx
//   )

//   saveSig(safeAddress, safeTxHash, owner, signature)

//   return await executeIfEnough(
//     provider,
//     safeAddress,
//     safeTxHash,
//     tx
//   )
// }


