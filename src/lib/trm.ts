// TRM oficial (Superintendencia Financiera) publicada en datos.gov.co
const TRM_URL =
  'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1'

export type Trm = { rate: number; date: string }

export async function fetchLatestTrm(): Promise<Trm> {
  const res = await fetch(TRM_URL)
  if (!res.ok) throw new Error(`TRM no disponible (${res.status})`)
  const [row] = (await res.json()) as { valor: string; vigenciadesde: string }[]
  return { rate: Number(row.valor), date: row.vigenciadesde.slice(0, 10) }
}
