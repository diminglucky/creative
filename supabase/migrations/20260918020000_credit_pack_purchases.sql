-- Permanent credit packs purchased through Lemon Squeezy.
create table if not exists public.credit_packs (
  id text primary key,
  name text not null,
  credits integer not null check (credits > 0),
  price_fen integer not null check (price_fen > 0),
  lemon_squeezy_variant_id text unique,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemon_squeezy',
  provider_order_id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pack_id text not null references public.credit_packs(id),
  credits integer not null check (credits > 0),
  amount_fen integer not null check (amount_fen >= 0),
  status text not null check (status in ('paid')),
  created_at timestamptz not null default now(),
  unique(provider, provider_order_id)
);

alter table public.credit_packs enable row level security;
alter table public.credit_purchase_orders enable row level security;

create policy "authenticated users read enabled credit packs"
  on public.credit_packs for select to authenticated using (enabled);
create policy "workspace members read own credit purchases"
  on public.credit_purchase_orders for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create or replace function public.grant_credit_pack_purchase(
  p_workspace_id uuid,
  p_pack_id text,
  p_provider_order_id text,
  p_amount_fen integer
) returns integer language plpgsql security definer set search_path=public as $$
declare v_pack public.credit_packs%rowtype; v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('credit-purchase:lemon_squeezy:' || p_provider_order_id, 0));
  select balance_after into v_balance from public.credit_transactions
    where transaction_type='purchase' and metadata->>'provider_order_id'=p_provider_order_id
    order by created_at desc limit 1;
  if found then return v_balance; end if;
  select * into v_pack from public.credit_packs where id=p_pack_id and enabled for share;
  if not found then raise exception 'CREDIT_PACK_NOT_FOUND'; end if;
  insert into public.credit_balances(workspace_id,balance,version)
    values(p_workspace_id,v_pack.credits,1)
    on conflict(workspace_id) do update set balance=public.credit_balances.balance+v_pack.credits,version=public.credit_balances.version+1,updated_at=now()
    returning balance into v_balance;
  insert into public.credit_purchase_orders(provider_order_id,workspace_id,pack_id,credits,amount_fen,status)
    values(p_provider_order_id,p_workspace_id,p_pack_id,v_pack.credits,p_amount_fen,'paid');
  insert into public.credit_transactions(workspace_id,transaction_type,amount,balance_after,description,metadata)
    values(p_workspace_id,'purchase',v_pack.credits,v_balance,'Permanent credit pack purchase',jsonb_build_object('provider','lemon_squeezy','provider_order_id',p_provider_order_id,'pack_id',p_pack_id,'amount_fen',p_amount_fen));
  return v_balance;
end $$;

revoke all on function public.grant_credit_pack_purchase(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.grant_credit_pack_purchase(uuid,text,text,integer) to service_role;
