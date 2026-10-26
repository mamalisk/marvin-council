import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {authConfig, cookieNames, demoEnabled} from "./config";
import {postgres} from "./database";
import {AuthError} from "./github";
import {AuthService} from "./service";

export function authService() {
  const config = authConfig();
  return new AuthService(config, postgres(config.databaseUrl));
}

export async function requireWorkspaceUser() {
  const cookieStore = await cookies();
  if (demoEnabled()) return;
  let destination = "/?auth_error=signin_required";
  try {
    const service = authService();
    await service.authenticate(cookieStore.get(cookieNames(service.config.secureCookies).session)?.value);
    return;
  } catch (error) {
    if (!(error instanceof AuthError) || error.code === "provider") destination = "/?auth_error=unavailable";
    else if (error.code === "forbidden") destination = "/?auth_error=forbidden";
  }
  redirect(destination);
}
