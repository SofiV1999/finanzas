import { useEffect, useState, type FormEvent } from 'react'
import ExportButton from '../components/ExportButton'
import RemindersCard from '../components/RemindersCard'
import { MONTH_NAMES, isInUseError } from '../lib/budget'
import { todayIso } from '../lib/dates'
import { useData } from '../lib/data'
import { isIOS, isStandalone, useInstallPrompt } from '../lib/install'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import { fetchLatestTrm, type Trm } from '../lib/trm'
import {
  budgetGroupLabels,
  type BudgetGroup,
  type Category,
  type CategoryKind,
  type Currency,
  type Settings,
  sortByGroup,
} from '../lib/types'

export default function Configuracion() {
  const { settings, categories, error, refresh } = useData()

  return (
    <>
      <h1>⚙️ Configuración</h1>
      <p className="muted">Salario, metas 50/30/20 y categorías.</p>
      {error && <p className="error">No se pudieron cargar los datos: {error}</p>}
      <div className="stack">
        <InstallCard />
        {settings && <SettingsCard settings={settings} onSaved={refresh} />}
        <CategoriesCard
          title="Categorías de gastos"
          kind="gasto"
          categories={sortByGroup(categories.filter((c) => c.kind === 'gasto'))}
          onChange={refresh}
        />
        <CategoriesCard
          title="Categorías de ingresos"
          kind="ingreso"
          categories={categories.filter((c) => c.kind === 'ingreso')}
          onChange={refresh}
        />
        <RemindersCard />
        <div className="card">
          <h2>📊 Exportar a Excel</h2>
          <p className="muted small">
            Descarga todo tu historial: movimientos, resumen por mes, cuentas, presupuesto y metas.
            Sirve también como copia de seguridad.
          </p>
          <div className="row">
            <ExportButton
              range={{ fileLabel: `todo-${todayIso()}` }}
              label="Descargar todo"
              className="btn"
            />
          </div>
        </div>
      </div>
    </>
  )
}

// 0.3 -> "30" (evita 30.000000000000004)
const toPctInput = (v: number) => String(Math.round(v * 10000) / 100)

function InstallCard() {
  const { canPrompt, install } = useInstallPrompt()
  if (isStandalone()) {
    return (
      <div className="card install-card">
        <h2>📱 App en tu celular</h2>
        <p className="muted small">Estás usando la app instalada ✓</p>
      </div>
    )
  }
  return (
    <div className="card install-card">
      <h2>📱 Instalar en tu celular</h2>
      <p className="muted small">
        Queda en la pantalla de inicio con su ícono, abre a pantalla completa y carga más rápido.
      </p>
      {canPrompt ? (
        <button className="btn" onClick={install}>
          Instalar app
        </button>
      ) : isIOS() ? (
        <ol className="small install-steps">
          <li>
            Abre esta página en <strong>Safari</strong>.
          </li>
          <li>
            Toca <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).
          </li>
          <li>
            Elige <strong>Agregar a inicio</strong> y luego <strong>Agregar</strong>.
          </li>
        </ol>
      ) : (
        <ol className="small install-steps">
          <li>
            En <strong>Chrome</strong> (Android), abre el menú <strong>⋮</strong>.
          </li>
          <li>
            Elige <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
          </li>
          <li>En el computador, usa el ícono de instalar en la barra de direcciones.</li>
        </ol>
      )}
    </div>
  )
}

