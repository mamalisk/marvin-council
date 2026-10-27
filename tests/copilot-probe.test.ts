import {afterEach, mock, test} from "node:test";
import assert from "node:assert/strict";
import {CopilotClient} from "@github/copilot-sdk";
import {probeCopilot} from "../src/lib/copilot-probe";
import {copilotFailure} from "../src/lib/copilot-diagnostics";

afterEach(()=>mock.restoreAll());

test("runtime startup failures are distinguished from authentication and redact SDK output",async()=>{
  const logs:unknown[][]=[];
  mock.method(console,"error",(...args:unknown[])=>logs.push(args));
  mock.method(CopilotClient.prototype,"start",async()=>{throw new Error("Could not resolve @github/copilot-sdk-linux-x64. secret-runtime-stderr");});
  const stop=mock.method(CopilotClient.prototype,"forceStop",async()=>{});
  const auth=mock.method(CopilotClient.prototype,"getAuthStatus",async()=>{throw new Error("Must not check auth");});
  const result=await probeCopilot("status",undefined,{id:"test",accessToken:"secret-user-token"});
  assert.equal(result.runtime,false);
  assert.equal(result.authChecked,false);
  assert.equal(result.stage,"runtime");
  assert.equal(result.code,"runtime_missing");
  assert.equal(auth.mock.callCount(),0);
  assert.equal(stop.mock.callCount(),1);
  assert.equal(JSON.stringify([result,logs]).includes("secret-"),false);
  assert.deepEqual(logs,[["marvin.copilot.probe",{stage:"runtime",code:"runtime_missing"}]]);
});

test("runtime success does not imply Copilot authentication; failed auth RPC stays unchecked",async()=>{
  mock.method(console,"error",()=>{});
  mock.method(CopilotClient.prototype,"start",async()=>{});
  mock.method(CopilotClient.prototype,"forceStop",async()=>{});
  const auth=mock.method(CopilotClient.prototype,"getAuthStatus",async()=>({isAuthenticated:false}));
  const models=mock.method(CopilotClient.prototype,"listModels",async()=>{throw new Error("Must not discover models");});
  const result=await probeCopilot("status",undefined,{id:"test",accessToken:"test-token"});
  assert.equal(result.runtime,true);
  assert.equal(result.authChecked,true);
  assert.equal(result.authenticated,false);
  assert.equal(result.code,"copilot_unauthenticated");
  assert.equal(models.mock.callCount(),0);
  auth.mock.mockImplementation(async()=>{throw new Error("private provider response");});
  const failed=await probeCopilot("status",undefined,{id:"test",accessToken:"test-token"});
  assert.equal(failed.runtime,true);
  assert.equal(failed.authChecked,false);
  assert.equal(failed.code,"authentication_check_failed");
});

test("model discovery failures preserve successful authentication",async()=>{
  mock.method(console,"error",()=>{});
  mock.method(CopilotClient.prototype,"start",async()=>{});
  mock.method(CopilotClient.prototype,"forceStop",async()=>{});
  mock.method(CopilotClient.prototype,"getAuthStatus",async()=>({isAuthenticated:true}));
  const models=mock.method(CopilotClient.prototype,"listModels",async()=>{throw new Error("private provider response");});
  const result=await probeCopilot("status",undefined,{id:"test",accessToken:"test-token"});
  assert.equal(result.runtime,true);
  assert.equal(result.authChecked,true);
  assert.equal(result.authenticated,true);
  assert.equal(result.code,"model_discovery_failed");
  const capabilities={supports:{vision:false,reasoningEffort:false},limits:{max_context_window_tokens:1000}};
  models.mock.mockImplementation(async()=>[{id:"enabled",name:"Enabled",capabilities},{id:"disabled",name:"Disabled",capabilities,policy:{state:"disabled",terms:""}}]);
  const success=await probeCopilot("status",undefined,{id:"test",accessToken:"test-token"});
  assert.deepEqual(success.models,[{id:"enabled",name:"Enabled"}]);
  assert.equal(success.error,undefined);
});

test("host errors yield fixed diagnostic codes without raw paths or credentials",()=>{
  for(const [code,expected] of [["ENOENT","runtime_missing"],["EACCES","runtime_permission"],["EPERM","runtime_permission"],["EROFS","runtime_readonly"],["ETIMEDOUT","probe_timeout"]]) {
    const result=copilotFailure(Object.assign(new Error("private-path-and-token"),{code}),"runtime");
    assert.equal(result.code,expected);
    assert.equal(JSON.stringify(result).includes("private-path-and-token"),false);
  }
  assert.equal(copilotFailure(new Error("unknown private error"),"runtime").code,"runtime_start_failed");
});
