import {NextRequest} from "next/server";
import {authService} from "@/lib/auth/server";
import {validWebhook} from "@/lib/auth/crypto";
import {authFailure, privateResponse} from "@/lib/auth/http";
import {AuthError} from "@/lib/auth/github";
import {boundedBody, BodyTooLarge} from "@/lib/bounded-body";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const service = authService();
    if (!service.config.webhookSecret) throw new AuthError("forbidden");
    const body = await boundedBody(request, 100000);
    if (!validWebhook(body, request.headers.get("x-hub-signature-256"), service.config.webhookSecret)) throw new AuthError("forbidden");
    const payload = JSON.parse(body);
    if (request.headers.get("x-github-event") === "github_app_authorization" && payload.action === "revoked" && Number.isSafeInteger(payload.sender?.id)) {
      await service.revoked(String(payload.sender.id));
    }
    return privateResponse({ok: true});
  } catch (error) { return error instanceof BodyTooLarge ? new Response(null, {status: 413}) : authFailure(error); }
}
