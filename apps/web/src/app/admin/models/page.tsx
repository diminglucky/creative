"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  createAdminModel,
  fetchAdminModels,
  fetchAdminProviders,
  updateAdminModel,
} from "@/lib/admin-api";

import { AdminView, Empty } from "../admin-view";

const PLAN_OPTIONS: Array<[string, string]> = [
  ["free", "免费"],
  ["starter", "Starter"],
  ["pro", "Pro"],
  ["ultra", "Ultra"],
  ["business", "Business"],
];

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function PlanSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {PLAN_OPTIONS.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ModelEditor({ model }: { model: any }) {
  const { session } = useAuth();
  const [credits, setCredits] = useState(model.credit_price);
  const [cost, setCost] = useState(model.cost_price_fen / 100);
  const [minimumPlan, setMinimumPlan] = useState(model.minimum_plan);
  const [enabled, setEnabled] = useState(model.enabled);

  async function save() {
    await updateAdminModel(session!.access_token, model.model_id, {
      creditPrice: Number(credits),
      costPriceFen: Math.round(Number(cost) * 100),
      minimumPlan,
      generationType: model.generation_type,
      enabled,
    });
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="font-medium">{model.display_name}</h2>
          <p className="text-xs text-muted-foreground">
            {model.model_id} · {model.generation_type}
            {model.provider_id ? ` · ${model.provider_id}` : ""}
          </p>
        </div>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          启用
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          每次生成积分
          <Input
            type="number"
            min="1"
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          服务商成本（元）
          <Input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          最低套餐
          <PlanSelect value={minimumPlan} onChange={setMinimumPlan} />
        </label>
      </div>
      <Button className="mt-4" onClick={save}>
        保存 {model.display_name}
      </Button>
    </div>
  );
}

const emptyForm = {
  providerId: "",
  modelId: "",
  displayName: "",
  generationType: "image",
  creditPrice: 1,
  costPrice: 0,
  minimumPlan: "free",
  enabled: true,
};

function ModelCreatorDialog({
  open,
  onOpenChange,
  providers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: any[];
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    setError("");
    try {
      await createAdminModel(session!.access_token, {
        providerId: form.providerId,
        modelId: form.modelId,
        displayName: form.displayName,
        generationType: form.generationType,
        creditPrice: Number(form.creditPrice),
        costPriceFen: Math.round(Number(form.costPrice) * 100),
        minimumPlan: form.minimumPlan,
        enabled: form.enabled,
      });
      setForm(emptyForm);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增模型失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增模型</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            供应商
            <select
              className={selectClass}
              value={form.providerId}
              onChange={(e) =>
                setForm({ ...form, providerId: e.target.value })
              }
            >
              <option value="">选择供应商</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            模型 ID
            <Input
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder="例如 black-forest-labs/flux-kontext-pro"
            />
          </label>
          <label className="text-sm">
            显示名称
            <Input
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            类型
            <select
              className={selectClass}
              value={form.generationType}
              onChange={(e) =>
                setForm({ ...form, generationType: e.target.value })
              }
            >
              <option value="image">图片</option>
              <option value="video">视频</option>
            </select>
          </label>
          <label className="text-sm">
            每次生成积分
            <Input
              type="number"
              min="1"
              value={form.creditPrice}
              onChange={(e) =>
                setForm({ ...form, creditPrice: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            服务商成本（元）
            <Input
              type="number"
              step="0.01"
              value={form.costPrice}
              onChange={(e) =>
                setForm({ ...form, costPrice: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            最低套餐
            <PlanSelect
              value={form.minimumPlan}
              onChange={(v) => setForm({ ...form, minimumPlan: v })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          创建后立即启用
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={
              saving || !form.providerId || !form.modelId || !form.displayName
            }
            onClick={create}
          >
            {saving ? "正在创建..." : "创建模型"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ModelsPage() {
  const load = useCallback(async (token: string) => {
    const [modelsRes, providersRes] = await Promise.all([
      fetchAdminModels(token),
      fetchAdminProviders(token),
    ]);
    return { models: modelsRes.models, providers: providersRes.providers };
  }, []);
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video">(
    "all",
  );
  const [providerFilter, setProviderFilter] = useState("all");
  const [query, setQuery] = useState("");

  return (
    <AdminView
      title="模型定价"
      load={load}
      action={
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          新增模型
        </Button>
      }
    >
      {(d: any, reload) => {
        const providerIds = Array.from(
          new Set(
            d.models
              .map((model: any) => model.provider_id)
              .filter((value: unknown): value is string => Boolean(value)),
          ),
        ) as string[];
        const providerName = (id: string) =>
          d.providers.find((provider: any) => provider.id === id)?.name ?? id;
        const normalizedQuery = query.trim().toLowerCase();
        const filtered = d.models.filter((model: any) => {
          if (typeFilter !== "all" && model.generation_type !== typeFilter) {
            return false;
          }
          if (
            providerFilter !== "all" &&
            model.provider_id !== providerFilter
          ) {
            return false;
          }
          if (!normalizedQuery) return true;
          return `${model.display_name} ${model.model_id}`
            .toLowerCase()
            .includes(normalizedQuery);
        });
        return (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border bg-background p-0.5">
                {(
                  [
                    ["all", "全部"],
                    ["image", "图片"],
                    ["video", "视频"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded px-3 py-1.5 text-sm ${
                      typeFilter === value
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setTypeFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                className={`${selectClass} max-w-48`}
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                aria-label="按供应商筛选"
              >
                <option value="all">全部供应商</option>
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providerName(id)}
                  </option>
                ))}
              </select>
              <Input
                className="max-w-64"
                placeholder="搜索模型名称或 ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                共 {filtered.length} 个模型
              </span>
            </div>
            <div className="grid gap-4">
              {filtered.length ? (
                filtered.map((model: any) => (
                  <ModelEditor
                    key={`${model.model_id}:${model.generation_type}`}
                    model={model}
                  />
                ))
              ) : (
                <Empty label="模型" />
              )}
            </div>
            <ModelCreatorDialog
              open={showCreate}
              onOpenChange={setShowCreate}
              providers={d.providers}
              onCreated={reload}
            />
          </>
        );
      }}
    </AdminView>
  );
}
