"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {Avatar, Badge, Button, Icon, Shell} from "./ui";
import {useWorkspace} from "./workspace-provider";
import {freshDraft, starterAgents, type Council} from "@/lib/workspace";

export function CouncilCard({council}:{council:Council}){
  const approved=council.approvals.length>=council.quorum;
  const review=council.status==="review";
  return <article className="mc-council-card"><div className="mc-between"><Badge tone={approved?"green":review?"green":"amber"}>{approved?"Approved":review?"Ready for review":council.status==="paused"?"Paused":council.mode==="offline"?"Offline session":"Waiting for your input"}</Badge><span className="mc-muted mc-caption">{council.mode==="live"?"Live":"Asynchronous"}</span></div><h3>{council.name}</h3><p>{review?`Specification v${council.revision} is ready. ${council.approvals.length} of ${council.quorum} human approvals received.`:council.grow[0]}</p><div className="mc-footer"><div className="mc-avatar-stack">{council.agents.map(a=><Avatar key={a.id} name={a.name}/>)}</div><Link className="mc-btn ghost" href={`/councils/${council.id}`}>{review?"Review":"Resume"}<Icon name="arrow-up-right"/></Link></div></article>;
}
export function Dashboard({all=false}:{all?:boolean}){
  const {workspace,setWorkspace}=useWorkspace();const router=useRouter();
  const start=()=>{setWorkspace(s=>({...s,draft:freshDraft()}));router.push("/councils/new");};
  const recurring=()=>{setWorkspace(s=>({...s,draft:{...freshDraft(),agentIds:starterAgents.map(a=>a.id),invitees:["alex-r","sam-chen"]}}));router.push("/councils/new");};
  return <Shell title={all?"Councils":"Overview"}><main className="mc-main">{!all?<section className="mc-hero"><div><div className="mc-eyebrow">Your thinking space</div><h1>Hello, Alex.<br/>What are we solving?</h1><p>“I’ve a brain the size of a planet.<br/>We might as well put it to work.”</p><Button variant="primary" onClick={start}><Icon name="plus"/>Assemble a council</Button></div><div className="mc-hero-robot"><img className="mc-robot-image" src="/images/marvin.png" alt="Marvin is ready to moderate"/><span className="mc-pill">● Marvin is ready</span></div></section>:<div className="mc-between"><div><div className="mc-eyebrow">Your conversations</div><h1 className="mc-smallgap">Good thinking continues.</h1><p className="mc-muted mc-smallgap">Return to a council, or bring a new one together.</p></div><Button variant="primary" onClick={start}><Icon name="plus"/>New council</Button></div>}<div className="mc-section-title mc-gap"><h2>{all?"All councils":"Pick up a conversation"}</h2><span className="mc-muted mc-caption">{workspace.councils.length} councils · stored in this browser</span></div><div className="mc-grid2">{(all?workspace.councils:workspace.councils.slice(0,4)).map(c=><CouncilCard key={c.id} council={c}/>)}</div><div className="mc-section-title mc-gap"><h2>Your recurring councils</h2></div><div className="mc-panel mc-between"><div className="mc-row"><Avatar name="Design"/><div><h3>Product & engineering</h3><small className="mc-muted">Maya, Theo, Nova, Iris + Marvin · reusable council</small></div></div><Button onClick={recurring}>New session</Button></div><div className="mc-banner"><div><strong>Meet your next specialist.</strong><div className="mc-muted">Pick a perspective. Give it a name. Make it yours.</div></div><Link className="mc-btn ghost" href="/marketplace">Explore marketplace <Icon name="arrow-right"/></Link></div></main></Shell>;
}
