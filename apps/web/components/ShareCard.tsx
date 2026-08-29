"use client";

import { useState } from "react";
import QRCode from "qrcode";

const PINK = "#ff6b9d";
const GREEN = "#6bcb77";
const BLUE = "#4d96ff";
const INK = "#111111";
const YELLOW = "#ffd93d";

/** 称号:按今日 agent-hours 分档,一张图一个身份 */
function title(hours: number): string {
  if (hours >= 8) return "数字资本家";
  if (hours >= 4) return "AI 包工头";
  if (hours >= 1) return "赛博监工";
  if (hours > 0) return "AI 学徒";
  return "刚开工";
}

/** 硬阴影矩形:Neo-Brutalism 基础件 */
function nbRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string) {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 10, y + 10, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(x, y, w, h);
}

/** 在岗版分享图:1080×1350,黄底多色 Neo-Brutalism,canvas 直出 PNG */
async function draw(hours: number, liveNow: number, dateStr: string): Promise<string> {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const F = '"PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif';

  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 16;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // 顶部品牌条:粉色块,视觉先声夺人
  nbRect(ctx, 84, 96, 460, 96, PINK);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 52px ${F}`;
  ctx.fillText("AGENTOSITY", 116, 162);
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${F}`;
  ctx.fillText("AI 时代的考勤系统", 96, 248);
  ctx.textAlign = "right";
  ctx.font = `900 40px ${F}`;
  ctx.fillText(dateStr, W - 100, 158);
  ctx.textAlign = "left";

  ctx.font = `900 64px ${F}`;
  ctx.fillStyle = INK;
  ctx.fillText("我还没下班,", 100, 380);
  ctx.fillText("我的 Agent 团队已经开工了", 100, 470);

  // 主数字:白色底板托起,更跳
  nbRect(ctx, 84, 560, W - 168 - 10, 400, "#ffffff");
  ctx.fillStyle = INK;
  ctx.font = `900 280px ${F}`;
  const numStr = String(hours);
  ctx.fillText(numStr, 130, 850);
  const numW = ctx.measureText(numStr).width;
  ctx.font = `900 80px ${F}`;
  ctx.fillText("小时", 130 + numW + 24, 850);
  ctx.font = `800 40px ${F}`;
  ctx.fillStyle = BLUE;
  ctx.fillText("发呆、挂机、等指令的时间,一秒没算进来", 130, 922);

  // 「实打实」盖章:斜着盖在主数字右上角,口径一眼可读
  ctx.save();
  ctx.translate(790, 610);
  ctx.rotate(-0.1);
  ctx.fillStyle = INK;
  ctx.fillRect(8, 8, 210, 130);
  ctx.fillStyle = PINK;
  ctx.fillRect(0, 0, 210, 130);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 210, 130);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 52px ${F}`;
  ctx.fillText("实打实", 26, 60);
  ctx.font = `900 34px ${F}`;
  ctx.fillText("纯干活时长", 20, 108);
  ctx.restore();

  ctx.fillStyle = INK;
  if (liveNow > 0) {
    ctx.font = `900 46px ${F}`;
    ctx.fillText(`⚡ 此刻还有 ${liveNow} 个在替我跑着`, 100, 1046);
  }

  // 称号徽章:绿色
  const badge = `「${title(hours)}」`;
  ctx.font = `900 60px ${F}`;
  const bw = ctx.measureText(badge).width + 72;
  nbRect(ctx, 100, 1090, bw, 104, GREEN);
  ctx.fillStyle = INK;
  ctx.fillText(badge, 136, 1163);

  // 二维码:微信长按识别直达主页
  const qr = await QRCode.toDataURL("https://agentosity.com", {
    width: 200, margin: 1, color: { dark: INK, light: "#ffffff" },
  });
  const qrImg = new Image();
  await new Promise((res) => { qrImg.onload = res; qrImg.src = qr; });
  nbRect(ctx, W - 320, 1030, 220, 220, "#ffffff");
  ctx.drawImage(qrImg, W - 310, 1040, 200, 200);

  ctx.fillStyle = "rgba(17,17,17,0.7)";
  ctx.font = `700 34px ${F}`;
  ctx.fillText("Humans clock out. Agents clock in.", 100, 1250);
  ctx.fillStyle = INK;
  ctx.font = `900 40px ${F}`;
  ctx.fillText("agentosity.com", 100, 1292);

  return cv.toDataURL("image/png");
}

export default function ShareCardButton({ hours, liveNow }: { hours: number; liveNow: number }) {
  const [img, setImg] = useState<string | null>(null);
  const dateStr = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "long", day: "numeric",
  }).format(new Date());

  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `我还没下班,我的 Agent 团队今天已经替我干了 ${hours} 小时 ⚡ AI 时代的考勤系统`
  )}&url=${encodeURIComponent("https://agentosity.com")}`;

  return (
    <>
      <button
        onClick={async () => setImg(await draw(hours, liveNow, dateStr))}
        className="nb-btn mt-3 bg-white px-4 py-2 text-sm font-black"
      >
        📸 生成分享图
      </button>
      {img && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setImg(null)}>
          <div className="max-h-full max-w-sm overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Agentosity 分享图" className="w-full border-4 border-black" />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <a href={img} download="agentosity.png"
                className="nb-btn bg-[var(--nb-yellow)] px-5 py-2 font-black">下载图片</a>
              <a href={tweet} target="_blank" rel="noreferrer"
                className="nb-btn bg-[var(--nb-ink)] px-5 py-2 font-black text-white">分享到 𝕏</a>
              <button onClick={() => setImg(null)} className="nb-btn bg-white px-5 py-2 font-black">关闭</button>
            </div>
            <p className="mt-2 text-center text-xs font-bold text-white">
              手机长按图片保存 · 微信里对方长按二维码就能进主页
            </p>
          </div>
        </div>
      )}
    </>
  );
}
