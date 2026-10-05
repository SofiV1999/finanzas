-- =====================================================================
-- Finanzas: corrige tildes dañadas y agrega salario en USD
-- Pegar completo en Supabase > SQL Editor > Run.
-- =====================================================================

-- ---------- 1. Corregir tildes ----------
-- El SQL anterior se pegó con la codificación equivocada y las tildes quedaron
-- como "√∫" (ú), "√≥" (ó), etc. Esto las devuelve a su forma correcta.
create function pg_temp.arreglar_tildes(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(t,
    '√°', 'á'), '√©', 'é'), '√≠', 'í'), '√≥', 'ó'), '√∫', 'ú'), '√±', 'ñ'),
    '√Å', 'Á'), '√â', 'É'), '√ç', 'Í'), '√ì', 'Ó'), '√ö', 'Ú'), '√ë', 'Ñ'),
    '√º', 'ü')
$$;

update public.categories
set name = pg_temp.arreglar_tildes(name)
where name like '%√%';

update public.accounts
set name = pg_temp.arreglar_tildes(name)
where name like '%√%';

-- ---------- 2. Salario en USD y TRM de planeación ----------
-- monthly_salary queda expresado en salary_currency.
-- planning_fx_rate: TRM conservadora (COP por 1 USD) con la que se calculan el
-- presupuesto y las metas 50/30/20 cuando el salario es en dólares.
alter table public.settings
  add column salary_currency  text not null default 'COP' check (salary_currency in ('COP', 'USD')),
  add column planning_fx_rate numeric(14, 4) check (planning_fx_rate > 0);

-- ---------- 3. Categorías de seguridad social e impuestos ----------
insert into public.categories (user_id, name, kind, budget_group, is_fixed, sort_order)
select u.id, c.name, 'gasto', 'necesidad', c.is_fixed, c.sort_order
from auth.users u
cross join (values
  ('Seguridad social', true,  19),
  ('Impuestos',        false, 44)
) as c(name, is_fixed, sort_order)
on conflict (user_id, kind, name) do nothing;

-- ---------- 4. Cuenta en dólares (plataforma) ----------
insert into public.accounts (user_id, name, type, currency)
select id, 'Plataforma USD', 'corriente', 'USD' from auth.users
on conflict do nothing;
