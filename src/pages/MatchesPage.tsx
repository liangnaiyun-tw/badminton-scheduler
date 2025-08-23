import React, { useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Check,
  Users,
  Gavel,
  Binoculars,
  Mars,
  Venus,
  UserRound,
  Trophy,
} from "lucide-react";
import * as XLSX from "xlsx";

/* ========== 型別定義 ========== */
export type Gender = "M" | "F" | "Other";
export interface Player { id: string; name: string; gender: Gender; level?: number }
export interface Team { a: Player; b: Player }
export interface GameScore { team1: number; team2: number }
export type MatchStatus = "pending" | "live" | "done";
export interface Match {
  id: string;
  court?: string | number;
  team1: Team;
  team2: Team;
  referee: Player;
  lj1: Player;
  lj2: Player;
  status?: MatchStatus;
  scores?: GameScore[];
  note?: string;
}

/* ========== 小工具 ========== */
const sumScores = (scores: GameScore[] | undefined) => {
  if (!scores?.length) return { t1: 0, t2: 0 };
  return scores.reduce((acc, g) => ({ t1: acc.t1 + g.team1, t2: acc.t2 + g.team2 }), { t1: 0, t2: 0 });
};
const setWins = (scores: GameScore[] | undefined) => {
  if (!scores?.length) return { a: 0, b: 0 };
  return scores.reduce(
    (acc, g) => ({ a: acc.a + (g.team1 > g.team2 ? 1 : 0), b: acc.b + (g.team2 > g.team1 ? 1 : 0) }),
    { a: 0, b: 0 }
  );
};
const winnerLabel = (m: Match): string | null => {
  if (!m.scores || m.scores.length === 0) return null;
  const w = setWins(m.scores);
  if (w.a === w.b) return "平手/未決";
  return w.a > w.b ? `${m.team1.a.name}／${m.team1.b.name}` : `${m.team2.a.name}／${m.team2.b.name}`;
};

/* ========== 性別徽章（名字也用 h1） ========== */
function genderMeta(g: Gender) {
  switch (g) {
    case "M":
      return { Icon: Mars, cls: "bg-sky-900/40 text-sky-300 border-sky-700" };
    case "F":
      return { Icon: Venus, cls: "bg-pink-900/40 text-pink-300 border-pink-700" };
    default:
      return { Icon: UserRound, cls: "bg-neutral-800/60 text-neutral-200 border-neutral-700" };
  }
}
function GenderTag({ p, large = false }: { p: Player; large?: boolean }) {
  const { Icon, cls } = genderMeta(p.gender);
  return (
    <span
      className={`inline-flex items-center gap-2 border ${cls} rounded-full px-3 ${large ? "py-2" : "py-1"}`}
      title={p.gender === "M" ? "男" : p.gender === "F" ? "女" : "其他"}
    >
      <Icon className={large ? "h-5 w-5" : "h-4 w-4"} />
      <h1 className={`font-medium ${large ? "text-xl md:text-2xl" : "text-base md:text-lg"}`}>{p.name}</h1>
    </span>
  );
}
const TeamText = ({ t }: { t: Team }) => (
  <>
    <GenderTag p={t.a} /> <h1 className="inline opacity-60 mx-1">／</h1> <GenderTag p={t.b} />
  </>
);

