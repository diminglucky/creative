import type { FastifyInstance, FastifyReply } from "fastify";
import { paymentPreferenceSchema } from "@creative/shared";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { AdminSupabaseClient } from "../supabase/admin.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export function registerWalletRoutes(app: FastifyInstance, options: { auth: RequestAuthenticator; viewerService: ViewerService; getAdminClient: () => AdminSupabaseClient }) {
  const context = async (request: any, reply: FastifyReply) => {
    const user=await options.auth.authenticate(request); if(!user){reply.code(401).send({error:{code:"unauthorized",message:"Authentication required"}});return null;}
    return {user,viewer:await options.viewerService.ensureViewer(user)};
  };
  app.get("/api/wallet",async(req,reply)=>{const ctx=await context(req,reply);if(!ctx)return;const admin=options.getAdminClient() as any;const workspaceId=ctx.viewer.workspace.id;const [credit,money,pref]=await Promise.all([admin.from("credit_balances").select("balance").eq("workspace_id",workspaceId).maybeSingle(),admin.from("money_wallets").select("balance_fen").eq("workspace_id",workspaceId).maybeSingle(),admin.from("payment_preferences").select("primary_method,auto_fallback").eq("workspace_id",workspaceId).maybeSingle()]);return {creditBalance:credit.data?.balance??0,moneyBalanceFen:money.data?.balance_fen??0,preference:{primaryMethod:pref.data?.primary_method??"credits",autoFallback:pref.data?.auto_fallback??false}};});
  app.put("/api/wallet/preferences",async(req,reply)=>{const ctx=await context(req,reply);if(!ctx)return;const parsed=paymentPreferenceSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:{code:"invalid_request",message:"Invalid payment preference"}});const admin=options.getAdminClient() as any;const {error}=await admin.from("payment_preferences").upsert({workspace_id:ctx.viewer.workspace.id,primary_method:parsed.data.primaryMethod,auto_fallback:parsed.data.autoFallback,updated_at:new Date().toISOString()});if(error)return reply.code(500).send({error:{code:"wallet_update_failed",message:"Unable to save payment preference"}});return {preference:parsed.data};});
  app.get("/api/wallet/ledger",async(req,reply)=>{const ctx=await context(req,reply);if(!ctx)return;const admin=options.getAdminClient() as any;const {data,error}=await admin.from("wallet_ledger").select("*").eq("workspace_id",ctx.viewer.workspace.id).order("created_at",{ascending:false}).limit(100);if(error)return reply.code(500).send({error:{code:"wallet_query_failed",message:"Unable to load wallet ledger"}});return {entries:data??[]};});
}
