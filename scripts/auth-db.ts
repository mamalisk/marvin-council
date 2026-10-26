import {readFile} from "node:fs/promises";
import {Pool} from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000});
  try {
    if (process.argv.includes("--cleanup")) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM marvin_oauth_flows WHERE expires_at<$1", [Date.now()]);
        await client.query("DELETE FROM marvin_auth_sessions WHERE expires_at<$1", [Date.now()]);
        await client.query("UPDATE marvin_auth_users u SET tokens=NULL WHERE verified_at<$1 AND NOT EXISTS (SELECT 1 FROM marvin_auth_sessions s WHERE s.github_id=u.github_id)", [Date.now()-7*86400000]);
        await client.query("COMMIT");
        console.log("Expired sessions and login attempts removed; inactive credentials cleared.");
      } catch (error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
    } else {
      await pool.query(await readFile(new URL("../db/001-auth.sql", import.meta.url), "utf8"));
      console.log("OAuth database schema is ready.");
    }
  } finally {await pool.end();}
}
main().catch(() => {console.error("Database setup failed. Check DATABASE_URL, TLS trust, connectivity, and schema permissions. Credentials have not been logged.");process.exitCode=1;});
