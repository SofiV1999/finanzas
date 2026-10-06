import AccountsManager from '../components/AccountsManager'
import GoalsManager from '../components/GoalsManager'

export default function Ahorros() {
  return (
    <>
      <h1>🏦 Ahorros y metas</h1>
      <p className="muted">Cuentas, inversiones y metas financieras.</p>
      <div className="stack">
        <AccountsManager mode="activos" />
        <GoalsManager />
      </div>
    </>
  )
}
