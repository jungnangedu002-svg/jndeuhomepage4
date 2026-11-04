/* 가정통신문&식단표 — 중랑구발달장애인평생교육센터
 * 주소 형식:  /            → 반 선택 화면
 *             /#/jarip1    → 자립지원1반 화면 (오늘)
 *             /#/jarip1/menu | week | month | elective | outing | info
 * 테스트용:   ?now=2026-11-04T11:20  (현재 시각을 고정)
 */
(() => {
  "use strict";

  const TABS = [
    ["today", "오늘"],
    ["menu", "식단표"],
    ["week", "이번 주"],
    ["month", "이번 달"],
    ["elective", "선택과목"],
    ["outing", "외부활동"],
    ["info", "안내"],
  ];
  const WD = ["일", "월", "화", "수", "목", "금", "토"];

  const ICONS = [
    [/점심|식사/, "🍚"], [/정리|청소/, "🧹"], [/태권/, "🥋"], [/원예|식물/, "🌱"], [/음악|노래/, "🎵"],
    [/DIY|공예/, "✂️"], [/생활체육|운동|스포츠|체육|레포츠/, "🏃"], [/지역사회|나들이|이동|트레킹/, "🚌"],
    [/도서관/, "📚"], [/직업|사무|작업/, "💼"], [/미술|창작|디자인|아트|그리기/, "🎨"],
    [/의사소통|손담/, "💬"], [/자치회의|회의/, "🗣️"], [/안전/, "🦺"], [/요리|파티시에|쿠키/, "🍳"],
    [/선택/, "⭐"], [/정보화|컴퓨터/, "💻"], [/일상생활/, "🧺"], [/취미/, "🧶"], [/보드게임|게임/, "🎲"],
  ];
  const find = (s) => (ICONS.find(([re]) => re.test(s)) || [])[1];
  const icon = (cat, detail = "") => find(cat) || find(detail) || "📌";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $app = document.getElementById("app");
  const LOGO_ALT = "사회복지법인 성민 중랑구발달장애인평생교육센터";
  const LOGO = `<span class="logo"><img src="/assets/logo.png" alt="${LOGO_ALT}" width="1164" height="84" /></span>`;
  const cache = {};
  let index = null;
  let state = { cls: null, tab: "today", date: null, weekOffset: 0 };
  let timer = null;

  /* ---------- 시간 (한국 시간 기준) ---------- */
  const fixedNow = new URLSearchParams(location.search).get("now");
  const fixedOffset = fixedNow ? new Date(fixedNow + "+09:00").getTime() - Date.now() : 0;
  function now() {
    const d = new Date(Date.now() + fixedOffset);
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
        .formatToParts(d).map((x) => [x.type, x.value])
    );
    return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, s: +p.second, mins: +p.hour * 60 + +p.minute };
  }
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, withWd = true) => { const d = parseDate(s); return `${d.getMonth() + 1}월 ${d.getDate()}일${withWd ? ` (${WD[d.getDay()]})` : ""}`; };

  /* ---------- 데이터 ---------- */
  async function getJSON(url) {
    if (!cache[url]) cache[url] = fetch(url, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
    return cache[url];
  }
  async function loadIndex() { index = index || (await getJSON("/data/index.json")); return index; }
  async function loadClass(id, month) { return getJSON(`/data/${month || index.latest}/${id}.json`); }
  async function loadMenu(month) {
    const menu = await getJSON(`/data/${month || index.latest}/menu.json`).catch(() => null);
    return menu && { ...menu, byDate: Object.fromEntries(menu.days.map((d) => [d.date, d])) };
  }

  function blockStatus(day, b, n) {
    if (day.date < n.date) return "done";
    if (day.date > n.date) return "todo";
    const s = toMin(b.start), e = toMin(b.end);
    return n.mins >= e ? "done" : n.mins >= s ? "current" : "todo";
  }
  function pickDefaultDate(data, n) {
    const ds = data.days.map((d) => d.date);
    if (ds.includes(n.date)) return n.date;
    return ds.find((d) => d > n.date) || ds[ds.length - 1];
  }

  /* ---------- 라우팅 ---------- */
  function route() {
    // 공유용 주소(/jarip1)로 들어오면 그 반 화면을 열어요
    const pathId = location.pathname.replace(/^\/|\/$/g, "");
    if (!location.hash && /^[a-z0-9]+$/.test(pathId)) {
      history.replaceState(null, "", `/${location.search}#/${pathId}`);
    }
    const [, id, tab] = (location.hash || "#/").split("/");
    clearInterval(timer);
    if (!id) return renderHome();
    if (state.cls !== id) state = { cls: id, tab: "today", date: null, weekOffset: 0 };
    state.tab = TABS.some(([k]) => k === tab) ? tab : "today";
    renderClass();
  }
  window.addEventListener("hashchange", route);

  /* ---------- 홈 ---------- */
  async function renderHome() {
    await loadIndex();
    document.title = "가정통신문&식단표 · 성민 중랑구발달장애인평생교육센터";
    document.documentElement.style.setProperty("--accent", "#2f7d5b");
    const all = await Promise.all(index.months[index.latest].map((id) => loadClass(id)));
    const draw = () => {
      const n = now();
      const cards = all.map((d) => {
        const day = d.days.find((x) => x.date === n.date);
        let nowTxt = "오늘은 수업이 없어요";
        if (day) {
          const cur = day.blocks.find((b) => blockStatus(day, b, n) === "current");
          const nxt = day.blocks.find((b) => blockStatus(day, b, n) === "todo");
          if (cur) nowTxt = `<small>지금</small><b>${icon(cur.category)} ${esc(cur.category)}</b>`;
          else if (nxt) nowTxt = `<small>다음 · ${nxt.start}</small><b>${icon(nxt.category)} ${esc(nxt.category)}</b>`;
          else nowTxt = "오늘 수업이 끝났어요 👋";
        }
        return `<a class="class-card" href="#/${d.id}" style="--c:${d.color}">
          <span class="name">${esc(d.name)}</span>
          <span class="go">보러 가기 →</span>
          <span class="now">${nowTxt}</span></a>`;
      }).join("");
      const [y, m] = index.latest.split("-");
      $app.innerHTML = `<div class="wrap">
        <header class="home-head">
          <div class="center">${LOGO}</div>
          <h1>가정통신문&amp;식단표</h1>
          <p>${+y}년 ${+m}월 · ${fmtDate(n.date)} · 우리 반을 눌러 주세요</p>
        </header>
        <nav class="class-grid" aria-label="반 선택">${cards}</nav>
        <p class="home-foot">※ ${esc(all[0]?.disclaimer || "")}</p>
      </div>`;
    };
    draw();
    timer = setInterval(draw, 30000);
  }

  /* ---------- 반별 화면 ---------- */
  async function renderClass() {
    await loadIndex();
    let data;
    try { data = await loadClass(state.cls); } catch { location.hash = "#/"; return; }
    data.menu = await loadMenu(data.month);
    document.documentElement.style.setProperty("--accent", data.color);
    document.querySelector('meta[name="theme-color"]').content = data.color;
    document.title = `${data.name} 가정통신문&식단표`;
    const n = now();
    if (!state.date) state.date = pickDefaultDate(data, n);

    const tabs = TABS.map(([k, label]) =>
      `<button class="tab" role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${label}</button>`).join("");

    $app.innerHTML = `
      <header class="term-head"><div class="wrap">
        <div class="head-row">
          <a class="back" href="#/">← 반 선택</a>
          <div class="head-title"><div class="sub">${LOGO}<span>${esc(data.period)}</span></div><h1>${esc(data.name)}</h1></div>
          <button class="tool-btn" id="fs" title="전체화면">⛶ 전체화면</button>
          <div class="clock"><div class="time" id="clk"></div><div class="date" id="clkd"></div></div>
        </div>
        <nav class="tabs" role="tablist">${tabs}</nav>
      </div></header>
      <main class="wrap" id="view"></main>`;

    $app.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
      location.hash = `#/${state.cls}${b.dataset.tab === "today" ? "" : "/" + b.dataset.tab}`;
    }));
    document.getElementById("fs").addEventListener("click", () => {
      document.body.classList.toggle("kiosk");
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    });

    const tick = () => {
      const t = now();
      document.getElementById("clk").textContent = `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
      document.getElementById("clkd").textContent = fmtDate(t.date);
    };
    const draw = () => { tick(); VIEWS[state.tab](data); };
    draw();
    let last = now().mins;
    timer = setInterval(() => {
      tick();
      const t = now();
      if (t.mins !== last) { last = t.mins; if (state.tab === "today" || state.tab === "week") VIEWS[state.tab](data); }
    }, 1000);
  }

  const view = () => document.getElementById("view");

  const allergenChips = (menu, item) => item.allergens.length
    ? `<div class="allergens" aria-label="알레르기">${item.allergens.map((a) => `<span title="${esc(menu.allergens[a] || "")}">${a}.${esc(menu.allergens[a] || "")}</span>`).join("")}</div>` : "";

  const VIEWS = {
    menu(data) {
      const menu = data.menu;
      if (!menu) { view().innerHTML = `<div class="card no-class"><div class="emoji">🍱</div><h3>이번 달 식단표가 아직 없어요</h3></div>`; return; }
      const n = now();
      const dates = menu.days.map((d) => d.date);
      if (!dates.includes(state.date)) state.date = dates.find((d) => d >= n.date) || dates[dates.length - 1];
      const i = dates.indexOf(state.date);
      const day = menu.byDate[state.date];
      const isToday = state.date === n.date;
      const [main, ...rest] = day.items;
      const badge = isToday ? `<span class="badge">오늘</span>` : state.date < n.date ? `<span class="badge gray">지난 날</span>` : `<span class="badge soft">예정</span>`;

      // 같은 주(월~금) 식단표
      const d0 = parseDate(state.date); const mon = new Date(d0); mon.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
      const week = [0, 1, 2, 3, 4].map((k) => { const x = new Date(mon); x.setDate(mon.getDate() + k);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; });
      const rows = ["메인", "반찬1", "반찬2", "김치", "국", "밥"];
      const cellOf = (ds, r) => menu.byDate[ds]?.items[r];
      const head = week.map((ds) => `<th class="${ds === state.date ? "sel" : ""}${ds === n.date ? " is-today" : ""}">
          ${menu.byDate[ds] ? `<button data-day="${ds}">${fmtDate(ds)}</button>` : fmtDate(ds)}</th>`).join("");
      const body = rows.map((label, r) => `<tr class="r-${r}"><th scope="row">${label}</th>${week.map((ds) => {
          const it = cellOf(ds, r);
          return `<td class="${ds === state.date ? "sel" : ""}">${it ? esc(it.name) : menu.byDate[ds] ? "" : '<span class="none">급식 없음</span>'}</td>`;
        }).join("")}</tr>`).join("");

      view().innerHTML = `<div class="day-nav">
          <button class="nav-btn" data-go="-1" ${i <= 0 ? "disabled" : ""} aria-label="이전 날">◀</button>
          <h2>🍱 ${fmtDate(state.date)} 점심 ${badge}</h2>
          ${!isToday && dates.includes(n.date) ? `<button class="nav-btn" data-go="today">오늘로</button>` : ""}
          <button class="nav-btn" data-go="1" ${i >= dates.length - 1 ? "disabled" : ""} aria-label="다음 날">▶</button>
        </div>
        <article class="menu-card">
          <div class="menu-main"><span class="role">오늘의 메인</span><h3>${esc(main.name)}</h3>${allergenChips(menu, main)}</div>
          <ul class="menu-list">${rest.map((it) => `<li><span class="role">${esc(it.role)}</span><span class="nm">${esc(it.name)}</span>${allergenChips(menu, it)}</li>`).join("")}</ul>
        </article>
        <h2 class="section-title">이번 주 식단표</h2>
        <div class="menu-week-list">${week.filter((ds) => menu.byDate[ds]).map((ds) => { const it = menu.byDate[ds].items;
          return `<button class="mday${ds === state.date ? " sel" : ""}" data-day="${ds}"><div class="mday-h">${fmtDate(ds)}${ds === n.date ? ' <span class="badge">오늘</span>' : ""}</div>
            <div class="mday-main">${esc(it[0].name)}</div><div class="mday-rest">${esc(it.slice(1).map((x) => x.name).join(" · "))}</div></button>`; }).join("")}</div>
        <div class="table-wrap menu-week-table"><table class="menu-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <div class="info-grid menu-notes">
          <div class="card"><h3>⚠️ 알레르기 정보</h3><p class="allergen-legend">${Object.entries(menu.allergens).map(([k, v]) => `<span>${k}. ${esc(v)}</span>`).join("")}</p></div>
          <div class="card"><h3>🌏 원산지 표시</h3><ul class="fees">${menu.origin.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>
        </div>`;
      view().querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
        const g = b.dataset.go; state.date = g === "today" ? n.date : dates[i + Number(g)]; VIEWS.menu(data);
      }));
      view().querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { state.date = b.dataset.day; VIEWS.menu(data); }));
    },

    today(data) {
      const n = now();
      const dates = data.days.map((d) => d.date);
      const i = dates.indexOf(state.date);
      const day = data.days[i];
      const isToday = state.date === n.date;
      const badge = isToday ? `<span class="badge">오늘</span>` : state.date < n.date ? `<span class="badge gray">지난 날</span>` : `<span class="badge soft">예정</span>`;
      const nav = `<div class="day-nav">
        <button class="nav-btn" data-go="-1" ${i <= 0 ? "disabled" : ""} aria-label="이전 날">◀</button>
        <h2>${fmtDate(state.date)} ${badge}</h2>
        ${!isToday && dates.includes(n.date) ? `<button class="nav-btn" data-go="today">오늘로</button>` : ""}
        <button class="nav-btn" data-go="1" ${i >= dates.length - 1 ? "disabled" : ""} aria-label="다음 날">▶</button>
      </div>`;

      let hero = "";
      if (isToday) {
        const cur = day.blocks.find((b) => blockStatus(day, b, n) === "current");
        const nxt = day.blocks.find((b) => blockStatus(day, b, n) === "todo");
        if (cur) {
          const pct = Math.round(((n.mins - toMin(cur.start)) / (toMin(cur.end) - toMin(cur.start))) * 100);
          const lm = /점심/.test(cur.category) && data.menu?.byDate[state.date];
          hero = `<div class="now-card"><div class="k">지금 하는 활동 · ${esc(cur.label)}</div>
            <div class="emoji">${icon(cur.category, cur.detail)}</div>
            <div class="t">${lm ? esc(lm.items[0].name) : esc(cur.category)}</div>${lm ? `<div class="d">${esc(lm.items.slice(1).map((x) => x.name).join(" · "))}</div>` : cur.detail ? `<div class="d">${esc(cur.detail)}</div>` : ""}
            <div class="tm">${cur.start} ~ ${cur.end} · ${toMin(cur.end) - n.mins}분 남았어요<div class="progress"><i style="width:${pct}%"></i></div></div></div>`;
        } else if (nxt) {
          const wait = toMin(nxt.start) - n.mins;
          hero = `<div class="now-card"><div class="k">${n.mins < toMin(day.blocks[0].start) ? "곧 수업이 시작돼요" : "쉬는 시간이에요"}</div>
            <div class="emoji">${n.mins < toMin(day.blocks[0].start) ? "🌤️" : "☕"}</div>
            <div class="t">${wait}분 뒤 ${esc(nxt.category)}</div>${nxt.detail ? `<div class="d">${esc(nxt.detail)}</div>` : ""}
            <div class="tm">${nxt.label} · ${nxt.start} ~ ${nxt.end}</div></div>`;
        } else {
          hero = `<div class="now-card"><div class="k">오늘 하루</div><div class="emoji">👋</div>
            <div class="t">오늘 수업이 끝났어요</div><div class="d">수고했어요! 내일 또 만나요.</div></div>`;
        }
        const after = cur ? nxt : nxt && day.blocks[day.blocks.indexOf(nxt) + 1];
        if (after) hero += `<div class="card next-card"><div class="emoji">${icon(after.category, after.detail)}</div>
          <div><div class="k">그다음</div><div class="t">${esc(after.category)}</div><div class="tm">${after.label} · ${after.start} ~ ${after.end}</div></div></div>`;
      } else {
        const outing = data.outings.find((o) => o.date.replace(/\D/g, "").startsWith(state.date.replace(/-/g, "")));
        hero = `<div class="now-card"><div class="k">${fmtDate(state.date)}</div><div class="emoji">${outing ? "🚌" : "📅"}</div>
          <div class="t">${outing ? esc(outing.place) : `활동 ${day.blocks.filter((b) => !/점심|정리/.test(b.category)).length}개`}</div>
          <div class="d">${outing ? esc(outing.activity) : esc(day.blocks.filter((b) => !/점심|정리|일상생활/.test(b.category)).map((b) => b.category).slice(0, 3).join(" · "))}</div></div>`;
      }

      const lunch = data.menu?.byDate[state.date];
      const list = day.blocks.map((b) => {
        const st = blockStatus(day, b, n);
        const meal = /점심|정리/.test(b.category) ? " meal" : "";
        if (/점심/.test(b.category) && lunch) {
          const main = lunch.items[0];
          return `<li class="slot ${st}${meal}" ${st === "current" ? 'aria-current="step"' : ""}>
          <div class="when"><b>${esc(b.label)}</b><span>${b.start}~${b.end}</span></div>
          <div class="emoji" aria-hidden="true">${icon(b.category)}</div>
          <a class="body lunch-link" href="#/${state.cls}/menu">
            <span class="cat">${esc(main.name)}</span><span class="det">${esc(lunch.items.slice(1).map((x) => x.name).join(" · "))}</span><span class="more">식단표 보기 →</span></a></li>`;
        }
        return `<li class="slot ${st}${meal}" ${st === "current" ? 'aria-current="step"' : ""}>
          <div class="when"><b>${esc(b.label)}</b><span>${b.start}~${b.end}</span></div>
          <div class="emoji" aria-hidden="true">${icon(b.category, b.detail)}</div>
          <div class="body"><div class="cat">${esc(b.category)}</div>${b.detail ? `<div class="det">${esc(b.detail)}</div>` : ""}</div></li>`;
      }).join("");

      view().innerHTML = `${nav}<div class="today-grid"><div>${hero}</div><ol class="timeline" aria-label="하루 시간표">${list}</ol></div>`;
      view().querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
        const g = b.dataset.go;
        state.date = g === "today" ? n.date : dates[i + Number(g)];
        VIEWS.today(data);
      }));
    },

    week(data) {
      const n = now();
      const weeks = [];
      data.days.forEach((d) => {
        const dt = parseDate(d.date);
        const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
        const key = mon.toDateString();
        let w = weeks.find((x) => x.key === key);
        if (!w) weeks.push((w = { key, mon, days: {} }));
        w.days[d.weekday] = d;
      });
      let cur = weeks.findIndex((w) => Object.values(w.days).some((d) => d.date >= n.date));
      if (cur < 0) cur = weeks.length - 1;
      const wi = Math.min(Math.max(cur + state.weekOffset, 0), weeks.length - 1);
      const w = weeks[wi];
      const cols = ["월", "화", "수", "목", "금"].map((wd, k) => {
        const d = w.days[wd];
        const dt = new Date(w.mon); dt.setDate(w.mon.getDate() + k);
        if (!d) return `<div class="wday empty"><div class="wday-h"><b>${wd}</b><span>${dt.getMonth() + 1}/${dt.getDate()}</span></div><div class="wblock"><div class="x">수업 없음</div></div></div>`;
        const blocks = d.blocks.map((b) => {
          const cls = /점심/.test(b.category) ? " meal" : /정리/.test(b.category) ? " clean" : "";
          return `<div class="wblock${cls}"><div class="l">${esc(b.label)} · ${b.start}</div><div class="c">${icon(b.category, b.detail)} ${esc(b.category)}</div>${b.detail ? `<div class="x">${esc(b.detail)}</div>` : ""}</div>`;
        }).join("");
        return `<div class="wday${d.date === n.date ? " is-today" : ""}"><div class="wday-h"><b>${wd}</b><button data-day="${d.date}">${fmtDate(d.date, false)}</button></div>${blocks}</div>`;
      }).join("");
      view().innerHTML = `<div class="week-head">
          <button class="nav-btn" data-w="-1" ${wi === 0 ? "disabled" : ""} aria-label="이전 주">◀</button>
          <h2>${wi + 1}주차 · ${w.mon.getMonth() + 1}월 ${w.mon.getDate()}일 주간</h2>
          <button class="nav-btn" data-w="1" ${wi === weeks.length - 1 ? "disabled" : ""} aria-label="다음 주">▶</button>
        </div><div class="week-grid">${cols}</div>`;
      view().querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => { state.weekOffset = wi - cur + Number(b.dataset.w); VIEWS.week(data); }));
      view().querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { state.date = b.dataset.day; location.hash = `#/${state.cls}`; }));
    },

    month(data) {
      const n = now();
      const first = parseDate(data.days[0].date);
      const y = first.getFullYear(), m = first.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      const byDate = Object.fromEntries(data.days.map((d) => [d.date, d]));
      const cells = [];
      const startWd = new Date(y, m, 1).getDay();
      // 첫 주 앞의 빈칸 (월~금 기준)
      for (let k = 1; k < (startWd === 0 || startWd === 6 ? 1 : startWd); k++) cells.push(`<div class="cal-d blank"></div>`);
      for (let dd = 1; dd <= last; dd++) {
        const dt = new Date(y, m, dd), wd = dt.getDay();
        if (wd === 0 || wd === 6) continue;
        const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const d = byDate[key];
        if (!d) { cells.push(`<div class="cal-d past"><span class="n">${dd}</span><span class="hl"><span>수업 없음</span></span></div>`); continue; }
        const hl = d.blocks.filter((b) => !/점심|정리|일상생활/.test(b.category)).slice(0, 3)
          .map((b) => `<span>${icon(b.category, b.detail)} ${esc(b.category)}</span>`).join("");
        cells.push(`<button class="cal-d${key === n.date ? " is-today" : ""}${key < n.date ? " past" : ""}" data-day="${key}">
          <span class="n">${dd}</span><span class="dot"></span><span class="hl">${hl}</span></button>`);
      }
      view().innerHTML = `<h2 class="section-title">${y}년 ${m + 1}월 한눈에 보기</h2>
        <p class="legend">날짜를 누르면 그날 시간표가 나와요.</p>
        <div class="cal">${["월", "화", "수", "목", "금"].map((x) => `<div class="cal-h">${x}</div>`).join("")}${cells.join("")}</div>`;
      view().querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { state.date = b.dataset.day; location.hash = `#/${state.cls}`; }));
    },

    elective(data) {
      const e = data.electives;
      if (!e) { view().innerHTML = `<div class="card no-class"><h3>선택과목 안내가 없어요</h3></div>`; return; }
      const rows = e.groups.flatMap((g) => g.subjects.map((s, k) => `<tr>
        ${k === 0 ? `<td class="grp" rowspan="${g.subjects.length}">${esc(g.group)}</td>` : ""}
        <td class="sub">${icon(s.name)} ${esc(s.name)}</td>${s.activities.map((a) => `<td>${esc(a.text)}</td>`).join("")}</tr>`)).join("");
      view().innerHTML = `<h2 class="section-title">선택과목 이번 달 활동</h2>
        <div class="table-wrap"><table><thead><tr><th>구분</th><th>과목</th>${e.dates.map((d) => `<th>${esc(d)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
    },

    outing(data) {
      const n = now();
      const items = data.outings.map((o) => {
        const key = (o.date.match(/(\d{4})\.(\d{2})\.(\d{2})/) || []).slice(1).join("-");
        return `<div class="card outing${key && key < n.date ? " past" : ""}">
          <span class="badge soft">${esc(o.program)}</span>
          <div class="dt">🚌 ${esc(o.date.replace(/^\d{4}\./, "").replace(/\.\(/, " ("))}</div>
          <div class="pl">📍 ${esc(o.place)}</div><div class="ac">${esc(o.activity)}</div></div>`;
      }).join("");
      view().innerHTML = `<h2 class="section-title">반별 외부활동</h2>
        ${items ? `<div class="outings">${items}</div>` : `<div class="card no-class"><div class="emoji">🏠</div><h3>이번 달 외부활동이 없어요</h3></div>`}`;
    },

    info(data) {
      const notices = data.notices.map((x) => `<div class="card"><h3>📢 ${esc(x.title)}</h3><p>${esc(x.body)}</p></div>`).join("");
      const contacts = data.contacts.map((c) => `<div class="contact"><b>${esc(c.name)} 선생님</b>${c.phone ? `<a href="tel:${c.phone}">📞 ${esc(c.phone)}</a>` : ""}</div>`).join("");
      view().innerHTML = `<h2 class="section-title">가정통신문 안내</h2>
        <div class="info-grid">
          <div class="card"><h3>💌 인사말</h3><p>${esc(data.greeting)}</p></div>
          ${notices}
          <div class="card"><h3>💳 이용료 및 식대</h3><ul class="fees">${data.fees.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
          <div class="card"><h3>☎ 담임 선생님</h3><div class="contacts">${contacts}</div></div>
        </div>
        <p class="disclaimer">※ ${esc(data.disclaimer)}</p>`;
    },
  };

  route();
})();
