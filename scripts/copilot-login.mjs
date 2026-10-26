import {spawn} from "node:child_process";
import {readFileSync,mkdirSync} from "node:fs";
import path from "node:path";

// Run through npm so the official CLI version follows the pinned SDK runtime.
const sdk=JSON.parse(readFileSync(new URL("../node_modules/@github/copilot-sdk/package.json",import.meta.url),"utf8"));
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error("Run this command with npm run copilot:login.");
const localHome=path.resolve(".copilot-local");
mkdirSync(localHome,{recursive:true});
const child=spawn(process.execPath,[npmCli,"exec","--yes",`--package=@github/copilot@${sdk.copilotCliVersion}`,"--","copilot","login"],{stdio:"inherit",env:{...process.env,COPILOT_HOME:localHome}});
child.on("error",()=>{console.error("Could not start the official Copilot CLI.");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
