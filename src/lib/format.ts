import type { Currency } from './types'

const formatters: Record<Currency, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD' }),
}

export function formatMoney(value: number, currency: Currency = 'COP') {
  return formatters[currency].format(value)
}

export function formatPct(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}
