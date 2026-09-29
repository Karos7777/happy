/* «Навстречу»: логика приложения.
   Без сборки и зависимостей. Состояние лежит в localStorage этого браузера,
   экран пересобирается из строк при каждом изменении. Тексты пособия живут в content.js. */
(function () {
  "use strict";

  const C = window.CONTENT;
  const STORAGE_KEY = "navstrechu:v1";

  // ---------- Данные ----------

  function emptyPortrait() {
    return { must: [], nice: [], no: [], values: [], give: "", together: "" };
  }

  function defaultState() {
    return {
      version: 1,
      seenIntro: false,
      tasks: {},
      entries: [],
      answers: {},
      portrait: { partner: emptyPortrait(), friend: emptyPortrait() },
      places: {},
      customPlaces: [],
    };
  }

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const onlyStrings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

  // Приводит данные из хранилища или из копии к ожидаемой форме,
  // чтобы старая или испорченная копия не ломала приложение.
  function normalize(d) {
    const s = defaultState();
    if (!isObj(d)) return s;
    s.seenIntro = Boolean(d.seenIntro);
    if (isObj(d.tasks)) s.tasks = d.tasks;
    if (isObj(d.answers)) s.answers = d.answers;
    if (isObj(d.places)) s.places = d.places;
    if (Array.isArray(d.entries)) {
      s.entries = d.entries.filter((e) => isObj(e) && typeof e.text === "string" && typeof e.date === "number");
    }
    if (Array.isArray(d.customPlaces)) {
      s.customPlaces = d.customPlaces.filter((p) => isObj(p) && typeof p.id === "string" && typeof p.name === "string");
    }
    if (isObj(d.portrait)) {
      for (const who of ["partner", "friend"]) {
        const p = d.portrait[who];
        if (!isObj(p)) continue;
        for (const k of ["must", "nice", "no", "values"]) s.portrait[who][k] = onlyStrings(p[k]);
        for (const k of ["give", "together"]) if (typeof p[k] === "string") s.portrait[who][k] = p[k];
      }
    }
    return s;
  }

  let storageWorks = true;
  let saveTimer = null;

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageWorks = false;
    }
    if (!raw) return defaultState();
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageWorks = true;
    } catch (e) {
      storageWorks = false;
    }
    renderNotice();
  }

  // Для текста, который печатают: сохраняем не на каждую букву, а после паузы.
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function flush() {
    if (saveTimer) save();
  }

  let state = load();

  // ---------- Разделы ----------

  const ICONS = {
    brand:
      '<svg class="brand-mark" viewBox="0 0 34 20" width="34" height="20" aria-hidden="true"><circle class="mark-lamp" cx="10" cy="10" r="7"/><circle class="mark-other" cx="24" cy="10" r="6"/></svg>',
    path: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21c0-5 10-4 10-9S7 7 7 3"/><circle cx="7" cy="3" r="1.6" class="fill"/><circle cx="7" cy="21" r="1.6" class="fill"/></svg>',
    journal:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4 3.8-6.5 7.5-6.5s6.9 2.5 7.5 6.5"/></svg>',
    places:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7" class="fill"/><circle cx="12" cy="12" r="1.7" class="fill"/><circle cx="19" cy="12" r="1.7" class="fill"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chevron: '<svg class="stage-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  const TABS = [
    { id: "path", label: "Путь", icon: ICONS.path },
    { id: "journal", label: "Дневник", icon: ICONS.journal },
    { id: "me", label: "Я", icon: ICONS.me },
    { id: "places", label: "Места", icon: ICONS.places },
  ];

  function tabFromHash() {
    const h = location.hash.replace("#", "");
    return TABS.some((t) => t.id === h) ? h : "path";
  }

  // Состояние экрана: что открыто, черновик записи. В хранилище не попадает.
  const ui = {
    tab: tabFromHash(),
    openStage: null, // null — открыт текущий этап, -1 — все свёрнуты
    meSection: "why",
    who: "partner",
    promptIndex: Math.floor(Math.random() * C.prompts.length),
    draft: { mood: null, tag: "step", text: "" },
    confirmDelete: null,
    aboutOpen: false,
    confirmReset: false,
    importText: "",
    importStatus: "",
    installBannerHidden: false,
  };

  // ---------- Помощники ----------

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  // ---------- Установка на устройство ----------

  // Адрес опубликованного приложения: с него «Навстречу» устанавливают на телефон и компьютер.
  const SITE_URL = "https://karos7777.github.io/happy/";
  const INSTALL_BANNER_KEY = "navstrechu:install-banner-hidden";

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMac = /mac/i.test(navigator.platform);

  // Событие браузера, через которое можно показать системное окно установки.
  // Есть только в Chrome, Edge, Яндекс Браузере и других браузерах на Chromium.
  let installPrompt = null;

  function installBannerHidden() {
    try {
      return localStorage.getItem(INSTALL_BANNER_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function installBanner() {
    if (!installPrompt || ui.installBannerHidden || installBannerHidden()) return "";
    return `
      <section class="install-banner" aria-label="Установка">
        <p>Установи «Навстречу» на это устройство: оно будет открываться как обычное приложение и работать без интернета.</p>
        <div class="row">
          <button type="button" class="btn btn--small btn--primary" data-action="install">Установить</button>
          <button type="button" class="btn btn--small" data-action="hide-install">Не сейчас</button>
        </div>
      </section>`;
  }

  function installSection() {
    let body;
    if (isStandalone()) {
      body = `<p>«Навстречу» уже установлено и открыто как приложение.</p>`;
    } else if (inFrame) {
      body = `<p>Это предпросмотр. Установить приложение на телефон или компьютер можно с его сайта: <a href="${SITE_URL}" target="_blank" rel="noopener">${SITE_URL.replace("https://", "")}</a></p>`;
    } else if (installPrompt) {
      body = `
        <p>Приложение появится рядом с остальными программами и будет работать без интернета.</p>
        <div class="row"><button type="button" class="btn btn--small btn--primary" data-action="install">Установить приложение</button></div>`;
    } else if (isIOS) {
      body = `<p>На iPhone и iPad открой эту страницу в Safari, нажми «Поделиться» и выбери «На экран „Домой“».</p>`;
    } else {
      body = `
        <p>На Android: меню браузера → «Установить приложение» или «Добавить на главный экран».</p>
        <p>На компьютере в Chrome, Edge или Яндекс Браузере: значок установки в адресной строке или «Установить приложение» в меню браузера.</p>`;
    }
    return `<div class="field"><h3 class="field-title">Установить на устройство</h3>${body}</div>`;
  }

  function stageDone(stage) {
    return stage.tasks.filter((t) => state.tasks[t.id]).length;
  }

  function currentStageIndex() {
    const i = C.stages.findIndex((s) => stageDone(s) < s.tasks.length);
    return i === -1 ? C.stages.length - 1 : i;
  }

  const GOTO_LABELS = {
    why: "Открыть вопросы",
    who: "Открыть портрет",
    journal: "Открыть дневник",
    places: "Открыть места",
  };

  function gotoButton(g, cls) {
    const attrs = [`data-to="${g.tab}"`];
    if (g.section) attrs.push(`data-section="${g.section}"`);
    if (g.who) attrs.push(`data-who="${g.who}"`);
    return `<button type="button" class="${cls}" data-action="goto" ${attrs.join(" ")}>${GOTO_LABELS[g.section || g.tab]}</button>`;
  }

  // ---------- Экран «Путь» ----------

  function viewPath() {
    const all = C.stages.flatMap((s) => s.tasks);
    const done = all.filter((t) => state.tasks[t.id]).length;
    const finished = done === all.length;
    const cur = currentStageIndex();
    const open = ui.openStage === null ? cur : ui.openStage;
    const next = all.find((t) => !state.tasks[t.id]);

    const segments = C.stages
      .map((s) => `<span class="route-seg"><span style="width:${Math.round((stageDone(s) / s.tasks.length) * 100)}%"></span></span>`)
      .join("");

    return `
      ${state.seenIntro ? "" : introBlock()}
      ${installBanner()}
      <header class="page-head">
        <p class="eyebrow">${finished ? "Все этапы пройдены" : `Этап ${cur + 1} из ${C.stages.length}`}</p>
        <h1 class="page-title">${finished ? "Весь путь пройден" : esc(C.stages[cur].title)}</h1>
        <div class="route" aria-hidden="true">${segments}</div>
        <p class="route-caption">${done} ${plural(done, "шаг", "шага", "шагов")} из ${all.length}</p>
      </header>
      ${next ? nextCard(next) : finishedCard()}
      <section>
        <h2 class="section-title">Весь путь</h2>
        <ol class="stages">${C.stages.map((s, i) => stageItem(s, i, i === open, i === cur)).join("")}</ol>
      </section>
      <aside class="care">
        <h2>Если совсем тяжело</h2>
        <p>Одиночество может давить очень сильно. Если мысли становятся тёмными или появляется желание навредить себе, не оставайся с этим один на один: позвони на телефон доверия своей страны или обратись к психологу. Попросить о помощи — это тоже шаг навстречу.</p>
      </aside>`;
  }

  function introBlock() {
    return `
      <section class="intro">
        <h2 class="intro-title">Привет</h2>
        <p>Это пособие для тех, кто сейчас совсем один и хочет это изменить: найти друзей, пару или хотя бы понять, нужно ли это.</p>
        <p>Волшебных приёмов здесь нет. Есть путь из пяти этапов, дневник, в котором видно, что меняется, и место, где можно спокойно подумать, кого ты ищешь. Всё, что ты здесь пишешь, остаётся только на этом устройстве.</p>
        <button type="button" class="btn btn--primary" data-action="dismiss-intro">Начать</button>
      </section>`;
  }

  function nextCard(task) {
    return `
      <section class="next" aria-labelledby="next-label">
        <p class="eyebrow" id="next-label">Следующий шаг</p>
        <p class="next-text">${esc(task.text)}</p>
        <div class="row">
          <button type="button" class="btn btn--primary" data-action="done-task" data-id="${task.id}">Сделано</button>
          ${task.goto ? gotoButton(task.goto, "btn") : ""}
        </div>
      </section>`;
  }

  function finishedCard() {
    return `
      <section class="next">
        <p class="eyebrow">Что дальше</p>
        <p class="next-text">Все шаги отмечены. Это не конец: возвращайся к дневнику и к вопросам. Люди и места будут меняться, и ты тоже.</p>
      </section>`;
  }

  function stageItem(stage, i, isOpen, isCurrent) {
    const d = stageDone(stage);
    const n = stage.tasks.length;
    const status = d === n ? "done" : isCurrent ? "current" : "todo";
    const bodyId = `stage-body-${stage.id}`;
    return `
      <li class="stage stage--${status}${isOpen ? " is-open" : ""}">
        <button type="button" class="stage-head" data-action="toggle-stage" data-index="${i}" aria-expanded="${isOpen}" aria-controls="${bodyId}">
          <span class="stage-num">${d === n ? ICONS.check : i + 1}</span>
          <span class="stage-name">${esc(stage.title)}</span>
          <span class="stage-count">${d}/${n}</span>
          ${ICONS.chevron}
        </button>
        ${
          isOpen
            ? `<div class="stage-body" id="${bodyId}">
                <p class="stage-lead">${esc(stage.lead)}</p>
                <ul class="checklist">${stage.tasks.map(taskItem).join("")}</ul>
                ${stage.note ? `<p class="note">${esc(stage.note)}</p>` : ""}
              </div>`
            : ""
        }
      </li>`;
  }

  function taskItem(task) {
    const done = Boolean(state.tasks[task.id]);
    return `
      <li class="check${done ? " is-done" : ""}">
        <label>
          <input type="checkbox" data-task="${task.id}"${done ? " checked" : ""}>
          <span class="check-text">${esc(task.text)}</span>
        </label>
        ${task.goto ? gotoButton(task.goto, "link-btn") : ""}
      </li>`;
  }

  // ---------- Экран «Дневник» ----------

  function viewJournal() {
    const d = ui.draft;
    const prompt = C.prompts[ui.promptIndex % C.prompts.length];
    const entries = [...state.entries].sort((a, b) => b.date - a.date);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = entries.filter((e) => e.date >= weekAgo).length;

    return `
      <header class="page-head">
        <h1 class="page-title">Дневник</h1>
        <p class="page-lead">Записывай шаги, встречи, мысли и выводы. Через месяц станет видно, что меняется.</p>
      </header>
      <form class="composer" data-form="entry">
        <div class="prompt">
          <p class="prompt-text">${esc(prompt)}</p>
          <button type="button" class="link-btn link-btn--quiet" data-action="next-prompt">Другой вопрос</button>
        </div>
        <fieldset>
          <legend>Как ты сейчас?</legend>
          <div class="moods">
            ${C.moods
              .map(
                (m) => `
              <button type="button" class="mood" data-action="mood" data-value="${m.value}" aria-pressed="${d.mood === m.value}">
                <span class="dot dot--${m.value}"></span>${esc(m.label)}
              </button>`
              )
              .join("")}
          </div>
        </fieldset>
        <fieldset>
          <legend>Что это за запись?</legend>
          <div class="chips">
            ${C.tags
              .map(
                (t) =>
                  `<button type="button" class="chip" data-action="tag" data-value="${t.id}" aria-pressed="${d.tag === t.id}">${esc(t.label)}</button>`
              )
              .join("")}
          </div>
        </fieldset>
        <div class="field">
          <label class="sr-only" for="entry-text">Текст записи</label>
          <textarea id="entry-text" rows="5" placeholder="Пиши как есть. Можно коротко.">${esc(d.text)}</textarea>
        </div>
        <div class="row">
          <button type="submit" class="btn btn--primary">Сохранить запись</button>
          <span class="kbd-hint">или ${isMac ? "⌘" : "Ctrl"} + Enter</span>
        </div>
      </form>
      <section>
        <h2 class="section-title">Записи${entries.length ? `<span class="count">${entries.length} · за неделю ${thisWeek}</span>` : ""}</h2>
        ${
          entries.length
            ? `<ol class="entries">${entries.map(entryItem).join("")}</ol>`
            : `<p class="empty">Здесь появятся твои записи. Первая может быть совсем короткой: как ты сейчас и чего хочешь.</p>`
        }
      </section>`;
  }

  function entryItem(e) {
    const date = new Date(e.date);
    const mood = C.moods.find((m) => m.value === e.mood);
    const tag = C.tags.find((t) => t.id === e.tag);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const when =
      date.toLocaleDateString("ru-RU", { weekday: "long" }) +
      ", " +
      date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
      (sameYear ? "" : ", " + date.getFullYear());
    const month = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(/^\d+\s*/, "").replace(".", "");
    const confirming = ui.confirmDelete === e.id;

    return `
      <li class="entry">
        <time class="entry-date" datetime="${date.toISOString()}">
          <span class="entry-day">${date.getDate()}</span>
          <span class="entry-month">${esc(month)}</span>
        </time>
        <div class="entry-body">
          <div class="entry-meta">
            ${tag ? `<span class="tag">${esc(tag.label)}</span>` : ""}
            <span>${esc(when)}</span>
            ${mood ? `<span class="entry-mood"><span class="dot dot--${mood.value}"></span>${esc(mood.label)}</span>` : ""}
          </div>
          <p class="entry-text">${esc(e.text)}</p>
          <div class="entry-actions">
            ${
              confirming
                ? `<span>Удалить эту запись?</span>
                   <button type="button" class="btn btn--small btn--danger" data-action="delete-entry" data-id="${esc(e.id)}">Удалить</button>
                   <button type="button" class="btn btn--small" data-action="cancel-delete">Оставить</button>`
                : `<button type="button" class="link-btn link-btn--quiet" data-action="ask-delete" data-id="${esc(e.id)}">Удалить</button>`
            }
          </div>
        </div>
      </li>`;
  }

  // ---------- Экран «Я» ----------

  function viewMe() {
    const tabs = [
      { id: "why", label: "Стоит ли?" },
      { id: "who", label: "Кого я ищу" },
    ];
    return `
      <header class="page-head">
        <h1 class="page-title">Разобраться в себе</h1>
        <div class="segmented" role="tablist" aria-label="Раздел">
          ${tabs
            .map(
              (t) =>
                `<button type="button" role="tab" id="me-tab-${t.id}" aria-selected="${ui.meSection === t.id}" data-action="me-section" data-value="${t.id}">${t.label}</button>`
            )
            .join("")}
        </div>
      </header>
      <div role="tabpanel" aria-labelledby="me-tab-${ui.meSection}" class="panel">
        ${ui.meSection === "why" ? whyPanel() : whoPanel()}
      </div>`;
  }

  function whyPanel() {
    return `
      <p class="page-lead">Здесь нет правильных ответов. Всё сохраняется само. Возвращайся к вопросам раз в пару месяцев: интересно смотреть, как меняются ответы.</p>
      <div class="questions">
        ${C.questions
          .map(
            (q) => `
          <div class="question">
            <label for="q-${q.id}">${esc(q.text)}</label>
            ${q.hint ? `<p class="hint" id="q-${q.id}-hint">${esc(q.hint)}</p>` : ""}
            <textarea id="q-${q.id}" rows="3" data-answer="${q.id}"${q.hint ? ` aria-describedby="q-${q.id}-hint"` : ""}>${esc(state.answers[q.id] || "")}</textarea>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function whoPanel() {
    const who = ui.who;
    const p = state.portrait[who];
    const partner = who === "partner";
    const lead = partner
      ? "Портрет помогает не хвататься за первого, кто ответил, и не отсеивать всех подряд. Уточняй его после каждой встречи."
      : "Каких людей хочется видеть рядом? Друзья не обязаны совпадать с тобой во всём. Важнее, чтобы с ними было легко и интересно.";
    const nudges = portraitNudges(p);

    return `
      <div class="who-switch">
        <span class="who-label">Ищу</span>
        <div class="chips">
          <button type="button" class="chip" data-action="who" data-value="partner" aria-pressed="${partner}">Пару</button>
          <button type="button" class="chip" data-action="who" data-value="friend" aria-pressed="${!partner}">Друзей</button>
        </div>
      </div>
      <p class="page-lead">${lead}</p>
      <div class="portrait">
        ${listBlock("must", "Обязательно", "Без чего не получится. Лучше три-пять пунктов, а не двадцать.", "Например: доброта")}
        ${listBlock("nice", "Было бы здорово", "Приятно, но не главное.", "Например: любит походы")}
        ${listBlock("no", "Точно нет", "То, с чем мириться не получится.", "Например: грубость")}
        ${partner ? valuesBlock(p) : ""}
        ${
          partner
            ? ""
            : textBlock("together", "Что мы могли бы делать вместе", "Гулять, играть, ходить в походы, обсуждать книги, созваниваться по вечерам.")
        }
        ${textBlock(
          "give",
          partner ? "Что я могу дать этому человеку" : "Что я могу дать другу",
          "Внимание, заботу, юмор, спокойствие, умение слушать? Ответ пригодится и для анкеты."
        )}
        ${nudges.map((n) => `<p class="nudge">${esc(n)}</p>`).join("")}
      </div>`;
  }

  function portraitNudges(p) {
    const out = [];
    if (p.must.length > 7) {
      out.push(
        `В списке «Обязательно» уже ${p.must.length} ${plural(p.must.length, "пункт", "пункта", "пунктов")}. Чем он длиннее, тем меньше людей в него попадёт. Может, часть перенести в «Было бы здорово»?`
      );
    }
    if (p.must.length + p.nice.length > 0 && !p.give.trim()) {
      out.push("Ты уже знаешь, что хочешь найти в другом человеке. Попробуй ответить и на обратный вопрос: что ты можешь дать ему.");
    }
    return out;
  }

  function listBlock(key, title, hint, example) {
    const items = state.portrait[ui.who][key];
    const inputId = `add-${ui.who}-${key}`;
    return `
      <div class="field">
        <h3 class="field-title">${title}</h3>
        <p class="hint">${hint}</p>
        ${
          items.length
            ? `<ul class="pills">${items
                .map(
                  (it, i) =>
                    `<li class="pill pill--${key}"><span>${esc(it)}</span><button type="button" data-action="remove-item" data-key="${key}" data-index="${i}" aria-label="Убрать «${esc(it)}»">${ICONS.close}</button></li>`
                )
                .join("")}</ul>`
            : ""
        }
        <form class="add-row" data-form="add-item" data-key="${key}">
          <label class="sr-only" for="${inputId}">Добавить в «${title}»</label>
          <input type="text" class="input" id="${inputId}" maxlength="80" autocomplete="off" placeholder="${example}">
          <button type="submit" class="btn btn--small">Добавить</button>
        </form>
      </div>`;
  }

  function valuesBlock(p) {
    return `
      <div class="field">
        <h3 class="field-title">Что должно совпадать</h3>
        <p class="hint">Темы, где различия потом ранят сильнее всего. Отметь важные для тебя.</p>
        <div class="chips">
          ${C.values
            .map(
              (v) =>
                `<button type="button" class="chip" data-action="toggle-value" data-value="${esc(v)}" aria-pressed="${p.values.includes(v)}">${esc(v)}</button>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function textBlock(key, title, hint) {
    const id = `portrait-${ui.who}-${key}`;
    return `
      <div class="field">
        <label class="field-title" for="${id}">${title}</label>
        <p class="hint" id="${id}-hint">${hint}</p>
        <textarea id="${id}" rows="3" data-portrait="${key}" aria-describedby="${id}-hint">${esc(state.portrait[ui.who][key])}</textarea>
      </div>`;
  }

  // ---------- Экран «Места» ----------

  function allPlaces() {
    return [...C.places, ...state.customPlaces.map((p) => ({ ...p, group: "Мои места", custom: true }))];
  }

  function viewPlaces() {
    const places = allPlaces();
    const groups = [];
    for (const p of places) {
      let g = groups.find((x) => x.name === p.group);
      if (!g) groups.push((g = { name: p.group, items: [] }));
      g.items.push(p);
    }
    const statusOf = (p) => (state.places[p.id] && state.places[p.id].status) || "none";
    const once = places.filter((p) => statusOf(p) === "once").length;
    const regular = places.filter((p) => statusOf(p) === "regular").length;

    return `
      <header class="page-head">
        <h1 class="page-title">Где искать людей</h1>
        <p class="page-lead">Лучше всего работают места, куда можно ходить регулярно и где есть общее дело. Разговор завязывается сам, когда вы видите друг друга уже в третий раз.</p>
        <p class="stats">Попробовано: ${once + regular} · Хожу регулярно: ${regular}</p>
      </header>
      <div class="place-groups">
        ${groups
          .map(
            (g) => `
          <section>
            <h2 class="section-title">${esc(g.name)}</h2>
            <ul class="places">${g.items.map((p) => placeItem(p, statusOf(p))).join("")}</ul>
          </section>`
          )
          .join("")}
      </div>
      <form class="add-place" data-form="add-place">
        <h2 class="section-title">Добавить своё место</h2>
        <div class="field">
          <label class="field-title" for="place-name">Что это за место</label>
          <input type="text" class="input" id="place-name" maxlength="60" autocomplete="off" placeholder="Например: клуб скалолазания у дома">
        </div>
        <div class="field">
          <label class="field-title" for="place-tip">Почему туда</label>
          <input type="text" class="input" id="place-tip" maxlength="140" autocomplete="off" placeholder="Необязательно">
        </div>
        <div class="row"><button type="submit" class="btn">Добавить</button></div>
      </form>`;
  }

  function placeItem(p, status) {
    const note = (state.places[p.id] && state.places[p.id].note) || "";
    const noteId = `note-${p.id}`;
    return `
      <li class="place place--${status}">
        <div class="place-head">
          <span class="place-mark" aria-hidden="true"></span>
          <div class="place-text">
            <h3>${esc(p.name)}</h3>
            ${p.tip ? `<p>${esc(p.tip)}</p>` : ""}
          </div>
        </div>
        <div class="place-controls">
          <div class="status" role="group" aria-label="Статус: ${esc(p.name)}">
            ${C.placeStatuses
              .map(
                (s) =>
                  `<button type="button" data-action="place-status" data-id="${esc(p.id)}" data-value="${s.id}" aria-pressed="${status === s.id}">${esc(s.label)}</button>`
              )
              .join("")}
          </div>
          ${p.custom ? `<button type="button" class="link-btn link-btn--quiet" data-action="remove-place" data-id="${esc(p.id)}">Убрать</button>` : ""}
        </div>
        ${
          status === "none"
            ? ""
            : `<label class="sr-only" for="${esc(noteId)}">Заметка о месте</label>
               <input type="text" class="input place-note" id="${esc(noteId)}" data-place-note="${esc(p.id)}" maxlength="200" value="${esc(note)}" placeholder="Заметка: как прошло, пойти ли снова">`
        }
      </li>`;
  }

  // ---------- Окно «О приложении и данных» ----------

  function exportText() {
    return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  }

  function aboutSheet() {
    return `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="sheet-head">
          <h2 id="about-title">О приложении</h2>
          <button type="button" class="icon-btn" data-action="close-about" aria-label="Закрыть">${ICONS.close}</button>
        </div>
        <p>«Навстречу» — пособие для тех, кто сейчас один и хочет найти друзей или пару. Его автор сам проходит этот путь, поэтому пособие будет меняться вместе с опытом.</p>
        ${installSection()}
        <div class="field">
          <h3 class="field-title">Где хранятся записи</h3>
          <p>Только в этом браузере на этом устройстве. Они никуда не отправляются. Если очистить данные браузера, записи пропадут, поэтому иногда сохраняй копию.</p>
        </div>
        <div class="field">
          <label class="field-title" for="export-text">Копия всех данных</label>
          <textarea id="export-text" rows="4" readonly>${esc(exportText())}</textarea>
          <div class="row">
            <button type="button" class="btn btn--small" data-action="copy-export">Скопировать</button>
            ${inFrame ? "" : `<button type="button" class="btn btn--small" data-action="download-export">Скачать файл</button>`}
          </div>
        </div>
        <div class="field">
          <label class="field-title" for="import-text">Восстановить из копии</label>
          <p class="hint">Вставь текст копии или выбери файл. Всё, что сейчас в приложении, заменится.</p>
          <textarea id="import-text" rows="3">${esc(ui.importText)}</textarea>
          <div class="row">
            <button type="button" class="btn btn--small" data-action="import-text">Восстановить</button>
            <label class="btn btn--small file-btn">Выбрать файл<input type="file" id="import-file" class="sr-only" accept=".json,application/json"></label>
          </div>
          ${ui.importStatus ? `<p class="error" role="alert">${esc(ui.importStatus)}</p>` : ""}
        </div>
        <div class="field">
          <h3 class="field-title">Начать заново</h3>
          ${
            ui.confirmReset
              ? `<p>Стереть все шаги, записи и ответы? Отменить это нельзя.</p>
                 <div class="row">
                   <button type="button" class="btn btn--small btn--danger" data-action="reset">Стереть всё</button>
                   <button type="button" class="btn btn--small" data-action="cancel-reset">Отмена</button>
                 </div>`
              : `<div class="row"><button type="button" class="btn btn--small" data-action="ask-reset">Стереть все данные</button></div>`
          }
        </div>
      </div>`;
  }

  function applyImport(text) {
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
    if (!isObj(data) || !("tasks" in data || "entries" in data)) {
      ui.importStatus = "Это не похоже на копию «Навстречу». Проверь, что текст скопирован целиком.";
      renderSheet();
      return;
    }
    state = normalize(data);
    save();
    closeAbout();
    render();
    toast("Данные восстановлены");
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => applyImport(String(reader.result));
    reader.onerror = () => {
      ui.importStatus = "Не получилось прочитать файл.";
      renderSheet();
    };
    reader.readAsText(file);
  }

  // ---------- Отрисовка ----------

  const VIEWS = { path: viewPath, journal: viewJournal, me: viewMe, places: viewPlaces };

  const root = document.getElementById("app");
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#path" data-nav="path">${ICONS.brand}<span>Навстречу</span></a>
      <button type="button" class="icon-btn" data-action="about" aria-label="О приложении и данных">${ICONS.more}</button>
    </header>
    <div id="notice"></div>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Разделы">
      <a class="brand side-brand" href="#path" data-nav="path">${ICONS.brand}<span>Навстречу</span></a>
      <div class="tabbar-inner">
        ${TABS.map((t) => `<a class="tab" href="#${t.id}" data-nav="${t.id}">${t.icon}<span>${t.label}</span></a>`).join("")}
      </div>
      <div class="side-foot">
        <button type="button" class="side-link side-link--accent" id="side-install" data-action="install" hidden>Установить приложение</button>
        <button type="button" class="side-link" data-action="about">О приложении и данных</button>
      </div>
    </nav>
    <div id="sheet" class="sheet-backdrop" hidden></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;

  const view = document.getElementById("view");
  const sheet = document.getElementById("sheet");

  // После пересборки экрана возвращаем фокус на тот же элемент, чтобы не терялось место.
  function focusKey(el) {
    if (!el || !root.contains(el)) return null;
    if (el.id) return "#" + CSS.escape(el.id);
    const d = el.dataset;
    if (d.task) return `[data-task="${CSS.escape(d.task)}"]`;
    if (!d.action) return null;
    return (
      `[data-action="${d.action}"]` +
      ["id", "value", "index", "key"]
        .filter((k) => d[k] !== undefined)
        .map((k) => `[data-${k}="${CSS.escape(d[k])}"]`)
        .join("")
    );
  }

  function keepFocus(fn) {
    const key = focusKey(document.activeElement);
    fn();
    if (!key) return;
    const el = root.querySelector(key);
    if (el && el !== document.activeElement) el.focus({ preventScroll: true });
  }

  function render() {
    keepFocus(() => {
      for (const a of root.querySelectorAll(".tab[data-nav]")) {
        if (a.dataset.nav === ui.tab) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
      view.innerHTML = VIEWS[ui.tab]();
    });
    renderNotice();
  }

  function renderSheet() {
    keepFocus(() => {
      sheet.hidden = !ui.aboutOpen;
      sheet.innerHTML = ui.aboutOpen ? aboutSheet() : "";
    });
  }

  function renderNotice() {
    const el = document.getElementById("notice");
    if (!el) return;
    el.innerHTML = storageWorks
      ? ""
      : `<p class="notice">Браузер не даёт сохранять данные, поэтому записи пропадут, когда закроешь страницу. Сохрани копию в разделе «О приложении и данных».</p>`;
  }

  let toastTimer = null;
  function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  function go(tab) {
    ui.tab = VIEWS[tab] ? tab : "path";
    ui.confirmDelete = null;
    try {
      history.replaceState(null, "", "#" + ui.tab);
    } catch (e) {
      // В некоторых встроенных окнах менять адрес нельзя. Раздел всё равно переключится.
    }
    render();
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  let focusBeforeSheet = null;

  function openAbout() {
    flush();
    focusBeforeSheet = document.activeElement;
    ui.aboutOpen = true;
    ui.importStatus = "";
    renderSheet();
    document.documentElement.classList.add("is-locked");
    sheet.querySelector("[data-action='close-about']").focus();
  }

  function closeAbout() {
    ui.aboutOpen = false;
    ui.confirmReset = false;
    ui.importText = "";
    ui.importStatus = "";
    renderSheet();
    document.documentElement.classList.remove("is-locked");
    if (focusBeforeSheet && document.contains(focusBeforeSheet)) focusBeforeSheet.focus();
  }

  function setTask(id, on) {
    if (on) state.tasks[id] = true;
    else delete state.tasks[id];
    save();
    render();
    if (!on) return;
    const stage = C.stages.find((s) => s.tasks.some((t) => t.id === id));
    toast(stage && stageDone(stage) === stage.tasks.length ? `Этап «${stage.title}» пройден` : "Шаг отмечен");
  }

  function addEntry() {
    const text = ui.draft.text.trim();
    if (!text) {
      toast("Напиши хотя бы пару слов");
      document.getElementById("entry-text").focus();
      return;
    }
    state.entries.push({ id: uid(), date: Date.now(), mood: ui.draft.mood, tag: ui.draft.tag, text });
    ui.draft = { mood: null, tag: ui.draft.tag, text: "" };
    ui.promptIndex += 1;
    save();
    render();
    toast("Запись сохранена");
  }

  // ---------- События ----------

  const actions = {
    "dismiss-intro"() {
      state.seenIntro = true;
      save();
      render();
    },
    "toggle-stage"(d) {
      const i = Number(d.index);
      const open = ui.openStage === null ? currentStageIndex() : ui.openStage;
      ui.openStage = open === i ? -1 : i;
      render();
    },
    "done-task"(d) {
      setTask(d.id, true);
    },
    goto(d) {
      if (d.section) ui.meSection = d.section;
      if (d.who) ui.who = d.who;
      go(d.to);
    },
    "next-prompt"() {
      ui.promptIndex += 1;
      render();
    },
    mood(d) {
      const v = Number(d.value);
      ui.draft.mood = ui.draft.mood === v ? null : v;
      render();
    },
    tag(d) {
      ui.draft.tag = d.value;
      render();
    },
    "ask-delete"(d) {
      ui.confirmDelete = d.id;
      render();
    },
    "cancel-delete"() {
      ui.confirmDelete = null;
      render();
    },
    "delete-entry"(d) {
      state.entries = state.entries.filter((e) => e.id !== d.id);
      ui.confirmDelete = null;
      save();
      render();
      toast("Запись удалена");
    },
    "me-section"(d) {
      flush();
      ui.meSection = d.value;
      render();
    },
    who(d) {
      flush();
      ui.who = d.value;
      render();
    },
    "remove-item"(d) {
      state.portrait[ui.who][d.key].splice(Number(d.index), 1);
      save();
      render();
    },
    "toggle-value"(d) {
      const list = state.portrait[ui.who].values;
      const i = list.indexOf(d.value);
      if (i === -1) list.push(d.value);
      else list.splice(i, 1);
      save();
      render();
    },
    "place-status"(d) {
      state.places[d.id] = { note: "", ...state.places[d.id], status: d.value };
      save();
      render();
    },
    "remove-place"(d) {
      state.customPlaces = state.customPlaces.filter((p) => p.id !== d.id);
      delete state.places[d.id];
      save();
      render();
    },
    about() {
      openAbout();
    },
    "close-about"() {
      closeAbout();
    },
    "copy-export"() {
      const area = document.getElementById("export-text");
      const selectInstead = () => {
        area.focus();
        area.select();
        toast("Текст выделен, скопируй его вручную");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(() => toast("Копия скопирована"), selectInstead);
      } else {
        selectInstead();
      }
    },
    "download-export"() {
      const url = URL.createObjectURL(new Blob([exportText()], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `navstrechu-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    "import-text"() {
      applyImport(ui.importText);
    },
    async install() {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      try {
        await prompt.userChoice;
      } catch (e) {
        // Пользователь закрыл окно установки. Ничего делать не нужно.
      }
      refreshInstall();
    },
    "hide-install"() {
      ui.installBannerHidden = true;
      try {
        localStorage.setItem(INSTALL_BANNER_KEY, "1");
      } catch (e) {
        // Не сохранилось: баннер просто появится снова при следующем открытии.
      }
      render();
    },
    "ask-reset"() {
      ui.confirmReset = true;
      renderSheet();
      sheet.querySelector("[data-action='cancel-reset']").focus();
    },
    "cancel-reset"() {
      ui.confirmReset = false;
      renderSheet();
      sheet.querySelector("[data-action='ask-reset']").focus();
    },
    reset() {
      state = defaultState();
      ui.draft = { mood: null, tag: "step", text: "" };
      ui.openStage = null;
      save();
      closeAbout();
      go("path");
      toast("Все данные стёрты");
    },
  };

  root.addEventListener("click", (ev) => {
    const nav = ev.target.closest("[data-nav]");
    if (nav) {
      ev.preventDefault();
      go(nav.dataset.nav);
      return;
    }
    if (ev.target === sheet) {
      closeAbout();
      return;
    }
    const el = ev.target.closest("[data-action]");
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset, el);
  });

  root.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "entry-text") {
      ui.draft.text = t.value;
    } else if (t.id === "import-text") {
      ui.importText = t.value;
    } else if (t.dataset.answer) {
      state.answers[t.dataset.answer] = t.value;
      saveSoon();
    } else if (t.dataset.portrait) {
      state.portrait[ui.who][t.dataset.portrait] = t.value;
      saveSoon();
    } else if (t.dataset.placeNote) {
      const id = t.dataset.placeNote;
      state.places[id] = { status: "none", ...state.places[id], note: t.value };
      saveSoon();
    }
  });

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.task) {
      setTask(t.dataset.task, t.checked);
    } else if (t.id === "import-file" && t.files && t.files[0]) {
      readFile(t.files[0]);
      t.value = "";
    }
  });

  root.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const kind = form.dataset.form;

    if (kind === "entry") {
      addEntry();
    } else if (kind === "add-item") {
      const input = form.querySelector(".input");
      const value = input.value.trim();
      if (!value) return;
      const list = state.portrait[ui.who][form.dataset.key];
      if (!list.includes(value)) list.push(value);
      save();
      render();
      document.getElementById(input.id).focus();
    } else if (kind === "add-place") {
      const nameInput = document.getElementById("place-name");
      const name = nameInput.value.trim();
      if (!name) {
        toast("Напиши, что это за место");
        nameInput.focus();
        return;
      }
      state.customPlaces.push({ id: "my-" + uid(), name, tip: document.getElementById("place-tip").value.trim() });
      save();
      render();
      toast("Место добавлено");
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && ui.aboutOpen) {
      closeAbout();
    } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && ev.target.id === "entry-text") {
      // На компьютере запись удобно сохранять, не отрывая рук от клавиатуры.
      ev.preventDefault();
      addEntry();
    }
  });

  function refreshInstall() {
    document.getElementById("side-install").hidden = !installPrompt;
    render();
    if (ui.aboutOpen) renderSheet();
  }

  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    installPrompt = ev;
    refreshInstall();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    refreshInstall();
    toast("Приложение установлено");
  });

  // Работа без интернета. Во встроенном предпросмотре и при открытии файла с диска недоступна.
  if ("serviceWorker" in navigator && !inFrame && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  window.addEventListener("hashchange", () => {
    const tab = tabFromHash();
    if (tab !== ui.tab) go(tab);
  });

  // Не теряем то, что печатали прямо перед закрытием.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  render();
})();
