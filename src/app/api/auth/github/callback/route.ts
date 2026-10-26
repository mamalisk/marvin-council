import {NextRequest, NextResponse} from "next/server";
import {authService} from "@/lib/auth/server";
import {cookieNames, cookieOptions} from "@/lib/auth/config";
import {SESSION_SECONDS} from "@/lib/auth/service";
import {AuthError} from "@/lib/auth/github";
import {authFailure} from "@/lib/auth/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let service;
  try { service = authService(); } catch (error) { return authFailure(error); }
  const secure = service.config.secureCookies, names = cookieNames(secure);
  let response: NextResponse;
  try {
    const result = await service.finish(request.nextUrl.searchParams.get("state"), request.cookies.get(names.flow)?.value,
      request.nextUrl.searchParams.get("code"), request.cookies.get(names.session)?.value);
    response = NextResponse.redirect(`${service.config.origin}/connection`, 303);
    response.cookies.set(names.session, result.session, cookieOptions(secure, SESSION_SECONDS));
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "unavailable";
    response = NextResponse.redirect(`${service.config.origin}/?auth_error=${code}`, 303);
  }
  response.cookies.set(names.flow, "", cookieOptions(secure, 0));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
