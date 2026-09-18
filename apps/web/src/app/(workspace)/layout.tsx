"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { CreditHeaderButton } from "@/components/credits/credit-header-button";
import { LoadingScreen } from "@/components/loading-screen";
import { PageTransition } from "@/components/page-transition";
import { isAdminSession } from "@/lib/admin-api";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, session, loading } = useAuth();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); setCheckingAccess(false); return; }
    if (!session?.access_token) { setCheckingAccess(false); return; }
    void isAdminSession(session.access_token).then((isAdmin) => {
      if (isAdmin) router.replace("/admin");
      else setCheckingAccess(false);
    }).catch(() => setCheckingAccess(false));
  }, [loading, user, session, router]);

  if (loading || checkingAccess) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-[100dvh] flex-col md:flex-row">
      {/* Skip navigation link -- visible only on keyboard focus for a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:shadow-lg"
      >
        跳到主内容
      </a>
      <AppSidebar />
      {/* pb-14 on mobile for the fixed bottom navigation bar, reset on md+ */}
      <main id="main" className="relative flex-1 overflow-auto pb-14 md:pb-0">
        {/* Top-right header credits button */}
        <div className="absolute right-4 top-3 z-10">
          <CreditHeaderButton />
        </div>
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
