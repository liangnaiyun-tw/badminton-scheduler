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

/** 顏色分帶（依你圖卡：1–3 綠、4–6 粉、7–8 黃） */
const levelBand = (lv: Level) => {
  const title = LEVEL_INFO[lv].title;
  let color = "#22c55e";                 // 1–3 綠
  if (lv >= 4 && lv <= 6) color = "#ec4899"; // 4–6 粉
  if (lv >= 7) color = "#f59e0b"; // 7–8 黃
  return { title, color };
};

type Player = {
  id: string;
  name: string;
  gender: Gender;
  level?: Level;  // 允許舊資料缺值，啟動時會校正
  skill?: Skill;  // 允許舊資料缺值，啟動時會校正（= level）
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
  shortMatchThreshold: number;
  preferMixed: boolean;
  dateISO: string;
  startHH: number;
  startMM: number;
  endHH: number;
  endMM: number;
};

type PerPlayerStats = {
  lastSlot: number | null;
  consec: number;
  busySlots: Set<number>;
  totalPlays: number;
  totalOfficials: number;
};

type SchedulerState = {
  settings: Settings;
  stats: Map<string, PerPlayerStats>;
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
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* =========================
 *  配對/選人
 * ========================= */
function makeTeams(players: Player[], preferMixed: boolean) {
  const pool = [...players];
  let best: [Player[], Player[]] | null = null;
  let bestScore = Infinity;
  const pairs: number[][] = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  ];
  for (const p of pairs) {
    const teamA = [pool[p[0]], pool[p[1]]];
    const teamB = pool.filter((_, i) => !p.includes(i));
    const sumA = teamA.reduce((s, x) => s + (x.skill ?? 1), 0);
    const sumB = teamB.reduce((s, x) => s + (x.skill ?? 1), 0);
    const skillDiff = Math.abs(sumA - sumB);
    let mixPenalty = 0;
    if (preferMixed) {
      const mixed = (t: Player[]) => new Set(t.map((x) => x.gender)).size > 1;
      mixPenalty += (mixed(teamA) ? 0 : 0.5) + (mixed(teamB) ? 0 : 0.5);
    }
    const score = skillDiff + mixPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = [teamA, teamB];
    }
  }
  return best!;
}

function chooseBestFour<T>(arr: T[], score: (g: T[]) => number): T[] | null {
  if (arr.length < 4) return null;
  let best: T[] | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < arr.length - 3; i++)
    for (let j = i + 1; j < arr.length - 2; j++)
      for (let k = j + 1; k < arr.length - 1; k++)
        for (let l = k + 1; l < arr.length; l++) {
          const group = [arr[i], arr[j], arr[k], arr[l]];
          const s = score(group);
          if (s < bestScore) {
            bestScore = s;
            best = group;
          }
        }
  return best;
}

function canPlay(id: string, state: SchedulerState, slotIndex: number) {
  const st = state.stats.get(id);
  if (!st) return true;
  if (st.busySlots.has(slotIndex)) return false;
  return st.consec < 2;
}
function canOfficiate(id: string, state: SchedulerState, slotIndex: number) {
  const st = state.stats.get(id);
  if (!st) return true;
  return !st.busySlots.has(slotIndex);
}

function buildSlots(s: Settings) {
  const start = timeAt(s.dateISO, s.startHH, s.startMM);
  const end = timeAt(s.dateISO, s.endHH, s.endMM);
  return { start, end, longLen: s.slotMinsLong, shortLen: s.slotMinsShort };
}

