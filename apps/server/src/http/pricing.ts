import type { FastifyInstance } from "fastify";

import {
  applicationErrorResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@creative/shared";

import type { AdminSupabaseClient } from "../supabase/admin.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerPricingRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    getAdminClient: () => AdminSupabaseClient;
  },
) {
  app.get("/api/pricing/plans", async (_request, reply) => {
    const { data, error } = await (options.getAdminClient() as any)
      .from("billing_plans")
      .select("id,name,description,monthly_price_fen,yearly_price_fen,included_credits,benefits,enabled")
      .eq("enabled", true)
      .order("monthly_price_fen");
    if (error) {
      return reply.code(500).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Unable to load subscription plans.",
          },
        }),
      );
    }
    return reply.code(200).send({
      plans: (data ?? []).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceFen: plan.monthly_price_fen,
        yearlyPriceFen: plan.yearly_price_fen,
        includedCredits: plan.included_credits,
        benefits: plan.benefits ?? [],
      })),
    });
  });

  app.get("/api/pricing/credit-preview", async (request, reply) => {
    const user = await options.auth.authenticate(request);
    if (!user) {
      return reply.code(401).send(
        unauthenticatedErrorResponseSchema.parse({
          error: { code: "unauthorized", message: "Missing or invalid bearer token." },
        }),
      );
    }

    const admin = options.getAdminClient() as any;
    const [settingsResult, packsResult, modelsResult] = await Promise.all([
      admin
        .from("billing_settings")
        .select("credits_per_yuan")
        .eq("id", "default")
        .single(),
      admin
        .from("credit_packs")
        .select("id,name,credits,price_fen")
        .eq("enabled", true)
        .is("deleted_at", null)
        .not("lemon_squeezy_variant_id", "is", null)
        .order("sort_order"),
      admin
        .from("generation_prices")
        .select("model_id,display_name,credit_price")
        .eq("generation_type", "image")
        .eq("enabled", true)
        .order("credit_price"),
    ]);

    if (settingsResult.error || packsResult.error || modelsResult.error) {
      return reply.code(500).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "application_error",
            message: "Unable to load credit price preview.",
          },
        }),
      );
    }

    return reply.code(200).send({
      creditsPerYuan: settingsResult.data?.credits_per_yuan ?? 10,
      packs: (packsResult.data ?? []).map((pack: any) => ({
        id: pack.id,
        name: pack.name,
        credits: pack.credits,
        priceFen: pack.price_fen,
      })),
      imageModels: (modelsResult.data ?? []).map((model: any) => ({
        id: model.model_id,
        displayName: model.display_name,
        creditCost: model.credit_price,
      })),
    });
  });
}
