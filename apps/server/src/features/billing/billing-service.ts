import {
  generationChargeSchema,
  type GenerationCharge,
  type GenerationType,
  type PaymentMethod,
} from "@creative/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";

export class BillingServiceError extends Error {
  constructor(
    readonly code: "insufficient_balance" | "charge_failed" | "refund_failed",
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "BillingServiceError";
  }
}

type ChargeGenerationInput = {
  workspaceId: string;
  userId: string;
  modelId: string;
  generationType: GenerationType;
  idempotencyKey: string;
  requestedMethod?: PaymentMethod;
  durationSeconds?: number;
  quality?: string;
};

type RefundGenerationInput = {
  chargeId: string;
  idempotencyKey: string;
  reason: string;
};

export type BillingService = {
  chargeGeneration(input: ChargeGenerationInput): Promise<GenerationCharge>;
  refundGeneration(input: RefundGenerationInput): Promise<string>;
};

type ChargeRpcRow = {
  charge_id: string;
  payment_method: PaymentMethod;
  credits_charged: number;
  money_charged_fen: number;
};

export function createBillingService(options: {
  getAdminClient: () => AdminSupabaseClient;
}): BillingService {
  return {
    async chargeGeneration(input) {
      const admin = options.getAdminClient();
      const { data, error } = await (admin.rpc as any)("charge_generation", {
        p_workspace_id: input.workspaceId,
        p_user_id: input.userId,
        p_model_id: input.modelId,
        p_generation_type: input.generationType,
        p_idempotency_key: input.idempotencyKey,
        p_requested_method: input.requestedMethod ?? null,
        p_duration_seconds: input.durationSeconds ?? null,
        p_quality: input.quality ?? null,
      });

      if (error) {
        if (error.message?.includes("INSUFFICIENT_BALANCE")) {
          throw new BillingServiceError(
            "insufficient_balance",
            "The selected balance is insufficient for this generation.",
            402,
          );
        }
        throw new BillingServiceError(
          "charge_failed",
          `Failed to charge generation: ${error.message}`,
          500,
        );
      }

      const row = data as ChargeRpcRow;
      const parsed = generationChargeSchema.safeParse({
        id: row?.charge_id,
        paymentMethod: row?.payment_method,
        creditsCharged: Number(row?.credits_charged),
        moneyChargedFen: Number(row?.money_charged_fen),
      });
      if (!parsed.success) {
        throw new BillingServiceError(
          "charge_failed",
          "Billing database returned an invalid charge.",
          500,
        );
      }
      return parsed.data;
    },

    async refundGeneration(input) {
      const admin = options.getAdminClient();
      const { data, error } = await (admin.rpc as any)("refund_generation_charge", {
        p_charge_id: input.chargeId,
        p_idempotency_key: input.idempotencyKey,
        p_reason: input.reason,
      });
      if (error) {
        throw new BillingServiceError(
          "refund_failed",
          `Failed to refund generation: ${error.message}`,
          500,
        );
      }
      return String(data);
    },
  };
}