function SettingsCard({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [currency, setCurrency] = useState<Currency>(settings.salary_currency)
  const [salary, setSalary] = useState(String(settings.monthly_salary))
  const [planningRate, setPlanningRate] = useState(String(settings.planning_fx_rate ?? ''))
  // Los porcentajes se editan como números enteros (50 = 50%)
  const [needs, setNeeds] = useState(toPctInput(settings.needs_pct))
  const [wants, setWants] = useState(toPctInput(settings.wants_pct))
  const [savings, setSavings] = useState(toPctInput(settings.savings_pct))
  const [trm, setTrm] = useState<Trm | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    fetchLatestTrm()
      .then(setTrm)
      .catch(() => setTrm(null))
  }, [])

  const isUsd = currency === 'USD'
  const total = Number(needs) + Number(wants) + Number(savings)
  const totalOk = Math.abs(total - 100) < 0.001
  const rateOk = !isUsd || Number(planningRate) > 0
  // Todo el presupuesto se planea en pesos
  const salaryCop = isUsd ? Number(salary) * Number(planningRate) : Number(salary)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase
      .from('settings')
      .update({
        monthly_salary: Number(salary),
        salary_currency: currency,
        planning_fx_rate: planningRate ? Number(planningRate) : null,
        needs_pct: Number(needs) / 100,
        wants_pct: Number(wants) / 100,
        savings_pct: Number(savings) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', settings.user_id)
    if (error) {
      setStatus(`Error: ${error.message}`)
      return
    }
    onSaved()
    setStatus('Guardado ✓')
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Salario y metas 50/30/20</h2>
      <div className="grid-4">
        <div className="field">
          <label htmlFor="salary-currency">Moneda del salario</label>
          <select
            id="salary-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="COP">Pesos (COP)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="salary">Salario mensual ({currency})</label>
          <input
            id="salary"
            type="number"
            min="0"
            step={isUsd ? '1' : '1000'}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
          <small className="muted">{formatMoney(Number(salary), currency)}</small>
        </div>
        {isUsd && (
          <div className="field">
            <label htmlFor="planning-rate">TRM de planeación</label>
            <input
              id="planning-rate"
              type="number"
              min="1"
              step="1"
              value={planningRate}
              onChange={(e) => setPlanningRate(e.target.value)}
            />
            <small className="muted">
              {trm ? (
                <>
                  TRM oficial hoy: {formatMoney(trm.rate)}{' '}
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => setPlanningRate(String(Math.floor(trm.rate * 0.95)))}
                  >
                    Usar 5% menos
                  </button>
                </>
              ) : (
                'Usa una tasa un poco menor a la TRM actual'
              )}
            </small>
          </div>
        )}
        {isUsd && (
          <div className="field">
            <label>Salario para planear (COP)</label>
            <div className="static-value">{rateOk ? formatMoney(salaryCop) : '—'}</div>
            <small className="muted">Salario × TRM de planeación</small>
          </div>
        )}
      </div>
      <div className="grid-4">
        <PctField
          id="needs"
          label="Necesidades %"
          value={needs}
          onChange={setNeeds}
          salaryCop={salaryCop}
        />
        <PctField
          id="wants"
          label="Deseos %"
          value={wants}
          onChange={setWants}
          salaryCop={salaryCop}
        />
        <PctField
          id="savings"
          label="Ahorro / Inversión %"
          value={savings}
          onChange={setSavings}
          salaryCop={salaryCop}
        />
      </div>
      <div className="row">
        <span className={totalOk ? 'muted' : 'error'}>
          Total: {total}% {totalOk ? '' : '— debe sumar 100%'}
        </span>
        {!rateOk && <span className="error">Falta la TRM de planeación</span>}
        <span className="spacer" />
        {status && <span className="muted">{status}</span>}
        <button className="btn" type="submit" disabled={!totalOk || !rateOk}>
          Guardar
        </button>
      </div>
    </form>
  )
}

function PctField(props: {
  id: string
  label: string
  value: string
  salaryCop: number
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="number"
        min="0"
        max="100"
        step="1"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <small className="muted">
        {formatMoney((props.salaryCop * Number(props.value)) / 100)} al mes
      </small>
    </div>
  )
}

