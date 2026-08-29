export const metadata = { title: "用户群 — Agentosity" };

/** 用户测试反馈群:微信扫码进群 */
export default function CommunityPage() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10 text-center">
      <h1 className="text-3xl font-black">用户反馈群</h1>
      <p className="mt-2 text-sm font-bold opacity-60">
        吐槽、报 bug、提想法、新功能抢先看 —— 微信扫码进群,产品作者就在群里
      </p>
      <div className="nb-card mx-auto mt-6 inline-block bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wechat-group-qr.jpg" alt="Agentosity 微信用户群二维码" className="w-72" />
      </div>
      <p className="mt-4 text-xs font-bold opacity-50">
        二维码过期了?去{" "}
        <a href="https://github.com/realethanyang/agentosity/issues" target="_blank" rel="noopener" className="underline">
          GitHub Issues
        </a>{" "}
        喊一声
      </p>
    </main>
  );
}
