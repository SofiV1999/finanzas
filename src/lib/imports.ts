// Alertas del banco importadas desde Gmail: qué movimiento sugerir, cuándo dos correos son un
// traslado entre tus cuentas y cuándo una alerta ya estaba registrada

import type { TransactionPreset } from '../components/TransactionForm'
import { pendingConfirmations, type RecurringTransaction } from './recurring'
import { isDebt, type AccountWithBalance, type Transaction } from './types'

export type BankImport = {
  id: string
  message_id: string
  bank: string
  kind: string
  direction: 'in' | 'out' | null
  amount: number | null
  currency: 'COP' | 'USD'
  fee: number | null
  occurred_at: string
  account_digits: string | null
  counterparty: string | null
  counterparty_digits: string | null
  details: { tasa?: number | null; dias?: number | null; vence?: string | null; tarjeta?: string }
  summary: string | null
  status: 'pendiente' | 'aprobado' | 'descartado'
}

export type ImportRule = {
  id: string
  match_type: 'nombre' | 'digitos'
  pattern: string
  account_id: string | null
  type: 'ingreso' | 'gasto' | 'traslado'
  category_id: string | null
  other_account_id: string | null
  description: string | null
  // Siempre pedir confirmación (el comercio a veces es de una categoría y a veces de otra)
  ask: boolean
}

export const bankLabels: Record<string, string> = {
  bancolombia: 'Bancolombia',
  davivienda: 'Davivienda',
  arq: 'ARQ',
  nu: 'Nu',
}

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// Colombia está en UTC-5 todo el año
const bogota = (ts: string) => new Date(Date.parse(ts) - 5 * HOUR).toISOString()
export const bogotaDate = (ts: string) => bogota(ts).slice(0, 10)
export const bogotaTime = (ts: string) => bogota(ts).slice(11, 16)

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY

// "Tienda D1 Manila" → "tienda d1 manila" (sin tildes ni signos)
export function normalizeName(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim()
}

// "TIENDA D1 MANILA" → "Tienda D1 Manila"
export function prettyName(text: string) {
  return text
    .toLowerCase()
    .split(' ')
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// En Davivienda el "comercio" es el tipo de movimiento (Abono, Descuento...): las reglas
// aprendidas con él solo aplican a esa cuenta
const isMovementClass = (item: BankImport) => item.bank === 'davivienda' && item.kind !== 'compra'

// Cuenta con esos dígitos. Una tarjeta que factura en pesos y en dólares son dos cuentas con
// los mismos dígitos: se prefiere la de la moneda del movimiento y luego las no archivadas
export function accountByDigits(
  digits: string | null,
  accounts: AccountWithBalance[],
  currency?: string,
) {
  if (!digits) return undefined
  return accounts
    .filter((a) => a.match_digits?.includes(digits))
    .sort(
      (a, b) =>
        Number(b.currency === currency) - Number(a.currency === currency) ||
        Number(a.archived) - Number(b.archived),
    )[0]
}

// Tu cuenta en la que cae la alerta
export function ownAccount(item: BankImport, accounts: AccountWithBalance[]) {
  const byDigits = accountByDigits(item.account_digits, accounts, item.currency)
  if (byDigits) return byDigits
  const active = accounts.filter((a) => !a.archived)
  // ARQ no menciona números: va a tu cuenta en dólares
  if (item.bank === 'arq') return active.find((a) => a.currency === 'USD' && !isDebt(a.type))
  return undefined
}

// La otra cuenta, si también es tuya: por sus dígitos o, en el pago de Nu, por el nombre del
// banco de origen ("BANCOLOMBIA")
function otherOwnAccount(item: BankImport, accounts: AccountWithBalance[]) {
  const byDigits = accountByDigits(item.counterparty_digits, accounts, item.currency)
  if (byDigits || item.kind !== 'pago_tarjeta' || !item.counterparty) return byDigits
  const bank = normalizeName(item.counterparty)
  return accounts.find(
    (a) => !a.archived && !isDebt(a.type) && normalizeName(a.name).split(' ').includes(bank),
  )
}

// Con qué se aprende esta alerta: el nombre del comercio o persona, o la cuenta o llave
export function ruleKey(item: BankImport): Pick<ImportRule, 'match_type' | 'pattern'> | null {
  if (item.kind === 'cdt') return null
  if (item.counterparty) return { match_type: 'nombre', pattern: normalizeName(item.counterparty) }
  if (item.counterparty_digits) {
    return { match_type: 'digitos', pattern: item.counterparty_digits.toLowerCase() }
  }
  return null
}

// La regla más específica: primero las de esa cuenta, luego dígitos, luego el nombre más largo
export function findRule(item: BankImport, rules: ImportRule[], ownAccountId?: string) {
  const name = item.counterparty ? normalizeName(item.counterparty) : null
  const digits = item.counterparty_digits?.toLowerCase()
  return rules
    .filter(
      (r) =>
        (!r.account_id || r.account_id === ownAccountId) &&
        (r.match_type === 'digitos'
          ? r.pattern === digits
          : name !== null && (name === r.pattern || name.startsWith(`${r.pattern} `))),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.account_id)) - Number(Boolean(a.account_id)) ||
        Number(b.match_type === 'digitos') - Number(a.match_type === 'digitos') ||
        b.pattern.length - a.pattern.length,
    )[0]
}

