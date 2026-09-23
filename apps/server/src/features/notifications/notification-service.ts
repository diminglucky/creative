import * as DysmsapiModule from "@alicloud/dysmsapi20170525";
import OpenApi from "@alicloud/openapi-client";
import nodemailer from "nodemailer";
import tencentcloud from "tencentcloud-sdk-nodejs-sms";

import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { ProviderSecretCrypto } from "../../security/provider-secret-crypto.js";

export class NotificationServiceError extends Error {
  constructor(
    readonly code:
      | "notification_not_configured"
      | "invalid_notification_settings"
      | "send_failed",
    message: string,
  ) {
    super(message);
    this.name = "NotificationServiceError";
  }
}

export type NotificationService = {
  sendSmsCode(phone: string, code: string): Promise<void>;
  sendTestEmail(to: string): Promise<void>;
  sendTestSms(phone: string): Promise<void>;
  assertSettingsValid(input: Record<string, unknown>): void;
};

type SettingsRow = {
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string | null;
  smtp_password_ciphertext: string | null;
  smtp_from_email: string | null;
  smtp_from_name: string | null;
  sms_enabled: boolean;
  sms_provider: "aliyun" | "tencent" | "twilio";
  sms_access_key_id_ciphertext: string | null;
  sms_access_key_secret_ciphertext: string | null;
  sms_sign_name: string | null;
  sms_template_code: string | null;
  sms_region: string | null;
  sms_app_id: string | null;
};

export function createNotificationService(options: {
  getAdminClient: () => AdminSupabaseClient;
  secretCrypto?: ProviderSecretCrypto;
}): NotificationService {
  const decrypt = (value: string | null): string => {
    if (!value) return "";
    return options.secretCrypto?.decrypt(value) ?? value;
  };

  const loadSettings = async (): Promise<SettingsRow> => {
    const { data, error } = await (options.getAdminClient() as any)
      .from("platform_notification_settings")
      .select("*")
      .eq("id", "default")
      .single();
    if (error || !data) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "Notification settings are not configured.",
      );
    }
    return data as SettingsRow;
  };

  const assertSmtpConfigured = (row: SettingsRow) => {
    if (
      !row.smtp_enabled ||
      !row.smtp_host ||
      !row.smtp_from_email ||
      !row.smtp_password_ciphertext
    ) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "SMTP is not fully configured.",
      );
    }
  };

  const assertSmsConfigured = (row: SettingsRow) => {
    if (
      !row.sms_enabled ||
      !row.sms_access_key_id_ciphertext ||
      !row.sms_access_key_secret_ciphertext
    ) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "SMS is not fully configured.",
      );
    }
    if (
      ["aliyun", "tencent"].includes(row.sms_provider) &&
      (!row.sms_sign_name || !row.sms_template_code)
    ) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "SMS sign name and template code are required.",
      );
    }
    if (row.sms_provider === "tencent" && !row.sms_app_id) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "Tencent SMS SdkAppId is required.",
      );
    }
    if (row.sms_provider === "twilio" && !row.sms_app_id) {
      throw new NotificationServiceError(
        "notification_not_configured",
        "Twilio sender number is required.",
      );
    }
  };

  const sendSms = async (phone: string, code: string) => {
    const row = await loadSettings();
    assertSmsConfigured(row);
    const accessKeyId = decrypt(row.sms_access_key_id_ciphertext);
    const accessKeySecret = decrypt(row.sms_access_key_secret_ciphertext);

    if (row.sms_provider === "aliyun") {
      const config = new OpenApi.Config({ accessKeyId, accessKeySecret });
      config.endpoint = "dysmsapi.aliyuncs.com";
      const Dysmsapi = (DysmsapiModule as any).default ?? DysmsapiModule;
      const client = new Dysmsapi(config);
      const request = new (Dysmsapi as any).SendSmsRequest({
        phoneNumbers: phone.replace(/^\+/, ""),
        signName: row.sms_sign_name,
        templateCode: row.sms_template_code,
        templateParam: JSON.stringify({ code }),
      });
      const response = await client.sendSms(request);
      if (response.body?.code && response.body.code !== "OK") {
        throw new Error(response.body.message || response.body.code);
      }
      return;
    }

    if (row.sms_provider === "tencent") {
      const SmsClient = (tencentcloud as any).sms.v20210111.Client;
      const client = new SmsClient({
        credential: { secretId: accessKeyId, secretKey: accessKeySecret },
        region: row.sms_region || "ap-guangzhou",
        profile: { httpProfile: { endpoint: "sms.tencentcloudapi.com" } },
      });
      const response = await client.SendSms({
        PhoneNumberSet: [phone],
        SmsSdkAppId: row.sms_app_id,
        SignName: row.sms_sign_name,
        TemplateId: row.sms_template_code,
        TemplateParamSet: [code],
      });
      const status = response.SendStatusSet?.[0];
      if (status && status.Code !== "Ok") {
        throw new Error(status.Message || status.Code);
      }
      return;
    }

    const accountSid = accessKeyId;
    const authToken = accessKeySecret;
    const body = new URLSearchParams({
      To: phone,
      From: row.sms_app_id || "",
      Body: `Your verification code is ${code}`,
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      throw new Error(`Twilio send failed: ${response.status}`);
    }
  };

  return {
    assertSettingsValid(input) {
      if (input.smtpEnabled) {
        if (!input.smtpHost || !input.smtpFromEmail) {
          throw new NotificationServiceError(
            "invalid_notification_settings",
            "启用 SMTP 时必须填写 SMTP 主机和发件人邮箱。",
          );
        }
      }
      if (input.smsEnabled) {
        if (!input.smsAccessKeyId && !input.hasSmsAccessKeyId) {
          throw new NotificationServiceError(
            "invalid_notification_settings",
            "启用短信时必须配置 AccessKey ID。",
          );
        }
        if (!input.smsAccessKeySecret && !input.hasSmsAccessKeySecret) {
          throw new NotificationServiceError(
            "invalid_notification_settings",
            "启用短信时必须配置 AccessKey Secret。",
          );
        }
        if (
          ["aliyun", "tencent"].includes(String(input.smsProvider)) &&
          (!input.smsSignName || !input.smsTemplateCode)
        ) {
          throw new NotificationServiceError(
            "invalid_notification_settings",
            "启用短信时必须填写短信签名和模板 Code / ID。",
          );
        }
        if (input.smsProvider === "tencent" && !input.smsAppId) {
          throw new NotificationServiceError(
            "invalid_notification_settings",
            "腾讯云短信必须填写 SdkAppId。",
          );
        }
      }
    },
    async sendSmsCode(phone, code) {
      try {
        await sendSms(phone, code);
      } catch (error) {
        if (error instanceof NotificationServiceError) throw error;
        throw new NotificationServiceError(
          "send_failed",
          error instanceof Error ? error.message : "SMS send failed.",
        );
      }
    },
    async sendTestEmail(to) {
      const row = await loadSettings();
      assertSmtpConfigured(row);
      const transport = nodemailer.createTransport({
        host: row.smtp_host!,
        port: row.smtp_port,
        secure: row.smtp_secure,
        auth: row.smtp_username
          ? {
              user: row.smtp_username,
              pass: decrypt(row.smtp_password_ciphertext),
            }
          : undefined,
      });
      await transport.sendMail({
        from: row.smtp_from_name
          ? `${row.smtp_from_name} <${row.smtp_from_email}>`
          : row.smtp_from_email!,
        to,
        subject: "Creative SMTP test",
        text: "SMTP configuration is working.",
      });
    },
    async sendTestSms(phone) {
      await sendSms(phone, "123456");
    },
  };
}
