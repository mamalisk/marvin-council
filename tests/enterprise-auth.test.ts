import {test} from "node:test";
import assert from "node:assert/strict";
import {authConfig} from "../src/lib/auth/config";
import {AuthError, GitHubOAuth} from "../src/lib/auth/github";
import {authFailure} from "../src/lib/auth/http";

const config = authConfig({NODE_ENV:"production",APP_ORIGIN:"https://marvin.example",GITHUB_CLIENT_ID:"id",GITHUB_CLIENT_SECRET:"secret",AUTH_ENCRYPTION_KEY:Buffer.alloc(32,7).toString("base64"),DATABASE_URL:"unused",GITHUB_WEBHOOK_SECRET:"test",GITHUB_ALLOWED_ENTERPRISES:"lseg"});
const codeIs=(code:string)=>(error:unknown)=>error instanceof AuthError&&error.code===code;
const page=(slugs:string[],next:string|null=null,id=42)=>({data:{viewer:{databaseId:id,enterprises:{nodes:slugs.map(slug=>({slug})),pageInfo:{hasNextPage:next!==null,endCursor:next}}}}});

function provider(respond:(init:RequestInit)=>Response|Promise<Response>,overrides:Partial<typeof config>={}) {
  return new GitHubOAuth({...config,...overrides},async(input,init={})=>{
    if(String(input)==="https://api.github.com/user")return Response.json({id:42,login:"employee_LSEG"});
    assert.equal(String(input),"https://api.github.com/graphql");
    assert.equal(init.method,"POST");
    assert.equal(init.redirect,"error");
    assert.equal(init.cache,"no-store");
    assert.equal(new Headers(init.headers).get("authorization"),"Bearer test-token");
    const body=JSON.parse(String(init.body));
    assert.match(body.query,/viewer\s*\{/);
    assert.match(body.query,/membershipType: ALL/);
    assert.deepEqual(Object.keys(body.variables),["after"]);
    return respond(init);
  });
}

test("enterprise access follows bounded cursors and matches exact enterprise slugs for the verified viewer",async()=>{
  const cursors:unknown[]=[];
  const github=provider(init=>{
    const {after}=JSON.parse(String(init.body)).variables;cursors.push(after);
    return Response.json(after===null?page(["not-lseg"],"next-page"):page(["LSEG"]));
  });
  assert.equal((await github.identity("test-token")).id,"42");
  assert.deepEqual(cursors,[null,"next-page"]);
  await assert.rejects(provider(()=>Response.json(page(["lseg-other"]))).identity("test-token"),codeIs("forbidden"));
  await assert.rejects(provider(()=>Response.json(page([]))).identity("test-token"),codeIs("forbidden"));
});

test("explicit user access does not depend on enterprise API availability",async()=>{
  const github=provider(()=>{throw new Error("should not call GraphQL");},{users:["employee_lseg"]});
  assert.equal((await github.identity("test-token")).login,"employee_LSEG");
});

test("partial GraphQL data, mismatched identity and malformed memberships cannot grant enterprise access",async()=>{
  for(const body of [
    {...page(["lseg"]),errors:[{message:"sensitive upstream detail"}]},
    {...page(["lseg"]),errors:{}},
    page(["lseg"],null,99),
    {data:{viewer:{databaseId:42,enterprises:null}}},
    {data:{viewer:{databaseId:42,enterprises:{nodes:[null],pageInfo:{hasNextPage:false}}}}},
    {data:{viewer:{databaseId:42,enterprises:{nodes:[{slug:"lseg"}]}}}},
    null,
  ])await assert.rejects(provider(()=>Response.json(body)).identity("test-token"),codeIs("enterprise_check_failed"));
  await assert.rejects(provider(()=>new Response("not json")).identity("test-token"),codeIs("enterprise_check_failed"));
});

test("permission failures, rate limits and network errors remain closed and redact provider details",async()=>{
  for(const status of [403,404,429,500])await assert.rejects(provider(()=>new Response("private detail",{status})).identity("test-token"),codeIs("enterprise_check_failed"));
  await assert.rejects(provider(()=>new Response(null,{status:401})).identity("test-token"),codeIs("unauthorized"));
  await assert.rejects(provider(()=>{throw new Error("secret provider detail");}).identity("test-token"),codeIs("enterprise_check_failed"));
  const response=authFailure(new AuthError("enterprise_check_failed"));
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,"enterprise_check_failed");
});

test("pagination loops and page exhaustion fail closed",async()=>{
  let calls=0;
  await assert.rejects(provider(()=>{calls++;return Response.json(page([],"same"));}).identity("test-token"),codeIs("enterprise_check_failed"));
  assert.equal(calls,2);
  calls=0;
  await assert.rejects(provider(()=>Response.json(page([],String(++calls)))).identity("test-token"),codeIs("enterprise_check_failed"));
  assert.equal(calls,5);
});

test("enterprise diagnostics distinguish failures without logging identities, tokens or upstream text",async(t)=>{
  const logs:unknown[][]=[];
  t.mock.method(console,"warn",(...args:unknown[])=>logs.push(args));
  const cases:[()=>Response, string, number][]=[
    [()=>Response.json({errors:[{type:"FORBIDDEN",message:"private employee_LSEG test-token"}]}),"graphql_access_denied",200],
    [()=>Response.json({errors:[{extensions:{code:"undefinedField"},message:"private"}]}),"graphql_query_unsupported",200],
    [()=>Response.json({errors:[{type:"unknown secret"}]}),"graphql_error",200],
    [()=>Response.json({data:{viewer:{databaseId:42,enterprises:null}}}),"membership_unavailable",200],
    [()=>Response.json(page(["lseg"],null,99)),"identity_mismatch",200],
    [()=>new Response("private",{status:403}),"http_access_denied",403],
    [()=>new Response("private",{status:429}),"rate_limited",429],
    [()=>new Response("private"),"invalid_json",200],
  ];
  for(const [respond,diagnostic,httpStatus] of cases){
    await assert.rejects(provider(respond).identity("test-token"),codeIs("enterprise_check_failed"));
    assert.deepEqual(logs.pop(),["marvin.auth.enterprise",{diagnostic,httpStatus}]);
  }
  await assert.rejects(provider(()=>{throw new Error("private test-token");}).identity("test-token"),codeIs("enterprise_check_failed"));
  assert.deepEqual(logs.pop(),["marvin.auth.enterprise",{diagnostic:"network_error"}]);
});
