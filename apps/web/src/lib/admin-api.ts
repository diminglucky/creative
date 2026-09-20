import { getServerBaseUrl } from "./env";

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "AdminApiError"; }
}
async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerBaseUrl()}/api/admin${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) { const body=await response.json().catch(()=>null); throw new AdminApiError(response.status,body?.error?.code ?? "admin_request_failed",body?.error?.message ?? "管理员操作失败"); }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
export const fetchAdminOverview = (t:string) => request<any>(t,"/overview");
export async function isAdminSession(token: string): Promise<boolean> {
  try {
    await fetchAdminOverview(token);
    return true;
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) return false;
    throw error;
  }
}
export const fetchAdminProviders = (t:string) => request<any>(t,"/providers");
export const fetchAdminModels = (t:string) => request<any>(t,"/models");
export const fetchAdminPlans = (t:string) => request<any>(t,"/plans");
export const fetchAdminUsers = (t:string,offset=0,limit=50) => request<any>(t,`/users?offset=${offset}&limit=${limit}`);
export const fetchAdminOrders = (t:string,offset=0,limit=50) => request<any>(t,`/orders?offset=${offset}&limit=${limit}`);
export const fetchAdminLedger = (t:string,offset=0,limit=50) => request<any>(t,`/ledger?offset=${offset}&limit=${limit}`);
export const fetchAdminCreditPackSettings=(t:string)=>request<any>(t,"/credit-packs");
export const updateAdminCreditRatio=(t:string,creditsPerYuan:number)=>request<void>(t,"/credit-packs/settings",{method:"PATCH",body:JSON.stringify({creditsPerYuan})});
export const createAdminCreditPack=(t:string,data:unknown)=>request<void>(t,"/credit-packs",{method:"POST",body:JSON.stringify(data)});
export const updateAdminCreditPack=(t:string,id:string,data:unknown)=>request<void>(t,`/credit-packs/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const deleteAdminCreditPack=(t:string,id:string)=>request<void>(t,`/credit-packs/${encodeURIComponent(id)}`,{method:"DELETE"});
export const updateAdminProvider = (t:string,id:string,data:unknown) => request<void>(t,`/providers/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const createAdminProvider = (t:string,data:unknown) => request<void>(t,"/providers",{method:"POST",body:JSON.stringify(data)});
export const discoverAdminProviderModels = (t:string,id:string,data:unknown) => request<any>(t,`/providers/${encodeURIComponent(id)}/models/discover`,{method:"POST",body:JSON.stringify(data)});
export const createAdminModel = (t:string,data:unknown) => request<void>(t,"/models",{method:"POST",body:JSON.stringify(data)});
export const updateAdminModel = (t:string,id:string,data:unknown) => request<void>(t,`/models/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const updateAdminPlan = (t:string,id:string,data:unknown) => request<void>(t,`/plans/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(data)});
export const adjustAdminUser = (t:string,id:string,data:unknown) => request<void>(t,`/users/${encodeURIComponent(id)}/adjust`,{method:"POST",body:JSON.stringify(data)});
