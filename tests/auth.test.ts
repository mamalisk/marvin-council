import {after, before, beforeEach, test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHmac} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {authConfig, cookieNames, cookieOptions, demoEnabled, sameOrigin, type AuthConfig} from "../src/lib/auth/config";
import {decrypt, encrypt, hashSecret, pkceChallenge, validWebhook} from "../src/lib/auth/crypto";
import {AuthService} from "../src/lib/auth/service";
import {AuthError, GitHubOAuth, type Tokens} from "../src/lib/auth/github";
import type {Database, Query} from "../src/lib/auth/database";
import {isolatedRuntimeEnvironment, createOAuthRuntime} from "../src/lib/copilot-runtime";
import {NextRequest} from "next/server";
import {boundedBody, BodyTooLarge} from "../src/lib/bounded-body";

const config: AuthConfig = {origin:"https://marvin.example",clientId:"test-client",clientSecret:"test-secret",encryptionKey:Buffer.alloc(32,7),organizations:["our-org"],databaseUrl:"unused",webhookSecret:"test-webhook",secureCookies:true};
let engine: PGlite;
let db: Database;
let calls: {url:string;init:RequestInit}[];
let membership="active", identityUnavailable=false, refreshCount=0;
let service: AuthService;

const request: typeof fetch = async (input,init={}) => {
  const url=String(input);calls.push({url,init});
  if(url.endsWith("/access_token")){
    const body=new URLSearchParams(init.body as URLSearchParams);
    assert.equal(body.get("client_secret"),config.clientSecret);
    if(body.get("grant_type")==="refresh_token"){
      refreshCount++;
      return Response.json({access_token:"ghu_refreshed",token_type:"bearer",refresh_token:"ghr_rotated",expires_in:28800,refresh_token_expires_in:100000});
    }
    assert.equal(body.get("redirect_uri"),config.origin+"/api/auth/github/callback");
    assert.equal(body.get("code_verifier")?.length,43);
    return Response.json({access_token:body.get("code")==="second-user"?"ghu_second":"ghu_original",token_type:"bearer",refresh_token:"ghr_original",expires_in:28800,refresh_token_expires_in:100000});
  }
  if(url.endsWith("/user")){
    if(identityUnavailable)return new Response(null,{status:503});
    const token=new Headers(init.headers).get("authorization");
    return Response.json(token==="Bearer ghu_second"?{id:2,login:"second",name:"Second Person"}:{id:1,login:"alice",name:"Alice Example"});
  }
  if(url.endsWith("/user/memberships/orgs/our-org"))return Response.json({state:membership});
  if(init.method==="DELETE")return new Response(null,{status:204});
  throw new Error(`Unexpected test URL: ${url}`);
};

before(async()=>{
  engine=new PGlite();
  await engine.exec(await readFile(new URL("../db/001-auth.sql",import.meta.url),"utf8"));
  db={query:((sql,values)=>engine.query(sql,values)) as Query,transaction:operation=>engine.transaction(tx=>operation(((sql,values)=>tx.query(sql,values)) as Query))};
});
beforeEach(async()=>{
  await engine.exec("TRUNCATE marvin_oauth_flows,marvin_auth_sessions,marvin_auth_users CASCADE");
  calls=[];membership="active";identityUnavailable=false;refreshCount=0;
  service=new AuthService(config,db,new GitHubOAuth(config,request));
});
after(async()=>{await engine.close();});

async function login(code="first-user",oldSession?:string){
  const flow=await service.begin();
  const state=new URL(flow.url).searchParams.get("state")!;
  return {...await service.finish(state,flow.browser,code,oldSession),state,browser:flow.browser};
}
async function expireToken(){
  const {rows}=await db.query<{tokens:string}>("SELECT tokens FROM marvin_auth_users WHERE github_id='1'");
  const tokens=decrypt<Tokens>(rows[0].tokens,config.encryptionKey,"github:1");
  await db.query("UPDATE marvin_auth_users SET tokens=$1 WHERE github_id='1'",[encrypt({...tokens,expiresAt:Date.now()-1000},config.encryptionKey,"github:1")]);
}
const codeIs=(code:string)=>(error:unknown)=>error instanceof AuthError&&error.code===code;

