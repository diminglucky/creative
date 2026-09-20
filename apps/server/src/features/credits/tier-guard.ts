// @credits-system — Tier enforcement: model access, resolution limits, concurrency guards per plan
import type {
  BackgroundJobType,
  BillingErrorCode,
  ImageQualityLevel,
  SubscriptionPlan,
  VideoResolution,
} from "@creative/shared";
import {
  MODEL_MIN_TIER,
  canUseResolution,
  canUseVideoResolution,
  getImageCreditCost,
  getVideoCreditCost,
  PLAN_CONFIGS,
  planMeetsTier,
  subscriptionPlanSchema,
} from "@creative/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";

// ── Error ────────────────────────────────────────────────────

export type TierGuardErrorCode = Exclude<BillingErrorCode, "insufficient_credits">;

export class TierGuardError extends Error {
  readonly statusCode: number;
  readonly code: TierGuardErrorCode;

  constructor(
    code: TierGuardError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "TierGuardError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ── Types ────────────────────────────────────────────────────

export type TierGuard = {
  checkModelAccess(plan: SubscriptionPlan, modelId: string): Promise<void>;
  checkResolution(plan: SubscriptionPlan, quality: ImageQualityLevel): void;
  checkVideoResolution(plan: SubscriptionPlan, resolution: VideoResolution): void;
  checkConcurrency(
    workspaceId: string,
    plan: SubscriptionPlan,
  ): Promise<void>;
  calculateCreditCost(
    modelId: string,
    jobType: BackgroundJobType,
    params?: { quality?: ImageQualityLevel; duration?: number; resolution?: VideoResolution },
  ): number;
};

// ── Factory ──────────────────────────────────────────────────

type MinimumTierQueryClient = {
  from(table: "generation_prices"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { minimum_plan: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export function createTierGuard(options: {
  getAdminClient: () => AdminSupabaseClient;
}): TierGuard {
  async function resolveMinimumTier(
    modelId: string,
  ): Promise<SubscriptionPlan> {
    try {
      const admin =
        options.getAdminClient() as unknown as MinimumTierQueryClient;
      const result = await admin
        .from("generation_prices")
        .select("minimum_plan")
        .eq("model_id", modelId)
        .maybeSingle();
      if (!result.error) {
        const value = result.data?.minimum_plan;
        if (typeof value === "string") {
          const parsed = subscriptionPlanSchema.safeParse(value);
          if (parsed.success) return parsed.data;
        }
      }
    } catch {
      // Fall back to the static MODEL_MIN_TIER on any DB error.
    }
    return MODEL_MIN_TIER[modelId] ?? "pro";
  }

  return {
    async checkModelAccess(plan, modelId) {
      const minTier = await resolveMinimumTier(modelId);
      if (!planMeetsTier(plan, minTier)) {
        throw new TierGuardError(
          "model_not_accessible",
          `Your ${plan} plan does not have access to model "${modelId}". Please upgrade your plan.`,
          403,
        );
      }
    },

    checkResolution(plan, quality) {
      if (!canUseResolution(plan, quality)) {
        throw new TierGuardError(
          "resolution_not_allowed",
          `Your ${plan} plan does not allow "${quality}" image quality. Maximum allowed: "${PLAN_CONFIGS[plan].maxResolution}". Please upgrade your plan.`,
          403,
        );
      }
    },

    checkVideoResolution(plan, resolution) {
      if (!canUseVideoResolution(plan, resolution)) {
        throw new TierGuardError(
          "resolution_not_allowed",
          `Your ${plan} plan does not allow "${resolution}" video resolution. Maximum allowed: "${PLAN_CONFIGS[plan].maxVideoResolution}". Please upgrade your plan.`,
          403,
        );
      }
    },

    async checkConcurrency(workspaceId, plan) {
      const admin = options.getAdminClient();
      const maxConcurrent = PLAN_CONFIGS[plan].maxConcurrentJobs;

      const { count, error } = await admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .in("status", ["queued", "running"]);

      if (error) {
        // Log but don't block — fail open on query errors
        console.error(
          "[tier-guard] Failed to check concurrency:",
          error.message,
        );
        return;
      }

      const activeCount = count ?? 0;
      if (activeCount >= maxConcurrent) {
        throw new TierGuardError(
          "concurrency_limit",
          `Concurrent job limit reached (${activeCount}/${maxConcurrent}). Wait for a job to finish or upgrade your plan.`,
          429,
        );
      }
    },

    calculateCreditCost(modelId, jobType, params) {
      if (jobType === "image_generation") {
        const quality: ImageQualityLevel = params?.quality ?? "hd";
        return getImageCreditCost(modelId, quality);
      }
      // video_generation
      return getVideoCreditCost(modelId, params?.duration, params?.resolution);
    },
  };
}
