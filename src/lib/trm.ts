// TRM oficial (Superintendencia Financiera) publicada en datos.gov.co
const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json'

export type Trm = { rate: number; date: string }

async function queryTrm(params: Record<string, string>): Promise<Trm> {
  const res = await fetch(`${TRM_URL}?${new URLSearchParams(params)}`)
  if (!res.ok) throw new Error(`TRM no disponible (${res.status})`)
  const [row] = (await res.json()) as { valor: string; vigenciadesde: string }[]
  if (!row) throw new Error('TRM no disponible')
  return { rate: Number(row.valor), date: row.vigenciadesde.slice(0, 10) }
}

export function fetchLatestTrm(): Promise<Trm> {
  return queryTrm({ $order: 'vigenciadesde DESC', $limit: '1' })
}

const byDate = new Map<string, Promise<Trm>>()

// TRM vigente en una fecha (YYYY-MM-DD). Fines de semana y festivos usan la del último día hábil.
export function fetchTrmForDate(date: string): Promise<Trm> {
  let cached = byDate.get(date)
  if (!cached) {
    cached = queryTrm({
      $where: `vigenciadesde <= '${date}T00:00:00'`,
      $order: 'vigenciadesde DESC',
      $limit: '1',
    })
    cached.catch(() => byDate.delete(date))
    byDate.set(date, cached)
  }
  return cached
}
