import { useState } from 'react'
import { toCop, useData } from '../lib/data'
import {
  amortization,
  analyzeLumpSum,
  monthLabelFromNow,
  monthlyRate,
  simulate,
  type DebtInput,
  type Strategy,
  type StrategyResult,
} from '../lib/finance'
import { formatMoney } from '../lib/format'
import { isDebt, type AccountWithBalance } from '../lib/types'
import Modal from './Modal'

const EXTRA_KEY = 'finanzas:pago-extra'

const strategyInfo: Record<Strategy, { title: string; detail: string }> = {
  minimos: { title: 'Solo mínimos', detail: 'Cada deuda paga solo su cuota o pago mínimo.' },
  bola_de_nieve: {
    title: 'Bola de nieve',
    detail: 'El extra va a la deuda más pequeña; al pagarla, su cuota pasa a la siguiente.',
  },
  avalancha: {
    title: 'Avalancha',
    detail: 'El extra va a la deuda con mayor tasa; es la que menos intereses paga.',
  },
}

function readExtra() {
  try {
    return localStorage.getItem(EXTRA_KEY) ?? ''
  } catch {
    return ''
  }
}

const groupDigits = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export default function DebtPlan() {
  const { accounts, latestTrm } = useData()
  const [extraDigits, setExtraDigits] = useState(readExtra)
  const [selected, setSelected] = useState<Strategy>('avalancha')
  const [tableFor, setTableFor] = useState<AccountWithBalance | null>(null)

  const active = accounts.filter((a) => isDebt(a.type) && !a.archived && a.balance < -0.5)
  const missingPayment = active.filter((a) => !a.min_payment)

  // Todo en pesos para poder comparar y sumar deudas en monedas distintas
  const debts: DebtInput[] = active
    .filter((a) => a.min_payment)
    .map((a) => ({
      id: a.id,
      name: a.name,
      balance: toCop(-a.balance, a.currency, latestTrm?.rate),
      annualEa: a.annual_rate,
      minPayment: toCop(a.min_payment!, a.currency, latestTrm?.rate),
    }))

  const extra = Number(extraDigits || 0)
  const results = (['minimos', 'bola_de_nieve', 'avalancha'] as Strategy[]).map((s) =>
    simulate(debts, s, extra),
  )

  function changeExtra(value: string) {
    const digits = value.replace(/\D/g, '')
    setExtraDigits(digits)
    try {
      localStorage.setItem(EXTRA_KEY, digits)
    } catch {
      // Sin almacenamiento local: el valor no se recuerda
    }
  }

  if (active.length === 0) return null

  const totalPayment = debts.reduce((s, d) => s + d.minPayment, 0)
  const nextInterest = debts.reduce((s, d) => s + d.balance * monthlyRate(d.annualEa), 0)
  const baseline = results[0]
  const best = results
    .filter((r) => !r.neverPaysOff)
    .sort((a, b) => a.totalInterest - b.totalInterest)[0]
  const chosen = results.find((r) => r.strategy === selected)!
  const debtById = new Map(debts.map((d) => [d.id, d]))

  return (
    <div className="card">
      <h2>Plan para salir de deudas</h2>
      <div className="summary plan-summary">
        <div className="stat">
          <span className="muted small">Pagos mensuales</span>
          <strong>{formatMoney(totalPayment)}</strong>
        </div>
        <div className="stat">
          <span className="muted small">Intereses estimados este mes</span>
          <strong className="text-expense">{formatMoney(nextInterest)}</strong>
        </div>
        <div className="stat">
          <label className="muted small" htmlFor="extra-payment">
            Pago extra mensual
          </label>
          <input
            id="extra-payment"
            className="inline-input amount-input extra-input"
            inputMode="numeric"
            placeholder="0"
            value={extraDigits ? groupDigits.format(extra) : ''}
            onChange={(e) => changeExtra(e.target.value)}
          />
        </div>
      </div>

      {missingPayment.length > 0 && (
        <p className="small warning-text">
          Sin pago mensual, no entran al plan: {missingPayment.map((a) => a.name).join(', ')}.
          Edítalas en la lista de arriba y agrega la cuota o el pago mínimo.
        </p>
      )}

      {debts.length > 0 && (
        <>
          <div className="strategy-grid">
            {results.map((r) => (
              <StrategyCard
                key={r.strategy}
                result={r}
                baseline={baseline}
                isBest={
                  r.strategy !== 'minimos' &&
                  !r.neverPaysOff &&
                  best != null &&
                  r.totalInterest - best.totalInterest < 1
                }
                isSelected={selected === r.strategy}
                onSelect={() => setSelected(r.strategy)}
              />
            ))}
          </div>
          {extra === 0 && (
            <p className="muted small">
              Sin pago extra, bola de nieve y avalancha solo reasignan la cuota de cada deuda que
              terminas de pagar. Escribe un pago extra para ver la diferencia.
            </p>
          )}

          <h3 className="plan-subtitle">Orden de pago · {strategyInfo[selected].title}</h3>
          <div className="payoff-list">
            {chosen.order.map((id, i) => {
              const d = debtById.get(id)!
              const account = active.find((a) => a.id === id)!
              const month = chosen.payoffMonth[id]
              return (
                <div key={id} className="payoff-row">
                  <span className="payoff-rank">{i + 1}</span>
                  <div className="grow">
                    <strong>{d.name}</strong>
                    <span className="muted small">
                      {' '}
                      · {formatMoney(d.balance)}
                      {d.annualEa != null && ` · ${(d.annualEa * 100).toFixed(1)}% E.A.`}
                    </span>
                    <div className="muted small">
                      {month == null
                        ? 'No se alcanza a pagar con estos pagos'
                        : `Pagada en ${month} ${month === 1 ? 'mes' : 'meses'} (${monthLabelFromNow(month)})`}
                    </div>
                  </div>
                  <button className="link-btn" onClick={() => setTableFor(account)}>
                    Tabla de pagos
                  </button>
                </div>
              )
            })}
          </div>

          <LumpSum
            debts={debts}
            strategy={selected}
            extra={extra}
            names={new Map(debts.map((d) => [d.id, d.name]))}
          />
        </>
      )}

      {tableFor && <AmortizationModal account={tableFor} onClose={() => setTableFor(null)} />}
    </div>
  )
}

