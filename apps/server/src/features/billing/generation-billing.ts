import type { GenerationCharge, GenerationType } from "@creative/shared";

import type { BillingService } from "./billing-service.js";

type ChargeGenerationInput = {
  workspaceId: string;
  userId: string;
  modelId: string;
  generationType: GenerationType;
  idempotencyKey: string;
  durationSeconds?: number;
  quality?: string;
};

type ProviderOutputError = Error & { providerOutputReceived: true };

export async function createBilledGenerationJob<T>(options: {
  billingService: BillingService;
  charge: ChargeGenerationInput;
  payload: Record<string, unknown>;
  createJob: (payload: Record<string, unknown>) => Promise<T>;
}): Promise<{ charge: GenerationCharge; job: T }> {
  const charge = await options.billingService.chargeGeneration(options.charge);

  try {
    const job = await options.createJob({
      ...options.payload,
      billing_charge_id: charge.id,
    });
    return { charge, job };
  } catch (error) {
    await options.billingService
      .refundGeneration({
        chargeId: charge.id,
        idempotencyKey: `refund:create:${charge.id}`,
        reason: "job_create_failed",
      })
      .catch(() => undefined);
    throw error;
  }
}

export function markProviderOutputReceived(error: unknown): ProviderOutputError {
  const marked = error instanceof Error ? error : new Error(String(error));
  return Object.assign(marked, { providerOutputReceived: true as const });
}

export function shouldRefundGenerationFailure(error: unknown): boolean {
  const failure = error as {
    code?: unknown;
    providerOutputReceived?: unknown;
  };
  return (
    failure?.code !== "safety_filter" &&
    failure?.providerOutputReceived !== true
  );
}

export async function refundBilledGenerationJob(options: {
  billingService: BillingService;
  jobId: string;
  payload: Record<string, unknown>;
  reason: string;
}): Promise<boolean> {
  const chargeId = options.payload.billing_charge_id;
  if (typeof chargeId !== "string") {
    return false;
  }

  await options.billingService.refundGeneration({
    chargeId,
    idempotencyKey: `refund:job:${options.jobId}`,
    reason: options.reason,
  });
  return true;
}
