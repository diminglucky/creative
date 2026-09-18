import {
  MODEL_MIN_TIER,
  type SubscriptionPlan,
  getImageCreditCost,
  subscriptionPlanSchema,
} from "@creative/shared";

import {
  type AvailableModel,
  getAvailableImageModels,
} from "../../generation/providers/registry.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";

const PLAN_ORDER: SubscriptionPlan[] = [
  "free",
  "starter",
  "pro",
  "ultra",
  "business",
];

export function canAccessImageModelPlan(
  userPlan: SubscriptionPlan,
  minimumPlan: SubscriptionPlan,
): boolean {
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(minimumPlan);
}

export type ImageModelCatalogEntry = {
  id: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  provider: string;
  creditCost: number;
  moneyPriceFen: number;
  minTier: SubscriptionPlan;
};

export type ImageModelCatalog = {
  listEnabledImageModels(): Promise<ImageModelCatalogEntry[]>;
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

export function createImageModelCatalog(options: {
  getAdminClient: () => AdminSupabaseClient;
  getRegistryModels?: () => AvailableModel[];
}): ImageModelCatalog {
  const getRegistryModels =
    options.getRegistryModels ?? getAvailableImageModels;

  return {
    async listEnabledImageModels() {
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
          .eq("generation_type", "image")
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
  registryModel: AvailableModel | undefined,
): ImageModelCatalogEntry {
  return {
    id: row.model_id,
    displayName: row.display_name,
    description: registryModel?.description ?? row.display_name,
    ...(registryModel?.iconUrl ? { iconUrl: registryModel.iconUrl } : {}),
    provider: row.provider_id ?? registryModel?.provider ?? "unknown",
    creditCost: row.credit_price,
    moneyPriceFen: row.money_price_fen,
    minTier: parseMinimumPlan(row.minimum_plan),
  };
}

function mapRegistryModel(model: AvailableModel): ImageModelCatalogEntry {
  return {
    id: model.id,
    displayName: model.displayName,
    description: model.description,
    ...(model.iconUrl ? { iconUrl: model.iconUrl } : {}),
    provider: model.provider,
    creditCost: getImageCreditCost(model.id, "hd"),
    moneyPriceFen: 0,
    minTier: MODEL_MIN_TIER[model.id] ?? "pro",
  };
}

function parseMinimumPlan(value: string): SubscriptionPlan {
  const parsed = subscriptionPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : "pro";
}
