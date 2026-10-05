-- =====================================================================
-- Finanzas: esquema inicial
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- Modelo: todo movimiento sale de una CUENTA. Las tarjetas de crédito y los
-- préstamos también son cuentas, con saldo negativo (lo que se debe):
--   * gasto     -> resta de la cuenta (una compra con tarjeta aumenta la deuda)
--   * ingreso   -> suma a la cuenta
--   * traslado  -> sale de una cuenta y entra a otra (pagar la tarjeta,
--                  ahorrar, invertir). No es gasto ni ingreso.
-- Patrimonio neto = suma de los saldos de todas las cuentas.
-- =====================================================================

-- ---------- Configuración general (una fila por usuario) ----------
create table public.settings (
  user_id        uuid primary key default auth.uid() references auth.users on delete cascade,
  base_currency  text not null default 'COP' check (base_currency in ('COP', 'USD')),
  monthly_salary numeric(14, 2) not null default 0,
  needs_pct      numeric(5, 4) not null default 0.50,
  wants_pct      numeric(5, 4) not null default 0.30,
  savings_pct    numeric(5, 4) not null default 0.20,
  updated_at     timestamptz not null default now()
);

-- ---------- Categorías de ingresos y gastos ----------
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('ingreso', 'gasto')),
  -- Grupo 50/30/20; solo aplica a gastos
  budget_group   text check (budget_group in ('necesidad', 'deseo', 'ahorro')),
  -- Gasto fijo = factura que se repite cada mes
  is_fixed       boolean not null default false,
  -- Presupuesto mensual base (la "plantilla"); cada mes se puede ajustar en budgets
  default_budget numeric(14, 2) not null default 0 check (default_budget >= 0),
  sort_order     int not null default 0,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, kind, name),
  check ((kind = 'gasto') = (budget_group is not null))
);

-- ---------- Cuentas: ahorros, inversiones, tarjetas, préstamos ----------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  name            text not null,
  type            text not null check (type in (
                    'efectivo', 'ahorros', 'corriente', 'cdt', 'inversion', 'cripto',
                    'tarjeta_credito', 'prestamo', 'otro')),
  currency        text not null default 'COP' check (currency in ('COP', 'USD')),
  -- Saldo al empezar a usar la app. Negativo para deudas (tarjetas y préstamos).
  opening_balance numeric(14, 2) not null default 0,
  opening_date    date not null default current_date,
  -- Tasa efectiva anual (0.28 = 28% E.A.). Deudas y también rendimiento de ahorros/CDT.
  annual_rate     numeric(7, 4) check (annual_rate >= 0),
  -- Tarjetas de crédito
  credit_limit    numeric(14, 2) check (credit_limit >= 0),
  statement_day   smallint check (statement_day between 1 and 31),
  due_day         smallint check (due_day between 1 and 31),
  -- Préstamos
  original_amount numeric(14, 2) check (original_amount >= 0),
  min_payment     numeric(14, 2) check (min_payment >= 0),
  term_months     int check (term_months > 0),
  archived        boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- Movimientos ----------
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  date          date not null default current_date,
  type          text not null check (type in ('ingreso', 'gasto', 'traslado')),
  account_id    uuid not null references public.accounts on delete restrict,
  amount        numeric(14, 2) not null check (amount > 0),
  category_id   uuid references public.categories on delete restrict,
  -- Solo traslados: cuenta destino y monto recibido (si las monedas son distintas)
  to_account_id uuid references public.accounts on delete restrict,
  to_amount     numeric(14, 2) check (to_amount > 0),
  -- TRM (COP por 1 USD) usada para convertir movimientos en USD
  fx_rate       numeric(14, 4) check (fx_rate > 0),
  description   text,
  created_at    timestamptz not null default now(),
  check ((type = 'traslado') = (to_account_id is not null)),
  check (type = 'traslado' or category_id is not null),
  check (to_account_id is distinct from account_id)
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);

-- ---------- Presupuesto por mes (ajustes sobre la plantilla) ----------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  month       date not null check (extract(day from month) = 1),
  category_id uuid not null references public.categories on delete cascade,
  amount      numeric(14, 2) not null default 0 check (amount >= 0),
  unique (user_id, month, category_id)
);

