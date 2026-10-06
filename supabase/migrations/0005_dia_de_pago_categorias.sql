-- =====================================================================
-- Finanzas: día de pago de las facturas fijas y gastos anuales
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- Se usa para los recordatorios del calendario: mensuales el due_day de cada
-- mes; anuales el due_day del mes due_month.
-- =====================================================================

alter table public.categories
  add column due_day smallint check (due_day between 1 and 31);
