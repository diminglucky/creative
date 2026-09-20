-- Admin overview statistics: single RPC so the dashboard never pulls whole
-- billing_charges / payment_orders tables into the API process to aggregate.
-- Revenue counts both subscription/recharge orders AND credit-pack purchases
-- (the latter were missing, so credit sales were invisible in "revenue").
-- Refunds report credits (converted by the caller) plus historical RMB refunds.
create or replace function public.admin_overview_stats()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_revenue_fen bigint;
  v_refunded_credits bigint;
  v_refunded_money_fen bigint;
  v_generation_count bigint;
  v_user_count bigint;
begin
  select coalesce(sum(amount_fen), 0) into v_revenue_fen
    from public.payment_orders where status = 'paid';
  v_revenue_fen := v_revenue_fen + coalesce(
    (select sum(amount_fen) from public.credit_purchase_orders where status = 'paid'),
    0
  );
  select coalesce(sum(credits_charged), 0) into v_refunded_credits
    from public.billing_charges where refunded_at is not null;
  select coalesce(sum(money_charged_fen), 0) into v_refunded_money_fen
    from public.billing_charges where refunded_at is not null;
  select count(*) into v_generation_count from public.billing_charges;
  select count(*) into v_user_count from public.profiles;

  return jsonb_build_object(
    'revenue_fen', v_revenue_fen,
    'refunded_credits', v_refunded_credits,
    'refunded_money_fen', v_refunded_money_fen,
    'generation_count', v_generation_count,
    'user_count', v_user_count
  );
end $$;

revoke all on function public.admin_overview_stats() from public, anon, authenticated;
grant execute on function public.admin_overview_stats() to service_role;
