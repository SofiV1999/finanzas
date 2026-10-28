-- =====================================================================
-- Finanzas: el saldo de cada cuenta solo suma movimientos desde la fecha de su saldo inicial
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- El saldo inicial es lo que había en la cuenta al empezar ese día. Antes se sumaban también
-- los movimientos anteriores a esa fecha (por ejemplo, alertas viejas importadas de Gmail), que
-- ya estaban dentro del saldo inicial y quedaban contados dos veces. Esos movimientos siguen
-- contando en el presupuesto y los reportes; solo dejan de mover el saldo.
--
-- Para ver antes de correrlo qué cuentas cambian y cuánto:
--
--   select a.name, a.opening_date, count(*) as movimientos,
--          sum(case when t.account_id = a.id
--                   then case when t.type = 'ingreso' then -t.amount else t.amount end
--                   else -coalesce(t.to_amount, t.amount) end) as cambio_del_saldo
--   from public.accounts a
--   join public.transactions t on a.id in (t.account_id, t.to_account_id)
--   where t.date < a.opening_date
--   group by a.name, a.opening_date;
--
-- Si una cuenta aparece y su saldo inicial era de antes de esos movimientos, corrige su
-- "Fecha de ese saldo" en la app en vez de dejar que cambie.
-- =====================================================================

create or replace view public.account_balances with (security_invoker = true) as
with movements as (
  select account_id, date, case when type = 'ingreso' then amount else -amount end as delta
  from public.transactions
  union all
  select to_account_id, date, coalesce(to_amount, amount)
  from public.transactions
  where type = 'traslado'
)
select
  a.id,
  a.user_id,
  a.opening_balance + coalesce(sum(m.delta) filter (where m.date >= a.opening_date), 0) as balance
from public.accounts a
left join movements m on m.account_id = a.id
group by a.id;

-- Seguro mensual de un préstamo (va dentro de la cuota pero no abona a capital ni es interés)
alter table public.accounts
  add column monthly_insurance numeric(14, 2) check (monthly_insurance >= 0);
