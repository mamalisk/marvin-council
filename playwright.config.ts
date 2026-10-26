import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir:"./tests/e2e",
  fullyParallel:false,
  workers:1,
  timeout:60000,
  use:{baseURL:"http://127.0.0.1:3002",channel:"chrome",viewport:{width:1440,height:1000},trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:{command:"npm run dev -- --port 3002",url:"http://127.0.0.1:3002",env:{NEXT_DIST_DIR:".next-e2e",AUTH_MODE:"demo"},reuseExistingServer:false,timeout:120000},
});
