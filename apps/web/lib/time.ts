const TZ = "Asia/Shanghai";

/** 上海时区的 { 日期, 时, 分 } */
export function shanghaiNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
  };
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateStr: string): boolean {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/** 打卡归属日:5:00 分界(凌晨 0:00-4:59 归前一天) */
export function todayKey(now = new Date()): string {
  const s = shanghaiNow(now);
  return s.hour < 5 ? shiftDate(s.date, -1) : s.date;
}

/** 揭榜日:每天 10:00 公布昨天的榜;10:00 前看前天;周末回退到最近工作日 */
export function revealDayKey(now = new Date()): string {
  const s = shanghaiNow(now);
  let day = shiftDate(todayKey(now), -1);
  if (s.hour >= 5 && s.hour < 10) day = shiftDate(day, -1);
  while (isWeekend(day)) day = shiftDate(day, -1);
  return day;
}

/** 1077 → "17:57";>1440 → "次日 01:30" */
export function fmtMinutes(m: number | null | undefined): string {
  if (m == null) return "—";
  const overnight = m >= 1440;
  const mm = Math.round(m) % 1440;
  const h = String(Math.floor(mm / 60)).padStart(2, "0");
  const min = String(mm % 60).padStart(2, "0");
  return `${overnight ? "次日 " : ""}${h}:${min}`;
}
