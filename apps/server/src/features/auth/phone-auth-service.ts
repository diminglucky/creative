import { createHmac, randomInt } from "node:crypto";

import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { NotificationService } from "../notifications/notification-service.js";

export class PhoneAuthError extends Error {
  constructor(
    readonly code:
      | "invalid_phone"
      | "rate_limited"
      | "sms_send_failed"
      | "code_invalid"
      | "code_expired"
      | "code_consumed"
      | "user_create_failed",
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "PhoneAuthError";
  }
}

export type PhoneAuthService = {
  sendCode(phone: string, requestIp?: string): Promise<void>;
  register(input: {
    phone: string;
    code: string;
    password: string;
    displayName?: string;
  }): Promise<{ userId: string; phone: string }>;
};

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const CODE_TTL_MS = 5 * 60 * 1000;
const MIN_RESEND_MS = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export function createPhoneAuthService(options: {
  getAdminClient: () => AdminSupabaseClient;
  notificationService: NotificationService;
  otpSecret: string;
}): PhoneAuthService {
  const client = () => options.getAdminClient() as any;

  const hashCode = (phone: string, code: string) =>
    createHmac("sha256", options.otpSecret)
      .update(`${phone}:${code}`)
      .digest("hex");

  return {
    async sendCode(phone, requestIp) {
      if (!PHONE_RE.test(phone)) {
        throw new PhoneAuthError(
          "invalid_phone",
          "手机号必须使用国际格式，例如 +8613800138000。",
          400,
        );
      }
      const since = new Date(Date.now() - MIN_RESEND_MS).toISOString();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const [recent, hourly] = await Promise.all([
        client()
          .from("phone_verification_codes")
          .select("id")
          .eq("phone", phone)
          .gte("created_at", since)
          .limit(1),
        client()
          .from("phone_verification_codes")
          .select("id", { count: "exact", head: true })
          .eq("phone", phone)
          .gte("created_at", hourAgo),
      ]);
      if ((recent.data ?? []).length > 0) {
        throw new PhoneAuthError(
          "rate_limited",
          "验证码发送过于频繁，请 60 秒后再试。",
          429,
        );
      }
      if ((hourly.count ?? 0) >= MAX_PER_HOUR) {
        throw new PhoneAuthError(
          "rate_limited",
          "该手机号发送次数过多，请稍后再试。",
          429,
        );
      }

      const code = String(randomInt(100000, 1000000));
      const { error } = await client().from("phone_verification_codes").insert({
        phone,
        code_hash: hashCode(phone, code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        request_ip: requestIp ?? null,
      });
      if (error) throw error;

      try {
        await options.notificationService.sendSmsCode(phone, code);
      } catch (error) {
        throw new PhoneAuthError(
          "sms_send_failed",
          error instanceof Error ? error.message : "验证码发送失败。",
          502,
        );
      }
    },

    async register(input) {
      if (!PHONE_RE.test(input.phone)) {
        throw new PhoneAuthError(
          "invalid_phone",
          "手机号必须使用国际格式，例如 +8613800138000。",
          400,
        );
      }
      const { data: row, error } = await client()
        .from("phone_verification_codes")
        .select("*")
        .eq("phone", input.phone)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        throw new PhoneAuthError("code_invalid", "验证码无效。", 400);
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new PhoneAuthError("code_expired", "验证码已过期。", 400);
      }
      if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
        throw new PhoneAuthError("code_invalid", "验证码尝试次数过多。", 429);
      }
      if (row.code_hash !== hashCode(input.phone, input.code)) {
        await client()
          .from("phone_verification_codes")
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq("id", row.id);
        throw new PhoneAuthError("code_invalid", "验证码错误。", 400);
      }

      const { data: created, error: createError } = await client().auth.admin.createUser({
        phone: input.phone,
        password: input.password,
        phone_confirm: true,
        user_metadata: {
          ...(input.displayName ? { display_name: input.displayName } : {}),
        },
      });
      if (createError || !created.user) {
        throw new PhoneAuthError(
          "user_create_failed",
          createError?.message ?? "创建手机号用户失败。",
          400,
        );
      }

      await Promise.all([
        client()
          .from("phone_verification_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id),
        client()
          .from("profiles")
          .update({ phone: input.phone })
          .eq("id", created.user.id),
      ]);

      return { userId: created.user.id, phone: input.phone };
    },
  };
}
