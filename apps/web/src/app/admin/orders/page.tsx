"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AdminApiError, fetchAdminOrders } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";

const PAGE = 50;

const KIND_LABELS: Record<string, string> = {
  recharge: "充值",
  subscription: "订阅",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  refunded: "已退款",
  failed: "失败",
};

export default function OrdersPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
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
        const data = await fetchAdminOrders(
          session.access_token,
          from,
          PAGE,
        );
        setOrders((prev) =>
          from === 0 ? data.orders : [...prev, ...data.orders],
        );
        setHasMore(data.hasMore);
        setOffset(from + data.orders.length);
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
      <h1 className="mb-6 text-xl font-semibold">充值订单</h1>
      {error && !(error instanceof AdminApiError) ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载订单失败"}
        </p>
      ) : null}
      {orders.length ? (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">供应商</th>
                <th className="px-3 py-2 text-right font-medium">金额</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">交易号</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </td>
                  <td className="px-3 py-2">{KIND_LABELS[o.kind] ?? o.kind}</td>
                  <td className="px-3 py-2">{o.provider}</td>
                  <td className="px-3 py-2 text-right">
                    ¥{(o.amount_fen / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    {STATUS_LABELS[o.status] ?? o.status}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                    {o.provider_trade_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          暂时没有充值订单。
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
