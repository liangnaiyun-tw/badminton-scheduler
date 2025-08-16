import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

function mask(s?: string) {
  if (!s) return "";
  return s.replace(/(^.{2}).+(.{10}@)/, "$1***$2"); // 避免把整個 email 印出
}

export const handler: Handler = async () => {
  try {
    // 1) 讀 ENV
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!raw) {
      return { statusCode: 500, body: "ENV GOOGLE_SERVICE_ACCOUNT_JSON missing" };
    }

    // 2) parse JSON & 修正 private_key 換行
    let creds: any;
    try { creds = JSON.parse(raw); } 
    catch { return { statusCode: 500, body: "ENV GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON" }; }

    const privateKey = String(creds.private_key)
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n");

    const auth = new google.auth.JWT(
      creds.client_email,
      undefined,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets"]
    );

    // 3) 先嘗試拿 access token（若失敗會丟錯）
    const token = await auth.getAccessToken();
    const tokenOk = !!token && String(token).length > 20;

    // 4) 可選：試試能否讀到 spreadsheet（沒分享會 403）
    let sheetOk = false, sheetErr = "";
    if (spreadsheetId) {
      try {
        const sheets = google.sheets({ version: "v4", auth });
        await sheets.spreadsheets.get({ spreadsheetId });
        sheetOk = true;
      } catch (e: any) {
        sheetErr = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e?.message || String(e);
      }
    }

    const result = {
      envOk: true,
      clientEmail: mask(creds.client_email),
      tokenOk,
      spreadsheetIdSet: !!spreadsheetId,
      sheetOk,
      sheetErr: sheetErr || undefined,
    };

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result, null, 2) };
  } catch (e: any) {
    return { statusCode: 500, body: `Selftest error: ${e?.message || e}` };
  }
};
