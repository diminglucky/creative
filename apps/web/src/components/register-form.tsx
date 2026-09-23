"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { fetchViewer } from "../lib/server-api";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import { registerPhone, sendPhoneCode } from "../lib/phone-auth-api";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
} as any;

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
} as any;

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [countdown, setCountdown] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bootstrapWorkspace(accessToken: string) {
    try {
      await fetchViewer(accessToken);
      router.replace("/home");
    } catch {
      setError("无法完成工作区创建，请重试。");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (mode === "phone") {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone || !otp || !password) return;
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await registerPhone({
          phone: normalizedPhone,
          code: otp,
          password,
        });
        const supabase = getSupabaseBrowserClient();
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          phone: normalizedPhone,
          password,
        });
        if (authError || !data.session?.access_token) {
          setError(authError?.message ?? "手机号注册成功，但自动登录失败，请手动登录。");
          return;
        }
        await bootstrapWorkspace(data.session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "手机号注册失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmed || !password) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    const accessToken = data.session?.access_token;
    if (accessToken) {
      await bootstrapWorkspace(accessToken);
      setLoading(false);
      return;
    }

    setLoading(false);
    setSent(true);
  }

  function normalizePhone(value: string) {
    const trimmed = value.trim().replace(/\s+/g, "");
    if (/^1\d{10}$/.test(trimmed)) return `+86${trimmed}`;
    return trimmed;
  }

  async function handleSendCode() {
      const trimmed = normalizePhone(phone);
    if (!trimmed) return;
    setError(null);
    try {
      await sendPhoneCode(trimmed);
      setCountdown(60);
      const timer = window.setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码发送失败");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-col items-center gap-4 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-background" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
            <h2 className="text-lg font-semibold">请查收邮件</h2>
            <p className="text-sm text-muted-foreground">
              我们已发送确认链接到 <strong>{email}</strong>
            </p>
            <Link href="/login" className="text-sm text-foreground underline underline-offset-4">
              返回登录
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
            className="space-y-6"
          >
            <motion.div variants={fadeIn} className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">创建账号</h2>
              <p className="text-sm text-muted-foreground">
                使用邮箱或手机号注册
              </p>
            </motion.div>

            <motion.form variants={fadeIn} onSubmit={handleSubmit} className="space-y-4">
              <div className="flex rounded-lg bg-muted p-1">
                {(["email", "phone"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setError(null);
                    }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                      mode === item
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item === "email" ? "邮箱注册" : "手机号注册"}
                  </button>
                ))}
              </div>
              {mode === "email" ? (
                <div className="space-y-2">
                  <Label htmlFor="register-email">邮箱</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="register-phone">手机号</Label>
                    <Input
                      id="register-phone"
                      placeholder="+8613800138000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="register-phone-code">验证码</Label>
                      <Input
                        id="register-phone-code"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={countdown > 0 || !phone.trim()}
                      onClick={handleSendCode}
                    >
                      {countdown > 0 ? `${countdown}s` : "发送验证码"}
                    </Button>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="register-password">密码</Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-confirm-password">确认密码</Label>
                <Input
                  id="register-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "正在创建账号..." : "创建账号"}
              </Button>
            </motion.form>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden text-center text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div variants={fadeIn} className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs uppercase text-muted-foreground">或</span>
              <Separator className="flex-1" />
            </motion.div>

            <motion.p variants={fadeIn} className="text-center text-sm text-muted-foreground">
              已有账号？{" "}
              <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
                登录
              </Link>
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