function pickPlayersForCourt(
  available: Player[], state: SchedulerState, slotIndex: number
): Player[] | null {
  const ok = available.filter((p) => canPlay(p.id, state, slotIndex));
  if (ok.length < 4) return null;
  ok.sort((a, b) => {
    const sa = state.stats.get(a.id)!;
    const sb = state.stats.get(b.id)!;
    if (sa.consec !== sb.consec) return sa.consec - sb.consec;
    return (sa.lastSlot ?? -99) - (sb.lastSlot ?? -99);
  });
  const candidates = ok.slice(0, Math.max(6, 4));
  const chosen = chooseBestFour(candidates, (group) => {
    const [t1, t2] = makeTeams(group, state.settings.preferMixed);
    const diff =
      t1.reduce((s, p) => s + (p.skill ?? 1), 0) - t2.reduce((s, p) => s + (p.skill ?? 1), 0);
    return Math.abs(diff);
  });
  return chosen;
}

function generateSchedule(players: Player[], settings: Settings) {
  const active = players.filter((p) => p.selected);
  const state: SchedulerState = {
    settings,
    stats: new Map<string, PerPlayerStats>(),
  };
  active.forEach((p) =>
    state.stats.set(p.id, {
      lastSlot: null, consec: 0, busySlots: new Set(),
      totalPlays: 0, totalOfficials: 0,
    })
  );

  const { start, end, longLen, shortLen } = buildSlots(settings);
  const shouldShort = active.length > settings.courts * settings.shortMatchThreshold;
  const slotLen = shouldShort ? shortLen : longLen;

  const slots: { start: Date; end: Date }[] = [];
  let cur = new Date(start);
  while (cur < end) {
    const slotEnd = addMinutes(cur, slotLen);
    if (slotEnd > end) break;
    slots.push({ start: new Date(cur), end: slotEnd });
    cur = slotEnd;
  }

  const matches: MatchAssignment[] = [];

  for (let sIdx = 0; sIdx < slots.length; sIdx++) {
    for (let c = 1; c <= settings.courts; c++) {
      const available = active.filter((p) => canPlay(p.id, state, sIdx));
      const four = pickPlayersForCourt(available, state, sIdx);
      if (!four) continue;

      four.forEach((p) => state.stats.get(p.id)!.busySlots.add(sIdx));
      const [teamA, teamB] = makeTeams(four, settings.preferMixed);

      const rem = active.filter((p) => !state.stats.get(p.id)!.busySlots.has(sIdx));
      const officials: Player[] = [];
      for (const p of rem) {
        if (officials.length >= 3) break;
        if (canOfficiate(p.id, state, sIdx)) {
          officials.push(p);
          state.stats.get(p.id)!.busySlots.add(sIdx);
        }
      }
      if (officials.length < 3) {
        four.forEach((p) => state.stats.get(p.id)!.busySlots.delete(sIdx));
        officials.forEach((p) => state.stats.get(p.id)!.busySlots.delete(sIdx));
        continue;
      }

      four.forEach((p) => {
        const st = state.stats.get(p.id)!;
        if (st.lastSlot === sIdx - 1) st.consec += 1; else st.consec = 1;
        st.lastSlot = sIdx;
        st.totalPlays += 1;
      });
      const [umpire, line1, line2] = officials;
      [umpire, line1, line2].forEach((p) => {
        const st = state.stats.get(p.id)!;
        st.totalOfficials += 1;
      });

      matches.push({
        court: c,
        slotIndex: sIdx,
        start: slots[sIdx].start,
        end: slots[sIdx].end,
        teams: [teamA, teamB],
        officials: { umpire, line1, line2 },
      });
    }
  }

  return { matches, usedShort: shouldShort };
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
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`查看 ${levelLabel(lv)} 說明`}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={`ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full
              border text-sky-600 border-sky-300
              hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300
              ${open ? "bg-sky-50" : ""}`}
        title={`${levelLabel(lv)}｜${info.title}`}
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute z-30 left-1/2 -translate-x-1/2 mt-2 w-72 rounded-xl border bg-white p-3 shadow"
        >
          <div className="text-sm font-medium">
            {levelLabel(lv)}｜{info.title}
          </div>
          <div className="mt-1 text-xs text-slate-600 leading-relaxed">
            {info.desc}
          </div>
        </div>
      )}
    </div>
  );
}

