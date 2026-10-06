// Movimientos programados: se repiten cada mes en un día fijo. La app los genera al abrirse.

import { supabase } from './supabase'
import { fetchTrmForDate } from './trm'
import { todayIso } from './dates'
import type { TransactionPreset } from '../components/TransactionForm'

export type RecurringTransaction = {
  id: string
  type: 'ingreso' | 'gasto' | 'traslado'
  account_id: string
  amount: number
  category_id: string | null
  to_account_id: string | null
  to_amount: number | null
  description: string | null
  day_of_month: number
  start_date: string
  end_date: string | null
  // true: se registra solo; false: queda pendiente para confirmar
  auto: boolean
  active: boolean
  // Última fecha ya registrada u omitida
  last_done: string | null
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Fecha del programado en un mes (los días 29-31 caen el último día en meses más cortos)
export function occurrenceIn(
  rule: Pick<RecurringTransaction, 'day_of_month'>,
  y: number,
  m: number,
) {
  const last = new Date(y, m, 0).getDate()
  return iso(y, m, Math.min(rule.day_of_month, last))
}

// Fechas del programado después de `last_done` (o desde el inicio) y hasta `until`, inclusive
export function dueDates(rule: RecurringTransaction, until: string): string[] {
  const dates: string[] = []
  const end = rule.end_date && rule.end_date < until ? rule.end_date : until
  let [y, m] = rule.start_date.split('-').map(Number)
  for (let guard = 0; guard < 600; guard++) {
    const date = occurrenceIn(rule, y, m)
    if (date > end) break
    if (date >= rule.start_date && (!rule.last_done || date > rule.last_done)) dates.push(date)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return dates
}

// Próxima fecha pendiente desde hoy (para mostrar); null si ya terminó
export function nextDate(rule: RecurringTransaction, today: string): string | null {
  const pending = dueDates(rule, '9999-12-31')
  const upcoming = pending.find((d) => d >= today) ?? null
  // Si hay pendientes atrasados (confirmación), el próximo es el más antiguo
  return pending[0] && pending[0] < today ? pending[0] : upcoming
}

// Genera los movimientos automáticos que ya vencieron. Devuelve cuántos creó.
export async function generateDueTransactions(
  rules: RecurringTransaction[],
  currencyOf: (accountId: string) => string | undefined,
  today: string,
) {
  let created = 0
  for (const rule of rules.filter((r) => r.active && r.auto)) {
    const dates = dueDates(rule, today)
    if (dates.length === 0) continue
    const usd =
      currencyOf(rule.account_id) === 'USD' ||
      (rule.to_account_id != null && currencyOf(rule.to_account_id) === 'USD')
    const rows = []
    for (const date of dates) {
      const fx = usd ? (await fetchTrmForDate(date).catch(() => null))?.rate : undefined
      // Sin TRM no se puede registrar un movimiento en USD: se reintenta la próxima vez
      if (usd && !fx) break
      rows.push({
        date,
        type: rule.type,
        account_id: rule.account_id,
        amount: rule.amount,
        category_id: rule.category_id,
        to_account_id: rule.to_account_id,
        to_amount: rule.to_amount,
        fx_rate: fx ?? null,
        description: rule.description,
        recurring_id: rule.id,
        recurring_date: date,
      })
    }
    if (rows.length === 0) continue
    // Si otro equipo ya los creó, el índice único los ignora
    const { error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'recurring_id,recurring_date', ignoreDuplicates: true })
    if (error) continue
    await supabase
      .from('recurring_transactions')
      .update({ last_done: rows[rows.length - 1].date })
      .eq('id', rule.id)
    created += rows.length
  }
  return created
}

// Pendientes de confirmar: programados en modo confirmación cuya fecha ya llegó
export function pendingConfirmations(rules: RecurringTransaction[], today = todayIso()) {
  return rules
    .filter((r) => r.active && !r.auto)
    .flatMap((rule) => dueDates(rule, today).map((date) => ({ rule, date })))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function presetFor(rule: RecurringTransaction, date: string): TransactionPreset {
  return {
    type: rule.type,
    accountId: rule.account_id,
    toAccountId: rule.to_account_id ?? undefined,
    toAmount: rule.to_amount ?? undefined,
    categoryId: rule.category_id ?? undefined,
    amount: rule.amount,
    description: rule.description ?? undefined,
    date,
    recurring: { id: rule.id, date },
  }
}
