import {NextRequest,NextResponse} from "next/server";
import {probeCopilot,safeDiagnostic} from "@/lib/copilot-probe";
import {allowLocalDiagnostic} from "@/lib/local-request";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  if(!allowLocalDiagnostic(request.url,request.headers.get("origin"),process.env.NODE_ENV==="production",request.headers.get("host")))return NextResponse.json({error:"This SDK diagnostic is available only from the local development app."},{status:403});
  if(Number(request.headers.get("content-length")||0)>1024)return NextResponse.json({error:"Request too large."},{status:413});
  try{
    const raw=await request.text();
    if(raw.length>1024)return NextResponse.json({error:"Request too large."},{status:413});
    const body=JSON.parse(raw);
    if(!["status","chat"].includes(body.action)|| (body.model!==undefined&&(typeof body.model!=="string"||body.model.length>150)))return NextResponse.json({error:"Invalid diagnostic request."},{status:400});
    return NextResponse.json(await probeCopilot(body.action,body.model),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:safeDiagnostic(error)},{status:400});}
}
