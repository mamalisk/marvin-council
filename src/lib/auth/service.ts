import type {AuthConfig} from "./config";
import {decrypt, encrypt, hashSecret, pkceChallenge, randomSecret, validSecret} from "./crypto";
import type {Database, Query} from "./database";
import {AuthError, GitHubOAuth, type Identity, type Tokens} from "./github";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;
type UserRow = {github_id: string; login: string; display_name: string; tokens: string | null; verified_at: string; probe_window: string; probe_count: number; expires_at: string};
export type AuthenticatedUser = Identity & {accessToken: string};

export class AuthService {
  constructor(readonly config: AuthConfig, private db: Database, private github = new GitHubOAuth(config)) {}

  async begin() {
    const state = randomSecret(), browser = randomSecret(), verifier = randomSecret();
    await this.db.query("DELETE FROM marvin_oauth_flows WHERE expires_at < $1", [Date.now()]);
    await this.db.query("INSERT INTO marvin_oauth_flows (state_hash,browser_hash,verifier,expires_at) VALUES ($1,$2,$3,$4)",
      [hashSecret(state), hashSecret(browser), encrypt(verifier, this.config.encryptionKey, `oauth:${hashSecret(state)}`), Date.now() + FLOW_SECONDS * 1000]);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({client_id: this.config.clientId, redirect_uri: `${this.config.origin}/api/auth/github/callback`,
      state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256"}).toString();
    return {url: url.toString(), browser};
  }

  async finish(state: string | null, browser: string | undefined, code: string | null, oldSession?: string) {
    if (!validSecret(state) || !validSecret(browser)) throw new AuthError("invalid_flow");
    // Atomic consumption prevents replay across tabs and across app replicas.
    const consumed = await this.db.query<{verifier: string}>(
      "DELETE FROM marvin_oauth_flows WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>$3 RETURNING verifier",
      [hashSecret(state), hashSecret(browser), Date.now()]);
    if (!consumed.rows[0] || !code || code.length > 512) throw new AuthError("invalid_flow");
    const verifier = decrypt<string>(consumed.rows[0].verifier, this.config.encryptionKey, `oauth:${hashSecret(state)}`);
    const tokens = await this.github.exchange(code, verifier);
    let identity: Identity;
    try { identity = await this.github.identity(tokens.accessToken); }
    catch (error) {
      // A denied login must not leave usable credentials in Marvin.
      try { await this.github.revoke(tokens.accessToken); } catch { /* No session is issued; provider authorization can be removed in GitHub settings. */ }
      throw error;
    }
    const session = randomSecret();
    await this.db.transaction(async query => {
      await query("INSERT INTO marvin_auth_users (github_id,login,display_name,tokens,verified_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (github_id) DO UPDATE SET login=EXCLUDED.login,display_name=EXCLUDED.display_name,tokens=EXCLUDED.tokens,verified_at=EXCLUDED.verified_at",
        [identity.id, identity.login, identity.name, encrypt(tokens, this.config.encryptionKey, `github:${identity.id}`), Date.now()]);
      if (validSecret(oldSession)) await query("DELETE FROM marvin_auth_sessions WHERE id_hash=$1", [hashSecret(oldSession)]);
      await query("INSERT INTO marvin_auth_sessions (id_hash,github_id,expires_at) VALUES ($1,$2,$3)", [hashSecret(session), identity.id, Date.now() + SESSION_SECONDS * 1000]);
    });
    return {session, user: identity};
  }

  private async invalidate(query: Query, id: string) {
    await query("UPDATE marvin_auth_users SET tokens=NULL WHERE github_id=$1", [id]);
    await query("DELETE FROM marvin_auth_sessions WHERE github_id=$1", [id]);
  }

  async authenticate(session: string | undefined, forProbe = false): Promise<AuthenticatedUser> {
    if (!validSecret(session)) throw new AuthError("unauthorized");
    const result = await this.db.transaction(async query => {
      // The identity row lock serializes rotating refresh tokens across every session/replica.
      const {rows} = await query<UserRow>("SELECT u.*,s.expires_at FROM marvin_auth_users u JOIN marvin_auth_sessions s ON s.github_id=u.github_id WHERE s.id_hash=$1 AND s.expires_at>$2 FOR UPDATE OF u", [hashSecret(session), Date.now()]);
      const user = rows[0];
      if (!user?.tokens) return new AuthError("unauthorized");
      try {
        if (forProbe) {
          const window = Math.floor(Date.now() / 60000);
          const count = Number(user.probe_window) === window ? user.probe_count + 1 : 1;
          if (count > 6) return new AuthError("rate_limited");
          await query("UPDATE marvin_auth_users SET probe_window=$2,probe_count=$3 WHERE github_id=$1", [user.github_id, window, count]);
        }
        let tokens = decrypt<Tokens>(user.tokens, this.config.encryptionKey, `github:${user.github_id}`);
        let refreshed = false;
        if (tokens.expiresAt && tokens.expiresAt < Date.now() + 60000) {
          if (!tokens.refreshToken || (tokens.refreshExpiresAt && tokens.refreshExpiresAt <= Date.now())) throw new AuthError("unauthorized");
          tokens = await this.github.refresh(tokens.refreshToken);
          await query("UPDATE marvin_auth_users SET tokens=$2 WHERE github_id=$1", [user.github_id, encrypt(tokens, this.config.encryptionKey, `github:${user.github_id}`)]);
          refreshed = true;
        }
        let identity: Identity = {id: user.github_id, login: user.login, name: user.display_name};
        // Recheck membership for each model operation and at most every five minutes for page/session reads.
        if (refreshed || forProbe || Number(user.verified_at) < Date.now() - 300000) {
          identity = await this.github.identity(tokens.accessToken);
          if (identity.id !== user.github_id) throw new AuthError("unauthorized");
          await query("UPDATE marvin_auth_users SET login=$2,display_name=$3,verified_at=$4 WHERE github_id=$1", [identity.id, identity.login, identity.name, Date.now()]);
        }
        return {...identity, accessToken: tokens.accessToken};
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        if (error.code === "unauthorized" || error.code === "forbidden") await this.invalidate(query, user.github_id);
        // Return errors through COMMIT: a successful refresh must survive a later provider outage.
        return error;
      }
    });
    if (result instanceof AuthError) throw result;
    return result;
  }

  async logout(session?: string) {
    if (validSecret(session)) await this.db.query("DELETE FROM marvin_auth_sessions WHERE id_hash=$1", [hashSecret(session)]);
  }

  async disconnect(session?: string) {
    const identity = await this.authenticate(session);
    await this.db.transaction(async query => {
      const {rows} = await query<{tokens: string | null}>("SELECT tokens FROM marvin_auth_users WHERE github_id=$1 FOR UPDATE", [identity.id]);
      if (rows[0]?.tokens) {
        const tokens = decrypt<Tokens>(rows[0].tokens, this.config.encryptionKey, `github:${identity.id}`);
        // On a provider outage, retain credentials so the user can retry revocation.
        await this.github.revoke(tokens.accessToken, true);
      }
      await this.invalidate(query, identity.id);
    });
  }

  async revoked(id: string) {
    await this.db.transaction(async query => {
      await query("SELECT github_id FROM marvin_auth_users WHERE github_id=$1 FOR UPDATE", [id]);
      await this.invalidate(query, id);
    });
  }
}
