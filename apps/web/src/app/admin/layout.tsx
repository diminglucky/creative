"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BarChart3, Boxes, Coins, CreditCard, Database, KeyRound, Mail, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
const nav = [
  ["/admin","概览",BarChart3], ["/admin/providers","供应商",KeyRound],
  ["/admin/models","模型定价",Boxes], ["/admin/plans","订阅套餐",CreditCard],
  ["/admin/credit-packs","积分充值",Coins],
  ["/admin/notifications","通知与验证",Mail],
  ["/admin/users","用户余额",Users], ["/admin/orders","充值订单",Database], ["/admin/ledger","资金账本",Database],
] as const;
export default function AdminLayout({children}:{children:ReactNode}) {
  const { loading,user,signOut }=useAuth(); const router=useRouter(); const pathname=usePathname();
  useEffect(()=>{ if(!loading&&!user) router.replace("/login"); },[loading,user,router]);
  if(loading||!user) return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">正在验证管理员权限...</main>;
  return <div className="min-h-screen bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div><p className="text-sm font-semibold">Creative · 创意社</p><p className="text-xs text-muted-foreground">运营管理后台</p></div><button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={async()=>{await signOut();router.replace("/login");}}>退出登录</button></div></header><div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:grid-cols-[190px_1fr]"><nav className="flex gap-1 overflow-x-auto md:flex-col">{nav.map(([href,label,Icon])=><Link key={href} href={href} className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-sm ${pathname===href?"bg-foreground text-background":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon aria-hidden="true" />{label}</Link>)}</nav><main className="min-w-0">{children}</main></div></div>;
}
