import { describe, expect, it, vi } from "vitest";

import {
  canAccessImageModelPlan,
  createImageModelCatalog,
} from "./image-model-catalog.js";

describe("image model catalog", () => {
  it("uses the administrator-configured minimum plan for access", () => {
    expect(canAccessImageModelPlan("free", "free")).toBe(true);
    expect(canAccessImageModelPlan("free", "starter")).toBe(false);
    expect(canAccessImageModelPlan("pro", "starter")).toBe(true);
  });
  it("queries image generation prices and returns enabled entries", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          model_id: "custom/image-model",
          display_name: "Custom Image",
          provider_id: "custom-gateway",
          credit_price: 17,
          money_price_fen: 299,
          minimum_plan: "starter",
          enabled: true,
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    const catalog = createImageModelCatalog({
      getAdminClient: () => client as never,
      getRegistryModels: () => [],
    });

    await expect(catalog.listEnabledImageModels()).resolves.toEqual([
      {
        id: "custom/image-model",
        displayName: "Custom Image",
        description: "Custom Image",
        provider: "custom-gateway",
        creditCost: 17,
        moneyPriceFen: 299,
        minTier: "starter",
      },
    ]);
    expect(eq).toHaveBeenCalledWith("generation_type", "image");
  });

  it("does not restore a registry model that an administrator disabled", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          model_id: "registry/model",
          display_name: "Disabled model",
          provider_id: "registry-provider",
          credit_price: 9,
          money_price_fen: 99,
          minimum_plan: "free",
          enabled: false,
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order }),
        }),
      }),
    };
    const catalog = createImageModelCatalog({
      getAdminClient: () => client as never,
      getRegistryModels: () => [
        {
          id: "registry/model",
          displayName: "Registry model",
          description: "Registry description",
          provider: "registry-provider",
        },
      ],
    });

    await expect(catalog.listEnabledImageModels()).resolves.toEqual([]);
  });

  it("falls back to the registry when the database client is unavailable", async () => {
    const catalog = createImageModelCatalog({
      getAdminClient: () => {
        throw new Error("Supabase is not configured");
      },
      getRegistryModels: () => [
        {
          id: "registry/model",
          displayName: "Registry model",
          description: "Registry description",
          provider: "registry-provider",
        },
      ],
    });

    await expect(catalog.listEnabledImageModels()).resolves.toEqual([
      expect.objectContaining({
        id: "registry/model",
        provider: "registry-provider",
      }),
    ]);
  });
});
