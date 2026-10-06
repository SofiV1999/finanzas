import { useEffect, useMemo, useState } from 'react'
import RecurringManager from '../components/RecurringManager'
import TransactionForm from '../components/TransactionForm'
import { toCop, useData } from '../lib/data'
import { currentMonthIso, formatDay, formatMonth, monthEnd } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { cashFlow, transferLabel } from '../lib/reports'
import { supabase } from '../lib/supabase'
import type { Transaction, TransactionType } from '../lib/types'

type Period = 'mes' | 'año'

export default function Movimientos() {
  const { accounts, categories, latestTrm, version } = useData()
  const [period, setPeriod] = useState<Period>('mes')
  const [month, setMonth] = useState(currentMonthIso())
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('')
  const [accountFilter, setAccountFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const year = month.slice(0, 4)
  const from = period === 'mes' ? `${month}-01` : `${year}-01-01`
  const to = period === 'mes' ? monthEnd(month) : `${year}-12-31`

  useEffect(() => {
    let cancelled = false
    let query = supabase
      .from('transactions')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (typeFilter) query = query.eq('type', typeFilter)
    if (categoryFilter) query = query.eq('category_id', categoryFilter)
    if (accountFilter) {
      query = query.or(`account_id.eq.${accountFilter},to_account_id.eq.${accountFilter}`)
    }
    query.then(({ data, error }) => {
      if (cancelled) return
      setError(error?.message ?? null)
      setRows(data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [from, to, typeFilter, categoryFilter, accountFilter, version])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const term = search.trim().toLowerCase()
  const filtered = term
    ? rows.filter((t) =>
        [t.description, categoryById.get(t.category_id ?? '')?.name].some((text) =>
          text?.toLowerCase().includes(term),
        ),
      )
    : rows

  // Monto del movimiento en pesos, usando la TRM con la que se registró
  const cop = (t: Transaction) => {
    const currency = accountById.get(t.account_id)?.currency ?? 'COP'
    return toCop(t.amount, currency, t.fx_rate ?? latestTrm?.rate)
  }
  const flow = cashFlow(filtered, accountById, latestTrm?.rate)

  // Agrupar por día
  const byDay = new Map<string, Transaction[]>()
  for (const t of filtered) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t])

  const expenseCategories = categories.filter((c) => c.kind === 'gasto')
  const incomeCategories = categories.filter((c) => c.kind === 'ingreso')

  return (
    <>
      <h1>🧾 Movimientos</h1>
      <p className="muted">Ingresos, gastos, pagos y traslados.</p>

      <RecurringManager />

      <div className="card filters">
        <div className="field">
          <label htmlFor="f-period">Período</label>
          <select
            id="f-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="mes">Mes</option>
            <option value="año">Año completo</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-month">{period === 'mes' ? 'Mes' : 'Año'}</label>
          {period === 'mes' ? (
            <input
              id="f-month"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          ) : (
            <input
              id="f-month"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) =>
                e.target.value.length === 4 && setMonth(`${e.target.value}-${month.slice(5)}`)
              }
            />
          )}
        </div>
        <div className="field">
          <label htmlFor="f-type">Tipo</label>
          <select
            id="f-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType | '')}
          >
            <option value="">Todos</option>
            <option value="gasto">Gastos</option>
            <option value="ingreso">Ingresos</option>
            <option value="traslado">Traslados</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-account">Cuenta</label>
          <select
            id="f-account"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-category">Categoría</label>
          <select
            id="f-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas</option>
            <optgroup label="Gastos">
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Ingresos">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-search">Buscar</label>
          <input
            id="f-search"
            placeholder="Descripción o categoría"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="summary summary-4">
        <div className="card stat">
          <span className="muted small">Ingresos</span>
          <strong className="text-income">{formatMoney(flow.income)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Gastos</span>
          <strong className="text-expense">{formatMoney(flow.expenses)}</strong>
          {flow.expensesOnCredit > 0 && (
            <span className="muted small">
              {formatMoney(flow.expensesOnCredit)} con tarjeta o préstamo
            </span>
          )}
        </div>
        <div className="card stat">
          <span className="muted small">Pagos a deudas</span>
          <strong>{formatMoney(flow.debtPayments)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Flujo de caja</span>
          <strong className={flow.net < 0 ? 'text-expense' : 'text-income'}>
            {formatMoney(flow.net)}
          </strong>
          <span className="muted small">Lo que entró menos lo que salió de tus cuentas</span>
        </div>
      </div>
      <p className="muted small">
        {period === 'mes' ? formatMonth(month) : `Año ${year}`} · {filtered.length} movimientos ·
        montos en USD con la TRM del día del movimiento. Flujo de caja = ingresos − gastos pagados
        con tus cuentas − pagos a deudas (las compras con tarjeta salen de caja cuando pagas la
        tarjeta, así no se cuentan dos veces). Los traslados entre tus cuentas no cuentan.
      </p>

      {error && <p className="error">{error}</p>}

      {!loading && filtered.length === 0 ? (
        <div className="card empty">
          <p>No hay movimientos en este período.</p>
          <p className="muted small">Usa el botón “+ Registrar” para anotar el primero.</p>
        </div>
      ) : (
        <div className="card tx-list">
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day}>
              <div className="tx-day">{formatDay(day)}</div>
              {items.map((t) => {
                const account = accountById.get(t.account_id)
                const toAccount = t.to_account_id ? accountById.get(t.to_account_id) : undefined
                const category = t.category_id ? categoryById.get(t.category_id) : undefined
                const currency = account?.currency ?? 'COP'
                const sign = t.type === 'gasto' ? '−' : t.type === 'ingreso' ? '+' : ''
                return (
                  <button key={t.id} className="tx-row" onClick={() => setEditing(t)}>
                    <div className="tx-main">
                      <strong>
                        {t.type === 'traslado'
                          ? transferLabel(t, accountById)
                          : (category?.name ?? 'Sin categoría')}
                        {t.recurring_id && (
                          <span className="muted small" title="Movimiento programado">
                            {' '}
                            🔁
                          </span>
                        )}
                      </strong>
                      <span className="muted small">
                        {t.description && `${t.description} · `}
                        {account?.name}
                        {toAccount && ` → ${toAccount.name}`}
                      </span>
                    </div>
                    <div className="tx-amount">
                      <strong className={`tx-${t.type}`}>
                        {sign}
                        {formatMoney(t.amount, currency)}
                      </strong>
                      {currency === 'USD' && (
                        <span className="muted small">≈ {formatMoney(cop(t))}</span>
                      )}
                      {t.to_amount && toAccount && (
                        <span className="muted small">
                          → {formatMoney(t.to_amount, toAccount.currency)}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {editing && <TransactionForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
