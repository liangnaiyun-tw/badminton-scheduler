import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

// ✅ 服務帳戶認證（修正 private_key 的換行）
function createAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
  const c = JSON.parse(raw);
  const key = String(c.private_key).replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: c.client_email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"], // 讀取就夠了
  });
}

// 解析 range，拿到 分頁名 與 儲存格片段
function parseRange(r: string) {
  if (!r.includes("!")) return { sheetTitle: "", cellPart: r };
  const [left, right] = r.split("!");
  const sheetTitle = left.replace(/^['"]|['"]$/g, ""); // 去掉可能的引號
  return { sheetTitle, cellPart: right };
}

// 安全取值（支援多語表頭 fallback）
const get = (row: any, ...keys: string[]) =>
  keys.map(k => row?.[k]).find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

type Gender = "M" | "F" | "Other";
const parseGender = (v: any): Gender => {
  const s = String(v || "").trim().toLowerCase();
  if (["m","男","male","♂"].includes(s)) return "M";
  if (["f","女","female","♀"].includes(s)) return "F";
  return "Other";
};

// 拆「王小明／李小美」成兩個名字
const splitPair = (s: any) =>
  String(s || "").split(/[\/／]/).map(x => x.trim()).filter(Boolean);

// 主要 handler
export const handler: Handler = async (event) => {
  try {
    const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
    if (!spreadsheetId) return { statusCode: 500, body: "Missing GOOGLE_SHEETS_SPREADSHEET_ID" };

    // range 來源：?range= 覆蓋 > 環境變數 > 預設
    const rangeQ = event.queryStringParameters?.range;
    const range = (rangeQ || process.env.GOOGLE_SHEETS_RANGE || "比賽賽程!A:U").trim();
    const { sheetTitle } = parseRange(range);

    const auth = createAuth();
    await auth.authorize();

    const sheets = google.sheets({ version: "v4", auth });

    // 讀取資料（第一列視為表頭）
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: "ROWS",
    });

    const values: any[][] = res.data.values || [];
    if (values.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, sheet: sheetTitle, matches: [] }),
      };
    }

    const headers = values[0].map(h => String(h).trim());
    const toObj = (arr: any[]) =>
      headers.reduce((o, h, i) => (o[h] = arr[i] ?? "", o), {} as Record<string, any>);

    const rows = values.slice(1).map(toObj);

    // 映射到你的 Match 結構
    const matches = rows.map((r, i) => {
      // 先嘗試英/中欄位；若沒有 A1_Name 但有「隊伍A」，就拆「王小明／李小美」
      const teamAJoin = get(r, "隊伍A", "TeamA", "Team A");
      const teamBJoin = get(r, "隊伍B", "TeamB", "Team B");
      const pairA = splitPair(teamAJoin);
      const pairB = splitPair(teamBJoin);

      const id = String(get(r, "ID","id","比賽ID")) || `m${i + 1}`;

      const courtRaw = get(r, "Court","court","場地");
      const court = courtRaw === "" ? undefined :
        (isNaN(Number(courtRaw)) ? String(courtRaw) : Number(courtRaw));

      // A 組
      const A1_ID = String(get(r, "A1_ID","A1 Id","A1編號")) || "A1";
      const A1_Name = String(get(r, "A1_Name","A1 Name","A1名稱","A1姓名")) || (pairA[0] || "選手A1");
      const A1_G = parseGender(get(r, "A1_Gender","A1 性別"));

      const A2_ID = String(get(r, "A2_ID","A2 Id","A2編號")) || "A2";
      const A2_Name = String(get(r, "A2_Name","A2 Name","A2名稱","A2姓名")) || (pairA[1] || "選手A2");
      const A2_G = parseGender(get(r, "A2_Gender","A2 性別"));

      // B 組
      const B1_ID = String(get(r, "B1_ID","B1 Id","B1編號")) || "B1";
      const B1_Name = String(get(r, "B1_Name","B1 Name","B1名稱","B1姓名")) || (pairB[0] || "選手B1");
      const B1_G = parseGender(get(r, "B1_Gender","B1 性別"));

      const B2_ID = String(get(r, "B2_ID","B2 Id","B2編號")) || "B2";
      const B2_Name = String(get(r, "B2_Name","B2 Name","B2名稱","B2姓名")) || (pairB[1] || "選手B2");
      const B2_G = parseGender(get(r, "B2_Gender","B2 性別"));

      // 裁判
      const Ref_ID   = String(get(r, "Ref_ID","主審ID")) || "R1";
      const Ref_Name = String(get(r, "Ref_Name","主審")) || "主審";

      const LJ1_ID   = String(get(r, "LJ1_ID","線審1ID")) || "L1";
      const LJ1_Name = String(get(r, "LJ1_Name","線審1")) || "線審1";

      const LJ2_ID   = String(get(r, "LJ2_ID","線審2ID")) || "L2";
      const LJ2_Name = String(get(r, "LJ2_Name","線審2")) || "線審2";

      const note     = String(get(r, "Note","備註"));
      const statusRaw = String(get(r, "Status","狀態")).toLowerCase();
      const status = (["pending","live","done"].includes(statusRaw) ? statusRaw : "pending") as
        "pending" | "live" | "done";

      return {
        id,
        court,
        team1: { a: { id: A1_ID, name: A1_Name, gender: A1_G }, b: { id: A2_ID, name: A2_Name, gender: A2_G } },
        team2: { a: { id: B1_ID, name: B1_Name, gender: B1_G }, b: { id: B2_ID, name: B2_Name, gender: B2_G } },
        referee: { id: Ref_ID, name: Ref_Name, gender: "Other" },
        lj1:     { id: LJ1_ID, name: LJ1_Name, gender: "Other" },
        lj2:     { id: LJ2_ID, name: LJ2_Name, gender: "Other" },
        status,
        scores: [],
        note,
      };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, sheet: sheetTitle, count: matches.length, matches }, null, 2),
    };
  } catch (e: any) {
    const code = e?.response?.status || e?.code || 500;
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    return { statusCode: code, body: `sheet-read error: ${msg}` };
  }
};
