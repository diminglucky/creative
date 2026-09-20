"use client";
import { useEffect,useState,type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AdminApiError } from "@/lib/admin-api";
export function AdminView<T>({title,load,children,action}:{title:string;load:(token:string)=>Promise<T>;children:(data:T,reload:()=>void)=>ReactNode;action?:ReactNode}) {
  const {session}=useAuth(); const [data,setData]=useState<T|null>(null); const [error,setError]=useState<unknown>(); const [reloadKey,setReloadKey]=useState(0);
  useEffect(()=>{if(!session?.access_token)return; let active=true; setError(undefined); load(session.access_token).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e)});return()=>{active=false};},[session?.access_token,load,reloadKey]);
  if(error instanceof AdminApiError&&error.status===403) return <section><h1 className="text-xl font-semibold">无访问权限</h1><p className="mt-2 text-sm text-muted-foreground">当前账号不是平台配置的超级管理员。</p></section>;
  if(error) return <section><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm text-destructive">{error instanceof Error?error.message:"加载数据失败"}</p></section>;
  if(!data) return <section><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm text-muted-foreground">正在验证管理员权限...</p></section>;
  return <section><div className="mb-6 flex items-center justify-between gap-3"><h1 className="text-xl font-semibold">{title}</h1>{action}</div>{children(data,()=>setReloadKey((value)=>value+1))}</section>;
}
export function Empty({label}:{label:string}) { return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">暂时没有{label}。</div>; }
