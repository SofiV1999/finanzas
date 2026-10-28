-- =====================================================================
-- Finanzas: importar movimientos desde las alertas del banco en Gmail
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- Un script en tu Gmail (gmail/importador.gs) lee las alertas y las envía a
-- ingest_bank_emails con una llave propia. La llave solo sirve para agregar
-- alertas a "Por revisar": no puede leer, cambiar ni borrar nada. Desde la app
-- apruebas cada alerta y se convierte en un movimiento normal.
-- =====================================================================

-- Últimos 4 dígitos con los que el banco nombra cada cuenta (número de cuenta,
-- tarjeta débito, tarjeta de crédito...). Una cuenta puede tener varios.
alter table public.accounts add column match_digits text[] not null default '{}';

-- Llave del script de Gmail: solo se guarda su huella (sha256), nunca la llave
create table public.import_tokens (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

-- Alertas leídas de los correos, pendientes de aprobar
create table public.bank_imports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  -- Id del correo en Gmail: el mismo correo nunca entra dos veces
  message_id          text not null,
  bank                text not null,
  kind                text not null,
  direction           text check (direction in ('in', 'out')),
  amount              numeric(14, 2) check (amount > 0),
  currency            text not null default 'COP' check (currency in ('COP', 'USD')),
  -- Comisión descontada (p. ej. ARQ recibe 2.395 USD y abona 2.392)
  fee                 numeric(14, 2) check (fee > 0),
  occurred_at         timestamptz not null,
  -- Últimos 4 dígitos de tu cuenta o tarjeta
  account_digits      text,
  -- Comercio, persona o tipo de movimiento; y los últimos dígitos o la llave del otro lado
  counterparty        text,
  counterparty_digits text,
  details             jsonb not null default '{}',
  summary             text,
  status              text not null default 'pendiente'
                        check (status in ('pendiente', 'aprobado', 'descartado')),
  transaction_id      uuid references public.transactions on delete set null,
  created_at          timestamptz not null default now(),
  unique (user_id, message_id)
);

create index bank_imports_pending on public.bank_imports (user_id) where status = 'pendiente';

-- Lo que la app aprendió: "TIENDA D1" es Mercado, "*1234" es la cuenta de mamá...
create table public.import_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  -- 'nombre': comercio o persona (el nombre empieza con pattern); 'digitos': cuenta o llave
  match_type       text not null check (match_type in ('nombre', 'digitos')),
  pattern          text not null check (length(pattern) > 0),
  -- Si no es null, la regla solo aplica a movimientos de esta cuenta
  account_id       uuid references public.accounts on delete cascade,
  type             text not null check (type in ('ingreso', 'gasto', 'traslado')),
  category_id      uuid references public.categories on delete cascade,
  -- En traslados: la otra cuenta (destino si sale plata, origen si entra)
  other_account_id uuid references public.accounts on delete cascade,
  description      text,
  -- Comercios con varias categorías (Rappi: mercado o restaurantes): se sugiere la última
  -- usada pero siempre se pregunta
  ask              boolean not null default false,
  created_at       timestamptz not null default now(),
  check (type = 'traslado' or category_id is not null),
  check ((type = 'traslado') = (other_account_id is not null))
);

alter table public.import_tokens enable row level security;
alter table public.bank_imports enable row level security;
alter table public.import_rules enable row level security;

create policy "solo mis filas" on public.import_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo mis filas" on public.bank_imports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo mis filas" on public.import_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.import_tokens, public.bank_imports, public.import_rules from anon;
grant select, insert, update, delete on public.import_tokens to authenticated;
-- Las alertas solo entran por ingest_bank_emails
grant select, update, delete on public.bank_imports to authenticated;
grant select, insert, update, delete on public.import_rules to authenticated;

-- Punto de entrada del script de Gmail. Recibe hasta 100 alertas y devuelve
-- cuántas eran nuevas. Corre con permisos propios, pero solo puede insertar
-- alertas pendientes del dueño de la llave.
create function public.ingest_bank_emails(p_token text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_count integer;
begin
  select user_id into v_user
  from public.import_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null or length(p_token) < 32 then
    raise exception 'Llave inválida' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Se esperaba una lista de máximo 100 alertas' using errcode = '22023';
  end if;

  insert into public.bank_imports (
    user_id, message_id, bank, kind, direction, amount, currency, fee, occurred_at,
    account_digits, counterparty, counterparty_digits, details, summary
  )
  select
    v_user,
    left(i ->> 'message_id', 100),
    left(i ->> 'bank', 20),
    left(i ->> 'kind', 30),
    i ->> 'direction',
    (i ->> 'amount')::numeric,
    coalesce(i ->> 'currency', 'COP'),
    (i ->> 'fee')::numeric,
    (i ->> 'occurred_at')::timestamptz,
    left(i ->> 'account_digits', 4),
    left(i ->> 'counterparty', 120),
    left(i ->> 'counterparty_digits', 60),
    case
      when jsonb_typeof(i -> 'details') = 'object' and length((i -> 'details')::text) <= 2000
        then i -> 'details'
      else '{}'::jsonb
    end,
    left(i ->> 'summary', 400)
  from jsonb_array_elements(p_items) as i
  where i ->> 'message_id' is not null
  on conflict (user_id, message_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.ingest_bank_emails(text, jsonb) from public;
grant execute on function public.ingest_bank_emails(text, jsonb) to anon, authenticated;
