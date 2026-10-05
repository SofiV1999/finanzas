import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  budgetGroupLabels,
  type BudgetGroup,
  type Category,
  type CategoryKind,
  type Settings,
} from '../lib/types'

export default function Configuracion() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      supabase.from('settings').select('*').maybeSingle(),
      supabase.from('categories').select('*').order('sort_order').order('name'),
    ])
    if (s.error || c.error) {
      setError((s.error ?? c.error)!.message)
      return
    }
    setSettings(s.data)
    setCategories(c.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <h1>⚙️ Configuración</h1>
      <p className="muted">Salario, metas 50/30/20 y categorías.</p>
      {error && <p className="error">No se pudieron cargar los datos: {error}</p>}
      <div className="stack">
        {settings && <SettingsCard settings={settings} onSaved={setSettings} />}
        <CategoriesCard
          title="Categorías de gastos"
          kind="gasto"
          categories={categories.filter((c) => c.kind === 'gasto')}
          onChange={load}
        />
        <CategoriesCard
          title="Categorías de ingresos"
          kind="ingreso"
          categories={categories.filter((c) => c.kind === 'ingreso')}
          onChange={load}
        />
      </div>
    </>
  )
}

function SettingsCard({
  settings,
  onSaved,
}: {
  settings: Settings
  onSaved: (s: Settings) => void
}) {
  const [salary, setSalary] = useState(String(settings.monthly_salary))
  // Los porcentajes se editan como números enteros (50 = 50%)
  const [needs, setNeeds] = useState(String(settings.needs_pct * 100))
  const [wants, setWants] = useState(String(settings.wants_pct * 100))
  const [savings, setSavings] = useState(String(settings.savings_pct * 100))
  const [status, setStatus] = useState<string | null>(null)

  const total = Number(needs) + Number(wants) + Number(savings)
  const totalOk = Math.abs(total - 100) < 0.001

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('settings')
      .update({
        monthly_salary: Number(salary),
        needs_pct: Number(needs) / 100,
        wants_pct: Number(wants) / 100,
        savings_pct: Number(savings) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', settings.user_id)
      .select()
      .single()
    if (error) {
      setStatus(`Error: ${error.message}`)
      return
    }
    onSaved(data)
    setStatus('Guardado ✓')
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Salario y metas 50/30/20</h2>
      <div className="grid-4">
        <div className="field">
          <label htmlFor="salary">Salario mensual (COP)</label>
          <input
            id="salary"
            type="number"
            min="0"
            step="1000"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
          <small className="muted">{formatMoney(Number(salary))}</small>
        </div>
        <PctField id="needs" label="Necesidades %" value={needs} onChange={setNeeds} salary={salary} />
        <PctField id="wants" label="Deseos %" value={wants} onChange={setWants} salary={salary} />
        <PctField id="savings" label="Ahorro / Inversión %" value={savings} onChange={setSavings} salary={salary} />
      </div>
      <div className="row">
        <span className={totalOk ? 'muted' : 'error'}>
          Total: {total}% {totalOk ? '' : '— debe sumar 100%'}
        </span>
        <span className="spacer" />
        {status && <span className="muted">{status}</span>}
        <button className="btn" type="submit" disabled={!totalOk}>
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
  salary: string
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
        {formatMoney((Number(props.salary) * Number(props.value)) / 100)} al mes
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
                      onChange={(e) => update(c.id, { budget_group: e.target.value as BudgetGroup })}
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
                <td className="right">
                  <button
                    className="link-btn"
                    onClick={() => update(c.id, { archived: !c.archived })}
                  >
                    {c.archived ? 'Restaurar' : 'Archivar'}
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
        Archivar oculta la categoría para nuevos movimientos, sin borrar su historial.
      </p>
    </div>
  )
}
