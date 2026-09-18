"use client";
import {useCallback,useEffect,useState} from "react";
import {fetchWallet,type WalletInfo} from "@/lib/wallet-api";
export function useWallet(token?:string){const[wallet,setWallet]=useState<WalletInfo|null>(null);const[error,setError]=useState<Error|null>(null);const refresh=useCallback(async()=>{if(!token)return;try{setWallet(await fetchWallet(token));setError(null)}catch(e){setError(e instanceof Error?e:new Error("Wallet request failed"))}},[token]);useEffect(()=>{void refresh()},[refresh]);return{wallet,error,refresh};}
