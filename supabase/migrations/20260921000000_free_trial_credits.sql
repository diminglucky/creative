-- Free plan: grant a single signup trial credit batch and no daily grants.
create or replace function public.init_workspace_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_credits constant integer := 50;
  v_inserted integer;
begin
  insert into public.subscriptions (workspace_id, plan)
  values (NEW.id, 'free')
  on conflict (workspace_id) do nothing;

  insert into public.credit_balances (workspace_id, balance)
  values (NEW.id, v_trial_credits)
  on conflict (workspace_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.credit_transactions
      (workspace_id, user_id, transaction_type, amount, balance_after, description)
    values
      (NEW.id, NEW.owner_user_id, 'bonus', v_trial_credits, v_trial_credits, 'Welcome trial credits');
  end if;

  return NEW;
end;
$$;

-- Free accounts may use only the low-cost image models.
update public.generation_prices
set minimum_plan = 'starter', updated_at = now()
where generation_type = 'image'
  and minimum_plan = 'free'
  and model_id not in (
    'google-official/gemini-2.5-flash-image',
    'google-vertex/gemini-2.5-flash-image',
    'google/nano-banana'
  );

update public.generation_prices
set minimum_plan = 'free', updated_at = now()
where generation_type = 'image'
  and model_id in (
    'google-official/gemini-2.5-flash-image',
    'google-vertex/gemini-2.5-flash-image',
    'google/nano-banana'
  );
