import type { AdminSupabaseClient } from "../../supabase/admin.js";

type Actor = { id: string; email: string };

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService(options: { getAdminClient: () => AdminSupabaseClient }) {
  const client = () => options.getAdminClient() as any;
  const audit = async (actor: Actor, action: string, resourceType: string, resourceId: string, details: unknown) => {
    const { error } = await client().from("admin_audit_logs").insert({ actor_user_id: actor.id, actor_email: actor.email, action, resource_type: resourceType, resource_id: resourceId, details });
    if (error) throw new Error(`Failed to write admin audit: ${error.message}`);
  };
  return {
    async getOverview() {
      const [orders, charges, audits, users] = await Promise.all([
        client().from("payment_orders").select("amount_fen,status"),
        client().from("billing_charges").select("id,refunded_at"),
        client().from("admin_audit_logs").select("id,actor_email,action,resource_type,resource_id,created_at").order("created_at", { ascending: false }).limit(10),
        client().from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        metrics: {
          revenueFen: (orders.data ?? []).filter((o: any) => o.status === "paid").reduce((n: number, o: any) => n + o.amount_fen, 0),
          refundFen: 0,
          generationCount: (charges.data ?? []).length,
          activeUsers: users.count ?? 0,
        },
        recentAudit: (audits.data ?? []).map((row: any) => ({ id: row.id, actorEmail: row.actor_email, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, createdAt: row.created_at })),
      };
    },
    async listProviders() {
      const { data, error } = await client().from("platform_providers").select("id,name,base_url,secret_ciphertext,enabled,updated_at").order("name");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ id: p.id, name: p.name, baseUrl: p.base_url, enabled: p.enabled, hasSecret: Boolean(p.secret_ciphertext), secretMask: p.secret_ciphertext ? `••••${p.secret_ciphertext.slice(-4)}` : "", updatedAt: p.updated_at }));
    },
    async updateProvider(actor: Actor, id: string, input: any) {
      const values: any = { base_url: input.baseUrl, enabled: input.enabled, updated_at: new Date().toISOString() };
      if (input.secret) values.secret_ciphertext = input.secret;
      const { error } = await client().from("platform_providers").update(values).eq("id", id);
      if (error) throw error;
      await audit(actor, "provider.updated", "provider", id, { baseUrl: input.baseUrl, enabled: input.enabled, secretChanged: Boolean(input.secret) });
    },
    async listModels() { const { data, error } = await client().from("generation_prices").select("*").order("generation_type").order("display_name"); if (error) throw error; return data ?? []; },
    async updateModel(actor: Actor, id: string, input: any) { const { error } = await client().from("generation_prices").update({ credit_price: input.creditPrice, money_price_fen: input.moneyPriceFen, cost_price_fen: input.costPriceFen, minimum_plan: input.minimumPlan, enabled: input.enabled, updated_at: new Date().toISOString() }).eq("model_id", id); if (error) throw error; await audit(actor,"model.price.updated","model",id,input); },
    async listPlans() { const { data, error } = await client().from("billing_plans").select("*").order("monthly_price_fen"); if (error) throw error; return data ?? []; },
    async updatePlan(actor: Actor, id: string, input: any) { const { error } = await client().from("billing_plans").update({ name: input.name, description: input.description, monthly_price_fen: input.monthlyPriceFen, yearly_price_fen: input.yearlyPriceFen, included_credits: input.includedCredits, benefits: input.benefits, enabled: input.enabled, updated_at: new Date().toISOString() }).eq("id",id); if(error) throw error; await audit(actor,"plan.updated","plan",id,input); },
    async listUsers() { const { data, error } = await client().from("profiles").select("id,email,display_name,created_at").order("created_at", { ascending: false }).limit(200); if(error) throw error; return data ?? []; },
    async adjustUser(actor: Actor, id: string, input: any) { await audit(actor,"user.balance.adjusted","user",id,input); },
    async listOrders() { const { data, error } = await client().from("payment_orders").select("*").order("created_at",{ascending:false}).limit(200); if(error) throw error; return data ?? []; },
    async listLedger() { const { data, error } = await client().from("wallet_ledger").select("*").order("created_at",{ascending:false}).limit(500); if(error) throw error; return data ?? []; },
  };
}

