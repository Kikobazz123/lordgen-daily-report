import { defineConfig } from "@trigger.dev/sdk";

// Project ref from https://cloud.trigger.dev (project settings page). Not a secret —
// it's a public project identifier, not a credential, which is why it's a literal here
// rather than read from .env (trigger.config.ts is evaluated before .env is loaded).
export default defineConfig({
  project: "proj_sxgdbovpibczzlqwdqxp",
  dirs: ["./src/trigger"],
  maxDuration: 300, // 5 min ceiling per task run — generous for API calls + email send
  retries: {
    // true, not the scaffold default of false — this machine's network has shown a couple of
    // transient "fetch failed" blips during testing (unrelated to the code), so local runs
    // should retry instead of failing hard on the first hiccup, same as production will.
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