/* ========== 場地面板（同時顯示兩個） ========== */
function CourtPanel({
  courtNo,
  matches,
  onSubmitScore,
  onMarkDone,
  scoreInputs,
  setScoreInputs,
}: {
  courtNo: number;
  matches: Match[];
  onSubmitScore: (m: Match, a: number, b: number) => void;
  onMarkDone: (m: Match) => void;
  scoreInputs: Record<string, { a: string; b: string }>;
  setScoreInputs: React.Dispatch<React.SetStateAction<Record<string, { a: string; b: string }>>>;
}) {
  // 抓該場地的所有場次
  const list = useMemo(
    () => matches.filter(m => String(m.court ?? "") === String(courtNo)),
    [matches, courtNo]
  );

  // 依狀態排序，挑一個要「主顯示」的
  const current = useMemo(() => {
    const order = (s: MatchStatus | undefined) => (s === "live" ? 0 : s === "pending" ? 1 : 2);
    return [...list].sort((a, b) => order(a.status) - order(b.status))[0];
  }, [list]);

  // 若沒有場次
  if (!current) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Court {courtNo}</h1>
        <h1 className="text-lg md:text-xl text-neutral-400 mt-3">目前沒有賽事</h1>
      </div>
    );
  }

  const input = scoreInputs[current.id] ?? { a: "", b: "" };
  const last = current.scores?.[current.scores.length - 1];

  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Court {courtNo}</h1>
          <h1 className="text-base md:text-lg text-neutral-400">共 {list.length} 場</h1>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-neutral-400" />
          <h1 className={`text-base md:text-lg ${
            current.status === "done" ? "text-emerald-400" : current.status === "live" ? "text-blue-400" : "text-neutral-400"
          }`}>
            {current.status === "done" ? "已結束" : current.status === "live" ? "進行中" : "未開始"}
          </h1>
        </div>
      </div>

      {/* 主要卡片 */}
      <div className="p-6 md:p-8 grid gap-6">
        {/* 對戰雙方 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-neutral-800 p-4">
            <h1 className="text-sm md:text-base text-neutral-400">隊伍 A</h1>
            <div className="mt-3 flex flex-wrap gap-3">
              <GenderTag p={current.team1.a} large />
              <GenderTag p={current.team1.b} large />
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-4">
            <h1 className="text-sm md:text-base text-neutral-400">隊伍 B</h1>
            <div className="mt-3 flex flex-wrap gap-3">
              <GenderTag p={current.team2.a} large />
              <GenderTag p={current.team2.b} large />
            </div>
          </div>
        </div>

        {/* 裁判資訊 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
            <div className="flex items-center gap-2"><Gavel className="h-5 w-5 text-neutral-400" /><h1 className="text-sm md:text-base text-neutral-400">主審</h1></div>
            <div className="mt-2"><GenderTag p={current.referee} /></div>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
            <div className="flex items-center gap-2"><Binoculars className="h-5 w-5 text-neutral-400" /><h1 className="text-sm md:text-base text-neutral-400">線審 1</h1></div>
            <div className="mt-2"><GenderTag p={current.lj1} /></div>
          </div>
          <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
            <div className="flex items-center gap-2"><Binoculars className="h-5 w-5 text-neutral-400" /><h1 className="text-sm md:text-base text-neutral-400">線審 2</h1></div>
            <div className="mt-2"><GenderTag p={current.lj2} /></div>
          </div>
        </div>

        {/* 最新比分/勝方 */}
        <div className="flex items-center gap-3">
          <h1 className="text-base md:text-lg text-neutral-400">最新比分：</h1>
          <h1 className="text-base md:text-lg">{last ? `A ${last.team1} : ${last.team2} B` : "—"}</h1>
          <h1 className="text-base md:text-lg text-neutral-400 ml-4">勝方：</h1>
          <h1 className="text-base md:text-lg">{winnerLabel(current) ?? "—"}</h1>
        </div>

        {/* 分數輸入 */}
        <div className="grid gap-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <h1 className="block text-sm md:text-base text-neutral-400 mb-1">本局分數 — A 隊</h1>
              <input
                value={input.a}
                onChange={e => setScoreInputs(s => ({ ...s, [current.id]: { ...(s[current.id] ?? {a:"",b:""}), a: e.target.value.replace(/[^0-9]/g, "") } }))}
                className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <h1 className="block text-sm md:text-base text-neutral-400 mb-1">本局分數 — B 隊</h1>
              <input
                value={input.b}
                onChange={e => setScoreInputs(s => ({ ...s, [current.id]: { ...(s[current.id] ?? {a:"",b:""}), b: e.target.value.replace(/[^0-9]/g, "") } }))}
                className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="0"
              />
            </div>
            <button
              onClick={() => onSubmitScore(current, Number(input.a), Number(input.b))}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2"
              title="對戰結束"
            >
              <Check className="h-5 w-5" />
              <h1 className="text-base md:text-lg">對戰結束</h1>
            </button>
          </div>
          <div>
            <button
              onClick={() => onMarkDone(current)}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 px-4 py-2"
            >
              <Trophy className="h-5 w-5 text-yellow-400" />
              <h1 className="text-base md:text-lg">標記為結束（不輸入分數）</h1>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== 主頁面：左側清單 + 右側兩場地並排 ========== */
export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});

const normalizeCourt = (c: any): string => {
  const s = String(c ?? "").trim();
  if (!s) return "";                           // 空值維持空（後面會幫分配）
  const m = s.match(/\d+/);                    // 允許 "Court 1"、"1號場" 之類
  return m ? m[0] : s;
};