function LevelPills({
  value, onChange, disabled,
}: { value?: Level; onChange: (lv: Level) => void; disabled?: boolean }) {
  const v = (value ?? 1) as Level; // fallback
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Select player level" className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
          const active = v === n;
          const { color } = levelBand(n as Level);
          return (
            <button
              key={n}
              role="radio"
              aria-checked={active}
              onClick={() => !disabled && onChange(n as Level)}
              disabled={disabled}
              className="px-2.5 py-1 rounded-full border text-xs"
              style={{
                background: active ? `${color}14` : "white",
                borderColor: active ? `${color}55` : "#e5e7eb",
                color: active ? color : "#111827",
              }}
              title={`${levelLabel(n as Level)}｜${LEVEL_INFO[n as Level].title}`}
            >
              {levelLabel(n as Level)}
            </button>
          );
        })}
      </div>
      <InfoPopover level={v} />
    </div>
  );
}

function LevelSelect({
  value, onChange, id, disabled,
}: { value?: Level; onChange: (lv: Level) => void; id?: string; disabled?: boolean }) {
  const v = (value ?? 1) as Level; // fallback
  return (
    <div className="flex items-start gap-2">
      <select
        id={id}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(clampLevel(Number(e.target.value)))}
        className="rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
        aria-label="Select player level"
        title={`${levelLabel(v)}｜${LEVEL_INFO[v].title}`}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
          <option key={n} value={n}>{`Lv.${n}`}</option>
        ))}
      </select>
      <InfoPopover level={v} />
    </div>
  );
}

