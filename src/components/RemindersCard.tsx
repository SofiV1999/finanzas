import { MONTH_NAMES } from '../lib/budget'
import { buildIcs, buildReminders, downloadIcs } from '../lib/calendar'
import { useData } from '../lib/data'
import { formatMoney } from '../lib/format'
import { isIOS } from '../lib/install'
import { isDebt } from '../lib/types'

export default function RemindersCard() {
  const { accounts, categories } = useData()
  const { reminders, missingDay } = buildReminders(accounts, categories)
  const debtsWithoutDay = accounts.filter(
    (a) => isDebt(a.type) && !a.archived && a.balance < -0.5 && !a.due_day,
  )

  return (
    <div className="card">
      <h2>🔔 Recordatorios de pago</h2>
      <p className="muted small">
        Descarga tus pagos como calendario e impórtalo una vez en tu celular: cada pago se repite
        solo (mensual o anual) y te avisa <strong>3 días antes a las 9 a. m.</strong> Si cambias
        fechas o montos, vuelve a descargarlo e importarlo.
      </p>

      {reminders.length === 0 ? (
        <p className="muted small">
          Aún no hay pagos con día definido. Pon el día de pago a tus tarjetas y préstamos (en
          Deudas) y a tus gastos fijos o anuales (en la tabla de abajo).
        </p>
      ) : (
        <div className="reminder-list">
          {reminders.map((r) => (
            <div key={r.uid} className="mini-row budget-foot small">
              <span>
                <strong className="text-h">{r.title.replace(/^Pagar /, '')}</strong>
                <span className="muted">
                  {' '}
                  ·{' '}
                  {r.month
                    ? `cada año, ${r.day} de ${MONTH_NAMES[r.month - 1]}`
                    : `cada mes, día ${r.day}`}
                </span>
              </span>
              <span className="muted">{r.amount ? formatMoney(r.amount, r.currency) : ''}</span>
            </div>
          ))}
        </div>
      )}

      {(missingDay.length > 0 || debtsWithoutDay.length > 0) && (
        <p className="small warning-text">
          Sin día de pago, no entran al calendario:{' '}
          {[...debtsWithoutDay.map((a) => a.name), ...missingDay.map((c) => c.name)].join(', ')}.
        </p>
      )}

      <div className="row">
        <button
          className="btn"
          disabled={reminders.length === 0}
          onClick={() => downloadIcs(buildIcs(reminders))}
        >
          ⬇ Descargar recordatorios (.ics)
        </button>
      </div>

      <details className="small install-help">
        <summary>¿Cómo lo importo?</summary>
        {isIOS() ? (
          <ol className="install-steps">
            <li>Toca “Descargar recordatorios” en Safari.</li>
            <li>
              Elige <strong>Agregar todo</strong> y, si te pregunta, un calendario nuevo llamado
              “Finanzas”.
            </li>
            <li>
              Para actualizarlo: borra ese calendario en la app Calendario e impórtalo de nuevo.
            </li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>Descarga el archivo.</li>
            <li>
              En el computador abre <strong>calendar.google.com → Configuración → Importar</strong>{' '}
              (la app de Google Calendar del celular no importa archivos). Te recomiendo crear antes
              un calendario “Finanzas” e importarlo ahí.
            </li>
            <li>
              Google no importa las alarmas del archivo: en la configuración del calendario
              “Finanzas”, pon como notificación de eventos de todo el día{' '}
              <strong>3 días antes a las 9:00</strong>.
            </li>
            <li>Al volver a importar, Google actualiza los eventos en vez de duplicarlos.</li>
          </ol>
        )}
      </details>
    </div>
  )
}
