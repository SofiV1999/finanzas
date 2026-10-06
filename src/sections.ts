export type Section = {
  path: string
  label: string
  // Etiqueta corta para la barra inferior del celular
  short: string
  icon: string
  description: string
}

// Secciones de la app (menú lateral y barra inferior del celular)
export const sections: Section[] = [
  {
    path: '/',
    label: 'Resumen',
    short: 'Inicio',
    icon: '📊',
    description: 'Tu panorama financiero de un vistazo.',
  },
  {
    path: '/movimientos',
    label: 'Movimientos',
    short: 'Movim.',
    icon: '🧾',
    description: 'Registro único de ingresos, gastos, pagos y traslados.',
  },
  {
    path: '/presupuesto',
    label: 'Presupuesto',
    short: 'Presup.',
    icon: '🎯',
    description: 'Presupuesto mensual por categoría.',
  },
  {
    path: '/deudas',
    label: 'Deudas',
    short: 'Deudas',
    icon: '💳',
    description: 'Tarjetas de crédito y préstamos.',
  },
  {
    path: '/ahorros',
    label: 'Ahorros y metas',
    short: 'Ahorros',
    icon: '🏦',
    description: 'Cuentas, inversiones y metas financieras.',
  },
  {
    path: '/reportes',
    label: 'Reportes',
    short: 'Reportes',
    icon: '📈',
    description: 'Gráficas por mes y año.',
  },
  {
    path: '/configuracion',
    label: 'Configuración',
    short: 'Ajustes',
    icon: '⚙️',
    description: 'Categorías, metas 50/30/20 y monedas.',
  },
]
