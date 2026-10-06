import { useEffect, useState, type FormEvent } from 'react'
import { annualProvision, monthlyEquivalent } from '../lib/budget'
import { plannedIncomeCop, useData } from '../lib/data'
import { formatMonth, todayIso } from '../lib/dates'
import {
  monthLabelFromNow,
  monthsToReach,
  monthsUntil,
  requiredMonthlyContribution,
} from '../lib/finance'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import { isDebt, type Currency, type Goal } from '../lib/types'
import Modal from './Modal'

type Draft = Partial<Goal>

export default function GoalsManager() {
  const { accounts, categories, settings, latestTrm, version } = useData()
  const [goals, setGoals] = useState<Goal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('goals')
      .select('*')
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        setError(error?.message ?? null)
        setGoals(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [version])

  // Saldo de la cuenta vinculada, expresado en la moneda de la meta
  function progressOf(goal: Goal) {
    const account = accounts.find((a) => a.id === goal.account_id)
    if (!account) return 0
    if (account.currency === goal.currency) return account.balance
    const rate = latestTrm?.rate
    if (!rate) return 0
    return goal.currency === 'COP' ? account.balance * rate : account.balance / rate
  }

  // Sugerencia de fondo de emergencia: 6 meses de gastos presupuestados (o del ingreso)
  const monthlyExpenses = monthlyEquivalent(categories)
  const emergencyTarget = 6 * (monthlyExpenses || plannedIncomeCop(settings))
  // Sugerencia de bolsillo para gastos anuales: lo que cuestan en un año
  const annualTotal = annualProvision(categories) * 12

  const visible = goals.filter((g) => !g.archived)
  const suggestions = [
    { name: 'Fondo de emergencia', target_amount: Math.round(emergencyTarget) || undefined },
    ...(annualTotal > 0
      ? [{ name: 'Gastos anuales', target_amount: Math.round(annualTotal), target_date: undefined }]
      : []),
    { name: 'Reserva para impuestos' },
    { name: 'Inversión' },
  ].filter((s) => !goals.some((g) => g.name === s.name))

  return (
    <div className="card">
      <div className="row">
        <h2>Metas</h2>
        <span className="spacer" />
        <button className="btn" onClick={() => setEditing({})}>
          + Meta
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {visible.length === 0 && (
        <p className="muted">
          Crea metas y vincúlalas a una cuenta (por ejemplo un bolsillo): su saldo es el avance.
        </p>
      )}

      <div className="goal-list">
        {visible.map((g) => (
          <GoalRow key={g.id} goal={g} current={progressOf(g)} onEdit={() => setEditing(g)} />
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="row suggestions">
          <span className="muted small">Sugeridas:</span>
          {suggestions.map((s) => (
            <button
              key={s.name}
              className="tag suggestion"
              onClick={() => setEditing({ ...s, currency: 'COP' })}
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <GoalForm
          initial={editing}
          accounts={accounts.filter((a) => !isDebt(a.type) && !a.archived)}
          emergencyHint={
            editing.name === 'Fondo de emergencia' && emergencyTarget > 0
              ? `Sugerido: 6 meses de ${monthlyExpenses ? 'gastos presupuestados' : 'ingreso'} (${formatMoney(emergencyTarget)})`
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

const groupDigits = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

function GoalRow({
  goal: g,
  current,
  onEdit,
}: {
  goal: Goal
  current: number
  onEdit: () => void
}) {
  const { accounts } = useData()
  const [planDigits, setPlanDigits] = useState('')
  const account = accounts.find((a) => a.id === g.account_id)
  const money = (v: number) => formatMoney(v, g.currency)
  const pct = Math.max(0, Math.min(1, current / g.target_amount))
  const reached = current >= g.target_amount
  const months = g.target_date ? monthsUntil(g.target_date) : null
  const required =
    months != null && !reached
      ? requiredMonthlyContribution(
          Math.max(0, current),
          g.target_amount,
          months,
          g.expected_return_ea,
        )
      : null
  const plan = Number(planDigits || 0)
  const planMonths =
    plan > 0
      ? monthsToReach(Math.max(0, current), g.target_amount, plan, g.expected_return_ea)
      : null

  return (
    <div className="goal-row">
      <div className="budget-head">
        <div className="budget-name">
          <strong>{g.name}</strong>
          {reached && <span className="tag tag-paid">¡Lograda!</span>}
        </div>
        <button className="link-btn" onClick={onEdit}>
          Editar
        </button>
      </div>
      <div className="meter budget-meter">
        <div className="meter-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="budget-foot small">
        <span>
          <strong>{money(current)}</strong>{' '}
          <span className="muted">de {money(g.target_amount)}</span>
        </span>
        <span className="muted">{Math.round(pct * 100)}%</span>
      </div>
      <div className="muted small goal-meta">
        {account ? `Cuenta: ${account.name}` : 'Sin cuenta vinculada: edítala para ver el avance'}
        {g.expected_return_ea > 0 &&
          ` · rendimiento ${(g.expected_return_ea * 100).toFixed(1)}% E.A.`}
      </div>
      {!reached && required != null && (
        <p className="small goal-plan">
          {months === 0 ? (
            <span className="text-expense">
              {g.target_date! < todayIso() ? 'La fecha ya pasó' : 'La fecha es este mes'}: faltan{' '}
              {money(g.target_amount - current)}.
            </span>
          ) : (
            <>
              Aporta <strong className="text-income">{money(required)}</strong> al mes para llegar
              en {formatMonth(g.target_date!.slice(0, 7))} ({months}{' '}
              {months === 1 ? 'mes' : 'meses'}).
            </>
          )}
        </p>
      )}
      {!reached && months == null && (
        <div className="row goal-calc small">
          <label htmlFor={`plan-${g.id}`} className="muted">
            Si aportas
          </label>
          <input
            id={`plan-${g.id}`}
            className="inline-input amount-input"
            inputMode="numeric"
            placeholder="0"
            value={planDigits ? groupDigits.format(plan) : ''}
            onChange={(e) => setPlanDigits(e.target.value.replace(/\D/g, ''))}
          />
          <span className="muted">{g.currency} al mes</span>
          {plan > 0 && (
            <span>
              →{' '}
              {planMonths == null
                ? 'no llegas en 50 años'
                : `llegas en ${planMonths} ${planMonths === 1 ? 'mes' : 'meses'} (${monthLabelFromNow(planMonths)})`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function GoalForm({
  initial,
  accounts,
  emergencyHint,
  onClose,
}: {
  initial: Draft
  accounts: { id: string; name: string; currency: Currency; annual_rate: number | null }[]
  emergencyHint?: string
  onClose: () => void
}) {
  const { refresh } = useData()
  const [name, setName] = useState(initial.name ?? '')
  const [target, setTarget] = useState(initial.target_amount ? String(initial.target_amount) : '')
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? 'COP')
  const [targetDate, setTargetDate] = useState(initial.target_date ?? '')
  const [accountId, setAccountId] = useState(initial.account_id ?? '')
  const [returnPct, setReturnPct] = useState(
    initial.expected_return_ea ? String(Math.round(initial.expected_return_ea * 1e6) / 1e4) : '',
  )
  const [archived, setArchived] = useState(initial.archived ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function chooseAccount(id: string) {
    setAccountId(id)
    const account = accounts.find((a) => a.id === id)
    // Por defecto la meta usa la moneda y el rendimiento de su cuenta
    if (account) {
      setCurrency(account.currency)
      if (!returnPct && account.annual_rate) {
        setReturnPct(String(Math.round(account.annual_rate * 1e6) / 1e4))
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!(Number(target) > 0)) return setError('La meta debe ser mayor que 0.')
    const row = {
      name: name.trim(),
      target_amount: Number(target),
      currency,
      target_date: targetDate || null,
      account_id: accountId || null,
      expected_return_ea: Number(returnPct || 0) / 100,
      archived,
    }
    setSaving(true)
    const { error } = initial.id
      ? await supabase.from('goals').update(row).eq('id', initial.id)
      : await supabase.from('goals').insert(row)
    setSaving(false)
    if (error) {
      return setError(error.code === '23505' ? 'Ya tienes una meta con ese nombre.' : error.message)
    }
    await refresh()
    onClose()
  }

  async function handleDelete() {
    if (!initial.id || !confirm(`¿Eliminar la meta "${initial.name}"?`)) return
    const { error } = await supabase.from('goals').delete().eq('id', initial.id)
    if (error) return setError(error.message)
    await refresh()
    onClose()
  }

  return (
    <Modal title={initial.id ? `Editar ${initial.name}` : 'Nueva meta'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="goal-name">Nombre</label>
          <input
            id="goal-name"
            required
            autoFocus={!initial.name}
            placeholder="Ej. Fondo de emergencia, viaje, inversión"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="goal-account">Cuenta donde la ahorras</label>
          <select
            id="goal-account"
            value={accountId}
            onChange={(e) => chooseAccount(e.target.value)}
          >
            <option value="">Sin cuenta (sin avance)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
          <small className="muted">
            Su saldo es el avance. Lo ideal es una cuenta o bolsillo solo para esta meta.
          </small>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="goal-target">Monto meta</label>
            <input
              id="goal-target"
              type="number"
              min="0"
              step="any"
              required
              autoFocus={Boolean(initial.name)}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <small className="muted">
              {target ? formatMoney(Number(target), currency) : (emergencyHint ?? '')}
            </small>
          </div>
          <div className="field">
            <label htmlFor="goal-currency">Moneda</label>
            <select
              id="goal-currency"
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
            <label htmlFor="goal-date">Fecha objetivo (opcional)</label>
            <input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="goal-return">Rendimiento esperado (% E.A.)</label>
            <input
              id="goal-return"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={returnPct}
              onChange={(e) => setReturnPct(e.target.value)}
            />
          </div>
        </div>
        {initial.id && (
          <label className="muted small check-line">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{' '}
            Archivada (se oculta de la lista)
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          {initial.id && (
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
