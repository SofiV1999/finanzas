import { useEffect, useMemo, useState } from 'react'
import TransactionForm, { type TransactionPreset } from '../components/TransactionForm'
import { plannedIncomeCop, toCop, useData } from '../lib/data'
import { addMonths, currentMonthIso, formatMonth, monthEnd } from '../lib/dates'
import { formatMoney, formatPct } from '../lib/format'
import { supabase } from '../lib/supabase'
import { budgetGroupLabels, type Budget, type BudgetGroup, type Category } from '../lib/types'

type EditMode = 'mes' | 'plantilla'

type Movement = {
  type: 'ingreso' | 'gasto'
  category_id: string
  amount: number
  fx_rate: number | null
  account_id: string
}

export default function Presupuesto() {
  const { settings, categories, accounts, latestTrm, version, refresh } = useData()
  const [month, setMonth] = useState(currentMonthIso())
  const [mode, setMode] = useState<EditMode>('mes')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<TransactionPreset | null>(null)

  const monthStart = `${month}-01`

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('budgets').select('*').eq('month', monthStart),
      supabase
        .from('transactions')
        .select('type, category_id, amount, fx_rate, account_id')
        .in('type', ['ingreso', 'gasto'])
        .gte('date', monthStart)
        .lte('date', monthEnd(month)),
    ]).then(([b, t]) => {
      if (cancelled) return
      setError((b.error ?? t.error)?.message ?? null)
      setBudgets(b.data ?? [])
      setMovements(t.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [month, monthStart, version])

  const currencyOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts])

  // Real del mes por categoría, en pesos
  const realByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movements) {
      const cop = toCop(
        m.amount,
        currencyOf.get(m.account_id) ?? 'COP',
        m.fx_rate ?? latestTrm?.rate,
      )
      map.set(m.category_id, (map.get(m.category_id) ?? 0) + cop)
    }
    return map
  }, [movements, currencyOf, latestTrm])

  const overrideByCategory = new Map(budgets.map((b) => [b.category_id, b.amount]))
  const budgetFor = (c: Category) => overrideByCategory.get(c.id) ?? c.default_budget

  const expenseCats = categories.filter(
    (c) => c.kind === 'gasto' && (!c.archived || realByCategory.has(c.id)),
  )
  const incomeCats = categories.filter((c) => c.kind === 'ingreso')
  const fixed = expenseCats.filter((c) => c.is_fixed)
  const variable = expenseCats.filter((c) => !c.is_fixed)

  const planned = plannedIncomeCop(settings)
  const realIncome = incomeCats.reduce((s, c) => s + (realByCategory.get(c.id) ?? 0), 0)
  const totalBudget = expenseCats.reduce((s, c) => s + budgetFor(c), 0)
  const totalReal = expenseCats.reduce((s, c) => s + (realByCategory.get(c.id) ?? 0), 0)

  async function saveBudget(c: Category, value: number) {
    const { error } =
      mode === 'plantilla'
        ? await supabase.from('categories').update({ default_budget: value }).eq('id', c.id)
        : await supabase
            .from('budgets')
            .upsert(
              { month: monthStart, category_id: c.id, amount: value },
              { onConflict: 'user_id,month,category_id' },
            )
    setError(error?.message ?? null)
    await refresh()
  }

  async function resetBudget(c: Category) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('month', monthStart)
      .eq('category_id', c.id)
    setError(error?.message ?? null)
    await refresh()
  }

  const rowProps = {
    mode,
    realByCategory,
    overrideByCategory,
    budgetFor,
    onSave: saveBudget,
    onReset: resetBudget,
  }

  return (
    <>
      <h1>🎯 Presupuesto</h1>
      <div className="row month-nav">
        <button
          className="btn btn-ghost"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <strong className="month-title">{formatMonth(month)}</strong>
        <button
          className="btn btn-ghost"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Mes siguiente"
        >
          ›
        </button>
        {month !== currentMonthIso() && (
          <button className="link-btn" onClick={() => setMonth(currentMonthIso())}>
            Ir al mes actual
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="summary">
        <div className="card stat">
          <span className="muted small">Ingreso planeado</span>
          <strong>{formatMoney(planned)}</strong>
          {settings?.salary_currency === 'USD' && (
            <span className="muted small">
              {formatMoney(settings.monthly_salary, 'USD')} × TRM{' '}
              {formatMoney(settings.planning_fx_rate ?? 0)}
            </span>
          )}
        </div>
        <div className="card stat">
          <span className="muted small">Presupuestado en gastos</span>
          <strong>{formatMoney(totalBudget)}</strong>
          <span className={`small ${planned - totalBudget < 0 ? 'text-expense' : 'muted'}`}>
            {planned - totalBudget >= 0
              ? `${formatMoney(planned - totalBudget)} sin asignar (va a ahorro)`
              : `${formatMoney(totalBudget - planned)} más que tu ingreso`}
          </span>
        </div>
        <div className="card stat">
          <span className="muted small">Gastado este mes</span>
          <strong className={totalReal > totalBudget ? 'text-expense' : undefined}>
            {formatMoney(totalReal)}
          </strong>
          <span className="muted small">Ingreso real: {formatMoney(realIncome)}</span>
        </div>
      </div>

      <FiftyThirtyTwenty
        expenseCats={expenseCats}
        realByCategory={realByCategory}
        budgetFor={budgetFor}
        income={realIncome > 0 ? realIncome : planned}
        incomeIsReal={realIncome > 0}
      />

      <div className="row budget-toolbar">
        <h2>Gastos por categoría</h2>
        <span className="spacer" />
        <div className="segmented segmented-inline" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'mes'}
            className={`segment${mode === 'mes' ? ' active' : ''}`}
            onClick={() => setMode('mes')}
          >
            Editar este mes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'plantilla'}
            className={`segment${mode === 'plantilla' ? ' active' : ''}`}
            onClick={() => setMode('plantilla')}
          >
            Editar plantilla
          </button>
        </div>
      </div>
      <p className="muted small">
        {mode === 'mes'
          ? `Los cambios aplican solo a ${formatMonth(month)}. Los meses sin cambios usan la plantilla.`
          : 'La plantilla es el presupuesto base de todos los meses (los ajustes de un mes específico se conservan).'}
      </p>

      <div className="card budget-card">
        <h3>Gastos fijos</h3>
        {fixed.map((c) => (
          <BudgetRow
            key={c.id}
            category={c}
            {...rowProps}
            onPay={() =>
              setPreset({ type: 'gasto', categoryId: c.id, amount: budgetFor(c) || undefined })
            }
          />
        ))}
        <h3 className="budget-subtitle">Gastos variables</h3>
        {variable.map((c) => (
          <BudgetRow key={c.id} category={c} {...rowProps} />
        ))}
      </div>

      <div className="card budget-card">
        <h3>Ingresos del mes</h3>
        {incomeCats
          .filter((c) => !c.archived || realByCategory.has(c.id))
          .map((c) => (
            <div key={c.id} className="income-row">
              <span>{c.name}</span>
              <strong className={realByCategory.get(c.id) ? 'text-income' : 'muted'}>
                {formatMoney(realByCategory.get(c.id) ?? 0)}
              </strong>
            </div>
          ))}
      </div>

      {preset && <TransactionForm preset={preset} onClose={() => setPreset(null)} />}
    </>
  )
}

