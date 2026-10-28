// Pruebas del lector de alertas: node gmail/importador.test.cjs
// Los ejemplos tienen la forma de alertas reales con nombres y números inventados.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const sandbox = { module: { exports: {} } }
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'importador.gs'), 'utf8'), sandbox)
const { leerCorreo, leerMonto_ } = sandbox.module.exports

const BANCOLOMBIA = 'Bancolombia <alertasynotificaciones@ayn.notificacionesbancolombia.com>'
const DAVIVIENDA = 'BANCO_DAVIVIENDA@davivienda.com'
const ARQ = 'ARQ <no-reply@arqfinance.com>'
const NU = 'Nu Colombia <nu@nu.com.co>'
const FECHA_CORREO = '2026-10-20T15:00:00.000Z'

const leer = (from, body, subject = 'Alertas y Notificaciones') =>
  JSON.parse(JSON.stringify(leerCorreo({ from, subject, body, date: FECHA_CORREO })))

let pasadas = 0
function caso(nombre, fn) {
  try {
    fn()
    pasadas++
  } catch (e) {
    console.error(`✗ ${nombre}\n${e.message}`)
    process.exitCode = 1
  }
}

const parcial = (real, esperado) => {
  for (const [k, v] of Object.entries(esperado)) assert.deepEqual(real[k], v, `campo ${k}`)
}

caso('montos en los formatos de los bancos', () => {
  assert.equal(leerMonto_('COP24.490,00'), 24490)
  assert.equal(leerMonto_('$26,100'), 26100)
  assert.equal(leerMonto_('$39,600.00'), 39600)
  assert.equal(leerMonto_('$93.558,00'), 93558)
  assert.equal(leerMonto_('$4.120,47'), 4120.47)
  assert.equal(leerMonto_('$1,543,000'), 1543000)
  assert.equal(leerMonto_('$2.170.218,00'), 2170218)
  assert.equal(leerMonto_('2,395'), 2395)
  assert.equal(leerMonto_('12.50'), 12.5)
})

caso('Bancolombia: compra con tarjeta de crédito', () => {
  const a = leer(
    BANCOLOMBIA,
    `¡Listo!
Todo salió bien con tus movimientos

Bancolombia: Compraste COP24.490,00 en Rappi CO - PRO, el 28/10/2026 a las 07:51. Esta compra esta asociada a T.Cred *1111. Si tienes dudas, encuentranos aqui: 018000931987. Siempre contigo....`,
  )
  parcial(a, {
    bank: 'bancolombia',
    kind: 'compra',
    direction: 'out',
    amount: 24490,
    currency: 'COP',
    counterparty: 'Rappi CO - PRO',
    account_digits: '1111',
    occurred_at: '2026-10-28T07:51:00-05:00',
    details: { tarjeta: 'credito' },
  })
})

caso('Bancolombia: compra con tarjeta débito', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: Compraste $489.790,00 en TIENDA D1 MANILA con tu T.Deb *2222, el 14/08/2026 a las 11:35. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.',
  )
  parcial(a, {
    kind: 'compra',
    amount: 489790,
    counterparty: 'TIENDA D1 MANILA',
    account_digits: '2222',
    occurred_at: '2026-08-14T11:35:00-05:00',
    details: { tarjeta: 'debito' },
  })
})

caso('Bancolombia: transferencia a una cuenta', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: Transferiste $26,100 desde tu cuenta *3333 a la cuenta *09876543210 el 25/10/2026 a las 20:10. ¿Dudas? Llamanos al 018000931987. Estamos cerca.',
  )
  parcial(a, {
    kind: 'transferencia',
    direction: 'out',
    amount: 26100,
    account_digits: '3333',
    counterparty_digits: '3210',
    occurred_at: '2026-10-25T20:10:00-05:00',
  })
  assert.ok(!a.summary.includes('09876543210'), 'el número completo no se envía')
  assert.ok(a.summary.includes('•••3210'))
})

caso('Bancolombia: transferencia a una llave', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: ANA, transferiste $115,000.00 a la llave @abc123 desde tu cuenta *3333 a PEDRO PEREZ el 15/10/26 a las 21:25. Con Bre-b es de una y gratis. Dudas al 018000912345.',
  )
  parcial(a, {
    kind: 'transferencia',
    amount: 115000,
    account_digits: '3333',
    counterparty: 'PEDRO PEREZ',
    counterparty_digits: '@abc123',
    occurred_at: '2026-10-15T21:25:00-05:00',
  })
})

caso('Bancolombia: transferencia recibida', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: Recibiste una transferencia por $72,400 de MARIA GOMEZ en tu cuenta **3333, el 25/10/2026 a las 15:34. Si tienes dudas, hablemos: 018000931987. Siempre a tu lado.',
  )
  parcial(a, {
    kind: 'recibido',
    direction: 'in',
    amount: 72400,
    counterparty: 'MARIA GOMEZ',
    account_digits: '3333',
    occurred_at: '2026-10-25T15:34:00-05:00',
  })
})

caso('Bancolombia: pago con QR', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: ANA PEREZ pagaste $39,600.00 por codigo QR desde tu cuenta *3333 a la llave 0011223344 el 25/10/2026 a las 19:20. Con codigo QR es facil y de una. Dudas al 018000912345.',
  )
  parcial(a, {
    kind: 'qr',
    amount: 39600,
    account_digits: '3333',
    counterparty_digits: '3344',
    occurred_at: '2026-10-25T19:20:00-05:00',
  })
})

