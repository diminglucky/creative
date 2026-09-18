-- Creative admin catalog, RMB wallet and atomic single-balance generation billing.
create table if not exists public.platform_providers (
  id text primary key,
  name text not null,
  base_url text not null check (base_url ~ '^https?://'),
  secret_ciphertext text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_prices (
  model_id text not null,
  generation_type text not null check (generation_type in ('image', 'video')),
  display_name text not null,
  provider_id text,
  credit_price integer not null check (credit_price >= 0),
  money_price_fen integer not null check (money_price_fen >= 0),
  cost_price_fen integer not null default 0 check (cost_price_fen >= 0),
  minimum_plan text not null default 'free',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (model_id, generation_type)
);

create table if not exists public.billing_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  monthly_price_fen integer not null check (monthly_price_fen >= 0),
  yearly_price_fen integer not null check (yearly_price_fen >= 0),
  included_credits integer not null check (included_credits >= 0),
  benefits jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.money_wallets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance_fen bigint not null default 0 check (balance_fen >= 0),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  primary_method text not null default 'credits' check (primary_method in ('credits', 'money')),
  auto_fallback boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  model_id text not null,
  generation_type text not null check (generation_type in ('image', 'video')),
  payment_method text not null check (payment_method in ('credits', 'money')),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  money_charged_fen integer not null default 0 check (money_charged_fen >= 0),
  idempotency_key text not null unique,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  check ((credits_charged > 0 and money_charged_fen = 0) or (credits_charged = 0 and money_charged_fen > 0))
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  charge_id uuid references public.billing_charges(id),
  kind text not null,
  payment_method text not null check (payment_method in ('credits', 'money')),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null,
  idempotency_key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('recharge', 'subscription')),
  provider text not null,
  provider_trade_id text unique,
  amount_fen integer not null check (amount_fen > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_charges_workspace_created on public.billing_charges(workspace_id, created_at desc);
create index if not exists idx_wallet_ledger_workspace_created on public.wallet_ledger(workspace_id, created_at desc);
create index if not exists idx_payment_orders_workspace_created on public.payment_orders(workspace_id, created_at desc);
create index if not exists idx_admin_audit_created on public.admin_audit_logs(created_at desc);

alter table public.platform_providers enable row level security;
alter table public.generation_prices enable row level security;
alter table public.billing_plans enable row level security;
alter table public.money_wallets enable row level security;
alter table public.payment_preferences enable row level security;
alter table public.billing_charges enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.payment_orders enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy "workspace members read own wallet" on public.money_wallets for select using ((select private.is_workspace_member(workspace_id)));
create policy "workspace members read own preferences" on public.payment_preferences for select using ((select private.is_workspace_member(workspace_id)));
create policy "workspace members update own preferences" on public.payment_preferences for all using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy "workspace members read own charges" on public.billing_charges for select using ((select private.is_workspace_member(workspace_id)));
create policy "workspace members read own wallet ledger" on public.wallet_ledger for select using ((select private.is_workspace_member(workspace_id)));
create policy "workspace members read own orders" on public.payment_orders for select using ((select private.is_workspace_member(workspace_id)));
create policy "public reads enabled generation prices" on public.generation_prices for select using (enabled);
create policy "public reads enabled billing plans" on public.billing_plans for select using (enabled);

create or replace function public.charge_generation(
  p_workspace_id uuid, p_user_id uuid, p_model_id text, p_generation_type text,
  p_idempotency_key text, p_requested_method text default null,
  p_duration_seconds integer default null, p_quality text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_price public.generation_prices%rowtype;
  v_pref public.payment_preferences%rowtype;
  v_method text;
  v_charge public.billing_charges%rowtype;
  v_credit_balance integer;
  v_money_balance bigint;
  v_credit_tx_id uuid;
  v_balance_after bigint;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_requested_method is not null and p_requested_method not in ('credits', 'money') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  perform pg_advisory_xact_lock(hashtextextended('generation-charge:' || p_idempotency_key, 0));
  select * into v_charge from public.billing_charges where idempotency_key = p_idempotency_key;
  if found then
    if v_charge.workspace_id <> p_workspace_id or v_charge.user_id <> p_user_id or v_charge.model_id <> p_model_id or v_charge.generation_type <> p_generation_type then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('charge_id', v_charge.id, 'payment_method', v_charge.payment_method,
      'credits_charged', v_charge.credits_charged, 'money_charged_fen', v_charge.money_charged_fen);
  end if;
  select * into v_price from public.generation_prices where model_id=p_model_id and generation_type=p_generation_type and enabled for share;
  if not found then raise exception 'PRICE_NOT_CONFIGURED'; end if;
  insert into public.payment_preferences(workspace_id) values (p_workspace_id) on conflict do nothing;
  select * into v_pref from public.payment_preferences where workspace_id=p_workspace_id;
  v_method := coalesce(p_requested_method, v_pref.primary_method);
  insert into public.credit_balances(workspace_id, balance) values (p_workspace_id, 0) on conflict do nothing;
  insert into public.money_wallets(workspace_id) values (p_workspace_id) on conflict do nothing;
  select balance into v_credit_balance from public.credit_balances where workspace_id=p_workspace_id for update;
  select balance_fen into v_money_balance from public.money_wallets where workspace_id=p_workspace_id for update;
  if v_method='credits' and v_credit_balance < v_price.credit_price and v_pref.auto_fallback and v_money_balance >= v_price.money_price_fen then v_method := 'money'; end if;
  if v_method='money' and v_money_balance < v_price.money_price_fen and v_pref.auto_fallback and v_credit_balance >= v_price.credit_price then v_method := 'credits'; end if;
  if v_method='credits' then
    if v_credit_balance < v_price.credit_price then raise exception 'INSUFFICIENT_BALANCE'; end if;
    v_credit_tx_id := public.deduct_credits(p_workspace_id,p_user_id,v_price.credit_price,null,'Generation charge ' || p_idempotency_key);
    v_balance_after := v_credit_balance-v_price.credit_price;
    insert into public.billing_charges(workspace_id,user_id,model_id,generation_type,payment_method,credits_charged,idempotency_key)
      values(p_workspace_id,p_user_id,p_model_id,p_generation_type,'credits',v_price.credit_price,p_idempotency_key) returning * into v_charge;
    insert into public.wallet_ledger(workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
      values(p_workspace_id,v_charge.id,'generation_charge','credits',-v_price.credit_price,v_balance_after,'charge:' || p_idempotency_key,'Generation charge');
  elsif v_method='money' then
    if v_money_balance < v_price.money_price_fen then raise exception 'INSUFFICIENT_BALANCE'; end if;
    update public.money_wallets set balance_fen=balance_fen-v_price.money_price_fen, version=version+1, updated_at=now() where workspace_id=p_workspace_id returning balance_fen into v_balance_after;
    insert into public.billing_charges(workspace_id,user_id,model_id,generation_type,payment_method,money_charged_fen,idempotency_key)
      values(p_workspace_id,p_user_id,p_model_id,p_generation_type,'money',v_price.money_price_fen,p_idempotency_key) returning * into v_charge;
    insert into public.wallet_ledger(workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
      values(p_workspace_id,v_charge.id,'generation_charge','money',-v_price.money_price_fen,v_balance_after,'charge:' || p_idempotency_key,'Generation charge');
  else raise exception 'INVALID_PAYMENT_METHOD'; end if;
  return jsonb_build_object('charge_id',v_charge.id,'payment_method',v_charge.payment_method,'credits_charged',v_charge.credits_charged,'money_charged_fen',v_charge.money_charged_fen);
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
    update public.money_wallets set balance_fen=balance_fen+v_charge.money_charged_fen,version=version+1,updated_at=now() where workspace_id=v_charge.workspace_id returning balance_fen into v_balance_after;
  end if;
  update public.billing_charges set refunded_at=now() where id=p_charge_id;
  insert into public.wallet_ledger(workspace_id,charge_id,kind,payment_method,amount,balance_after,idempotency_key,description)
  values(v_charge.workspace_id,v_charge.id,'generation_refund',v_charge.payment_method,
    case when v_charge.payment_method='credits' then v_charge.credits_charged else v_charge.money_charged_fen end,v_balance_after,p_idempotency_key,p_reason)
  returning id into v_existing;
  return v_existing;
end $$;

revoke all on function public.refund_generation_charge(uuid,text,text) from public, anon, authenticated;
grant execute on function public.refund_generation_charge(uuid,text,text) to service_role;

insert into public.billing_plans(id,name,description,monthly_price_fen,yearly_price_fen,included_credits,benefits)
values ('free','Free','基础体验',0,0,0,'[]'),('starter','Starter','入门套餐',6900,69000,1200,'[]'),('pro','Pro','专业套餐',19900,199000,5000,'[]')
on conflict(id) do nothing;

-- Preserve the two existing default generation paths on first deployment.
-- Administrators can change both prices immediately from the model catalog.
insert into public.generation_prices
  (model_id, generation_type, display_name, provider_id, credit_price, money_price_fen, minimum_plan, enabled)
values
  ('black-forest-labs/flux-kontext-pro', 'image', 'FLUX Kontext Pro', 'replicate', 12, 120, 'starter', true),
  ('google-official/veo-3.1-generate-preview', 'video', 'Veo 3.1', 'google', 80, 800, 'pro', true)
on conflict (model_id, generation_type) do nothing;