test("OAuth binds state to the browser and exchanges the matching PKCE verifier once",async()=>{
  const flow=await service.begin(),url=new URL(flow.url),state=url.searchParams.get("state")!;
  assert.equal(url.origin,"https://github.com");
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.has("client_secret"),false);
  await assert.rejects(service.finish(state,"x".repeat(43),"code"),codeIs("invalid_flow"));
  assert.equal(calls.length,0);
  const result=await service.finish(state,flow.browser,"code");
  const body=new URLSearchParams(calls[0].init.body as URLSearchParams);
  assert.equal(pkceChallenge(body.get("code_verifier")!),url.searchParams.get("code_challenge"));
  assert.equal(result.user.login,"alice");
  await assert.rejects(service.finish(state,flow.browser,"code"),codeIs("invalid_flow"));
  const {rows}=await db.query<{tokens:string;id_hash:string}>("SELECT u.tokens,s.id_hash FROM marvin_auth_users u JOIN marvin_auth_sessions s USING(github_id)");
  assert.equal(rows[0].tokens.includes("ghu_original"),false);
  assert.equal(rows[0].id_hash,hashSecret(result.session));
  assert.notEqual(rows[0].id_hash,result.session);
});

test("expired or cancelled login attempts issue no session",async()=>{
  const flow=await service.begin(),state=new URL(flow.url).searchParams.get("state")!;
  await db.query("UPDATE marvin_oauth_flows SET expires_at=$1",[Date.now()-1]);
  await assert.rejects(service.finish(state,flow.browser,"code"),codeIs("invalid_flow"));
  const cancelled=await service.begin();
  await assert.rejects(service.finish(new URL(cancelled.url).searchParams.get("state"),cancelled.browser,null),codeIs("invalid_flow"));
  assert.equal(calls.length,0);
});

test("pending organization members are denied and their newly exchanged token is revoked",async()=>{
  membership="pending";
  await assert.rejects(login(),codeIs("forbidden"));
  assert.ok(calls.some(c=>c.init.method==="DELETE"&&c.url.endsWith("/token")));
  assert.equal((await db.query("SELECT * FROM marvin_auth_sessions")).rows.length,0);
});

test("sessions isolate identities, rotate on login, and expire",async()=>{
  const first=await login(),second=await login("second-user");
  assert.equal((await service.authenticate(first.session)).accessToken,"ghu_original");
  assert.equal((await service.authenticate(second.session)).accessToken,"ghu_second");
  const replaced=await login("first-user",first.session);
  await assert.rejects(service.authenticate(first.session),codeIs("unauthorized"));
  await db.query("UPDATE marvin_auth_sessions SET expires_at=$1 WHERE id_hash=$2",[Date.now()-1,hashSecret(replaced.session)]);
  await assert.rejects(service.authenticate(replaced.session),codeIs("unauthorized"));
  assert.equal((await service.authenticate(second.session)).login,"second");
});

test("concurrent requests rotate an expiring token only once",async()=>{
  const user=await login();await expireToken();
  const results=await Promise.all([service.authenticate(user.session),service.authenticate(user.session)]);
  assert.equal(refreshCount,1);
  assert.ok(results.every(r=>r.accessToken==="ghu_refreshed"));
});

test("successful token rotation is committed even if the subsequent membership check is unavailable",async()=>{
  const user=await login();await expireToken();identityUnavailable=true;
  await assert.rejects(service.authenticate(user.session),codeIs("provider"));
  identityUnavailable=false;
  assert.equal((await service.authenticate(user.session)).accessToken,"ghu_refreshed");
  assert.equal(refreshCount,1);
});

test("membership loss invalidates all of that user's sessions before a model request",async()=>{
  const one=await login(),two=await login();membership="pending";
  await assert.rejects(service.authenticate(one.session,true),codeIs("forbidden"));
  await assert.rejects(service.authenticate(two.session),codeIs("unauthorized"));
  assert.equal((await db.query("SELECT tokens FROM marvin_auth_users")).rows[0].tokens,null);
});

test("logout affects one session; disconnect revokes the grant and all user's sessions",async()=>{
  const one=await login(),two=await login(),other=await login("second-user");
  await service.logout(one.session);
  await assert.rejects(service.authenticate(one.session),codeIs("unauthorized"));
  assert.equal((await service.authenticate(two.session)).login,"alice");
  await service.disconnect(two.session);
  await assert.rejects(service.authenticate(two.session),codeIs("unauthorized"));
  assert.ok(calls.some(c=>c.init.method==="DELETE"&&c.url.endsWith("/grant")));
  assert.equal((await service.authenticate(other.session)).login,"second");
});

