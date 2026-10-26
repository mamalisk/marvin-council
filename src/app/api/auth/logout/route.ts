import {NextRequest} from "next/server";
import {authService} from "@/lib/auth/server";
import {cookieNames, cookieOptions, sameOrigin} from "@/lib/auth/config";
import {authFailure, privateResponse} from "@/lib/auth/http";
import {AuthError} from "@/lib/auth/github";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const service = authService();
    if (!sameOrigin(request.headers.get("origin"), service.config)) throw new AuthError("forbidden");
    const names = cookieNames(service.config.secureCookies);
    await service.logout(request.cookies.get(names.session)?.value);
    const response = privateResponse({ok: true});
    response.cookies.set(names.session, "", cookieOptions(service.config.secureCookies, 0));
    return response;
  } catch (error) { return authFailure(error); }
}
