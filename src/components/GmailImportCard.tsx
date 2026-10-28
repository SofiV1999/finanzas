import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { formatDay } from '../lib/dates'
import { newImportToken, normalizeName, type ImportRule } from '../lib/imports'
import { supabase } from '../lib/supabase'

// Configuración de la importación desde Gmail: llave del script y reglas aprendidas
export default function GmailImportCard() {
  const { accounts, categories, version } = useData()
  const [tokenDate, setTokenDate] = useState<string | null>(null)
  const [rules, setRules] = useState<ImportRule[]>([])
  const [missing, setMissing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('import_tokens').select('created_at').maybeSingle(),
      supabase.from('import_rules').select('*').order('pattern'),
    ]).then(([token, learned]) => {
      if (cancelled) return
      // Sin la migración 0007 las tablas no existen
      setMissing(Boolean(token.error || learned.error))
      setTokenDate(token.data?.created_at ?? null)
      setRules(learned.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [version, reload])

  // Crea una llave nueva (reemplaza la anterior) y copia el script ya configurado con ella
  async function copyScript() {
    if (
      tokenDate &&
      !confirm('Se creará una llave nueva y el script anterior dejará de funcionar. ¿Continuar?')
    )
      return
    setBusy(true)
    setStatus(null)
    setFallback(null)
    try {
      const [{ default: template }, { token, hash }] = await Promise.all([
        import('../../gmail/importador.gs?raw'),
        newImportToken(),
      ])
      const removed = await supabase.from('import_tokens').delete().not('user_id', 'is', null)
      if (removed.error) throw new Error(removed.error.message)
      const inserted = await supabase.from('import_tokens').insert({ token_hash: hash })
      if (inserted.error) throw new Error(inserted.error.message)
      const script = template
        .replace('__SUPABASE_URL__', import.meta.env.VITE_SUPABASE_URL ?? '')
        .replace('__SUPABASE_KEY__', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
        .replace('__FINANZAS_TOKEN__', token)
      try {
        await navigator.clipboard.writeText(script)
        setStatus('Script copiado. Sigue los pasos de abajo para pegarlo.')
      } catch {
        setFallback(script)
        setStatus('No se pudo copiar solo: selecciona el texto de abajo y cópialo.')
      }
      setReload((n) => n + 1)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function updatePattern(rule: ImportRule, text: string) {
    const pattern = rule.match_type === 'nombre' ? normalizeName(text) : text.trim().toLowerCase()
    if (!pattern || pattern === rule.pattern) return
    const { error } = await supabase.from('import_rules').update({ pattern }).eq('id', rule.id)
    setStatus(error?.message ?? null)
    setReload((n) => n + 1)
  }

  async function toggleAsk(rule: ImportRule) {
    const { error } = await supabase
      .from('import_rules')
      .update({ ask: !rule.ask })
      .eq('id', rule.id)
    setStatus(error?.message ?? null)
    setReload((n) => n + 1)
  }

  async function removeRule(rule: ImportRule) {
    const { error } = await supabase.from('import_rules').delete().eq('id', rule.id)
    setStatus(error?.message ?? null)
    setReload((n) => n + 1)
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="card">
      <h2>📥 Importar desde Gmail</h2>
      {missing ? (
        <p className="muted small">
          Para activarlo corre primero la migración <code>0007_importar_correos.sql</code> en
          Supabase.
        </p>
      ) : (
        <>
          <p className="muted small">
            Un script en tu Gmail lee las alertas de Bancolombia, Davivienda, ARQ y Nu cada 10
            minutos y las deja en Movimientos → Por revisar. Solo envía monto, fecha, comercio y los
            últimos 4 dígitos; su llave no puede leer ni cambiar tus datos.
          </p>
          <p className="small">
            {tokenDate
              ? `Llave activa desde el ${formatDay(tokenDate.slice(0, 10))} ${tokenDate.slice(0, 4)}.`
              : 'Aún no has conectado Gmail.'}
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={copyScript}>
              {busy
                ? 'Preparando…'
                : tokenDate
                  ? 'Generar llave nueva y copiar script'
                  : 'Copiar script'}
            </button>
          </div>
          {status && <p className="small">{status}</p>}
          {fallback && (
            <textarea
              className="script-fallback"
              readOnly
              value={fallback}
              onFocus={(e) => e.target.select()}
            />
          )}
          <ol className="small install-steps">
            <li>
              Abre <strong>script.google.com</strong> con tu cuenta de Gmail y toca{' '}
              <strong>Nuevo proyecto</strong>.
            </li>
            <li>
              Borra el código que trae, pega el script y guárdalo (💾) con el nombre{' '}
              <strong>Finanzas</strong>.
            </li>
            <li>
              Arriba elige la función <code>probar</code> y toca <strong>Ejecutar</strong>. Google
              pide permiso para leer tu Gmail: <strong>Revisar permisos</strong> → tu cuenta →{' '}
              <strong>Configuración avanzada</strong> → <strong>Ir a Finanzas</strong> →{' '}
              <strong>Permitir</strong>. Sale como “no verificada” porque es tu propio script.
            </li>
            <li>
              En el registro aparecen las alertas que encontró. Si se ven bien, elige{' '}
              <code>instalar</code> y <strong>Ejecutar</strong>: importa los últimos 30 días y queda
              revisando cada 10 minutos.
            </li>
          </ol>

          <h3 className="mini-title">Lo que la app aprendió ({rules.length})</h3>
          {rules.length === 0 ? (
            <p className="muted small">
              Cuando clasifiques una alerta, aquí queda la regla. Puedes acortar un nombre (p. ej.
              “tienda d1 manila” → “tienda d1”) para que aplique a todas las sedes. Si un comercio
              lo clasificas con categorías distintas (Rappi: mercado o restaurantes), la app empieza
              a preguntarte cada vez.
            </p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="mini-row budget-foot small">
                <span className="row rule-main">
                  <span className="muted">
                    {r.match_type === 'digitos' ? 'Cuenta o llave' : 'Empieza con'}
                  </span>
                  <input
                    className="inline-input"
                    aria-label="Texto de la regla"
                    defaultValue={r.pattern}
                    onBlur={(e) => updatePattern(r, e.target.value)}
                  />
                </span>
                <span className="row rule-main">
                  <span>
                    →{' '}
                    {r.type === 'traslado'
                      ? `Traslado ${accountName.get(r.other_account_id ?? '') ?? ''}`
                      : (categoryName.get(r.category_id ?? '') ?? 'Sin categoría')}
                    {r.account_id && (
                      <span className="muted"> · solo en {accountName.get(r.account_id)}</span>
                    )}
                  </span>
                  {r.type !== 'traslado' && (
                    <label className="check-line muted">
                      <input type="checkbox" checked={r.ask} onChange={() => toggleAsk(r)} />{' '}
                      Preguntar siempre
                    </label>
                  )}
                  <button className="link-btn small danger" onClick={() => removeRule(r)}>
                    Quitar
                  </button>
                </span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
