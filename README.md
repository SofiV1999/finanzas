# 💰 Finanzas

Aplicación web personal para llevar gastos, ingresos, presupuesto mensual (50/30/20),
deudas (tarjetas y préstamos), ahorros, metas y reportes con gráficas. Se puede instalar
en el celular como app.

Página: https://sofiv1999.github.io/finanzas/

## Secciones

- **Resumen:** patrimonio neto, el mes actual, pendientes del mes, metas y últimos movimientos.
- **Movimientos:** registro de ingresos, gastos y traslados (COP y USD con TRM oficial).
- **Presupuesto:** plantilla mensual con ajustes por mes, ingresos esperados, gastos fijos
  y anuales (con provisión), y 50/30/20.
- **Deudas:** tarjetas y préstamos, división interés/capital de cada cuota, plan bola de
  nieve vs. avalancha, simulador de abono único y tabla de pagos.
- **Ahorros y metas:** cuentas y metas con aporte mensual necesario.
- **Reportes:** gráficas por mes y año.
- **Configuración:** salario, TRM de planeación, metas 50/30/20, categorías e instalación.

## Tecnología

- **Frontend:** React + TypeScript + Vite, gráficas con Recharts
- **Base de datos y login:** [Supabase](https://supabase.com) con Row Level Security
- **App instalable:** vite-plugin-pwa (manifiesto + service worker; los datos no se guardan
  en caché, siempre se piden a Supabase)
- **Publicación:** GitHub Pages (automática al hacer push a `main`)

## Base de datos

Los cambios de esquema están en `supabase/migrations/`, en orden. Cada archivo se pega en
Supabase → SQL Editor → Run.

## Desarrollo local

```bash
cp .env.example .env   # y llena los valores de Supabase
npm install
npm run dev
```

## Configuración de la publicación

En GitHub → *Settings → Secrets and variables → Actions → Variables*, crear:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

La llave "publishable" de Supabase es pública por diseño: los datos se protegen con
Row Level Security, de modo que solo el usuario autenticado puede leer y escribir sus filas.
