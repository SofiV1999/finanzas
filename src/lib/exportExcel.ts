import { toCop } from './data'
import { MONTH_NAMES } from './budget'
import { fetchTransactions, makeCop } from './reports'
import { supabase } from './supabase'
import {
  accountTypeLabels,
  budgetGroupLabels,
  type AccountWithBalance,
  type BudgetGroup,
  type Category,
  type Goal,
} from './types'

import type { Cell, SheetData } from 'write-excel-file/browser'

const COP = '#,##0'
const USD = '#,##0.00'
const PCT = '0.0%'

const header = (titles: string[]): Cell[] =>
  titles.map((value) => ({
    value,
    fontWeight: 'bold',
    backgroundColor: '#1f232c',
    textColor: '#ffffff',
  }))

const text = (value: string | null | undefined): Cell => ({ value: value ?? '', type: String })
const num = (value: number | null | undefined, format = COP): Cell =>
  value == null ? null : { value, type: Number, format }
const date = (iso: string | null | undefined): Cell => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: 'dd/mm/yyyy' }
}

const typeLabels = { ingreso: 'Ingreso', gasto: 'Gasto', traslado: 'Traslado' } as const

export type ExportRange = { from?: string; to?: string; fileLabel: string }

// Genera y descarga un .xlsx con movimientos, resumen mensual, cuentas, presupuesto y metas
export async function exportToExcel(
  range: ExportRange,
  ctx: { accounts: AccountWithBalance[]; categories: Category[]; usdRate?: number },
) {
  const [{ default: writeExcelFile }, txs, goalsRes] = await Promise.all([
    import('write-excel-file/browser'),
    fetchTransactions(range.from, range.to),
    supabase.from('goals').select('*').order('created_at'),
  ])
  if (goalsRes.error) throw new Error(goalsRes.error.message)
  const goals: Goal[] = goalsRes.data

  const { accounts, categories, usdRate } = ctx
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const cop = makeCop(accounts, usdRate)

  // ---- Movimientos (más recientes primero)
  const movements: SheetData = [
    header([
      'Fecha',
      'Tipo',
      'Categoría',
      'Grupo 50/30/20',
      'Cuenta',
      'Cuenta destino',
      'Monto',
      'Moneda',
      'Monto recibido',
      'TRM',
      'Monto en COP',
      'Descripción',
    ]),
  ]
  for (const t of [...txs].sort((a, b) => b.date.localeCompare(a.date))) {
    const account = accountById.get(t.account_id)
    const to = t.to_account_id ? accountById.get(t.to_account_id) : undefined
    const category = t.category_id ? categoryById.get(t.category_id) : undefined
    const currency = account?.currency ?? 'COP'
    movements.push([
      date(t.date),
      text(typeLabels[t.type]),
      text(category?.name),
      text(category?.budget_group ? budgetGroupLabels[category.budget_group as BudgetGroup] : ''),
      text(account?.name),
      text(to?.name),
      num(t.amount, currency === 'USD' ? USD : COP),
      text(currency),
      num(t.to_amount, to?.currency === 'USD' ? USD : COP),
      num(t.fx_rate, USD),
      t.type === 'traslado' ? null : num(Math.round(cop(t))),
      text(t.description),
    ])
  }

  // ---- Resumen por mes
  const months = new Map<
    string,
    { income: number; expenses: number; needs: number; wants: number }
  >()
  for (const t of txs) {
    if (t.type === 'traslado') continue
    const key = t.date.slice(0, 7)
    const m = months.get(key) ?? { income: 0, expenses: 0, needs: 0, wants: 0 }
    const value = cop(t)
    if (t.type === 'ingreso') m.income += value
    else {
      m.expenses += value
      const group = categoryById.get(t.category_id ?? '')?.budget_group
      if (group === 'necesidad') m.needs += value
      if (group === 'deseo') m.wants += value
    }
    months.set(key, m)
  }
  const summary: SheetData = [
    header(['Mes', 'Ingresos', 'Gastos', 'Necesidades', 'Deseos', 'Ahorro', 'Tasa de ahorro']),
  ]
  for (const [key, m] of [...months.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const savings = m.income - m.needs - m.wants
    summary.push([
      text(`${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`),
      num(Math.round(m.income)),
      num(Math.round(m.expenses)),
      num(Math.round(m.needs)),
      num(Math.round(m.wants)),
      num(Math.round(savings)),
      m.income > 0 ? num(savings / m.income, PCT) : null,
    ])
  }

  // ---- Cuentas (saldos de hoy)
  const accountRows: SheetData = [
    header([
      'Cuenta',
      'Tipo',
      'Moneda',
      'Saldo',
      'Saldo en COP',
      'Tasa E.A.',
      'Cupo',
      'Día de pago',
      'Pago mensual',
      'Monto prestado',
      'Archivada',
    ]),
  ]
  for (const a of accounts) {
    const fmt = a.currency === 'USD' ? USD : COP
    accountRows.push([
      text(a.name),
      text(accountTypeLabels[a.type]),
      text(a.currency),
      num(a.balance, fmt),
      num(Math.round(toCop(a.balance, a.currency, usdRate))),
      num(a.annual_rate, PCT),
      num(a.credit_limit, fmt),
      num(a.due_day, '0'),
      num(a.min_payment, fmt),
      num(a.original_amount, fmt),
      text(a.archived ? 'Sí' : ''),
    ])
  }

  // ---- Plantilla de presupuesto
  const budgetRows: SheetData = [
    header([
      'Categoría',
      'Tipo',
      'Grupo 50/30/20',
      'Fija',
      'Frecuencia',
      'Mes de cobro',
      'Día de pago',
      'Monto (anual si es anual)',
      'Archivada',
    ]),
  ]
  for (const c of [...categories].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.sort_order - b.sort_order,
  )) {
    budgetRows.push([
      text(c.name),
      text(c.kind === 'ingreso' ? 'Ingreso' : 'Gasto'),
      text(c.budget_group ? budgetGroupLabels[c.budget_group as BudgetGroup] : ''),
      text(c.is_fixed ? 'Sí' : ''),
      text(c.frequency === 'anual' ? 'Anual' : 'Mensual'),
      text(c.due_month ? MONTH_NAMES[c.due_month - 1] : ''),
      num(c.due_day, '0'),
      num(c.default_budget),
      text(c.archived ? 'Sí' : ''),
    ])
  }

  // ---- Metas
  const goalRows: SheetData = [
    header([
      'Meta',
      'Monto meta',
      'Moneda',
      'Fecha objetivo',
      'Cuenta',
      'Saldo de la cuenta',
      'Avance',
    ]),
  ]
  for (const g of goals) {
    const account = g.account_id ? accountById.get(g.account_id) : undefined
    const fmt = g.currency === 'USD' ? USD : COP
    goalRows.push([
      text(g.name),
      num(g.target_amount, fmt),
      text(g.currency),
      date(g.target_date),
      text(account?.name),
      num(account?.balance, account?.currency === 'USD' ? USD : COP),
      account && account.currency === g.currency
        ? num(account.balance / g.target_amount, PCT)
        : null,
    ])
  }

  const widths = (...w: number[]) => w.map((width) => ({ width }))
  await writeExcelFile([
    {
      sheet: 'Movimientos',
      data: movements,
      stickyRowsCount: 1,
      columns: widths(12, 10, 24, 16, 22, 22, 14, 8, 14, 10, 14, 32),
    },
    {
      sheet: 'Resumen mensual',
      data: summary,
      stickyRowsCount: 1,
      columns: widths(16, 14, 14, 14, 14, 14, 14),
    },
    {
      sheet: 'Cuentas',
      data: accountRows,
      stickyRowsCount: 1,
      columns: widths(24, 24, 8, 14, 14, 10, 14, 11, 14, 14, 10),
    },
    {
      sheet: 'Presupuesto',
      data: budgetRows,
      stickyRowsCount: 1,
      columns: widths(28, 9, 15, 6, 11, 13, 11, 22, 10),
    },
    {
      sheet: 'Metas',
      data: goalRows,
      stickyRowsCount: 1,
      columns: widths(24, 14, 8, 14, 22, 16, 10),
    },
  ]).toFile(`finanzas-${range.fileLabel}.xlsx`)
}
