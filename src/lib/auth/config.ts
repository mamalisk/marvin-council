export type AuthConfig = {
  origin: string;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  organizations: string[];
  databaseUrl: string;
  webhookSecret?: string;
  secureCookies: boolean;
};

export function demoEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" && (env.AUTH_MODE === "demo" || (!env.AUTH_MODE && !env.GITHUB_CLIENT_ID));
}

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const required = ["APP_ORIGIN", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "AUTH_ENCRYPTION_KEY", "DATABASE_URL", "GITHUB_ALLOWED_ORGS"];
  if (required.some(key => !env[key]?.trim())) throw new Error("GitHub sign-in is not configured. See docs/production-oauth.md.");
  const url = new URL(env.APP_ORIGIN!);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && loopback && url.protocol === "http:"))) {
    throw new Error("APP_ORIGIN must be an HTTPS origin, or local HTTP in development.");
  }
  const key = Buffer.from(env.AUTH_ENCRYPTION_KEY!, "base64");
  if (key.length !== 32 || key.toString("base64") !== env.AUTH_ENCRYPTION_KEY) throw new Error("AUTH_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  const organizations = env.GITHUB_ALLOWED_ORGS!.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!organizations.length || organizations.length > 10 || organizations.some(s => !/^[a-z0-9][a-z0-9-]{0,38}$/.test(s))) throw new Error("Configure between one and ten GitHub organization names.");
  if (env.NODE_ENV === "production" && !env.GITHUB_WEBHOOK_SECRET) throw new Error("GITHUB_WEBHOOK_SECRET is required in production.");
  return {origin: url.origin, clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET!, encryptionKey: key,
    organizations, databaseUrl: env.DATABASE_URL!, webhookSecret: env.GITHUB_WEBHOOK_SECRET, secureCookies: url.protocol === "https:"};
}

export function cookieNames(secure: boolean) {
  return {session: secure ? "__Host-marvin-session" : "marvin-session", flow: secure ? "__Host-marvin-oauth" : "marvin-oauth"};
}

export function cookieOptions(secure: boolean, maxAge: number) {
  return {httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge};
}

export function sameOrigin(origin: string | null, config: Pick<AuthConfig, "origin">) {
  return origin === config.origin;
}
