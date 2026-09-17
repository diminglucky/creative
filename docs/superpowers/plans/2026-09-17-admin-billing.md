# Creative Admin Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working super-admin configuration console and non-combinable credit/RMB billing flow while reusing Creative's existing generation, credit, subscription, and job systems.

**Architecture:** Supabase stores dynamic catalog, wallet, preferences, ledger, and admin audit data. Fastify exposes authenticated admin/user APIs and a unified billing service that charges before existing generation/job creation and refunds eligible failures. Next.js adds `/admin` and user billing settings using those APIs.

**Tech Stack:** Next.js 15, React 19, Fastify 5, Supabase PostgreSQL/RPC, TypeScript, Vitest.

## Global Constraints

- Reuse existing credit, subscription, payment, model registry, and generation/job modules wherever possible.
- One platform super administrator; workspace owner is not automatically a platform administrator.
- Default payment method is credits; automatic fallback is opt-in.
- A generation uses exactly one balance and must be fully charged before task creation.
- Refund only network/API/timeout/empty-result/no-output failures; do not refund valid output or explicit safety rejection.
- RMB amounts are integer fen and all mutations are idempotent and auditable.
- Provider secrets never reach the browser and are masked in admin responses.

---

### Task 1: Database billing foundation

**Files:**
- Create: `supabase/migrations/20260917000000_admin_billing.sql`
- Modify: `packages/shared/src/supabase/database.ts`
- Test: SQL migration acceptance through local Supabase reset and RPC calls

**Interfaces:**
- Produces tables for platform admins, provider/model/plan config, wallets, payment preferences, wallet ledger, payment orders, billing charges, and admin audit logs.
- Produces atomic RPCs `charge_generation`, `refund_generation_charge`, and `adjust_wallet_balance`.

- [ ] Write SQL assertions that reject combined payment and duplicate idempotency keys.
- [ ] Run them before the migration and verify missing-relation/function failures.
- [ ] Implement tables, RLS, constraints, indexes, seed-from-current-config rows, and row-locking RPCs.
- [ ] Reset local Supabase and verify credit charge, RMB charge, fallback, insufficient balance, duplicate charge, and refund.
- [ ] Regenerate or minimally update shared database types.

### Task 2: Shared contracts and unified billing service

**Files:**
- Create: `packages/shared/src/admin-billing-contracts.ts`
- Create: `apps/server/src/features/billing/billing-service.ts`
- Create: `apps/server/src/features/billing/billing-service.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces `PaymentMethod`, `PaymentPreference`, `GenerationPrice`, `GenerationCharge`, and admin configuration schemas.
- Produces `chargeGeneration()` and `refundGeneration()` around Task 1 RPCs.

- [ ] Write failing tests for default credits, opt-in fallback, no combination, idempotency, and original-method refund.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement schemas and the minimal billing service using existing Supabase admin-client patterns.
- [ ] Run focused tests and shared typecheck.

### Task 3: Admin authentication and configuration APIs

**Files:**
- Create: `apps/server/src/http/admin.ts`
- Create: `apps/server/src/features/admin/admin-service.ts`
- Create: `apps/server/src/http/admin.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/config/env.ts`

**Interfaces:**
- Produces `/api/admin/overview`, `/providers`, `/models`, `/plans`, `/users`, `/orders`, `/ledger`, and `/settings` routes.
- Uses one configured super-admin email and masks provider secrets.

- [ ] Write failing tests for 401 unauthenticated, 403 non-admin, masked secrets, validation, update audit, and user adjustment.
- [ ] Implement centralized super-admin guard and admin service using Task 1 tables.
- [ ] Register routes and run focused tests/typecheck.

### Task 4: User wallet and payment-preference APIs

**Files:**
- Create: `apps/server/src/http/wallet.ts`
- Create: `apps/server/src/http/wallet.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `packages/shared/src/admin-billing-contracts.ts`

**Interfaces:**
- Produces `/api/wallet`, `/api/wallet/preferences`, `/api/wallet/ledger`, and recharge-order endpoints.

