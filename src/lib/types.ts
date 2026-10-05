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
  sort_order: number
  archived: boolean
}

export const budgetGroupLabels: Record<BudgetGroup, string> = {
  necesidad: 'Necesidad',
  deseo: 'Deseo',
  ahorro: 'Ahorro',
}
