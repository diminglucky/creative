"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  createAdminModel,
  createAdminProvider,
  discoverAdminProviderModels,
  fetchAdminProviders,
  updateAdminProvider,
} from "@/lib/admin-api";
import { AdminView, Empty } from "../admin-view";

function DiscoveredModel({
  providerId,
  model,
  token,
}: {
  providerId: string;
  model: { id: string; ownedBy?: string };
  token: string;
}) {
  const [credits, setCredits] = useState(0);
  const [cost, setCost] = useState(0);
  const [added, setAdded] = useState(false);

  async function add() {
    await createAdminModel(token, {
      providerId,
      modelId: model.id,
      displayName: model.id,
      creditPrice: credits,
      costPriceFen: Math.round(cost * 100),
      minimumPlan: "free",
      enabled: true,
    });
    setAdded(true);
  }

  return (
    <div className="grid gap-3 border-t py-3 sm:grid-cols-[minmax(180px,1fr)_120px_140px_auto]">
      <div>
        <p className="break-all text-sm font-medium">{model.id}</p>
        {model.ownedBy ? (
          <p className="text-xs text-muted-foreground">{model.ownedBy}</p>
        ) : null}
      </div>
      <label className="text-xs">
        每次生成积分
        <Input
          aria-label={`${model.id} 积分价格`}
          type="number"
          min="1"
          value={credits}
          onChange={(e) => setCredits(Number(e.target.value))}
        />
      </label>
      <label className="text-xs">
        服务商成本（元）
        <Input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
        />
      </label>
      <Button className="self-end" disabled={added || credits <= 0} onClick={add}>
        {added ? "已添加" : `添加 ${model.id}`}
      </Button>
    </div>
  );
}

function ProviderCard({ provider, reload }: { provider: any; reload: () => void }) {
  const { session } = useAuth();
  const [url, setUrl] = useState(provider.baseUrl);
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; ownedBy?: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  function validUrl() {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  async function save() {
    if (!validUrl()) {
      setError("请输入有效的 HTTP 或 HTTPS 地址。");
      return;
    }
    setError("");
    try {
      await updateAdminProvider(session!.access_token, provider.id, {
        baseUrl: url,
        enabled,
        ...(secret ? { secret } : {}),
      });
      setSecret("");
      setSaved(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存供应商配置失败");
    }
  }

  async function discover() {
    if (!validUrl()) {
      setError("请输入有效的 HTTP 或 HTTPS 地址。");
      return;
    }
    setError("");
    setLoadingModels(true);
    try {
      const result = await discoverAdminProviderModels(
        session!.access_token,
        provider.id,
        { baseUrl: url, ...(secret ? { secret } : {}) },
      );
      setModels(result.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取模型失败");
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">{provider.name}</h2>
          <p className="text-xs text-muted-foreground">{provider.id}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用
        </label>
      </div>
      <label className="mb-3 block text-sm">
        {provider.name} API 基础地址
        <Input
          className="mt-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={Boolean(error)}
        />
      </label>
      <label className="mb-4 block text-sm">
        更新 API 密钥
        <Input
          className="mt-1"
          type="password"
          value={secret}
          placeholder={provider.secretMask || "留空将保留当前密钥"}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="mb-3 text-sm">供应商配置已保存。</p> : null}
      <div className="flex gap-2">
        <Button onClick={save}>保存 {provider.name}</Button>
        <Button variant="outline" onClick={discover} disabled={loadingModels}>
          {loadingModels ? "正在获取..." : `获取 ${provider.name} 模型`}
        </Button>
      </div>
      {models.length ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">可添加的生图模型</p>
          {models.map((model) => (
            <DiscoveredModel
              key={model.id}
              providerId={provider.id}
              model={model}
              token={session!.access_token}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AddProviderForm({ reload }: { reload: () => void }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await createAdminProvider(session!.access_token, {
        id,
        name,
        baseUrl,
        secret,
        enabled,
      });
      setId("");
      setName("");
      setBaseUrl("");
      setSecret("");
      setEnabled(true);
      setOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增供应商失败");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button className="mb-4" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        新增供应商
      </Button>
    );
  }

  return (
    <div className="mb-4 rounded-md border bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium">新增供应商</h2>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          供应商名称
          <Input
            aria-label="供应商名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          供应商标识
          <Input
            aria-label="供应商标识"
            placeholder="例如 openrouter"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          API 基础地址
          <Input
            aria-label="API 基础地址"
            placeholder="https://example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          API 密钥
          <Input
            aria-label="API 密钥"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        创建后立即启用
      </label>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <Button
        className="mt-4"
        disabled={saving || !id || !name || !baseUrl || !secret}
        onClick={submit}
      >
        {saving ? "正在创建..." : "创建供应商"}
      </Button>
    </div>
  );
}

export default function ProvidersPage() {
  const load = useCallback(fetchAdminProviders, []);
  return (
    <AdminView title="供应商配置" load={load}>
      {(data: any, reload) => (
        <div>
          <AddProviderForm reload={reload} />
          {data.providers.length ? (
            <div className="grid gap-4">
              {data.providers.map((provider: any) => (
                <ProviderCard key={provider.id} provider={provider} reload={reload} />
              ))}
            </div>
          ) : (
            <Empty label="供应商配置" />
          )}
        </div>
      )}
    </AdminView>
  );
}
