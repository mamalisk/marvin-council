import {readFileSync, statSync} from "node:fs";
import path from "node:path";

// Next/Vercel ship the traced files, not the entire installed node_modules tree.
// Fail the build if dynamically resolved SDK assets would be left behind.
const platform = process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime ? "linuxmusl" : process.platform;
const target = `${platform}-${process.arch}`;
const root = path.resolve("node_modules", "@github", `copilot-sdk-${target}`);
const required = ["package.json", `prebuilds/${target}/runtime.node`, `prebuilds/${target}/copilot-runtime${process.platform === "win32" ? ".exe" : ""}`];
try {
  for (const route of ["copilot", "copilot/check"]) {
    const manifest = path.resolve(process.env.NEXT_DIST_DIR || ".next", `server/app/api/${route}/route.js.nft.json`);
    const files = new Set(JSON.parse(readFileSync(manifest, "utf8")).files.map(file => path.resolve(path.dirname(manifest), file)));
    for (const file of required) {
      const absolute = path.join(root, file);
      if (!files.has(absolute) || statSync(absolute).size === 0) throw new Error("Runtime asset missing");
    }
  }
  console.log(`Copilot deployment trace verified: ${target} runtime included.`);
} catch {
  console.error("Copilot deployment bundle is incomplete. Install optional npm dependencies and check outputFileTracingIncludes for the SDK platform package.");
  process.exitCode = 1;
}
