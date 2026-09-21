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
    createProvider: vi.fn().mockResolvedValue(undefined),
    updateProvider: vi.fn().mockResolvedValue(undefined),
    discoverProviderModels: vi.fn().mockResolvedValue([{ id: "gpt-image-1", ownedBy: "openai" }]),
    listModels: vi.fn().mockResolvedValue([]),
    createModel: vi.fn().mockResolvedValue(undefined),
    updateModel: vi.fn().mockResolvedValue(undefined),
    listPlans: vi.fn().mockResolvedValue([]),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    getCreditPackSettings: vi.fn().mockResolvedValue({ creditsPerYuan: 10, packs: [] }),
    updateCreditRatio: vi.fn().mockResolvedValue(undefined),
    createCreditPack: vi.fn().mockResolvedValue(undefined),
    updateCreditPack: vi.fn().mockResolvedValue(undefined),
    deleteCreditPack: vi.fn().mockResolvedValue(undefined),
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

  it("creates a new OpenAI-compatible provider", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const payload = { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", secret: "sk-test", enabled: true };
    const response = await app.inject({ method: "POST", url: "/api/admin/providers", payload });
    expect(response.statusCode).toBe(201);
    expect(service.createProvider).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), payload);
  });

  it("returns a conflict for duplicate supplier IDs", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    service.createProvider.mockRejectedValueOnce({ code: "23505" });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/providers",
      payload: { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", secret: "sk-test", enabled: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain("供应商标识已存在");
  });

  it("adjusts a user's credit balance", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/users/user-1/adjust", payload: { amount: 500, reason: "manual recharge" } });
    expect(response.statusCode).toBe(204);
    expect(service.adjustUser).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "user-1", { amount: 500, reason: "manual recharge" });
  });

  it("discovers models from an OpenAI-compatible provider", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/providers/openai/models/discover", payload: { baseUrl: "https://gateway.example.com/v1", secret: "sk-test" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ models: [{ id: "gpt-image-1", ownedBy: "openai" }] });
    expect(service.discoverProviderModels).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "openai", { baseUrl: "https://gateway.example.com/v1", secret: "sk-test" });
  });

  it("discovers models for any configured provider", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "POST", url: "/api/admin/providers/volces/models/discover", payload: { baseUrl: "https://ark.example.com/api/v3", secret: "test-key" } });
    expect(response.statusCode).toBe(200);
    expect(service.discoverProviderModels).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "volces", expect.any(Object));
  });

  it("imports an image model with billing prices", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const payload = { providerId: "openai", modelId: "gpt-image-1", displayName: "GPT Image 1", creditPrice: 12, costPriceFen: 80, minimumPlan: "free", enabled: true };
    const response = await app.inject({ method: "POST", url: "/api/admin/models", payload });
    expect(response.statusCode).toBe(201);
    expect(service.createModel).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), { ...payload, generationType: "image" });
  });

  it("creates a recharge tier with a fixed base and bonus credit snapshot", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const payload = { id: "launch-100", name: "100 元档", amountFen: 10000, bonusCredits: 200, lemonSqueezyVariantId: "12345", enabled: true };
    const response = await app.inject({ method: "POST", url: "/api/admin/credit-packs", payload });
    expect(response.statusCode).toBe(201);
    expect(service.createCreditPack).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), payload);
  });

  it("returns a conflict for duplicate credit pack IDs", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    service.createCreditPack.mockRejectedValueOnce({ code: "23505" });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/credit-packs",
      payload: { id: "launch-100", name: "100 元档", amountFen: 10000, bonusCredits: 200, lemonSqueezyVariantId: "12345", enabled: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain("充值档位标识已存在");
  });

  it("updates the global RMB conversion ratio", async () => {
    const { app, service } = createApp({ user: { id: "admin-1", email: "root@example.com" } });
    const response = await app.inject({ method: "PATCH", url: "/api/admin/credit-packs/settings", payload: { creditsPerYuan: 12 } });
    expect(response.statusCode).toBe(204);
    expect(service.updateCreditRatio).toHaveBeenCalledWith(expect.any(Object), 12);
  });
});
