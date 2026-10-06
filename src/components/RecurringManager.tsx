import { useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import { formatDay, todayIso, yesterdayIso } from '../lib/dates'
import { formatMoney } from '../lib/format'
import {
  nextDate,
  pendingConfirmations,
  presetFor,
  type RecurringTransaction,
} from '../lib/recurring'
import { transferLabel } from '../lib/reports'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import TransactionForm, { type TransactionPreset } from './TransactionForm'

export default function RecurringManager() {
  const { recurring, accounts, categories, refresh } = useData()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<TransactionPreset | null>(null)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = todayIso()
  const pending = pendingConfirmations(recurring, today)
  const accountName = new Map(accounts.map((a) => [a.id, a]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const label = (r: RecurringTransaction) =>
    r.type === 'traslado'
      ? `${transferLabel(r, accountName)}${r.description ? ` · ${r.description}` : ''}`
      : `${categoryName.get(r.category_id ?? '') ?? 'Sin categoría'}${r.description ? ` · ${r.description}` : ''}`

  if (recurring.length === 0) return null

  async function update(id: string, patch: Partial<RecurringTransaction>) {
    const { error } = await supabase.from('recurring_transactions').update(patch).eq('id', id)
    setError(error?.message ?? null)
    await refresh()
  }

  // Al reanudar se saltan las fechas que pasaron durante la pausa (no se registran de golpe)
  async function resume(rule: RecurringTransaction) {
    const yesterday = yesterdayIso()
    const lastDone = rule.last_done && rule.last_done > yesterday ? rule.last_done : yesterday
    await update(rule.id, { active: true, last_done: lastDone })
  }

  async function skip(rule: RecurringTransaction, date: string) {
    await update(rule.id, { last_done: date })
  }

  async function remove(rule: RecurringTransaction) {
    if (
      !confirm('¿Eliminar este movimiento programado? Los movimientos ya registrados se conservan.')
    )
      return
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', rule.id)
    setError(error?.message ?? null)
    await refresh()
  }

  const sorted = [...recurring].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (nextDate(a, today) ?? '9999').localeCompare(nextDate(b, today) ?? '9999'),
  )

  return (
    <div className="card recurring-card">
      {pending.length > 0 && (
        <div className="pending-block">
          <h3 className="mini-title">Por confirmar</h3>
          {pending.map(({ rule, date }) => {
            const currency = accountName.get(rule.account_id)?.currency
            return (
              <div key={`${rule.id}-${date}`} className="mini-row budget-foot small">
                <span className="mini-main">
                  <strong className="text-h">{label(rule)}</strong>
                  <span className="muted">
                    {' '}
                    · {formatDay(date)} · {formatMoney(rule.amount, currency)}
                  </span>
                </span>
                <span className="row pending-actions">
                  <button className="link-btn small" onClick={() => skip(rule, date)}>
                    Omitir
                  </button>
                  <button
                    className="tag tag-pending"
                    onClick={() => setConfirming(presetFor(rule, date))}
                  >
                    Registrar
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <button className="row recurring-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>🔁 Programados ({recurring.filter((r) => r.active).length})</h2>
        <span className="spacer" />
        <span className="muted small">{open ? 'Ocultar' : 'Ver'}</span>
      </button>

      {open && (
        <div className="recurring-list">
          {sorted.map((r) => {
            const from = accountName.get(r.account_id)
            const to = r.to_account_id ? accountName.get(r.to_account_id) : undefined
            const next = nextDate(r, today)
            return (
              <div key={r.id} className={`mini-row${r.active ? '' : ' archived'}`}>
                <div className="budget-foot small">
                  <strong className="text-h">{label(r)}</strong>
                  <strong className={`tx-${r.type}`}>
                    {r.type === 'gasto' ? '−' : r.type === 'ingreso' ? '+' : ''}
                    {formatMoney(r.amount, from?.currency)}
                  </strong>
                </div>
                <div className="budget-foot small muted">
                  <span>
                    Día {r.day_of_month} · {from?.name}
                    {to && ` → ${to.name}`} · {r.auto ? 'automático' : 'con confirmación'}
                    {r.end_date && ` · hasta ${formatDay(r.end_date)} ${r.end_date.slice(0, 4)}`}
                  </span>
                  <span>
                    {!r.active ? 'Pausado' : next ? `Próximo: ${formatDay(next)}` : 'Terminado'}
                  </span>
                </div>
                <div className="row recurring-actions">
                  <button className="link-btn small" onClick={() => setEditing(r)}>
                    Editar
                  </button>
                  <button
                    className="link-btn small"
                    onClick={() => (r.active ? update(r.id, { active: false }) : resume(r))}
                  >
                    {r.active ? 'Pausar' : 'Reanudar'}
                  </button>
                  <button className="link-btn small danger" onClick={() => remove(r)}>
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
          <p className="muted small">
            Para crear uno, registra un movimiento y marca “Repetir cada mes”. Los automáticos se
            registran al abrir la app; si la abres después de su fecha, se registran con la fecha
            correcta.
          </p>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {confirming && <TransactionForm preset={confirming} onClose={() => setConfirming(null)} />}
      {editing && <RecurringForm rule={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RecurringForm({ rule, onClose }: { rule: RecurringTransaction; onClose: () => void }) {
  const { accounts, refresh } = useData()
  const currency = accounts.find((a) => a.id === rule.account_id)?.currency ?? 'COP'
  const [amount, setAmount] = useState(String(rule.amount))
  const [day, setDay] = useState(String(rule.day_of_month))
  const [auto, setAuto] = useState(rule.auto)
  const [endDate, setEndDate] = useState(rule.end_date ?? '')
  const [description, setDescription] = useState(rule.description ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const dayNumber = Number(day)
    if (!(Number(amount) > 0)) return setError('El monto debe ser mayor que 0.')
    if (!(dayNumber >= 1 && dayNumber <= 31)) return setError('El día debe estar entre 1 y 31.')
    if (endDate && endDate < rule.start_date) return setError('La fecha final es antes del inicio.')
    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        amount: Number(amount),
        day_of_month: dayNumber,
        auto,
        end_date: endDate || null,
        description: description.trim() || null,
      })
      .eq('id', rule.id)
    if (error) return setError(error.message)
    await refresh()
    onClose()
  }

  return (
    <Modal title="Editar programado" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="rec-amount">Monto ({currency})</label>
            <input
              id="rec-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <small className="muted">{formatMoney(Number(amount) || 0, currency)}</small>
          </div>
          <div className="field">
            <label htmlFor="rec-day">Día del mes</label>
            <input
              id="rec-day"
              type="number"
              min="1"
              max="31"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
            <small className="muted">29-31 caen el último día en meses más cortos</small>
          </div>
        </div>
        <div className="segmented segmented-inline repeat-mode" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={auto}
            className={`segment${auto ? ' active' : ''}`}
            onClick={() => setAuto(true)}
          >
            Registrar automáticamente
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!auto}
            className={`segment${!auto ? ' active' : ''}`}
            onClick={() => setAuto(false)}
          >
            Pedirme confirmación
          </button>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="rec-end">Hasta (opcional)</label>
            <input
              id="rec-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rec-desc">Descripción</label>
            <input
              id="rec-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <p className="muted small">
          Los cambios aplican a los próximos movimientos; los ya registrados no cambian.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}
