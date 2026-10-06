import AccountsManager from '../components/AccountsManager'

export default function Deudas() {
  return (
    <>
      <h1>💳 Deudas</h1>
      <p className="muted">Tarjetas de crédito y préstamos.</p>
      <div className="stack">
        <AccountsManager mode="deudas" />
        <div className="card muted small">
          <strong>Cómo registrar:</strong> una compra con tarjeta es un <em>gasto</em> pagado con la
          tarjeta (aumenta la deuda). Pagar la tarjeta o la cuota del préstamo es un <em>traslado</em>{' '}
          desde tu cuenta hacia la deuda. Los intereses y cuotas de manejo son un <em>gasto</em> en
          “Intereses y comisiones” pagado con la tarjeta o el préstamo.
        </div>
        <div className="card placeholder">
          <strong>Próximamente</strong>
          <ul>
            <li>Tabla de amortización de préstamos</li>
            <li>Bola de nieve vs. avalancha y simulador de pagos extra</li>
            <li>Meses e intereses ahorrados</li>
          </ul>
        </div>
      </div>
    </>
  )
}
