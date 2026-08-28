import Link from "next/link";

export default function Nav() {
  return (
    <nav className="sticky top-0 z-10 border-b-3 bg-[var(--nb-yellow)]"
      style={{ borderBottom: "3px solid var(--nb-ink)" }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-2xl font-black tracking-tight">
          下班榜<span className="ml-1 align-super text-xs font-bold">βeta</span>
        </Link>
        <div className="flex gap-2 text-sm font-extrabold">
          <Link className="nb-btn bg-white px-3 py-1" href="/">揭榜</Link>
          <Link className="nb-btn bg-[var(--nb-pink)] px-3 py-1 text-white" href="/checkin">打卡</Link>
          <Link className="nb-btn bg-white px-3 py-1" href="/me">我的</Link>
          <Link className="nb-btn bg-[var(--nb-ink)] px-3 py-1 text-white" href="/agents">Agent榜</Link>
        </div>
      </div>
    </nav>
  );
}
