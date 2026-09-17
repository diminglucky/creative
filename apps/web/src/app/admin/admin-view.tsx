"use client";
import { useEffect,useState,type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AdminApiError } from "@/lib/admin-api";
export function AdminView<T>({title,load,children}:{title:string;load:(token:string)=>Promise<T>;children:(data:T)=>ReactNode}) {
  const {session}=useAuth(); const [data,setData]=useState<T|null>(null); const [error,setError]=useState<unknown>();
  useEffect(()=>{if(!session?.access_token)return; let active=true; load(session.access_token).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e)});return()=>{active=false};},[session?.access_token,load]);
  if(error instanceof AdminApiError&&error.status===403) return <section><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-muted-foreground">This account is not the configured platform administrator.</p></section>;
  if(error) return <section><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm text-destructive">{error instanceof Error?error.message:"Unable to load data"}</p></section>;
  if(!data) return <section><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm text-muted-foreground">Checking administrator access...</p></section>;
  return <section><div className="mb-6"><h1 className="text-xl font-semibold">{title}</h1></div>{children(data)}</section>;
}
export function Empty({label}:{label:string}) { return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">No {label} yet.</div>; }

