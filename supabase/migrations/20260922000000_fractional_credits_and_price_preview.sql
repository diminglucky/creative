-- Allow fractional credit costs and balances.
alter table public.credit_balances
  alter column balance type numeric(14,4) using balance::numeric(14,4);
alter table public.credit_transactions
  alter column amount type numeric(14,4) using amount::numeric(14,4),
  alter column balance_after type numeric(14,4) using balance_after::numeric(14,4);
alter table public.billing_charges
  alter column credits_charged type numeric(14,4) using credits_charged::numeric(14,4);
alter table public.background_jobs
  alter column credits_cost type numeric(14,4) using credits_cost::numeric(14,4);
alter table public.generation_prices
  alter column credit_price type numeric(14,4) using credit_price::numeric(14,4);

drop function if exists public.deduct_credits(uuid, uuid, integer, uuid, text);
create function public.deduct_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_job_id uuid,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_balance numeric(14,4);
  v_new_balance numeric(14,4);
  v_version integer;
  v_tx_id uuid;
begin
  select balance, version into v_balance, v_version
  from public.credit_balances
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'NO_BALANCE: No credit balance found for workspace %', p_workspace_id;
  end if;

  v_new_balance := v_balance - p_amount;
  if v_new_balance < 0 then
    raise exception 'INSUFFICIENT_CREDITS: have %, need %', v_balance, p_amount;
  end if;

  update public.credit_balances
  set balance = v_new_balance, version = v_version + 1, updated_at = now()
  where workspace_id = p_workspace_id and version = v_version;
  if not found then
    raise exception 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  end if;

  insert into public.credit_transactions
    (workspace_id, user_id, transaction_type, amount, balance_after, job_id, description)
  values
    (p_workspace_id, p_user_id, 'generation_deduct', -p_amount, v_new_balance, p_job_id, p_description)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

drop function if exists public.refund_credits(uuid, uuid, integer, uuid, text);
create function public.refund_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_job_id uuid,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_balance numeric(14,4);
  v_version integer;
  v_new_balance numeric(14,4);
  v_tx_id uuid;
begin
  select balance, version into v_balance, v_version
  from public.credit_balances
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'NO_BALANCE: No credit balance found for workspace %', p_workspace_id;
  end if;

  v_new_balance := v_balance + p_amount;
  update public.credit_balances
  set balance = v_new_balance, version = v_version + 1, updated_at = now()
  where workspace_id = p_workspace_id and version = v_version;
  if not found then
    raise exception 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  end if;

  insert into public.credit_transactions
    (workspace_id, user_id, transaction_type, amount, balance_after, job_id, description)
  values
    (p_workspace_id, p_user_id, 'generation_refund', p_amount, v_new_balance, p_job_id, p_description)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

