import { describe, expect, it, vi } from "vitest";

import { DynamicOpenAIImageError } from "./dynamic-openai-image-service.js";
import { generateImageForModel } from "./image-generation.js";
import { clearProviders, registerImageProvider } from "./providers/registry.js";

describe("generateImageForModel", () => {
  it("uses an enabled database-backed OpenAI-compatible model", async () => {
    const dynamicImageService = {
      generate: vi.fn().mockResolvedValue({
        url: "https://cdn.example/dynamic.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      }),
    };

    await expect(
      generateImageForModel(
        { model: "custom-image", prompt: "test" },
        dynamicImageService,
      ),
    ).resolves.toMatchObject({
      providerName: "openai",
      image: { width: 1024 },
    });
  });

  it("falls back to the static registry only when the model is not configured dynamically", async () => {
    clearProviders();
    const staticGenerate = vi.fn().mockResolvedValue({
      url: "https://cdn.example/static.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
    });
    registerImageProvider({
      name: "static-provider",
      models: [
        { id: "static-image", displayName: "Static", description: "Static" },
      ],
      generate: staticGenerate,
    });
    const dynamicImageService = {
      generate: vi
        .fn()
        .mockRejectedValue(
          new DynamicOpenAIImageError("model_not_configured", "not configured"),
        ),
    };

    await expect(
      generateImageForModel(
        { model: "static-image", prompt: "test" },
        dynamicImageService,
      ),
    ).resolves.toMatchObject({
      providerName: "static-provider",
      image: { width: 512 },
    });
    expect(staticGenerate).toHaveBeenCalled();
    clearProviders();
  });

  it("does not hide provider configuration or request failures behind static fallback", async () => {
    const error = new DynamicOpenAIImageError(
      "provider_credentials_missing",
      "missing credential",
    );
    const dynamicImageService = { generate: vi.fn().mockRejectedValue(error) };

    await expect(
      generateImageForModel(
        { model: "custom-image", prompt: "test" },
        dynamicImageService,
      ),
    ).rejects.toBe(error);
  });
});
