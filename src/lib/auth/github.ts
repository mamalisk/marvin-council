import type {AuthConfig} from "./config";

export class AuthError extends Error {
  constructor(public code: "unauthorized" | "forbidden" | "provider" | "invalid_flow" | "rate_limited") { super(code); }
}
export type Identity = {id: string; login: string; name: string};
export type Tokens = {accessToken: string; refreshToken?: string; expiresAt?: number; refreshExpiresAt?: number};
type TokenResponse = {access_token?: unknown; token_type?: unknown; refresh_token?: unknown; expires_in?: unknown; refresh_token_expires_in?: unknown; error?: unknown};

export class GitHubOAuth {
  constructor(private config: AuthConfig, private request: typeof fetch = fetch) {}

  private async call(url: string, init: RequestInit) {
    try { return await this.request(url, {...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000)}); }
    catch { throw new AuthError("provider"); }
  }

  private async token(params: Record<string, string>, refreshing = false): Promise<Tokens> {
    const response = await this.call("https://github.com/login/oauth/access_token", {
      method: "POST", headers: {Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({client_id: this.config.clientId, client_secret: this.config.clientSecret, ...params}),
    });
    if (!response.ok) throw new AuthError("provider");
    const body = await response.json() as TokenResponse;
    if (body.error) throw new AuthError(refreshing && body.error === "bad_refresh_token" ? "unauthorized" : "provider");
    if (typeof body.access_token !== "string" || !body.access_token || body.token_type !== "bearer") throw new AuthError("provider");
    const expiry = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Date.now() + value * 1000 : undefined;
    const expiresAt = expiry(body.expires_in);
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : undefined;
    if (body.expires_in !== undefined && (!expiresAt || !refreshToken)) throw new AuthError("provider");
    return {accessToken: body.access_token, refreshToken, expiresAt, refreshExpiresAt: expiry(body.refresh_token_expires_in)};
  }

  exchange(code: string, verifier: string) {
    return this.token({code, code_verifier: verifier, redirect_uri: `${this.config.origin}/api/auth/github/callback`});
  }
  refresh(token: string) { return this.token({grant_type: "refresh_token", refresh_token: token}, true); }

  private async api(path: string, token: string) {
    return this.call(`https://api.github.com${path}`, {headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}});
  }

  async identity(token: string): Promise<Identity> {
    const response = await this.api("/user", token);
    if (response.status === 401) throw new AuthError("unauthorized");
    if (!response.ok) throw new AuthError("provider");
    const user = await response.json();
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== "string") throw new AuthError("provider");
    const identity = {id: String(user.id), login: user.login, name: typeof user.name === "string" && user.name ? user.name : user.login};
    // Only trust the identity returned by GitHub for this user's token.
    if (this.config.users.includes(user.login.toLowerCase())) return identity;
    for (const org of this.config.organizations) {
      const membership = await this.api(`/user/memberships/orgs/${encodeURIComponent(org)}`, token);
      if (membership.status === 401) throw new AuthError("unauthorized");
      if (membership.ok && (await membership.json()).state === "active") return identity;
      if (![200, 403, 404].includes(membership.status)) throw new AuthError("provider");
    }
    throw new AuthError("forbidden");
  }

  async revoke(token: string, grant = false) {
    const response = await this.call(`https://api.github.com/applications/${encodeURIComponent(this.config.clientId)}/${grant ? "grant" : "token"}`, {
      method: "DELETE", headers: {Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`},
      body: JSON.stringify({access_token: token}),
    });
    if (![204, 404].includes(response.status)) throw new AuthError("provider");
  }
}
