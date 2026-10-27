export type ProbeStage = "runtime" | "authentication" | "models" | "chat";

// Map failures to fixed messages. Never return or log provider stderr, paths,
// credentials, or arbitrary error messages from the SDK in hosted OAuth mode.
export function copilotFailure(error: unknown, stage: ProbeStage) {
  const message = error instanceof Error ? error.message : "";
  const systemCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (systemCode === "ETIMEDOUT" || message === "Marvin Copilot diagnostic timed out") {
    return {code: "probe_timeout", error: `Copilot timed out during ${stage}. Check runtime startup and network access.`};
  }
  if (stage === "runtime") {
    if (systemCode === "ENOENT" || /^Could not resolve @github\/copilot-/.test(message) || /missing required Copilot CLI runtime files|Copilot CLI not found/.test(message)) {
      return {code: "runtime_missing", error: "The Copilot runtime is missing from this deployment. Rebuild with the SDK platform package included and optional npm dependencies enabled."};
    }
    if (systemCode === "EACCES" || systemCode === "EPERM") {
      return {code: "runtime_permission", error: "The host could not execute or access the Copilot runtime. Check executable permissions and hosting restrictions."};
    }
    if (systemCode === "EROFS") {
      return {code: "runtime_readonly", error: "The Copilot runtime tried to write to a read-only directory. Check that its working and home directories use temporary storage."};
    }
    return {code: "runtime_start_failed", error: "The Copilot runtime could not start. GitHub web sign-in succeeded, but Copilot authentication has not been checked. Verify the bundled runtime, host compatibility, and network access."};
  }
  if (stage === "authentication") return {code: "authentication_check_failed", error: "The runtime started but could not check Copilot authentication. Check the account's Copilot access, GitHub App policy, and network connectivity."};
  if (stage === "models") return {code: "model_discovery_failed", error: "Copilot authentication succeeded, but model discovery failed. Check entitlement, enabled models, organization policy, and network access."};
  return {code: "chat_failed", error: "Copilot could not complete the test greeting. Check model availability, usage allowance, and network access."};
}
