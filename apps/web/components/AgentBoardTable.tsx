import { fmtMinutes } from "@/lib/time";

export type AgentBoardRow = {
  name: string;
  active_hours: number;
  daa_today: number;
  members: number;
  human_avg_minutes: number | null;
  leverage: number | null;
  live_now: number;
  working_now: number;
};

/** Agentosity 指数:100×L/(L+1),50 分 = AI 与人打平;无人类打卡数据不出分 */
export function agentosityScore(leverage: number | null): number | null {
  if (leverage == null || leverage <= 0) return null;
  return Math.round((100 * leverage) / (leverage + 1));
}

/** Agent 工时榜表格:首页与榜单页共用,列头悬停有口径定义 */
export default function AgentBoardTable({
  rows,
  limit = 20,
  hoursHeader = "agent-hours(今日)",
  hoursSuffix = "h",
  hoursOf = (h) => h,
}: {
  rows: AgentBoardRow[];
  limit?: number;
  hoursHeader?: string;
  hoursSuffix?: string;
  hoursOf?: (h: number) => number;
}) {
  return (
    <table className="mt-4 w-full min-w-[600px] text-sm">
      <thead>
        <tr className="text-left font-black" style={{ borderBottom: "3px solid var(--nb-ink)" }}>
          <th className="py-2">#</th>
          <th>公司</th>
          <th className="text-right" title="该公司全部 Agent 真实干活的时长(探针过滤,不含挂机)">
            {hoursHeader}
          </th>
          <th className="text-right" title="近 7 天打过卡或有 Agent 会话的人数">成员</th>
          <th className="text-right" title="Daily Active Agents:今天真实干过活的 Agent 会话数">
            DAA(今日)
          </th>
          <th className="text-right"
            title="Agentosity 指数 = 100×L/(L+1),L = agent-hours ÷ 人类工时。50 分 = AI 干的活与人类打平">
            Agentosity 指数
          </th>
          <th className="text-right" title="此刻:正在干活数/在岗总数">在岗</th>
        </tr>
      </thead>
      <tbody className="font-bold">
        {rows.slice(0, limit).map((r, i) => (
          <tr key={r.name} className="border-b border-dashed border-black/20">
            <td className="py-2 font-black">{i + 1}</td>
            <td>{r.name}</td>
            <td className="text-right tabular-nums font-black">
              {hoursOf(r.active_hours)} <span className="text-xs opacity-50">{hoursSuffix}</span>
            </td>
            <td className="text-right tabular-nums">{r.members}</td>
            <td className="text-right tabular-nums">{r.daa_today}</td>
            <td className="text-right tabular-nums">
              {agentosityScore(r.leverage) != null ? (
                <span
                  className="font-black"
                  title={`人均 ${r.human_avg_minutes != null ? fmtMinutes(r.human_avg_minutes) : "—"} 走 · 杠杆 ${r.leverage}`}
                >
                  {agentosityScore(r.leverage)}
                </span>
              ) : (
                <span className="opacity-30" title="需要人类打卡数据才能计算">—</span>
              )}
            </td>
            <td className="text-right">
              {r.live_now > 0 ? (
                <span className="bg-[var(--nb-green)] px-2 py-0.5 text-xs font-black tabular-nums">
                  ⚡{r.working_now}/{r.live_now}
                </span>
              ) : (
                <span className="opacity-30">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
