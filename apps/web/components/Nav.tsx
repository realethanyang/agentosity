import Link from "next/link";

export default function Nav() {
  return (
    <nav className="sticky top-0 z-10 bg-[var(--nb-yellow)]"
      style={{ borderBottom: "3px solid var(--nb-ink)" }}>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <Link href="/" className="text-2xl font-black tracking-tight">
          Agentosity<span className="ml-2 align-middle text-[10px] font-bold opacity-60">AI 时代的考勤系统</span>
        </Link>
        <div className="flex flex-wrap gap-2 text-xs font-extrabold sm:text-sm">
          <Link className="nb-btn bg-white px-2 py-1 sm:px-3" href="/">仪表盘</Link>
          <Link className="nb-btn bg-white px-2 py-1 sm:px-3" href="/leaderboard">榜单</Link>
          <Link className="nb-btn bg-[var(--nb-pink)] px-2 py-1 text-white sm:px-3" href="/me">我的</Link>
        </div>
      </div>
    </nav>
  );
}
