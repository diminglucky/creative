import { getServerBaseUrl } from "./env";

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "AdminApiError"; }
}
async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}/api/admin${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) { const body=await response.json().catch(()=>null); throw new AdminApiError(response.status,body?.error?.code ?? "admin_request_failed",body?.error?.message ?? "Admin request failed"); }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
export const fetchAdminOverview = (t:string) => request<any>(t,"/overview");
export const fetchAdminProviders = (t:string) => request<any>(t,"/providers");
export const fetchAdminModels = (t:string) => request<any>(t,"/models");
export const fetchAdminPlans = (t:string) => request<any>(t,"/plans");
export const fetchAdminUsers = (t:string) => request<any>(t,"/users");
export const fetchAdminOrders = (t:string) => request<any>(t,"/orders");
export const fetchAdminLedger = (t:string) => request<any>(t,"/ledger");
export const updateAdminProvider = (t:string,id:string,data:unknown) => request<void>(t,`/providers/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const updateAdminModel = (t:string,id:string,data:unknown) => request<void>(t,`/models/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const updateAdminPlan = (t:string,id:string,data:unknown) => request<void>(t,`/plans/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});

