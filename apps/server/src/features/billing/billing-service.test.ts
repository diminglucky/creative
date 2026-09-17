import { describe, expect, it, vi } from "vitest";

import { BillingServiceError, createBillingService } from "./billing-service.js";

describe("billing service", () => {
  it("charges with the database-selected single payment method", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        charge_id: "charge-1",
        payment_method: "credits",
        credits_charged: 12,
        money_charged_fen: 0,
      },
      error: null,
    });
    const service = createBillingService({ getAdminClient: () => ({ rpc }) as never });

    await expect(service.chargeGeneration({
      workspaceId: "ws-1",
      userId: "user-1",
      modelId: "image/model",
      generationType: "image",
      idempotencyKey: "job-1",
    })).resolves.toEqual({
      id: "charge-1",
      paymentMethod: "credits",
      creditsCharged: 12,
      moneyChargedFen: 0,
    });

    expect(rpc).toHaveBeenCalledWith("charge_generation", expect.objectContaining({
      p_idempotency_key: "job-1",
      p_requested_method: null,
    }));
  });

  it("passes an explicit method without ever splitting the charge", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        charge_id: "charge-2",
        payment_method: "money",
        credits_charged: 0,
        money_charged_fen: 199,
      },
      error: null,
    });
    const service = createBillingService({ getAdminClient: () => ({ rpc }) as never });

    const charge = await service.chargeGeneration({
      workspaceId: "ws-1",
      userId: "user-1",
      modelId: "video/model",
      generationType: "video",
      idempotencyKey: "job-2",
      requestedMethod: "money",
    });

    expect(charge.paymentMethod).toBe("money");
    expect(charge.creditsCharged).toBe(0);
    expect(charge.moneyChargedFen).toBe(199);
  });

  it("maps insufficient balances to a payment-required error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "INSUFFICIENT_BALANCE" },
    });
    const service = createBillingService({ getAdminClient: () => ({ rpc }) as never });

    await expect(service.chargeGeneration({
      workspaceId: "ws-1",
      userId: "user-1",
      modelId: "image/model",
      generationType: "image",
      idempotencyKey: "job-3",
    })).rejects.toMatchObject({ code: "insufficient_balance", statusCode: 402 });
  });

  it("refunds by charge id so the database restores the original method", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "refund-1", error: null });
    const service = createBillingService({ getAdminClient: () => ({ rpc }) as never });

    await expect(service.refundGeneration({
      chargeId: "charge-1",
      idempotencyKey: "refund:job-1",
      reason: "provider_timeout",
    })).resolves.toBe("refund-1");
    expect(rpc).toHaveBeenCalledWith("refund_generation_charge", {
      p_charge_id: "charge-1",
      p_idempotency_key: "refund:job-1",
      p_reason: "provider_timeout",
    });
  });

  it("rejects malformed database results that imply a combined payment", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        charge_id: "charge-bad",
        payment_method: "credits",
        credits_charged: 5,
        money_charged_fen: 50,
      },
      error: null,
    });
    const service = createBillingService({ getAdminClient: () => ({ rpc }) as never });

    await expect(service.chargeGeneration({
      workspaceId: "ws-1",
      userId: "user-1",
      modelId: "image/model",
      generationType: "image",
      idempotencyKey: "job-bad",
    })).rejects.toBeInstanceOf(BillingServiceError);
  });
});
