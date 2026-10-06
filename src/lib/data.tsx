import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './supabase'
import { fetchLatestTrm, type Trm } from './trm'
import type { AccountWithBalance, Category, Currency, Settings } from './types'

type Data = {
  settings: Settings | null
  categories: Category[]
  accounts: AccountWithBalance[]
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
  const [latestTrm, setLatestTrm] = useState<Trm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async () => {
    const [s, c, a, b] = await Promise.all([
      supabase.from('settings').select('*').maybeSingle(),
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('accounts').select('*').order('sort_order').order('name'),
      supabase.from('account_balances').select('id, balance'),
    ])
    const firstError = s.error ?? c.error ?? a.error ?? b.error
    if (firstError) {
      setError(firstError.message)
    } else {
      const balances = new Map((b.data ?? []).map((row) => [row.id as string, Number(row.balance)]))
      setSettings(s.data)
      setCategories(c.data ?? [])
      setAccounts((a.data ?? []).map((acc) => ({ ...acc, balance: balances.get(acc.id) ?? 0 })))
      setError(null)
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
    () => ({ settings, categories, accounts, latestTrm, loading, error, version, refresh }),
    [settings, categories, accounts, latestTrm, loading, error, version, refresh],
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
