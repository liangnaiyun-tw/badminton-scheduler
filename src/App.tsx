import React, { useEffect, useMemo, useState } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

/* =========================
 *  基本型別
 * ========================= */
const genders = ["M", "F", "Other"] as const;
type Gender = typeof genders[number];

/* ---- Level / Skill (1–8) 與說明 ---- */
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Skill = Level; // skill 也走 1–8

const clampLevel = (n: number): Level => (n < 1 ? 1 : n > 8 ? 8 : (n as Level));
const levelLabel = (lv: Level) => `Lv.${lv}`;

/** 參考台灣羽球推廣協會分級（精簡版 1–8） */
const LEVEL_INFO: Record<Level, { title: string; desc: string }> = {
  1: { title: "新手階", desc: "剛接觸規則與禮儀，基本發球/回球成功率較低。" },
  2: { title: "新手階", desc: "能在中場以平抽/高球往返約10拍，發球成功率約半數。" },
  3: { title: "新手階", desc: "定點長球可到半場～2/3場地，發球成功率提升（約8成）。" },
  4: { title: "初階", desc: "握拍與步伐較正確；長球男可至後場、女可到中後場；可做簡單吊/挑/殺。" },
  5: { title: "初階", desc: "攻防較穩，可運用吊、挑、放、抽等技術，準確度與穩定度提升。" },
  6: { title: "初中階", desc: "步伐順暢；能後場進攻與網前變化；偶有非受迫失誤；一般球團中下段位。" },
  7: { title: "初中階", desc: "殺/切/勾能定點或變向；攻守有概念，準確率約7成；具初步防守能力。" },
  8: { title: "中階", desc: "具基本戰術與輪轉；切、殺、吊等技術穩定度提高，防守開始帶變化。" },
};

/** 顏色分帶（1–3 綠、4–6 粉、7–8 黃） */
const levelBand = (lv: Level) => {
  let color = "#22c55e"; // 1–3 綠
  if (lv >= 4 && lv <= 6) color = "#ec4899"; // 4–6 粉
  if (lv >= 7) color = "#f59e0b"; // 7–8 黃
  return { title: LEVEL_INFO[lv].title, color };
};

/* =========================
 *  資料型別
 * ========================= */

type Player = {
  id: string;     // 唯一鍵（顯示用請看 name）
  name: string;   // 顯示名稱
  gender: Gender;
  level?: Level;  // 允許舊資料缺值，啟動時會校正
  skill?: Skill;  // = level（保留兼容）
  selected: boolean;
};

type MatchAssignment = {
  court: number;
  slotIndex: number;
  start: Date;
  end: Date;
  teams: [Player[], Player[]];
  officials: { umpire: Player; line1: Player; line2: Player };
};

type Settings = {
  courts: number;
  slotMinsLong: number;
  slotMinsShort: number;
  shortMatchThreshold: number; // 當 players > courts×此值 用短局
  preferMixed: boolean;
  dateISO: string;
  startHH: number;
  startMM: number;
  endHH: number;
  endMM: number;
  maxSameTeammateTogether?: number; // 預設 2（同夥伴最多 2 次 = 僅重複一次）
  maxSameOpponent?: number;         // 預設 2（同對手最多 2 次）
  maxConsecutivePlays?: number;     // 預設 2（最多連打兩場）
  strongFemaleAsMale?: boolean;     // 預設 true（混排判定用）
  strongLevelThreshold?: Level;     // 預設 7（>=7 的女生可視為男）
  reroll?: number;                  // 每按一次重新隨機，改變 seed
};

/* =========================
 *  Utils
 * ========================= */
function timeAt(date: string, h: number, m: number) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}
function addMinutes(d: Date, mins: number) {
  const nd = new Date(d);
  nd.setMinutes(nd.getMinutes() + mins);
  return nd;
}
function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5);
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// 簡單的 seeded RNG（mulberry32）
function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =========================
 *  混雙判定（含「強的女生可當男」）
 * ========================= */
function roleGender(p: Player, s: Settings): Gender {
  const strongFlag = (s.strongFemaleAsMale ?? true) && (p.gender === "F") && ((p.level ?? 1) >= (s.strongLevelThreshold ?? 7));
  return strongFlag ? "M" : p.gender;
}
function isMixedPair(a: Player, b: Player, s: Settings) {
  return roleGender(a, s) !== roleGender(b, s);
}

