import { useState } from 'react'
import { useData } from '../lib/data'
import type { ExportRange } from '../lib/exportExcel'

export default function ExportButton({
  range,
  label,
  className = 'btn btn-ghost',
}: {
  range: ExportRange
  label: string
  className?: string
}) {
  const { accounts, categories, latestTrm } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      // La librería de Excel solo se descarga cuando se usa
      const { exportToExcel } = await import('../lib/exportExcel')
      await exportToExcel(range, { accounts, categories, usdRate: latestTrm?.rate })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className={className} onClick={handleClick} disabled={busy}>
        {busy ? 'Preparando…' : `⬇ ${label}`}
      </button>
      {error && <span className="error small">{error}</span>}
    </>
  )
}
