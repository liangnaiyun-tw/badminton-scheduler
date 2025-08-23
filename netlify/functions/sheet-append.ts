// netlify/functions/sheet-append.ts
import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

/** 取 auth（處理 private_key 的換行） */
function createAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
  const c = JSON.parse(raw);
  const key = String(c.private_key).replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  return new google.auth.JWT({ email: c.client_email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
}

/** 從 RANGE 取出分頁名稱（例如 "比賽成績!A:Z" -> "比賽成績"） */
function getSheetTitle(): string {
  const range = process.env.GOOGLE_SHEETS_RANGE || "比賽成績!A:Z";
  return range.split("!")[0];
}

/** 把欄號(1-based)換成 A1 欄字母（1->A, 2->B, ...）*/
function colLetter(n: number) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const payload = JSON.parse(event.body || "{}");
    if (!payload.id) return { statusCode: 400, body: "id is required" };

    const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
    if (!spreadsheetId) return { statusCode: 500, body: "Missing GOOGLE_SHEETS_SPREADSHEET_ID" };

    const auth = createAuth();
    await auth.authorize();

    const sheets = google.sheets({ version: "v4", auth });
    const sheetTitle = getSheetTitle();
    // 1) 讀 B id 欄），找出相同 id 的列
    const colB = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!B:B`,
      majorDimension: "COLUMNS",
    });
    const list: string[] = colB.data.values?.[0] || [];
    const firstCell = (list[0] || "").toString();
    const startIdx = /^id$/i.test(firstCell) ? 1 : 0; // 若第1列是標題「id」就略過
    let rowNumber = -1;
    for (let i = startIdx; i < list.length; i++) {
      if (String(list[i]).trim() === String(payload.id).trim()) {
        rowNumber = i + 1; // A1 座標列數（1-based）
        break;
      }
    }

    // 2) 準備要寫入的一整列資料（依你的欄位順序）
    const row = [
      new Date().toLocaleString("zh-TW"),
      payload.id ?? "",
      payload.match ?? "",
      payload.court ?? "",
      payload.team1 ?? "",
      payload.team2 ?? "",
      payload.gameIndex ?? "",
      payload.score1 ?? "",
      payload.score2 ?? "",
      payload.status ?? "",
      payload.note ?? "",
    ];

    // 3) 需要時自動補上表頭（如果整張表目前是空的）
    if (list.length === 0) {
      const header = ["時間", "id", "場次", "場地", "隊伍A", "隊伍B", "局數", "A分", "B分", "狀態", "備註"];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetTitle}!A1:${colLetter(header.length)}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      });
    }

    // 4) 有找到同 id → 覆蓋；否則 → 追加
    if (rowNumber > 0) {
      // 覆蓋這一列（從 A 欄到 row 長度對應的最後一欄）
      const endCol = colLetter(row.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetTitle}!A${rowNumber}:${endCol}${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true, mode: "update", row: rowNumber }) };
    } else {
      // 追加到表尾
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTitle}!A:Z`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true, mode: "append" }) };
    }
  } catch (e: any) {
    const code = e?.response?.status || e?.code || 500;
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    return { statusCode: code, body: `Error: ${msg}` };
  }
};