/* =========================
 *  generateSchedule（整合你喜歡的演算法 + 多場地/時段）
 * ========================= */
const sortPair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
const key2 = (a: string, b: string) => sortPair(a, b).join("|");

export function generateSchedule(playersAll: Player[], settings: Settings): { matches: MatchAssignment[]; usedShort: boolean } {
  const players = playersAll.filter(p => p.selected);
  const courts = Math.max(1, settings.courts);
  const maxMate = settings.maxSameTeammateTogether ?? 1; // 硬限制：同隊夥伴最多 1 次
  const maxOpp  = settings.maxSameOpponent ?? 2;         // 硬限制：個人對個人最多 2 次
  const maxConsec = settings.maxConsecutivePlays ?? 2;

  // 建立 seed，讓每次按鈕都能得到不同結果
  const seedBase = (settings.reroll ?? 0) + players.length * 97 + courts * 131;
  const rng = mulberry32(seedBase);

  // 時段
  const start = timeAt(settings.dateISO, settings.startHH, settings.startMM);
  const end = timeAt(settings.dateISO, settings.endHH, settings.endMM);
  const needShort = players.length > courts * (settings.shortMatchThreshold ?? 8);
  const slotLen = needShort ? settings.slotMinsShort : settings.slotMinsLong;

  const slots: Array<{ idx: number; start: Date; end: Date }> = [];
  let t = new Date(start); let idx = 0;
  while (addMinutes(t, slotLen) <= end) {
    const s = new Date(t); const e = addMinutes(t, slotLen);
    slots.push({ idx, start: s, end: e });
    t = e; idx++;
  }

  // 轉索引
  const byId = new Map(players.map(p => [p.id, p] as const));
  const ids = players.map(p => p.id);

  // 統計（沿用你 Python 版的概念）
  const partnerCounts = new Map<string, number>(); // "a|b" -> 次數
  const vsCounts = new Map<string, number>();      // "a|b" -> 次數（對手）
  const playCounts = new Map<string, number>();    // id -> 打球次數
  const offCounts  = new Map<string, number>();    // id -> 執法次數
  const consec     = new Map<string, number>();    // id -> 目前連打
  const lastPlayed = new Map<string, number>();    // id -> 上次打球的 slotIdx
  ids.forEach(id => { playCounts.set(id, 0); offCounts.set(id, 0); consec.set(id, 0); lastPlayed.set(id, -99); });

  // 權重（軟性評分；有了硬限制後僅作為次要因素）
  const W_BREAK_PARTNER = 50;
  const W_BREAK_OPP = 50;
  const W_CONSEC = 30;
  const W_MIX_BONUS = -5;
  const W_LOAD = 1;      // 打球負載
  const W_REF = 0.5;     // 執法負載

  const opponentsPairs = (t1: [string,string], t2: [string,string]) => {
    const [a,b] = t1, [c,d] = t2; return [key2(a,c), key2(a,d), key2(b,c), key2(b,d)];
  };

  // —— 新增：硬性限制檢查（同隊夥伴 ≤ maxMate；個人對個人 ≤ maxOpp）
  function wouldExceedPartnerOrOpp(
    t1: [string, string],
    t2: [string, string],
    maxMate: number,
    maxOpp: number
  ) {
    const p1 = (partnerCounts.get(key2(...t1)) ?? 0) + 1;
    const p2 = (partnerCounts.get(key2(...t2)) ?? 0) + 1;
    if (p1 > maxMate || p2 > maxMate) return true;
    for (const k of opponentsPairs(t1, t2)) {
      const v = (vsCounts.get(k) ?? 0) + 1;
      if (v > maxOpp) return true;
    }
    return false;
  }

  function costOf(m: { team1: [string,string]; team2: [string,string]; ref: string; lj1: string; lj2: string; }, slotIndex: number) {
    let score = 0;
    const pk1 = key2(m.team1[0], m.team1[1]);
    const pk2 = key2(m.team2[0], m.team2[1]);
    const p1 = (partnerCounts.get(pk1) ?? 0) + 1;
    const p2 = (partnerCounts.get(pk2) ?? 0) + 1;
    if (p1 > maxMate) score += W_BREAK_PARTNER * (p1 - maxMate);
    if (p2 > maxMate) score += W_BREAK_PARTNER * (p2 - maxMate);

    for (const k of opponentsPairs(m.team1, m.team2)) {
      const v = (vsCounts.get(k) ?? 0) + 1;
      if (v > maxOpp) score += W_BREAK_OPP * (v - maxOpp);
    }

    for (const pid of [...m.team1, ...m.team2]) {
      const lp = lastPlayed.get(pid)!; const c = consec.get(pid)!;
      if (slotIndex - lp === 1 && c + 1 > maxConsec) score += W_CONSEC * (c + 1 - maxConsec);
    }

    // 混雙獎勵（非硬性）
    const t1a = byId.get(m.team1[0])!, t1b = byId.get(m.team1[1])!;
    const t2a = byId.get(m.team2[0])!, t2b = byId.get(m.team2[1])!;
    if (isMixedPair(t1a, t1b, settings)) score += W_MIX_BONUS;
    if (isMixedPair(t2a, t2b, settings)) score += W_MIX_BONUS;

    // 打球/執法負載（極差）
    const playTmp = new Map(playCounts); for (const pid of [...m.team1, ...m.team2]) playTmp.set(pid, (playTmp.get(pid)! + 1));
    const pVals = [...playTmp.values()]; if (pVals.length) score += W_LOAD * (Math.max(...pVals) - Math.min(...pVals));
    const offTmp = new Map(offCounts); for (const pid of [m.ref, m.lj1, m.lj2]) offTmp.set(pid, (offTmp.get(pid)! + 1));
    const oVals = [...offTmp.values()]; if (oVals.length) score += W_REF * (Math.max(...oVals) - Math.min(...oVals));

    // 小加權：避免兩隊等級總和差太大
    const lv = (id: string) => byId.get(id)!.level ?? 1;
    const diff = Math.abs((lv(m.team1[0]) + lv(m.team1[1])) - (lv(m.team2[0]) + lv(m.team2[1])));
    score += diff * 0.2;

    // 追加：極小亂數作為 tie-breaker
    score += (rng() - 0.5) * 0.01;

    return score;
  }

  function commit(m: { team1: [string,string]; team2: [string,string]; ref: string; lj1: string; lj2: string; }, slotIndex: number) {
    const pk1 = key2(m.team1[0], m.team1[1]);
    const pk2 = key2(m.team2[0], m.team2[1]);
    partnerCounts.set(pk1, (partnerCounts.get(pk1) ?? 0) + 1);
    partnerCounts.set(pk2, (partnerCounts.get(pk2) ?? 0) + 1);
    for (const k of opponentsPairs(m.team1, m.team2)) vsCounts.set(k, (vsCounts.get(k) ?? 0) + 1);
    for (const pid of [...m.team1, ...m.team2]) {
      const lp = lastPlayed.get(pid)!; if (slotIndex - lp === 1) consec.set(pid, (consec.get(pid)! + 1)); else consec.set(pid, 1);
      lastPlayed.set(pid, slotIndex); playCounts.set(pid, (playCounts.get(pid)! + 1));
    }
    for (const pid of [m.ref, m.lj1, m.lj2]) offCounts.set(pid, (offCounts.get(pid)! + 1));
  }

  function playable(pid: string, slotIndex: number) {
    const lp = lastPlayed.get(pid)!; const c = consec.get(pid)!;
    if (slotIndex - lp === 1 && c >= maxConsec) return false;
    return true;
  }

  function feasibleOfficials(pool: string[]): [string,string,string][] {
    // 優先選擇執法次數少的人（可重複多場，無硬限制）
    const ranked = [...pool].sort((a,b) => (offCounts.get(a)! - offCounts.get(b)!));
    const res: [string,string,string][] = [];
    for (let i=0; i+2<ranked.length && res.length<6; i++) res.push([ranked[i], ranked[i+1], ranked[i+2]]);
    return res;
  }

  function candidateTeams(four: string[]): [ [string,string], [string,string] ][] {
    const [a,b,c,d] = four;
    const pairings: [ [string,string], [string,string] ][] = [ [[a,b],[c,d]], [[a,c],[b,d]], [[a,d],[b,c]] ];
    const scorePair = (t1: [string,string], t2: [string,string]) => {
      let s = 0;
      const A1 = byId.get(t1[0])!, A2 = byId.get(t1[1])!, B1 = byId.get(t2[0])!, B2 = byId.get(t2[1])!;
      if (isMixedPair(A1, A2, settings)) s -= 2;
      if (isMixedPair(B1, B2, settings)) s -= 2;
      s += (partnerCounts.get(key2(...t1)) ?? 0);
      s += (partnerCounts.get(key2(...t2)) ?? 0);
      for (const k of opponentsPairs(t1, t2)) s += (vsCounts.get(k) ?? 0);
      return s;
    };
    // 打散一點：先依分數，再以 seed 加點隨機
    return pairings.sort((p,q) => {
      const diff = scorePair(...p) - scorePair(...q);
      return diff !== 0 ? diff : (rng() - 0.5);
    });
  }

  function nextCourtCandidates(slotIndex: number, usedThisSlot: Set<string>) {
    // 候選母集：可上、且本 slot 尚未被用到
    let pool = ids.filter(pid => playable(pid, slotIndex) && !usedThisSlot.has(pid));
    if (pool.length < 4) pool = ids.filter(pid => !usedThisSlot.has(pid)); // 若不足四人，放寬連打限制
    // 按打球次數、連打次數排序，再以 seed 輕度打散
    pool.sort((a,b) => (playCounts.get(a)! - playCounts.get(b)!) || (consec.get(a)! - consec.get(b)!));
    if (pool.length > 1) {
      // Fisher–Yates 部分洗牌（限前 8 名）
      const top = Math.min(8, pool.length);
      for (let i = top - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool = pool.slice(0, top);
    }

    // 產生四人組合
    const combs: string[][] = [];
    for (let i=0;i<pool.length;i++)
      for (let j=i+1;j<pool.length;j++)
        for (let k=j+1;k<pool.length;k++)
          for (let l=k+1;l<pool.length;l++) combs.push([pool[i],pool[j],pool[k],pool[l]]);

    // —— 兩階段：先收集不違規（strict），否則退回軟限制（soft）
    const strict: { team1:[string,string]; team2:[string,string]; ref:string; lj1:string; lj2:string; }[] = [];
    const soft:   { team1:[string,string]; team2:[string,string]; ref:string; lj1:string; lj2:string; }[] = [];

    for (const four of combs) {
      for (const [t1, t2] of candidateTeams(four)) {
        const playing = new Set([...t1, ...t2]);
        const rest = ids.filter(x => !playing.has(x) && !usedThisSlot.has(x));

        const hardOK = !wouldExceedPartnerOrOpp(t1, t2, maxMate, maxOpp);

        // 主審／線審：不設重複上限，只要不是本場上場球員即可
        for (const [r, l1, l2] of feasibleOfficials(rest)) {
          const item = { team1: t1, team2: t2, ref: r, lj1: l1, lj2: l2 };
          if (hardOK) strict.push(item); else soft.push(item);
        }
      }
    }

    const candidatePool = strict.length ? strict : soft;
    // 先看成本，再加上微小亂數
    return candidatePool.sort((a,b) => {
      const diff = costOf(a, slotIndex) - costOf(b, slotIndex);
      return diff !== 0 ? diff : (rng() - 0.5);
    });
  }

  const matches: MatchAssignment[] = [];

  for (const slot of slots) {
    const usedThisSlot = new Set<string>();
    for (let court=1; court<=courts; court++) {
      const cands = nextCourtCandidates(slot.idx, usedThisSlot);
      if (!cands.length) break; // 這個時段排不出更多
      const m = cands[0]; // 取成本最低者
      // 提交到統計 & 本 slot 佔位
      commit(m, slot.idx);
      for (const pid of [...m.team1, ...m.team2, m.ref, m.lj1, m.lj2]) usedThisSlot.add(pid);

      // 寫入可顯示的比賽卡
      const teamA: [Player,Player] = [byId.get(m.team1[0])!, byId.get(m.team1[1])!];
      const teamB: [Player,Player] = [byId.get(m.team2[0])!, byId.get(m.team2[1])!];
      matches.push({
        court,
        slotIndex: slot.idx,
        start: slot.start,
        end: slot.end,
        teams: [teamA, teamB],
        officials: { umpire: byId.get(m.ref)!, line1: byId.get(m.lj1)!, line2: byId.get(m.lj2)! },
      });
    }
  }

  return { matches, usedShort: needShort };
}

/* =========================
 *  UI：Level 元件
 * ========================= */
function InfoPopover({ level }: { level?: Level }) {
  const lv = (level ?? 1) as Level; // fallback
  const info = LEVEL_INFO[lv];
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`查看 ${levelLabel(lv)} 說明`} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}
        className={`ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sky-600 border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300 ${open ? "bg-sky-50" : ""}`}
        title={`${levelLabel(lv)}｜${info.title}`}
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" className="absolute z-30 left-1/2 -translate-x-1/2 mt-2 w-72 rounded-xl border bg-white p-3 shadow">
          <div className="text-sm font-medium">{levelLabel(lv)}｜{info.title}</div>
          <div className="mt-1 text-xs text-slate-600 leading-relaxed">{info.desc}</div>
        </div>
      )}
    </div>
  );
}