test("revocation events invalidate all sessions and probe limits apply across sessions",async()=>{
  const one=await login(),two=await login();
  for(let i=0;i<6;i++)await service.authenticate(i%2?one.session:two.session,true);
  await assert.rejects(service.authenticate(two.session,true),codeIs("rate_limited"));
  await service.revoked("1");
  await assert.rejects(service.authenticate(one.session),codeIs("unauthorized"));
  await assert.rejects(service.authenticate(two.session),codeIs("unauthorized"));
});

test("encryption rejects tampering and moving credentials between users",()=>{
  const sealed=encrypt({token:"secret"},config.encryptionKey,"github:1");
  assert.deepEqual(decrypt(sealed,config.encryptionKey,"github:1"),{token:"secret"});
  assert.throws(()=>decrypt(sealed,config.encryptionKey,"github:2"));
  const parts=sealed.split(".");parts[3]=(parts[3][0]==="a"?"b":"a")+parts[3].slice(1);
  assert.throws(()=>decrypt(parts.join("."),config.encryptionKey,"github:1"));
});

test("production configuration, cookies, request origins and webhook signatures fail closed",()=>{
  assert.equal(demoEnabled({NODE_ENV:"production",AUTH_MODE:"demo"}),false);
  const env={NODE_ENV:"production",APP_ORIGIN:config.origin,GITHUB_CLIENT_ID:"id",GITHUB_CLIENT_SECRET:"secret",AUTH_ENCRYPTION_KEY:config.encryptionKey.toString("base64"),DATABASE_URL:"postgresql://localhost/marvin",GITHUB_ALLOWED_ORGS:"our-org",GITHUB_WEBHOOK_SECRET:"webhook"};
  assert.equal(authConfig(env).secureCookies,true);
  for(const patch of [{APP_ORIGIN:"http://localhost:3000"},{GITHUB_ALLOWED_ORGS:""},{AUTH_ENCRYPTION_KEY:"bad"},{GITHUB_WEBHOOK_SECRET:""}])assert.throws(()=>authConfig({...env,...patch}));
  assert.equal(cookieNames(true).session,"__Host-marvin-session");
  assert.deepEqual(cookieOptions(true,60),{secure:true,httpOnly:true,sameSite:"lax",path:"/",maxAge:60});
  assert.equal(sameOrigin(config.origin,config),true);
  assert.equal(sameOrigin("https://evil.example",config),false);
  assert.equal(sameOrigin(null,config),false);
  const body=JSON.stringify({action:"revoked"});
  const signature="sha256="+createHmac("sha256","webhook").update(body).digest("hex");
  assert.equal(validWebhook(body,signature,"webhook"),true);
  assert.equal(validWebhook(body+" ",signature,"webhook"),false);
  assert.equal(validWebhook(body,"invalid","webhook"),false);
});

test("OAuth runtimes use explicit tokens, separate directories, and no ambient secrets",async()=>{
  const env=isolatedRuntimeEnvironment("isolated",{PATH:"bin",HTTPS_PROXY:"https://proxy.example",NODE_EXTRA_CA_CERTS:"corporate.pem",GH_TOKEN:"other-user",GITHUB_TOKEN:"server-token",GITHUB_CLIENT_SECRET:"app-secret",AUTH_ENCRYPTION_KEY:"key",DATABASE_URL:"database"});
  assert.equal(env.PATH,"bin");assert.equal(env.HTTPS_PROXY,"https://proxy.example");
  assert.equal("GH_TOKEN" in env,false);assert.equal("DATABASE_URL" in env,false);assert.equal("GITHUB_CLIENT_SECRET" in env,false);
  const a=await createOAuthRuntime("user-one"),b=await createOAuthRuntime("user-two");
  try{assert.notEqual(a.options.baseDirectory,b.options.baseDirectory);assert.equal(a.options.gitHubToken,"user-one");assert.equal(b.options.gitHubToken,"user-two");assert.equal(a.options.useLoggedInUser,false);}
  finally{await a.dispose();await b.dispose();}
});

async function withRoutes(operation:()=>Promise<void>){
  const env={AUTH_MODE:"github",APP_ORIGIN:config.origin,GITHUB_CLIENT_ID:config.clientId,GITHUB_CLIENT_SECRET:config.clientSecret,AUTH_ENCRYPTION_KEY:config.encryptionKey.toString("base64"),DATABASE_URL:config.databaseUrl,GITHUB_ALLOWED_ORGS:"our-org",GITHUB_WEBHOOK_SECRET:config.webhookSecret!};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env);
  const root=globalThis as typeof globalThis&{marvinAuthPool?:unknown};
  const oldPool=root.marvinAuthPool, oldFetch=globalThis.fetch;
  root.marvinAuthPool={query:db.query,connect:async()=>({query:db.query,release(){}})};
  globalThis.fetch=request;
  try{await operation();}finally{
    root.marvinAuthPool=oldPool;globalThis.fetch=oldFetch;
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}

