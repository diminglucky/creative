import {
  MODEL_MIN_TIER,
  type SubscriptionPlan,
  getVideoCreditCost,
  subscriptionPlanSchema,
} from "@creative/shared";

import {
  type AvailableVideoModel,
  getAvailableVideoModels,
} from "../../generation/providers/registry.js";
import type { VideoModelInfo } from "../../generation/types.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";

const PLAN_ORDER: SubscriptionPlan[] = [
  "free",
  "starter",
  "pro",
  "ultra",
  "business",
];

export function canAccessVideoModelPlan(
  userPlan: SubscriptionPlan,
  minimumPlan: SubscriptionPlan,
): boolean {
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(minimumPlan);
}

export type VideoModelCatalogEntry = {
  id: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  provider: string;
  creditCost: number;
  moneyPriceFen: number;
  minTier: SubscriptionPlan;
  capabilities: VideoModelInfo["capabilities"];
  limits: VideoModelInfo["limits"];
  pricing?: VideoModelInfo["pricing"];
};

export type VideoModelCatalog = {
  listEnabledVideoModels(): Promise<VideoModelCatalogEntry[]>;
};

type GenerationPriceRow = {
  model_id: string;
  display_name: string;
  provider_id: string | null;
  credit_price: number;
  money_price_fen: number;
  minimum_plan: string;
  enabled: boolean;
};

type GenerationPriceQueryClient = {
  from(table: "generation_prices"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(column: string): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export function createVideoModelCatalog(options: {
  getAdminClient: () => AdminSupabaseClient;
  getRegistryModels?: () => AvailableVideoModel[];
}): VideoModelCatalog {
  const getRegistryModels =
    options.getRegistryModels ?? getAvailableVideoModels;

  return {
    async listEnabledVideoModels() {
      const registryModels = getRegistryModels();
      const registryById = new Map(
        registryModels.map((model) => [model.id, model]),
      );
      let data: unknown;
      let error: unknown;
      try {
        const result = await (
          options.getAdminClient() as unknown as GenerationPriceQueryClient
        )
          .from("generation_prices")
          .select(
            "model_id, display_name, provider_id, credit_price, money_price_fen, minimum_plan, enabled",
          )
          .eq("generation_type", "video")
          .order("display_name");
        data = result.data;
        error = result.error;
      } catch (queryError) {
        error = queryError;
      }

      if (error) {
        return registryModels.map(mapRegistryModel);
      }

      const rows = (data ?? []) as GenerationPriceRow[];
      if (rows.length === 0) {
        return registryModels.map(mapRegistryModel);
      }

      const configuredIds = new Set(rows.map((row) => row.model_id));
      return [
        ...rows
          .filter((row) => row.enabled)
          .map((row) => mapDatabaseModel(row, registryById.get(row.model_id))),
        ...registryModels
          .filter((model) => !configuredIds.has(model.id))
          .map(mapRegistryModel),
      ];
    },
  };
}

function mapDatabaseModel(
  row: GenerationPriceRow,
  registryModel: AvailableVideoModel | undefined,
): VideoModelCatalogEntry {
  return {
    id: row.model_id,
    displayName: row.display_name,
    description: registryModel?.description ?? row.display_name,
    ...(registryModel?.iconUrl ? { iconUrl: registryModel.iconUrl } : {}),
    provider: row.provider_id ?? registryModel?.provider ?? "unknown",
    creditCost: row.credit_price,
    moneyPriceFen: row.money_price_fen,
    minTier: parseMinimumPlan(row.minimum_plan),
    ...(registryModel
      ? {
          capabilities: registryModel.capabilities,
          limits: registryModel.limits,
          ...(registryModel.pricing ? { pricing: registryModel.pricing } : {}),
        }
      : {
          // DB-only video models have no known capabilities; expose a
          // conservative default so downstream consumers don't crash.
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
        }),
  };
}

function mapRegistryModel(model: AvailableVideoModel): VideoModelCatalogEntry {
  return {
    id: model.id,
    displayName: model.displayName,
    description: model.description,
    ...(model.iconUrl ? { iconUrl: model.iconUrl } : {}),
    provider: model.provider,
    creditCost: getVideoCreditCost(model.id),
    moneyPriceFen: 0,
    minTier: MODEL_MIN_TIER[model.id] ?? "pro",
    capabilities: model.capabilities,
    limits: model.limits,
    ...(model.pricing ? { pricing: model.pricing } : {}),
  };
}

function parseMinimumPlan(value: string): SubscriptionPlan {
  const parsed = subscriptionPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : "pro";
}
