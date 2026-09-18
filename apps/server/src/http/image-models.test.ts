import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerImageModelRoutes } from "./image-models.js";

describe("GET /api/image-models", () => {
  it("returns enabled database image models with database pricing and metadata", async () => {
    const app = Fastify();
    const imageModelCatalog = {
      listEnabledImageModels: vi.fn().mockResolvedValue([
        {
          id: "custom/image-model",
          displayName: "Custom Image",
          description: "Configured by an administrator",
          provider: "custom-gateway",
          creditCost: 17,
          moneyPriceFen: 299,
          minTier: "starter" as const,
        },
      ]),
    };
    await registerImageModelRoutes(app, {
      auth: {
        authenticate: vi.fn().mockResolvedValue({ id: "user-1" }),
      } as never,
      creditService: {
        getBalance: vi.fn().mockResolvedValue({ plan: "pro" }),
      } as never,
      viewerService: {
        ensureViewer: vi
          .fn()
          .mockResolvedValue({ workspace: { id: "workspace-1" } }),
      } as never,
      imageModelCatalog,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/image-models",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      models: [
        {
          id: "custom/image-model",
          displayName: "Custom Image",
          description: "Configured by an administrator",
          provider: "custom-gateway",
          creditCost: 17,
          moneyPriceFen: 299,
          minTier: "starter",
          accessible: true,
        },
      ],
    });
  });

  it("marks database models inaccessible for an unauthenticated user", async () => {
    const app = Fastify();
    await registerImageModelRoutes(app, {
      auth: { authenticate: vi.fn().mockResolvedValue(null) } as never,
      creditService: {} as never,
      viewerService: {} as never,
      imageModelCatalog: {
        listEnabledImageModels: vi.fn().mockResolvedValue([
          {
            id: "custom/image-model",
            displayName: "Custom Image",
            description: "Configured by an administrator",
            provider: "custom-gateway",
            creditCost: 17,
            moneyPriceFen: 299,
            minTier: "free" as const,
          },
        ]),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/image-models",
    });
    expect(response.json().models[0].accessible).toBe(false);
  });

  it("uses the database minimum tier when computing accessibility", async () => {
    const app = Fastify();
    await registerImageModelRoutes(app, {
      auth: {
        authenticate: vi.fn().mockResolvedValue({ id: "user-1" }),
      } as never,
      creditService: {
        getBalance: vi.fn().mockResolvedValue({ plan: "free" }),
      } as never,
      viewerService: {
        ensureViewer: vi
          .fn()
          .mockResolvedValue({ workspace: { id: "workspace-1" } }),
      } as never,
      imageModelCatalog: {
        listEnabledImageModels: vi.fn().mockResolvedValue([
          {
            id: "google-official/gemini-2.5-flash-image",
            displayName: "Custom Image",
            description: "Configured by an administrator",
            provider: "custom-gateway",
            creditCost: 17,
            moneyPriceFen: 299,
            minTier: "starter" as const,
          },
        ]),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/image-models",
    });
    expect(response.json().models[0].accessible).toBe(false);
  });
});
