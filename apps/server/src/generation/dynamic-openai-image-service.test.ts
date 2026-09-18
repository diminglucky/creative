import { describe, expect, it, vi } from "vitest";

import {
  DynamicOpenAIImageError,
  createDynamicOpenAIImageService,
} from "./dynamic-openai-image-service.js";

type QueryResult = { data: unknown; error: { message: string } | null };

function createAdminClient(results: QueryResult[]) {
  const queries: Array<{ table: string; select: string; filters: unknown[] }> =
    [];
  const from = vi.fn((table: string) => {
    const query = {
      table,
      selectedColumns: "",
      filters: [] as unknown[],
      select(columns: string) {
        this.selectedColumns = columns;
        return this;
      },
      eq(column: string, value: unknown) {
        this.filters.push([column, value]);
        return this;
      },
      maybeSingle() {
        queries.push({
          table: this.table,
          select: this.selectedColumns,
          filters: this.filters,
        });
        return Promise.resolve(results.shift());
      },
    };
    return query;
  });
  return { client: { from }, from, queries };
}

describe("dynamic OpenAI image service", () => {
  it("loads enabled model/provider configuration and calls images.generate", async () => {
    const admin = createAdminClient([
      {
        data: { model_id: "gpt-image-custom", provider_id: "openai-proxy" },
        error: null,
      },
      {
        data: {
          id: "openai-proxy",
          base_url: "https://proxy.example/v1",
          secret_ciphertext: "provider-key",
        },
        error: null,
      },
    ]);
    const generate = vi.fn().mockResolvedValue({
      data: [{ url: "https://cdn.example/generated.png" }],
    });
    const createOpenAIClient = vi.fn(() => ({ images: { generate } }));
    const service = createDynamicOpenAIImageService({
      getAdminClient: () => admin.client as never,
      createOpenAIClient,
    });

    await expect(
      service.generate({
        model: "gpt-image-custom",
        prompt: "A red paper lantern",
        aspectRatio: "16:9",
      }),
    ).resolves.toEqual({
      url: "https://cdn.example/generated.png",
      mimeType: "image/png",
      width: 1536,
      height: 1024,
    });

    expect(admin.queries).toEqual([
      {
        table: "generation_prices",
        select: "model_id,provider_id",
        filters: [
          ["model_id", "gpt-image-custom"],
          ["generation_type", "image"],
          ["enabled", true],
        ],
      },
      {
        table: "platform_providers",
        select: "id,base_url,secret_ciphertext",
        filters: [
          ["id", "openai-proxy"],
          ["enabled", true],
        ],
      },
    ]);
    expect(createOpenAIClient).toHaveBeenCalledWith({
      apiKey: "provider-key",
      baseURL: "https://proxy.example/v1",
    });
    expect(generate).toHaveBeenCalledWith({
      model: "gpt-image-custom",
      prompt: "A red paper lantern",
      size: "1536x1024",
      n: 1,
    });
  });

  it("rejects a missing or disabled model before creating an SDK client", async () => {
    const admin = createAdminClient([{ data: null, error: null }]);
    const createOpenAIClient = vi.fn();
    const service = createDynamicOpenAIImageService({
      getAdminClient: () => admin.client as never,
      createOpenAIClient,
    });

    await expect(
      service.generate({ model: "disabled-model", prompt: "test" }),
    ).rejects.toMatchObject({ code: "model_not_configured" });
    expect(createOpenAIClient).not.toHaveBeenCalled();
  });

  it("rejects disabled providers and missing credentials", async () => {
    const model = {
      data: { model_id: "image-model", provider_id: "provider-1" },
      error: null,
    };
    const disabledProvider = createAdminClient([
      model,
      { data: null, error: null },
    ]);
    const missingCredential = createAdminClient([
      model,
      {
        data: {
          id: "provider-1",
          base_url: "https://api.example/v1",
          secret_ciphertext: null,
        },
        error: null,
      },
    ]);

    await expect(
      createDynamicOpenAIImageService({
        getAdminClient: () => disabledProvider.client as never,
      }).generate({ model: "image-model", prompt: "test" }),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
    await expect(
      createDynamicOpenAIImageService({
        getAdminClient: () => missingCredential.client as never,
      }).generate({ model: "image-model", prompt: "test" }),
    ).rejects.toMatchObject({ code: "provider_credentials_missing" });
  });

  it("maps database, SDK and empty-output failures without leaking credentials", async () => {
    const dbFailure = createAdminClient([
      { data: null, error: { message: "database unavailable" } },
    ]);
    await expect(
      createDynamicOpenAIImageService({
        getAdminClient: () => dbFailure.client as never,
      }).generate({ model: "image-model", prompt: "test" }),
    ).rejects.toMatchObject({ code: "configuration_query_failed" });

    const configured = () =>
      createAdminClient([
        {
          data: { model_id: "image-model", provider_id: "provider-1" },
          error: null,
        },
        {
          data: {
            id: "provider-1",
            base_url: "https://api.example/v1",
            secret_ciphertext: "super-secret",
          },
          error: null,
        },
      ]);
    const empty = configured();
    await expect(
      createDynamicOpenAIImageService({
        getAdminClient: () => empty.client as never,
        createOpenAIClient: () => ({
          images: { generate: vi.fn().mockResolvedValue({ data: [] }) },
        }),
      }).generate({ model: "image-model", prompt: "test" }),
    ).rejects.toMatchObject({ code: "no_output" });

    const failed = configured();
    const request = createDynamicOpenAIImageService({
      getAdminClient: () => failed.client as never,
      createOpenAIClient: () => ({
        images: {
          generate: vi
            .fn()
            .mockRejectedValue(new Error("invalid key super-secret")),
        },
      }),
    }).generate({ model: "image-model", prompt: "test" });
    await expect(request).rejects.toBeInstanceOf(DynamicOpenAIImageError);
    await expect(request).rejects.toMatchObject({
      code: "api_error",
      message: "invalid key [redacted]",
    });
  });
});