caso('Bancolombia: factura programada', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia informa pago Factura Programada TIGO SERVICIOS Ref 12345678 por $93.558,00 desde Aho*3333. 06/10/2026. Inquietudes 6045109095/018000931987.',
  )
  parcial(a, {
    kind: 'factura',
    amount: 93558,
    counterparty: 'TIGO SERVICIOS',
    account_digits: '3333',
    occurred_at: '2026-10-06T12:00:00-05:00',
  })
})

caso('Bancolombia: pago de tarjeta de crédito', () => {
  const a = leer(
    BANCOLOMBIA,
    `Notificación
Transaccional

Bancolombia: Pagaste $384,289 en la tarjeta de credito *1111 desde la cuenta *3333, el 01/10/2026 18:02. ¿Dudas? Llamanos al 018000912345. Estamos cerca.`,
  )
  parcial(a, {
    kind: 'pago_tarjeta',
    direction: 'out',
    amount: 384289,
    account_digits: '3333',
    counterparty_digits: '1111',
    occurred_at: '2026-10-01T18:02:00-05:00',
  })
})

caso('Bancolombia: formato nuevo queda como desconocido', () => {
  const a = leer(
    BANCOLOMBIA,
    'Bancolombia: Retiraste $200.000,00 en el cajero CENTRO de tu cuenta *3333 el 02/10/2026 a las 09:15. Estamos cerca.',
  )
  parcial(a, { kind: 'desconocido', amount: 200000, account_digits: '3333' })
})

caso('Bancolombia: publicidad se ignora', () => {
  assert.equal(leer(BANCOLOMBIA, '¡Conoce nuestros nuevos beneficios!'), null)
})

const davivienda = (fecha, hora, valor, clase, lugar) => `Apreciado(a) ANA:

Le informamos que se ha registrado el siguiente movimiento de su Cta de Ahorros terminada (o) en ****4444:

Fecha: ${fecha}
Hora: ${hora}
Valor Transacción: ${valor}
Clase de Movimiento: ${clase},
Lugar de Transacción: ${lugar}


Atentamente,

BANCO DAVIVIENDA S.A.`

caso('Davivienda: descuento de la cuota del crédito', () => {
  const a = leer(
    DAVIVIENDA,
    davivienda(
      '2026/09/28',
      '20:07:43',
      '$1,543,000',
      'Descuento Pago a Credito',
      'BTA PROCESOS ESP.',
    ),
    'DAVIVIENDA',
  )
  parcial(a, {
    bank: 'davivienda',
    kind: 'pago_credito',
    direction: 'out',
    amount: 1543000,
    account_digits: '4444',
    counterparty: 'Descuento Pago a Credito',
    occurred_at: '2026-09-28T20:07:00-05:00',
  })
})

caso('Davivienda: abono por llave', () => {
  const a = leer(
    DAVIVIENDA,
    davivienda(
      '2026/10/08',
      '10:30:09',
      '$2,000,000',
      'Abono Transferencia a su llave',
      'Llaves Bre-B',
    ),
    'DAVIVIENDA',
  )
  parcial(a, {
    kind: 'abono',
    direction: 'in',
    amount: 2000000,
    account_digits: '4444',
    counterparty: 'Abono Transferencia a su llave',
    occurred_at: '2026-10-08T10:30:00-05:00',
  })
})

caso('ARQ: dólares recibidos con comisión', () => {
  const a = leer(
    ARQ,
    `Hello Ana,

You have received 2,395 USD from ACME LTD.
2,392 USDc has been added to your balance.

You can find the details below:

From

ACME LTD

Amount Received

2,395 USD

Amount Added to Balance

2,392 USDc

Date

2026-10-05 13:43 GMT`,
    'You received 2,395 USD from ACME LTD',
  )
  parcial(a, {
    bank: 'arq',
    kind: 'recibido',
    direction: 'in',
    amount: 2395,
    fee: 3,
    currency: 'USD',
    counterparty: 'ACME LTD',
    occurred_at: '2026-10-05T13:43:00Z',
  })
})

caso('Nu: pago de la tarjeta', () => {
  const a = leer(
    NU,
    `¡Recibimos tu pago! Ya puedes estar relax.
Hola, Ana:
Recibimos el pago que hiciste de tu Tarjeta de crédito Nu.
Estos son los detalles de lo que pagaste:
Tu pago fue de
$4.120,47

Lo has realizado el
14 julio 2026 3:21:17 PM

Tipo de transacción
Pago en linea

Costo de transacción
$0

Producto origen
BANCOLOMBIA

Producto destino
**** **** **** 5555

ID transacción
00000000-0000-0000-0000-000000000000`,
    '¡Ya entró tu pago!',
  )
  parcial(a, {
    bank: 'nu',
    kind: 'pago_tarjeta',
    direction: 'in',
    amount: 4120.47,
    account_digits: '5555',
    counterparty: 'BANCOLOMBIA',
    occurred_at: '2026-07-14T15:21:00-05:00',
  })
})

caso('Nu: inversión en CDT', () => {
  const a = leer(
    NU,
    `Invertiste en un CDT Nu
Hola, Ana:
Nos emociona contarte que tus $2.170.218,00 estarán creciendo a una tasa de 10,50% efectiva anual por 180 días, hasta el 03 de abril del 2027.`,
    '¡Felicitaciones, Ana! Invertiste en un CDT Nu',
  )
  parcial(a, {
    kind: 'cdt',
    amount: 2170218,
    occurred_at: FECHA_CORREO,
    details: { tasa: 0.105, dias: 180, vence: '2027-04-03' },
  })
})

caso('Nu: publicidad se ignora', () => {
  assert.equal(leer(NU, 'Conoce las cajitas de Nu', 'Tu plata crece'), null)
})

console.log(`${pasadas} pruebas pasaron`)
