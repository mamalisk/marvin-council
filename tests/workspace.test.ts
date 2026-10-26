import test from "node:test";
import assert from "node:assert/strict";
import {assignDocuments,canLaunch,exportDefinition,freshDraft,importDefinition,initialWorkspace,invalidateApprovals,newCouncil,sampleGrow,starterCatalog} from "../src/lib/workspace";
import {allowLocalDiagnostic} from "../src/lib/local-request";

test("agent context respects assignments without removing human-visible documents",()=>{
  const council=initialWorkspace().councils[0];
  assert.deepEqual(assignDocuments(council.documents,"maya").map(d=>d.id),["brief","architecture"]);
  assert.deepEqual(assignDocuments(council.documents,"theo").map(d=>d.id),["brief"]);
  assert.equal(council.documents.length,3);
});
test("launched councils snapshot their brief and agent instructions",()=>{
  const draft={...freshDraft(),name:"Review",grow:structuredClone(sampleGrow)};
  const catalog=structuredClone(starterCatalog);
  const council=newCouncil(draft,catalog,"test");
  draft.grow[0]="Changed";catalog[0].instructions="Changed";
  assert.equal(council.grow[0],sampleGrow[0]);
  assert.notEqual(council.agents[0].instructions,"Changed");
});
test("launch requires scope, specialists, and bounded processing",()=>{
  const draft={...freshDraft(),name:"Review",grow:structuredClone(sampleGrow)};
  assert.equal(canLaunch(draft),true);
  for(const patch of [{name:" "},{grow:["","","",""] as typeof draft.grow},{agentIds:[]},{tokenLimit:0},{minutes:61},{minutes:0},{quorum:0}])assert.equal(canLaunch({...draft,...patch}),false);
});
test("revisions clear approvals without resetting session budgets",()=>{
  const council=initialWorkspace().councils[1];
  const revised=invalidateApprovals(council);
  assert.deepEqual(revised.approvals,[]);
  assert.equal(revised.revision,council.revision+1);
  assert.equal(revised.tokenLimit,council.tokenLimit);
  assert.equal(revised.minutes,council.minutes);
  assert.equal(council.approvals.length,1);
});
test("Markdown definitions round-trip instructions, traits, and skills",()=>{
  const original=starterCatalog[0];
  const imported=importDefinition(exportDefinition(original),"maya.md","Traits");
  for(const key of ["name","kind","role","instructions","traits","skills"] as const)assert.deepEqual(imported[key],original[key]);
  assert.notEqual(imported.id,original.id);
});
test("local SDK endpoint rejects remote origins and production access",()=>{
  assert.equal(allowLocalDiagnostic("http://localhost:3000/api/copilot/check","http://127.0.0.1:3000",false,"127.0.0.1:3000"),true);
  assert.equal(allowLocalDiagnostic("http://localhost:3000/api/copilot/check","https://example.com",false,"example.com"),false);
  assert.equal(allowLocalDiagnostic("http://localhost:3000/api/copilot/check","http://127.0.0.1:3000",false,"example.com@127.0.0.1:3000"),false);
  assert.equal(allowLocalDiagnostic("http://127.0.0.1:3000/api/copilot/check","http://127.0.0.1:3000",false),true);
  for(const [url,origin,production] of [
    ["http://127.0.0.1:3000/api/copilot/check","https://example.com",false],
    ["http://127.0.0.1:3000/api/copilot/check",null,false],
    ["https://marvin.example/api/copilot/check","https://marvin.example",false],
    ["http://127.0.0.1:3000/api/copilot/check","http://127.0.0.1:3000",true],
  ] as const)assert.equal(allowLocalDiagnostic(url,origin,production),false);
});
