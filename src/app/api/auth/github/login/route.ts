import {NextResponse} from "next/server";
import {authService} from "@/lib/auth/server";
import {cookieNames, cookieOptions} from "@/lib/auth/config";
import {FLOW_SECONDS} from "@/lib/auth/service";
import {authFailure} from "@/lib/auth/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const service = authService();
    const flow = await service.begin();
    const response = NextResponse.redirect(flow.url, 302);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(cookieNames(service.config.secureCookies).flow, flow.browser, cookieOptions(service.config.secureCookies, FLOW_SECONDS));
    return response;
  } catch (error) { return authFailure(error); }
}
