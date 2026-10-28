// =====================================================================
// Finanzas: importador de alertas bancarias desde Gmail (Google Apps Script)
//
// Corre dentro de tu cuenta de Google: lee las alertas de los bancos, saca
// monto, fecha, cuenta y comercio, y envía solo esos datos a la app, donde
// quedan en "Por revisar". La llave solo permite agregar alertas pendientes:
// no puede leer, cambiar ni borrar tus movimientos.
//
// Instalación: copia este archivo desde la app (Configuración → Importar desde
// Gmail), pégalo en script.google.com y ejecuta `instalar` una vez.
// =====================================================================

const SUPABASE_URL = '__SUPABASE_URL__'
const SUPABASE_KEY = '__SUPABASE_KEY__'
const FINANZAS_TOKEN = '__FINANZAS_TOKEN__'

const BUSQUEDA =
  'from:(alertasynotificaciones@ayn.notificacionesbancolombia.com OR notificacionesbancolombia.com' +
  ' OR bancolombia.com.co OR davivienda.com OR arqfinance.com OR nu.com.co)'

// ---------------------------------------------------------------------
// Tareas (se ejecutan desde el editor de Apps Script)
// ---------------------------------------------------------------------

// Crea la revisión automática cada 10 minutos e importa los últimos 30 días
function instalar() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'importarCorreos') ScriptApp.deleteTrigger(trigger)
  }
  ScriptApp.newTrigger('importarCorreos').timeBased().everyMinutes(10).create()
  importar_(30, true)
}

// La ejecuta el activador cada 10 minutos
function importarCorreos() {
  importar_(2, true)
}

// Muestra en el registro lo que se importaría, sin enviar nada
function probar() {
  importar_(30, false)
}

// Lista remitente y asunto de los correos de los bancos que no se importan
function verIgnorados() {
  for (const hilo of GmailApp.search(`${BUSQUEDA} newer_than:31d`, 0, 300)) {
    for (const correo of hilo.getMessages()) {
      const alerta = leerCorreo({
        from: correo.getFrom(),
        subject: correo.getSubject(),
        body: correo.getPlainBody(),
        date: correo.getDate().toISOString(),
      })
      if (!alerta) console.log(`${correo.getFrom()} | ${correo.getSubject()}`)
    }
  }
}