const LUMP_KEY = 'finanzas:abono-unico'

function readLump() {
  try {
    return localStorage.getItem(LUMP_KEY) ?? ''
  } catch {
    return ''
  }
}

// Simulador de un abono único a capital: a qué deuda conviene ponerlo
function LumpSum({
  debts,
  strategy,
  extra,
  names,
}: {
  debts: DebtInput[]
  strategy: Strategy
  extra: number
  names: Map<string, string>
}) {
  const [digits, setDigits] = useState(readLump)
  const amount = Number(digits || 0)

  function change(value: string) {
    const next = value.replace(/\D/g, '')
    setDigits(next)
    try {
      localStorage.setItem(LUMP_KEY, next)
    } catch {
      // Sin almacenamiento local: el valor no se recuerda
    }
  }

  const analysis = amount > 0 ? analyzeLumpSum(debts, strategy, extra, amount) : null
  const best = analysis?.options[0]
  const allocationSaved = analysis
    ? analysis.base.totalInterest - analysis.allocationResult.totalInterest
    : 0
  const split = analysis && analysis.allocation.length > 1
  const months = (n: number | null) =>
    n == null ? '—' : n <= 0 ? 'igual' : `${n} ${n === 1 ? 'mes' : 'meses'} antes`

  return (
    <div className="lump">
      <h3 className="plan-subtitle">Abono único a capital</h3>
      <p className="muted small">
        Si hoy abonas un monto extra, ¿a qué deuda conviene? Se calcula con el plan seleccionado
        arriba ({strategyInfo[strategy].title.toLowerCase()}
        {extra > 0 ? ` + ${formatMoney(extra)} extra al mes` : ''}) y suponiendo que el banco reduce
        el plazo, no la cuota.
      </p>
      <div className="row lump-input">
        <label htmlFor="lump-amount" className="muted small">
          Monto del abono
        </label>
        <input
          id="lump-amount"
          className="inline-input amount-input"
          inputMode="numeric"
          placeholder="0"
          value={digits ? groupDigits.format(amount) : ''}
          onChange={(e) => change(e.target.value)}
        />
      </div>

      {analysis?.base.neverPaysOff && (
        <p className="small warning-text">
          Con los pagos actuales alguna deuda nunca se termina de pagar, así que los ahorros se
          calculan sobre 50 años. Revisa los pagos mensuales o agrega un pago extra.
        </p>
      )}

      {analysis && best && (
        <>
          <div className="lump-reco card">
            {split ? (
              <>
                <strong>Recomendación:</strong> repártelo así:{' '}
                {analysis.allocation
                  .map((a) => `${names.get(a.id)} ${formatMoney(a.amount)}`)
                  .join(' · ')}
                . Te ahorras <strong className="text-income">{formatMoney(allocationSaved)}</strong>{' '}
                en intereses ({formatMoney(allocationSaved - best.interestSaved)} más que ponerlo
                todo en {names.get(best.id)}).
              </>
            ) : (
              <>
                <strong>Recomendación:</strong> abónalo a <strong>{names.get(best.id)}</strong>. Te
                ahorras <strong className="text-income">{formatMoney(best.interestSaved)}</strong>{' '}
                en intereses
                {best.monthsSaved > 0 && ` y sales de todas tus deudas ${months(best.monthsSaved)}`}
                .
              </>
            )}
          </div>
          <div className="table-wrap">
            <table className="table lump-table">
              <thead>
                <tr>
                  <th>Si lo abonas a…</th>
                  <th className="right">Tasa</th>
                  <th className="right">Se abona</th>
                  <th className="right">Intereses que ahorras</th>
                  <th className="right">Esa deuda se paga</th>
                  <th className="right">Sales de deudas</th>
                </tr>
              </thead>
              <tbody>
                {analysis.options.map((o, i) => {
                  const d = debts.find((x) => x.id === o.id)!
                  return (
                    <tr key={o.id}>
                      <td>
                        {names.get(o.id)}{' '}
                        {i === 0 && <span className="tag tag-paid">Mejor opción</span>}
                      </td>
                      <td className="right">
                        {d.annualEa != null ? `${(d.annualEa * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="right tabular">
                        {formatMoney(o.applied)}
                        {o.applied < amount && <div className="muted small">saldo completo</div>}
                      </td>
                      <td className="right tabular text-income">{formatMoney(o.interestSaved)}</td>
                      <td className="right">{months(o.ownMonthsSaved)}</td>
                      <td className="right">{months(o.monthsSaved)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            La mejor deuda depende del plan: con solo mínimos, la cuota de una deuda pagada no pasa
            a las demás, así que a veces conviene más una deuda larga que la de mayor tasa. Con bola
            de nieve o avalancha, esa cuota se reasigna.
          </p>
        </>
      )}
    </div>
  )
}

function StrategyCard({
  result: r,
  baseline,
  isBest,
  isSelected,
  onSelect,
}: {
  result: StrategyResult
  baseline: StrategyResult
  isBest: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const savedInterest = baseline.totalInterest - r.totalInterest
  const savedMonths = baseline.months - r.months
  return (
    <button
      className={`strategy-card${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <div className="row strategy-head">
        <strong>{strategyInfo[r.strategy].title}</strong>
        {isBest && <span className="tag tag-paid">Menos intereses</span>}
      </div>
      {r.neverPaysOff ? (
        <p className="text-expense small">
          Con estos pagos alguna deuda nunca se termina de pagar: la cuota no cubre los intereses.
        </p>
      ) : (
        <>
          <div className="strategy-figure">
            {r.months} {r.months === 1 ? 'mes' : 'meses'}
          </div>
          <div className="muted small">Libre de deudas en {monthLabelFromNow(r.months)}</div>
          <div className="small">
            Intereses: <strong className="text-expense">{formatMoney(r.totalInterest)}</strong>
          </div>
          {r.strategy !== 'minimos' && !baseline.neverPaysOff && savedInterest > 0.5 && (
            <div className="small text-income">
              Ahorras {formatMoney(savedInterest)}
              {savedMonths > 0 && ` y ${savedMonths} ${savedMonths === 1 ? 'mes' : 'meses'}`}
            </div>
          )}
        </>
      )}
      <p className="muted small strategy-detail">{strategyInfo[r.strategy].detail}</p>
    </button>
  )
}

function AmortizationModal({
  account,
  onClose,
}: {
  account: AccountWithBalance
  onClose: () => void
}) {
  const owed = -account.balance
  const payment = account.min_payment ?? 0
  const { rows, neverPaysOff } = amortization(owed, account.annual_rate, payment)
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0)
  const money = (v: number) => formatMoney(v, account.currency)

  return (
    <Modal title={`Tabla de pagos · ${account.name}`} onClose={onClose}>
      <p className="muted small">
        Desde el saldo actual ({money(owed)}) pagando {money(payment)} al mes
        {account.annual_rate != null
          ? ` con ${(account.annual_rate * 100).toFixed(2)}% E.A. (${(monthlyRate(account.annual_rate) * 100).toFixed(2)}% mensual).`
          : ' sin tasa de interés registrada.'}
      </p>
      {neverPaysOff ? (
        <p className="error">
          Con este pago la deuda no baja: la cuota no alcanza a cubrir los intereses del mes.
        </p>
      ) : (
        <p className="small">
          Terminas en <strong>{rows.length} meses</strong> ({monthLabelFromNow(rows.length)}) y
          pagas <strong className="text-expense">{money(totalInterest)}</strong> en intereses.
        </p>
      )}
      <div className="table-wrap amort-wrap">
        <table className="table amort-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="right">Saldo inicial</th>
              <th className="right">Interés</th>
              <th className="right">Abono capital</th>
              <th className="right">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{monthLabelFromNow(r.month)}</td>
                <td className="right">{money(r.opening)}</td>
                <td className="right text-expense">{money(r.interest)}</td>
                <td className="right">{money(r.principal)}</td>
                <td className="right">{money(r.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
