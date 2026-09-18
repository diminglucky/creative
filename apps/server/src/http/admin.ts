import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AdminService } from "../features/admin/admin-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const providerUpdateSchema = z.object({ baseUrl: z.string().url().refine((v) => /^https?:\/\//i.test(v)), enabled: z.boolean(), secret: z.string().min(1).optional() });
const modelUpdateSchema = z.object({ creditPrice: z.number().int().nonnegative(), costPriceFen: z.number().int().nonnegative().default(0), minimumPlan: z.string().min(1).default("free"), enabled: z.boolean() });
const planUpdateSchema = z.object({ name: z.string().min(1), description: z.string(), monthlyPriceFen: z.number().int().nonnegative(), yearlyPriceFen: z.number().int().nonnegative(), includedCredits: z.number().int().nonnegative(), benefits: z.array(z.string()), enabled: z.boolean() });
const userAdjustmentSchema = z.object({ amount: z.number().int().refine((v) => v !== 0), reason: z.string().min(2).max(200) });
const providerDiscoverySchema = z.object({ baseUrl: z.string().url().refine((v) => /^https?:\/\//i.test(v)), secret: z.string().min(1).optional() });
const modelCreateSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1), displayName: z.string().min(1), creditPrice: z.number().int().nonnegative(), costPriceFen: z.number().int().nonnegative().default(0), minimumPlan: z.string().min(1).default("free"), enabled: z.boolean().default(true) });

export function registerAdminRoutes(app: FastifyInstance, options: { auth: RequestAuthenticator; adminEmail?: string; service: AdminService }) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await options.auth.authenticate(request);
    if (!user) { reply.code(401).send({ error: { code: "unauthorized", message: "Authentication required" } }); return null; }
    const email = (user as any).email?.toLowerCase();
    if (!options.adminEmail || email !== options.adminEmail.toLowerCase()) { reply.code(403).send({ error: { code: "admin_forbidden", message: "Administrator access required" } }); return null; }
    return { id: user.id, email };
  };
  app.get("/api/admin/overview", async (req, reply) => { if (!await guard(req,reply)) return; return { ...(await options.service.getOverview()) }; });
  app.get("/api/admin/providers", async (req, reply) => { if (!await guard(req,reply)) return; return { providers: await options.service.listProviders() }; });
  app.patch("/api/admin/providers/:id", async (req, reply) => { const actor=await guard(req,reply); if(!actor)return; const parsed=providerUpdateSchema.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid provider settings"}}); await options.service.updateProvider(actor,(req.params as any).id,parsed.data); return reply.code(204).send(); });
  app.post("/api/admin/providers/:id/models/discover", async(req,reply)=>{if(!await guard(req,reply))return;const parsed=providerDiscoverySchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid provider discovery settings"}});return {models:await options.service.discoverProviderModels((req.params as any).id,parsed.data)};});
  app.get("/api/admin/models", async(req,reply)=>{if(!await guard(req,reply))return;return {models:await options.service.listModels()};});
  app.post("/api/admin/models",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=modelCreateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid model settings"}});await options.service.createModel(actor,{...parsed.data,generationType:"image"});return reply.code(201).send();});
  app.patch("/api/admin/models/:id", async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=modelUpdateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid model settings"}});await options.service.updateModel(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/plans", async(req,reply)=>{if(!await guard(req,reply))return;return {plans:await options.service.listPlans()};});
  app.patch("/api/admin/plans/:id", async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=planUpdateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid plan settings"}});await options.service.updatePlan(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/users", async(req,reply)=>{if(!await guard(req,reply))return;return {users:await options.service.listUsers()};});
  app.post("/api/admin/users/:id/adjust",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=userAdjustmentSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid balance adjustment"}});await options.service.adjustUser(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/orders", async(req,reply)=>{if(!await guard(req,reply))return;return {orders:await options.service.listOrders()};});
  app.get("/api/admin/ledger", async(req,reply)=>{if(!await guard(req,reply))return;return {entries:await options.service.listLedger()};});
}
