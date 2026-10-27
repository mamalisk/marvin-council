import {NextRequest} from "next/server";
import {authService} from "@/lib/auth/server";
import {cookieNames, sameOrigin} from "@/lib/auth/config";
import {authFailure, privateResponse} from "@/lib/auth/http";
import {AuthError} from "@/lib/auth/github";
import {probeCopilot} from "@/lib/copilot-probe";
import {boundedBody, BodyTooLarge} from "@/lib/bounded-body";

export const runtime = "nodejs";
// Allow the bounded 40-second probe plus authentication and runtime cleanup.
export const maxDuration = 90;
export async function POST(request: NextRequest) {
  try {
    const service = authService();
    if (!sameOrigin(request.headers.get("origin"), service.config)) throw new AuthError("forbidden");
    const raw = await boundedBody(request, 1024);
    let body;
    try { body = JSON.parse(raw); } catch { return new Response(null, {status: 400}); }
    if (!body || !["status", "chat"].includes(body.action) || (body.model !== undefined && (typeof body.model !== "string" || body.model.length > 150))) return new Response(null, {status: 400});
    const owner = await service.authenticate(request.cookies.get(cookieNames(service.config.secureCookies).session)?.value, true);
    // Never accept an owner ID or token from the request body.
    return privateResponse(await probeCopilot(body.action, body.model, owner));
  } catch (error) { return error instanceof BodyTooLarge ? new Response(null, {status: 413}) : authFailure(error); }
}
