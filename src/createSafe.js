import { ethers } from "ethers"
import { SAFE_CORE } from "./config"

/**
 * 创建 Safe（不依赖事件）
 */
export async function createSafe(owners, threshold) {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed")
  }

  // 1️⃣ 连接钱包
  await window.ethereum.request({ method: "eth_requestAccounts" })

  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const signer = provider.getSigner()

  const userAddress = await signer.getAddress()
  console.log("Creator:", userAddress)

  // 2️⃣ Safe 合约 ABI（只需要 setup）
  const safeAbi = [
    "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)"
  ]

  // 3️⃣ ProxyFactory ABI
  const proxyFactoryAbi = [
    "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)"
  ]

  // 4️⃣ 初始化 Safe 合约实例（只是为了 encode）
  const safeContract = new ethers.Contract(
    SAFE_CORE.masterCopy,
    safeAbi,
    signer
  )

  // 5️⃣ 编码 initializer
  const initializer = safeContract.interface.encodeFunctionData("setup", [
    owners,
    threshold,
    ethers.constants.AddressZero,
    "0x",
    SAFE_CORE.fallbackHandler,
    ethers.constants.AddressZero,
    0,
    ethers.constants.AddressZero
  ])

  // 6️⃣ 连接 ProxyFactory
  const proxyFactory = new ethers.Contract(
    SAFE_CORE.proxyFactory,
    proxyFactoryAbi,
    signer
  )

  // 7️⃣ saltNonce（可随便生成）
  const saltNonce = ethers.BigNumber.from(
    ethers.utils.randomBytes(32)
  )

  // ✅ 8️⃣ 预测 Safe 地址（关键！）
  const predictedAddress =
    await proxyFactory.callStatic.createProxyWithNonce(
      SAFE_CORE.masterCopy,
      initializer,
      saltNonce
    )

  console.log("Predicted Safe Address:", predictedAddress)

  // 9️⃣ 真正发送交易
  const tx = await proxyFactory.createProxyWithNonce(
    SAFE_CORE.masterCopy,
    initializer,
    saltNonce
  )

  console.log("Tx Hash:", tx.hash)

  await tx.wait()

  console.log("✅ Safe deployed:", predictedAddress)

  return predictedAddress
}
