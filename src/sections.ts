export type Section = {
  path: string
  label: string
  icon: string
  description: string
  coming: string[]
}

// Secciones de la app. Las de fases futuras muestran qué van a contener.
export const sections: Section[] = [
  {
    path: '/',
    label: 'Resumen',
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
    icon: '📈',
    description: 'Gráficas por mes y año.',
    coming: ['Tendencia de ingresos y gastos', 'Gasto por categoría', 'Comparación entre años'],
  },
  {
    path: '/configuracion',
    label: 'Configuración',
    icon: '⚙️',
    description: 'Categorías, metas 50/30/20 y monedas.',
    coming: ['Categorías editables', 'Porcentajes 50/30/20', 'Salario y moneda principal'],
  },
]
