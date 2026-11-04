#!/usr/bin/env node
/*
 * 카카오톡·문자·밴드 등에서 링크를 공유할 때 보이는 미리보기를 만듭니다.
 *
 *   node tools/make_share.js                 (기본 주소 사용)
 *   SITE_URL=https://내주소.vercel.app node tools/make_share.js
 *
 * 만들어지는 것
 *   assets/og/home.png, assets/og/<반ID>.png   미리보기 이미지 (1200×630)
 *   index.html, <반ID>/index.html             공유 태그(og:title 등)가 들어간 페이지
 *   assets/icon-64.png, assets/icon-180.png    탭·홈 화면 아이콘
 *
 * 필요: Playwright (npm i playwright)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SITE_URL = (process.env.SITE_URL || "https://jndeuhomepage4.vercel.app").replace(/\/$/, "");
const SITE_NAME = "가정통신문&식단표";
const CENTER = "성민 중랑구발달장애인평생교육센터";
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data/index.json"), "utf8"));
const logo = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "assets/logo.png")).toString("base64");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = `"Pretendard","Noto Sans CJK KR","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif`;

function cardHTML({ title, sub, color, chips }) {
  return `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;font-family:${FONT};background:#f4f2ee;color:#1d1f1e;word-break:keep-all;overflow:hidden}
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;padding:64px 72px 56px}
    .band{position:absolute;left:0;top:0;bottom:0;width:24px;background:${color}}
    .logo{height:58px}
    .logo img{height:100%;display:block}
    h1{font-size:${title.length > 8 ? 104 : 124}px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin-top:auto;color:${color}}
    .sub{font-size:44px;font-weight:700;margin-top:18px;color:#2a2d2b}
    .chips{display:flex;gap:12px;margin-top:40px;flex-wrap:wrap}
    .chip{font-size:28px;font-weight:700;padding:10px 22px;border-radius:999px;color:#fff}
    .chips.many{gap:10px;flex-wrap:nowrap}.chips.many .chip{font-size:24px;padding:9px 17px}
    .dots{position:absolute;right:72px;top:64px;display:flex;gap:10px}
    .dots i{width:22px;height:22px;border-radius:50%;display:block}
  </style>
  <div class="band"></div>
  <div class="dots">${index.classes.map((c) => `<i style="background:${c.color}"></i>`).join("")}</div>
  <div class="wrap">
    <div class="logo"><img src="${logo}"></div>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(sub)}</div>
    <div class="chips${chips.length > 5 ? " many" : ""}">${chips.map((c) => `<span class="chip" style="background:${c.color}">${esc(c.text)}</span>`).join("")}</div>
  </div>`;
}

function shareBlock({ title, desc, url, image }) {
  return [
    `<!-- SHARE:START (tools/make_share.js 가 자동으로 만듭니다) -->`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="theme-color" content="#2f7d5b" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<!-- SHARE:END -->`,
  ].join("\n  ");
}

(async () => {
  const template = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (!/<!-- SHARE:START[\s\S]*?<!-- SHARE:END -->/.test(template)) throw new Error("index.html 에 SHARE 표시가 없어요");
  const withShare = (block) => template.replace(/<!-- SHARE:START[\s\S]*?<!-- SHARE:END -->/, block);

  const pages = [
    {
      id: "home",
      file: "index.html",
      url: `${SITE_URL}/`,
      title: `${SITE_NAME} · ${CENTER}`,
      desc: "반별 오늘 시간표, 이번 달 식단표, 가정통신문 안내를 한눈에 확인하세요.",
      card: { title: SITE_NAME, sub: "반별 시간표 · 식단표 · 가정통신문 안내", color: "#2f7d5b", chips: index.classes.map((c) => ({ text: c.name, color: c.color })) },
    },
    ...index.classes.map((c) => ({
      id: c.id,
      file: `${c.id}/index.html`,
      url: `${SITE_URL}/${c.id}`,
      title: `${c.name} ${SITE_NAME}`,
      desc: `${c.name}의 오늘 시간표${c.meals === false ? "" : ", 식단표"}, 이번 달 가정통신문을 확인하세요. · ${CENTER}`,
      card: { title: c.name, sub: SITE_NAME, color: c.color,
        chips: (c.meals === false ? ["오늘 시간표", "이번 달 일정", "가정통신문"] : ["오늘 시간표", "식단표", "가정통신문"]).map((t) => ({ text: t, color: c.color })) },
    })),
  ];

  fs.mkdirSync(path.join(ROOT, "assets/og"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const p of pages) {
    await page.setContent(cardHTML(p.card), { waitUntil: "load" });
    const imgPath = path.join(ROOT, `assets/og/${p.id}.png`);
    await page.screenshot({ path: imgPath });
    // 이미지가 바뀌면 주소(?v=)도 바뀌어서, 카카오톡이 예전에 저장한 이미지를 다시 쓰지 않아요
    const ver = crypto.createHash("sha1").update(fs.readFileSync(imgPath)).digest("hex").slice(0, 8);
    const html = withShare(shareBlock({ title: p.title, desc: p.desc, url: p.url, image: `${SITE_URL}/assets/og/${p.id}.png?v=${ver}` }));
    fs.mkdirSync(path.dirname(path.join(ROOT, p.file)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, p.file), html);
    console.log(`✔ ${p.file}  ←  assets/og/${p.id}.png  (${p.url})`);
  }

  // 아이콘: 로고 왼쪽 엠블럼 부분만 잘라 정사각형으로
  for (const size of [64, 180]) {
    const ip = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await ip.setContent(`<style>*{margin:0}body{width:${size}px;height:${size}px;background:transparent;overflow:hidden;position:relative}
      img{position:absolute;height:${size * 1.04}px;left:0;top:${-size * 0.02}px}</style>
      <div style="position:absolute;inset:0;overflow:hidden;width:${size}px"><img src="${logo}"></div>`);
    await ip.screenshot({ path: path.join(ROOT, `assets/icon-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await ip.close();
  }
  console.log("✔ assets/icon-64.png, assets/icon-180.png");
  await browser.close();
})();
