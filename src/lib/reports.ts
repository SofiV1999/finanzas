import { toCop } from './data'
import { supabase } from './supabase'
import {
  isDebt,
  type AccountWithBalance,
  type Category,
  type Currency,
  type Transaction,
} from './types'

const PAGE = 1000

// Trae todos los movimientos de un rango, por páginas (Supabase limita cada consulta a 1000 filas)
export async function fetchTransactions(from?: string, to?: string): Promise<Transaction[]> {
  const rows: Transaction[] = []
  for (let page = 0; ; page++) {
    let query = supabase
      .from('transactions')
      .select(
        'id, date, type, account_id, amount, category_id, to_account_id, to_amount, fx_rate, description',
      )
      .order('date')
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

export const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

export type MonthTotals = {
  month: number // 1-12
  label: string
  income: number
  expenses: number
  needs: number
  wants: number
  // Ingreso menos necesidades y deseos (incluye abonos a capital y lo que se ahorra)
  savings: number
}

// Convierte el monto de un movimiento a pesos con la TRM con la que se registró
export function makeCop(accounts: AccountWithBalance[], fallbackRate: number | undefined) {
  const currency = new Map<string, Currency>(accounts.map((a) => [a.id, a.currency]))
  return (t: Transaction) =>
    toCop(t.amount, currency.get(t.account_id) ?? 'COP', t.fx_rate ?? fallbackRate)
}

export function monthlyTotals(
  txs: Transaction[],
  year: number,
  categories: Category[],
  cop: (t: Transaction) => number,
): MonthTotals[] {
  const group = new Map(categories.map((c) => [c.id, c.budget_group]))
  const months = MONTHS_SHORT.map((label, i) => ({
    month: i + 1,
    label,
    income: 0,
    expenses: 0,
    needs: 0,
    wants: 0,
    savings: 0,
  }))
  for (const t of txs) {
    if (Number(t.date.slice(0, 4)) !== year || t.type === 'traslado') continue
    const m = months[Number(t.date.slice(5, 7)) - 1]
    const value = cop(t)
    if (t.type === 'ingreso') {
      m.income += value
    } else {
      m.expenses += value
      const g = group.get(t.category_id ?? '')
      if (g === 'necesidad') m.needs += value
      else if (g === 'deseo') m.wants += value
    }
  }
  for (const m of months) m.savings = m.income - m.needs - m.wants
  return months
}

export type CategoryTotal = { id: string; name: string; total: number }

// Gasto por categoría en un rango de fechas (YYYY-MM-DD), de mayor a menor
export function expensesByCategory(
  txs: Transaction[],
  from: string,
  to: string,
  categories: Category[],
  cop: (t: Transaction) => number,
): CategoryTotal[] {
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'gasto' || t.date < from || t.date > to || !t.category_id) continue
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + cop(t))
  }
  const names = new Map(categories.map((c) => [c.id, c.name]))
  return [...totals.entries()]
    .map(([id, total]) => ({ id, name: names.get(id) ?? 'Sin categoría', total }))
    .sort((a, b) => b.total - a.total)
}

export type NetWorthPoint = {
  key: string
  label: string
  assets: number
  debts: number
  net: number
}

// Patrimonio neto al cierre de cada mes entre `fromMonth` y `toMonth` (YYYY-MM). Cada cuenta
// entra desde su fecha de saldo inicial; los saldos en USD se convierten con `usdRate`.
export function netWorthByMonth(
  txs: Transaction[],
  accounts: AccountWithBalance[],
  fromMonth: string,
  toMonth: string,
  usdRate: number | undefined,
): NetWorthPoint[] {
  const points: NetWorthPoint[] = []
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  const balance = new Map<string, number>()
  let i = 0
  let [y, m] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const end = `${key}-31`
    for (; i < sorted.length && sorted[i].date <= end; i++) {
      const t = sorted[i]
      balance.set(
        t.account_id,
        (balance.get(t.account_id) ?? 0) + (t.type === 'ingreso' ? t.amount : -t.amount),
      )
      if (t.to_account_id) {
        balance.set(
          t.to_account_id,
          (balance.get(t.to_account_id) ?? 0) + (t.to_amount ?? t.amount),
        )
      }
    }
    let assets = 0
    let debts = 0
    for (const a of accounts) {
      if (a.opening_date > end) continue
      const value = toCop(a.opening_balance + (balance.get(a.id) ?? 0), a.currency, usdRate)
      if (value >= 0) assets += value
      else debts += -value
    }
    points.push({
      key,
      label: `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`,
      assets,
      debts,
      net: assets - debts,
    })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return points
}

// Formato compacto para ejes: 1.250.000 -> "1,3 M"; 85.000 -> "85 mil"
export function compactCop(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e6)
    return `${sign}${(abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3).toLocaleString('es-CO')} mil`
  return `${sign}${Math.round(abs)}`
}

// Nombre legible de un traslado según sus cuentas
export function transferLabel(
  t: Pick<Transaction, 'type' | 'account_id' | 'to_account_id'>,
  accountById: Map<string, AccountWithBalance>,
) {
  const from = accountById.get(t.account_id)
  const to = t.to_account_id ? accountById.get(t.to_account_id) : undefined
  if (!to) return 'Traslado'
  if (isDebt(to.type)) return `Pago a ${to.name}`
  if (from && from.currency !== to.currency) return `Cambio ${from.currency} → ${to.currency}`
  return 'Traslado'
}

export type CashFlow = {
  income: number
  expenses: number
  // Gastos cargados a tarjetas o préstamos (aún no salen de tus cuentas)
  expensesOnCredit: number
  debtPayments: number
  // Variación real del dinero en tus cuentas (no deudas)
  net: number
}

// Resumen de flujo de caja de un conjunto de movimientos, en pesos
export function cashFlow(
  txs: Transaction[],
  accountById: Map<string, AccountWithBalance>,
  usdRate: number | undefined,
): CashFlow {
  const cop = (amount: number, accountId: string | null, fx: number | null) => {
    const currency = accountById.get(accountId ?? '')?.currency ?? 'COP'
    return toCop(amount, currency, fx ?? usdRate)
  }
  const isAsset = (id: string | null) => {
    const a = accountById.get(id ?? '')
    return a !== undefined && !isDebt(a.type)
  }
  const flow: CashFlow = { income: 0, expenses: 0, expensesOnCredit: 0, debtPayments: 0, net: 0 }
  for (const t of txs) {
    const out = cop(t.amount, t.account_id, t.fx_rate)
    if (t.type === 'ingreso') {
      flow.income += out
      if (isAsset(t.account_id)) flow.net += out
    } else if (t.type === 'gasto') {
      flow.expenses += out
      if (isAsset(t.account_id)) flow.net -= out
      else flow.expensesOnCredit += out
    } else {
      const received = cop(t.to_amount ?? t.amount, t.to_account_id, t.fx_rate)
      if (isAsset(t.account_id)) flow.net -= out
      if (isAsset(t.to_account_id)) flow.net += received
      else if (isAsset(t.account_id)) flow.debtPayments += out
    }
  }
  return flow
}