function importar_(dias, enviar) {
  const props = PropertiesService.getScriptProperties()
  const enviados = JSON.parse(props.getProperty('ENVIADOS') || '[]')
  const yaEnviado = new Set(enviados)
  const desde = new Date(Date.now() - dias * 86400000)
  const items = []
  let ignorados = 0
  for (const hilo of GmailApp.search(`${BUSQUEDA} newer_than:${dias + 1}d`, 0, 300)) {
    for (const correo of hilo.getMessages()) {
      if (correo.getDate() < desde || yaEnviado.has(correo.getId())) continue
      const alerta = leerCorreo({
        from: correo.getFrom(),
        subject: correo.getSubject(),
        body: correo.getPlainBody(),
        date: correo.getDate().toISOString(),
      })
      if (alerta) items.push(Object.assign({ message_id: correo.getId() }, alerta))
      else ignorados++
    }
  }
  if (!enviar) {
    for (const item of items) console.log(JSON.stringify(item))
    console.log(`${items.length} alertas para importar, ${ignorados} correos ignorados`)
    return
  }
  let nuevos = 0
  for (let i = 0; i < items.length; i += 50) {
    const lote = items.slice(i, i + 50)
    const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_bank_emails`, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: SUPABASE_KEY },
      payload: JSON.stringify({ p_token: FINANZAS_TOKEN, p_items: lote }),
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      throw new Error(`La app respondió ${res.getResponseCode()}: ${res.getContentText()}`)
    }
    nuevos += Number(res.getContentText()) || 0
    for (const item of lote) enviados.push(item.message_id)
  }
  // Recuerda los últimos enviados para no reenviarlos (la app igual ignora repetidos)
  props.setProperty('ENVIADOS', JSON.stringify(enviados.slice(-400)))
  console.log(
    `${nuevos} alertas nuevas, ${items.length - nuevos} ya estaban, ${ignorados} ignorados`,
  )
}

// ---------------------------------------------------------------------
// Lectura de alertas
// ---------------------------------------------------------------------

// Devuelve la alerta como datos, o null si el correo no es un movimiento
function leerCorreo(correo) {
  const from = String(correo.from || '').toLowerCase()
  const texto = String(correo.body || '')
  const plano = texto.replace(/\s+/g, ' ').trim()
  let alerta = null
  if (from.includes('bancolombia')) alerta = leerBancolombia_(plano)
  else if (from.includes('davivienda')) alerta = leerDavivienda_(texto)
  else if (from.includes('arqfinance') || from.includes('dollarapp')) {
    alerta = leerArq_(String(correo.subject || ''), texto)
  } else if (from.includes('nu.com.co')) alerta = leerNu_(String(correo.subject || ''), texto)
  if (!alerta) return null
  if (!alerta.occurred_at) alerta.occurred_at = correo.date
  if (!alerta.currency) alerta.currency = 'COP'
  if (alerta.summary) alerta.summary = ocultarNumeros_(alerta.summary).slice(0, 300)
  return alerta
}

// "COP24.490,00", "$26,100", "$39,600.00", "$93.558,00", "2,395": si el último separador
// tiene 2 dígitos después son centavos; si no, todos los separadores son de miles
function leerMonto_(texto) {
  const limpio = String(texto)
    .replace(/[^\d.,]/g, '')
    .replace(/[.,]$/, '')
  if (!limpio) return null
  const centavos = /[.,](\d{2})$/.exec(limpio)
  const valor = centavos
    ? Number(`${limpio.slice(0, -3).replace(/[.,]/g, '')}.${centavos[1]}`)
    : Number(limpio.replace(/[.,]/g, ''))
  return valor > 0 ? valor : null
}

const dos_ = (n) => String(n).padStart(2, '0')

// Fecha y hora de Colombia (UTC-5, sin horario de verano)
function fechaColombia_(anio, mes, dia, hora, minuto) {
  const a = Number(anio) < 100 ? 2000 + Number(anio) : Number(anio)
  return `${a}-${dos_(mes)}-${dos_(dia)}T${dos_(hora)}:${dos_(minuto)}:00-05:00`
}

const ultimos4_ = (digitos) => (digitos ? String(digitos).slice(-4) : null)

// Llave Bre-B: si es un número (celular, cédula) solo se guardan los últimos 4 dígitos
const llave_ = (llave) => (/^\d+$/.test(llave) ? ultimos4_(llave) : llave.toLowerCase())

// Números de 5 o más dígitos quedan como •••1234
const ocultarNumeros_ = (texto) => texto.replace(/\d{5,}/g, (n) => `•••${n.slice(-4)}`)

const MONTO = '(?:COP|USD|US\\$|\\$)?\\s?([\\d.,]+)'

function leerBancolombia_(plano) {
  const inicio = plano.search(/Bancolombia(:| informa)/)
  if (inicio < 0) return null
  const t = plano
    .slice(inicio)
    .split(
      /\s(?:Si tienes dudas|¿Dudas|Dudas al|Inquietudes|Con codigo QR|Con Bre-b|Esta compra esta)/i,
    )[0]
  const resumen = t.replace(/^Bancolombia:?\s*/, '')

  let fecha = null
  const f = /(\d{2})\/(\d{2})\/(\d{2,4})\.?(?:\s*(?:a las)?\s*(\d{1,2}):(\d{2}))?/.exec(plano)
  if (f) fecha = fechaColombia_(f[3], f[2], f[1], f[4] || 12, f[5] || 0)
  const base = { bank: 'bancolombia', occurred_at: fecha, summary: resumen, details: {} }
  let m

  // Pago de una tarjeta de crédito desde una cuenta
  m = new RegExp(
    `Pagaste ${MONTO} en la tarjeta de credito \\*(\\d+) desde la cuenta \\*(\\d+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'pago_tarjeta',
      direction: 'out',
      amount: leerMonto_(m[1]),
      account_digits: ultimos4_(m[3]),
      counterparty_digits: ultimos4_(m[2]),
    })
  }

  // Pago con código QR
  m = new RegExp(
    `pagaste ${MONTO} por codigo QR desde tu cuenta \\*(\\d+) a la llave (\\S+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'qr',
      direction: 'out',
      amount: leerMonto_(m[1]),
      account_digits: ultimos4_(m[2]),
      counterparty_digits: llave_(m[3]),
    })
  }

  // Compra con tarjeta de crédito o débito
  m = new RegExp(`Compraste ${MONTO} en (.+?)(?: con tu T\\.| ?, el \\d|$)`, 'i').exec(t)
  if (m) {
    const tarjeta = /T\.(Cred|Deb) \*(\d+)/i.exec(plano)
    return Object.assign(base, {
      kind: 'compra',
      direction: 'out',
      amount: leerMonto_(m[1]),
      currency: /Compraste\s*(USD|US\$)/i.test(t) ? 'USD' : 'COP',
      counterparty: m[2].replace(/,$/, '').trim(),
      account_digits: tarjeta ? ultimos4_(tarjeta[2]) : null,
      details: tarjeta ? { tarjeta: /cred/i.test(tarjeta[1]) ? 'credito' : 'debito' } : {},
    })
  }

  // Transferencia a una llave (Bre-B)
  m = new RegExp(
    `transferiste ${MONTO} a la llave (\\S+) desde tu cuenta \\*(\\d+)(?: a (.+?) el \\d)?`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'transferencia',
      direction: 'out',
      amount: leerMonto_(m[1]),
      account_digits: ultimos4_(m[3]),
      counterparty: m[4] ? m[4].trim() : null,
      counterparty_digits: llave_(m[2]),
    })
  }

  // Transferencia a una cuenta
  m = new RegExp(
    `Transferiste ${MONTO} desde tu cuenta \\*(\\d+) a la cuenta \\*?(\\d+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'transferencia',
      direction: 'out',
      amount: leerMonto_(m[1]),
      account_digits: ultimos4_(m[2]),
      counterparty_digits: ultimos4_(m[3]),
    })
  }

  // Transferencia recibida
  m = new RegExp(
    `Recibiste una transferencia por ${MONTO} de (.+?) en tu cuenta \\*+(\\d+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'recibido',
      direction: 'in',
      amount: leerMonto_(m[1]),
      counterparty: m[2].trim(),
      account_digits: ultimos4_(m[3]),
    })
  }

  // Pago de factura programada
  m = new RegExp(
    `pago Factura Programada (.+?) Ref \\S+ por ${MONTO} desde \\w*\\*(\\d+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'factura',
      direction: 'out',
      amount: leerMonto_(m[2]),
      counterparty: m[1].trim(),
      account_digits: ultimos4_(m[3]),
    })
  }

  // Otro pago (PSE, facturas): "Pagaste $X a EMPRESA desde tu cuenta *1234"
  m = new RegExp(
    `Pagaste ${MONTO} a (.+?) desde (?:tu|la) (?:cuenta|producto)\\s?\\w*\\s?\\*(\\d+)`,
    'i',
  ).exec(t)
  if (m) {
    return Object.assign(base, {
      kind: 'pago',
      direction: 'out',
      amount: leerMonto_(m[1]),
      counterparty: m[2].trim(),
      account_digits: ultimos4_(m[3]),
    })
  }

  // Formato desconocido: se envía con lo que se pueda leer para registrarlo a mano
  const monto = /(?:COP|\$)\s?([\d.,]+\d)/.exec(t)
  if (!monto) return null
  const cuenta = /\*+(\d{4,})/.exec(t)
  return Object.assign(base, {
    kind: 'desconocido',
    direction: null,
    amount: leerMonto_(monto[1]),
    account_digits: cuenta ? ultimos4_(cuenta[1]) : null,
  })
}

