export type Section = {
  path: string
  label: string
  // Etiqueta corta para la barra inferior del celular
  short: string
  icon: string
  description: string
  coming: string[]
}

// Secciones de la app. Las de fases futuras muestran qué van a contener.
export const sections: Section[] = [
  {
    path: '/',
    label: 'Resumen',
    short: 'Inicio',
    icon: '📊',
    description: 'Tu panorama financiero de un vistazo.',
    coming: [
      'Patrimonio neto (lo que tienes − lo que debes)',
      'Ingresos y gastos del mes',
      '50/30/20 real vs. meta',
      'Presupuesto por categoría y próximos pagos de tarjetas',
    ],
  },
  {
    path: '/movimientos',
    label: 'Movimientos',
    short: 'Movim.',
    icon: '🧾',
    description: 'Registro único de ingresos, gastos, pagos y traslados.',
    coming: [
      'Registro sin límite de filas',
      'Filtros por mes, año, categoría y cuenta',
      'Montos en COP y USD con TRM automática',
    ],
  },
  {
    path: '/presupuesto',
    label: 'Presupuesto',
    short: 'Presup.',
    icon: '🎯',
    description: 'Presupuesto mensual por categoría.',
    coming: [
      'Plantilla base que se copia cada mes',
      'Gastos fijos (facturas) y variables',
      'Presupuestado vs. real',
    ],
  },
  {
    path: '/deudas',
    label: 'Deudas',
    short: 'Deudas',
    icon: '💳',
    description: 'Tarjetas de crédito y préstamos.',
    coming: [
      'Tarjetas: cupo, fecha de corte y de pago',
      'Préstamos con amortización (tasa E.A.)',
      'Bola de nieve vs. avalancha y simulador de pagos extra',
    ],
  },
  {
    path: '/ahorros',
    label: 'Ahorros y metas',
    short: 'Ahorros',
    icon: '🏦',
    description: 'Cuentas, inversiones y metas financieras.',
    coming: [
      'Cuentas de ahorro, CDT, fondos e inversiones',
      'Metas con monto y fecha (inversión, emergencia…)',
      'Avance de cada meta',
    ],
  },
  {
    path: '/reportes',
    label: 'Reportes',
    short: 'Reportes',
    icon: '📈',
    description: 'Gráficas por mes y año.',
    coming: ['Tendencia de ingresos y gastos', 'Gasto por categoría', 'Comparación entre años'],
  },
  {
    path: '/configuracion',
    label: 'Configuración',
    short: 'Ajustes',
    icon: '⚙️',
    description: 'Categorías, metas 50/30/20 y monedas.',
    coming: ['Categorías editables', 'Porcentajes 50/30/20', 'Salario y moneda principal'],
  },
]
