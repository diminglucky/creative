"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AdminApiError, fetchAdminLedger } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";

const PAGE = 50;

const KIND_LABELS: Record<string, string> = {
  generation_charge: "生成扣费",
  generation_refund: "生成退款",
  admin_adjustment: "管理员调整",
  subscription_grant: "订阅发放",
  daily_grant: "每日发放",
  purchase: "充值购买",
  bonus: "赠送",
};

const METHOD_LABELS: Record<string, string> = {
  credits: "积分",
  money: "现金",
};

export default function LedgerPage() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>();

  const load = useCallback(
    async (from: number) => {
      if (!session) return;
      setLoading(true);
      setError(undefined);
      try {
        const data = await fetchAdminLedger(
          session.access_token,
          from,
          PAGE,
        );
        setEntries((prev) =>
          from === 0 ? data.entries : [...prev, ...data.entries],
        );
        setHasMore(data.hasMore);
        setOffset(from + data.entries.length);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  if (error instanceof AdminApiError && error.status === 403) {
    return (
      <section>
        <h1 className="text-xl font-semibold">无访问权限</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          当前账号不是平台配置的超级管理员。
        </p>
      </section>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">资金账本</h1>
      {error && !(error instanceof AdminApiError) ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载账本失败"}
        </p>
      ) : null}
      {entries.length ? (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">方式</th>
                <th className="px-3 py-2 text-right font-medium">金额</th>
                <th className="px-3 py-2 text-right font-medium">余额后</th>
                <th className="px-3 py-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {KIND_LABELS[e.kind] ?? e.kind}
                  </td>
                  <td className="px-3 py-2">
                    {METHOD_LABELS[e.payment_method] ?? e.payment_method}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      e.amount > 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {e.balance_after?.toLocaleString() ?? "—"}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                    {e.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          暂时没有账本记录。
        </div>
      )}
      {hasMore ? (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load(offset)}
          >
            {loading ? "加载中..." : "加载更多"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