function BudgetRow({
  category: c,
  mode,
  realByCategory,
  overrideByCategory,
  budgetFor,
  onSave,
  onReset,
  onPay,
}: {
  category: Category
  mode: EditMode
  realByCategory: Map<string, number>
  overrideByCategory: Map<string, number>
  budgetFor: (c: Category) => number
  onSave: (c: Category, value: number) => void
  onReset: (c: Category) => void
  onPay?: () => void
}) {
  const real = realByCategory.get(c.id) ?? 0
  const value = mode === 'plantilla' ? c.default_budget : budgetFor(c)
  const hasOverride =
    overrideByCategory.has(c.id) && overrideByCategory.get(c.id) !== c.default_budget
  const ratio = value > 0 ? real / value : real > 0 ? 1.01 : 0
  const remaining = value - real

  return (
    <div className="budget-row">
      <div className="budget-head">
        <div className="budget-name">
          <strong>{c.name}</strong>
          <span className={`tag tag-${c.budget_group}`}>
            {budgetGroupLabels[c.budget_group as BudgetGroup]}
          </span>
          {c.is_fixed &&
            (real > 0 ? (
              <span className="tag tag-paid">Pagado</span>
            ) : value > 0 ? (
              <button className="tag tag-pending" onClick={onPay} title="Registrar el pago">
                Pendiente · registrar pago
              </button>
            ) : null)}
        </div>
        <div className="budget-input">
          {mode === 'mes' && hasOverride && (
            <button
              className="link-btn small"
              title={`Volver a la plantilla (${formatMoney(c.default_budget)})`}
              onClick={() => onReset(c)}
            >
              ↺
            </button>
          )}
          <BudgetInput key={`${mode}-${value}`} value={value} onSave={(v) => onSave(c, v)} />
        </div>
      </div>
      <div className="meter budget-meter">
        <div
          className={`meter-fill${ratio > 1 ? ' over' : ratio > 0.85 && !c.is_fixed ? ' warn' : ''}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <div className="budget-foot muted small">
        <span>Gastado {formatMoney(real)}</span>
        {value > 0 && (
          <span className={remaining < 0 ? 'text-expense' : undefined}>
            {remaining >= 0
              ? `Quedan ${formatMoney(remaining)}`
              : `Te pasaste ${formatMoney(-remaining)}`}
          </span>
        )}
      </div>
    </div>
  )
}

const groupDigits = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

// "1800000" -> "1.800.000"
const formatDigits = (digits: string) => (digits ? groupDigits.format(Number(digits)) : '')

// Campo de monto en pesos con separador de miles; guarda al salir del campo o con Enter
function BudgetInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [digits, setDigits] = useState(value ? String(Math.round(value)) : '')
  const commit = () => {
    const next = Number(digits || 0)
    if (next !== value) onSave(next)
  }
  return (
    <input
      className="inline-input amount-input"
      type="text"
      inputMode="numeric"
      placeholder="0"
      aria-label="Presupuesto"
      value={formatDigits(digits)}
      onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function FiftyThirtyTwenty({
  expenseCats,
  realByCategory,
  budgetFor,
  income,
  incomeIsReal,
}: {
  expenseCats: Category[]
  realByCategory: Map<string, number>
  budgetFor: (c: Category) => number
  income: number
  incomeIsReal: boolean
}) {
  const { settings } = useData()
  if (!settings) return null

  const sum = (group: BudgetGroup, f: (c: Category) => number) =>
    expenseCats.filter((c) => c.budget_group === group).reduce((s, c) => s + f(c), 0)
  const real = (c: Category) => realByCategory.get(c.id) ?? 0

  const needs = sum('necesidad', real)
  const wants = sum('deseo', real)
  // Ahorro = lo que queda del ingreso después de necesidades y deseos
  const savings = income - needs - wants

  const rows: {
    label: string
    real: number
    budget: number
    target: number
    isSavings?: boolean
  }[] = [
    {
      label: 'Necesidades',
      real: needs,
      budget: sum('necesidad', budgetFor),
      target: settings.needs_pct,
    },
    { label: 'Deseos', real: wants, budget: sum('deseo', budgetFor), target: settings.wants_pct },
    {
      label: 'Ahorro / Inversión',
      real: savings,
      budget: income - sum('necesidad', budgetFor) - sum('deseo', budgetFor),
      target: settings.savings_pct,
      isSavings: true,
    },
  ]

  return (
    <div className="card fifty">
      <div className="row">
        <h2>50/30/20 del mes</h2>
        <span className="spacer" />
        <span className="muted small">
          % sobre {incomeIsReal ? 'el ingreso real' : 'el ingreso planeado'} ({formatMoney(income)})
        </span>
      </div>
      {rows.map((r) => {
        const pct = income > 0 ? r.real / income : 0
        // En ahorro, quedar por debajo de la meta es lo malo; en gastos, pasarse
        const bad = r.isSavings ? pct < r.target : pct > r.target
        return (
          <div key={r.label} className="fifty-row">
            <div className="fifty-head">
              <strong>{r.label}</strong>
              <span className={bad ? 'text-expense' : 'text-income'}>
                {formatPct(pct)} <span className="muted">/ meta {formatPct(r.target)}</span>
              </span>
            </div>
            <div className="fifty-bar">
              <div
                className={`fifty-fill${bad ? ' bad' : ''}`}
                style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
              />
              <div className="fifty-target" style={{ left: `${r.target * 100}%` }} title="Meta" />
            </div>
            <div className="budget-foot muted small">
              <span>Real {formatMoney(r.real)}</span>
              <span>
                Presupuestado {formatMoney(r.budget)} · Meta {formatMoney(income * r.target)}
              </span>
            </div>
          </div>
        )
      })}
      <p className="muted small">
        El ahorro es lo que queda del ingreso después de necesidades y deseos: incluye lo que pasas
        a ahorros o inversiones y lo que abonas a capital de tus deudas.
      </p>
    </div>
  )
}
