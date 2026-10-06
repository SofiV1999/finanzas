-- =====================================================================
-- Finanzas: movimientos programados (se repiten cada mes)
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- La app genera los movimientos al abrirse: los automáticos se registran solos
-- y los de confirmación aparecen como pendientes. last_done marca la última
-- fecha ya registrada u omitida, así un movimiento borrado no vuelve a aparecer.
-- =====================================================================

create table public.recurring_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  type          text not null check (type in ('ingreso', 'gasto', 'traslado')),
  account_id    uuid not null references public.accounts on delete cascade,
  amount        numeric(14, 2) not null check (amount > 0),
  category_id   uuid references public.categories on delete cascade,
  to_account_id uuid references public.accounts on delete cascade,
  to_amount     numeric(14, 2) check (to_amount > 0),
  description   text,
  -- Día del mes (29-31 caen el último día en los meses más cortos)
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  start_date    date not null,
  end_date      date,
  -- true: se registra solo; false: queda pendiente para confirmar
  auto          boolean not null default true,
  active        boolean not null default true,
  last_done     date,
  created_at    timestamptz not null default now(),
  check ((type = 'traslado') = (to_account_id is not null)),
  check (type = 'traslado' or category_id is not null),
  check (to_account_id is distinct from account_id),
  check (end_date is null or end_date >= start_date)
);

-- Cada movimiento generado guarda de qué programado y de qué fecha viene;
-- el índice único impide duplicados aunque la app esté abierta en dos equipos
alter table public.transactions
  add column recurring_id uuid references public.recurring_transactions on delete set null,
  add column recurring_date date;

create unique index transactions_recurring_unique
  on public.transactions (recurring_id, recurring_date);

alter table public.recurring_transactions enable row level security;
create policy "solo mis filas" on public.recurring_transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.recurring_transactions from anon;
grant select, insert, update, delete on public.recurring_transactions to authenticated;
