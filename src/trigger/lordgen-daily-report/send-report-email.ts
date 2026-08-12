import { task } from "@trigger.dev/sdk";

export interface SendReportEmailInput {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface SendReportEmailOutput {
  sent: true;
  gmailMessageId: string;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId) throw new Error("GMAIL_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("GMAIL_CLIENT_SECRET is not set");
  if (!refreshToken) throw new Error("GMAIL_REFRESH_TOKEN is not set");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Gmail token refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

function buildMimeMessage(from: string, to: string, subject: string, textBody: string, htmlBody: string): string {
  const boundary = "lordgen-daily-report-boundary";
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const sendReportEmail = task({
  id: "send-report-email",
  run: async (input: SendReportEmailInput): Promise<SendReportEmailOutput> => {
    const senderEmail = process.env.GMAIL_SENDER_EMAIL;
    const recipientEmail = process.env.REPORT_RECIPIENT_EMAIL;
    if (!senderEmail) throw new Error("GMAIL_SENDER_EMAIL is not set");
    if (!recipientEmail) throw new Error("REPORT_RECIPIENT_EMAIL is not set");

    const accessToken = await getAccessToken();
    const raw = buildMimeMessage(senderEmail, recipientEmail, input.subject, input.textBody, input.htmlBody);

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return { sent: true, gmailMessageId: data.id };
  },
});
