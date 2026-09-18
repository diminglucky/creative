// @credits-system — Image model list with tier annotations, credit costs, and accessibility flags
import type { FastifyInstance } from "fastify";

import type { SubscriptionPlan } from "@creative/shared";

import {
  type ImageModelCatalog,
  canAccessImageModelPlan,
} from "../features/billing/image-model-catalog.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { CreditService } from "../features/credits/credit-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerImageModelRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    creditService: CreditService;
    imageModelCatalog: ImageModelCatalog;
    viewerService: ViewerService;
  },
) {
  app.get("/api/image-models", async (request, reply) => {
    const models = await options.imageModelCatalog.listEnabledImageModels();

    // Try to authenticate — unauthenticated users still see models
    let userPlan: SubscriptionPlan | null = null;
    try {
      const user = await options.auth.authenticate(request);
      if (user) {
        const viewer = await options.viewerService.ensureViewer(user);
        const balance = await options.creditService.getBalance(
          viewer.workspace.id,
        );
        userPlan = balance.plan;
      }
    } catch {
      // Auth failure is non-fatal — just show models as inaccessible
    }

    const annotated = models.map((model) => ({
      ...model,
      accessible:
        userPlan !== null && canAccessImageModelPlan(userPlan, model.minTier),
    }));

    return reply.code(200).send({ models: annotated });
  });
}
