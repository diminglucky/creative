import { describe, expect, it, vi } from "vitest";

import type { BillingService } from "./billing-service.js";
import {
  createBilledGenerationJob,
  markProviderOutputReceived,
  refundBilledGenerationJob,
  shouldRefundGenerationFailure,
} from "./generation-billing.js";

describe("createBilledGenerationJob", () => {
  it("charges before creating and enqueueing the generation job", async () => {
    const calls: string[] = [];
    const billingService = {
      chargeGeneration: vi.fn(async () => {
        calls.push("charge");
        return {
          id: "charge-1",
          paymentMethod: "credits" as const,
          creditsCharged: 12,
          moneyChargedFen: 0,
        };
      }),
      refundGeneration: vi.fn(),
    } satisfies BillingService;
    const createJob = vi.fn(async (payload: Record<string, unknown>) => {
      calls.push("create-job");
      return { id: "job-1", payload };
    });

    const result = await createBilledGenerationJob({
      billingService,
      charge: {
        workspaceId: "workspace-1",
        userId: "user-1",
        modelId: "model-1",
        generationType: "image",
        idempotencyKey: "agent-image:request-1",
      },
      createJob,
      payload: { prompt: "hello" },
    });

    expect(calls).toEqual(["charge", "create-job"]);
    expect(createJob).toHaveBeenCalledWith({
      prompt: "hello",
      billing_charge_id: "charge-1",
    });
    expect(result.charge.id).toBe("charge-1");
  });

  it("refunds the original charge when job creation fails", async () => {
    const billingService = {
      chargeGeneration: vi.fn().mockResolvedValue({
        id: "charge-2",
        paymentMethod: "money",
        creditsCharged: 0,
        moneyChargedFen: 99,
      }),
      refundGeneration: vi.fn().mockResolvedValue("refund-2"),
    } satisfies BillingService;

    await expect(
      createBilledGenerationJob({
        billingService,
        charge: {
          workspaceId: "workspace-1",
          userId: "user-1",
          modelId: "model-1",
          generationType: "video",
          idempotencyKey: "agent-video:request-1",
        },
        createJob: async () => {
          throw new Error("queue unavailable");
        },
        payload: { prompt: "hello" },
      }),
    ).rejects.toThrow("queue unavailable");

    expect(billingService.refundGeneration).toHaveBeenCalledWith({
      chargeId: "charge-2",
      idempotencyKey: "refund:create:charge-2",
      reason: "job_create_failed",
    });
  });
});

describe("refundBilledGenerationJob", () => {
  it("refunds the billing charge embedded in a queued job", async () => {
    const billingService = {
      chargeGeneration: vi.fn(),
      refundGeneration: vi.fn().mockResolvedValue("refund-3"),
    } satisfies BillingService;

    await expect(
      refundBilledGenerationJob({
        billingService,
        jobId: "job-3",
        payload: { billing_charge_id: "charge-3" },
        reason: "job_canceled",
      }),
    ).resolves.toBe(true);

    expect(billingService.refundGeneration).toHaveBeenCalledWith({
      chargeId: "charge-3",
      idempotencyKey: "refund:job:job-3",
      reason: "job_canceled",
    });
  });

  it("does nothing for an unbilled legacy job", async () => {
    const billingService = {
      chargeGeneration: vi.fn(),
      refundGeneration: vi.fn(),
    } satisfies BillingService;

    await expect(
      refundBilledGenerationJob({
        billingService,
        jobId: "job-4",
        payload: {},
        reason: "no_executor",
      }),
    ).resolves.toBe(false);
    expect(billingService.refundGeneration).not.toHaveBeenCalled();
  });
});

describe("generation refund policy", () => {
  it("refunds failures with no provider output, including empty output", () => {
    expect(shouldRefundGenerationFailure({ code: "no_output" })).toBe(true);
    expect(shouldRefundGenerationFailure(new Error("timeout"))).toBe(true);
  });

  it("does not refund safety blocks or failures after provider output", () => {
    expect(shouldRefundGenerationFailure({ code: "safety_filter" })).toBe(false);

    const storageError = markProviderOutputReceived(
      new Error("storage upload failed"),
    );
    expect(shouldRefundGenerationFailure(storageError)).toBe(false);
  });
});
