import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AdminService } from "../features/admin/admin-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const providerUpdateSchema = z.object({ baseUrl: z.string().url().refine((v) => /^https?:\/\//i.test(v)), enabled: z.boolean(), secret: z.string().min(1).optional() });
const providerCreateSchema = z.object({ id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(80), baseUrl: z.string().url().refine((v) => /^https?:\/\//i.test(v)), secret: z.string().min(1), enabled: z.boolean().default(true) });
const planIds = ["free", "starter", "pro", "ultra", "business"] as const;
const generationTypes = ["image", "video"] as const;
const modelUpdateSchema = z.object({ creditPrice: z.number().nonnegative(), costPriceFen: z.number().int().nonnegative().default(0), minimumPlan: z.enum(planIds), generationType: z.enum(generationTypes), enabled: z.boolean() });
const planUpdateSchema = z.object({ name: z.string().min(1), description: z.string(), monthlyPriceFen: z.number().int().nonnegative(), yearlyPriceFen: z.number().int().nonnegative(), includedCredits: z.number().int().nonnegative(), benefits: z.array(z.string()), enabled: z.boolean() });
const userAdjustmentSchema = z.object({ amount: z.number().int().refine((v) => v !== 0), reason: z.string().min(2).max(200) });
const providerDiscoverySchema = z.object({ baseUrl: z.string().url().refine((v) => /^https?:\/\//i.test(v)), secret: z.string().min(1).optional() });
const modelCreateSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1), displayName: z.string().min(1), generationType: z.enum(generationTypes).default("image"), creditPrice: z.number().nonnegative(), costPriceFen: z.number().int().nonnegative().default(0), minimumPlan: z.enum(planIds).default("free"), enabled: z.boolean().default(true) });
const creditRatioSchema=z.object({creditsPerYuan:z.number().int().positive()});
const creditPackSchema=z.object({id:z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),name:z.string().min(1).max(80),amountFen:z.number().int().positive(),bonusCredits:z.number().int().nonnegative(),lemonSqueezyVariantId:z.string().min(1),enabled:z.boolean()});
function parsePagination(query: any) { const offset = Number.parseInt(query?.offset, 10); const limit = Number.parseInt(query?.limit, 10); return { offset: Number.isInteger(offset) && offset >= 0 ? offset : 0, limit: Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50 }; }

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
  app.post("/api/admin/providers", async (req, reply) => { const actor=await guard(req,reply); if(!actor)return; const parsed=providerCreateSchema.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid provider settings"}}); await options.service.createProvider(actor,parsed.data); return reply.code(201).send(); });
  app.patch("/api/admin/providers/:id", async (req, reply) => { const actor=await guard(req,reply); if(!actor)return; const parsed=providerUpdateSchema.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid provider settings"}}); await options.service.updateProvider(actor,(req.params as any).id,parsed.data); return reply.code(204).send(); });
  app.post("/api/admin/providers/:id/models/discover", async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=providerDiscoverySchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid provider discovery settings"}});return {models:await options.service.discoverProviderModels(actor,(req.params as any).id,parsed.data)};});
  app.get("/api/admin/models", async(req,reply)=>{if(!await guard(req,reply))return;return {models:await options.service.listModels()};});
  app.post("/api/admin/models",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=modelCreateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid model settings"}});await options.service.createModel(actor,parsed.data);return reply.code(201).send();});
  app.patch("/api/admin/models/:id", async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=modelUpdateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid model settings"}});await options.service.updateModel(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/plans", async(req,reply)=>{if(!await guard(req,reply))return;return {plans:await options.service.listPlans()};});
  app.patch("/api/admin/plans/:id", async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=planUpdateSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid plan settings"}});await options.service.updatePlan(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/users", async(req,reply)=>{if(!await guard(req,reply))return;const {offset,limit}=parsePagination(req.query);const {items,hasMore}=await options.service.listUsers(offset,limit);return {users:items,hasMore};});
  app.post("/api/admin/users/:id/adjust",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=userAdjustmentSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid balance adjustment"}});await options.service.adjustUser(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.get("/api/admin/orders", async(req,reply)=>{if(!await guard(req,reply))return;const {offset,limit}=parsePagination(req.query);const {items,hasMore}=await options.service.listOrders(offset,limit);return {orders:items,hasMore};});
  app.get("/api/admin/credit-packs",async(req,reply)=>{if(!await guard(req,reply))return;return options.service.getCreditPackSettings();});
  app.patch("/api/admin/credit-packs/settings",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=creditRatioSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"积分兑换比例必须是正整数"}});await options.service.updateCreditRatio(actor,parsed.data.creditsPerYuan);return reply.code(204).send();});
  app.post("/api/admin/credit-packs",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=creditPackSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"充值档位配置无效"}});await options.service.createCreditPack(actor,parsed.data);return reply.code(201).send();});
  app.patch("/api/admin/credit-packs/:id",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;const parsed=creditPackSchema.omit({id:true}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"充值档位配置无效"}});await options.service.updateCreditPack(actor,(req.params as any).id,parsed.data);return reply.code(204).send();});
  app.delete("/api/admin/credit-packs/:id",async(req,reply)=>{const actor=await guard(req,reply);if(!actor)return;await options.service.deleteCreditPack(actor,(req.params as any).id);return reply.code(204).send();});
  app.get("/api/admin/ledger", async(req,reply)=>{if(!await guard(req,reply))return;const {offset,limit}=parsePagination(req.query);const {items,hasMore}=await options.service.listLedger(offset,limit);return {entries:items,hasMore};});
}
