import {
  DynamicOpenAIImageError,
  type DynamicOpenAIImageService,
} from "./dynamic-openai-image-service.js";
import { getImageProvider } from "./providers/registry.js";
import { resolveImageProviderName } from "./providers/registry.js";
import type { GeneratedImage, ImageGenerateParams } from "./types.js";

export async function generateImage(
  providerName: string,
  params: ImageGenerateParams,
): Promise<GeneratedImage> {
  const provider = getImageProvider(providerName);
  return provider.generate(params);
}

/**
 * Runs an administrator-configured OpenAI-compatible image model when one is
 * enabled in the database. Static providers remain available for legacy models.
 */
export async function generateImageForModel(
  params: ImageGenerateParams,
  dynamicImageService: DynamicOpenAIImageService,
): Promise<{ image: GeneratedImage; providerName: string }> {
  try {
    const image = await dynamicImageService.generate(params);
    return { image, providerName: "openai" };
  } catch (error) {
    if (
      !(error instanceof DynamicOpenAIImageError) ||
      error.code !== "model_not_configured"
    ) {
      throw error;
    }
  }

  const providerName = resolveImageProviderName(params.model);
  return { image: await generateImage(providerName, params), providerName };
}
