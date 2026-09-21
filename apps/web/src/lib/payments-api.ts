// @credits-system — Frontend API client for payments: checkout, subscription, cancellation, plan change
import type { BillingPeriod, SubscriptionPlan } from "@creative/shared";

import { getServerBaseUrl } from "./env";
import { ApiAuthError, ApiApplicationError } from "./server-api";

// ── Types ────────────────────────────────────────────────────

export type SubscriptionStatus = {
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod | null;
  status: string | null;
  lemonSqueezySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  customerPortalUrl: string | null;
};

export type CreditPack = { id: string; name: string; credits: number; priceFen: number };

export type CreditPricePreview = {
  creditsPerYuan: number;
  packs: CreditPack[];
  imageModels: Array<{ id: string; displayName: string; creditCost: number }>;
};

export type PublicBillingPlan = {
  id: string;
  name: string;
  description: string;
  monthlyPriceFen: number;
  yearlyPriceFen: number;
  includedCredits: number;
  benefits: string[];
};

export async function getBillingPlans(): Promise<PublicBillingPlan[]> {
  const response = await fetch(`${getServerBaseUrl()}/api/pricing/plans`);
  if (!response.ok) return handleErrorResponse(response);
  return ((await response.json()) as { plans: PublicBillingPlan[] }).plans;
}

export async function getCreditPricePreview(
  accessToken: string,
): Promise<CreditPricePreview> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/pricing/credit-preview`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as CreditPricePreview;
}

export async function getCreditPacks(accessToken: string): Promise<CreditPack[]> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/credit-packs`, { headers: authHeaders(accessToken) });
  if (!response.ok) return handleErrorResponse(response);
  return ((await response.json()) as { packs: CreditPack[] }).packs;
}

export async function createCreditCheckout(accessToken: string, packId: string): Promise<{ checkoutUrl: string }> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/credit-checkout`, { method: "POST", headers: authJsonHeaders(accessToken), body: JSON.stringify({ packId }) });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as { checkoutUrl: string };
}

// ── Helpers ──────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthError();
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

// ── Payment APIs ─────────────────────────────────────────────

export async function createCheckout(
  accessToken: string,
  plan: string,
  billingPeriod: string,
): Promise<{ checkoutUrl: string }> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/checkout`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify({ plan, billingPeriod }),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as { checkoutUrl: string };
}

export async function getSubscription(
  accessToken: string,
): Promise<SubscriptionStatus> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/payments/subscription`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SubscriptionStatus;
}

export async function cancelSubscription(
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/cancel`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
}

export async function changePlan(
  accessToken: string,
  plan: string,
  billingPeriod: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/payments/change-plan`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify({ plan, billingPeriod }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}
