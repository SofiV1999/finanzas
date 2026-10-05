# 💰 Finanzas

Aplicación web personal para llevar gastos, ingresos, presupuesto mensual (50/30/20),
deudas (tarjetas y préstamos), ahorros, metas y gráficas.

- **Frontend:** React + TypeScript + Vite
- **Base de datos y login:** [Supabase](https://supabase.com)
- **Publicación:** GitHub Pages (automática al hacer push a `main`)

Página: https://sofiv1999.github.io/finanzas/

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
