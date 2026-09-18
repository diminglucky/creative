import OpenAI from "openai";

import type { AdminSupabaseClient } from "../supabase/admin.js";
import type { GeneratedImage, ImageGenerateParams } from "./types.js";

type DynamicOpenAIImageErrorCode =
  | "configuration_query_failed"
  | "model_not_configured"
  | "provider_not_configured"
  | "provider_credentials_missing"
  | "no_output"
  | "api_error";

export class DynamicOpenAIImageError extends Error {
  constructor(
    readonly code: DynamicOpenAIImageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DynamicOpenAIImageError";
  }
}

type OpenAIImageSize = "1024x1024" | "1536x1024" | "1024x1536";

type OpenAIImageClient = {
  images: {
    generate(input: {
      model: string;
      prompt: string;
      size: OpenAIImageSize;
      n: 1;
    }): Promise<{
      data?: Array<{
        url?: string | null;
        b64_json?: string | null;
      }>;
    }>;
  };
};

type OpenAIClientConfig = { apiKey: string; baseURL: string };

type ConfigQueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

type ConfigQuery = {
  select(columns: string): ConfigQuery;
  eq(column: string, value: unknown): ConfigQuery;
  maybeSingle(): Promise<ConfigQueryResult>;
};

type ConfigClient = {
  from(table: string): ConfigQuery;
};

export type DynamicOpenAIImageService = {
  generate(params: ImageGenerateParams): Promise<GeneratedImage>;
};

export function createDynamicOpenAIImageService(options: {
  getAdminClient: () => AdminSupabaseClient;
  createOpenAIClient?: (config: OpenAIClientConfig) => OpenAIImageClient;
}): DynamicOpenAIImageService {
  const createOpenAIClient =
    options.createOpenAIClient ??
    ((config: OpenAIClientConfig) =>
      new OpenAI(config) as unknown as OpenAIImageClient);

  return {
    async generate(params) {
      const admin = options.getAdminClient() as unknown as ConfigClient;
      const modelResult = await admin
        .from("generation_prices")
        .select("model_id,provider_id")
        .eq("model_id", params.model)
        .eq("generation_type", "image")
        .eq("enabled", true)
        .maybeSingle();

      if (modelResult.error) {
        throw new DynamicOpenAIImageError(
          "configuration_query_failed",
          "Unable to load image model configuration.",
        );
      }
      const providerId = modelResult.data?.provider_id;
      if (typeof providerId !== "string" || providerId.length === 0) {
        throw new DynamicOpenAIImageError(
          "model_not_configured",
          `Image model ${params.model} is not enabled.`,
        );
      }

      const providerResult = await admin
        .from("platform_providers")
        .select("id,base_url,secret_ciphertext")
        .eq("id", providerId)
        .eq("enabled", true)
        .maybeSingle();

      if (providerResult.error) {
        throw new DynamicOpenAIImageError(
          "configuration_query_failed",
          "Unable to load image provider configuration.",
        );
      }
      if (!providerResult.data) {
        throw new DynamicOpenAIImageError(
          "provider_not_configured",
          `Image provider ${providerId} is not enabled.`,
        );
      }

      const providerIdFromRow = providerResult.data.id;
      const baseURL = providerResult.data.base_url;
      const storedCredential = providerResult.data.secret_ciphertext;
      const credential =
        typeof storedCredential === "string" ? storedCredential.trim() : "";
      if (!credential) {
        throw new DynamicOpenAIImageError(
          "provider_credentials_missing",
          `Image provider ${String(providerIdFromRow)} has no API credential.`,
        );
      }
      if (typeof baseURL !== "string" || !/^https?:\/\//i.test(baseURL)) {
        throw new DynamicOpenAIImageError(
          "provider_not_configured",
          `Image provider ${String(providerIdFromRow)} has no valid base URL.`,
        );
      }

      const { size, width, height } = getOpenAIImageSize(
        params.aspectRatio ?? "1:1",
      );
      const client = createOpenAIClient({
        apiKey: credential,
        baseURL,
      });

      try {
        const response = await client.images.generate({
          model: params.model,
          prompt: params.prompt,
          size,
          n: 1,
        });
        const output = response.data?.[0];
        const url =
          output?.url ??
          (output?.b64_json
            ? `data:image/png;base64,${output.b64_json}`
            : undefined);
        if (!url) {
          throw new DynamicOpenAIImageError(
            "no_output",
            "The image provider returned no image.",
          );
        }
        return { url, mimeType: "image/png", width, height };
      } catch (error) {
        if (error instanceof DynamicOpenAIImageError) throw error;
        const message =
          error instanceof Error ? error.message : "Image generation failed.";
        throw new DynamicOpenAIImageError(
          "api_error",
          redactCredential(message, credential),
        );
      }
    },
  };
}

function getOpenAIImageSize(aspectRatio: string): {
  size: OpenAIImageSize;
  width: number;
  height: number;
} {
  const [widthText, heightText] = aspectRatio.split(":");
  const ratio = Number(widthText) / Number(heightText);
  if (Number.isFinite(ratio) && ratio > 1) {
    return { size: "1536x1024", width: 1536, height: 1024 };
  }
  if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) {
    return { size: "1024x1536", width: 1024, height: 1536 };
  }
  return { size: "1024x1024", width: 1024, height: 1024 };
}

function redactCredential(message: string, credential: string): string {
  return message.split(credential).join("[redacted]");
}
