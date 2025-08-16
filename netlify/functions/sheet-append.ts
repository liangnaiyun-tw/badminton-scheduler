// netlify/functions/sheet-append.ts
import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

const getAuth = () => {
  const keyJSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJSON) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const creds = JSON.parse(keyJSON);
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  return new google.auth.JWT(creds.client_email, undefined, creds.private_key, scopes);
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const payload = JSON.parse(event.body || "{}");
    // 依你的前端欄位組裝一列資料（可自行調整欄位順序/名稱）
    const row = [
      new Date().toISOString(),
      payload.matchId || "",
      payload.court || "",
      payload.team1 || "",
      payload.team2 || "",
      payload.gameIndex ?? "",
      payload.score1 ?? "",
      payload.score2 ?? "",
      payload.status || "",
      payload.note || "",
    ];

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
    const range = process.env.GOOGLE_SHEETS_RANGE || "比賽成績!A:Z";

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (e: any) {
    console.error("sheet-append error", e);
    return { statusCode: 500, body: `Error: ${e.message}` };
  }
};