function CategoriesCard({
  title,
  kind,
  categories,
  onChange,
}: {
  title: string
  kind: CategoryKind
  categories: Category[]
  onChange: () => void
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const visible = categories.filter((c) => showArchived || !c.archived)
  const archivedCount = categories.filter((c) => c.archived).length

  async function update(id: string, patch: Partial<Category>) {
    const { error } = await supabase.from('categories').update(patch).eq('id', id)
    setError(error ? error.message : null)
    onChange()
  }

  async function remove(c: Category) {
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) {
      setError(
        isInUseError(error.code)
          ? `"${c.name}" tiene movimientos registrados: archívala en vez de eliminarla.`
          : error.message,
      )
      return
    }
    setError(null)
    onChange()
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const maxOrder = Math.max(0, ...categories.map((c) => c.sort_order))
    const { error } = await supabase.from('categories').insert({
      name,
      kind,
      budget_group: kind === 'gasto' ? 'necesidad' : null,
      sort_order: maxOrder + 1,
    })
    if (error) {
      setError(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : error.message)
      return
    }
    setError(null)
    setNewName('')
    onChange()
  }

  return (
    <div className="card">
      <div className="row">
        <h2>{title}</h2>
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
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              {kind === 'gasto' && <th>Grupo 50/30/20</th>}
              {kind === 'gasto' && <th>Gasto fijo</th>}
              {kind === 'gasto' && <th>Frecuencia</th>}
              {kind === 'gasto' && <th>Día de pago</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className={c.archived ? 'archived' : ''}>
                <td>
                  <input
                    className="inline-input"
                    defaultValue={c.name}
                    aria-label="Nombre"
                    onBlur={(e) => {
                      const name = e.target.value.trim()
                      if (name && name !== c.name) update(c.id, { name })
                      else e.target.value = c.name
                    }}
                  />
                </td>
                {kind === 'gasto' && (
                  <td>
                    <select
                      className="inline-input"
                      value={c.budget_group ?? 'necesidad'}
                      aria-label="Grupo 50/30/20"
                      onChange={(e) =>
                        update(c.id, { budget_group: e.target.value as BudgetGroup })
                      }
                    >
                      {Object.entries(budgetGroupLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                {kind === 'gasto' && (
                  <td>
                    <input
                      type="checkbox"
                      checked={c.is_fixed}
                      aria-label="Gasto fijo"
                      onChange={(e) => update(c.id, { is_fixed: e.target.checked })}
                    />
                  </td>
                )}
                {kind === 'gasto' && (
                  <td>
                    <select
                      className="inline-input"
                      value={c.frequency === 'anual' ? String(c.due_month) : 'mensual'}
                      aria-label="Frecuencia"
                      onChange={(e) =>
                        update(
                          c.id,
                          e.target.value === 'mensual'
                            ? { frequency: 'mensual', due_month: null }
                            : { frequency: 'anual', due_month: Number(e.target.value) },
                        )
                      }
                    >
                      <option value="mensual">Mensual</option>
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={i + 1}>
                          Anual · {name}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                {kind === 'gasto' && (
                  <td>
                    {c.is_fixed || c.frequency === 'anual' ? (
                      <input
                        className="inline-input day-input"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="—"
                        aria-label="Día de pago"
                        defaultValue={c.due_day ?? ''}
                        onBlur={(e) => {
                          const raw = e.target.value.trim()
                          const day = raw === '' ? null : Number(raw)
                          if (day !== null && !(day >= 1 && day <= 31)) {
                            e.target.value = String(c.due_day ?? '')
                            return
                          }
                          if (day !== c.due_day) update(c.id, { due_day: day })
                        }}
                      />
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                )}
                <td className="right actions-cell">
                  <button
                    className="link-btn"
                    onClick={() => update(c.id, { archived: !c.archived })}
                  >
                    {c.archived ? 'Restaurar' : 'Archivar'}
                  </button>
                  <button className="link-btn danger" onClick={() => remove(c)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="row" onSubmit={add}>
        <input
          className="inline-input grow"
          placeholder="Nueva categoría"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={!newName.trim()}>
          Agregar
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted small">
        Archivar oculta la categoría para nuevos movimientos, sin borrar su historial. Eliminar solo
        funciona si la categoría no tiene movimientos.
        {kind === 'gasto' &&
          ' Anual: el presupuesto es el costo del año y se cobra en ese mes; cada mes se aparta 1/12.'}
      </p>
    </div>
  )
}
