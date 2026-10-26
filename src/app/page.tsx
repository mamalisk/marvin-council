import Link from "next/link";
import {connection} from "next/server";
import {Brand, Icon} from "@/components/ui";
import {authConfig, demoEnabled} from "@/lib/auth/config";
import {publicAuthErrors} from "@/lib/auth/http";

export default async function LandingPage({searchParams}: {searchParams: Promise<{auth_error?: string}>}) {
  await connection();
  const demo=demoEnabled();
  let configured=true;
  try{authConfig();}catch{configured=false;}
  const errorCode=(await searchParams).auth_error||"";
  const error=Object.hasOwn(publicAuthErrors,errorCode)?publicAuthErrors[errorCode]:undefined;
  return <main className="mc-window"><div className="mc-auth"><section className="mc-auth-art"><Brand/><img src="/images/marvin.png" alt="Marvin, a white robot with green eyes" className="mc-robot-image"/><div className="mc-auth-copy"><div className="mc-eyebrow">A few good minds. One way forward.</div><h1>Big questions.<br/>Better company.</h1><p>Bring your people, your context, and a council of specialist agents.</p></div></section><section className="mc-auth-form"><div><div className="mc-eyebrow">Welcome to Marvin Council</div><h2>Let’s think<br/>this through.</h2><p className="mc-muted">Your next good decision starts here.</p></div>
    {error&&<p role="alert" className="mc-error">{error}</p>}
    <div className="mc-stack">
      {configured?<a className="mc-btn primary" href="/api/auth/github/login"><Icon name="github"/>Sign in with GitHub</a>:!demo&&<p role="alert" className="mc-error">GitHub sign-in needs server configuration. Follow docs/production-oauth.md to connect your organization.</p>}
      {demo&&<><Link className="mc-btn primary" href="/dashboard">Explore the demo <Icon name="arrow-right"/></Link><Link className="mc-btn" href="/connection"><Icon name="github"/>Connect GitHub Copilot</Link></>}
    </div><div className="mc-auth-note"><Icon name="shield-check"/><span>{demo?"The council workspace is mocked. Copilot connection testing lives separately, so you can explore without signing in.":"Sign in with your organization’s GitHub account. Copilot access is checked separately after sign-in. Council deliberation remains a prototype."}</span></div><div className="mc-row"><span className="mc-pill">Named specialists</span><span className="mc-pill">Shared context</span><span className="mc-pill">Human approval</span></div><p className="mc-legal">{demo?"Local development preview":"Internal workspace"} · prototype council data stays in this browser.</p></section></div></main>;
}
