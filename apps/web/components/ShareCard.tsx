"use client";

import { useState } from "react";

/** 称号:按今日 agent-hours 分档,一张图一个身份 */
function title(hours: number): string {
  if (hours >= 8) return "数字资本家";
  if (hours >= 4) return "AI 包工头";
  if (hours >= 1) return "赛博监工";
  if (hours > 0) return "AI 学徒";
  return "刚开工";
}

/** 在岗版分享图:1080×1350,黄底黑边 Neo-Brutalism,canvas 直出 PNG */
function draw(hours: number, liveNow: number, dateStr: string): string {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const F = '"PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif';
  const ink = "#111111";

  ctx.fillStyle = "#FFD93D";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 16;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.fillStyle = ink;
  ctx.font = `900 52px ${F}`;
  ctx.fillText("AGENTOSITY", 100, 160);
  ctx.font = `700 36px ${F}`;
  ctx.fillText("AI 时代的考勤系统", 100, 214);
  ctx.textAlign = "right";
  ctx.fillText(dateStr, W - 100, 160);
  ctx.textAlign = "left";

  ctx.font = `900 78px ${F}`;
  ctx.fillText("我还没下班,", 100, 400);
  ctx.fillText("我的 Agent 团队已经开工了", 100, 505);

  // 主数字:今天替我干的小时数
  ctx.font = `900 300px ${F}`;
  const numStr = String(hours);
  ctx.fillText(numStr, 100, 850);
  const numW = ctx.measureText(numStr).width;
  ctx.font = `900 84px ${F}`;
  ctx.fillText("小时", 100 + numW + 24, 850);
  ctx.font = `700 44px ${F}`;
  ctx.fillStyle = "rgba(17,17,17,0.65)";
  ctx.fillText("今天我的 Agent 替我干的活(真实活跃时长,挂机不算)", 100, 925);

  ctx.fillStyle = ink;
  if (liveNow > 0) {
    ctx.font = `900 56px ${F}`;
    ctx.fillText(`⚡ 此刻还有 ${liveNow} 个在替我跑着`, 100, 1030);
  }

  // 称号徽章:白底黑边硬阴影
  const badge = `「${title(hours)}」`;
  ctx.font = `900 64px ${F}`;
  const bw = ctx.measureText(badge).width + 80;
  const bx = 100, by = 1080, bh = 110;
  ctx.fillStyle = ink;
  ctx.fillRect(bx + 10, by + 10, bw, bh);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = ink;
  ctx.fillText(badge, bx + 40, by + 78);

  ctx.font = `700 38px ${F}`;
  ctx.fillText("Humans clock out. Agents clock in.", 100, 1272);
  ctx.textAlign = "right";
  ctx.fillText("agentosity.com", W - 100, 1272);
  ctx.textAlign = "left";

  return cv.toDataURL("image/png");
}

export default function ShareCardButton({ hours, liveNow }: { hours: number; liveNow: number }) {
  const [img, setImg] = useState<string | null>(null);
  const dateStr = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "long", day: "numeric",
  }).format(new Date());

  return (
    <>
      <button
        onClick={() => setImg(draw(hours, liveNow, dateStr))}
        className="nb-btn mt-3 bg-white px-4 py-2 text-sm font-black"
      >
        📸 生成炫耀图
      </button>
      {img && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setImg(null)}>
          <div className="max-h-full max-w-sm overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Agentosity 分享图" className="w-full border-4 border-black" />
            <div className="mt-3 flex items-center justify-center gap-3">
              <a href={img} download="agentosity.png"
                className="nb-btn bg-[var(--nb-yellow)] px-5 py-2 font-black">下载图片</a>
              <button onClick={() => setImg(null)} className="nb-btn bg-white px-5 py-2 font-black">关闭</button>
            </div>
            <p className="mt-2 text-center text-xs font-bold text-white">手机上长按图片保存,发到朋友圈/群里正好</p>
          </div>
        </div>
      )}
    </>
  );
}
