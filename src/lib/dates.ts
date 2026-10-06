// Fecha local en formato YYYY-MM-DD (sin el desfase de zona horaria de toISOString)
export function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

export function currentMonthIso() {
  return todayIso().slice(0, 7)
}

const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })
const dayFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

// "2026-10" -> "octubre de 2026"
export function formatMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return monthFormatter.format(new Date(y, m - 1, 1))
}

// "2026-10-05" -> "5 oct"
export function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return dayFormatter.format(new Date(y, m - 1, d))
}

// Último día del mes "YYYY-MM" como YYYY-MM-DD
export function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).toLocaleDateString('en-CA')
}
