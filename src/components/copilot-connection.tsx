"use client";

import {useState} from "react";
import {Badge,Button,Icon,Shell} from "./ui";
import {useAuth} from "./auth-provider";
import {AccountMenu} from "./account-menu";
import type {ProbeResult} from "@/lib/copilot-probe";

export function CopilotConnection(){
  const auth=useAuth(), demo=auth.mode==="demo";
  const [result,setResult]=useState<ProbeResult|null>(null),[model,setModel]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const run=async(action:"status"|"chat")=>{
    setBusy(true);setError("");
    try{
      const response=await fetch(demo?"/api/copilot/check":"/api/copilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,model:action==="chat"?model:undefined})});
      const data=await response.json();
      if(!response.ok){setResult(null);setError(data.error||"The connection check could not run.");return;}
      setResult(data);if(data.error)setError(data.error);
      if(data.models?.length&&!data.models.some((m:{id:string})=>m.id===model))setModel(data.models[0].id);
    }catch{setError("Could not reach the server. Check your connection and retry.");}finally{setBusy(false);}
  };
  return <Shell title="Copilot connection"><main className="mc-main"><div className="mc-between"><div><div className="mc-eyebrow">A real connection, a small first step</div><h1 className="mc-smallgap">Meet the engine.</h1><p className="mc-muted mc-smallgap">Test GitHub Copilot through the official SDK, independently of the mock councils.</p></div><Badge>{demo?"Local development only":"GitHub OAuth"}</Badge></div><div className="mc-note mc-gap"><Icon name="shield-check"/><span>{demo?"This test uses the local Copilot CLI profile. No council documents are sent.":`Copilot requests use @${auth.user?.login||"your account"}’s server-side credentials. No council documents are sent.`}</span></div>
    <div className="mc-connection-steps"><section className="mc-connection-step"><div className="mc-between"><h3>01 / Sign in to GitHub Copilot</h3><Icon name="github"/></div>
      {demo?<><p>A GitHub account needs Copilot access. Complete the official CLI’s browser authorization in your terminal.</p><pre className="mc-code">npm run copilot:login</pre><p>This downloads the matching CLI if needed and uses the ignored .copilot-local profile and the operating system’s credential store. No GitHub App registration is needed for this local test.</p></>:<><Badge tone="green">Signed in as @{auth.user?.login}</Badge><p>Your GitHub account was checked against the configured access policy at sign-in. GitHub authentication and Copilot entitlement are separate; check access below to discover available models.</p><p>Tokens stay on the server. Each check uses an isolated SDK runtime with local account fallback disabled.</p></>}
      <a href="https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate" target="_blank" rel="noreferrer" className="mc-inline-link">GitHub authentication documentation</a>
    </section><section className="mc-connection-step"><div className="mc-between"><h3>02 / Check authentication and models</h3>{result&&<Badge tone={result.authenticated?"green":"amber"}>{result.authenticated?`Signed in${result.login?` as ${result.login}`:""}`:"Not authenticated"}</Badge>}</div><p>Start the SDK runtime, inspect sign-in status, and list available models. This step sends no chat prompt.</p><Button onClick={()=>run("status")} disabled={busy||!auth.ready||(!demo&&!auth.user)}><Icon name="check"/>{busy?"Checking…":"Check Copilot access"}</Button>{result&&<div className="mc-row mc-smallgap"><Badge tone={result.runtime?"green":"amber"}>Runtime {result.runtime?"started":"not started"}</Badge><Badge>{result.models.length} models returned</Badge>{result.authType&&<Badge>Auth: {result.authType}</Badge>}</div>}</section>
    <section className="mc-connection-step"><h3>03 / Send one real chat request</h3><p>A short connectivity prompt with tools disabled. This uses your Copilot allowance; it does not start a council.</p><label className="mc-field">Model<select value={model} disabled={!result?.models.length||busy} onChange={e=>setModel(e.target.value)}><option value="">Check access to discover models</option>{result?.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><Button className="mc-smallgap" variant="primary" onClick={()=>run("chat")} disabled={busy||!model||!result?.authenticated}>Send test greeting <Icon name="arrow-up-right"/></Button>{result?.reply&&<div className="mc-finding mc-smallgap" role="status"><Badge tone="green">Real Copilot response</Badge><p>{result.reply}</p></div>}</section></div>
    {(error||auth.error)&&<div role="alert" className="mc-error mc-gap">{error||auth.error}</div>}
    {demo?<section className="mc-panel mc-gap"><h3>Enable web sign-in</h3><p className="mc-muted mc-smallgap">The GitHub App OAuth flow is implemented. Configure your app, allowed users or organizations, PostgreSQL, and encryption key using docs/production-oauth.md. Production mode requires authentication.</p></section>:<AccountMenu/>}
  </main></Shell>;
}