drop function if exists public.claim_daily_credits(uuid, integer);
create function public.claim_daily_credits(
  p_workspace_id uuid,
  p_amount numeric
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_version integer;
  v_balance numeric(14,4);
  v_new_balance numeric(14,4);
begin
  if exists (
    select 1 from public.daily_credit_claims
    where workspace_id = p_workspace_id and claim_date = current_date
  ) then
    return false;
  end if;

  select balance, version into v_balance, v_version
  from public.credit_balances
  where workspace_id = p_workspace_id
  for update;

  if not found then
    insert into public.credit_balances (workspace_id, balance, version)
    values (p_workspace_id, 0, 0)
    on conflict (workspace_id) do nothing;
    select balance, version into v_balance, v_version
    from public.credit_balances
    where workspace_id = p_workspace_id
    for update;
  end if;

  v_new_balance := v_balance + p_amount;
  update public.credit_balances
  set balance = v_new_balance, version = v_version + 1, updated_at = now()
  where workspace_id = p_workspace_id and version = v_version;

  insert into public.daily_credit_claims (workspace_id, claim_date, amount)
  values (p_workspace_id, current_date, ceil(p_amount)::integer);

  insert into public.credit_transactions
    (workspace_id, transaction_type, amount, balance_after, description)
  values
    (p_workspace_id, 'daily_grant', p_amount, v_new_balance, 'Daily free credits');

  return true;
end;
$$;

drop function if exists public.grant_plan_credits(uuid, public.subscription_plan, integer);
create function public.grant_plan_credits(
  p_workspace_id uuid,
  p_plan public.subscription_plan,
  p_credits numeric
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_balance numeric(14,4);
  v_new_balance numeric(14,4);
  v_version integer;
begin
  update public.subscriptions
  set plan = p_plan, updated_at = now()
  where workspace_id = p_workspace_id;

  if not found then
    raise exception 'NO_SUBSCRIPTION: No subscription found for workspace %', p_workspace_id;
  end if;

  if p_credits <= 0 then
    select coalesce(balance, 0) into v_new_balance
    from public.credit_balances where workspace_id = p_workspace_id;
    return coalesce(v_new_balance, 0);
  end if;

  select balance, version into v_balance, v_version
  from public.credit_balances where workspace_id = p_workspace_id for update;

  if not found then
    insert into public.credit_balances (workspace_id, balance, version)
    values (p_workspace_id, 0, 0)
    on conflict (workspace_id) do nothing;
    select balance, version into v_balance, v_version
    from public.credit_balances where workspace_id = p_workspace_id for update;
  end if;

  v_new_balance := v_balance + p_credits;
  update public.credit_balances
  set balance = v_new_balance, version = v_version + 1, updated_at = now()
  where workspace_id = p_workspace_id and version = v_version;
  if not found then
    raise exception 'CONCURRENT_MODIFICATION: credit balance was modified concurrently';
  end if;

  insert into public.credit_transactions
    (workspace_id, transaction_type, amount, balance_after, description)
  values
    (p_workspace_id, 'subscription_grant', p_credits, v_new_balance,
     'Plan upgraded to ' || p_plan::text || ' — monthly credits granted');

  return v_new_balance;
end;
$$;

drop function if exists public.adjust_wallet_balance(uuid, text, bigint, text, uuid, text);
create function public.adjust_wallet_balance(
  p_user_id uuid,
  p_payment_method text,
  p_amount numeric,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_email text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_balance numeric(14,4);
begin
  if p_payment_method not in ('credits','money') or p_amount = 0 then
    raise exception 'INVALID_ADJUSTMENT';
  end if;

  select id into v_workspace_id
  from public.workspaces
  where owner_user_id = p_user_id and type = 'personal'
  limit 1;
  if v_workspace_id is null then raise exception 'WORKSPACE_NOT_FOUND'; end if;

  if p_payment_method = 'credits' then
    insert into public.credit_balances(workspace_id, balance) values(v_workspace_id, 0) on conflict do nothing;
    update public.credit_balances
    set balance = balance + p_amount, version = version + 1, updated_at = now()
    where workspace_id = v_workspace_id and balance + p_amount >= 0
    returning balance into v_balance;
    if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;

    insert into public.credit_transactions
      (workspace_id, user_id, transaction_type, amount, balance_after, description)
    values
      (v_workspace_id, p_user_id, 'admin_adjustment', p_amount, v_balance, p_reason);
  else
    insert into public.money_wallets(workspace_id) values(v_workspace_id) on conflict do nothing;
    update public.money_wallets
    set balance_fen = balance_fen + p_amount::bigint, version = version + 1, updated_at = now()
    where workspace_id = v_workspace_id and balance_fen + p_amount::bigint >= 0
    returning balance_fen into v_balance;
    if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;
  end if;

  insert into public.admin_audit_logs
    (actor_user_id, actor_email, action, resource_type, resource_id, details)
  values
    (p_actor_user_id, p_actor_email, 'user.balance.adjusted', 'user', p_user_id::text,
     jsonb_build_object('paymentMethod', p_payment_method, 'amount', p_amount, 'reason', p_reason));
end;
$$;

drop function if exists public.grant_credit_pack_purchase(uuid, text, text, integer);
create function public.grant_credit_pack_purchase(
  p_workspace_id uuid,
  p_pack_id text,
  p_provider_order_id text,
  p_amount_fen integer
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_pack public.credit_packs%rowtype;
  v_balance numeric(14,4);
begin
  perform pg_advisory_xact_lock(hashtextextended('credit-purchase:lemon_squeezy:' || p_provider_order_id, 0));
  select balance_after into v_balance
  from public.credit_transactions
  where transaction_type = 'purchase'
    and metadata->>'provider_order_id' = p_provider_order_id
  order by created_at desc limit 1;
  if found then return v_balance; end if;

  select * into v_pack
  from public.credit_packs
  where id = p_pack_id and enabled
  for share;
  if not found then raise exception 'CREDIT_PACK_NOT_FOUND'; end if;

  insert into public.credit_balances(workspace_id, balance, version)
  values (p_workspace_id, v_pack.credits, 1)
  on conflict (workspace_id) do update
    set balance = public.credit_balances.balance + v_pack.credits,
        version = public.credit_balances.version + 1,
        updated_at = now()
  returning balance into v_balance;

  insert into public.credit_purchase_orders
    (provider_order_id, workspace_id, pack_id, credits, base_credits, bonus_credits, total_credits, amount_fen, status)
  values
    (p_provider_order_id, p_workspace_id, p_pack_id, v_pack.credits, v_pack.base_credits,
     v_pack.bonus_credits, v_pack.credits, p_amount_fen, 'paid');

  insert into public.credit_transactions
    (workspace_id, transaction_type, amount, balance_after, description, metadata)
  values
    (p_workspace_id, 'purchase', v_pack.credits, v_balance, 'Permanent credit pack purchase',
     jsonb_build_object(
       'provider','lemon_squeezy',
       'provider_order_id',p_provider_order_id,
       'pack_id',p_pack_id,
       'amount_fen',p_amount_fen,
       'base_credits',v_pack.base_credits,
       'bonus_credits',v_pack.bonus_credits,
       'total_credits',v_pack.credits
     ));

  return v_balance;
end;
$$;

-- Recreate charge/refund wrappers against the numeric functions.
create or replace function public.charge_generation(
  p_workspace_id uuid,
  p_user_id uuid,
  p_model_id text,
  p_generation_type text,
  p_idempotency_key text,
  p_requested_method text default null,
  p_duration_seconds integer default null,
  p_quality text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_price public.generation_prices%rowtype;
  v_charge public.billing_charges%rowtype;
  v_credit_balance numeric(14,4);
  v_credit_tx_id uuid;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generation-charge:' || p_idempotency_key, 0));
  select * into v_charge from public.billing_charges where idempotency_key = p_idempotency_key;
  if found then
    if v_charge.workspace_id <> p_workspace_id or v_charge.user_id <> p_user_id
      or v_charge.model_id <> p_model_id or v_charge.generation_type <> p_generation_type then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('charge_id',v_charge.id,'payment_method','credits',
      'credits_charged',v_charge.credits_charged,'money_charged_fen',0);
  end if;

  select * into v_price
  from public.generation_prices
  where model_id = p_model_id and generation_type = p_generation_type and enabled
  for share;
  if not found then raise exception 'PRICE_NOT_FOUND'; end if;

  select balance into v_credit_balance
  from public.credit_balances
  where workspace_id = p_workspace_id
  for update;
  if coalesce(v_credit_balance, 0) < v_price.credit_price then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_credit_tx_id := public.deduct_credits(
    p_workspace_id, p_user_id, v_price.credit_price, null,
    'Generation charge ' || p_idempotency_key
  );

  insert into public.billing_charges
    (workspace_id,user_id,model_id,generation_type,payment_method,credits_charged,idempotency_key)
  values
    (p_workspace_id,p_user_id,p_model_id,p_generation_type,'credits',v_price.credit_price,p_idempotency_key)
  returning * into v_charge;

  insert into public.wallet_ledger
    (workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
  values
    (p_workspace_id,v_charge.id,'generation_charge','credits',-v_price.credit_price,
     v_credit_balance-v_price.credit_price,'charge:' || p_idempotency_key,'Generation credit charge');

  return jsonb_build_object('charge_id',v_charge.id,'payment_method','credits',
    'credits_charged',v_price.credit_price,'money_charged_fen',0);
end;
$$;

create or replace function public.refund_generation_charge(
  p_charge_id uuid,
  p_idempotency_key text,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_charge public.billing_charges%rowtype;
  v_existing uuid;
  v_balance_after numeric(14,4);
begin
  select * into v_charge from public.billing_charges where id = p_charge_id for update;
  if not found then raise exception 'CHARGE_NOT_FOUND'; end if;
  select id into v_existing
  from public.wallet_ledger
  where idempotency_key = p_idempotency_key and charge_id = p_charge_id and kind = 'generation_refund';
  if found then return v_existing; end if;
  if exists(select 1 from public.wallet_ledger where idempotency_key = p_idempotency_key) then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
  if v_charge.refunded_at is not null then raise exception 'CHARGE_ALREADY_REFUNDED'; end if;

  if v_charge.payment_method = 'credits' then
    perform public.refund_credits(v_charge.workspace_id, v_charge.user_id, v_charge.credits_charged, null, p_reason);
    select balance into v_balance_after from public.credit_balances where workspace_id = v_charge.workspace_id;
  else
    update public.money_wallets
    set balance_fen = balance_fen + v_charge.money_charged_fen, version = version + 1, updated_at = now()
    where workspace_id = v_charge.workspace_id
    returning balance_fen into v_balance_after;
  end if;

  update public.billing_charges set refunded_at = now() where id = p_charge_id;
  insert into public.wallet_ledger
    (workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
  values
    (v_charge.workspace_id, v_charge.id, 'generation_refund', v_charge.payment_method,
     case when v_charge.payment_method = 'credits' then v_charge.credits_charged else v_charge.money_charged_fen end,
     v_balance_after, p_idempotency_key, p_reason)
  returning id into v_existing;
  return v_existing;
end;
$$;
