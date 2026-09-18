"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  createAdminCreditPack,
  deleteAdminCreditPack,
  fetchAdminCreditPackSettings,
  updateAdminCreditPack,
  updateAdminCreditRatio,
} from "@/lib/admin-api";

const empty = {
  id: "",
  name: "",
  amountYuan: 0,
  bonusCredits: 0,
  lemonSqueezyVariantId: "",
  enabled: true,
};
export default function CreditPacksPage() {
  const { session } = useAuth();
  const [ratio, setRatio] = useState(10);
  const [packs, setPacks] = useState<any[]>([]);
  const [form, setForm] = useState(empty);
  const load = useCallback(async () => {
    if (!session) return;
    const data = await fetchAdminCreditPackSettings(session.access_token);
    setRatio(data.creditsPerYuan);
    setPacks(data.packs);
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  const base = Math.floor(form.amountYuan * ratio);
  async function create() {
    if (!session) return;
    await createAdminCreditPack(session.access_token, {
      id: form.id || `credits-${Date.now()}`,
      name: form.name,
      amountFen: Math.round(form.amountYuan * 100),
      bonusCredits: form.bonusCredits,
      lemonSqueezyVariantId: form.lemonSqueezyVariantId,
      enabled: form.enabled,
    });
    setForm(empty);
    await load();
  }
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">积分充值设置</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        档位保存后会固化基础积分和赠送积分，历史订单不会受后续修改影响。
      </p>
      <section className="mb-6 border-b pb-6">
        <h2 className="mb-3 font-medium">全局兑换比例</h2>
        <div className="flex max-w-md gap-2">
          <Input
            aria-label="1 元兑换积分"
            type="number"
            min="1"
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
          <Button
            onClick={async () => {
              if (session) {
                await updateAdminCreditRatio(session.access_token, ratio);
              }
            }}
          >
            保存兑换比例
          </Button>
        </div>
      </section>
      <section className="mb-8">
        <h2 className="mb-3 font-medium">新增充值档位</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            档位名称
            <Input
              aria-label="档位名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            档位标识
            <Input
              aria-label="档位标识"
              placeholder="例如 recharge-100"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </label>
          <label className="text-sm">
            充值金额（元）
            <Input
              aria-label="充值金额（元）"
              type="number"
              min="1"
              value={form.amountYuan}
              onChange={(e) =>
                setForm({ ...form, amountYuan: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            赠送积分
            <Input
              aria-label="赠送积分"
              type="number"
              min="0"
              value={form.bonusCredits}
              onChange={(e) =>
                setForm({ ...form, bonusCredits: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Lemon Squeezy Variant ID
            <Input
              aria-label="Lemon Squeezy Variant ID"
              value={form.lemonSqueezyVariantId}
              onChange={(e) =>
                setForm({ ...form, lemonSqueezyVariantId: e.target.value })
              }
            />
          </label>
        </div>
        <p className="my-3 text-sm">
          基础积分 {base.toLocaleString()}，赠送{" "}
          {form.bonusCredits.toLocaleString()}，实际到账{" "}
          {(base + form.bonusCredits).toLocaleString()} 积分
        </p>
        <Button
          disabled={
            !form.name || form.amountYuan <= 0 || !form.lemonSqueezyVariantId
          }
          onClick={create}
        >
          新增充值档位
        </Button>
      </section>
      <section>
        <h2 className="mb-3 font-medium">现有充值档位</h2>
        {packs.length ? (
          <div className="grid gap-3">
            {packs.map((p) => (
              <Pack
                key={p.id}
                pack={p}
                token={session!.access_token}
                reload={load}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未创建充值档位。</p>
        )}
      </section>
    </div>
  );
}
function Pack({
  pack,
  token,
  reload,
}: { pack: any; token: string; reload: () => Promise<void> }) {
  const [name, setName] = useState(pack.name);
  const [amount, setAmount] = useState(pack.amount_fen / 100);
  const [bonus, setBonus] = useState(pack.bonus_credits);
  const [variant, setVariant] = useState(pack.lemon_squeezy_variant_id ?? "");
  const [enabled, setEnabled] = useState(pack.enabled);
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label={`${pack.id} 名称`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label={`${pack.id} 金额`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <Input
          aria-label={`${pack.id} 赠送积分`}
          type="number"
          value={bonus}
          onChange={(e) => setBonus(Number(e.target.value))}
        />
        <Input
          aria-label={`${pack.id} Variant ID`}
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        当前到账 {pack.credits.toLocaleString()} 积分，其中赠送{" "}
        {pack.bonus_credits.toLocaleString()}
      </p>
      <div className="mt-3 flex gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用
        </label>
        <Button
          onClick={async () => {
            await updateAdminCreditPack(token, pack.id, {
              name,
              amountFen: Math.round(amount * 100),
              bonusCredits: bonus,
              lemonSqueezyVariantId: variant,
              enabled,
            });
            await reload();
          }}
        >
          保存
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await deleteAdminCreditPack(token, pack.id);
            await reload();
          }}
        >
          删除
        </Button>
      </div>
    </div>
  );
}
