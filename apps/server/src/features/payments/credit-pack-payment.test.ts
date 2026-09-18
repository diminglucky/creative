import { describe, expect, it, vi } from "vitest";

import { createPaymentService, type WebhookPayload } from "./payment-service.js";

function orderPayload(status = "paid"): WebhookPayload {
  return {
    meta: { event_name: "order_created", custom_data: { workspace_id: "workspace-1", credit_pack_id: "credits-500" } },
    data: { id: "order-123", type: "orders", attributes: { store_id: 1, customer_id: 2, order_id: 123, variant_id: 456, status, renews_at: null, ends_at: null, total: 4900 } },
  };
}

describe("credit pack payments", () => {
  it("grants a paid order through the idempotent database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 500, error: null });
    const service = createPaymentService({
      lemonSqueezy: {} as never,
      getAdminClient: () => ({ rpc } as never),
      variantMap: {},
      webOrigin: "https://creative.example.com",
    });

    await service.handleWebhookEvent("order_created", orderPayload());

    expect(rpc).toHaveBeenCalledWith("grant_credit_pack_purchase", {
      p_workspace_id: "workspace-1",
      p_pack_id: "credits-500",
      p_provider_order_id: "123",
      p_amount_fen: 4900,
    });
  });

  it("does not grant credits before the provider reports payment", async () => {
    const rpc = vi.fn();
    const service = createPaymentService({ lemonSqueezy: {} as never, getAdminClient: () => ({ rpc } as never), variantMap: {}, webOrigin: "https://creative.example.com" });
    await service.handleWebhookEvent("order_created", orderPayload("pending"));
    expect(rpc).not.toHaveBeenCalled();
  });
});
