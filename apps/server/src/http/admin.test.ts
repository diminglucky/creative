import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerAdminRoutes } from "./admin.js";

function createApp(options?: { user?: { id: string; email?: string }; adminEmail?: string }) {
  const app = Fastify();
  const service = {
    getOverview: vi.fn().mockResolvedValue({
      metrics: { revenueFen: 0, refundFen: 0, generationCount: 0, activeUsers: 0 },
      recentAudit: [],
    }),
    listProviders: vi.fn().mockResolvedValue([]),
    updateProvider: vi.fn().mockResolvedValue(undefined),
    discoverProviderModels: vi.fn().mockResolvedValue([{ id: "gpt-image-1", ownedBy: "openai" }]),
    listModels: vi.fn().mockResolvedValue([]),
    createModel: vi.fn().mockResolvedValue(undefined),
    updateModel: vi.fn().mockResolvedValue(undefined),
    listPlans: vi.fn().mockResolvedValue([]),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue([]),
    adjustUser: vi.fn().mockResolvedValue(undefined),
    listOrders: vi.fn().mockResolvedValue([]),
    listLedger: vi.fn().mockResolvedValue([]),
  };
  registerAdminRoutes(app, {
    auth: { authenticate: vi.fn().mockResolvedValue(options?.user ?? null) } as never,
    adminEmail: options?.adminEmail ?? "root@example.com",
    service,
  });
  return { app, service };
}

describe("admin routes", () => {
  it("rejects unauthenticated requests", async () => {
    const { app } = createApp();
    const response = await app.inject({ method: "GET", url: "/api/admin/overview" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects authenticated non-admin users", async () => {
    const { app } = createApp({ user: { id: "user-1", email: "member@example.com" } });
    const response = await app.inject({ method: "GET", url: "/api/admin/overview" });
    expect(response.statusCode).toBe(403);
  });

  it("allows the configured super administrator", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "ROOT@example.com" } });
    const response = await app.inject({ method: "GET", url: "/api/admin/overview" });
    expect(response.statusCode).toBe(200);
    expect(service.getOverview).toHaveBeenCalled();
  });

  it("never accepts an invalid provider URL", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({
      method: "PATCH",
      url: "/api/admin/providers/openai",
      payload: { baseUrl: "javascript:alert(1)", enabled: true },
    });
    expect(response.statusCode).toBe(400);
    expect(service.updateProvider).not.toHaveBeenCalled();
  });

  it("adjusts a user's selected balance", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/users/user-1/adjust", payload: { paymentMethod: "money", amount: 500, reason: "manual recharge" } });
    expect(response.statusCode).toBe(204);
    expect(service.adjustUser).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "user-1", { paymentMethod: "money", amount: 500, reason: "manual recharge" });
  });

  it("discovers models from an OpenAI-compatible provider", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/providers/openai/models/discover", payload: { baseUrl: "https://gateway.example.com/v1", secret: "sk-test" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ models: [{ id: "gpt-image-1", ownedBy: "openai" }] });
    expect(service.discoverProviderModels).toHaveBeenCalledWith("openai", { baseUrl: "https://gateway.example.com/v1", secret: "sk-test" });
  });

  it("discovers models for any configured provider", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/providers/volces/models/discover", payload: { baseUrl: "https://ark.example.com/api/v3", secret: "test-key" } });
    expect(response.statusCode).toBe(200);
    expect(service.discoverProviderModels).toHaveBeenCalledWith("volces", expect.any(Object));
  });

  it("imports an image model with billing prices", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const payload = { providerId: "openai", modelId: "gpt-image-1", displayName: "GPT Image 1", creditPrice: 12, moneyPriceFen: 199, costPriceFen: 80, minimumPlan: "free", enabled: true };
    const response = await app.inject({ method: "POST", url: "/api/admin/models", payload });
    expect(response.statusCode).toBe(201);
    expect(service.createModel).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), { ...payload, generationType: "image" });
  });
});
