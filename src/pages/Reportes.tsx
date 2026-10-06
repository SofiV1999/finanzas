import { useEffect, useMemo, useState } from 'react'
import ExportButton from '../components/ExportButton'
import { ChartCard, GroupedColumns, HorizontalBars, Lines } from '../components/charts'
import { SERIES } from '../lib/chartColors'
import { useData } from '../lib/data'
import { currentMonthIso, formatMonth, monthEnd } from '../lib/dates'
import { formatMoney, formatPct } from '../lib/format'
import {
  MONTHS_SHORT,
  expensesByCategory,
  fetchTransactions,
  makeCop,
  monthlyTotals,
  netWorthByMonth,
} from '../lib/reports'
import type { Transaction } from '../lib/types'

const TOP_CATEGORIES = 10

export default function Reportes() {
  const { accounts, categories, settings, latestTrm, version } = useData()
  const thisYear = Number(currentMonthIso().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  // '' = año completo; '01'..'12' = un mes
  const [categoryMonth, setCategoryMonth] = useState('')
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Todo hasta el fin del año elegido: el patrimonio necesita la historia completa
    fetchTransactions(undefined, `${year}-12-31`)
      .then((rows) => !cancelled && (setTxs(rows), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [year, version])

  const cop = useMemo(() => makeCop(accounts, latestTrm?.rate), [accounts, latestTrm])
  const months = useMemo(
    () => monthlyTotals(txs, year, categories, cop),
    [txs, year, categories, cop],
  )
  const prevMonths = useMemo(
    () => monthlyTotals(txs, year - 1, categories, cop),
    [txs, year, categories, cop],
  )

  // Solo meses que ya pasaron o están en curso
  const lastMonth =
    year < thisYear ? 12 : year === thisYear ? Number(currentMonthIso().slice(5)) : 0
  const elapsed = months.slice(0, lastMonth)

  const income = elapsed.reduce((s, m) => s + m.income, 0)
  const expenses = elapsed.reduce((s, m) => s + m.expenses, 0)
  const savings = elapsed.reduce((s, m) => s + m.savings, 0)

  const savingsRate = elapsed.map((m) => ({
    label: m.label,
    rate: m.income > 0 ? m.savings / m.income : null,
  }))

  const catFrom = categoryMonth ? `${year}-${categoryMonth}-01` : `${year}-01-01`
  const catTo = categoryMonth ? monthEnd(`${year}-${categoryMonth}`) : `${year}-12-31`
  const byCategory = expensesByCategory(txs, catFrom, catTo, categories, cop)
  const topCategories =
    byCategory.length > TOP_CATEGORIES
      ? [
          ...byCategory.slice(0, TOP_CATEGORIES),
          {
            id: 'otras',
            name: 'Otras',
            total: byCategory.slice(TOP_CATEGORIES).reduce((s, c) => s + c.total, 0),
          },
        ]
      : byCategory
  const categoryTotal = byCategory.reduce((s, c) => s + c.total, 0)

  const netWorth = lastMonth
    ? netWorthByMonth(
        txs,
        accounts,
        `${year}-01`,
        `${year}-${String(lastMonth).padStart(2, '0')}`,
        latestTrm?.rate,
      )
    : []

  const hasPrev = prevMonths.some((m) => m.expenses > 0)
  const comparison = MONTHS_SHORT.map((label, i) => ({
    label,
    current: i < lastMonth ? months[i].expenses : null,
    previous: hasPrev ? prevMonths[i].expenses : null,
  }))

  const incomeSeries = [
    { key: 'income', label: 'Ingresos', color: SERIES[0] },
    { key: 'expenses', label: 'Gastos', color: SERIES[1] },
  ]
  const comparisonSeries = [
    { key: 'current', label: String(year), color: SERIES[0] },
    { key: 'previous', label: String(year - 1), color: SERIES[1] },
  ]

  return (
    <>
      <h1>📈 Reportes</h1>
      <div className="row month-nav">
        <button
          className="btn btn-ghost"
          onClick={() => setYear(year - 1)}
          aria-label="Año anterior"
        >
          ‹
        </button>
        <strong className="month-title">{year}</strong>
        <button
          className="btn btn-ghost"
          onClick={() => setYear(year + 1)}
          disabled={year >= thisYear}
          aria-label="Año siguiente"
        >
          ›
        </button>
        <span className="spacer" />
        <ExportButton
          range={{ from: `${year}-01-01`, to: `${year}-12-31`, fileLabel: String(year) }}
          label={`Exportar ${year} a Excel`}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <div className="summary summary-4">
            <div className="card stat">
              <span className="muted small">Ingresos {year}</span>
              <strong className="text-income">{formatMoney(income)}</strong>
            </div>
            <div className="card stat">
              <span className="muted small">Gastos {year}</span>
              <strong className="text-expense">{formatMoney(expenses)}</strong>
            </div>
            <div className="card stat">
              <span className="muted small">Ahorro {year}</span>
              <strong>{formatMoney(savings)}</strong>
            </div>
            <div className="card stat">
              <span className="muted small">Tasa de ahorro</span>
              <strong>{income > 0 ? formatPct(savings / income) : '—'}</strong>
              {settings && (
                <span className="muted small">Meta {formatPct(settings.savings_pct)}</span>
              )}
            </div>
          </div>

          <div className="stack">
            <ChartCard
              title="Ingresos y gastos por mes"
              subtitle="En pesos; lo que está en USD con la TRM del día de cada movimiento"
              series={incomeSeries}
              table={
                <MoneyTable
                  rows={elapsed.map((m) => [m.label, m.income, m.expenses, m.income - m.expenses])}
                  headers={['Mes', 'Ingresos', 'Gastos', 'Balance']}
                />
              }
            >
              <GroupedColumns data={elapsed} xKey="label" series={incomeSeries} />
            </ChartCard>

            <div className="chart-grid">
              <ChartCard
                title="Tasa de ahorro por mes"
                subtitle="Ingreso menos necesidades y deseos, sobre el ingreso"
                table={
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th className="right">Tasa de ahorro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savingsRate.map((m) => (
                        <tr key={m.label}>
                          <td>{m.label}</td>
                          <td className="right">{m.rate == null ? '—' : formatPct(m.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <Lines
                  data={savingsRate}
                  xKey="label"
                  series={[{ key: 'rate', label: 'Tasa de ahorro', color: SERIES[2] }]}
                  percent
                  target={
                    settings
                      ? {
                          value: settings.savings_pct,
                          label: `Meta ${formatPct(settings.savings_pct)}`,
                        }
                      : undefined
                  }
                />
              </ChartCard>

              <ChartCard
                title="Patrimonio neto"
                subtitle={`Al cierre de cada mes · USD a la TRM de hoy${latestTrm ? ` (${formatMoney(latestTrm.rate)})` : ''}`}
                table={
                  <MoneyTable
                    rows={netWorth.map((p) => [p.label, p.assets, p.debts, p.net])}
                    headers={['Mes', 'Tengo', 'Debo', 'Patrimonio']}
                  />
                }
              >
                <Lines
                  data={netWorth}
                  xKey="label"
                  series={[{ key: 'net', label: 'Patrimonio neto', color: SERIES[0] }]}
                  area
                />
              </ChartCard>
            </div>

            <ChartCard
              title="¿En qué se va la plata?"
              subtitle={
                <span className="row category-period">
                  <select
                    className="inline-input base-select"
                    value={categoryMonth}
                    onChange={(e) => setCategoryMonth(e.target.value)}
                    aria-label="Período"
                  >
                    <option value="">Todo {year}</option>
                    {MONTHS_SHORT.slice(0, lastMonth).map((_, i) => {
                      const mm = String(i + 1).padStart(2, '0')
                      return (
                        <option key={mm} value={mm}>
                          {formatMonth(`${year}-${mm}`)}
                        </option>
                      )
                    })}
                  </select>
                  <span>Total {formatMoney(categoryTotal)}</span>
                </span>
              }
              table={
                <table className="table">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th className="right">Gasto</th>
                      <th className="right">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td className="right">{formatMoney(c.total)}</td>
                        <td className="right">
                          {formatPct(categoryTotal ? c.total / categoryTotal : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              {topCategories.length === 0 ? (
                <p className="muted">No hay gastos en este período.</p>
              ) : (
                <HorizontalBars data={topCategories} labelKey="name" valueKey="total" />
              )}
            </ChartCard>

            <ChartCard
              title="Gastos: comparación entre años"
              subtitle={
                hasPrev ? `${year} vs. ${year - 1}` : `Aún no hay gastos registrados en ${year - 1}`
              }
              series={hasPrev ? comparisonSeries : undefined}
              table={
                <MoneyTable
                  rows={comparison.map((m) => [m.label, m.current, m.previous])}
                  headers={['Mes', String(year), String(year - 1)]}
                />
              }
            >
              <Lines
                data={comparison}
                xKey="label"
                series={hasPrev ? comparisonSeries : comparisonSeries.slice(0, 1)}
              />
            </ChartCard>
          </div>
        </>
      )}
    </>
  )
}

function MoneyTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={h} className={i > 0 ? 'right' : undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])}>
            {r.map((v, i) => (
              <td key={i} className={i > 0 ? 'right tabular' : undefined}>
                {typeof v === 'number' ? formatMoney(v) : (v ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
