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

export type LumpSumOption = {
  id: string
  // Lo que realmente se abona (no más que el saldo de la deuda)
  applied: number
  interestSaved: number
  // Meses que se adelanta la salida de todas las deudas
  monthsSaved: number
  // Meses que se adelanta el pago de esta deuda en particular
  ownMonthsSaved: number | null
}

export type LumpSumAnalysis = {
  base: StrategyResult
  // Abonar todo a cada deuda por separado
  options: LumpSumOption[]
  // Reparto recomendado: el abono va a la deuda que más intereses ahorra; si sobra (porque
  // la deuda queda pagada), el resto va a la siguiente mejor
  allocation: { id: string; amount: number }[]
  allocationResult: StrategyResult
}

const withPayment = (debts: DebtInput[], id: string, amount: number) =>
  debts.map((d) => (d.id === id ? { ...d, balance: Math.max(0, d.balance - amount) } : d))

// Compara abonar un monto único hoy a cada deuda, dentro del mismo plan de pagos (estrategia
// y pago extra mensual), para ver cuál ahorra más intereses.
export function analyzeLumpSum(
  debts: DebtInput[],
  strategy: Strategy,
  extra: number,
  amount: number,
): LumpSumAnalysis {
  const base = simulate(debts, strategy, extra)
  const evaluate = (current: DebtInput[], id: string, value: number) => {
    const debt = current.find((d) => d.id === id)!
    const applied = Math.min(value, debt.balance)
    const result = simulate(withPayment(current, id, applied), strategy, extra)
    return { applied, result }
  }

  const options = debts.map((d) => {
    const { applied, result } = evaluate(debts, d.id, amount)
    return {
      id: d.id,
      applied,
      interestSaved: base.totalInterest - result.totalInterest,
      monthsSaved: base.months - result.months,
      ownMonthsSaved:
        base.payoffMonth[d.id] != null && result.payoffMonth[d.id] != null
          ? base.payoffMonth[d.id]! - result.payoffMonth[d.id]!
          : null,
    }
  })
  options.sort((a, b) => b.interestSaved - a.interestSaved)

  // Reparto: se prueban varias formas de distribuir el abono y se queda la que deja menos
  // intereses. (a) por porciones, cada una a la deuda donde más ahorra en ese momento;
  // (b) llenando las deudas en orden de mayor tasa; (c) toda la mejor opción individual y el
  // resto por porciones.
  const apply = (allocation: Map<string, number>) =>
    debts.map((d) => ({ ...d, balance: Math.max(0, d.balance - (allocation.get(d.id) ?? 0)) }))
  const cost = (allocation: Map<string, number>) => simulate(apply(allocation), strategy, extra)

  const byChunks = (start: Map<string, number>, value: number) => {
    const allocation = new Map(start)
    const steps = 40
    const chunk = value / steps
    for (let i = 0; i < steps; i++) {
      let bestId: string | null = null
      let bestInterest = Infinity
      for (const d of debts) {
        const left = d.balance - (allocation.get(d.id) ?? 0)
        if (left <= 0.5) continue
        const trial = new Map(allocation)
        trial.set(d.id, (trial.get(d.id) ?? 0) + Math.min(chunk, left))
        const interest = cost(trial).totalInterest
        if (interest < bestInterest) {
          bestInterest = interest
          bestId = d.id
        }
      }
      if (!bestId) break
      const left = debts.find((d) => d.id === bestId)!.balance - (allocation.get(bestId) ?? 0)
      allocation.set(bestId, (allocation.get(bestId) ?? 0) + Math.min(chunk, left))
    }
    return allocation
  }

  const byRate = new Map<string, number>()
  let remaining = amount
  for (const d of [...debts].sort((a, b) => (b.annualEa ?? 0) - (a.annualEa ?? 0))) {
    const value = Math.min(remaining, d.balance)
    if (value > 0) byRate.set(d.id, value)
    remaining -= value
  }

  const bestSingle = options[0]
  const singleThenChunks = bestSingle
    ? byChunks(new Map([[bestSingle.id, bestSingle.applied]]), amount - bestSingle.applied)
    : new Map<string, number>()

  const candidates = [byChunks(new Map(), amount), byRate, singleThenChunks].map((allocation) => ({
    allocation,
    result: cost(allocation),
  }))
  const best = candidates.sort((a, b) => a.result.totalInterest - b.result.totalInterest)[0]
  const allocation = [...best.allocation.entries()]
    .filter(([, value]) => value > 0.5)
    .map(([id, value]) => ({ id, amount: Math.round(value) }))
    .sort((a, b) => b.amount - a.amount)
  const currentResult = best.result

  return { base, options, allocation, allocationResult: currentResult }
}
