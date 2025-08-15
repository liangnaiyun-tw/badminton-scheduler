import React, { useEffect, useState } from "react";
import {
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Check,
  Users,
  Gavel,
  Binoculars,
  PlusCircle,
  Mars,
  Venus,
  UserRound,
  Trophy,
} from "lucide-react";
import * as XLSX from "xlsx";

// ========== 型別定義 ==========
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

// ========== 小工具 ==========
const TeamText = ({ t }: { t: Team }) => (
  <>
    <GenderTag p={t.a} /> ／ <GenderTag p={t.b} />
  </>
);

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

// 性別顯示：顏色＋圖示（男=藍，女=粉，Other=灰＋中性 icon）
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
      className={`inline-flex items-center gap-2 border ${cls} rounded-full px-2.5 ${large ? "py-1.5 text-base" : "py-0.5 text-xs"}`}
      title={p.gender === "M" ? "男" : p.gender === "F" ? "女" : "其他"}
    >
      <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
      <span className="font-medium">{p.name}</span>
    </span>
  );
}

// ========== 主元件 ==========
export default function MatchManager({ matches: initialMatches = DEFAULT_MATCHES }: { matches?: Match[] }) {
  const [matches, setMatches] = useState<Match[]>(() => initialMatches.map(m => ({ status: "pending", scores: [], ...m })));
  const [idx, setIdx] = useState(0);
  const cur = matches[idx];
  const prev = matches[idx - 1];
  const next = matches[idx + 1];

  // 切換場次時標記狀態
  useEffect(() => {
    setMatches(ms => ms.map((m, i) => (i === idx ? { ...m, status: m.status === "done" ? "done" : "live" } : m)));
  }, [idx]);

  // 分數輸入
  const [t1Score, setT1Score] = useState<string>("");
  const [t2Score, setT2Score] = useState<string>("");

  const addGameScore = () => {
    const a = Number.parseInt(t1Score);
    const b = Number.parseInt(t2Score);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return alert("請輸入數字分數");
    
    setMatches(ms => ms.map((m, i) => (i === idx ? { ...m, status: "done", scores: [{ team1: a, team2: b }]} : m)));
    
    // ✅ 呼叫 Netlify Function 寫入 Google Sheets
    const m = matches[idx];
    const payload = {
      matchId: m.id,
      court: m.court,
      team1: `${m.team1.a.name}／${m.team1.b.name}`,
      team2: `${m.team2.a.name}／${m.team2.b.name}`,
      gameIndex: (m.scores?.length || 0) + 1,
      score1: a,
      score2: b,
      status: m.status || "live",
      note: m.note || "",
    };
    fetch("/.netlify/functions/sheet-append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => console.error("sheet append failed", e));

    setT1Score("");
    setT2Score("");
  };

  const endMatch = () => {
    console.log("標記對戰結束", cur);
    if (!cur) return;
    if (!cur.scores || cur.scores.length === 0) {
      const ok = confirm("尚未輸入任何局分，仍要標記為結束嗎？");
      if (!ok) return;
    }
    setMatches(ms => ms.map((m, i) => (i === idx ? { ...m, status: "done" } : m)));
  };

  const go = (d: number) => setIdx(i => Math.min(Math.max(0, i + d), matches.length - 1));

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
    XLSX.writeFile(wb, `比賽成績_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 grid grid-cols-1 lg:grid-cols-[320px_1fr]">
      {/* 側邊：場次清單 */}
      <aside className="border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-900/40 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-neutral-400">場次列表</div>
          <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm" title="匯出 Excel">
            <FileSpreadsheet className="h-4 w-4" /> 匯出
          </button>
        </div>
        <ul className="space-y-2">
          {matches.map((m, i) => {
            const sets = setWins(m.scores);
            const sum = sumScores(m.scores);
            const last = (m.scores && m.scores.length > 0) ? m.scores[m.scores.length - 1] : null;
            const doneInfo = m.status === "done" ? (
              <div className="mt-1 text-[12px] text-neutral-300 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 text-emerald-300 px-2 py-0.5 border border-emerald-700">
                  <Trophy className="w-4 h-4 text-yellow-400" /> {winnerLabel(m) || "—"}
                </span>
                {last ? (
                  <span className="opacity-90">比分 A {last.team1} : {last.team2} B</span>
                ) : (
                  <span className="opacity-50">未輸入分數</span>
                )}
              </div>
            ) : null;
            return (
              <li key={m.id}>
                <button
                  onClick={() => setIdx(i)}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition ${i === idx ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 hover:bg-neutral-800/50"}`}
                >
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Match {i + 1}{m.court ? ` · Court ${m.court}` : ""}</span>
                    <span className={m.status === "done" ? "text-emerald-400" : m.status === "live" ? "text-blue-400" : "text-neutral-400"}>
                      {m.status === "done" ? "已結束" : m.status === "live" ? "進行中" : "未開始"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    <TeamText t={m.team1} /> <span className="opacity-60">vs</span> <TeamText t={m.team2} />
                  </div>
                  {doneInfo}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 右側：詳細區 */}
      <div className="p-6 md:p-10 grid gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} disabled={!prev} className="inline-flex items-center gap-1 rounded-xl border border-neutral-800 px-3 py-2 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> 上一場
            </button>
            <button onClick={() => go(+1)} disabled={!next} className="inline-flex items-center gap-1 rounded-xl border border-neutral-800 px-3 py-2 disabled:opacity-40">
              下一場 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="text-sm text-neutral-400">
            {prev ? <>上一場：<span className="text-neutral-200">{prev.team1.a.name}／{prev.team1.b.name} vs {prev.team2.a.name}／{prev.team2.b.name}</span></> : <span>無上一場</span>}
            <span className="mx-3 opacity-40">|</span>
            {next ? <>下一場：<span className="text-neutral-200">{next.team1.a.name}／{next.team1.b.name} vs {next.team2.a.name}／{next.team2.b.name}</span></> : <span>無下一場</span>}
          </div>
        </div>

        {cur ? (
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 md:p-8 grid gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">COURT</span>
                <span className="text-3xl md:text-5xl font-black tracking-tight">{cur.court ?? "-"}</span>
                <div className="ml-4 inline-flex items-center gap-2 rounded-full bg-neutral-800/60 px-3 py-1 text-sm">
                  <Users className="h-4 w-4" /> Match {idx + 1} / {matches.length}
                </div>
              </div>
              <div className="text-sm">
                <span className={cur.status === "done" ? "text-emerald-400" : cur.status === "live" ? "text-blue-400" : "text-neutral-400"}>
                  {cur.status === "done" ? "已結束" : cur.status === "live" ? "進行中" : "未開始"}
                </span>
              </div>
            </div>

            {/* 隊伍顯示（含性別 Icon / 顏色） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-neutral-800 p-4">
                <div className="text-neutral-400 text-xs">隊伍 A</div>
                <div className="mt-2 flex flex-wrap gap-3">
                  <GenderTag p={cur.team1.a} large />
                  <GenderTag p={cur.team1.b} large />
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 p-4">
                <div className="text-neutral-400 text-xs">隊伍 B</div>
                <div className="mt-2 flex flex-wrap gap-3">
                  <GenderTag p={cur.team2.a} large />
                  <GenderTag p={cur.team2.b} large />
                </div>
              </div>
            </div>

            {/* 裁判資訊（含性別 Icon / 顏色） */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
                <div className="flex items-center gap-2 text-neutral-400 text-xs"><Gavel className="h-4 w-4"/> 主審</div>
                <div className="mt-2"><GenderTag p={cur.referee} /></div>
              </div>
              <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
                <div className="flex items-center gap-2 text-neutral-400 text-xs"><Binoculars className="h-4 w-4"/> 線審 1</div>
                <div className="mt-2"><GenderTag p={cur.lj1} /></div>
              </div>
              <div className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900/50">
                <div className="flex items-center gap-2 text-neutral-400 text-xs"><Binoculars className="h-4 w-4"/> 線審 2</div>
                <div className="mt-2"><GenderTag p={cur.lj2} /></div>
              </div>
            </div>

            {/* 分數區 */}
            <div className="grid gap-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-neutral-400 mb-1">本局分數 — A 隊</label>
                  <input value={t1Score} onChange={e => setT1Score(e.target.value.replace(/[^0-9]/g, ""))}
                         className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600" placeholder="0" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-neutral-400 mb-1">本局分數 — B 隊</label>
                  <input value={t2Score} onChange={e => setT2Score(e.target.value.replace(/[^0-9]/g, ""))}
                         className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600" placeholder="0" />
                </div>
                {/* <button onClick={addGameScore} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2">
                  <PlusCircle className="h-4 w-4"/> 新增一局
                </button> */}
                <button onClick={addGameScore} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2">
                  <Check className="h-4 w-4"/> 對戰結束
                </button>
              </div>

              {/* <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-separate border-spacing-y-2">
                  <thead className="text-neutral-400">
                    <tr>
                      <th className="text-left px-3">局</th>
                      <th className="text-left px-3">A隊</th>
                      <th className="text-left px-3">B隊</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cur.scores ?? []).map((g, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">第 {i + 1} 局</td>
                        <td className="px-3 py-2">{g.team1}</td>
                        <td className="px-3 py-2">{g.team2}</td>
                      </tr>
                    ))}
                    {(!cur.scores || cur.scores.length === 0) && (
                      <tr>
                        <td className="px-3 py-2 text-neutral-500" colSpan={3}>尚未輸入任何局分</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div> */}
            </div>
          </div>
        ) : (
          <div className="text-neutral-400">沒有可顯示的場次</div>
        )}
      </div>
    </div>
  );
}


// ===== 範例資料（可自行替換） =====
const P = (id: string, name: string, gender: Gender = "M"): Player => ({ id, name, gender });
const DEFAULT_MATCHES: Match[] = [
  {
    id: "m1",
    court: 1,
    team1: { a: P("A", "王小明"), b: P("B", "李小美", "F") },
    team2: { a: P("C", "林阿成"), b: P("D", "陳佳佳", "F") },
    referee: P("R1", "主審甲"),
    lj1: P("L1", "線審甲"),
    lj2: P("L2", "線審乙"),
    status: "pending",
    scores: [],
  },
  {
    id: "m2",
    court: 2,
    team1: { a: P("E", "張友誼"), b: P("F", "黃采恩", "F") },
    team2: { a: P("G", "趙以樂"), b: P("H", "周芷萱", "F") },
    referee: P("R2", "主審乙"),
    lj1: P("L3", "線審丙"),
    lj2: P("L4", "線審丁"),
    status: "pending",
    scores: [],
  },
];

// ===== 內建簡易測試（不影響 UI） =====
(function runInlineTests() {
  // 局數勝負與總分加總
  const tA: Team = { a: P("x1", "A1"), b: P("x2", "A2") };
  const tB: Team = { a: P("y1", "B1"), b: P("y2", "B2") };
  const m: Match = {
    id: "t1",
    team1: tA,
    team2: tB,
    referee: P("r", "R"),
    lj1: P("l1", "L1"),
    lj2: P("l2", "L2"),
    scores: [
      { team1: 21, team2: 15 },
      { team1: 18, team2: 21 },
      { team1: 21, team2: 19 },
    ],
  };
  const w = winnerLabel(m);
  const sets = setWins(m.scores);
  const sum = sumScores(m.scores);
  console.assert(w === `${tA.a.name}／${tA.b.name}`, "winnerLabel should pick Team A");
  console.assert(sets.a === 2 && sets.b === 1, "setWins should count per set winner");
  console.assert(sum.t1 === 60 && sum.t2 === 55, "sumScores should add points correctly");
})();