/* =========================
 *  APP
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
  }));

  // 一次性校正：把舊資料的 level/skill 填好（skill = level）
  useEffect(() => {
    setPlayers(prev =>
      prev.map(p => {
        const lv = clampLevel((p.level ?? (p.skill as number) ?? 1) as number);
        return { ...p, level: lv, skill: lv };
      })
    );
  }, []);

  const selectedCount = players.filter((p) => p.selected).length;
  const { matches, usedShort } = useMemo(
    () => generateSchedule(players, settings),
    [players, settings]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1">
          <h1 className="text-2xl font-bold mb-3">🏸 羽球賽程排程器</h1>
          <p className="text-sm text-slate-600 mb-4">
            時間可調；每場 4 位球員 + 2 位線審 + 1 位主審。
            避免同一位球員連打 3 場，並盡量平衡實力（依 1–8 級）。
          </p>

          <div className="bg-white rounded-2xl shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">本週球員（{selectedCount} 位）</h2>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200"
                  onClick={() => setPlayers((prev) => prev.map((p) => ({ ...p, selected: true })))}
                >全選</button>
                <button
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200"
                  onClick={() => setPlayers((prev) => prev.map((p) => ({ ...p, selected: false })))}
                >全不選</button>
              </div>
            </div>
            <PlayerEditor players={players} setPlayers={setPlayers} />
          </div>

          <AddPlayer onAdd={(np) => setPlayers((ps) => [...ps, np])} />
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-3">設定</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumberField label="球場數" value={settings.courts} min={1} max={6}
                onChange={(v) => setSettings({ ...settings, courts: v })} />
              <NumberField label="長局分鐘（21分）" value={settings.slotMinsLong} min={8} max={20}
                onChange={(v) => setSettings({ ...settings, slotMinsLong: v })} />
              <NumberField label="短局分鐘（15分）" value={settings.slotMinsShort} min={6} max={15}
                onChange={(v) => setSettings({ ...settings, slotMinsShort: v })} />
              <NumberField label="短局門檻（players > courts×此值）" value={settings.shortMatchThreshold} min={6} max={16}
                onChange={(v) => setSettings({ ...settings, shortMatchThreshold: v })} />
              <div className="flex items-center gap-2">
                <input id="mixed" type="checkbox" checked={settings.preferMixed}
                  onChange={(e) => setSettings({ ...settings, preferMixed: e.target.checked })} />
                <label htmlFor="mixed" className="text-sm">偏好混雙</label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="開始時" value={settings.startHH} min={6} max={22}
                  onChange={(v) => setSettings({ ...settings, startHH: v })} />
                <NumberField label="開始分" value={settings.startMM} min={0} max={59}
                  onChange={(v) => setSettings({ ...settings, startMM: v })} />
                <div />
                <NumberField label="結束時" value={settings.endHH} min={6} max={23}
                  onChange={(v) => setSettings({ ...settings, endHH: v })} />
                <NumberField label="結束分" value={settings.endMM} min={0} max={59}
                  onChange={(v) => setSettings({ ...settings, endMM: v })} />
                <div />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              目前賽制：{usedShort ? "短局（較快輪轉）" : "長局（較長時間）"}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold mb-3">自動產生賽程</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  className="px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700"
                  onClick={() => exportScheduleCSV(matches)}
                >匯出 CSV（Excel）</button>
                <button
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200"
                  onClick={() => window.print()}
                >列印／匯出 PDF</button>
              </div>
            </div>

            {matches.length === 0 ? (
              <p className="text-sm text-slate-600">
                請確認：已勾選至少 7 位球員（每場 4 人上場 + 3 位裁判）。
              </p>
            ) : (
              <ScheduleTable matches={matches} courts={settings.courts} />
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
function NumberField({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; }) {
  return (
    <label className="text-sm flex flex-col gap-1">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring"
      />
    </label>
  );
}

function PlayerEditor({
  players, setPlayers,
}: { players: Player[]; setPlayers: React.Dispatch<React.SetStateAction<Player[]>>; }) {
  const update = (id: string, patch: Partial<Player>) =>
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => setPlayers((prev) => prev.filter((p) => p.id !== id));
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
          {players.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) => update(p.id, { selected: e.target.checked })}
                />
              </td>
              <td className="p-2">
                <input
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  className="px-2 py-1 rounded border border-slate-200 w-full"
                />
              </td>
              <td className="p-2">
                <select
                  value={p.gender}
                  onChange={(e) => update(p.id, { gender: e.target.value as Gender })}
                  className="px-2 py-1 rounded border border-slate-200"
                >
                  {genders.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <LevelPills
                  value={(p.level ?? (p.skill as Level) ?? 1) as Level} // 容錯
                  onChange={(lv) => update(p.id, { level: lv, skill: lv /* skill=level */ })}
                />
              </td>
              <td className="p-2 text-right">
                <button className="text-red-500 hover:underline" onClick={() => remove(p.id)}>
                  刪除
                </button>
              </td>
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
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200" />
        </label>
        <label className="text-sm">
          <div className="text-slate-600">性別</div>
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}
            className="px-3 py-2 rounded-xl border border-slate-200">
            {genders.map((g) => (<option key={g} value={g}>{g}</option>))}
          </select>
        </label>
        <label className="text-sm">
          <div className="text-slate-600 mb-1">等級(1-8)</div>
          <LevelPills value={level} onChange={setLevel} />
        </label>
        <button
          className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700"
          onClick={() => {
            if (!name.trim()) return;
            onAdd({
              id: uid(),
              name: name.trim(),
              gender,
              level,
              skill: level, // 同步
              selected: true,
            });
            setName(""); setGender("M"); setLevel(3);
          }}
        >加入</button>
      </div>
    </div>
  );
}

