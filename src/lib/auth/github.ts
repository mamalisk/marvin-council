import type {AuthConfig} from "./config";

export class AuthError extends Error {
  constructor(public code: "unauthorized" | "forbidden" | "provider" | "enterprise_check_failed" | "invalid_flow" | "rate_limited") { super(code); }
}
export type Identity = {id: string; login: string; name: string};
export type Tokens = {accessToken: string; refreshToken?: string; expiresAt?: number; refreshExpiresAt?: number};
type TokenResponse = {access_token?: unknown; token_type?: unknown; refresh_token?: unknown; expires_in?: unknown; refresh_token_expires_in?: unknown; error?: unknown};

// Classify upstream errors without recording their messages, paths or user data.
function enterpriseGraphqlDiagnostic(errors: unknown): string {
  if (!Array.isArray(errors)) return "invalid_response";
  const kinds = errors.flatMap(error => error && typeof error === "object"
    ? [error.type, error.extensions?.code] : []);
  if (kinds.some(kind => ["FORBIDDEN", "INSUFFICIENT_SCOPES", "UNAUTHORIZED"].includes(kind))) return "graphql_access_denied";
  if (kinds.some(kind => ["undefinedField", "argumentNotAccepted", "GRAPHQL_VALIDATION_FAILED"].includes(kind))) return "graphql_query_unsupported";
  if (kinds.includes("RATE_LIMITED")) return "rate_limited";
  return "graphql_error";
}

export class GitHubOAuth {
  constructor(private config: AuthConfig, private request: typeof fetch = fetch) {}

  private async call(url: string, init: RequestInit) {
    const timeout = AbortSignal.timeout(10000);
    try { return await this.request(url, {...init, cache: "no-store", redirect: "error", signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout}); }
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

  private async enterpriseMember(token: string, identity: Identity): Promise<boolean> {
    if (!this.config.enterprises.length) return false;
    const query = `query MarvinEnterpriseMembership($after: String) {
      viewer {
        databaseId
        enterprises(first: 100, after: $after, membershipType: ALL) {
          nodes { slug }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`;
    // Bound both total time and pagination. Never follow provider-supplied URLs.
    const deadline = AbortSignal.timeout(10000);
    const cursors = new Set<string>();
    let after: string | null = null;
    let diagnostic = "network_error";
    let httpStatus: number | undefined;
    try {
      for (let page = 0; page < 5; page++) {
        deadline.throwIfAborted();
        diagnostic = "network_error";
        httpStatus = undefined;
        const response = await this.call("https://api.github.com/graphql", {
          method: "POST", signal: deadline,
          headers: {Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json"},
          body: JSON.stringify({query, variables: {after}}),
        });
        httpStatus = response.status;
        if (response.status === 401) throw new AuthError("unauthorized");
        if (!response.ok) {
          diagnostic = response.status === 403 ? "http_access_denied" : response.status === 429 ? "rate_limited" : "http_error";
          throw new AuthError("enterprise_check_failed");
        }
        diagnostic = "invalid_json";
        const body = await response.json();
        // GraphQL may return HTTP 200 with errors and partial data. Neither is proof of access.
        diagnostic = "invalid_response";
        if (!body || (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length))) {
          diagnostic = body ? enterpriseGraphqlDiagnostic(body.errors) : "invalid_response";
          throw new AuthError("enterprise_check_failed");
        }
        const viewer = body.data?.viewer;
        const connection = viewer?.enterprises;
        if (!Number.isSafeInteger(viewer?.databaseId) || String(viewer.databaseId) !== identity.id) {
          diagnostic = "identity_mismatch";
          throw new AuthError("enterprise_check_failed");
        }
        if (connection === null || connection === undefined) {
          diagnostic = "membership_unavailable";
          throw new AuthError("enterprise_check_failed");
        }
        if (!Array.isArray(connection.nodes) || connection.nodes.length > 100 ||
            !connection.nodes.every((node: unknown) => node !== null && typeof node === "object" && "slug" in node && typeof node.slug === "string" && /^[a-z0-9][a-z0-9-]{0,38}$/i.test(node.slug)) ||
            typeof connection.pageInfo?.hasNextPage !== "boolean") throw new AuthError("enterprise_check_failed");
        if (connection.nodes.some((node: {slug: string}) => this.config.enterprises.includes(node.slug.toLowerCase()))) return true;
        if (!connection.pageInfo.hasNextPage) return false;
        const cursor = connection.pageInfo.endCursor;
        diagnostic = "invalid_pagination";
        if (typeof cursor !== "string" || !cursor || cursor.length > 2048 || cursors.has(cursor)) throw new AuthError("enterprise_check_failed");
        cursors.add(cursor);
        after = cursor;
      }
      diagnostic = "pagination_limit";
      throw new AuthError("enterprise_check_failed");
    } catch (error) {
      if (error instanceof AuthError && error.code === "unauthorized") throw error;
      // Do not expose GraphQL messages, query variables or provider credentials.
      console.warn("marvin.auth.enterprise", {diagnostic: deadline.aborted ? "timeout" : diagnostic, ...(httpStatus === undefined ? {} : {httpStatus})});
      throw new AuthError("enterprise_check_failed");
    }
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
    if (await this.enterpriseMember(token, identity)) return identity;
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
