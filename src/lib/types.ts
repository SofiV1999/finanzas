// Tipos que reflejan las tablas de supabase/migrations

export type Currency = 'COP' | 'USD'
export type BudgetGroup = 'necesidad' | 'deseo' | 'ahorro'
export type CategoryKind = 'ingreso' | 'gasto'

export type Settings = {
  user_id: string
  base_currency: Currency
  monthly_salary: number
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
