// Cálculos financieros: deudas (amortización, bola de nieve, avalancha) y metas de ahorro.
// Todos los montos en la misma moneda; tasas efectivas anuales como fracción (0.28 = 28% E.A.).

export const MAX_MONTHS = 600

// Tasa efectiva anual -> tasa mensual equivalente
export function monthlyRate(annualEa: number | null | undefined) {
  return annualEa ? Math.pow(1 + annualEa, 1 / 12) - 1 : 0
}

export type AmortizationRow = {
  month: number
  opening: number
  interest: number
  payment: number
  principal: number
  closing: number
}

// Tabla de pagos con cuota fija desde el saldo actual. Se detiene si la cuota no cubre
// los intereses (la deuda nunca bajaría).
export function amortization(balance: number, annualEa: number | null, payment: number) {
  const r = monthlyRate(annualEa)
  const rows: AmortizationRow[] = []
  let bal = balance
  while (bal > 0.5 && rows.length < MAX_MONTHS) {
    const interest = bal * r
    if (payment <= interest) return { rows, neverPaysOff: true }
    const pay = Math.min(payment, bal + interest)
    const closing = bal + interest - pay
    rows.push({
      month: rows.length + 1,
      opening: bal,
      interest,
      payment: pay,
      principal: pay - interest,
      closing,
    })
    bal = closing
  }
  return { rows, neverPaysOff: bal > 0.5 }
}

export type Strategy = 'minimos' | 'bola_de_nieve' | 'avalancha'

export type DebtInput = {
  id: string
  name: string
  balance: number
  annualEa: number | null
  minPayment: number
}

export type StrategyResult = {
  strategy: Strategy
  months: number
  totalInterest: number
  totalPaid: number
  // Mes (1 = el próximo) en que queda pagada cada deuda; null si no se alcanza
  payoffMonth: Record<string, number | null>
  // Orden en que se atacan las deudas con el dinero extra
  order: string[]
  neverPaysOff: boolean
}

// Simula pagar todas las deudas mes a mes.
// - minimos: cada deuda paga solo su mínimo; sin extra.
// - bola_de_nieve / avalancha: se paga cada mes la suma de los mínimos originales más el
//   extra. Lo que sobra (y los mínimos de deudas ya pagadas) va a la deuda prioritaria:
//   la de menor saldo (bola de nieve) o la de mayor tasa (avalancha).
export function simulate(debts: DebtInput[], strategy: Strategy, extra: number): StrategyResult {
  const order = [...debts]
    .sort((a, b) =>
      strategy === 'avalancha'
        ? (b.annualEa ?? 0) - (a.annualEa ?? 0) || a.balance - b.balance
        : a.balance - b.balance || (b.annualEa ?? 0) - (a.annualEa ?? 0),
    )
    .map((d) => d.id)

  const bal = new Map(debts.map((d) => [d.id, d.balance]))
  const rate = new Map(debts.map((d) => [d.id, monthlyRate(d.annualEa)]))
  const payoffMonth: Record<string, number | null> = Object.fromEntries(
    debts.map((d) => [d.id, d.balance > 0.5 ? null : 0]),
  )
  const budget =
    strategy === 'minimos' ? 0 : debts.reduce((s, d) => s + d.minPayment, 0) + Math.max(0, extra)

  let month = 0
  let totalInterest = 0
  let totalPaid = 0
  const remaining = () => [...bal.values()].some((b) => b > 0.5)

  while (remaining() && month < MAX_MONTHS) {
    month++
    // 1. Intereses del mes
    for (const d of debts) {
      const b = bal.get(d.id)!
      if (b <= 0.5) continue
      const interest = b * rate.get(d.id)!
      totalInterest += interest
      bal.set(d.id, b + interest)
    }
    // 2. Pagos mínimos
    let available = budget
    for (const d of debts) {
      const b = bal.get(d.id)!
      if (b <= 0.5) continue
      const pay = Math.min(d.minPayment, b)
      bal.set(d.id, b - pay)
      totalPaid += pay
      available -= pay
    }
    // 3. Lo que sobra va a la deuda prioritaria
    if (strategy !== 'minimos') {
      for (const id of order) {
        if (available <= 0.5) break
        const b = bal.get(id)!
        if (b <= 0.5) continue
        const pay = Math.min(available, b)
        bal.set(id, b - pay)
        totalPaid += pay
        available -= pay
      }
    }
    for (const d of debts) {
      if (payoffMonth[d.id] === null && bal.get(d.id)! <= 0.5) payoffMonth[d.id] = month
    }
  }

  return {
    strategy,
    months: month,
    totalInterest,
    totalPaid,
    payoffMonth,
    order,
    neverPaysOff: remaining(),
  }
}

// Aporte mensual para llegar a `target` en `months` meses, partiendo de `current` y con
// rendimiento `annualEa` sobre lo acumulado.
export function requiredMonthlyContribution(
  current: number,
  target: number,
  months: number,
  annualEa: number,
) {
  if (months <= 0) return Math.max(0, target - current)
  const r = monthlyRate(annualEa)
  const grown = current * Math.pow(1 + r, months)
  if (grown >= target) return 0
  if (r === 0) return (target - current) / months
  return ((target - grown) * r) / (Math.pow(1 + r, months) - 1)
}

// Meses para llegar a `target` aportando `monthly` cada mes; null si no se alcanza
export function monthsToReach(current: number, target: number, monthly: number, annualEa: number) {
  const r = monthlyRate(annualEa)
  let bal = current
  let months = 0
  while (bal < target && months < MAX_MONTHS) {
    bal = bal * (1 + r) + monthly
    months++
  }
  return bal >= target ? months : null
}

// Meses enteros desde hoy hasta una fecha YYYY-MM-DD (mínimo 0)
export function monthsUntil(date: string, today = new Date()) {
  const [y, m] = date.split('-').map(Number)
  return Math.max(0, (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth()))
}

// "Dentro de n meses" como fecha legible (ej. "marzo de 2028")
export function monthLabelFromNow(n: number, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth() + n, 1)
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(d)
}
