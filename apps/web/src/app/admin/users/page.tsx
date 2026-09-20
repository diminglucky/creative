"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError, adjustAdminUser, fetchAdminUsers } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-context";

const PAGE = 50;

function UserRow({ user }: { user: any }) {
  const { session } = useAuth();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  async function adjust() {
    await adjustAdminUser(session!.access_token, user.id, {
      amount: Math.round(Number(amount)),
      reason,
    });
    setAmount(0);
    setReason("");
  }
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3">
        <p className="font-medium">{user.display_name || user.email}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
        <Input
          aria-label={`${user.email} 调整积分`}
          type="number"
          step="1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <Input
          aria-label={`${user.email} 调整原因`}
          placeholder="请输入调整原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button disabled={!amount || reason.length < 2} onClick={adjust}>
          确认调整积分
        </Button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
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
        const data = await fetchAdminUsers(session.access_token, from, PAGE);
        setUsers((prev) =>
          from === 0 ? data.users : [...prev, ...data.users],
        );
        setHasMore(data.hasMore);
        setOffset(from + data.users.length);
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
      <h1 className="mb-6 text-xl font-semibold">用户余额</h1>
      {error && !(error instanceof AdminApiError) ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "加载用户失败"}
        </p>
      ) : null}
      {users.length ? (
        <div className="grid gap-3">
          {users.map((u: any) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          暂时没有用户。
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
