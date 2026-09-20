import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { ProviderSecretCrypto } from "../../security/provider-secret-crypto.js";

type Actor = { id: string; email: string };

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(":")) {
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    );
  }
  return PRIVATE_IPV4.some((r) => r.test(lower));
}

async function assertPublicBaseUrl(raw: string): Promise<void> {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("拒绝访问内网地址。");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("拒绝访问内网地址。");
    return;
  }
  const addresses = await lookup(hostname, { all: true });
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("拒绝访问内网地址。");
  }
}

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService(options: {
  getAdminClient: () => AdminSupabaseClient;
  secretCrypto?: ProviderSecretCrypto;
}) {
  const client = () => options.getAdminClient() as any;
  const audit = async (
    actor: Actor,
    action: string,
    resourceType: string,
    resourceId: string,
    details: unknown,
  ) => {
    const { error } = await client()
      .from("admin_audit_logs")
      .insert({
        actor_user_id: actor.id,
        actor_email: actor.email,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
      });
    if (error) throw new Error(`Failed to write admin audit: ${error.message}`);
  };
  return {
    async getOverview() {
      const [stats, settings, audits] = await Promise.all([
        client().rpc("admin_overview_stats"),
        client()
          .from("billing_settings")
          .select("credits_per_yuan")
          .eq("id", "default")
          .single(),
        client()
          .from("admin_audit_logs")
          .select("id,actor_email,action,resource_type,resource_id,created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (stats.error) throw stats.error;
      const s = (stats.data ?? {}) as any;
      const creditsPerYuan = settings.data?.credits_per_yuan ?? 10;
      const refundedCreditFen = Math.round(
        ((s.refunded_credits ?? 0) / creditsPerYuan) * 100,
      );
      const refundFen = refundedCreditFen + (s.refunded_money_fen ?? 0);
      const auditRows = audits.data ?? [];
      const userIds = [
        ...new Set(
          auditRows
            .filter((row: any) => row.resource_type === "user")
            .map((row: any) => row.resource_id),
        ),
      ];
      const profileResult = userIds.length
        ? await client()
            .from("profiles")
            .select("id,email,display_name")
            .in("id", userIds)
        : { data: [] };
      const profiles = new Map<
        string,
        { id: string; email: string; display_name: string | null }
      >(
        (profileResult.data ?? []).map((profile: any) => [profile.id, profile]),
      );
      return {
        metrics: {
          revenueFen: s.revenue_fen ?? 0,
          refundFen,
          generationCount: s.generation_count ?? 0,
          activeUsers: s.user_count ?? 0,
        },
        recentAudit: auditRows.map((row: any) => {
          const targetUser =
            row.resource_type === "user"
              ? profiles.get(row.resource_id)
              : undefined;
          return {
            id: row.id,
            actorEmail: row.actor_email,
            action: row.action,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            ...(targetUser
              ? {
                  targetUser: {
                    id: targetUser.id,
                    email: targetUser.email,
                    displayName: targetUser.display_name,
                  },
                }
              : {}),
            createdAt: row.created_at,
          };
        }),
      };
    },
    async listProviders() {
      const { data, error } = await client()
        .from("platform_providers")
        .select("id,name,base_url,secret_ciphertext,enabled,updated_at")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.base_url,
        enabled: p.enabled,
        hasSecret: Boolean(p.secret_ciphertext),
        secretMask: p.secret_ciphertext
          ? (options.secretCrypto?.mask(p.secret_ciphertext) ?? "已配置")
          : "",
        updatedAt: p.updated_at,
      }));
    },
    async updateProvider(actor: Actor, id: string, input: any) {
      const values: any = {
        base_url: input.baseUrl,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      };
      if (input.secret) {
        if (!options.secretCrypto)
          throw new Error("Provider secret encryption is not configured.");
        values.secret_ciphertext = options.secretCrypto.encrypt(input.secret);
      }
      const { error } = await client()
        .from("platform_providers")
        .update(values)
        .eq("id", id);
      if (error) throw error;
      await audit(actor, "provider.updated", "provider", id, {
        baseUrl: input.baseUrl,
        enabled: input.enabled,
        secretChanged: Boolean(input.secret),
      });
    },
    async discoverProviderModels(
      actor: Actor,
      id: string,
      input: { baseUrl: string; secret?: string | undefined },
    ) {
      await assertPublicBaseUrl(input.baseUrl);
      let secret = input.secret;
      if (!secret) {
        const { data, error } = await client()
          .from("platform_providers")
          .select("secret_ciphertext")
          .eq("id", id)
          .single();
        if (error) throw error;
        secret = data?.secret_ciphertext
          ? (options.secretCrypto?.decrypt(data.secret_ciphertext) ??
            data.secret_ciphertext)
          : undefined;
      }
      if (!secret) throw new Error("API key is required to fetch models.");
      const endpoint = `${input.baseUrl.replace(/\/$/, "")}/models`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Failed to fetch models: ${response.status}`);
      const payload = (await response.json()) as {
        data?: Array<{ id?: string; owned_by?: string }>;
        results?: Array<{ id?: string; name?: string; owner?: string }>;
      };
      const models = payload.data ?? payload.results ?? [];
      const discovered = models
        .map((model) => ({
          id: model.id ?? ("name" in model ? model.name : undefined),
          ownedBy:
            "owned_by" in model
              ? (model.owned_by ?? "")
              : "owner" in model
                ? (model.owner ?? "")
                : "",
        }))
        .filter(
          (model): model is { id: string; ownedBy: string } =>
            typeof model.id === "string" && model.id.length > 0,
        );
      await audit(actor, "provider.models.discovered", "provider", id, {
        baseUrl: input.baseUrl,
        count: discovered.length,
      });
      return discovered;
    },
    async listModels() {
      const { data, error } = await client()
        .from("generation_prices")
        .select("*")
        .order("generation_type")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
    async createModel(actor: Actor, input: any) {
      const { error } = await client()
        .from("generation_prices")
        .upsert(
          {
            model_id: input.modelId,
            generation_type: input.generationType,
            display_name: input.displayName,
            provider_id: input.providerId,
            credit_price: input.creditPrice,
            money_price_fen: 0,
            cost_price_fen: input.costPriceFen,
            minimum_plan: input.minimumPlan,
            enabled: input.enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "model_id,generation_type" },
        );
      if (error) throw error;
      await audit(actor, "model.created", "model", input.modelId, input);
    },
    async updateModel(actor: Actor, id: string, input: any) {
      const { error } = await client()
        .from("generation_prices")
        .update({
          credit_price: input.creditPrice,
          money_price_fen: 0,
          cost_price_fen: input.costPriceFen,
          minimum_plan: input.minimumPlan,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("model_id", id)
        .eq("generation_type", input.generationType);
      if (error) throw error;
      await audit(actor, "model.price.updated", "model", `${id}:${input.generationType}`, input);
    },
    async listPlans() {
      const { data, error } = await client()
        .from("billing_plans")
        .select("*")
        .order("monthly_price_fen");
      if (error) throw error;
      return data ?? [];
    },
    async updatePlan(actor: Actor, id: string, input: any) {
      const { error } = await client()
        .from("billing_plans")
        .update({
          name: input.name,
          description: input.description,
          monthly_price_fen: input.monthlyPriceFen,
          yearly_price_fen: input.yearlyPriceFen,
          included_credits: input.includedCredits,
          benefits: input.benefits,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      await audit(actor, "plan.updated", "plan", id, input);
    },
    async getCreditPackSettings() {
      const [settings, packs] = await Promise.all([
        client()
          .from("billing_settings")
          .select("credits_per_yuan")
          .eq("id", "default")
          .single(),
        client()
          .from("credit_packs")
          .select(
            "id,name,amount_fen,base_credits,bonus_credits,credits,lemon_squeezy_variant_id,enabled,sort_order",
          )
          .is("deleted_at", null)
          .order("sort_order"),
      ]);
      if (settings.error) throw settings.error;
      if (packs.error) throw packs.error;
      return {
        creditsPerYuan: settings.data.credits_per_yuan,
        packs: packs.data ?? [],
      };
    },
    async updateCreditRatio(actor: Actor, creditsPerYuan: number) {
      const { error } = await client()
        .from("billing_settings")
        .update({
          credits_per_yuan: creditsPerYuan,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");
      if (error) throw error;
      await audit(
        actor,
        "credit.ratio.updated",
        "billing_settings",
        "default",
        { creditsPerYuan },
      );
    },
    async createCreditPack(actor: Actor, input: any) {
      const { data: setting, error: settingError } = await client()
        .from("billing_settings")
        .select("credits_per_yuan")
        .eq("id", "default")
        .single();
      if (settingError) throw settingError;
      const baseCredits = Math.floor(
        (input.amountFen * setting.credits_per_yuan) / 100,
      );
      const { error } = await client()
        .from("credit_packs")
        .insert({
          id: input.id,
          name: input.name,
          price_fen: input.amountFen,
          amount_fen: input.amountFen,
          base_credits: baseCredits,
          bonus_credits: input.bonusCredits,
          credits: baseCredits + input.bonusCredits,
          lemon_squeezy_variant_id: input.lemonSqueezyVariantId,
          enabled: input.enabled,
        });
      if (error) throw error;
      await audit(actor, "credit.pack.created", "credit_pack", input.id, {
        ...input,
        baseCredits,
        totalCredits: baseCredits + input.bonusCredits,
      });
    },
    async updateCreditPack(actor: Actor, id: string, input: any) {
      const { data: setting, error: settingError } = await client()
        .from("billing_settings")
        .select("credits_per_yuan")
        .eq("id", "default")
        .single();
      if (settingError) throw settingError;
      const baseCredits = Math.floor(
        (input.amountFen * setting.credits_per_yuan) / 100,
      );
      const { error } = await client()
        .from("credit_packs")
        .update({
          name: input.name,
          price_fen: input.amountFen,
          amount_fen: input.amountFen,
          base_credits: baseCredits,
          bonus_credits: input.bonusCredits,
          credits: baseCredits + input.bonusCredits,
          lemon_squeezy_variant_id: input.lemonSqueezyVariantId,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      await audit(actor, "credit.pack.updated", "credit_pack", id, {
        ...input,
        baseCredits,
        totalCredits: baseCredits + input.bonusCredits,
      });
    },
    async deleteCreditPack(actor: Actor, id: string) {
      const { error } = await client()
        .from("credit_packs")
        .update({ enabled: false, deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await audit(actor, "credit.pack.deleted", "credit_pack", id, {});
    },
    async listUsers(offset = 0, limit = 50) {
      const { data, error } = await client()
        .from("profiles")
        .select("id,email,display_name,created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit);
      if (error) throw error;
      const rows = data ?? [];
      return { items: rows.slice(0, limit), hasMore: rows.length > limit };
    },
    async adjustUser(actor: Actor, id: string, input: any) {
      const { error } = await client().rpc("adjust_wallet_balance", {
        p_user_id: id,
        p_payment_method: "credits",
        p_amount: input.amount,
        p_reason: input.reason,
        p_actor_user_id: actor.id,
        p_actor_email: actor.email,
      });
      if (error) throw error;
    },
    async listOrders(offset = 0, limit = 50) {
      const { data, error } = await client()
        .from("payment_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit);
      if (error) throw error;
      const rows = data ?? [];
      return { items: rows.slice(0, limit), hasMore: rows.length > limit };
    },
    async listLedger(offset = 0, limit = 50) {
      const { data, error } = await client()
        .from("wallet_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit);
      if (error) throw error;
      const rows = data ?? [];
      return { items: rows.slice(0, limit), hasMore: rows.length > limit };
    },
  };
}
