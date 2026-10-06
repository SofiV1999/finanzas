// Recordatorios de pago como archivo de calendario (.ics, RFC 5545) para importar una vez en
// el calendario del celular. Cada pago es un evento de todo el día que se repite cada mes o
// cada año, con una alarma 3 días antes a las 9 a. m.

import { formatMoney } from './format'
import { isDebt, type AccountWithBalance, type Category, type Currency } from './types'

const APP_URL = 'https://sofiv1999.github.io/finanzas/'
// Alarma: 3 días antes del día de pago a las 9:00 (el evento empieza a las 00:00)
const ALARM_TRIGGER = '-P2DT15H'

export type Reminder = {
  uid: string
  title: string
  amount: number | null
  currency: Currency
  day: number
  // null = todos los meses; 1-12 = una vez al año en ese mes
  month: number | null
  kind: 'deuda' | 'factura' | 'anual'
}

export type ReminderPlan = {
  reminders: Reminder[]
  // Facturas fijas o anuales sin día de pago: no pueden ir al calendario
  missingDay: Category[]
}

export function buildReminders(
  accounts: AccountWithBalance[],
  categories: Category[],
): ReminderPlan {
  const reminders: Reminder[] = []
  for (const a of accounts) {
    if (!isDebt(a.type) || a.archived || !a.due_day || a.balance >= -0.5) continue
    reminders.push({
      uid: `deuda-${a.id}`,
      title: `Pagar ${a.name}`,
      amount: a.min_payment,
      currency: a.currency,
      day: a.due_day,
      month: null,
      kind: 'deuda',
    })
  }
  const missingDay: Category[] = []
  for (const c of categories) {
    if (c.kind !== 'gasto' || c.archived) continue
    const annual = c.frequency === 'anual'
    if (!c.is_fixed && !annual) continue
    if (!c.due_day) {
      missingDay.push(c)
      continue
    }
    reminders.push({
      uid: `categoria-${c.id}`,
      title: `Pagar ${c.name}`,
      amount: c.default_budget || null,
      currency: 'COP',
      day: c.due_day,
      month: annual ? c.due_month : null,
      kind: annual ? 'anual' : 'factura',
    })
  }
  reminders.sort((a, b) => (a.month ?? 0) - (b.month ?? 0) || a.day - b.day)
  return { reminders, missingDay }
}

const pad = (n: number) => String(n).padStart(2, '0')

// Día del mes en que cae el evento. El 31 es "el último día del mes" (BYMONTHDAY=-1); el 29 y
// el 30 se adelantan al 28, que existe en todos los meses: el aviso nunca llega tarde.
const eventDay = (r: Reminder, lastDayOfMonth: number) =>
  r.day === 31 ? lastDayOfMonth : Math.min(r.day, 28)

// Próxima fecha (YYYYMMDD) en que cae el recordatorio, desde hoy
function firstDate(r: Reminder, today: Date) {
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()
  let y = today.getFullYear()
  let m = r.month ?? today.getMonth() + 1
  const dayIn = (yy: number, mm: number) => eventDay(r, lastDay(yy, mm))
  const candidate = new Date(y, m - 1, dayIn(y, m))
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (candidate < start) {
    if (r.month) y++
    else if (++m > 12) {
      m = 1
      y++
    }
  }
  return `${y}${pad(m)}${pad(dayIn(y, m))}`
}

// Regla de repetición (sin BYSETPOS, que los calendarios interpretan distinto)
function rrule(r: Reminder) {
  const days = `BYMONTHDAY=${r.day === 31 ? -1 : Math.min(r.day, 28)}`
  return r.month ? `FREQ=YEARLY;BYMONTH=${r.month};${days}` : `FREQ=MONTHLY;${days}`
}

// Escapa texto según RFC 5545
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

// Las líneas de más de 75 bytes se parten (RFC 5545 §3.1)
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ch
    } else current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function buildIcs(reminders: Reminder[], today = new Date()) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finanzas//Recordatorios de pago//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Finanzas – pagos',
  ]
  for (const r of reminders) {
    const start = firstDate(r, today)
    const amount = r.amount ? ` · ${formatMoney(r.amount, r.currency)}` : ''
    // Si el evento se adelantó al 28, el título dice el día real de vencimiento
    const due = r.day === 29 || r.day === 30 ? ` (vence el ${r.day})` : ''
    const title = `💳 ${r.title}${amount}${due}`
    const description = `${r.month ? 'Pago anual' : 'Pago mensual'}${amount}. Regístralo en ${APP_URL}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.uid}@finanzas-sofiv1999`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `RRULE:${rrule(r)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(description)}`,
      `URL:${APP_URL}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`En 3 días: ${r.title}${amount}`)}`,
      `TRIGGER:${ALARM_TRIGGER}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'finanzas-pagos.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
