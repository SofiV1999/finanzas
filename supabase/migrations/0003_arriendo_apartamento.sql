-- =====================================================================
-- Finanzas: categorías del apartamento que se arrienda
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- El ingreso esperado de cada categoría de ingreso se guarda en
-- categories.default_budget (igual que el presupuesto de un gasto) y se suma
-- al ingreso planeado del mes junto con el salario.
-- =====================================================================

insert into public.categories (user_id, name, kind, budget_group, is_fixed, sort_order)
select u.id, c.name, c.kind, c.budget_group, c.is_fixed, c.sort_order
from auth.users u
cross join (values
  ('Arriendo apartamento',       'ingreso', null,        true,  61),
  ('Administración apartamento', 'gasto',   'necesidad', true,  20),
  ('Predial',                    'gasto',   'necesidad', false, 45),
  ('Mantenimiento apartamento',  'gasto',   'necesidad', false, 46)
) as c(name, kind, budget_group, is_fixed, sort_order)
on conflict (user_id, kind, name) do nothing;
