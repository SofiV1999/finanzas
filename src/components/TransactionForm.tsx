import { useEffect, useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import { todayIso } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import { fetchTrmForDate } from '../lib/trm'
import {
  accountTypeLabels,
  isDebt,
  type AccountWithBalance,
  type Category,
  type Transaction,
  type TransactionType,
} from '../lib/types'
import Modal from './Modal'

const typeLabels: Record<TransactionType, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  traslado: 'Traslado',
}

const LAST_ACCOUNT_KEY = 'finanzas:ultima-cuenta'

function readLastAccount() {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null
  }
}

function saveLastAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id)
  } catch {
    // Sin almacenamiento local: simplemente no se recuerda la cuenta
  }
}

// Valores sugeridos para un movimiento nuevo (p. ej. pagar una factura fija)
export type TransactionPreset = {
  type?: TransactionType
  categoryId?: string
  amount?: number
  description?: string
}

export default function TransactionForm({
  initial,
  preset,
  onClose,
}: {
  initial?: Transaction
  preset?: TransactionPreset
  onClose: () => void
}) {
  const { accounts, categories, refresh } = useData()

  // Cuentas activas, más la del movimiento que se edita aunque esté archivada
  const usable = accounts.filter(
    (a) => !a.archived || a.id === initial?.account_id || a.id === initial?.to_account_id,
  )
  const defaultAccount =
    usable.find((a) => a.id === readLastAccount()) ?? usable.find((a) => !isDebt(a.type)) ?? usable[0]

  const [type, setType] = useState<TransactionType>(initial?.type ?? preset?.type ?? 'gasto')
  const [date, setDate] = useState(initial?.date ?? todayIso())
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : preset?.amount ? String(preset.amount) : '',
  )
  const [accountId, setAccountId] = useState(initial?.account_id ?? defaultAccount?.id ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? preset?.categoryId ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.to_account_id ?? '')
  const [toAmount, setToAmount] = useState(initial?.to_amount ? String(initial.to_amount) : '')
  const [fxRate, setFxRate] = useState(initial?.fx_rate ? String(initial.fx_rate) : '')
  // Si la TRM se escribió a mano, no se reemplaza al cambiar la fecha
  const [fxManual, setFxManual] = useState(Boolean(initial?.fx_rate))
  const [trmDate, setTrmDate] = useState<string | null>(null)
  const [description, setDescription] = useState(initial?.description ?? preset?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const account = usable.find((a) => a.id === accountId)
  const toAccount = usable.find((a) => a.id === toAccountId)
  const isTransfer = type === 'traslado'
  const crossCurrency = isTransfer && account && toAccount && account.currency !== toAccount.currency
  const needsFx = account?.currency === 'USD' || (isTransfer && toAccount?.currency === 'USD')

  useEffect(() => {
    if (!needsFx || fxManual || !date) return
    let cancelled = false
    fetchTrmForDate(date)
      .then((trm) => {
        if (cancelled) return
        setFxRate(String(trm.rate))
        setTrmDate(trm.date)
      })
      .catch(() => !cancelled && setTrmDate(null))
    return () => {
      cancelled = true
    }
  }, [needsFx, fxManual, date])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!account) return setError('Elige una cuenta.')
    if (!(Number(amount) > 0)) return setError('El monto debe ser mayor que 0.')
    if (!isTransfer && !categoryId) return setError('Elige una categoría.')
    if (isTransfer && !toAccount) return setError('Elige la cuenta destino.')
    if (crossCurrency && !(Number(toAmount) > 0)) return setError('Escribe el monto que recibiste.')
    if (needsFx && !(Number(fxRate) > 0)) return setError('Falta la TRM.')

    const row = {
      date,
      type,
      account_id: account.id,
      amount: Number(amount),
      category_id: isTransfer ? null : categoryId,
      to_account_id: isTransfer ? toAccountId : null,
      to_amount: crossCurrency ? Number(toAmount) : null,
      fx_rate: needsFx ? Number(fxRate) : null,
      description: description.trim() || null,
    }

    setSaving(true)
    const { error } = initial
      ? await supabase.from('transactions').update(row).eq('id', initial.id)
      : await supabase.from('transactions').insert(row)
    setSaving(false)
    if (error) return setError(error.message)

    saveLastAccount(account.id)
    await refresh()
    onClose()
  }

  async function handleDelete() {
    if (!initial || !confirm('¿Eliminar este movimiento? No se puede deshacer.')) return
    const { error } = await supabase.from('transactions').delete().eq('id', initial.id)
    if (error) return setError(error.message)
    await refresh()
    onClose()
  }

  if (usable.length === 0) {
    return (
      <Modal title="Registrar movimiento" onClose={onClose}>
        <p>Primero crea una cuenta en Ahorros y metas o en Deudas.</p>
      </Modal>
    )
  }

  return (
    <Modal title={initial ? 'Editar movimiento' : 'Registrar movimiento'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="segmented" role="tablist">
          {(Object.keys(typeLabels) as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={type === t}
              className={`segment segment-${t}${type === t ? ' active' : ''}`}
              onClick={() => {
                setType(t)
                setCategoryId('')
              }}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="tx-amount">
              {isTransfer ? 'Monto que sale' : 'Monto'} {account && `(${account.currency})`}
            </label>
            <input
              id="tx-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              autoFocus
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {account && Number(amount) > 0 && (
              <small className="muted">{formatMoney(Number(amount), account.currency)}</small>
            )}
          </div>
          <div className="field">
            <label htmlFor="tx-date">Fecha</label>
            <input
              id="tx-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className={isTransfer ? 'grid-2' : undefined}>
          <AccountSelect
            id="tx-account"
            label={isTransfer ? 'Desde' : type === 'ingreso' ? 'Entra a' : 'Pagado con'}
            accounts={usable}
            value={accountId}
            onChange={setAccountId}
          />
          {isTransfer && (
            <AccountSelect
              id="tx-to-account"
              label="Hacia"
              accounts={usable.filter((a) => a.id !== accountId)}
              value={toAccountId}
              onChange={setToAccountId}
              placeholder="Elige la cuenta destino"
            />
          )}
        </div>

        {!isTransfer && (
          <CategorySelect
            kind={type === 'ingreso' ? 'ingreso' : 'gasto'}
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
        )}

        {crossCurrency && toAccount && (
          <div className="field">
            <label htmlFor="tx-to-amount">Monto que recibiste ({toAccount.currency})</label>
            <input
              id="tx-to-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
            />
            <ExchangeInfo
              amount={Number(amount)}
              toAmount={Number(toAmount)}
              fromUsd={account?.currency === 'USD'}
              trm={Number(fxRate)}
            />
          </div>
        )}

        {needsFx && (
          <div className="field">
            <label htmlFor="tx-fx">TRM (COP por 1 USD)</label>
            <input
              id="tx-fx"
              type="number"
              min="0"
              step="any"
              value={fxRate}
              onChange={(e) => {
                setFxRate(e.target.value)
                setFxManual(true)
              }}
            />
            <small className="muted">
              {fxManual ? (
                <>
                  Escrita a mano.{' '}
                  <button type="button" className="link-btn small" onClick={() => setFxManual(false)}>
                    Usar la TRM oficial
                  </button>
                </>
              ) : trmDate ? (
                'TRM oficial vigente esa fecha'
              ) : (
                'Consultando la TRM oficial…'
              )}
            </small>
          </div>
        )}

        <div className="field">
          <label htmlFor="tx-description">Descripción (opcional)</label>
          <input
            id="tx-description"
            placeholder={isTransfer ? 'Ej. pago tarjeta, paso a ahorros' : 'Ej. mercado D1, almuerzo'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="row">
          {initial && (
            <button type="button" className="link-btn danger" onClick={handleDelete}>
              Eliminar
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AccountSelect(props: {
  id: string
  label: string
  accounts: AccountWithBalance[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const assets = props.accounts.filter((a) => !isDebt(a.type))
  const debts = props.accounts.filter((a) => isDebt(a.type))
  const option = (a: AccountWithBalance) => (
    <option key={a.id} value={a.id}>
      {a.name} · {a.currency}
    </option>
  )
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.placeholder && <option value="">{props.placeholder}</option>}
        {assets.length > 0 && <optgroup label="Cuentas">{assets.map(option)}</optgroup>}
        {debts.length > 0 && <optgroup label="Tarjetas y préstamos">{debts.map(option)}</optgroup>}
      </select>
      {props.accounts.find((a) => a.id === props.value) && (
        <small className="muted">
          {accountTypeLabels[props.accounts.find((a) => a.id === props.value)!.type]}
        </small>
      )}
    </div>
  )
}

function CategorySelect(props: {
  kind: 'ingreso' | 'gasto'
  categories: Category[]
  value: string
  onChange: (id: string) => void
}) {
  const active = props.categories.filter(
    (c) => c.kind === props.kind && (!c.archived || c.id === props.value),
  )
  const fixed = active.filter((c) => c.is_fixed)
  const variable = active.filter((c) => !c.is_fixed)
  const option = (c: Category) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  )
  return (
    <div className="field">
      <label htmlFor="tx-category">Categoría</label>
      <select
        id="tx-category"
        required
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">Elige una categoría</option>
        {props.kind === 'gasto' ? (
          <>
            <optgroup label="Gastos fijos">{fixed.map(option)}</optgroup>
            <optgroup label="Gastos variables">{variable.map(option)}</optgroup>
          </>
        ) : (
          active.map(option)
        )}
      </select>
    </div>
  )
}

// Compara la tasa obtenida al cambiar dólares con la TRM oficial
function ExchangeInfo(props: { amount: number; toAmount: number; fromUsd: boolean; trm: number }) {
  if (!(props.amount > 0 && props.toAmount > 0 && props.trm > 0)) return null
  // Tasa en COP por 1 USD, sin importar la dirección del cambio
  const rate = props.fromUsd ? props.toAmount / props.amount : props.amount / props.toAmount
  // Pérdida en pesos frente a haber cambiado exactamente a la TRM
  const loss = props.fromUsd
    ? props.amount * props.trm - props.toAmount
    : props.amount - props.toAmount * props.trm
  const pct = (props.trm - rate) / props.trm
  return (
    <small className="muted">
      Tasa obtenida: {formatMoney(rate)} por USD ·{' '}
      {loss > 0 ? (
        <span className="text-expense">
          {formatMoney(loss)} menos que con la TRM ({Math.abs(pct * 100).toFixed(1)}%)
        </span>
      ) : (
        <span className="text-income">{formatMoney(-loss)} más que con la TRM</span>
      )}
    </small>
  )
}