function leerDavivienda_(texto) {
  const campo = (nombre) => {
    const m = new RegExp(`${nombre}:[ \\t]*([^\\n\\r]+)`, 'i').exec(texto)
    return m ? m[1].trim().replace(/,$/, '').trim() : null
  }
  const valor = campo('Valor Transacci[oó]n')
  const clase = campo('Clase de Movimiento')
  if (!valor || !clase) return null
  const lugar = campo('Lugar de Transacci[oó]n')
  const cuenta = /terminada \(o\) en \*+(\d+)/i.exec(texto)
  const f = /(\d{4})\/(\d{2})\/(\d{2})/.exec(campo('Fecha') || '')
  const h = /(\d{1,2}):(\d{2})/.exec(campo('Hora') || '')
  const entra = /^(abono|consignaci|dep[oó]sito|recibi|transferencia recibida)/i.test(clase)
  const c = clase.toLowerCase()
  const kind = c.includes('pago a credito')
    ? 'pago_credito'
    : c.startsWith('compra')
      ? 'compra'
      : c.startsWith('retiro')
        ? 'retiro'
        : entra
          ? 'abono'
          : 'movimiento'
  return {
    bank: 'davivienda',
    kind,
    direction: entra ? 'in' : 'out',
    amount: leerMonto_(valor),
    occurred_at: f ? fechaColombia_(f[1], f[2], f[3], h ? h[1] : 12, h ? h[2] : 0) : null,
    account_digits: cuenta ? ultimos4_(cuenta[1]) : null,
    // En compras el comercio es el lugar; en lo demás, el tipo de movimiento
    counterparty: kind === 'compra' && lugar ? lugar : clase,
    details: { lugar: lugar },
    summary: `${clase}${lugar ? ` · ${lugar}` : ''}`,
  }
}

