import {NextResponse} from "next/server";
import {AuthError} from "./github";

export const publicAuthErrors: Record<string, string> = {
  unauthorized: "Sign in with GitHub to continue.",
  signin_required: "Sign in with GitHub to open your workspace.",
  forbidden: "Access requires active membership in an allowed organization. Check app installation, organization approval, and SSO authorization.",
  provider: "GitHub could not complete this request. Check corporate network access and retry.",
  invalid_flow: "This sign-in attempt expired or could not be verified. Start again from this page.",
  rate_limited: "Too many Copilot checks. Wait a minute before trying again.",
  unavailable: "GitHub sign-in is unavailable. Check the server configuration and database setup.",
};
export function authFailure(error: unknown) {
  const code = error instanceof AuthError ? error.code : "unavailable";
  return NextResponse.json({error: publicAuthErrors[code], code}, {status: code === "unauthorized" ? 401 : code === "forbidden" ? 403 : code === "invalid_flow" ? 400 : code === "rate_limited" ? 429 : 503, headers: {"Cache-Control": "no-store"}});
}
export function privateResponse(body: unknown) { return NextResponse.json(body, {headers: {"Cache-Control": "no-store", "Vary": "Cookie"}}); }
