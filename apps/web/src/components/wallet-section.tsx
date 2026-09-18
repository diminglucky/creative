"use client";

import { useEffect, useState } from "react";
import type { WalletInfo } from "@/lib/wallet-api";
import { createCreditCheckout, getCreditPacks, type CreditPack } from "@/lib/payments-api";

export function WalletSection({ wallet, accessToken }: { wallet: WalletInfo; accessToken?: string }) {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  useEffect(() => { if (accessToken) void getCreditPacks(accessToken).then(setPacks).catch(() => setPacks([])); }, [accessToken]);
  async function buy(packId: string) {
    if (!accessToken) return;
    const { checkoutUrl } = await createCreditCheckout(accessToken, packId);
    window.location.assign(checkoutUrl);
  }
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">积分账户</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          所有生成统一使用积分，扣费成功后才会提交生成任务。
        </p>
      </div>
      <div className="rounded-md border p-4">
        <p className="text-xs text-muted-foreground">可用积分</p>
        <p className="mt-1 text-xl font-semibold">
          {wallet.creditBalance.toLocaleString()}
        </p>
      </div>
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        订阅套餐积分按月发放；额外购买的积分永久有效。
      </div>
      {packs.length ? <div><h3 className="mb-3 text-sm font-medium">购买永久积分</h3><div className="grid gap-3">{packs.map((pack) => <div key={pack.id} className="flex items-center justify-between rounded-md border p-4"><div><p className="font-medium">{pack.name}</p><p className="text-sm text-muted-foreground">¥{(pack.priceFen / 100).toFixed(2)} · 永久有效</p></div><button type="button" className="rounded-md bg-foreground px-3 py-2 text-sm text-background" onClick={() => void buy(pack.id)}>购买</button></div>)}</div></div> : null}
    </section>
  );
}
