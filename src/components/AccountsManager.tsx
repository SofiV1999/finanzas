import { useState, type FormEvent } from 'react'
import { toCop, useData } from '../lib/data'
import { todayIso } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  accountTypeLabels,
  assetTypes,
  debtTypes,
  isDebt,
  type AccountType,
  type AccountWithBalance,
  type Currency,
} from '../lib/types'
import Modal from './Modal'

type Mode = 'activos' | 'deudas'

export default function AccountsManager({ mode }: { mode: Mode }) {
  const { accounts, latestTrm } = useData()
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const types = mode === 'deudas' ? debtTypes : assetTypes
  const mine = accounts.filter((a) => types.includes(a.type))
  const visible = mine.filter((a) => showArchived || !a.archived)
  const archivedCount = mine.length - mine.filter((a) => !a.archived).length
  const totalCop = mine
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + toCop(a.balance, a.currency, latestTrm?.rate), 0)

  return (
    <div className="card">
      <div className="row">
        <h2>{mode === 'deudas' ? 'Tarjetas y préstamos' : 'Cuentas'}</h2>
        <span className="spacer" />
        {archivedCount > 0 && (
          <label className="muted small">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            Mostrar archivadas ({archivedCount})
          </label>
        )}
        <button className="btn" onClick={() => setEditing('new')}>
          + {mode === 'deudas' ? 'Deuda' : 'Cuenta'}
        </button>
      </div>

      <div className="total-line">
        <span className="muted">{mode === 'deudas' ? 'Deuda total' : 'Total'}</span>
        <strong className={mode === 'deudas' ? 'text-expense' : 'text-income'}>
          {formatMoney(Math.abs(totalCop))}
        </strong>
        {mine.some((a) => a.currency === 'USD') && latestTrm && (
          <span className="muted small">USD a TRM {formatMoney(latestTrm.rate)}</span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          {mode === 'deudas'
            ? 'No tienes tarjetas ni préstamos registrados.'
            : 'No tienes cuentas registradas.'}
        </p>
      ) : (
        <div className="account-list">
          {visible.map((a) => (
            <AccountRow key={a.id} account={a} onClick={() => setEditing(a)} />
          ))}
        </div>
      )}

      {editing && (
        <AccountForm
          mode={mode}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function AccountRow({ account: a, onClick }: { account: AccountWithBalance; onClick: () => void }) {
  const { latestTrm } = useData()
  const debt = isDebt(a.type)
  const owed = debt ? Math.max(0, -a.balance) : 0
  const used = a.type === 'tarjeta_credito' && a.credit_limit ? owed / a.credit_limit : null
  // Préstamos: cuánto del monto prestado ya se pagó
  const paidShare =
    a.type === 'prestamo' && a.original_amount
      ? Math.max(0, Math.min(1, (a.original_amount - owed) / a.original_amount))
      : null

  return (
    <button className={`account-row${a.archived ? ' archived' : ''}`} onClick={onClick}>
      <div className="account-main">
        <strong>{a.name}</strong>
        <span className="muted small">
          {accountTypeLabels[a.type]}
          {a.annual_rate != null && ` · ${(a.annual_rate * 100).toFixed(2)}% E.A.`}
          {a.due_day && ` · paga el ${a.due_day}`}
          {a.archived && ' · archivada'}
        </span>
        {used != null && (
          <div className="meter" title={`${Math.round(used * 100)}% del cupo usado`}>
            <div
              className={`meter-fill${used > 1 ? ' over' : used > 0.7 ? ' warn' : ''}`}
              style={{ width: `${Math.min(100, used * 100)}%` }}
            />
          </div>
        )}
        {paidShare != null && (
          <>
            <div className="meter" title={`${Math.round(paidShare * 100)}% pagado`}>
              <div className="meter-fill" style={{ width: `${paidShare * 100}%` }} />
            </div>
            <span className="muted small">
              Llevas pagado {Math.round(paidShare * 100)}% (
              {formatMoney(a.original_amount! - owed, a.currency)} de{' '}
              {formatMoney(a.original_amount!, a.currency)})
            </span>
          </>
        )}
      </div>
      <div className="account-amount">
        <strong className={debt ? 'text-expense' : undefined}>
          {formatMoney(debt ? owed : a.balance, a.currency)}
        </strong>
        {a.currency === 'USD' && latestTrm && (
          <span className="muted small">
            ≈ {formatMoney(toCop(debt ? owed : a.balance, 'USD', latestTrm.rate))}
          </span>
        )}
        {used != null && a.credit_limit && (
          <span className="muted small">de {formatMoney(a.credit_limit, a.currency)}</span>
        )}
      </div>
    </button>
  )
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))
const pctOrNull = (v: string) => (v.trim() === '' ? null : Number(v) / 100)
const str = (v: number | null | undefined) => (v == null ? '' : String(v))

function AccountForm({
  mode,
  initial,
  onClose,
}: {
  mode: Mode
  initial?: AccountWithBalance
  onClose: () => void
}) {
  const { accounts, refresh } = useData()
  const types = mode === 'deudas' ? debtTypes : assetTypes

  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? types[mode === 'deudas' ? 0 : 1])
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'COP')
  // Las deudas se escriben en positivo y se guardan en negativo
  const [opening, setOpening] = useState(
    initial
      ? String(isDebt(initial.type) ? -initial.opening_balance : initial.opening_balance)
      : '',
  )
  const [openingDate, setOpeningDate] = useState(initial?.opening_date ?? todayIso())
  const [rate, setRate] = useState(
    initial?.annual_rate != null ? String(Math.round(initial.annual_rate * 1e6) / 1e4) : '',
  )
  const [creditLimit, setCreditLimit] = useState(str(initial?.credit_limit))
  const [statementDay, setStatementDay] = useState(str(initial?.statement_day))
  const [dueDay, setDueDay] = useState(str(initial?.due_day))
  const [originalAmount, setOriginalAmount] = useState(str(initial?.original_amount))
  const [minPayment, setMinPayment] = useState(str(initial?.min_payment))
  const [termMonths, setTermMonths] = useState(str(initial?.term_months))
  const [archived, setArchived] = useState(initial?.archived ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const debt = isDebt(type)
  const card = type === 'tarjeta_credito'
  const loan = type === 'prestamo'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const openingValue = Number(opening || 0)
    const row = {
      name: name.trim(),
      type,
      currency,
      opening_balance: debt ? -Math.abs(openingValue) : openingValue,
      opening_date: openingDate,
      annual_rate: pctOrNull(rate),
      credit_limit: card ? numOrNull(creditLimit) : null,
      statement_day: card ? numOrNull(statementDay) : null,
      due_day: debt ? numOrNull(dueDay) : null,
      original_amount: loan ? numOrNull(originalAmount) : null,
      min_payment: debt ? numOrNull(minPayment) : null,
      term_months: loan ? numOrNull(termMonths) : null,
      archived,
      sort_order: initial?.sort_order ?? Math.max(0, ...accounts.map((a) => a.sort_order)) + 1,
    }
    setSaving(true)
    const { error } = initial
      ? await supabase.from('accounts').update(row).eq('id', initial.id)
      : await supabase.from('accounts').insert(row)
    setSaving(false)
    if (error) {
      return setError(
        error.code === '23505' ? 'Ya tienes una cuenta con ese nombre.' : error.message,
      )
    }
    await refresh()
    onClose()
  }

  async function handleDelete() {
    if (!initial || !confirm(`¿Eliminar "${initial.name}"?`)) return
    const { error } = await supabase.from('accounts').delete().eq('id', initial.id)
    if (error) {
      return setError(
        error.code === '23503'
          ? 'Esta cuenta tiene movimientos. Archívala en vez de eliminarla.'
          : error.message,
      )
    }
    await refresh()
    onClose()
  }

  const title = initial
    ? `Editar ${initial.name}`
    : mode === 'deudas'
      ? 'Nueva deuda'
      : 'Nueva cuenta'

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="acc-name">Nombre</label>
          <input
            id="acc-name"
            required
            autoFocus
            placeholder={debt ? 'Ej. Visa Bancolombia' : 'Ej. Ahorros Nu, Bolsillo emergencia'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="acc-type">Tipo</label>
            <select
              id="acc-type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {accountTypeLabels[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acc-currency">Moneda</label>
            <select
              id="acc-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="COP">Pesos (COP)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="acc-opening">{debt ? 'Deuda inicial' : 'Saldo inicial'}</label>
            <input
              id="acc-opening"
              type="number"
              step="any"
              min={debt ? '0' : undefined}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
            <small className="muted">
              {opening
                ? formatMoney(Number(opening), currency)
                : debt
                  ? 'Lo que debías ese día'
                  : 'Lo que tenías ese día'}
            </small>
          </div>
          <div className="field">
            <label htmlFor="acc-opening-date">Fecha de ese saldo</label>
            <input
              id="acc-opening-date"
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
            <small className="muted">Registra movimientos desde esta fecha</small>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="acc-rate">
              {debt ? 'Tasa de interés (% E.A.)' : 'Rendimiento (% E.A.)'}
            </label>
            <input
              id="acc-rate"
              type="number"
              step="any"
              min="0"
              placeholder="Opcional"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            {rate && (
              <small className="muted">
                ≈ {((Math.pow(1 + Number(rate) / 100, 1 / 12) - 1) * 100).toFixed(2)}% mensual
              </small>
            )}
          </div>
          {debt && (
            <div className="field">
              <label htmlFor="acc-due">Día de pago</label>
              <input
                id="acc-due"
                type="number"
                min="1"
                max="31"
                placeholder="Ej. 15"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          )}
        </div>

        {card && (
          <div className="grid-3">
            <div className="field">
              <label htmlFor="acc-limit">Cupo total</label>
              <input
                id="acc-limit"
                type="number"
                min="0"
                step="any"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-statement">Día de corte</label>
              <input
                id="acc-statement"
                type="number"
                min="1"
                max="31"
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-card-min">Pago mensual</label>
              <input
                id="acc-card-min"
                type="number"
                min="0"
                step="any"
                placeholder="Mínimo o lo usual"
                value={minPayment}
                onChange={(e) => setMinPayment(e.target.value)}
              />
            </div>
          </div>
        )}

        {loan && (
          <div className="grid-3">
            <div className="field">
              <label htmlFor="acc-original">Monto prestado</label>
              <input
                id="acc-original"
                type="number"
                min="0"
                step="any"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-min">Cuota mensual</label>
              <input
                id="acc-min"
                type="number"
                min="0"
                step="any"
                value={minPayment}
                onChange={(e) => setMinPayment(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-term">Plazo (meses)</label>
              <input
                id="acc-term"
                type="number"
                min="1"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              />
            </div>
          </div>
        )}

        {initial && (
          <label className="muted small check-line">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{' '}
            Archivada (cuenta cerrada o deuda pagada: se oculta pero conserva su historial)
          </label>
        )}

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
