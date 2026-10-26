import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

export function isolatedRuntimeEnvironment(directory: string, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const allowed = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
  const result: Record<string, string> = {};
  for (const key of allowed) if (env[key]) result[key] = env[key]!;
  return {...result, HOME: directory, USERPROFILE: directory, COPILOT_HOME: directory, COPILOT_DISABLE_KEYTAR: "1"};
}

export async function createOAuthRuntime(accessToken: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "marvin-oauth-"));
  return {
    options: {mode: "empty" as const, baseDirectory: directory, workingDirectory: directory,
      gitHubToken: accessToken, useLoggedInUser: false, logLevel: "none" as const, env: isolatedRuntimeEnvironment(directory)},
    async dispose() {
      if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith("marvin-oauth-")) throw new Error("Unexpected runtime directory");
      await rm(directory, {recursive: true, force: true, maxRetries: 3});
    },
  };
}
