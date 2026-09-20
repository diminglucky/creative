create table if not exists public.billing_settings (
  id text primary key check (id='default'),
  credits_per_yuan integer not null check (credits_per_yuan > 0),
  updated_at timestamptz not null default now()
);
insert into public.billing_settings(id,credits_per_yuan) values('default',10) on conflict(id) do nothing;
alter table public.billing_settings enable row level security;

alter table public.credit_packs add column if not exists amount_fen integer;
alter table public.credit_packs add column if not exists base_credits integer;
alter table public.credit_packs add column if not exists bonus_credits integer not null default 0;
alter table public.credit_packs add column if not exists deleted_at timestamptz;
update public.credit_packs set amount_fen=price_fen where amount_fen is null;
update public.credit_packs set base_credits=credits-bonus_credits where base_credits is null;
alter table public.credit_packs alter column amount_fen set not null;
alter table public.credit_packs alter column base_credits set not null;
alter table public.credit_packs add constraint credit_packs_amount_positive check(amount_fen > 0);
alter table public.credit_packs add constraint credit_packs_base_positive check(base_credits > 0);
alter table public.credit_packs add constraint credit_packs_bonus_nonnegative check(bonus_credits >= 0);

alter table public.credit_purchase_orders add column if not exists base_credits integer;
alter table public.credit_purchase_orders add column if not exists bonus_credits integer not null default 0;
alter table public.credit_purchase_orders add column if not exists total_credits integer;
update public.credit_purchase_orders set base_credits=credits,total_credits=credits where base_credits is null or total_credits is null;
alter table public.credit_purchase_orders alter column base_credits set not null;
alter table public.credit_purchase_orders alter column total_credits set not null;

create or replace function public.grant_credit_pack_purchase(p_workspace_id uuid,p_pack_id text,p_provider_order_id text,p_amount_fen integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_pack public.credit_packs%rowtype; v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('credit-purchase:lemon_squeezy:'||p_provider_order_id,0));
  select balance_after into v_balance from public.credit_transactions where transaction_type='purchase' and metadata->>'provider_order_id'=p_provider_order_id order by created_at desc limit 1;
  if found then return v_balance; end if;
  select * into v_pack from public.credit_packs where id=p_pack_id and enabled for share;
  if not found then raise exception 'CREDIT_PACK_NOT_FOUND'; end if;
  insert into public.credit_balances(workspace_id,balance,version) values(p_workspace_id,v_pack.credits,1)
    on conflict(workspace_id) do update set balance=public.credit_balances.balance+v_pack.credits,version=public.credit_balances.version+1,updated_at=now() returning balance into v_balance;
  insert into public.credit_purchase_orders(provider_order_id,workspace_id,pack_id,credits,base_credits,bonus_credits,total_credits,amount_fen,status)
    values(p_provider_order_id,p_workspace_id,p_pack_id,v_pack.credits,v_pack.base_credits,v_pack.bonus_credits,v_pack.credits,p_amount_fen,'paid');
  insert into public.credit_transactions(workspace_id,transaction_type,amount,balance_after,description,metadata)
    values(p_workspace_id,'purchase',v_pack.credits,v_balance,'Permanent credit pack purchase',jsonb_build_object('provider','lemon_squeezy','provider_order_id',p_provider_order_id,'pack_id',p_pack_id,'amount_fen',p_amount_fen,'base_credits',v_pack.base_credits,'bonus_credits',v_pack.bonus_credits,'total_credits',v_pack.credits));
  return v_balance;
end $$;
