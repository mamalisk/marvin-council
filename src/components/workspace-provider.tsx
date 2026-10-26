"use client";

import {createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction} from "react";
import {initialWorkspace, type Workspace, type Council} from "@/lib/workspace";
import {useAuth} from "./auth-provider";

const STORAGE_KEY="marvin-council.workspace.v1";
type WorkspaceContext = {workspace:Workspace; setWorkspace:Dispatch<SetStateAction<Workspace>>; ready:boolean; notify:(message:string)=>void; updateCouncil:(id:string,update:(c:Council)=>Council)=>void};
const Context=createContext<WorkspaceContext|null>(null);

export function WorkspaceProvider({children}:{children:ReactNode}) {
  const auth=useAuth();
  const storageKey=auth.mode==="demo"?STORAGE_KEY:`${STORAGE_KEY}.github.${auth.user?.id||"anonymous"}`;
  const [workspace,setWorkspace]=useState<Workspace>(initialWorkspace);
  const [ready,setReady]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!auth.ready)return;
    try {
      const saved=localStorage.getItem(storageKey);
      if(saved){
        const parsed=JSON.parse(saved);
        if(parsed.version===1 && Array.isArray(parsed.catalog)&&Array.isArray(parsed.councils)&&parsed.draft&&Array.isArray(parsed.draft.grow))setWorkspace(parsed);
      }
    }catch{setNotice("Saved demo data could not be loaded. Starting a fresh workspace.");}
    setReady(true);
  },[auth.ready,storageKey]);
  useEffect(()=>{
    document.documentElement.dataset.theme=workspace.theme;
    if(!ready)return;
    try{localStorage.setItem(storageKey,JSON.stringify(workspace));}
    catch{setNotice("Browser storage is full. Your current work is available until this tab closes.");}
  },[workspace,ready,storageKey]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(t);},[notice]);
  const updateCouncil=(id:string,update:(c:Council)=>Council)=>setWorkspace(s=>({...s,councils:s.councils.map(c=>c.id===id?update(c):c)}));
  return <Context.Provider value={{workspace,setWorkspace,ready,notify:setNotice,updateCouncil}}><div id="marvin-app">{children}{notice&&<div className="mc-toast" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss notification">×</button></div>}</div></Context.Provider>;
}
export function useWorkspace(){const context=useContext(Context);if(!context)throw new Error("WorkspaceProvider missing");return context;}
