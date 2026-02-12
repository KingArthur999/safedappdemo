import { useMemo, useState } from "react"
import { ethers } from "ethers"
import { createSafe } from "./createSafe"
import { readSafeData } from "./readSafe"
import { submitSafeTransfer } from "./safeTx"

function parseOwners(text) {
  // 支持：换行 / 逗号 / 空格 分隔
  const parts = (text || "")
    .split(/[\n,，\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  // 过滤非法地址 + 去重
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

  // transfer form
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")

  // create form (NEW)
  const [ownersText, setOwnersText] = useState(
    [
      "0x5e5d398C47d30f7a3Ef51a08C38305dAE6052f13",
      "0xe235F886f1fcC5aFa6CCB82021dB465A997fc2a3",
      "0xaf14Fef12609d26eC31fdf638CdbCD025D3f48CD",
    ].join("\n")
  )
  const [thresholdText, setThresholdText] = useState("2")

  const owners = useMemo(() => parseOwners(ownersText), [ownersText])
  const threshold = useMemo(() => {
    const n = Number(thresholdText || "0")
    return Number.isFinite(n) ? Math.floor(n) : 0
  }, [thresholdText])

  const createValidation = useMemo(() => {
    if (owners.length === 0) return "Owners 不能为空（必须是合法地址）"
    if (threshold <= 0) return "Threshold 必须 >= 1"
    if (threshold > owners.length) return "Threshold 不能大于 Owners 数量"
    return ""
  }, [owners.length, threshold])

  async function handleCreate() {
    try {
      if (createValidation) throw new Error(createValidation)

      setLoading(true)
      const safe = await createSafe(owners, threshold)
      setSafeAddress(safe)
      alert("✅ Safe created: " + safe)
    } catch (e) {
      alert(e?.message || String(e))
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
      alert(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleTransfer() {
    try {
      setLoading(true)
      const hash = await submitSafeTransfer(safeAddress, to, amount)
      alert("✅ Submitted: " + hash)
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h2>Safe Wallet UI</h2>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", width: 720 }}>
        <h3 style={{ marginTop: 0 }}>Create Safe</h3>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Owners（每行一个地址）</div>
            <textarea
              value={ownersText}
              onChange={(e) => setOwnersText(e.target.value)}
              rows={6}
              style={{ width: "100%", fontFamily: "monospace" }}
              placeholder={"0x...\n0x...\n0x..."}
            />
            <div style={{ fontSize: 12, marginTop: 6 }}>
              解析到 owners 数量：<b>{owners.length}</b>
            </div>
          </div>

          <div style={{ width: 220 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Threshold</div>
            <input
              value={thresholdText}
              onChange={(e) => setThresholdText(e.target.value)}
              style={{ width: "100%" }}
              placeholder="2"
            />

            {createValidation ? (
              <div style={{ marginTop: 10, color: "crimson", fontSize: 12 }}>
                {createValidation}
              </div>
            ) : (
              <div style={{ marginTop: 10, color: "green", fontSize: 12 }}>
                ✅ 可创建
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={loading || !!createValidation}
              style={{ marginTop: 12, width: "100%" }}
            >
              Create Safe
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Safe Address"
          value={safeAddress}
          onChange={(e) => setSafeAddress(e.target.value)}
          style={{ width: 520 }}
        />
        <button onClick={handleRead} disabled={loading} style={{ marginLeft: 8 }}>
          Read Safe
        </button>
      </div>

      {safeInfo && (
        <div style={{ marginTop: 30 }}>
          <h3>Safe Info</h3>

          <p>
            <b>MasterCopy:</b> {safeInfo.masterCopy}
          </p>
          <p>
            <b>Threshold:</b> {safeInfo.threshold}
          </p>
          <p>
            <b>Nonce:</b> {safeInfo.nonce}
          </p>

          <p>
            <b>Owners:</b>
          </p>
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
          style={{ width: 520 }}
        />

        <br />
        <br />

        <input
          placeholder="Amount (ETH)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 220 }}
        />

        <br />
        <br />

        <button onClick={handleTransfer} disabled={loading}>
          Submit Safe Transfer
        </button>
      </div>
    </div>
  )
}