function LevelPills({ value, onChange, disabled }: { value?: Level; onChange: (lv: Level) => void; disabled?: boolean }) {
  const v = (value ?? 1) as Level; // fallback
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Select player level" className="flex flex-wrap gap-1.5">
        {[1,2,3,4,5,6,7,8].map(n => {
          const active = v === n; const { color } = levelBand(n as Level);
          return (
            <button key={n} role="radio" aria-checked={active} onClick={() => !disabled && onChange(n as Level)} disabled={disabled}
              className="px-2.5 py-1 rounded-full border text-xs"
              style={{ background: active ? `${color}14` : "white", borderColor: active ? `${color}55` : "#e5e7eb", color: active ? color : "#111827" }}
              title={`${levelLabel(n as Level)}｜${LEVEL_INFO[n as Level].title}`}
            >{levelLabel(n as Level)}</button>
          );
        })}
      </div>
      <InfoPopover level={v} />
    </div>
  );
}

/* =========================
 *  APP（加入：重新隨機、手動拖拉調整）
 * ========================= */
export default function App() {
  const [players, setPlayers] = useState<Player[]>(() => samplePlayers());
  const [settings, setSettings] = useState<Settings>(() => ({
    courts: 1,
    slotMinsLong: 12,
    slotMinsShort: 8,
    shortMatchThreshold: 8,
    preferMixed: true,
    dateISO: new Date().toISOString().slice(0, 10),
    startHH: 10,
    startMM: 10,
    endHH: 12,
    endMM: 0,
    maxSameTeammateTogether: 2,
    maxSameOpponent: 2,
    maxConsecutivePlays: 2,
    strongFemaleAsMale: true,
    strongLevelThreshold: 7,
    reroll: 0,
  }));

  // 手動模式（可拖拉交換球員）
  const [manualMode, setManualMode] = useState(false);
  const [manualMatches, setManualMatches] = useState<MatchAssignment[] | null>(null);

  // 一次性校正：把舊資料的 level/skill 填好（skill = level）
  useEffect(() => {
    setPlayers(prev => prev.map(p => {
      const lv = clampLevel((p.level ?? (p.skill as number) ?? 1) as number);
      return { ...p, level: lv, skill: lv };
    }));
  }, []);

  const selectedCount = players.filter(p => p.selected).length;
  const auto = useMemo(() => generateSchedule(players, settings), [players, settings]);

  // 當不是手動模式或按了重新隨機時，把自動結果灌入手動陣列
  useEffect(() => {
    if (!manualMode) setManualMatches(auto.matches);
  }, [auto.matches, manualMode]);

  const displayedMatches = manualMode && manualMatches ? manualMatches : auto.matches;

  // 交換兩個位置的球員（拖放）
  const swapPlayers = (a: DragIndex, b: DragIndex) => {
    setManualMatches(prev => {
      if (!prev) return prev;
      const copy = prev.map(m => ({ ...m, teams: [ [...m.teams[0]], [...m.teams[1]] ] as [Player[], Player[]] }));
      const mA = copy.find(m => m.slotIndex === a.slotIndex && m.court === a.court);
      const mB = copy.find(m => m.slotIndex === b.slotIndex && m.court === b.court);
      if (!mA || !mB) return prev;
      const pA = mA.teams[a.teamIdx][a.playerIdx];
      const pB = mB.teams[b.teamIdx][b.playerIdx];
      if (!pA || !pB) return prev;
      // 交換
      mA.teams[a.teamIdx][a.playerIdx] = pB;
      mB.teams[b.teamIdx][b.playerIdx] = pA;
      return copy;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1">
          <h1 className="text-2xl font-bold mb-3">🏸 羽球賽程排程器</h1>
          <p className="text-sm text-slate-600 mb-4">每場 4 位球員 + 2 位線審 + 1 位主審。避免同夥伴/對手過度重複，且最多連打兩場；盡量混雙與實力平衡。</p>

          <div className="bg-white rounded-2xl shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">本週球員（{selectedCount} 位）</h2>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200" onClick={() => setPlayers(prev => prev.map(p => ({ ...p, selected: true })))}>全選</button>
                <button className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200" onClick={() => setPlayers(prev => prev.map(p => ({ ...p, selected: false })))}>全不選</button>
              </div>
            </div>
            <PlayerEditor players={players} setPlayers={setPlayers} />
          </div>

          <AddPlayer onAdd={(np) => setPlayers(ps => [...ps, np])} />
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-3">設定</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumberField label="球場數" value={settings.courts} min={1} max={6} onChange={(v) => setSettings({ ...settings, courts: v })} />
              <NumberField label="長局分鐘（21分）" value={settings.slotMinsLong} min={8} max={20} onChange={(v) => setSettings({ ...settings, slotMinsLong: v })} />
              <NumberField label="短局分鐘（15分）" value={settings.slotMinsShort} min={6} max={15} onChange={(v) => setSettings({ ...settings, slotMinsShort: v })} />
              <NumberField label="短局門檻（players > courts×此值）" value={settings.shortMatchThreshold} min={6} max={16} onChange={(v) => setSettings({ ...settings, shortMatchThreshold: v })} />
              <div className="flex items-center gap-2">
                <input id="mixed" type="checkbox" checked={settings.preferMixed} onChange={(e) => setSettings({ ...settings, preferMixed: e.target.checked })} />
                <label htmlFor="mixed" className="text-sm">偏好混雙</label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="開始時" value={settings.startHH} min={6} max={22} onChange={(v) => setSettings({ ...settings, startHH: v })} />
                <NumberField label="開始分" value={settings.startMM} min={0} max={59} onChange={(v) => setSettings({ ...settings, startMM: v })} />
                <div />
                <NumberField label="結束時" value={settings.endHH} min={6} max={23} onChange={(v) => setSettings({ ...settings, endHH: v })} />
                <NumberField label="結束分" value={settings.endMM} min={0} max={59} onChange={(v) => setSettings({ ...settings, endMM: v })} />
                <div />
              </div>
              <div className="grid grid-cols-3 gap-2 col-span-2 md:col-span-3">
                <NumberField label="同夥伴最多次數" value={settings.maxSameTeammateTogether!} min={1} max={4} onChange={(v) => setSettings({ ...settings, maxSameTeammateTogether: v })} />
                <NumberField label="同對手最多次數" value={settings.maxSameOpponent!} min={1} max={4} onChange={(v) => setSettings({ ...settings, maxSameOpponent: v })} />
                <NumberField label="最多連打場數" value={settings.maxConsecutivePlays!} min={1} max={4} onChange={(v) => setSettings({ ...settings, maxConsecutivePlays: v })} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">目前賽制：{auto.usedShort ? "短局（較快輪轉）" : "長局（較長時間）"}</p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold mb-3">自動產生賽程</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <button className="px-3 py-1.5 rounded-xl bg-sky-600 text-white hover:bg-sky-700" title="重新隨機一次"
                  onClick={() => { setSettings(s => ({ ...s, reroll: (s.reroll ?? 0) + 1 })); setManualMode(false); }}>
                  重新隨機排一次
                </button>
                <button className={`px-3 py-1.5 rounded-xl ${manualMode ? "bg-amber-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
                  title="切換手動拖拉調整"
                  onClick={() => setManualMode(m => !m)}>
                  {manualMode ? "手動模式：開" : "手動模式：關"}
                </button>
                <button className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700" onClick={() => exportScheduleCSV(displayedMatches)}>匯出 CSV（Excel）</button>
                <button className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200" onClick={() => window.print()}>列印／匯出 PDF</button>
              </div>
            </div>

            {displayedMatches.length === 0 ? (
              <p className="text-sm text-slate-600">請確認：已勾選至少 7 位球員（每場 4 人上場 + 3 位裁判）。</p>
            ) : (
              <ScheduleTable matches={displayedMatches} courts={settings.courts} manualMode={manualMode} onSwap={swapPlayers} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* =========================
 *  小元件
 * ========================= */
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; }) {
  return (
    <label className="text-sm flex flex-col gap-1">
      <span className="text-slate-600">{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring" />
    </label>
  );
}

function PlayerEditor({ players, setPlayers }: { players: Player[]; setPlayers: React.Dispatch<React.SetStateAction<Player[]>>; }) {
  const update = (id: string, patch: Partial<Player>) => setPlayers(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => setPlayers(prev => prev.filter(p => p.id !== id));
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="text-left p-2">選</th>
            <th className="text-left p-2">姓名</th>
            <th className="text-left p-2">性別</th>
            <th className="text-left p-2">等級(1-8)</th>
            <th className="text-left p-2"></th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id} className="border-t">
              <td className="p-2"><input type="checkbox" checked={p.selected} onChange={(e) => update(p.id, { selected: e.target.checked })} /></td>
              <td className="p-2"><input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className="px-2 py-1 rounded border border-slate-200 w-full" /></td>
              <td className="p-2">
                <select value={p.gender} onChange={(e) => update(p.id, { gender: e.target.value as Gender })} className="px-2 py-1 rounded border border-slate-200">
                  {genders.map(g => (<option key={g} value={g}>{g}</option>))}
                </select>
              </td>
              <td className="p-2"><LevelPills value={(p.level ?? (p.skill as Level) ?? 1) as Level} onChange={(lv) => update(p.id, { level: lv, skill: lv })} /></td>
              <td className="p-2 text-right"><button className="text-red-500 hover:underline" onClick={() => remove(p.id)}>刪除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddPlayer({ onAdd }: { onAdd: (p: Player) => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("M");
  const [level, setLevel] = useState<Level>(3);
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h3 className="font-semibold mb-3">新增球員</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="text-slate-600">姓名</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200" />
        </label>
        <label className="text-sm">
          <div className="text-slate-600">性別</div>
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="px-3 py-2 rounded-xl border border-slate-200">
            {genders.map(g => (<option key={g} value={g}>{g}</option>))}
          </select>
        </label>
        <label className="text-sm">
          <div className="text-slate-600 mb-1">等級(1-8)</div>
          <LevelPills value={level} onChange={setLevel} />
        </label>
        <button className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700"
          onClick={() => {
            if (!name.trim()) return;
            onAdd({ id: uid(), name: name.trim(), gender, level, skill: level, selected: true });
            setName(""); setGender("M"); setLevel(3);
          }}>加入</button>
      </div>
    </div>
  );
}

/* =========================
 *  拖放：型別與工具
 * ========================= */
type DragIndex = { slotIndex: number; court: number; teamIdx: 0 | 1; playerIdx: 0 | 1 };

function playerDragData(e: React.DragEvent, idx: DragIndex) {
  e.dataTransfer.setData("application/json", JSON.stringify(idx));
  e.dataTransfer.effectAllowed = "move";
}

function readPlayerDragData(e: React.DragEvent): DragIndex | null {
  try { return JSON.parse(e.dataTransfer.getData("application/json")); } catch { return null; }
}

/* =========================
 *  賽程表（支援拖放交換）
 * ========================= */
function ScheduleTable({ matches, courts, manualMode, onSwap }: { matches: MatchAssignment[]; courts: number; manualMode?: boolean; onSwap?: (a: DragIndex, b: DragIndex) => void; }) {
  const bySlot = new Map<number, MatchAssignment[]>();
  for (const m of matches) { if (!bySlot.has(m.slotIndex)) bySlot.set(m.slotIndex, []); bySlot.get(m.slotIndex)!.push(m); }
  const orderedSlots = [...bySlot.keys()].sort((a,b) => a-b);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="text-left p-2">時間</th>
            {[...Array(courts)].map((_,i) => (<th key={i} className="text-left p-2">第 {i+1} 場地</th>))}
          </tr>
        </thead>
        <tbody>
          {orderedSlots.map(sIdx => {
            const slotMatches = bySlot.get(sIdx)!;
            const mByCourt: (MatchAssignment | null)[] = Array.from({ length: courts }, () => null);
            for (const m of slotMatches) mByCourt[m.court - 1] = m;
            const start = slotMatches[0]?.start; const end = slotMatches[0]?.end;
            return (
              <tr key={sIdx} className="border-t align-top">
                <td className="p-2 whitespace-nowrap text-slate-600"><div>{start ? `${formatTime(start)}–${formatTime(end!)}` : "—"}</div></td>
                {mByCourt.map((m,i) => (
                  <td key={i} className="p-2">{m ? <MatchCard m={m} manualMode={manualMode} onSwap={onSwap} /> : <div className="text-slate-400 italic">（此時段空場）</div>}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ m, manualMode, onSwap }: { m: MatchAssignment; manualMode?: boolean; onSwap?: (a: DragIndex, b: DragIndex) => void; }) {
  const P = ({ p, idx }: { p: Player; idx: DragIndex }) => (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg border ${manualMode ? 'border-sky-300 bg-sky-50 cursor-move' : 'border-slate-200'} mr-1`}
      draggable={!!manualMode}
      onDragStart={(e) => playerDragData(e, idx)}
      onDragOver={(e) => manualMode ? e.preventDefault() : undefined}
      onDrop={(e) => {
        if (!manualMode || !onSwap) return;
        e.preventDefault();
        const src = readPlayerDragData(e);
        if (!src) return;
        const dst = idx;
        onSwap(src, dst);
      }}
      title={`${p.name}（${p.gender}/${levelLabel((p.level ?? 1) as Level)}）`}
    >
      {p.name}（{p.gender}/{levelLabel((p.level ?? 1) as Level)}）
    </span>
  );

  return (
    <div className="rounded-xl border border-slate-200 p-2 print:p-1">
      <div className="text-xs text-slate-500 mb-1">時間：{formatTime(m.start)}–{formatTime(m.end)}　場地：{m.court}</div>
      <div className="font-medium mb-1">
        A隊：
        <P p={m.teams[0][0]} idx={{ slotIndex: m.slotIndex, court: m.court, teamIdx: 0, playerIdx: 0 }} />
        /
        <P p={m.teams[0][1]} idx={{ slotIndex: m.slotIndex, court: m.court, teamIdx: 0, playerIdx: 1 }} />
      </div>
      <div className="font-medium mb-2">
        B隊：
        <P p={m.teams[1][0]} idx={{ slotIndex: m.slotIndex, court: m.court, teamIdx: 1, playerIdx: 0 }} />
        /
        <P p={m.teams[1][1]} idx={{ slotIndex: m.slotIndex, court: m.court, teamIdx: 1, playerIdx: 1 }} />
      </div>
      <div className="text-xs text-slate-600">主審：{m.officials.umpire.name}　線審：{m.officials.line1.name}、{m.officials.line2.name}</div>
      {manualMode && (
        <div className="text-xs text-amber-700 mt-1">提示：拖曳球員到另一位球員上可交換兩人的位置。</div>
      )}
    </div>
  );
}

/* 匯出 CSV（Excel 可直接開啟） */
function exportScheduleCSV(matches: MatchAssignment[]) {
  if (!matches?.length) return;
  const header = ["時間","場地","A1","A1(性別/Lv)","A2","A2(性別/Lv)","B1","B1(性別/Lv)","B2","B2(性別/Lv)","主審","線審1","線審2"];
  const rows = [...matches].sort((a,b) => a.slotIndex - b.slotIndex || a.court - b.court).map(m => {
    const tA = m.teams[0], tB = m.teams[1];
    const fmtP = (p: Player) => `${p.gender}/${levelLabel((p.level ?? 1) as Level)}`;
    const time = `${formatTime(m.start)}-${formatTime(m.end)}`;
    return [ time, `第${m.court}場地`, tA[0].name, fmtP(tA[0]), tA[1].name, fmtP(tA[1]), tB[0].name, fmtP(tB[0]), tB[1].name, fmtP(tB[1]), m.officials.umpire.name, m.officials.line1.name, m.officials.line2.name ];
  });
  const csv = [header, ...rows].map(r => r.map(cell => {
    const s = String(cell ?? "");
    if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(",")).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `badminton-schedule-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* 範例資料 */
function samplePlayers(): Player[] {
  const base: Array<{ name: string; gender: Gender; level: Level }> = [
    { name: "梁", gender: "F", level: 6 },
    { name: "源", gender: "M", level: 5 },
    { name: "慶", gender: "M", level: 7 },
    { name: "宇", gender: "M", level: 5 },
    { name: "哲", gender: "M", level: 6 },
    { name: "懋", gender: "M", level: 8 },
    { name: "勛", gender: "M", level: 8 },
    { name: "湘", gender: "F", level: 3 }
  ];
  return base.map((b) => ({ id: uid(), name: b.name, selected: true, skill: b.level, level: b.level, gender: b.gender }));
}
