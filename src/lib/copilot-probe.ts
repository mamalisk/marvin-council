import {mkdir} from "node:fs/promises";
import path from "node:path";
import {CopilotClient,type CopilotSession} from "@github/copilot-sdk";

export type ProbeResult={runtime:boolean;authenticated:boolean;login?:string;authType?:string;models:{id:string;name:string}[];reply?:string;error?:string};
let busy=false;
export function safeDiagnostic(error:unknown):string {
  const text=error instanceof Error?error.message:"Unknown SDK error";
  return text.replace(/\b(?:gh[opusr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g,"[redacted]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,900);
}
export async function probeCopilot(action:"status"|"chat",model?:string):Promise<ProbeResult>{
  if(busy)throw new Error("A Copilot diagnostic is already running. Wait for it to finish.");
  busy=true;
  let client:CopilotClient|undefined,session:CopilotSession|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const result:ProbeResult={runtime:false,authenticated:false,models:[]};
  try {
    const dir=path.join(process.cwd(),".copilot-local","work");
    await mkdir(dir,{recursive:true});
    // Isolate this app's CLI sign-in and session state from the user's other Copilot sessions.
    client=new CopilotClient({mode:"empty",baseDirectory:path.join(process.cwd(),".copilot-local"),useLoggedInUser:true,workingDirectory:dir,logLevel:"none"});
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
  }catch(error){return {...result,error:safeDiagnostic(error)};}
  finally {
    if(timer)clearTimeout(timer);
    // sendAndWait timeout only stops waiting. Stop the runtime as well, including any in-flight work.
    try{if(client)await client.forceStop();}catch{/* The runtime may already have exited. */}
    busy=false;
  }
}