const loadFromSheetAndSaveDefault = async () => {
  const res = await fetch("/.netlify/functions/sheet-read");
  if (!res.ok) return alert("讀取 Google Sheet 失敗");
  const data = await res.json();
  let ms: Match[] = (data.matches as Match[]) ?? [];

  // 1) 正規化 court
  ms = ms.map(m => ({
    scores: [],
    status: "pending",
    ...m,
    court: normalizeCourt(m.court),
  }));

  // 2) 若仍然沒有 court，平均分配到 1 / 2（避免兩邊都空）
  let toggle = 1;
  ms = ms.map(m => {
    if (!m.court) {
      const assigned = String(toggle);
      toggle = toggle === 1 ? 2 : 1;
      return { ...m, court: assigned };
    }
    return m;
  });

  // 3) 每個場地挑第一場標成 live（只有當該場地目前沒有 live 時）
  const byCourt: Record<string, number> = {};
  ms = ms.map((m, i) => {
    const key = String(m.court);
    if (!byCourt[key]) byCourt[key] = -1;
    // 記住該場地第一個出現的 index
    if (byCourt[key] === -1) byCourt[key] = i;
    return m;
  });
  const hasLive = (court: string) => ms.some(m => String(m.court) === court && m.status === "live");
  for (const c of ["1", "2"]) {
    if (byCourt[c] >= 0 && !hasLive(c)) {
      ms[byCourt[c]] = { ...ms[byCourt[c]], status: "live" };
    }
  }

  setMatches(ms);
  alert(`已從 Google Sheet 載入 ${ms.length} 筆（已自動指派場地與預設 LIVE）。`);
};

  useEffect(() => { loadFromSheetAndSaveDefault(); }, []);

  /* 提交分數（兩場地共用） */
  const submitScore = (m: Match, a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return alert("請輸入數字分數");
    setMatches(ms => ms.map(x => x.id === m.id ? { ...x, status: "done", scores: [{ team1: a, team2: b }] } : x));
    // 寫回 Google Sheets
    const payload = {
      matchId: m.id,
      court: m.court,
      team1: `${m.team1.a.name}／${m.team1.b.name}`,
      team2: `${m.team2.a.name}／${m.team2.b.name}`,
      gameIndex: (m.scores?.length || 0) + 1,
      score1: a,
      score2: b,
      status: m.status || "done",
      note: m.note || "",
    };
    fetch("/.netlify/functions/sheet-append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => console.error("sheet append failed", e));
    setScoreInputs(s => ({ ...s, [m.id]: { a: "", b: "" } }));
  };

  const markDone = (m: Match) => {
    if (!m.scores || m.scores.length === 0) {
      const ok = confirm("尚未輸入任何局分，仍要標記為結束嗎？");
      if (!ok) return;
    }
    setMatches(ms => ms.map(x => x.id === m.id ? { ...x, status: "done" } : x));
  };

  const exportExcel = () => {
    const maxGames = Math.max(1, ...matches.map(m => m.scores?.length ?? 0));
    const rows = matches.map((m, i) => {
      const base: Record<string, any> = {
        序號: i + 1,
        場地: m.court ?? "",
        隊伍A: `${m.team1.a.name}／${m.team1.b.name}`,
        隊伍B: `${m.team2.a.name}／${m.team2.b.name}`,
        主審: m.referee.name,
        線審1: m.lj1.name,
        線審2: m.lj2.name,
        狀態: m.status ?? "",
        勝方: winnerLabel(m) ?? "",
      };
      for (let gi = 0; gi < maxGames; gi++) {
        const g = m.scores?.[gi];
        base[`第${gi + 1}局A`] = g ? g.team1 : "";
        base[`第${gi + 1}局B`] = g ? g.team2 : "";
      }
      const sum = sumScores(m.scores);
      base["A總分"] = sum.t1;
      base["B總分"] = sum.t2;
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "比賽成績");
    XLSX.writeFile(wb, `比賽成績_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="w-full p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] rounded-3xl border border-neutral-800 bg-neutral-900/50 overflow-hidden shadow-2xl">
          {/* 側邊：場次清單（字全用 h1） */}
          <aside className="border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-900/40 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-sm md:text-base text-neutral-400">場次列表</h1>
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5"
                title="匯出 Excel"
              >
                <FileSpreadsheet className="h-5 w-5" />
                <h1 className="text-sm md:text-base">匯出</h1>
              </button>
            </div>

            <ul className="space-y-2">
              {matches.map((m, i) => {
                const last = m.scores?.[m.scores.length - 1];
                return (
                  <li key={m.id}>
                    <div className="w-full text-left rounded-xl border border-neutral-800 hover:bg-neutral-800/50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <h1 className="text-xs md:text-sm text-neutral-400">
                          Match {i + 1}{m.court ? ` · Court ${m.court}` : ""}
                        </h1>
                        <h1 className={`text-xs md:text-sm ${
                          m.status === "done" ? "text-emerald-400" : m.status === "live" ? "text-blue-400" : "text-neutral-400"
                        }`}>
                          {m.status === "done" ? "已結束" : m.status === "live" ? "進行中" : "未開始"}
                        </h1>
                      </div>
                      <div className="mt-1">
                        <TeamText t={m.team1} /> <h1 className="inline opacity-60 mx-1">vs</h1> <TeamText t={m.team2} />
                      </div>
                      {m.status === "done" && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 text-emerald-300 px-2 py-0.5 border border-emerald-700">
                            <Trophy className="w-4 h-4 text-yellow-400" />
                            <h1 className="text-xs md:text-sm">{winnerLabel(m) || "—"}</h1>
                          </span>
                          <h1 className="text-[12px] md:text-sm opacity-90">
                            {last ? `比分 A ${last.team1} : ${last.team2} B` : "未輸入分數"}
                          </h1>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* 右側：兩個場地同時顯示 */}
          <div className="p-6 md:p-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <CourtPanel
                courtNo={1}
                matches={matches}
                onSubmitScore={submitScore}
                onMarkDone={markDone}
                scoreInputs={scoreInputs}
                setScoreInputs={setScoreInputs}
              />
              <CourtPanel
                courtNo={2}
                matches={matches}
                onSubmitScore={submitScore}
                onMarkDone={markDone}
                scoreInputs={scoreInputs}
                setScoreInputs={setScoreInputs}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
