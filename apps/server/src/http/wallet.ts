import type { FastifyInstance, FastifyReply } from "fastify";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { AdminSupabaseClient } from "../supabase/admin.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export function registerWalletRoutes(app: FastifyInstance, options: { auth: RequestAuthenticator; viewerService: ViewerService; getAdminClient: () => AdminSupabaseClient }) {
  const context = async (request: any, reply: FastifyReply) => {
    const user=await options.auth.authenticate(request); if(!user){reply.code(401).send({error:{code:"unauthorized",message:"Authentication required"}});return null;}
    return {user,viewer:await options.viewerService.ensureViewer(user)};
  };
  app.get("/api/wallet",async(req,reply)=>{const ctx=await context(req,reply);if(!ctx)return;const admin=options.getAdminClient() as any;const workspaceId=ctx.viewer.workspace.id;const credit=await admin.from("credit_balances").select("balance").eq("workspace_id",workspaceId).maybeSingle();return {creditBalance:credit.data?.balance??0};});
  app.get("/api/wallet/ledger",async(req,reply)=>{const ctx=await context(req,reply);if(!ctx)return;const admin=options.getAdminClient() as any;const {data,error}=await admin.from("wallet_ledger").select("*").eq("workspace_id",ctx.viewer.workspace.id).order("created_at",{ascending:false}).limit(100);if(error)return reply.code(500).send({error:{code:"wallet_query_failed",message:"Unable to load wallet ledger"}});return {entries:data??[]};});
}