-- ---------- Metas financieras ----------
-- El avance de una meta es el saldo de la cuenta vinculada (p. ej. un bolsillo).
create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  name               text not null,
  target_amount      numeric(14, 2) not null check (target_amount > 0),
  currency           text not null default 'COP' check (currency in ('COP', 'USD')),
  target_date        date,
  account_id         uuid references public.accounts on delete set null,
  expected_return_ea numeric(7, 4) not null default 0 check (expected_return_ea >= 0),
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- Tasas de cambio (TRM) ----------
create table public.fx_rates (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  date     date not null,
  currency text not null check (currency in ('USD')),
  rate     numeric(14, 4) not null check (rate > 0),
  source   text not null default 'manual',
  primary key (user_id, date, currency)
);

-- ---------- Saldo actual de cada cuenta ----------
create view public.account_balances with (security_invoker = true) as
with movements as (
  select account_id, case when type = 'ingreso' then amount else -amount end as delta
  from public.transactions
  union all
  select to_account_id, coalesce(to_amount, amount)
  from public.transactions
  where type = 'traslado'
)
select
  a.id,
  a.user_id,
  a.opening_balance + coalesce(sum(m.delta), 0) as balance
from public.accounts a
left join movements m on m.account_id = a.id
group by a.id;

-- ---------- Seguridad: cada usuario solo ve y edita sus propias filas ----------
do $$
declare
  t text;
begin
  foreach t in array array['settings', 'categories', 'accounts', 'transactions', 'budgets', 'goals', 'fx_rates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "solo mis filas" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

-- ---------- Datos iniciales (tomados del Excel) para los usuarios existentes ----------
insert into public.settings (user_id)
select id from auth.users
on conflict do nothing;

insert into public.categories (user_id, name, kind, budget_group, is_fixed, sort_order)
select u.id, c.name, c.kind, c.budget_group, c.is_fixed, c.sort_order
from auth.users u
cross join (values
  -- Gastos fijos (facturas)
  ('Arriendo / Vivienda',             'gasto', 'necesidad', true,  10),
  ('Servicios públicos',              'gasto', 'necesidad', true,  11),
  ('Internet',                        'gasto', 'necesidad', true,  12),
  ('Plan celular',                    'gasto', 'necesidad', true,  13),
  ('Seguros',                         'gasto', 'necesidad', true,  14),
  ('Suscripciones',                   'gasto', 'deseo',     true,  15),
  ('Gimnasio',                        'gasto', 'deseo',     true,  16),
  ('Seguro / mantenimiento vehículo', 'gasto', 'necesidad', true,  17),
  ('Educación fija',                  'gasto', 'necesidad', true,  18),
  -- Gastos variables
  ('Mercado',                         'gasto', 'necesidad', false, 30),
  ('Transporte',                      'gasto', 'necesidad', false, 31),
  ('Restaurantes',                    'gasto', 'deseo',     false, 32),
  ('Entretenimiento',                 'gasto', 'deseo',     false, 33),
  ('Salud',                           'gasto', 'necesidad', false, 34),
  ('Cuidado personal',                'gasto', 'necesidad', false, 35),
  ('Hogar',                           'gasto', 'necesidad', false, 36),
  ('Ropa',                            'gasto', 'deseo',     false, 37),
  ('Educación',                       'gasto', 'necesidad', false, 38),
  ('Vacaciones',                      'gasto', 'deseo',     false, 39),
  ('Mascotas',                        'gasto', 'necesidad', false, 40),
  ('Regalos',                         'gasto', 'deseo',     false, 41),
  ('Misceláneos',                     'gasto', 'deseo',     false, 42),
  ('Intereses y comisiones',          'gasto', 'necesidad', false, 43),
  -- Ingresos
  ('Salario',                         'ingreso', null,      false, 60),
  ('Freelance',                       'ingreso', null,      false, 61),
  ('Prima',                           'ingreso', null,      false, 62),
  ('Bonos',                           'ingreso', null,      false, 63),
  ('Rendimientos',                    'ingreso', null,      false, 64),
  ('Otros ingresos',                  'ingreso', null,      false, 65)
) as c(name, kind, budget_group, is_fixed, sort_order)
on conflict (user_id, kind, name) do nothing;

insert into public.accounts (user_id, name, type, currency)
select id, 'Efectivo', 'efectivo', 'COP' from auth.users
on conflict do nothing;