- [ ] Write failing tests for default credits, preference persistence, fallback toggle, wallet balance, and ownership isolation.
- [ ] Implement endpoints with existing authenticated-user context.
- [ ] Run focused tests and server typecheck.

### Task 5: Charge existing image/video generation paths

**Files:**
- Modify: `apps/server/src/http/generate.ts`
- Modify: `apps/server/src/http/jobs.ts`
- Modify: `apps/server/src/worker.ts`
- Modify: `apps/server/src/features/jobs/executors/image-generation.ts`
- Modify: `apps/server/src/features/jobs/executors/video-generation.ts`
- Test: existing route/worker tests plus new billing cases

**Interfaces:**
- Consumes Task 2 billing service and Task 1 dynamic model prices.
- Persists charge id/payment method on jobs and refunds only eligible terminal failures.

- [ ] Add failing tests proving charge precedes task creation and insufficient balances never call providers.
- [ ] Add failing outcome-classification tests for valid output, safety rejection, timeout, API error, and empty result.
- [ ] Replace direct credit deductions with unified billing while preserving tier guards and queues.
- [ ] Add idempotent original-method refunds in terminal failure paths.
- [ ] Run generation, job, worker, and billing tests.

### Task 6: Admin console

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/src/app/admin/providers/page.tsx`
- Create: `apps/web/src/app/admin/models/page.tsx`
- Create: `apps/web/src/app/admin/plans/page.tsx`
- Create: `apps/web/src/app/admin/users/page.tsx`
- Create: `apps/web/src/app/admin/orders/page.tsx`
- Create: `apps/web/src/app/admin/ledger/page.tsx`
- Create: `apps/web/src/lib/admin-api.ts`
- Test: `apps/web/test/admin.test.tsx`

**Interfaces:**
- Consumes Task 3 admin routes; never receives plaintext secrets.

- [ ] Write failing access, loading, validation, save, mask, and audit-visible UI tests.
- [ ] Implement a dense operational console using existing UI primitives and icons.
- [ ] Run focused tests, typecheck, and responsive browser verification.

### Task 7: User wallet and billing settings UI

**Files:**
- Create: `apps/web/src/components/wallet-section.tsx`
- Create: `apps/web/src/hooks/use-wallet.ts`
- Modify: existing settings/billing page components
- Modify: model price displays to use server values
- Test: `apps/web/test/wallet-settings.test.tsx`

**Interfaces:**
- Consumes Task 4 wallet routes and shows both credit and RMB prices returned by model APIs.

- [ ] Write failing tests for default credits, opt-in fallback, balances, and recharge validation.
- [ ] Implement settings and transaction history using existing settings patterns.
- [ ] Run focused tests, typecheck, and browser verification.

### Task 8: Payment adapters and webhook hardening

**Files:**
- Create: `apps/server/src/features/payments/recharge-provider.ts`
- Create: provider implementations for configured Alipay, WeChat Pay, and aggregate gateway credentials
- Create: webhook routes/tests per provider
- Modify: existing payment route registration

**Interfaces:**
- Produces create-order/query/refund/verify-webhook adapter methods and credits RMB wallet exactly once.

- [ ] Write contract tests shared by all provider adapters.
- [ ] Implement disabled-without-credentials behavior and real signature verification boundaries.
- [ ] Implement idempotent callback-to-wallet crediting.
- [ ] Run payment tests; live sandbox acceptance is required only when merchant credentials are supplied.

### Task 9: End-to-end verification

**Files:**
- Modify only defects found by verification.

- [ ] Run shared/server/web tests and typechecks.
- [ ] Reset local Supabase and seed accounts/admin.
- [ ] Verify admin edits affect pricing responses immediately.
- [ ] Verify credit charge, RMB charge, opt-in fallback, insufficient rejection, refundable failure, and non-refundable safety rejection.
- [ ] Verify secrets are absent from browser responses and logs.
- [ ] Commit and push the verified implementation.
