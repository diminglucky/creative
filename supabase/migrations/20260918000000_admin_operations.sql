insert into public.platform_providers(id,name,base_url,enabled)
values
  ('openai','OpenAI','https://api.openai.com/v1',false),
  ('google','Google AI','https://generativelanguage.googleapis.com',false),
  ('replicate','Replicate','https://api.replicate.com/v1',false),
  ('metaso','Metaso','https://metaso.cn/api',false),
  ('volces','Volcengine','https://ark.cn-beijing.volces.com/api/v3',false)
on conflict(id) do nothing;

create or replace function public.adjust_wallet_balance(
  p_user_id uuid, p_payment_method text, p_amount bigint, p_reason text,
  p_actor_user_id uuid, p_actor_email text
) returns bigint language plpgsql security definer set search_path=public as $$
declare v_workspace_id uuid; v_balance bigint;
begin
  if p_payment_method not in ('credits','money') or p_amount=0 then raise exception 'INVALID_ADJUSTMENT'; end if;
  select id into v_workspace_id from public.workspaces where owner_user_id=p_user_id and type='personal' limit 1;
  if v_workspace_id is null then raise exception 'USER_WORKSPACE_NOT_FOUND'; end if;
  if p_payment_method='credits' then
    insert into public.credit_balances(workspace_id,balance) values(v_workspace_id,0) on conflict do nothing;
    update public.credit_balances set balance=balance+p_amount::integer,version=version+1,updated_at=now()
      where workspace_id=v_workspace_id and balance+p_amount>=0 returning balance into v_balance;
    if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;
    insert into public.credit_transactions(workspace_id,user_id,transaction_type,amount,balance_after,description)
      values(v_workspace_id,p_user_id,'admin_adjustment',p_amount::integer,v_balance,p_reason);
  else
    insert into public.money_wallets(workspace_id,balance_fen) values(v_workspace_id,0) on conflict do nothing;
    update public.money_wallets set balance_fen=balance_fen+p_amount,version=version+1,updated_at=now()
      where workspace_id=v_workspace_id and balance_fen+p_amount>=0 returning balance_fen into v_balance;
    if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;
  end if;
  insert into public.wallet_ledger(workspace_id,kind,payment_method,amount,balance_after,idempotency_key,description)
    values(v_workspace_id,'admin_adjustment',p_payment_method,p_amount,v_balance,'admin:'||gen_random_uuid(),p_reason);
  insert into public.admin_audit_logs(actor_user_id,actor_email,action,resource_type,resource_id,details)
    values(p_actor_user_id,p_actor_email,'user.balance.adjusted','user',p_user_id::text,jsonb_build_object('paymentMethod',p_payment_method,'amount',p_amount,'reason',p_reason));
  return v_balance;
end $$;

revoke all on function public.adjust_wallet_balance(uuid,text,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function public.adjust_wallet_balance(uuid,text,bigint,text,uuid,text) to service_role;
