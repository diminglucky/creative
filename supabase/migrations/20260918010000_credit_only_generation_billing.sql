-- All new generation charges use credits. RMB wallet tables remain for history only.
create or replace function public.charge_generation(
  p_workspace_id uuid, p_user_id uuid, p_model_id text, p_generation_type text,
  p_idempotency_key text, p_requested_method text default null,
  p_duration_seconds integer default null, p_quality text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_price public.generation_prices%rowtype;
  v_charge public.billing_charges%rowtype;
  v_credit_balance integer;
  v_credit_tx_id uuid;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('generation-charge:' || p_idempotency_key, 0));
  select * into v_charge from public.billing_charges where idempotency_key = p_idempotency_key;
  if found then
    if v_charge.workspace_id <> p_workspace_id or v_charge.user_id <> p_user_id or v_charge.model_id <> p_model_id or v_charge.generation_type <> p_generation_type then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('charge_id',v_charge.id,'payment_method','credits','credits_charged',v_charge.credits_charged,'money_charged_fen',0);
  end if;
  select * into v_price from public.generation_prices where model_id=p_model_id and generation_type=p_generation_type and enabled for share;
  if not found then raise exception 'PRICE_NOT_FOUND'; end if;
  select balance into v_credit_balance from public.credit_balances where workspace_id=p_workspace_id for update;
  if coalesce(v_credit_balance,0) < v_price.credit_price then raise exception 'INSUFFICIENT_BALANCE'; end if;
  v_credit_tx_id := public.deduct_credits(p_workspace_id,p_user_id,v_price.credit_price,null,'Generation charge ' || p_idempotency_key);
  insert into public.billing_charges(workspace_id,user_id,model_id,generation_type,payment_method,credits_charged,idempotency_key)
    values(p_workspace_id,p_user_id,p_model_id,p_generation_type,'credits',v_price.credit_price,p_idempotency_key) returning * into v_charge;
  insert into public.wallet_ledger(workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
    values(p_workspace_id,v_charge.id,'generation_charge','credits',-v_price.credit_price,v_credit_balance-v_price.credit_price,'charge:' || p_idempotency_key,'Generation credit charge');
  return jsonb_build_object('charge_id',v_charge.id,'payment_method','credits','credits_charged',v_price.credit_price,'money_charged_fen',0);
end $$;

revoke all on function public.charge_generation(uuid,uuid,text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.charge_generation(uuid,uuid,text,text,text,text,integer,text) to service_role;

create or replace function public.refund_generation_charge(p_charge_id uuid, p_idempotency_key text, p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_charge public.billing_charges%rowtype; v_existing uuid; v_balance_after bigint;
begin
  select * into v_charge from public.billing_charges where id=p_charge_id for update;
  if not found then raise exception 'CHARGE_NOT_FOUND'; end if;
  select id into v_existing from public.wallet_ledger where idempotency_key=p_idempotency_key and charge_id=p_charge_id and kind='generation_refund';
  if found then return v_existing; end if;
  if exists(select 1 from public.wallet_ledger where idempotency_key=p_idempotency_key) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_charge.refunded_at is not null then raise exception 'CHARGE_ALREADY_REFUNDED'; end if;
  if v_charge.payment_method='credits' then
    perform public.refund_credits(v_charge.workspace_id,v_charge.user_id,v_charge.credits_charged,null,p_reason);
    select balance into v_balance_after from public.credit_balances where workspace_id=v_charge.workspace_id;
  else
    update public.money_wallets
      set balance_fen=balance_fen+v_charge.money_charged_fen, version=version+1, updated_at=now()
      where workspace_id=v_charge.workspace_id
      returning balance_fen into v_balance_after;
  end if;
  update public.billing_charges set refunded_at=now() where id=p_charge_id;
  insert into public.wallet_ledger(workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
  values(
    v_charge.workspace_id,
    v_charge.id,
    'generation_refund',
    v_charge.payment_method,
    case when v_charge.payment_method='credits' then v_charge.credits_charged else v_charge.money_charged_fen end,
    v_balance_after,
    p_idempotency_key,
    p_reason
  )
  returning id into v_existing;
  return v_existing;
end $$;

revoke all on function public.refund_generation_charge(uuid,text,text) from public,anon,authenticated;
grant execute on function public.refund_generation_charge(uuid,text,text) to service_role;
