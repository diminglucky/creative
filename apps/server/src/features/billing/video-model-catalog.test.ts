import { describe, expect, it, vi } from "vitest";

import {
  canAccessVideoModelPlan,
  createVideoModelCatalog,
} from "./video-model-catalog.js";

describe("video model catalog", () => {
  it("uses the administrator-configured minimum plan for access", () => {
    expect(canAccessVideoModelPlan("free", "free")).toBe(true);
    expect(canAccessVideoModelPlan("free", "starter")).toBe(false);
    expect(canAccessVideoModelPlan("pro", "starter")).toBe(true);
  });

  it("returns enabled database video models with configured pricing", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          model_id: "custom/video-model",
          display_name: "Custom Video",
          provider_id: "custom-gateway",
          credit_price: 42,
          money_price_fen: 420,
          minimum_plan: "starter",
          enabled: true,
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    const catalog = createVideoModelCatalog({
      getAdminClient: () => client as never,
      getRegistryModels: () => [],
    });

    await expect(catalog.listEnabledVideoModels()).resolves.toEqual([
      expect.objectContaining({
        id: "custom/video-model",
        displayName: "Custom Video",
        provider: "custom-gateway",
        creditCost: 42,
        moneyPriceFen: 420,
        minTier: "starter",
      }),
    ]);
    expect(eq).toHaveBeenCalledWith("generation_type", "video");
  });

  it("falls back to the registry when the database is unavailable", async () => {
    const catalog = createVideoModelCatalog({
      getAdminClient: () => {
        throw new Error("Supabase is not configured");
      },
      getRegistryModels: () => [
        {
          id: "registry/video-model",
          displayName: "Registry Video",
          description: "Registry description",
          provider: "registry-provider",
          capabilities: {
            textToVideo: true,
            imageToVideo: false,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 5,
            maxResolution: "720p" as const,
            maxInputImages: 0,
          },
        },
      ],
    });

    await expect(catalog.listEnabledVideoModels()).resolves.toEqual([
      expect.objectContaining({
        id: "registry/video-model",
        provider: "registry-provider",
      }),
    ]);
  });
});
