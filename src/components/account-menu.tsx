"use client";
import {useState} from "react";
import {useAuth} from "./auth-provider";
import {Button} from "./ui";
export function AccountMenu() {
  const {user,mode}=useAuth();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const end=async(disconnect:boolean)=>{
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/auth/${disconnect?"disconnect":"logout"}`,{method:"POST"});
      if(!response.ok){const body=await response.json();setError(body.error||"Could not end your session.");return;}
      window.location.assign("/");
    }catch{setError("Could not reach the server. Please retry.");}finally{setBusy(false);}
  };
  if(mode==="demo"||!user)return null;
  return <section className="mc-panel mc-gap"><h3>Your GitHub connection</h3><p className="mc-muted mc-smallgap">Signed in as @{user.login}. Copilot checks use this account’s entitlement.</p><div className="mc-row mc-smallgap"><Button disabled={busy} onClick={()=>end(false)}>Sign out</Button><Button disabled={busy} onClick={()=>end(true)}>Disconnect GitHub</Button></div><p className="mc-muted mc-caption mc-smallgap">Sign out ends this browser session. Disconnect revokes Marvin’s GitHub authorization and ends all your Marvin sessions.</p>{error&&<p role="alert" className="mc-error">{error}</p>}</section>;
}