export type Suggestion = {
  preset: TransactionPreset
  // Tiene todo para registrarse con un toque
  ready: boolean
  // Hay que abrir el formulario: TRM, intereses de un préstamo, comisión o datos faltantes
  needsForm: boolean
  // Inversión en CDT: falta crear la cuenta del CDT
  cdt: boolean
  // La regla pide elegir la categoría cada vez
  ask: boolean
  // El movimiento viene en otra moneda que la cuenta
  foreign: boolean
}

function finish(
  preset: TransactionPreset,
  accounts: AccountWithBalance[],
  extra: { fee?: boolean; foreign?: boolean; cdt?: boolean; ask?: boolean } = {},
): Suggestion {
  const from = accounts.find((a) => a.id === preset.accountId)
  const to = accounts.find((a) => a.id === preset.toAccountId)
  const transfer = preset.type === 'traslado'
  const ready = Boolean(
    preset.amount && from && (transfer ? to && to.id !== from.id : preset.categoryId),
  )
  const needsForm =
    !ready ||
    Boolean(extra.fee || extra.foreign || extra.ask) ||
    from?.currency === 'USD' ||
    to?.currency === 'USD' ||
    to?.type === 'prestamo'
  return {
    preset,
    ready,
    needsForm,
    cdt: Boolean(extra.cdt),
    ask: Boolean(extra.ask),
    foreign: Boolean(extra.foreign),
  }
}

export function suggest(
  item: BankImport,
  accounts: AccountWithBalance[],
  rules: ImportRule[],
): Suggestion {
  const own = ownAccount(item, accounts)
  const other = otherOwnAccount(item, accounts)
  const out = item.direction !== 'in'
  // Compra en dólares en una cuenta en pesos: el valor en pesos se escribe al revisar
  const foreign = Boolean(own && own.currency !== item.currency)
  const name =
    item.counterparty && !isMovementClass(item) && item.kind !== 'cdt'
      ? prettyName(item.counterparty)
      : undefined
  const base: TransactionPreset = {
    amount: foreign ? undefined : (item.amount ?? undefined),
    date: bogotaDate(item.occurred_at),
    description:
      foreign && item.amount
        ? `${name ?? ''} (${item.currency} ${item.amount.toLocaleString('es-CO')})`.trim()
        : name,
  }
  const extra: Parameters<typeof finish>[2] = { fee: Boolean(item.fee), foreign }

  if (item.kind === 'cdt') {
    const cdt = accounts.find(
      (a) => a.type === 'cdt' && !a.archived && a.opening_date === base.date,
    )
    // La plata suele salir de tu cuenta en pesos del mismo banco
    const source = accounts.find(
      (a) =>
        !a.archived &&
        !isDebt(a.type) &&
        a.type !== 'cdt' &&
        a.currency === 'COP' &&
        normalizeName(a.name).split(' ').includes(item.bank),
    )
    return finish(
      {
        ...base,
        type: 'traslado',
        accountId: source?.id,
        toAccountId: cdt?.id,
        description: 'CDT Nu',
      },
      accounts,
      { cdt: !cdt },
    )
  }

  // Entre dos cuentas tuyas
  if (own && other && own.id !== other.id) {
    return finish(
      {
        ...base,
        type: 'traslado',
        accountId: out ? own.id : other.id,
        toAccountId: out ? other.id : own.id,
      },
      accounts,
      extra,
    )
  }

  const rule = findRule(item, rules, own?.id)
  if (rule) {
    const description = rule.description ?? base.description
    extra.ask = rule.ask
    if (rule.type === 'traslado') {
      return finish(
        {
          ...base,
          description,
          type: 'traslado',
          accountId: out ? own?.id : (rule.other_account_id ?? undefined),
          toAccountId: out ? (rule.other_account_id ?? undefined) : own?.id,
        },
        accounts,
        extra,
      )
    }
    return finish(
      {
        ...base,
        description,
        type: rule.type,
        accountId: own?.id,
        categoryId: rule.category_id ?? undefined,
      },
      accounts,
      extra,
    )
  }

  return finish({ ...base, type: out ? 'gasto' : 'ingreso', accountId: own?.id }, accounts, extra)
}

