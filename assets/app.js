/* ============================================================
   TypeFlow — 极简打字速度测试
   零依赖、纯前端。所有状态保存在内存与 localStorage。
   ============================================================ */

(function () {
  "use strict";

  /* ------------------------------------------------------------
     词库
     ------------------------------------------------------------ */

  const COMMON_WORDS = `
    the be of and a to in he have it that for they with as not on she at by
    this we you do but from or which one would there their what so up out if
    about who get which go me when make can like time no just him know take
    people into year your good some could them see other than then now look
    only come its over think also back after use two how our work first well
    way even new want because any these give day most us is are was were been
    being has had did does will shall may might must should very much many
    more less still such same both each few own here where why while before
    between under above again against during through without within around
    small large great little long short high low old young right left next
    last early late open close start stop build break keep hold turn move
    read write speak listen learn teach think feel find lose win play run
    walk talk help need try call send bring buy sell pay cost spend save
    light dark sound quiet strong weak easy hard clean simple clear quick
  `;

  const CODE_SNIPPETS = [
    "const app = express(); app.use(express.json()); app.listen(3000);",
    "if (user && user.admin) { return next(); } else { res.status(403).json({ error: 'denied' }); }",
    "const [a, b] = [1, 2].map((n) => n * 10); console.log(a + b);",
    "document.querySelectorAll('.item').forEach((el) => el.classList.add('active'));",
    "async function load() { const res = await fetch('/api/data'); return res.json(); }",
    "for (let i = 0; i < arr.length; i++) { total += arr[i] ?? 0; }",
    "git commit -m \"fix: handle empty input\" && git push origin main",
    "const sum = (xs) => xs.reduce((acc, x) => acc + x, 0);"
  ];

  const QUOTES = [
    "Simplicity is prerequisite for reliability. — Edsger W. Dijkstra",
    "Talk is cheap. Show me the code. — Linus Torvalds",
    "Premature optimization is the root of all evil. — Donald Knuth",
    "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.",
    "The best way to predict the future is to invent it. — Alan Kay",
    "First, solve the problem. Then, write the code. — John Johnson",
    "Make it work, make it right, make it fast. — Kent Beck",
    "Programs must be written for people to read, and only incidentally for machines to execute."
  ];

  const WORD_COUNT = 140;

  /* ------------------------------------------------------------
     DOM
     ------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  const els = {
    board: $("board"),
    words: $("words"),
    hint: $("hint"),
    overlay: $("overlay"),
    themeBtn: $("themeBtn"),
    repoLink: $("repoLink"),
    statWpm: $("statWpm"),
    statAcc: $("statAcc"),
    statTime: $("statTime"),
    statBest: $("statBest"),
    againBtn: $("againBtn"),
    closeBtn: $("closeBtn"),
    restartBtn: $("restartBtn"),
    resultBadge: $("resultBadge"),
    rWpm: $("rWpm"),
    rAcc: $("rAcc"),
    rCorrect: $("rCorrect"),
    rWrong: $("rWrong")
  };

  const caret = document.createElement("div");
  caret.className = "caret";

  /* ------------------------------------------------------------
     状态
     ------------------------------------------------------------ */

  const state = {
    set: "common",
    duration: 30,
    words: [],
    typed: {},
    wordIndex: 0,
    status: "idle", // idle | running | done
    startedAt: 0,
    remaining: 30,
    timer: null,
    wordEls: []
  };

  const BEST_KEY = (set, dur) => `typeflow:best:${set}:${dur}`;

  /* ------------------------------------------------------------
     文本生成
     ------------------------------------------------------------ */

  const rand = (n) => Math.floor(Math.random() * n);

  function pickWords() {
    const pool = COMMON_WORDS.trim().split(/\s+/).filter(Boolean);
    const out = [];
    let prev = "";
    while (out.length < WORD_COUNT) {
      let w = pool[rand(pool.length)];
      if (w === prev) continue;
      out.push(w);
      prev = w;
    }
    return out;
  }

  function pickCode() {
    const out = [];
    while (out.length < WORD_COUNT) {
      const line = CODE_SNIPPETS[rand(CODE_SNIPPETS.length)];
      out.push(...line.split(/\s+/).filter(Boolean));
    }
    return out.slice(0, WORD_COUNT);
  }

  function pickQuotes() {
    const out = [];
    while (out.length < WORD_COUNT) {
      const line = QUOTES[rand(QUOTES.length)];
      out.push(...line.split(/\s+/).filter(Boolean));
    }
    return out.slice(0, WORD_COUNT);
  }

  const BUILDERS = { common: pickWords, code: pickCode, quotes: pickQuotes };

  function buildWords() {
    return BUILDERS[state.set]();
  }

  /* ------------------------------------------------------------
     渲染
     ------------------------------------------------------------ */

  function paintWord(i) {
    const el = state.wordEls[i];
    if (!el) return;

    const word = state.words[i];
    const typed = state.typed[i] || "";
    const isDone = i < state.wordIndex;
    const isActive = i === state.wordIndex;

    el.className = "w " + (isDone ? "done" : isActive ? "active" : "pending");

    let html = "";
    for (let j = 0; j < word.length; j++) {
      let cls = "char";
      if (j < typed.length) cls += typed[j] === word[j] ? " ok" : " bad";
      else if (isDone) cls += " miss";
      html += `<span class="${cls}">${escapeHtml(word[j])}</span>`;
    }
    el.innerHTML = html;
  }

  function escapeHtml(ch) {
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === "&") return "&amp;";
    return ch;
  }

  function renderAll() {
    els.words.innerHTML = "";
    state.wordEls = [];

    for (let i = 0; i < state.words.length; i++) {
      const el = document.createElement("span");
      el.className = "w pending";
      els.words.appendChild(el);
      state.wordEls.push(el);
      paintWord(i);
    }

    if (state.wordIndex === 0) paintWord(0);

    els.words.appendChild(caret);
    syncCaret();
    syncScroll();
  }

  function syncCaret() {
    const wEl = state.wordEls[state.wordIndex];
    if (!wEl) return;

    const typed = state.typed[state.wordIndex] || "";
    const chars = wEl.children;

    let x = 0;
    let y = 0;
    let h = 24;

    if (chars.length === 0) return;

    if (typed.length < chars.length) {
      const c = chars[typed.length];
      x = c.offsetLeft;
      y = c.offsetTop;
      h = c.offsetHeight;
    } else {
      const c = chars[chars.length - 1];
      x = c.offsetLeft + c.offsetWidth;
      y = c.offsetTop;
      h = c.offsetHeight;
    }

    caret.style.height = h + "px";
    caret.style.transform = `translate(${x}px, ${y}px)`;
  }

  function syncScroll() {
    const el = state.wordEls[state.wordIndex];
    if (!el) return;

    const cs = getComputedStyle(els.words);
    const lineH = parseFloat(cs.lineHeight) || 40;
    const offset = Math.max(0, el.offsetTop - lineH);
    els.words.style.transform = `translateY(${-offset}px)`;
  }

  /* ------------------------------------------------------------
     统计
     ------------------------------------------------------------ */

  function computeChars() {
    let correct = 0;
    let wrong = 0;
    let counted = 0;

    for (let i = 0; i <= state.wordIndex && i < state.words.length; i++) {
      const word = state.words[i];
      const typed = state.typed[i] || "";
      const limit = i < state.wordIndex ? word.length : Math.min(typed.length, word.length);

      for (let j = 0; j < limit; j++) {
        if (j < typed.length && typed[j] === word[j]) correct++;
        else wrong++;
        counted++;
      }
    }

    return { correct, wrong, counted };
  }

  function elapsedSeconds() {
    if (state.status === "idle") return 0;
    return (performance.now() - state.startedAt) / 1000;
  }

  function currentWpm(correct) {
    const sec = elapsedSeconds();
    if (sec < 0.5) return 0;
    return Math.round(correct / 5 / (sec / 60));
  }

  function updateStats() {
    const { correct, wrong, counted } = computeChars();
    const acc = counted === 0 ? 100 : Math.round((correct / counted) * 100);

    els.statWpm.textContent = currentWpm(correct);
    els.statAcc.innerHTML = `${acc}<span class="unit">%</span>`;

    if (state.status === "running") {
      const left = Math.max(0, Math.ceil(state.remaining));
      els.statTime.innerHTML = `${left}<span class="unit">s</span>`;
    }

    const best = Number(localStorage.getItem(BEST_KEY(state.set, state.duration)) || 0);
    els.statBest.textContent = best ? best : "—";
  }

  /* ------------------------------------------------------------
     计时
     ------------------------------------------------------------ */

  function startTimer() {
    if (state.status === "running") return;
    state.status = "running";
    state.startedAt = performance.now();
    state.remaining = state.duration;
    els.hint.style.opacity = "0.35";

    state.timer = window.setInterval(() => {
      state.remaining = state.duration - (performance.now() - state.startedAt) / 1000;
      if (state.remaining <= 0) {
        state.remaining = 0;
        finish();
      }
      updateStats();
    }, 100);
  }

  function stopTimer() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function finish() {
    stopTimer();
    state.status = "done";
    els.hint.style.opacity = "1";

    const { correct, wrong, counted } = computeChars();
    const acc = counted === 0 ? 100 : Math.round((correct / counted) * 100);
    const wpm = Math.round(correct / 5 / (state.duration / 60));

    const key = BEST_KEY(state.set, state.duration);
    const prevBest = Number(localStorage.getItem(key) || 0);
    const isRecord = wpm > prevBest;
    if (isRecord) localStorage.setItem(key, String(wpm));

    els.rWpm.textContent = wpm;
    els.rAcc.textContent = acc + "%";
    els.rCorrect.textContent = correct;
    els.rWrong.textContent = wrong;
    els.resultBadge.hidden = !isRecord;

    els.statTime.innerHTML = `0<span class="unit">s</span>`;
    els.overlay.hidden = false;
    updateStats();
  }

  /* ------------------------------------------------------------
     输入
     ------------------------------------------------------------ */

  function ensureMoreWords() {
    if (state.wordIndex < state.words.length - 20) return;

    const extra = buildWords();
    state.words.push(...extra);

    for (let i = state.wordEls.length; i < state.words.length; i++) {
      const el = document.createElement("span");
      el.className = "w pending";
      els.words.appendChild(el);
      state.wordEls.push(el);
      paintWord(i);
    }
  }

  function typeChar(ch) {
    if (state.status === "done") return;
    if (state.status === "idle") startTimer();

    const word = state.words[state.wordIndex];
    const typed = state.typed[state.wordIndex] || "";
    if (!word || typed.length >= word.length) return;

    state.typed[state.wordIndex] = typed + ch;
    paintWord(state.wordIndex);
    syncCaret();
    updateStats();
  }

  function pressSpace() {
    if (state.status === "done" || state.status === "idle") return;

    const typed = state.typed[state.wordIndex] || "";
    if (typed.length === 0) return;

    paintWord(state.wordIndex);
    state.wordIndex += 1;
    state.typed[state.wordIndex] = state.typed[state.wordIndex] || "";

    ensureMoreWords();
    paintWord(state.wordIndex - 1);
    paintWord(state.wordIndex);

    syncCaret();
    syncScroll();
    updateStats();
  }

  function pressBackspace() {
    if (state.status !== "running") return;

    const typed = state.typed[state.wordIndex] || "";

    if (typed.length > 0) {
      state.typed[state.wordIndex] = typed.slice(0, -1);
    } else if (state.wordIndex > 0) {
      state.wordIndex -= 1;
      const prev = state.typed[state.wordIndex] || "";
      state.typed[state.wordIndex] = prev.slice(0, -1);
      paintWord(state.wordIndex + 1);
    } else {
      return;
    }

    paintWord(state.wordIndex);
    syncCaret();
    syncScroll();
    updateStats();
  }

  /* ------------------------------------------------------------
     生命周期
     ------------------------------------------------------------ */

  function restart() {
    stopTimer();

    state.status = "idle";
    state.startedAt = 0;
    state.remaining = state.duration;
    state.wordIndex = 0;
    state.typed = {};
    state.words = buildWords();

    els.overlay.hidden = true;
    els.hint.style.opacity = "1";
    els.statTime.innerHTML = `${state.duration}<span class="unit">s</span>`;
    els.statWpm.textContent = "0";
    els.statAcc.innerHTML = `100<span class="unit">%</span>`;

    renderAll();
    updateStats();
    els.board.focus({ preventScroll: true });
  }

  function setActiveChips() {
    document.querySelectorAll("[data-set]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.set === state.set));
    });
    document.querySelectorAll("[data-duration]").forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.duration) === state.duration));
    });
  }

  /* ------------------------------------------------------------
     主题
     ------------------------------------------------------------ */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.themeBtn.textContent = theme === "dark" ? "🌙" : "☀️";
    localStorage.setItem("typeflow:theme", theme);
  }

  function initTheme() {
    const saved = localStorage.getItem("typeflow:theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ------------------------------------------------------------
     事件
     ------------------------------------------------------------ */

  function bindEvents() {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Tab") {
        e.preventDefault();
        restart();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (!els.overlay.hidden) {
          els.overlay.hidden = true;
        } else {
          restart();
        }
        return;
      }

      if (!els.overlay.hidden) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        pressBackspace();
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        pressSpace();
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        typeChar(e.key);
      }
    });

    els.board.addEventListener("click", () => {
      els.board.focus({ preventScroll: true });
    });

    els.themeBtn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      els.themeBtn.blur();
    });

    document.querySelectorAll("[data-set]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.set = btn.dataset.set;
        setActiveChips();
        restart();
        btn.blur();
      });
    });

    document.querySelectorAll("[data-duration]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.duration = Number(btn.dataset.duration);
        setActiveChips();
        restart();
        btn.blur();
      });
    });

    els.restartBtn.addEventListener("click", () => {
      restart();
      els.restartBtn.blur();
    });

    els.againBtn.addEventListener("click", () => {
      restart();
      els.againBtn.blur();
    });

    els.closeBtn.addEventListener("click", () => {
      els.overlay.hidden = true;
      els.closeBtn.blur();
    });

    window.addEventListener("resize", () => {
      syncCaret();
      syncScroll();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.status === "running") {
        els.words.classList.add("blurred");
      } else {
        els.words.classList.remove("blurred");
      }
    });
  }

  /* ------------------------------------------------------------
     启动
     ------------------------------------------------------------ */

  function init() {
    initTheme();
    setActiveChips();
    bindEvents();

    const repo = "https://github.com/";
    if (els.repoLink && els.repoLink.getAttribute("href") === "#") {
      els.repoLink.href = repo;
    }

    restart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
