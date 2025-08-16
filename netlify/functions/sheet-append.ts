// netlify/functions/sheet-append.ts
import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

function createAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  const email = creds.client_email as string;
  const key = String(creds.private_key || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const payload = JSON.parse(event.body || "{}");
    const auth = createAuth();
    await auth.authorize(); // 這步可以及早發現 key 問題

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
    const range = process.env.GOOGLE_SHEETS_RANGE || "比賽成績!A:Z";

    // 可選：先確認權限（沒分享會直接 403）
    await sheets.spreadsheets.get({ spreadsheetId });

    const row = [
      new Date().toLocaleString("zh-TW"),
      payload.matchId ?? "",
      payload.court ?? "",
      payload.team1 ?? "",
      payload.team2 ?? "",
      payload.gameIndex ?? "",
      payload.score1 ?? "",
      payload.score2 ?? "",
      payload.status ?? "",
      payload.note ?? "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    return { statusCode: e?.response?.status || 500, body: `Error: ${msg}` };
  }
};
