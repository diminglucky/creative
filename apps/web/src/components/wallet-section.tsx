"use client";

import { useEffect, useState } from "react";
import type { WalletInfo } from "@/lib/wallet-api";
import {
  createCreditCheckout,
  getCreditPricePreview,
  type CreditPricePreview,
} from "@/lib/payments-api";

export function WalletSection({ wallet, accessToken }: { wallet: WalletInfo; accessToken?: string }) {
  const [preview, setPreview] = useState<CreditPricePreview | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    const load = () => {
      void getCreditPricePreview(accessToken)
        .then(setPreview)
        .catch(() => setPreview(null));
    };
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [accessToken]);
  async function buy(packId: string) {
    if (!accessToken) return;
    const { checkoutUrl } = await createCreditCheckout(accessToken, packId);
    window.location.assign(checkoutUrl);
  }
  const packs = preview?.packs ?? [];
  const referenceModels = (preview?.imageModels ?? [])
    .slice()
    .sort((a, b) => a.creditCost - b.creditCost)
    .slice(0, 3);
  const cnyPerImage = (priceFen: number, credits: number, creditCost: number) =>
    credits > 0 ? ((priceFen / 100) * creditCost) / credits : 0;
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
      {preview ? (
        <div>
          <h3 className="mb-3 text-sm font-medium">生成价格参考</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">充值档位</th>
                  <th className="p-3">到账积分</th>
                  {referenceModels.map((model) => (
                    <th key={model.id} className="p-3">
                      {model.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packs.map((pack) => (
                  <tr key={pack.id} className="border-t">
                    <td className="p-3">
                      <p className="font-medium">{pack.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ¥{(pack.priceFen / 100).toFixed(2)}
                      </p>
                    </td>
                    <td className="p-3">{pack.credits.toLocaleString()}</td>
                    {referenceModels.map((model) => (
                      <td key={model.id} className="p-3">
                        <p>{model.creditCost.toLocaleString()} 积分/张</p>
                        <p className="text-xs text-muted-foreground">
                          约 ¥{cnyPerImage(pack.priceFen, pack.credits, model.creditCost).toFixed(2)}/张
                        </p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            以当前模型积分价格和充值档位实时计算，实际占用积分以生成时为准。
          </p>
        </div>
      ) : null}
      {packs.length ? <div><h3 className="mb-3 text-sm font-medium">购买永久积分</h3><div className="grid gap-3">{packs.map((pack) => <div key={pack.id} className="flex items-center justify-between rounded-md border p-4"><div><p className="font-medium">{pack.name}</p><p className="text-sm text-muted-foreground">¥{(pack.priceFen / 100).toFixed(2)} · 永久有效</p></div><button type="button" className="rounded-md bg-foreground px-3 py-2 text-sm text-background" onClick={() => void buy(pack.id)}>购买</button></div>)}</div></div> : null}
    </section>
  );
}
