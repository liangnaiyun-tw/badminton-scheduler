import React, { useEffect, useMemo, useState } from "react";
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
{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => {
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
export default function SchedulePage() {
  const [players, setPlayers] = useState<Player[]>(() => samplePlayers());
  const [settings, setSettings] = useState<Settings>(() => ({
    courts: 2,
    slotMinsLong: 12,
    slotMinsShort: 8,
    shortMatchThreshold: 7,
    preferMixed: true,
    dateISO: new Date().toISOString().slice(0, 10),
    startHH: 10,
    startMM: 10,
    endHH: 12,
    endMM: 0,
    maxSameTeammateTogether: 1,
    maxSameOpponent: 2,
    maxConsecutivePlays: 2,
    strongFemaleAsMale: true,
    strongLevelThreshold: 7,
    reroll: 0,
    shareOfficialsAcrossCourts: false,
    officialsPerCourt: 2, // 每場需要 2 位執法官
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
      const copy = prev.map(m => ({ ...m, teams: [[...m.teams[0]], [...m.teams[1]]] as [Player[], Player[]] }));
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
              <NumberField label="短局門檻（players > 球場數×此值）" value={settings.shortMatchThreshold} min={6} max={16} onChange={(v) => setSettings({ ...settings, shortMatchThreshold: v })} />
              <div className="flex items-center gap-2">
                <input id="mixed" type="checkbox" checked={settings.preferMixed} onChange={(e) => setSettings({ ...settings, preferMixed: e.target.checked })} />
                <label htmlFor="mixed" className="text-sm">偏好混雙</label>
              </div>
              {/* 新增：同時段可共用執法 */}
              <div className="flex items-center gap-2">
                <input
                  id="shareOfficials"
                  type="checkbox"
                  checked={!!settings.shareOfficialsAcrossCourts}
                  onChange={(e) =>
                    setSettings({ ...settings, shareOfficialsAcrossCourts: e.target.checked })
                  }
                />
                <label htmlFor="shareOfficials" className="text-sm">
                  同時段可共用執法
                </label>
              </div>
              {/* 新增：每場需要的裁判人數 */}
              <div className="flex items-center gap-2">
                <label htmlFor="officialsPerCourt" className="text-sm whitespace-nowrap">
                  每場裁判人數
                </label>
                <select
                  id="officialsPerCourt"
                  className="border rounded px-2 py-1 text-sm"
                  value={settings.officialsPerCourt ?? 2}
                  onChange={(e) =>
                    setSettings({ ...settings, officialsPerCourt: Number(e.target.value) as 1 | 2 | 3 })
                  }
                >
                  <option value={1}>1（僅主審）</option>
                  <option value={2}>2（主審+1線審）</option>
                  <option value={3}>3（主審+2線審）</option>
                </select>
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
            <th className="text-left p-2">等級(1-12)</th>
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
          <div className="text-slate-600 mb-1">等級(1-12)</div>
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
  const orderedSlots = [...bySlot.keys()].sort((a, b) => a - b);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="text-left p-2">時間</th>
            {[...Array(courts)].map((_, i) => (<th key={i} className="text-left p-2">第 {i + 1} 場地</th>))}
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
                {mByCourt.map((m, i) => (
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
  const header = ["時間", "場地", "A1", "A1(性別/Lv)", "A2", "A2(性別/Lv)", "B1", "B1(性別/Lv)", "B2", "B2(性別/Lv)", "主審", "線審1", "線審2"];
  const rows = [...matches].sort((a, b) => a.slotIndex - b.slotIndex || a.court - b.court).map(m => {
    const tA = m.teams[0], tB = m.teams[1];
    const fmtP = (p: Player) => `${p.gender}/${levelLabel((p.level ?? 1) as Level)}`;
    const time = `${formatTime(m.start)}-${formatTime(m.end)}`;
    return [time, `第${m.court}場地`, tA[0].name, fmtP(tA[0]), tA[1].name, fmtP(tA[1]), tB[0].name, fmtP(tB[0]), tB[1].name, fmtP(tB[1]), m.officials.umpire.name, m.officials.line1.name, m.officials.line2.name];
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
    { name: "慶", gender: "M", level: 7 },
    { name: "宇", gender: "M", level: 5 },
    { name: "志", gender: "M", level: 7 },
    { name: "江", gender: "F", level: 4 },
    { name: "勛", gender: "M", level: 8 },
    { name: "源", gender: "M", level: 5 },
    { name: "強", gender: "M", level: 6 }
    // { name: "哲", gender: "M", level: 6 },
    // { name: "任", gender: "M", level: 7 },
    // { name: "懋", gender: "M", level: 8 },
    // { name: "澤", gender: "M", level: 3 },
    // { name: "尼", gender: "F", level: 9 },
    // { name: "湘", gender: "F", level: 3 },
    // { name: "珠", gender: "F", level: 5 },
    // { name: "菱", gender: "F", level: 5 },
    // { name: "欣", gender: "F", level: 1 },

  ];
  return base.map((b) => ({ id: uid(), name: b.name, selected: true, skill: b.level, level: b.level, gender: b.gender }));
}
