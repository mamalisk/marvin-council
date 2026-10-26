import {mkdir} from "node:fs/promises";
import path from "node:path";
import {CopilotClient,type CopilotSession} from "@github/copilot-sdk";
import {createOAuthRuntime} from "./copilot-runtime";

export type ProbeResult={runtime:boolean;authenticated:boolean;login?:string;authType?:string;models:{id:string;name:string}[];reply?:string;error?:string};
const active = new Set<string>();
export function safeDiagnostic(error:unknown):string {
  const text=error instanceof Error?error.message:"Unknown SDK error";
  return text.replace(/\b(?:gh[opusr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g,"[redacted]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,900);
}
export async function probeCopilot(action:"status"|"chat",model?:string,owner?:{id:string;accessToken:string}):Promise<ProbeResult>{
  const key = owner?.id || "local-cli";
  if(active.has(key) || active.size >= 8)throw new Error("A Copilot diagnostic is already running or capacity is full. Retry shortly.");
  active.add(key);
  let isolated:Awaited<ReturnType<typeof createOAuthRuntime>>|undefined;
  let client:CopilotClient|undefined,session:CopilotSession|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const result:ProbeResult={runtime:false,authenticated:false,models:[]};
  try {
    if(owner){
      isolated=await createOAuthRuntime(owner.accessToken);
      client=new CopilotClient(isolated.options);
    } else {
      const dir=path.join(process.cwd(),".copilot-local","work");
      await mkdir(dir,{recursive:true});
      client=new CopilotClient({mode:"empty",baseDirectory:path.join(process.cwd(),".copilot-local"),useLoggedInUser:true,workingDirectory:dir,logLevel:"none"});
    }
    const work=async()=>{
      await client!.start();
      result.runtime=true;
      const auth=await client!.getAuthStatus();
      result.authenticated=auth.isAuthenticated;
      result.login=auth.login;
      result.authType=auth.authType;
      if(!auth.isAuthenticated)return result;
      const models=await client!.listModels();
      result.models=models.filter(m=>m.policy?.state!=="disabled").map(m=>({id:m.id,name:m.name}));
      if(action==="chat"){
        if(!model||!result.models.some(m=>m.id===model))throw new Error("Select an available model after checking access.");
        session=await client!.createSession({model,availableTools:[],excludedTools:["builtin:*","mcp:*","custom:*"],onPermissionRequest:()=>({kind:"reject",feedback:"This connection test does not permit tools."}),systemMessage:{mode:"replace",content:"You are testing connectivity. Reply briefly to the user's greeting. Do not invoke tools."}});
        const response=await session.sendAndWait({prompt:"Reply with exactly: Marvin Council is connected."},25000);
        if(!response?.data.content)throw new Error("The provider returned no chat text. Authentication alone does not confirm chat access.");
        result.reply=response.data.content;
      }
      return result;
    };
    return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Copilot diagnostic timed out. Check sign-in, network access, and organization policy.")),40000);})]);
  }catch(error){return {...result,error:owner?"Copilot could not complete the check. Verify entitlement, organization policy, model availability, and network access.":safeDiagnostic(error)};}
  finally {
    if(timer)clearTimeout(timer);
    // sendAndWait timeout only stops waiting. Stop the runtime as well, including any in-flight work.
    try{if(client)await client.forceStop();}catch{/* The runtime may already have exited. */}
    try{await isolated?.dispose();}catch{/* Do not expose runtime filesystem paths. */}
    active.delete(key);
  }
}
