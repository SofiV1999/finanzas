import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { formatDay, todayIso } from '../lib/dates'
import { formatMoney } from '../lib/format'
import {
  accountByDigits,
  bankLabels,
  bogotaDate,
  bogotaTime,
  findDuplicate,
  groupImports,
  matchRecurring,
  ownAccount,
  ruleKey,
  type BankImport,
  type ImportGroup,
  type ImportRule,
} from '../lib/imports'
import { presetFor } from '../lib/recurring'
import { transferLabel } from '../lib/reports'
import { supabase } from '../lib/supabase'
import { isDebt, type Transaction } from '../lib/types'
import TransactionForm, { type SavedTransaction, type TransactionPreset } from './TransactionForm'

type Reviewing = { group: ImportGroup; preset: TransactionPreset }

// Alertas visibles antes de "Ver todas"
const SHOWN = 5

export default function ImportInbox() {
  const { accounts, categories, recurring, version, refresh } = useData()
  const [items, setItems] = useState<BankImport[]>([])
  const [rules, setRules] = useState<ImportRule[]>([])
  const [recent, setRecent] = useState<Transaction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState<Reviewing | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [imports, learned] = await Promise.all([
        supabase
          .from('bank_imports')
          .select('*')
          .eq('status', 'pendiente')
          .order('occurred_at', { ascending: false })
          .limit(200),
        supabase.from('import_rules').select('*'),
      ])
      // Sin la migración 0007 la tabla no existe: la bandeja simplemente no aparece
      if (cancelled || imports.error || learned.error) return
      const pending: BankImport[] = imports.data
      let txs: Transaction[] = []
      if (pending.length > 0) {
        const dates = pending.map((i) => bogotaDate(i.occurred_at)).sort()
        const shift = (iso: string, days: number) =>
          new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10)
        const { data } = await supabase
          .from('transactions')
          .select(
            'id, date, type, account_id, amount, category_id, to_account_id, to_amount, fx_rate, description, recurring_id',
          )
          .gte('date', shift(dates[0], -7))
          .lte('date', shift(dates[dates.length - 1], 7))
        txs = data ?? []
      }
      if (cancelled) return
      setItems(pending)
      setRules(learned.data)
      setRecent(txs)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [version])

  const groups = useMemo(() => groupImports(items, accounts, rules), [items, accounts, rules])
  const today = todayIso()

  // Cada movimiento ya registrado se ofrece como duplicado de una sola alerta
  const checks = useMemo(() => {
    const taken = new Set<string>()
    return new Map(
      groups.map((g) => {
        const duplicate = findDuplicate(g.suggestion.preset, recent, taken)
        if (duplicate) taken.add(duplicate.id)
        const pendingRule = duplicate
          ? undefined
          : matchRecurring(g.suggestion.preset, recurring, today)
        return [g.key, { duplicate, pendingRule }]
      }),
    )
  }, [groups, recent, recurring, today])

  if (items.length === 0) return null

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const quick = groups.filter((g) => {
    const c = checks.get(g.key)
    return g.suggestion.ready && !g.suggestion.needsForm && !c?.duplicate && !c?.pendingRule
  })

  async function markApproved(group: ImportGroup, transactionId: string | null) {
    const { error } = await supabase
      .from('bank_imports')
      .update({ status: 'aprobado', transaction_id: transactionId })
      .in(
        'id',
        group.items.map((i) => i.id),
      )
    if (error) throw new Error(error.message)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
    await refresh()
  }

  async function insertSuggested(group: ImportGroup) {
    const p = group.suggestion.preset
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        date: p.date,
        type: p.type,
        account_id: p.accountId,
        amount: p.amount,
        category_id: p.type === 'traslado' ? null : p.categoryId,
        to_account_id: p.type === 'traslado' ? p.toAccountId : null,
        description: p.description ?? null,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    await markApproved(group, data.id)
  }

  const approve = (group: ImportGroup) => run(() => insertSuggested(group))

  const approveAll = () =>
    run(async () => {
      for (const group of quick) await insertSuggested(group)
    })

  const discard = (group: ImportGroup) =>
    run(async () => {
      const { error } = await supabase
        .from('bank_imports')
        .update({ status: 'descartado' })
        .in(
          'id',
          group.items.map((i) => i.id),
        )
      if (error) throw new Error(error.message)
    })

  // Es el mismo movimiento ya registrado: se vincula y, si el banco dice otro monto, se corrige
  const sameAsExisting = (group: ImportGroup, tx: Transaction) =>
    run(async () => {
      const amount = group.suggestion.preset.amount
      if (amount && Math.abs(tx.amount - amount) >= 1 && !tx.to_amount) {
        const { error } = await supabase.from('transactions').update({ amount }).eq('id', tx.id)
        if (error) throw new Error(error.message)
      }
      await markApproved(group, tx.id)
    })

  // Asigna los dígitos de la alerta a una de tus cuentas
  const assignDigits = (digits: string, accountId: string) =>
    run(async () => {
      const account = accountById.get(accountId)
      if (!account) return
      const { error } = await supabase
        .from('accounts')
        .update({ match_digits: [...(account.match_digits ?? []), digits] })
        .eq('id', accountId)
      if (error) throw new Error(error.message)
    })

  // Crea la cuenta del CDT con su tasa y abre el formulario del traslado hacia ella
  async function createCdt(group: ImportGroup) {
    const item = group.items[0]
    const date = group.suggestion.preset.date ?? today
    const vence = item.details.vence
    setBusy(true)
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        name: `CDT ${bankLabels[item.bank] ?? ''} ${vence ? `· vence ${formatDay(vence)} ${vence.slice(0, 4)}` : date}`.replace(
          /\s+/g,
          ' ',
        ),
        type: 'cdt',
        currency: 'COP',
        opening_balance: 0,
        opening_date: date,
        annual_rate: item.details.tasa ?? null,
        sort_order: Math.max(0, ...accounts.map((a) => a.sort_order)) + 1,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      return setError(
        error.code === '23505' ? 'Ya tienes una cuenta con ese nombre.' : error.message,
      )
    }
    await refresh()
    setReviewing({ group, preset: { ...group.suggestion.preset, toAccountId: data.id } })
  }

  function review(group: ImportGroup) {
    const pendingRule = checks.get(group.key)?.pendingRule
    const preset = pendingRule
      ? {
          ...presetFor(pendingRule.rule, pendingRule.date),
          amount: group.suggestion.preset.amount,
          date: group.suggestion.preset.date,
        }
      : group.suggestion.preset
    setReviewing({ group, preset })
  }

  // Después de guardar desde el formulario: se aprueba, se registra la comisión y se aprende
  async function afterSave(group: ImportGroup, saved: SavedTransaction) {
    await markApproved(group, saved.id)
    const item = group.items[0]
    if (item.fee && !group.paired) {
      const feeCategory = categories.find(
        (c) => c.kind === 'gasto' && c.name === 'Intereses y comisiones' && !c.archived,
      )
      if (feeCategory) {
        await supabase.from('transactions').insert({
          date: saved.date,
          type: 'gasto',
          account_id:
            item.direction === 'in' && saved.to_account_id ? saved.to_account_id : saved.account_id,
          amount: item.fee,
          category_id: feeCategory.id,
          fx_rate: saved.fx_rate,
          description: `Comisión ${bankLabels[item.bank] ?? item.bank}`,
        })
      }
    }
    await learn(group, saved)
  }

  async function learn(group: ImportGroup, saved: SavedTransaction) {
    const item = group.items[0]
    const key = ruleKey(item)
    if (group.paired || !key) return
    const transfer = saved.type === 'traslado'
    const own = transfer && item.direction === 'in' ? saved.to_account_id : saved.account_id
    const other = transfer
      ? item.direction === 'in'
        ? saved.account_id
        : saved.to_account_id
      : null
    // Si la otra cuenta es tuya por sus dígitos no hace falta regla
    if (
      other &&
      accounts.find((a) => a.id === other)?.match_digits?.includes(item.counterparty_digits ?? '')
    )
      return
    const scope = item.bank === 'davivienda' && item.kind !== 'compra' ? own : null
    const rule = {
      ...key,
      account_id: scope,
      type: saved.type,
      category_id: transfer ? null : saved.category_id,
      other_account_id: other,
      description: saved.description,
    }
    const existing = rules.find(
      (r) => r.match_type === key.match_type && r.pattern === key.pattern && r.account_id === scope,
    )
    // Si el mismo comercio se clasificó distinto, desde ahora siempre se pregunta
    const changed =
      existing &&
      (existing.type !== saved.type ||
        existing.category_id !== rule.category_id ||
        existing.other_account_id !== rule.other_account_id)
    if (existing) {
      await supabase
        .from('import_rules')
        .update({ ...rule, ask: existing.ask || Boolean(changed) })
        .eq('id', existing.id)
    } else await supabase.from('import_rules').insert(rule)
  }

  const label = (p: TransactionPreset) =>
    p.type === 'traslado'
      ? p.accountId && p.toAccountId
        ? transferLabel(
            { type: 'traslado', account_id: p.accountId, to_account_id: p.toAccountId },
            accountById,
          )
        : 'Traslado'
      : p.categoryId
        ? (categoryName.get(p.categoryId) ?? 'Sin categoría')
        : 'Sin clasificar'

  const assignableAccounts = accounts.filter((a) => !a.archived)

  return (
    <div className="card import-card">
      <div className="row">
        <h2>📥 Por revisar ({groups.length})</h2>
        <span className="spacer" />
        {quick.length > 1 && (
          <button className="btn" disabled={busy} onClick={approveAll}>
            Aprobar {quick.length} listos
          </button>
        )}
      </div>
      <p className="muted small">
        Alertas de tus bancos. Lo que clasifiques una vez se recuerda para las siguientes.
      </p>

      {(showAll ? groups : groups.slice(0, SHOWN)).map((group) => {
        const { preset, ready, needsForm, cdt, ask, foreign } = group.suggestion
        const check = checks.get(group.key)
        const first = group.items[0]
        const account = preset.accountId ? accountById.get(preset.accountId) : undefined
        const toAccount = preset.toAccountId ? accountById.get(preset.toAccountId) : undefined
        const currency = account?.currency ?? first.currency
        const sign = preset.type === 'gasto' ? '−' : preset.type === 'ingreso' ? '+' : ''
        // Dígitos de tus cuentas que aún no están asignados (en un pago de tarjeta, también la tarjeta)
        const unknownDigits = [
          ...new Set(
            group.items.flatMap((i) => [
              ...(i.account_digits && !ownAccount(i, accounts) ? [i.account_digits] : []),
              ...(i.kind === 'pago_tarjeta' &&
              i.counterparty_digits &&
              !accountByDigits(i.counterparty_digits, accounts)
                ? [i.counterparty_digits]
                : []),
            ]),
          ),
        ]
        const where = group.paired
          ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}`
          : [account?.name, toAccount && `→ ${toAccount.name}`].filter(Boolean).join(' ')
        return (
          <div key={group.key} className="mini-row import-row">
            <div className="budget-foot">
              <span className="mini-main">
                <strong className="text-h">{label(preset)}</strong>
                {preset.description && <span className="muted"> · {preset.description}</span>}
              </span>
              <strong className={`tx-${preset.type}`}>
                {sign}
                {preset.amount
                  ? formatMoney(preset.amount, currency)
                  : first.amount
                    ? formatMoney(first.amount, first.currency)
                    : '—'}
              </strong>
            </div>
            <div className="muted small">
              {formatDay(preset.date ?? bogotaDate(first.occurred_at))}{' '}
              {bogotaTime(first.occurred_at)} ·{' '}
              {group.items.map((i) => bankLabels[i.bank] ?? i.bank).join(' + ')}
              {where && ` · ${where}`}
              {group.paired && <span className="tag import-tag">2 correos</span>}
              {first.fee && (
                <span className="tag import-tag">
                  Comisión {formatMoney(first.fee, first.currency)}
                </span>
              )}
            </div>
            {foreign && (
              <div className="small warning-text">
                Compra en {first.currency} con una cuenta en {currency}. Crea la parte en{' '}
                {first.currency === 'USD' ? 'dólares' : 'pesos'} de la tarjeta (otra cuenta con los
                mismos dígitos) o escribe el valor en {currency} al revisarla.
              </div>
            )}
            {ask && (
              <div className="small muted">
                Este comercio tiene varias categorías: elige la de esta compra al revisarlo.
              </div>
            )}
            {first.kind === 'desconocido' && first.summary && (
              <div className="small import-summary">“{first.summary}”</div>
            )}

            {unknownDigits.map((digits) => (
              <div key={digits} className="small import-assign">
                <label htmlFor={`assign-${group.key}-${digits}`}>
                  ¿Qué cuenta termina en <strong>{digits}</strong>?
                </label>
                <select
                  id={`assign-${group.key}-${digits}`}
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && assignDigits(digits, e.target.value)}
                >
                  <option value="">Elegir…</option>
                  {assignableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {isDebt(a.type) ? ' (deuda)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {check?.duplicate && (
              <div className="small warning-text">
                ⚠️ Parece que ya lo registraste:{' '}
                {check.duplicate.description ??
                  label({
                    type: check.duplicate.type,
                    categoryId: check.duplicate.category_id ?? undefined,
                    accountId: check.duplicate.account_id,
                    toAccountId: check.duplicate.to_account_id ?? undefined,
                  })}{' '}
                · {formatDay(check.duplicate.date)} ·{' '}
                {formatMoney(check.duplicate.amount, currency)}
                {check.duplicate.recurring_id && ' (programado)'}
              </div>
            )}
            {check?.pendingRule && (
              <div className="small warning-text">
                🔁 Coincide con tu programado del {formatDay(check.pendingRule.date)}: al revisarlo
                queda confirmado.
              </div>
            )}

            <div className="row import-actions">
              <button className="link-btn small" disabled={busy} onClick={() => discard(group)}>
                Descartar
              </button>
              <span className="spacer" />
              {check?.duplicate && (
                <button
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => sameAsExisting(group, check.duplicate!)}
                >
                  Es el mismo
                </button>
              )}
              {cdt ? (
                <button className="btn btn-small" disabled={busy} onClick={() => createCdt(group)}>
                  Crear cuenta CDT
                </button>
              ) : (
                <>
                  <button
                    className={`btn btn-small${ready && !needsForm && !check?.duplicate ? ' btn-ghost' : ''}`}
                    disabled={busy}
                    onClick={() => review(group)}
                  >
                    {check?.duplicate ? 'Es otro' : 'Revisar'}
                  </button>
                  {ready && !needsForm && !check?.duplicate && !check?.pendingRule && (
                    <button
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() => approve(group)}
                    >
                      Aprobar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
      {groups.length > SHOWN && (
        <button className="link-btn small import-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Ver menos' : `Ver las ${groups.length} alertas`}
        </button>
      )}
      {error && <p className="error">{error}</p>}

      {reviewing && (
        <TransactionForm
          preset={reviewing.preset}
          onClose={() => setReviewing(null)}
          onSaved={(saved) =>
            afterSave(reviewing.group, saved).catch((e) => setError(String(e.message ?? e)))
          }
        />
      )}
    </div>
  )
}
