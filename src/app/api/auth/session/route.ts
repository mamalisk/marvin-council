import {NextRequest} from "next/server";
import {authService} from "@/lib/auth/server";
import {cookieNames, demoEnabled} from "@/lib/auth/config";
import {authFailure, privateResponse} from "@/lib/auth/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (demoEnabled()) return privateResponse({mode: "demo", user: null});
  try {
    const service = authService();
    const user = await service.authenticate(request.cookies.get(cookieNames(service.config.secureCookies).session)?.value);
    return privateResponse({mode: "github", user: {id: user.id, login: user.login, name: user.name}});
  } catch (error) { return authFailure(error); }
}
