import {probeCopilot} from "../src/lib/copilot-probe";

async function main(){
  const modelIndex=process.argv.indexOf("--model");
  const model=modelIndex>=0?process.argv[modelIndex+1]:undefined;
  const chat=process.argv.includes("--chat");
  if(chat&&!model){console.error("Use --chat --model <model-id> after checking available models.");process.exitCode=1;return;}
  const result=await probeCopilot(chat?"chat":"status",model);
  console.log(JSON.stringify(result,null,2));
  if(result.error||!result.authenticated)process.exitCode=1;
}
main().catch(()=>{console.error("The local SDK diagnostic could not start.");process.exitCode=1;});