function ScheduleTable({ matches, courts }: { matches: MatchAssignment[]; courts: number; }) {
  const bySlot = new Map<number, MatchAssignment[]>();
  for (const m of matches) {
    if (!bySlot.has(m.slotIndex)) bySlot.set(m.slotIndex, []);
    bySlot.get(m.slotIndex)!.push(m);
  }
  const orderedSlots = [...bySlot.keys()].sort((a, b) => a - b);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="text-left p-2">時間</th>
            {[...Array(courts)].map((_, i) => (
              <th key={i} className="text-left p-2">第 {i + 1} 場地</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedSlots.map((sIdx) => {
            const slotMatches = bySlot.get(sIdx)!;
            const mByCourt: (MatchAssignment | null)[] = Array.from({ length: courts }, () => null);
            for (const m of slotMatches) mByCourt[m.court - 1] = m;
            const start = slotMatches[0]?.start;
            const end = slotMatches[0]?.end;
            return (
              <tr key={sIdx} className="border-t align-top">
                <td className="p-2 whitespace-nowrap text-slate-600">
                  <div>{start ? `${formatTime(start)}–${formatTime(end!)}` : "—"}</div>
                </td>
                {mByCourt.map((m, i) => (
                  <td key={i} className="p-2">
                    {m ? <MatchCard m={m} /> : <div className="text-slate-400 italic">（此時段空場）</div>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ m }: { m: MatchAssignment }) {
  const teamLine = (t: Player[]) =>
    `${t[0].name}（${t[0].gender}/${levelLabel((t[0].level ?? 1) as Level)}） / ${t[1].name}（${t[1].gender}/${levelLabel((t[1].level ?? 1) as Level)}）`;
  return (
    <div className="rounded-xl border border-slate-200 p-2 print:p-1">
      <div className="text-xs text-slate-500 mb-1">
        時間：{formatTime(m.start)}–{formatTime(m.end)}　場地：{m.court}
      </div>
      <div className="font-medium mb-1">A隊：{teamLine(m.teams[0])}</div>
      <div className="font-medium mb-2">B隊：{teamLine(m.teams[1])}</div>
      <div className="text-xs text-slate-600">
        主審：{m.officials.umpire.name}　線審：{m.officials.line1.name}、{m.officials.line2.name}
      </div>
    </div>
  );
}

/* 匯出 CSV（Excel 可直接開啟） */
function exportScheduleCSV(matches: MatchAssignment[]) {
  if (!matches?.length) return;

  const header = [
    "時間", "場地",
    "A1", "A1(性別/Lv)", "A2", "A2(性別/Lv)",
    "B1", "B1(性別/Lv)", "B2", "B2(性別/Lv)",
    "主審", "線審1", "線審2"
  ];

  const rows = [...matches]
    .sort((a, b) => a.slotIndex - b.slotIndex || a.court - b.court)
    .map((m) => {
      const tA = m.teams[0], tB = m.teams[1];
      const fmtP = (p: Player) => `${p.gender}/${levelLabel(((p.level ?? 1) as Level))}`;
      const time = `${formatTime(m.start)}-${formatTime(m.end)}`;
      return [
        time, `第${m.court}場地`,
        tA[0].name, fmtP(tA[0]),
        tA[1].name, fmtP(tA[1]),
        tB[0].name, fmtP(tB[0]),
        tB[1].name, fmtP(tB[1]),
        m.officials.umpire.name,
        m.officials.line1.name,
        m.officials.line2.name
      ];
    });

  const csv = [header, ...rows].map(r =>
    r.map(cell => {
      const s = String(cell ?? "");
      if (s.includes(",") || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `badminton-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* 範例資料 */
function samplePlayers(): Player[] {
  const base: Array<{ name: string; gender: Gender; level: Level }> = [
    { name: "阿豪", gender: "M", level: 6 },
    { name: "小美", gender: "F", level: 4 },
    { name: "建志", gender: "M", level: 5 },
    { name: "佳怡", gender: "F", level: 3 },
    { name: "Eric", gender: "M", level: 8 },
    { name: "Iris", gender: "F", level: 7 },
    { name: "Tom", gender: "M", level: 2 },
    { name: "Nina", gender: "F", level: 3 },
    { name: "Allen", gender: "M", level: 4 },
    { name: "Ruby", gender: "F", level: 2 },
  ];
  // 一開始就填好 skill = level；若未來從舊資料載入，useEffect 會再校正一次
  return base.map((b) => ({ id: uid(), selected: true, ...b, skill: b.level }));
}
