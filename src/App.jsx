import { useState } from "react"
import { createSafe } from "./createSafe"
import { readSafeData } from "./readSafe"

import { submitSafeTransfer } from "./safeTx"
import { submitMultisigTransfer } from "./safeMultisig"

export default function App() {
  const [safeAddress, setSafeAddress] = useState("")
  const [safeInfo, setSafeInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")


  async function handleTransfer() {
    try {
      const result = await submitMultisigTransfer(
        safeAddress,
        to,
        amount
      )

      if (result.status === "waiting") {
        alert(
          `Signature collected: ${result.signatures}/${result.required}`
        )
      } else {
        alert("Executed: " + result.txHash)
      }
    } catch (e) {
      alert(e.message)
    }
  }

  
  async function handleTransfer() {
    try {
      setLoading(true)
      const hash = await submitSafeTransfer(safeAddress, to, amount)
      alert("Success: " + hash)
    } catch (e) {
      alert(e.message)
    }
    setLoading(false)
  }

  async function handleCreate() {
    try {
      setLoading(true)
      const safe = await createSafe(
        [
          "0x5e5d398C47d30f7a3Ef51a08C38305dAE6052f13",
          "0xe235F886f1fcC5aFa6CCB82021dB465A997fc2a3",
          "0xaf14Fef12609d26eC31fdf638CdbCD025D3f48CD"
        ],
        2
      )
      setSafeAddress(safe)
    } catch (e) {
      alert(e.message)
    }
    setLoading(false)
  }

  async function handleRead() {
    try {
      setLoading(true)
      const data = await readSafeData(safeAddress)
      setSafeInfo(data)
    } catch (e) {
      alert(e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h2>Safe Wallet UI</h2>

      <button onClick={handleCreate} disabled={loading}>
        Create Safe
      </button>

      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Safe Address"
          value={safeAddress}
          onChange={(e) => setSafeAddress(e.target.value)}
          style={{ width: 400 }}
        />
        <button onClick={handleRead} disabled={loading}>
          Read Safe
        </button>
      </div>

      {safeInfo && (
        <div style={{ marginTop: 30 }}>
          <h3>Safe Info</h3>

          <p><b>MasterCopy:</b> {safeInfo.masterCopy}</p>
          <p><b>Threshold:</b> {safeInfo.threshold}</p>
          <p><b>Nonce:</b> {safeInfo.nonce}</p>

          <p><b>Owners:</b></p>
          <ul>
            {safeInfo.owners.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 40 }}>
        <h3>Safe Transfer</h3>

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

        <button onClick={handleTransfer} disabled={loading}>
          Submit Safe Transfer
        </button>
     </div>

    </div>
    
  )
}