function leerArq_(asunto, texto) {
  const plano = texto.replace(/\s+/g, ' ')
  const recibido = /received ([\d.,]+) USD from (.+?)(?:\.\s|$)/i.exec(`${asunto}. ${plano}`)
  const f = /Date (\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) GMT/i.exec(plano)
  const fecha = f ? `${f[1]}-${f[2]}-${f[3]}T${dos_(f[4])}:${f[5]}:00Z` : null
  if (recibido) {
    const monto = /Amount Received ([\d.,]+) USD/i.exec(plano)
    const abonado = /Amount Added to Balance ([\d.,]+) USDc?/i.exec(plano)
    const amount = leerMonto_(monto ? monto[1] : recibido[1])
    const added = abonado ? leerMonto_(abonado[1]) : null
    const fee = added != null && amount > added ? Math.round((amount - added) * 100) / 100 : null
    return {
      bank: 'arq',
      kind: 'recibido',
      direction: 'in',
      amount,
      currency: 'USD',
      fee,
      occurred_at: fecha,
      counterparty: recibido[2].trim(),
      details: {},
      summary: asunto,
    }
  }
  // Otros movimientos de ARQ (cambios a pesos, envíos): se registran a mano
  const monto = /([\d.,]+\d) USDc?/i.exec(`${asunto} ${plano}`)
  if (!monto) return null
  return {
    bank: 'arq',
    kind: 'desconocido',
    direction: null,
    amount: leerMonto_(monto[1]),
    currency: 'USD',
    occurred_at: fecha,
    details: {},
    summary: asunto,
  }
}

const MESES_ = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function leerNu_(asunto, texto) {
  const plano = texto.replace(/\s+/g, ' ')

  // Pago de la tarjeta de crédito Nu
  if (/Recibimos (el|tu) pago/i.test(plano)) {
    const monto = /Tu pago fue de \$?\s?([\d.,]+)/i.exec(plano)
    const f = /realizado el (\d{1,2}) (\w+) (\d{4}) (\d{1,2}):(\d{2})(?::\d{2})? ?([AP]M)?/i.exec(
      plano,
    )
    const origen = /Producto origen ([A-ZÁÉÍÓÚÑa-záéíóúñ ]+?) Producto destino/i.exec(plano)
    const destino = /Producto destino [*\s]*(\d{4})/i.exec(plano)
    let fecha = null
    if (f && MESES_[f[2].toLowerCase()]) {
      let hora = Number(f[4])
      if (f[6]) hora = (hora % 12) + (f[6].toUpperCase() === 'PM' ? 12 : 0)
      fecha = fechaColombia_(f[3], MESES_[f[2].toLowerCase()], f[1], hora, f[5])
    }
    if (!monto) return null
    return {
      bank: 'nu',
      kind: 'pago_tarjeta',
      direction: 'in',
      amount: leerMonto_(monto[1]),
      occurred_at: fecha,
      account_digits: destino ? destino[1] : null,
      counterparty: origen ? origen[1].trim() : null,
      details: {},
      summary: asunto,
    }
  }

  // Inversión en un CDT
  if (/Invertiste en un CDT/i.test(`${asunto} ${plano}`)) {
    const monto = /tus \$\s?([\d.,]+)/i.exec(plano)
    if (!monto) return null
    const tasa = /tasa de ([\d.,]+)\s?% efectiva anual/i.exec(plano)
    const dias = /por (\d+) d[ií]as/i.exec(plano)
    const vence = /hasta el (\d{1,2}) de (\w+) del? (\d{4})/i.exec(plano)
    const mes = vence ? MESES_[vence[2].toLowerCase()] : null
    return {
      bank: 'nu',
      kind: 'cdt',
      direction: 'out',
      amount: leerMonto_(monto[1]),
      counterparty: 'CDT Nu',
      details: {
        tasa: tasa ? Number(tasa[1].replace(',', '.')) / 100 : null,
        dias: dias ? Number(dias[1]) : null,
        vence: mes ? `${vence[3]}-${dos_(mes)}-${dos_(vence[1])}` : null,
      },
      summary: asunto,
    }
  }
  // Nu manda muchos correos que no son movimientos: el resto se ignora
  return null
}

// Para las pruebas en Node (Apps Script no tiene `module`)
if (typeof module !== 'undefined') module.exports = { leerCorreo, leerMonto_ }
