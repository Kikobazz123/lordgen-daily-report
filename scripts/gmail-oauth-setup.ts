/**
 * LOCAL ONLY — one-time setup, not a deployed Trigger.dev task.
 *
 * Mints a Gmail refresh token for the `gmail.send` scope, using
 * GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET from .env (an OAuth Desktop-app
 * client — reuse the one already authorized in
 * C:\Users\USER\Newsletter Demo\credentials.json, or create a new one at
 * https://console.cloud.google.com > APIs & Services > Credentials).
 *
 * Run: `npm run gmail-oauth-setup`
 * Opens a browser for consent, then prints the refresh token to paste into
 * .env as GMAIL_REFRESH_TOKEN. Never commits or logs the token anywhere else.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const PORT = 53_682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId) throw new Error("GMAIL_CLIENT_ID is not set in .env");
if (!clientSecret) throw new Error("GMAIL_CLIENT_SECRET is not set in .env");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.send");
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error ?? "no code returned"}`);
    console.error("Authorization failed:", error ?? "no code returned");
    server.close();
    process.exit(1);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code!,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.refresh_token) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed — check the terminal.");
    console.error("Token exchange failed:", tokenData);
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { "Content-Type": "text/plain" }).end("Success — you can close this tab and return to the terminal.");

  console.log("\nGmail refresh token minted successfully.");
  console.log("Paste this into .env as GMAIL_REFRESH_TOKEN:\n");
  console.log(tokenData.refresh_token);
  console.log("\n(This value is only printed here — it is not written to any file automatically.)");

  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Opening browser for Gmail consent (sign in as GMAIL_SENDER_EMAIL if prompted)...`);
  console.log(`If it doesn't open automatically, visit:\n${authUrl.toString()}\n`);
  const opener = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${opener} "${authUrl.toString()}"`);
});
