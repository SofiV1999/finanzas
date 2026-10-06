-- =====================================================================
-- Finanzas: categorías con frecuencia anual
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- frequency = 'anual': default_budget es el costo anual, se presupuesta en
-- due_month (1-12) y el resto de meses se provisiona 1/12 de ese valor.
-- =====================================================================

alter table public.categories
  add column frequency text not null default 'mensual' check (frequency in ('mensual', 'anual')),
  add column due_month smallint check (due_month between 1 and 12);

alter table public.categories
  add constraint categories_anual_tiene_mes check (frequency = 'mensual' or due_month is not null);
