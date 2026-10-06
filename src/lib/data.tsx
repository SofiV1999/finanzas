import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { todayIso } from './dates'
import { generateDueTransactions, type RecurringTransaction } from './recurring'
import { supabase } from './supabase'
import { fetchLatestTrm, type Trm } from './trm'
import type { AccountWithBalance, Category, Currency, Settings } from './types'

type Data = {
  settings: Settings | null
  categories: Category[]
  accounts: AccountWithBalance[]
  recurring: RecurringTransaction[]
  // TRM oficial más reciente, para mostrar saldos en USD también en pesos
  latestTrm: Trm | null
  loading: boolean
  error: string | null
  // Aumenta cada vez que cambian los datos; las páginas lo usan para recargar
  version: number
  refresh: () => Promise<void>
}

const DataContext = createContext<Data | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  // Los programados se generan una vez por cada vez que se abre la app
  const generated = useRef(false)
  const [latestTrm, setLatestTrm] = useState<Trm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async function load(): Promise<void> {
    const [s, c, a, b, r] = await Promise.all([
      supabase.from('settings').select('*').maybeSingle(),
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('accounts').select('*').order('sort_order').order('name'),
      supabase.from('account_balances').select('id, balance'),
      supabase.from('recurring_transactions').select('*').order('day_of_month'),
    ])
    // Si la tabla de programados aún no existe (SQL 0006 sin correr), la app sigue funcionando
    const firstError = s.error ?? c.error ?? a.error ?? b.error
    if (firstError) {
      setError(firstError.message)
    } else {
      const balances = new Map((b.data ?? []).map((row) => [row.id as string, Number(row.balance)]))
      setSettings(s.data)
      setCategories(c.data ?? [])
      const accountsWithBalance = (a.data ?? []).map((acc) => ({
        ...acc,
        balance: balances.get(acc.id) ?? 0,
      }))
      setAccounts(accountsWithBalance)
      setRecurring(r.error ? [] : (r.data ?? []))
      setError(null)
      if (!generated.current && !r.error && r.data?.length) {
        generated.current = true
        const currency = new Map(accountsWithBalance.map((x) => [x.id, x.currency]))
        const created = await generateDueTransactions(r.data, (id) => currency.get(id), todayIso())
        if (created > 0) return load()
      }
    }
    setLoading(false)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    refresh()
    fetchLatestTrm()
      .then(setLatestTrm)
      .catch(() => setLatestTrm(null))
  }, [refresh])

  const value = useMemo(
    () => ({
      settings,
      categories,
      accounts,
      recurring,
      latestTrm,
      loading,
      error,
      version,
      refresh,
    }),
    [settings, categories, accounts, recurring, latestTrm, loading, error, version, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData debe usarse dentro de DataProvider')
  return data
}

// Convierte un monto a pesos. Para USD usa la TRM dada (la del movimiento o la más reciente).
// eslint-disable-next-line react-refresh/only-export-components
export function toCop(amount: number, currency: Currency, rate: number | null | undefined) {
  if (currency === 'COP') return amount
  return rate ? amount * rate : 0
}

// Ingreso mensual planeado en pesos: salario × TRM de planeación si es en USD
// eslint-disable-next-line react-refresh/only-export-components
export function plannedIncomeCop(settings: Settings | null) {
  if (!settings) return 0
  if (settings.salary_currency === 'COP') return settings.monthly_salary
  return settings.monthly_salary * (settings.planning_fx_rate ?? 0)
}
