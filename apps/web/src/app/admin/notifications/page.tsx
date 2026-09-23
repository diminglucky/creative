"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAdminNotificationSettings,
  updateAdminNotificationSettings,
} from "@/lib/admin-api";

import { AdminView } from "../admin-view";

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function NotificationSettingsForm({
  settings,
  onSaved,
}: {
  settings: any;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState({
    smtpEnabled: settings.smtpEnabled,
    smtpHost: settings.smtpHost ?? "",
    smtpPort: settings.smtpPort ?? 587,
    smtpSecure: settings.smtpSecure ?? true,
    smtpUsername: settings.smtpUsername ?? "",
    smtpPassword: "",
    smtpFromEmail: settings.smtpFromEmail ?? "",
    smtpFromName: settings.smtpFromName ?? "",
    smsEnabled: settings.smsEnabled,
    smsProvider: settings.smsProvider ?? "aliyun",
    smsAccessKeyId: "",
    smsAccessKeySecret: "",
    smsSignName: settings.smsSignName ?? "",
    smsTemplateCode: settings.smsTemplateCode ?? "",
    smsRegion: settings.smsRegion ?? "",
    smsAppId: settings.smsAppId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateAdminNotificationSettings(session!.access_token, form);
      setForm((current) => ({
        ...current,
        smtpPassword: "",
        smsAccessKeyId: "",
        smsAccessKeySecret: "",
      }));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存通知配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border bg-background p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-medium">邮件 SMTP</h2>
            <p className="text-xs text-muted-foreground">
              用于注册确认、登录链接和系统通知邮件。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.smtpEnabled}
              onChange={(e) =>
                setForm({ ...form, smtpEnabled: e.target.checked })
              }
            />
            启用
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            SMTP 主机
            <Input
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              placeholder="smtp.example.com"
            />
          </label>
          <label className="text-sm">
            SMTP 端口
            <Input
              type="number"
              value={form.smtpPort}
              onChange={(e) =>
                setForm({ ...form, smtpPort: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            SMTP 用户名
            <Input
              value={form.smtpUsername}
              onChange={(e) =>
                setForm({ ...form, smtpUsername: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            SMTP 密码
            <Input
              type="password"
              value={form.smtpPassword}
              placeholder={settings.smtpPasswordMask || "留空将保留当前密码"}
              onChange={(e) =>
                setForm({ ...form, smtpPassword: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            发件人邮箱
            <Input
              value={form.smtpFromEmail}
              onChange={(e) =>
                setForm({ ...form, smtpFromEmail: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            发件人名称
            <Input
              value={form.smtpFromName}
              onChange={(e) =>
                setForm({ ...form, smtpFromName: e.target.value })
              }
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.smtpSecure}
            onChange={(e) =>
              setForm({ ...form, smtpSecure: e.target.checked })
            }
          />
          使用 SSL / TLS
        </label>
      </section>

      <section className="rounded-md border bg-background p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-medium">手机号验证码</h2>
            <p className="text-xs text-muted-foreground">
              支持阿里云、腾讯云和 Twilio，密钥会加密保存。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.smsEnabled}
              onChange={(e) =>
                setForm({ ...form, smsEnabled: e.target.checked })
              }
            />
            启用
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            短信服务商
            <select
              className={selectClass}
              value={form.smsProvider}
              onChange={(e) =>
                setForm({ ...form, smsProvider: e.target.value })
              }
            >
              <option value="aliyun">阿里云短信</option>
              <option value="tencent">腾讯云短信</option>
              <option value="twilio">Twilio</option>
            </select>
          </label>
          <label className="text-sm">
            AccessKey ID
            <Input
              value={form.smsAccessKeyId}
              placeholder={settings.smsAccessKeyIdMask || "留空将保留当前值"}
              onChange={(e) =>
                setForm({ ...form, smsAccessKeyId: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            AccessKey Secret
            <Input
              type="password"
              value={form.smsAccessKeySecret}
              placeholder={settings.smsAccessKeySecretMask || "留空将保留当前值"}
              onChange={(e) =>
                setForm({ ...form, smsAccessKeySecret: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            短信签名
            <Input
              value={form.smsSignName}
              onChange={(e) =>
                setForm({ ...form, smsSignName: e.target.value })
              }
              placeholder="例如：创意社"
            />
          </label>
          <label className="text-sm">
            模板 Code / ID
            <Input
              value={form.smsTemplateCode}
              onChange={(e) =>
                setForm({ ...form, smsTemplateCode: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Region
            <Input
              value={form.smsRegion}
              onChange={(e) =>
                setForm({ ...form, smsRegion: e.target.value })
              }
              placeholder="例如：cn-hangzhou"
            />
          </label>
          <label className="text-sm">
            App ID
            <Input
              value={form.smsAppId}
              onChange={(e) => setForm({ ...form, smsAppId: e.target.value })}
              placeholder="腾讯云需要时填写"
            />
          </label>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm">通知与验证配置已保存。</p> : null}
      <div>
        <Button disabled={saving} onClick={save}>
          {saving ? "正在保存..." : "保存通知与验证配置"}
        </Button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const load = useCallback(fetchAdminNotificationSettings, []);
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState("");
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.access_token) return;
    void fetchAdminNotificationSettings(session.access_token)
      .then(setSettings)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "加载通知配置失败"),
      );
  }, [session?.access_token]);

  return (
    <AdminView title="通知与验证" load={load}>
      {() =>
        error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : settings ? (
          <NotificationSettingsForm
            settings={settings}
            onSaved={() => {
              if (session?.access_token) {
                void fetchAdminNotificationSettings(session.access_token).then(
                  setSettings,
                );
              }
            }}
          />
        ) : null
      }
    </AdminView>
  );
}
