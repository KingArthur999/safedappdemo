import { useMemo, useState } from "react"
import { ethers } from "ethers"
import { createSafe } from "./createSafe"
import { readSafeData } from "./readSafe"
import {
  buildSafeTx,
  signSafeTx,
  executeIfEnough,
  loadSigs,
  saveSig
} from "./safeTx"

function parseOwners(text) {
  const parts = (text || "")
    .split(/[\n,，\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const owners = []
  const seen = new Set()

  for (const p of parts) {
    if (!ethers.utils.isAddress(p)) continue
    const lower = p.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    owners.push(ethers.utils.getAddress(p))
  }

  return owners
}

export default function App() {
  const [safeAddress, setSafeAddress] = useState("")
  const [safeInfo, setSafeInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  const [ownersText, setOwnersText] = useState("")
  const [thresholdText, setThresholdText] = useState("1")

  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")

  const [currentTx, setCurrentTx] = useState(null)
  const [currentHash, setCurrentHash] = useState("")

  const owners = useMemo(() => parseOwners(ownersText), [ownersText])
  const threshold = useMemo(() => Number(thresholdText || 0), [thresholdText])

  async function handleCreate() {
    try {
      setLoading(true)
      const safe = await createSafe(owners, threshold)
      setSafeAddress(safe)
      alert("Safe created: " + safe)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRead() {
    try {
      setLoading(true)
      const data = await readSafeData(safeAddress)
      setSafeInfo(data)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBuild() {
    try {
      setLoading(true)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send("eth_requestAccounts", [])

      const { tx, safeTxHash } = await buildSafeTx(
        provider,
        safeAddress,
        to,
        amount
      )

      setCurrentTx(tx)
      setCurrentHash(safeTxHash)

      alert("Tx built.\nHash: " + safeTxHash)

    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSign() {
    try {
      if (!currentTx) throw new Error("No transaction built")

      setLoading(true)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send("eth_requestAccounts", [])

      const { owner, signature } = await signSafeTx(
        provider,
        safeAddress,
        currentTx
      )

      saveSig(safeAddress, currentHash, owner, signature)

      alert("Signed by: " + owner)

    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleExecute() {
    try {
      if (!currentTx) throw new Error("No transaction built")

      setLoading(true)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send("eth_requestAccounts", [])

      const hash = await executeIfEnough(
        provider,
        safeAddress,
        currentHash,
        currentTx
      )

      alert("Executed! TxHash: " + hash)

    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const sigCount = currentHash
    ? Object.keys(loadSigs(safeAddress, currentHash)).length
    : 0

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h2>Safe Wallet UI</h2>

      <h3>Create Safe</h3>

      <textarea
        rows={4}
        style={{ width: 400 }}
        placeholder="Owners (one per line)"
        value={ownersText}
        onChange={(e) => setOwnersText(e.target.value)}
      />

      <br /><br />

      <input
        placeholder="Threshold"
        value={thresholdText}
        onChange={(e) => setThresholdText(e.target.value)}
      />

      <br /><br />

      <button onClick={handleCreate} disabled={loading}>
        Create Safe
      </button>

      <hr />

      <h3>Read Safe</h3>

      <input
        placeholder="Safe Address"
        value={safeAddress}
        onChange={(e) => setSafeAddress(e.target.value)}
        style={{ width: 400 }}
      />

      <button onClick={handleRead} disabled={loading}>
        Read
      </button>

      {safeInfo && (
        <div>
          <p>Threshold: {safeInfo.threshold}</p>
          <p>Nonce: {safeInfo.nonce}</p>
          <p>Owners:</p>
          <ul>
            {safeInfo.owners.map(o => <li key={o}>{o}</li>)}
          </ul>
        </div>
      )}

      <hr />

      <h3>Transfer (2/3 Safe)</h3>

      <input
        placeholder="Recipient"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ width: 400 }}
      />

      <br /><br />

      <input
        placeholder="Amount (ETH)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <br /><br />

      <button onClick={handleBuild} disabled={loading}>
        1️⃣ Build Tx
      </button>

      <button onClick={handleSign} disabled={loading || !currentTx}>
        2️⃣ Sign
      </button>

      <button onClick={handleExecute} disabled={loading || !currentTx}>
        3️⃣ Execute
      </button>

      {currentHash && (
        <div style={{ marginTop: 20 }}>
          <p><b>SafeTxHash:</b> {currentHash}</p>
          <p><b>Collected Signatures:</b> {sigCount}</p>
        </div>
      )}
    </div>
  )
}
