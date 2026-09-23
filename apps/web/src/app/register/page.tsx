"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoadingScreen } from "../../components/loading-screen";
import { RegisterForm } from "../../components/register-form";
import { useAuth } from "../../lib/auth-context";

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="创建工作区账号"
      description="支持邮箱或手机号注册，随后可在任意设备回到同一个画布。"
      features={[
        "使用邮箱或手机号创建账号",
        "注册后自动进入工作区",
        "与登录用户使用同一套工作区体验",
      ]}
    >
      <RegisterForm />
    </AuthShell>
  );
}
