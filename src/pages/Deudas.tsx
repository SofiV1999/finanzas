import AccountsManager from '../components/AccountsManager'
import DebtPlan from '../components/DebtPlan'

export default function Deudas() {
  return (
    <>
      <h1>💳 Deudas</h1>
      <p className="muted">Tarjetas de crédito y préstamos.</p>
      <div className="stack">
        <AccountsManager mode="deudas" />
        <DebtPlan />
        <div className="card muted small">
          <strong>Cómo registrar:</strong> una compra con tarjeta es un <em>gasto</em> pagado con la
          tarjeta (aumenta la deuda). Pagar la tarjeta o la cuota del préstamo es un{' '}
          <em>traslado</em> desde tu cuenta hacia la deuda. Los intereses y cuotas de manejo de la
          tarjeta son un <em>gasto</em> en “Intereses y comisiones” pagado con la tarjeta. Al pagar
          un préstamo, el formulario separa solo los intereses de la cuota.
        </div>
      </div>
    </>
  )
}
