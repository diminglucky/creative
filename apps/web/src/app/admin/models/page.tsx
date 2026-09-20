"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
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

function ModelCreator({ providers }: { providers: any[] }) {
  const { session } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(false);

  async function create() {
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <h2 className="mb-3 font-medium">手动新增模型</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          供应商
          <select
            className={selectClass}
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
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
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
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
          新增·每次生成积分
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
          新增·服务商成本（元）
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
          新增·最低套餐
          <PlanSelect
            value={form.minimumPlan}
            onChange={(v) => setForm({ ...form, minimumPlan: v })}
          />
        </label>
      </div>
      <Button
        className="mt-4"
        disabled={!form.providerId || !form.modelId || !form.displayName}
        onClick={create}
      >
        {saved ? "已添加" : "新增模型"}
      </Button>
    </div>
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

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">模型定价</h1>
      <AdminView title="" load={load}>
        {(d: any) => (
          <>
            <ModelCreator providers={d.providers} />
            <div className="mt-4 grid gap-4">
              {d.models.length ? (
                d.models.map((m: any) => (
                  <ModelEditor
                    key={`${m.model_id}:${m.generation_type}`}
                    model={m}
                  />
                ))
              ) : (
                <Empty label="模型" />
              )}
            </div>
          </>
        )}
      </AdminView>
    </>
  );
}
