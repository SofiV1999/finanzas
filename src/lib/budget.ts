import type { Category } from './types'

// Códigos de Postgres cuando un registro no se puede borrar porque otros lo usan
export const isInUseError = (code?: string) => code === '23001' || code === '23503'

// Mes (1-12) de un "YYYY-MM"
const monthNumber = (month: string) => Number(month.slice(5, 7))

// Presupuesto de una categoría en un mes. Las anuales solo cuentan en su mes de pago
// (salvo que ese mes tenga un ajuste propio).
export function effectiveBudget(c: Category, month: string, override?: number) {
  if (override !== undefined) return override
  if (c.frequency === 'anual') return c.due_month === monthNumber(month) ? c.default_budget : 0
  return c.default_budget
}

// Lo que hay que apartar cada mes para cubrir los gastos anuales (1/12 de su costo)
export function annualProvision(categories: Category[]) {
  return categories
    .filter((c) => c.kind === 'gasto' && !c.archived && c.frequency === 'anual')
    .reduce((s, c) => s + c.default_budget / 12, 0)
}

// Gasto mensual equivalente de la plantilla: mensuales completos + anuales / 12
export function monthlyEquivalent(categories: Category[]) {
  return categories
    .filter((c) => c.kind === 'gasto' && !c.archived)
    .reduce((s, c) => s + (c.frequency === 'anual' ? c.default_budget / 12 : c.default_budget), 0)
}

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
