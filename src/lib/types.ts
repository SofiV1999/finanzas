// Tipos que reflejan las tablas de supabase/migrations

export type Currency = 'COP' | 'USD'
export type BudgetGroup = 'necesidad' | 'deseo' | 'ahorro'
export type CategoryKind = 'ingreso' | 'gasto'

export type Settings = {
  user_id: string
  base_currency: Currency
  // Expresado en salary_currency
  monthly_salary: number
  salary_currency: Currency
  // TRM conservadora (COP por 1 USD) para planear cuando el salario es en USD
  planning_fx_rate: number | null
  needs_pct: number
  wants_pct: number
  savings_pct: number
}

export type Category = {
  id: string
  name: string
  kind: CategoryKind
  budget_group: BudgetGroup | null
  is_fixed: boolean
  default_budget: number
  // 'anual': default_budget es el costo anual y se paga en due_month (1-12)
  frequency: 'mensual' | 'anual'
  due_month: number | null
  // Día de pago (recordatorios del calendario)
  due_day: number | null
  sort_order: number
  archived: boolean
}

export const budgetGroupLabels: Record<BudgetGroup, string> = {
  necesidad: 'Necesidad',
  deseo: 'Deseo',
  ahorro: 'Ahorro',
}

export type AccountType =
  | 'efectivo'
  | 'ahorros'
  | 'corriente'
  | 'cdt'
  | 'inversion'
  | 'cripto'
  | 'tarjeta_credito'
  | 'prestamo'
  | 'otro'

export const accountTypeLabels: Record<AccountType, string> = {
  efectivo: 'Efectivo',
  ahorros: 'Cuenta de ahorros',
  corriente: 'Cuenta corriente / billetera',
  cdt: 'CDT',
  inversion: 'Inversión / fondo',
  cripto: 'Cripto',
  otro: 'Otro',
  tarjeta_credito: 'Tarjeta de crédito',
  prestamo: 'Préstamo',
}

export const debtTypes: AccountType[] = ['tarjeta_credito', 'prestamo']
export const assetTypes = (Object.keys(accountTypeLabels) as AccountType[]).filter(
  (t) => !debtTypes.includes(t),
)

export const isDebt = (type: AccountType) => debtTypes.includes(type)

export type Account = {
  id: string
  name: string
  type: AccountType
  currency: Currency
  // Negativo para deudas
  opening_balance: number
  opening_date: string
  // Tasa efectiva anual (0.28 = 28% E.A.)
  annual_rate: number | null
  credit_limit: number | null
  statement_day: number | null
  due_day: number | null
  original_amount: number | null
  min_payment: number | null
  term_months: number | null
  archived: boolean
  sort_order: number
}

// Cuenta con su saldo actual (vista account_balances)
export type AccountWithBalance = Account & { balance: number }

export type TransactionType = 'ingreso' | 'gasto' | 'traslado'

export type Transaction = {
  id: string
  date: string
  type: TransactionType
  account_id: string
  amount: number
  category_id: string | null
  to_account_id: string | null
  // Monto recibido en traslados entre monedas distintas
  to_amount: number | null
  // TRM (COP por 1 USD) del día del movimiento
  fx_rate: number | null
  description: string | null
}

// Ajuste del presupuesto de una categoría para un mes (sobre la plantilla default_budget)
export type Budget = {
  id: string
  month: string
  category_id: string
  amount: number
}

const budgetGroupOrder: Record<BudgetGroup, number> = { necesidad: 0, deseo: 1, ahorro: 2 }

// Ordena por grupo 50/30/20 (necesidades, deseos, ahorro) y luego por el orden propio
export function sortByGroup(categories: Category[]) {
  return [...categories].sort(
    (a, b) =>
      (a.budget_group ? budgetGroupOrder[a.budget_group] : 3) -
        (b.budget_group ? budgetGroupOrder[b.budget_group] : 3) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name),
  )
}

export type Goal = {
  id: string
  name: string
  target_amount: number
  currency: Currency
  target_date: string | null
  // El avance de la meta es el saldo de esta cuenta
  account_id: string | null
  expected_return_ea: number
  archived: boolean
}
