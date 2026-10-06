import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lines } from '../components/charts'
import { SERIES } from '../lib/chartColors'
import TransactionForm, { type TransactionPreset } from '../components/TransactionForm'
import { toCop, useData } from '../lib/data'
import { addMonths, currentMonthIso, formatDay, formatMonth, todayIso } from '../lib/dates'
import { formatMoney, formatPct } from '../lib/format'
import { fetchTransactions, makeCop, monthlyTotals, netWorthByMonth } from '../lib/reports'
import { supabase } from '../lib/supabase'
import { isDebt, sortByGroup, type Budget, type Goal, type Transaction } from '../lib/types'

export default function Resumen() {
  const { accounts, categories, settings, latestTrm, version } = useData()
  const [txs, setTxs] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<TransactionPreset | null>(null)

  const month = currentMonthIso()
  const today = todayIso()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchTransactions(undefined, today),
      supabase.from('budgets').select('*').eq('month', `${month}-01`),
      supabase.from('goals').select('*').eq('archived', false).order('created_at'),
    ])
      .then(([t, b, g]) => {
        if (cancelled) return
        setTxs(t)
        setBudgets(b.data ?? [])
        setGoals(g.data ?? [])
        setError((b.error ?? g.error)?.message ?? null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [month, today, version])

  const cop = useMemo(() => makeCop(accounts, latestTrm?.rate), [accounts, latestTrm])
  const year = Number(month.slice(0, 4))
  const thisMonth = monthlyTotals(txs, year, categories, cop)[Number(month.slice(5)) - 1]

  // Patrimonio neto actual
  let assets = 0
  let debts = 0
  for (const a of accounts.filter((a) => !a.archived)) {
    const value = toCop(a.balance, a.currency, latestTrm?.rate)
    if (value >= 0) assets += value
    else debts += -value
  }
  const netWorth = netWorthByMonth(txs, accounts, addMonths(month, -11), month, latestTrm?.rate)

  // Gasto real por categoría este mes
  const realByCategory = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'gasto' || !t.date.startsWith(month) || !t.category_id) continue
    realByCategory.set(t.category_id, (realByCategory.get(t.category_id) ?? 0) + cop(t))
  }
  const override = new Map(budgets.map((b) => [b.category_id, b.amount]))
  const budgetRows = sortByGroup(categories.filter((c) => c.kind === 'gasto' && !c.archived))
    .map((c) => ({
      category: c,
      budget: override.get(c.id) ?? c.default_budget,
      real: realByCategory.get(c.id) ?? 0,
    }))
    .filter((r) => r.budget > 0 || r.real > 0)

  // Las categorías más cerca de su límite (o pasadas), variables primero
  const watch = budgetRows
    .filter((r) => !r.category.is_fixed)
    .map((r) => ({ ...r, ratio: r.budget > 0 ? r.real / r.budget : Infinity }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5)

  const pendingBills = budgetRows.filter((r) => r.category.is_fixed && r.real < r.budget)

  // Próximos pagos de tarjetas y préstamos con día de pago
  const dueSoon = accounts
    .filter((a) => isDebt(a.type) && !a.archived && a.due_day && a.balance < -0.5)
    .map((a) => {
      const day = String(a.due_day).padStart(2, '0')
      const dueThisMonth = `${month}-${day}` >= today
      const dueMonth = dueThisMonth ? month : addMonths(month, 1)
      // Pagada si ya hubo un traslado hacia la deuda este mes
      const paid = txs.some(
        (t) => t.type === 'traslado' && t.to_account_id === a.id && t.date.startsWith(month),
      )
      return { account: a, date: `${dueMonth}-${day}`, paid: paid && dueThisMonth }
    })
    .sort((x, y) => x.date.localeCompare(y.date))

  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  function goalProgress(g: Goal) {
    const a = accounts.find((x) => x.id === g.account_id)
    if (!a) return 0
    if (a.currency === g.currency) return a.balance
    const rate = latestTrm?.rate
    if (!rate) return 0
    return g.currency === 'COP' ? a.balance * rate : a.balance / rate
  }

  const savingsRate =
    thisMonth && thisMonth.income > 0 ? thisMonth.savings / thisMonth.income : null

  return (
    <>
      <h1>📊 Resumen</h1>
      {error && <p className="error">{error}</p>}

      <div className="card hero">
        <span className="muted small">Patrimonio neto</span>
        <div className="hero-figure">{formatMoney(assets - debts)}</div>
        <div className="small">
          <span className="muted">Tengo</span>{' '}
          <strong className="text-income">{formatMoney(assets)}</strong>
          <span className="muted"> · Debo</span>{' '}
          <strong className="text-expense">{formatMoney(debts)}</strong>
          {accounts.some((a) => a.currency === 'USD') && latestTrm && (
            <span className="muted"> · USD a {formatMoney(latestTrm.rate)}</span>
          )}
        </div>
        {netWorth.length > 1 && (
          <div className="hero-chart">
            <Lines
              data={netWorth}
              xKey="label"
              series={[{ key: 'net', label: 'Patrimonio neto', color: SERIES[0] }]}
              area
              height={160}
            />
          </div>
        )}
      </div>

      <h2 className="section-title">{formatMonth(month)}</h2>
      <div className="summary summary-4">
        <div className="card stat">
          <span className="muted small">Ingresos</span>
          <strong className="text-income">{formatMoney(thisMonth?.income ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Gastos</span>
          <strong className="text-expense">{formatMoney(thisMonth?.expenses ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Ahorro</span>
          <strong>{formatMoney(thisMonth?.savings ?? 0)}</strong>
          <span className="muted small">
            {savingsRate == null ? 'Sin ingresos aún' : `${formatPct(savingsRate)} del ingreso`}
            {settings && ` · meta ${formatPct(settings.savings_pct)}`}
          </span>
        </div>
        <div className="card stat">
          <span className="muted small">Necesidades / Deseos</span>
          <strong>
            {thisMonth && thisMonth.income > 0
              ? `${formatPct(thisMonth.needs / thisMonth.income)} / ${formatPct(thisMonth.wants / thisMonth.income)}`
              : '—'}
          </strong>
          {settings && (
            <span className="muted small">
              meta {formatPct(settings.needs_pct)} / {formatPct(settings.wants_pct)}
            </span>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="row">
            <h2>Presupuesto</h2>
            <span className="spacer" />
            <Link to="/presupuesto" className="small">
              Ver todo
            </Link>
          </div>
          {watch.length === 0 ? (
            <p className="muted small">Define tu presupuesto para ver aquí cómo vas.</p>
          ) : (
            watch.map((r) => {
              const ratio = r.budget > 0 ? r.real / r.budget : 1.01
              return (
                <div key={r.category.id} className="mini-row">
                  <div className="budget-foot small">
                    <strong className="text-h">{r.category.name}</strong>
                    <span className={ratio > 1 ? 'text-expense' : 'muted'}>
                      {formatMoney(r.real)} / {formatMoney(r.budget)}
                    </span>
                  </div>
                  <div className="meter budget-meter">
                    <div
                      className={`meter-fill${ratio > 1 ? ' over' : ratio > 0.85 ? ' warn' : ''}`}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="card">
          <h2>Próximos pagos</h2>
          {dueSoon.length === 0 && pendingBills.length === 0 && (
            <p className="muted small">No tienes pagos pendientes registrados.</p>
          )}
          {dueSoon.map(({ account: a, date, paid }) => {
            const days = Math.round(
              (new Date(`${date}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) /
                86400000,
            )
            return (
              <div key={a.id} className="mini-row budget-foot small">
                <span>
                  <strong className="text-h">{a.name}</strong>
                  <span className="muted"> · {formatDay(date)}</span>
                </span>
                {paid ? (
                  <span className="tag tag-paid">Pagado</span>
                ) : (
                  <span className={days <= 3 ? 'warning-text' : 'muted'}>
                    {a.min_payment ? `${formatMoney(a.min_payment, a.currency)} · ` : ''}
                    {days === 0 ? 'hoy' : `en ${days} ${days === 1 ? 'día' : 'días'}`}
                  </span>
                )}
              </div>
            )
          })}
          {pendingBills.length > 0 && (
            <>
              <h3 className="mini-title">Facturas fijas pendientes</h3>
              {pendingBills.map((r) => (
                <div key={r.category.id} className="mini-row budget-foot small">
                  <strong className="text-h">{r.category.name}</strong>
                  <button
                    className="tag tag-pending"
                    onClick={() =>
                      setPreset({
                        type: 'gasto',
                        categoryId: r.category.id,
                        amount: r.budget - r.real,
                      })
                    }
                  >
                    {r.real > 0 ? 'Faltan ' : ''}
                    {formatMoney(r.budget - r.real)} · registrar
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <div className="row">
            <h2>Metas</h2>
            <span className="spacer" />
            <Link to="/ahorros" className="small">
              Ver todo
            </Link>
          </div>
          {goals.length === 0 ? (
            <p className="muted small">Aún no tienes metas. Créalas en Ahorros y metas.</p>
          ) : (
            goals.map((g) => {
              const current = goalProgress(g)
              const pct = Math.max(0, Math.min(1, current / g.target_amount))
              return (
                <div key={g.id} className="mini-row">
                  <div className="budget-foot small">
                    <strong className="text-h">{g.name}</strong>
                    <span className="muted">
                      {formatMoney(current, g.currency)} /{' '}
                      {formatMoney(g.target_amount, g.currency)}
                    </span>
                  </div>
                  <div className="meter budget-meter">
                    <div className="meter-fill" style={{ width: `${pct * 100}%` }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="card">
          <div className="row">
            <h2>Últimos movimientos</h2>
            <span className="spacer" />
            <Link to="/movimientos" className="small">
              Ver todo
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted small">Aún no hay movimientos.</p>
          ) : (
            recent.map((t) => (
              <div key={t.id} className="mini-row budget-foot small">
                <span className="mini-main">
                  <strong className="text-h">
                    {t.type === 'traslado' ? 'Traslado' : categoryName.get(t.category_id ?? '')}
                  </strong>
                  <span className="muted">
                    {' '}
                    · {formatDay(t.date)} · {t.description ?? accountName.get(t.account_id)}
                  </span>
                </span>
                <strong className={`tx-${t.type}`}>
                  {t.type === 'gasto' ? '−' : t.type === 'ingreso' ? '+' : ''}
                  {formatMoney(t.amount, accounts.find((a) => a.id === t.account_id)?.currency)}
                </strong>
              </div>
            ))
          )}
        </div>
      </div>

      {preset && <TransactionForm preset={preset} onClose={() => setPreset(null)} />}
    </>
  )
}
