"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/login-form";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_missing_code: "登录链接不完整，请重新获取。",
  auth_exchange_failed: "登录链接校验失败，请重新获取。",
  viewer_bootstrap_failed: "账号已验证，但无法打开工作区，请重试。",
  auth_callback_timeout: "登录超时，请重试。",
};

function LoginPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const initialErrorMessage = callbackError
    ? CALLBACK_ERROR_MESSAGES[callbackError] ??
      "无法完成登录，请重试。"
    : null;

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="欢迎回来"
      description="登录后继续你的工作空间。"
      features={[
        "支持密码、邮箱登录链接和手机号登录",
        "画布和工作区状态集中管理",
        "无需切换工具即可完成创作流程",
      ]}
    >
      <LoginForm initialErrorMessage={initialErrorMessage} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginPageContent />
    </Suspense>
  );
}