export type ImportGroup = {
  key: string
  items: BankImport[]
  suggestion: Suggestion
  // Dos correos (salida y entrada) del mismo traslado entre tus cuentas
  paired: boolean
}

// Agrupa las alertas pendientes: una salida y una entrada por el mismo monto entre dos cuentas
// tuyas, con menos de 2 horas de diferencia, son un solo traslado
export function groupImports(
  items: BankImport[],
  accounts: AccountWithBalance[],
  rules: ImportRule[],
): ImportGroup[] {
  const groups: ImportGroup[] = []
  const used = new Set<string>()
  const own = new Map(items.map((i) => [i.id, ownAccount(i, accounts)]))

  for (const entry of items.filter((i) => i.direction === 'in' && i.amount)) {
    const to = own.get(entry.id)
    if (!to) continue
    const exit = items
      .filter((i) => {
        const from = own.get(i.id)
        return (
          !used.has(i.id) &&
          i.direction !== 'in' &&
          i.amount !== null &&
          Math.abs(i.amount - entry.amount!) < 0.01 &&
          i.currency === entry.currency &&
          from &&
          from.id !== to.id &&
          Math.abs(Date.parse(i.occurred_at) - Date.parse(entry.occurred_at)) <= 2 * HOUR
        )
      })
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.occurred_at) - Date.parse(entry.occurred_at)) -
          Math.abs(Date.parse(b.occurred_at) - Date.parse(entry.occurred_at)),
      )[0]
    if (!exit || used.has(entry.id)) continue
    used.add(entry.id)
    used.add(exit.id)
    const first = Date.parse(exit.occurred_at) <= Date.parse(entry.occurred_at) ? exit : entry
    groups.push({
      key: `${exit.id}+${entry.id}`,
      items: [exit, entry],
      paired: true,
      suggestion: finish(
        {
          type: 'traslado',
          amount: exit.amount!,
          date: bogotaDate(first.occurred_at),
          accountId: own.get(exit.id)!.id,
          toAccountId: to.id,
        },
        accounts,
      ),
    })
  }

  for (const item of items) {
    if (used.has(item.id)) continue
    groups.push({
      key: item.id,
      items: [item],
      paired: false,
      suggestion: suggest(item, accounts, rules),
    })
  }
  const time = (g: ImportGroup) => Math.max(...g.items.map((i) => Date.parse(i.occurred_at)))
  return groups.sort((a, b) => time(b) - time(a))
}

// Un movimiento ya registrado que probablemente es esta misma alerta: misma cuenta y monto, a
// 3 días o menos. Si lo generó un programado, el monto puede variar hasta 15% (facturas)
export function findDuplicate(
  preset: TransactionPreset,
  transactions: Transaction[],
  taken: Set<string>,
) {
  if (!preset.amount || !preset.date) return undefined
  const amount = preset.amount
  return transactions
    .filter((t) => {
      if (taken.has(t.id) || t.type !== preset.type) return false
      const sameAccount = preset.accountId
        ? t.account_id === preset.accountId
        : Boolean(preset.toAccountId && t.to_account_id === preset.toAccountId)
      if (!sameAccount) return false
      const tolerance = t.recurring_id ? 0.15 * amount : 1
      const window = t.recurring_id ? 7 : 3
      return Math.abs(t.amount - amount) <= tolerance && daysApart(t.date, preset.date!) <= window
    })
    .sort(
      (a, b) =>
        Math.abs(a.amount - amount) - Math.abs(b.amount - amount) ||
        daysApart(a.date, preset.date!) - daysApart(b.date, preset.date!),
    )[0]
}

// Programado pendiente de confirmar que coincide con la alerta (misma cuenta, monto ±15%,
// fecha a 7 días o menos)
export function matchRecurring(
  preset: TransactionPreset,
  recurring: RecurringTransaction[],
  today: string,
) {
  if (!preset.amount || !preset.date || !preset.accountId) return undefined
  return pendingConfirmations(recurring, today).find(
    ({ rule, date }) =>
      rule.account_id === preset.accountId &&
      rule.type === preset.type &&
      Math.abs(rule.amount - preset.amount!) <= 0.15 * preset.amount! &&
      daysApart(date, preset.date!) <= 7,
  )
}

// 32 bytes aleatorios en hexadecimal y su huella sha256 (lo único que se guarda)
export async function newImportToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { token, hash }
}