test("real route handlers set secure cookies, complete callback and return only public identity",async()=>withRoutes(async()=>{
  const {GET:start}=await import("../src/app/api/auth/github/login/route");
  const {GET:callback}=await import("../src/app/api/auth/github/callback/route");
  const {GET:status}=await import("../src/app/api/auth/session/route");
  const signedOut=await status(new NextRequest(config.origin+"/api/auth/session"));
  assert.equal(signedOut.status,401);
  const begin=await start();
  assert.equal(begin.status,302);
  const cookie=begin.headers.get("set-cookie")!;
  assert.match(cookie,/__Host-marvin-oauth=/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=lax/i);
  const state=new URL(begin.headers.get("location")!).searchParams.get("state")!;
  const browser=begin.cookies.get("__Host-marvin-oauth")!.value;
  const response=await callback(new NextRequest(`${config.origin}/api/auth/github/callback?state=${state}&code=code`,{headers:{cookie:`__Host-marvin-oauth=${browser}`}}));
  assert.equal(response.status,303);
  assert.equal(response.headers.get("location"),config.origin+"/connection");
  assert.equal(response.cookies.get("__Host-marvin-oauth")!.value,"");
  const session=response.cookies.get("__Host-marvin-session")!.value;
  const account=await status(new NextRequest(config.origin+"/api/auth/session",{headers:{cookie:`__Host-marvin-session=${session}`}}));
  assert.equal(account.status,200);
  assert.equal(account.headers.get("cache-control"),"no-store");
  assert.deepEqual(await account.json(),{mode:"github",user:{id:"1",login:"alice",name:"Alice Example"}});
  const replay=await callback(new NextRequest(`${config.origin}/api/auth/github/callback?state=${state}&code=code`,{headers:{cookie:`__Host-marvin-oauth=${browser}`}}));
  assert.equal(replay.headers.get("location"),config.origin+"/?auth_error=invalid_flow");
}));

test("route handlers reject cross-site mutations and unauthenticated SDK access",async()=>withRoutes(async()=>{
  const {POST:logout}=await import("../src/app/api/auth/logout/route");
  const {POST:probe}=await import("../src/app/api/copilot/route");
  const account=await login();
  const forged=await logout(new NextRequest(config.origin+"/api/auth/logout",{method:"POST",headers:{origin:"https://evil.example",cookie:`__Host-marvin-session=${account.session}`}}));
  assert.equal(forged.status,403);
  assert.equal((await service.authenticate(account.session)).login,"alice");
  const denied=await probe(new NextRequest(config.origin+"/api/copilot",{method:"POST",headers:{origin:config.origin,"content-type":"application/json"},body:JSON.stringify({action:"chat",model:"fake",accessToken:"user-supplied-token",id:"1"})}));
  assert.equal(denied.status,401);
  const result=await logout(new NextRequest(config.origin+"/api/auth/logout",{method:"POST",headers:{origin:config.origin,cookie:`__Host-marvin-session=${account.session}`}}));
  assert.equal(result.status,200);
  await assert.rejects(service.authenticate(account.session),codeIs("unauthorized"));
}));

test("webhook route verifies signatures before invalidating sessions",async()=>withRoutes(async()=>{
  const {POST:webhook}=await import("../src/app/api/auth/github/webhook/route");
  const account=await login();
  const body=JSON.stringify({action:"revoked",sender:{id:1}});
  const call=(signature:string)=>webhook(new NextRequest(config.origin+"/api/auth/github/webhook",{method:"POST",headers:{"x-github-event":"github_app_authorization","x-hub-signature-256":signature},body}));
  assert.equal((await call("sha256="+"0".repeat(64))).status,403);
  assert.equal((await service.authenticate(account.session)).login,"alice");
  const signature="sha256="+createHmac("sha256",config.webhookSecret!).update(body).digest("hex");
  assert.equal((await call(signature)).status,200);
  await assert.rejects(service.authenticate(account.session),codeIs("unauthorized"));
  assert.equal((await call(signature)).status,200);
}));

test("streaming request limits count bytes even without Content-Length",async()=>{
  assert.equal(await boundedBody(new Request("https://marvin.example",{method:"POST",body:"hello"}),5),"hello");
  await assert.rejects(boundedBody(new Request("https://marvin.example",{method:"POST",body:"ééé"}),5),BodyTooLarge);
});
