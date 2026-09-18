import { getServerBaseUrl } from "./env";
export type WalletInfo={creditBalance:number};
async function call<T>(token:string,path:string,init?:RequestInit):Promise<T>{const response=await fetch(`${getServerBaseUrl()}/api/wallet${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(init?.body?{"content-type":"application/json"}:{}),...init?.headers}});if(!response.ok)throw new Error("Wallet request failed");return await response.json() as T;}
export const fetchWallet=(token:string)=>call<WalletInfo>(token,"");
