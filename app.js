(() => {
  const C = window.BOVIRONDA_CONFIG || {};
  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");

  const state = {
    session: null,
    profile: null,
    dashboard: null,
    parks: [],
    incidents: [],
    rounds: [],
    users: [],
    farms: [],
    page: "home",
    farmFilter: "Todos",
    scanner: null,
    reportIncidents: [],
    reportHealth: [],
    reportLoading: false
  };

  const ROLE_LABELS = {
    admin: "Admin",
    utilizador: "Utilizador",
    veterinario: "Veterinário",
    chefia: "Chefia"
  };

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function escapeHtml(s="") {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function photoLinks(value) {
    try {
      const text=String(value||"").trim();
      const raw=/^[A-Za-z0-9_-]{10,}$/.test(text);
      const u=raw ? null : new URL(text);
      if(u && (u.protocol!=="https:" || !["drive.google.com","docs.google.com","lh3.googleusercontent.com"].includes(u.hostname))) return null;
      const id=raw ? text : ((u.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)||[])[1] || u.searchParams.get("id"));
      if(!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;
      const key=u?.searchParams.get("resourcekey"), suffix=key ? "&resourcekey="+encodeURIComponent(key) : "";
      return {id, image:`https://lh3.googleusercontent.com/d/${id}=s1600${key?'?resourcekey='+encodeURIComponent(key):''}`,
        fallbacks:[`https://drive.google.com/thumbnail?id=${id}&sz=w1600${suffix}`,`https://drive.google.com/uc?export=view&id=${id}${suffix}`],
        view:`https://drive.google.com/file/d/${id}/view${key?'?resourcekey='+encodeURIComponent(key):''}`};
    } catch (_) { return null; }
  }
  function photoMarkup(value) {
    const links=photoLinks(value);
    if(!links) return value ? '<p class="photo-error">Ligação de fotografia não reconhecida.</p>' : "";
    return `<div class="record-photo"><img src="${escapeHtml(links.image)}" data-photo-id="${links.id}" data-photo-steps="${escapeHtml(JSON.stringify(links.fallbacks))}" class="photo-preview" loading="lazy" referrerpolicy="no-referrer" alt="Fotografia do registo"><p class="photo-error hidden" role="status">Não foi possível carregar a fotografia. Confirme a sessão e a implementação do Apps Script ou abra no Drive.</p><a href="${escapeHtml(links.view)}" target="_blank" rel="noopener noreferrer">Abrir fotografia no Drive</a></div>`;
  }
  // Deduplicate simultaneous requests, limit concurrent Drive reads, retain no image cache.
  const photoPending=new Map(), photoQueue=[];
  let photoActive=0;
  function pumpPhotos() {
    while(photoActive<3 && photoQueue.length) {
      const task=photoQueue.shift(); photoActive++;
      task().finally(()=>{photoActive--;pumpPhotos();});
    }
  }
  function sessionPhoto(id,token) {
    const key=token+":"+id;
    if(photoPending.has(key)) return photoPending.get(key);
    const promise=new Promise((resolve,reject)=>{
      photoQueue.push(async()=>{
        const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000);
        try {
          if(state.session?.token!==token) throw new Error("Sessão alterada.");
          const photo=await api("getPhoto",{fileId:id},{signal:controller.signal});
          if(state.session?.token!==token) throw new Error("Sessão alterada.");
          if(!["image/jpeg","image/png","image/webp","image/gif"].includes(photo.mime) || !/^[A-Za-z0-9+/=]+$/.test(photo.base64)) throw new Error("Imagem inválida.");
          resolve(`data:${photo.mime};base64,${photo.base64}`);
        } catch(e) { reject(e); } finally { clearTimeout(timer); }
      });
    });
    photoPending.set(key,promise); pumpPhotos();
    promise.finally(()=>photoPending.delete(key)).catch(()=>{});
    return promise;
  }
  const photoTimers=new WeakMap();
  function watchPhoto(img) {
    clearTimeout(photoTimers.get(img));
    if(img.complete && img.naturalWidth) return;
    photoTimers.set(img,setTimeout(()=>{if(img.isConnected) advancePhoto(img);},10000));
  }
  function failPhoto(img) {
    img.hidden=true;
    img.parentElement?.querySelector(".photo-error")?.classList.remove("hidden");
  }
  async function advancePhoto(img) {
    clearTimeout(photoTimers.get(img));
    if(img.dataset.photoBusy || img.dataset.photoDone) return;
    const steps=JSON.parse(img.dataset.photoSteps||"[]");
    if(steps.length) {
      img.dataset.photoSteps=JSON.stringify(steps.slice(1));
      img.src=steps[0]; watchPhoto(img); return;
    }
    img.dataset.photoBusy="1";
    try {
      const token=state.session?.token;
      if(!token) throw new Error("Sessão inválida.");
      const src=await sessionPhoto(img.dataset.photoId,token);
      if(!img.isConnected || state.session?.token!==token) return;
      img.dataset.photoDone="1"; img.src=src;
    } catch(e) { failPhoto(img); }
    finally { delete img.dataset.photoBusy; }
  }
  document.addEventListener("error",event=>{
    const img=event.target;
    if(!img.matches?.("img[data-photo-id]")) return;
    if(img.dataset.photoDone) failPhoto(img); else advancePhoto(img);
  },true);
  document.addEventListener("load",event=>{
    if(event.target.matches?.("img[data-photo-id]")) clearTimeout(photoTimers.get(event.target));
  },true);
  const photoObserver=new MutationObserver(records=>records.forEach(record=>{
    record.addedNodes.forEach(node=>{
      if(node.nodeType!==1) return;
      if(node.matches?.("img[data-photo-id]")) watchPhoto(node);
      node.querySelectorAll?.("img[data-photo-id]").forEach(watchPhoto);
    });
    record.removedNodes.forEach(node=>{
      if(node.nodeType!==1) return;
      if(node.matches?.("img[data-photo-id]")) clearTimeout(photoTimers.get(node));
      node.querySelectorAll?.("img[data-photo-id]").forEach(img=>clearTimeout(photoTimers.get(img)));
    });
  }));
  photoObserver.observe(document.body,{childList:true,subtree:true});

  async function api(action, payload={}, options={}) {
    if (!C.API_URL || C.API_URL.includes("COLE_AQUI")) {
      throw new Error("Configura primeiro o API_URL em config.js.");
    }
    const body = new URLSearchParams();
    body.set("action", action);
    body.set("payload", JSON.stringify(payload));
    if (state.session?.token) body.set("token", state.session.token);

    const res = await fetch(C.API_URL, {
      method: "POST",
      signal: options.signal,
      headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
      body
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error("Resposta inválida do Apps Script.");
    }
    if (!data.ok) {
      const msg = data.error || "Erro na API.";
      if (msg === "Ação desconhecida.") {
        throw new Error(`Ação desconhecida no Apps Script (${action}). Atualize a implementação do Code.gs.`);
      }
      throw new Error(msg);
    }
    if (action === "listParks" && Array.isArray(data.data)) return data.data.map(p => parkWithCalendarDays(p));
    if (action === "getPark" && data.data?.park) return {...data.data, park:parkWithCalendarDays(data.data.park)};
    return data.data;
  }

  // Compare civil dates in Lisbon, never elapsed blocks of 24 hours.
  // UTC is used only to number those civil dates; DST days may have 23 or 25 hours.
  const roundDayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Lisbon", year:"numeric", month:"2-digit", day:"2-digit"
  });
  function roundCalendarDay(value) {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(roundDayFormatter.formatToParts(date).map(p => [p.type,p.value]));
    return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)) / 86400000;
  }
  function parkWithCalendarDays(park, now=new Date()) {
    const lastDay=roundCalendarDay(park.lastRoundAt), today=roundCalendarDay(now);
    return {...park, daysSinceRound:lastDay===null || today===null ? null : today-lastDay};
  }
  let displayedCalendarDay=roundCalendarDay(new Date());
  function refreshCalendarDay() {
    const today=roundCalendarDay(new Date());
    if (today===displayedCalendarDay || document.getElementById("modalRoot")) return;
    displayedCalendarDay=today;
    state.parks=(state.parks||[]).map(p=>parkWithCalendarDays(p));
    if (state.profile && ["home","parks"].includes(state.page) && !document.getElementById("modalRoot")) renderPage();
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden) refreshCalendarDay();});
  window.addEventListener("focus",refreshCalendarDay);
  setInterval(refreshCalendarDay,30000);

  function saveSession() {
    if (state.session) localStorage.setItem("bovironda_session", JSON.stringify(state.session));
    else localStorage.removeItem("bovironda_session");
  }

  function loadSession() {
    try { state.session = JSON.parse(localStorage.getItem("bovironda_session")) || null; }
    catch { state.session = null; }
  }

  function daysBadge(days) {
    if (days === null || days === undefined) return '<span class="badge badge-grey">Sem ronda</span>';
    if (days < 0) return '<span class="badge badge-amber">Data futura</span>';
    if (days >= (C.CRITICAL_DAYS || 5)) return `<span class="badge badge-red">${days} dias</span>`;
    if (days >= (C.WARNING_DAYS || 3)) return `<span class="badge badge-amber">${days} dias</span>`;
    return `<span class="badge badge-green">${days === 0 ? "Hoje" : days + " dia" + (days === 1 ? "" : "s")}</span>`;
  }

  function roleCanRound() {
    return ["admin","utilizador","veterinario"].includes(state.profile?.role);
  }

  function roleCanSeeVet() {
    return ["admin","veterinario"].includes(state.profile?.role);
  }

  function roleCanSeeOperations() {
    return ["admin","chefia","veterinario"].includes(state.profile?.role);
  }

  function roleCanSeeReports() {
    return ["admin","chefia"].includes(state.profile?.role);
  }

  async function login(username, pin) {
    const data = await api("login", {username, pin});

    state.session = {
      token: data.token,
      expiresAt: data.expiresAt
    };
    state.profile = data.profile;
    saveSession();

    // Entrar na aplicação imediatamente após autenticação.
    state.dashboard = {totalParks:0, openIncidents:0, farms:[]};
    state.parks = [];
    state.incidents = [];
    state.rounds = [];
    renderShell();

    // Carregamento de dados não pode bloquear nem desfazer o login.
    try {
      await loadInitialData();
      renderShell();
    } catch (err) {
      console.error("BoviRonda: erro ao carregar dados iniciais", err);
      toast("Sessão iniciada. Alguns dados não puderam ser carregados.");
    }
  }

  async function resumeSession() {
    if (!state.session?.token) return false;

    try {
      const data = await api("me");
      state.profile = data.profile;

      state.dashboard = {totalParks:0, openIncidents:0, farms:[]};
      state.parks = [];
      state.incidents = [];
      state.rounds = [];

      try {
        await loadInitialData();
      } catch (err) {
        console.error("BoviRonda: falha ao atualizar dados da sessão", err);
      }

      return true;
    } catch {
      state.session = null;
      state.profile = null;
      saveSession();
      return false;
    }
  }

  async function loadInitialData() {
    const [dashboard, parks, incidents] = await Promise.all([
      api("dashboard"),
      api("listParks"),
      api("listIncidents", {status:"open"})
    ]);

    state.dashboard = dashboard;
    state.parks = parks;
    state.incidents = incidents;

    try {
      state.rounds = await api("listRounds");
    } catch (err) {
      console.warn("BoviRonda: listRounds indisponível nesta versão do backend.", err);
      state.rounds = [];
    }
  }

  function renderLogin(error="") {
    app.innerHTML = `
      <main class="login-screen">
        <section class="card login-card">
          <div class="login-brand">
            <img class="login-logo" src="monte-do-pasto-logo.png" alt="Monte do Pasto">
            <h1>BoviRonda</h1>
            <p>Monte do Pasto · Rondas de campo</p>
          </div>
          ${error ? `<div class="error-box" style="margin-bottom:14px">${escapeHtml(error)}</div>` : ""}
          <form id="loginForm" class="form-grid">
            <div class="field">
              <label for="loginUser">Utilizador</label>
              <input id="loginUser" autocomplete="username" required placeholder="ex.: joao.silva">
            </div>
            <div class="field">
              <label for="loginPin">PIN</label>
              <input id="loginPin" type="password" inputmode="numeric" autocomplete="current-password" required placeholder="••••">
            </div>
            <button class="btn btn-primary btn-block" type="submit">Entrar</button>
          </form>
          <div class="login-help">As contas são criadas pelo Administrador da BoviRonda.</div>
        </section>
      </main>`;
    document.getElementById("loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      btn.textContent = "A entrar…";
      try {
        await login(
          document.getElementById("loginUser").value.trim(),
          document.getElementById("loginPin").value.trim()
        );
      } catch (err) {
        renderLogin(err.message);
      }
    });
  }

  function navItems() {
    const items = [
      ["home","⌂","Início"],
      ["rounds","↻","Rondas"],
      ["parks","▦","Parques"],
      ["incidents","!","Ocorrências"]
    ];
    if (roleCanSeeReports()) items.push(["reports","▤","Relatórios"]);
    if (state.profile?.role === "admin") items.push(["admin","⚙","Admin"]);
    return items;
  }

  function renderShell() {
    const nav = navItems();
    app.innerHTML = `
      <div class="desktop-layout">
        <aside class="desktop-sidebar">
          <div class="sidebar-brand">
            <img class="sidebar-logo" src="monte-do-pasto-logo.png" alt="Monte do Pasto">
            <h2>BoviRonda</h2>
            <small style="opacity:.65">Rondas de campo</small>
          </div>
          <nav class="sidebar-nav">
            ${nav.map(([p,i,l]) => `<button class="sidebar-btn ${state.page===p?'active':''}" data-page="${p}">${i} &nbsp; ${l}</button>`).join("")}
          </nav>
        </aside>
        <div class="app-shell">
          <main class="container">
            <header class="topbar">
              <div class="brand">
                <img class="topbar-logo mobile-only" src="monte-do-pasto-logo.png" alt="Monte do Pasto">
                <div>
                  <h1>${escapeHtml(C.APP_NAME || "BoviRonda")}</h1>
                  <p>${escapeHtml(state.profile.fullName)} · ${ROLE_LABELS[state.profile.role] || state.profile.role}</p>
                </div>
              </div>
              <button id="logoutBtn" class="icon-btn" title="Terminar sessão">↪</button>
            </header>
            <div id="page"></div>
          </main>
          <nav class="bottom-nav">
            <div class="bottom-inner">
              ${nav.filter(([p]) => p !== "admin").map(([p,i,l]) => `<button class="nav-btn ${state.page===p?'active':''}" data-page="${p}"><span>${i}</span>${l}</button>`).join("")}
            </div>
          </nav>
        </div>
      </div>`;

    document.querySelectorAll("[data-page]").forEach(btn => {
      btn.addEventListener("click", () => navigate(btn.dataset.page));
    });
    document.getElementById("logoutBtn").addEventListener("click", logout);
    renderPage();
  }

  function navigate(page) {
    stopScanner();
    state.page = page;
    renderShell();
  }

  function renderPage() {
    state.parks=(state.parks||[]).map(p=>parkWithCalendarDays(p));
    const el = document.getElementById("page");
    if (!el) return;
    if (state.page === "home") renderHome(el);
    else if (state.page === "rounds") renderRounds(el);
    else if (state.page === "scan") renderScanner(el);
    else if (state.page === "parks") renderParks(el);
    else if (state.page === "incidents") renderIncidents(el);
    else if (state.page === "reports") renderReports(el);
    else if (state.page === "admin") renderAdmin(el);
  }


  function isoDateLocal(d) {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth()+1).padStart(2,"0");
    const day = String(x.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function parseReportDate(value, fallbackLabel="") {
    const candidates = [value, fallbackLabel].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate;

      const s = String(candidate).trim();
      if (!s) continue;

      // ISO / formatos reconhecidos nativamente pelo browser.
      const nativeDate = new Date(s);
      if (!Number.isNaN(nativeDate.getTime())) return nativeDate;

      // Formato PT: dd/mm/yyyy ou dd/mm/yyyy hh:mm[:ss]
      const pt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (pt) {
        const d = new Date(
          Number(pt[3]),
          Number(pt[2]) - 1,
          Number(pt[1]),
          Number(pt[4] || 0),
          Number(pt[5] || 0),
          Number(pt[6] || 0)
        );
        if (!Number.isNaN(d.getTime())) return d;
      }

      // Formato yyyy-mm-dd [hh:mm:ss]
      const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (ymd) {
        const d = new Date(
          Number(ymd[1]),
          Number(ymd[2]) - 1,
          Number(ymd[3]),
          Number(ymd[4] || 0),
          Number(ymd[5] || 0),
          Number(ymd[6] || 0)
        );
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  function reportDateInRange(value, from, to, fallbackLabel="") {
    const d = parseReportDate(value, fallbackLabel);
    if (!d) return false;

    if (from) {
      const [y,m,day] = from.split("-").map(Number);
      const f = new Date(y, m-1, day, 0, 0, 0, 0);
      if (d < f) return false;
    }

    if (to) {
      const [y,m,day] = to.split("-").map(Number);
      const t = new Date(y, m-1, day, 23, 59, 59, 999);
      if (d > t) return false;
    }

    return true;
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    return `"${s.replace(/"/g,'""')}"`;
  }

  function downloadCsv(filename, rows) {
    const csv = "\ufeff" + rows.map(r => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function reportStatusText(value) {
    const v = String(value || "").toLowerCase();
    if (!v || v === "ok") return "OK";
    if (v === "problema") return "Problema";
    if (v === "baixo") return "Baixo";
    if (v === "sem_agua") return "Sem água";
    if (v === "sem_comida") return "Sem comida";
    return value || "—";
  }

  async function ensureReportData() {
    if (state.reportLoading) return;
    state.reportLoading = true;

    try {
      let rounds = null;
      let incidents = null;

      // Admin: usar diretamente listAdminRecords, que já existe no backend atual.
      // Assim não chamamos listRounds num backend antigo.
      if (state.profile?.role === "admin") {
        try {
          const adminData = await api("listAdminRecords");
          rounds = adminData?.rounds || [];
          incidents = adminData?.incidents || [];
        } catch (err) {
          console.warn("BoviRonda Relatórios: listAdminRecords indisponível.", err);
        }
      }

      // Chefia / compatibilidade: tentar listRounds apenas fora de Admin.
      if (!Array.isArray(rounds) && state.profile?.role !== "admin") {
        try {
          rounds = await api("listRounds");
        } catch (err) {
          console.warn("BoviRonda Relatórios: listRounds indisponível; a usar histórico por parque.", err);
        }
      }

      // Fallback: histórico por parque.
      if (!Array.isArray(rounds)) {
        const all = [];
        const parks = state.parks || [];

        for (let i = 0; i < parks.length; i++) {
          const p = parks[i];
          try {
            const data = await api("getPark", {parkId:p.id});
            (data?.rounds || []).forEach(r => {
              all.push({
                ...r,
                parkId: p.id,
                parkName: p.name || "",
                farmName: p.farmName || ""
              });
            });
          } catch (err) {
            console.warn("Não foi possível carregar histórico do parque", p.id, err);
          }
        }

        const seen = new Set();
        rounds = all.filter(r => {
          const key = String(r.id || `${r.parkId}_${r.completedAt || r.completedAtLabel || ""}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Ocorrências: usar as do Admin ou a API normal.
      if (!Array.isArray(incidents)) {
        try {
          incidents = await api("listIncidents", {});
        } catch (err) {
          console.warn("BoviRonda Relatórios: não foi possível carregar ocorrências.", err);
          incidents = [];
        }
      }

      state.rounds = (rounds || []).map(r => ({
        ...r,
        _reportDate: parseReportDate(r.completedAt, r.completedAtLabel)
      }));

      state.reportIncidents = (incidents || []).map(i => ({
        ...i,
        _reportDate: parseReportDate(i.reportedAt, i.reportedAtLabel)
      }));

      // Detalhes clínicos / necrópsia para relatórios de saúde animal.
      const veterinaryIncidents = state.reportIncidents.filter(i =>
        i.category === "veterinaria" || ["animal_doente","animal_morto"].includes(i.type)
      );

      const health = [];
      for (let i = 0; i < veterinaryIncidents.length; i++) {
        const incident = veterinaryIncidents[i];
        try {
          const detail = await api("getIncident", {incidentId: incident.id});
          health.push({
            incident: detail?.incident || incident,
            veterinary: detail?.veterinary || null,
            necropsy: detail?.necropsy || null
          });
        } catch (err) {
          console.warn("Não foi possível carregar detalhe veterinário", incident.id, err);
          health.push({incident, veterinary:null, necropsy:null});
        }
      }
      state.reportHealth = health;

      console.info("BoviRonda Relatórios carregados:", {
        rounds: state.rounds.length,
        incidents: state.reportIncidents.length,
        health: state.reportHealth.length
      });
    } finally {
      state.reportLoading = false;
    }
  }

  async function renderReports(el) {
    if (!roleCanSeeReports()) {
      el.innerHTML = `<div class="error-box">O seu perfil não tem acesso aos relatórios.</div>`;
      return;
    }

    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultFrom = isoDateLocal(first);
    const defaultTo = isoDateLocal(today);

    el.innerHTML = `
      <div class="page-head reports-page-head">
        <div>
          <h2>Relatórios</h2>
          <p>Análise de rondas, ocorrências e acompanhamento dos parques.</p>
        </div>
      </div>

      <section class="card card-pad reports-filters">
        <div class="reports-filter-grid reports-filter-grid-main">
          <div class="field">
            <label>Tipo de relatório</label>
            <select id="reportType">
              <option value="general">Relatório Geral</option>
              <option value="rounds">Relatório de Rondas</option>
              <option value="incidents">Relatório de Ocorrências</option>
              <option value="parks">Relatório por Parque</option>
              <option value="veterinary">Relatório Veterinário</option>
              <option value="sick">Animais Doentes</option>
              <option value="mortality">Mortalidades</option>
            </select>
          </div>
          <div class="field">
            <label>De</label>
            <input id="reportFrom" type="date" value="${defaultFrom}">
          </div>
          <div class="field">
            <label>Até</label>
            <input id="reportTo" type="date" value="${defaultTo}">
          </div>
          <div class="field">
            <label>Exploração</label>
            <select id="reportFarm">
              <option value="">Todas</option>
              <option value="Monte Ruivo">Monte Ruivo</option>
              <option value="Trolho">Trolho</option>
            </select>
          </div>
          <div class="field">
            <label>Parque</label>
            <select id="reportPark">
              <option value="">Todos</option>
            </select>
          </div>
        </div>

        <div class="reports-actions">
          <button id="reportApplyBtn" class="btn btn-primary" type="button">Gerar relatório</button>
          <button id="reportCsvBtn" class="btn btn-outline" type="button">Exportar CSV</button>
          <button id="reportPrintBtn" class="btn btn-outline" type="button">Guardar PDF / Imprimir</button>
        </div>
      </section>

      <div id="reportsContent">
        <div class="card card-pad">A carregar relatórios…</div>
      </div>
    `;

    const farmEl = document.getElementById("reportFarm");
    const parkEl = document.getElementById("reportPark");

    const fillParks = () => {
      const farm = farmEl.value;
      const parks = (state.parks || [])
        .filter(p => !farm || p.farmName === farm)
        .slice()
        .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"pt",{numeric:true,sensitivity:"base"}));
      parkEl.innerHTML = `<option value="">Todos</option>` +
        parks.map(p=>`<option value="${p.id}">${escapeHtml(p.name || "Parque")}</option>`).join("");
    };

    farmEl.addEventListener("change", () => {
      fillParks();
      buildReportsContent();
    });

    document.getElementById("reportApplyBtn").addEventListener("click", buildReportsContent);
    document.getElementById("reportType").addEventListener("change", buildReportsContent);
    document.getElementById("reportPrintBtn").addEventListener("click", () => {
      document.body.classList.add("printing-report");
      setTimeout(() => window.print(), 60);
    });
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"));
    document.getElementById("reportCsvBtn").addEventListener("click", exportReportsCsv);

    fillParks();

    try {
      await ensureReportData();
      fillParks();
      buildReportsContent();
    } catch (err) {
      document.getElementById("reportsContent").innerHTML =
        `<div class="error-box">Não foi possível carregar os relatórios: ${escapeHtml(err.message)}</div>`;
    }
  }

  function filteredReportData() {
    const from = document.getElementById("reportFrom")?.value || "";
    const to = document.getElementById("reportTo")?.value || "";
    const farm = document.getElementById("reportFarm")?.value || "";
    const parkId = document.getElementById("reportPark")?.value || "";

    const rounds = (state.rounds || []).filter(r =>
      reportDateInRange(r._reportDate || r.completedAt, from, to, r.completedAtLabel) &&
      (!farm || r.farmName === farm) &&
      (!parkId || r.parkId === parkId)
    );

    const incidents = (state.reportIncidents || []).filter(i =>
      reportDateInRange(i._reportDate || i.reportedAt, from, to, i.reportedAtLabel) &&
      (!farm || i.farmName === farm) &&
      (!parkId || i.parkId === parkId)
    );

    const parks = (state.parks || []).filter(p =>
      (!farm || p.farmName === farm) &&
      (!parkId || p.id === parkId)
    );

    return {from,to,farm,parkId,rounds,incidents,parks};
  }

  function buildReportsContent() {
    const root = document.getElementById("reportsContent");
    if (!root) return;

    const reportType = document.getElementById("reportType")?.value || "general";
    const {from,to,rounds,incidents,parks,farm,parkId} = filteredReportData();

    const distinctParkIds = new Set(rounds.map(r=>r.parkId));
    const openIncidents = incidents.filter(i=>i.status !== "resolvida");
    const vetIncidents = incidents.filter(i=>i.category === "veterinaria");
    const waterProblems = rounds.filter(r=>r.water && r.water !== "ok").length;
    const feedProblems = rounds.filter(r=>r.feed && r.feed !== "ok").length;
    const infraProblems = rounds.filter(r=>r.infrastructure === "problema").length;

    const healthInRange = (state.reportHealth || []).filter(h => {
      const i = h.incident || {};
      return reportDateInRange(i._reportDate || i.reportedAt, from, to, i.reportedAtLabel) &&
        (!farm || i.farmName === farm) &&
        (!parkId || i.parkId === parkId);
    });
    const sickAnimals = healthInRange.filter(h => h.incident?.type === "animal_doente");
    const mortalities = healthInRange.filter(h => h.incident?.type === "animal_morto");

    const selectedPark = (state.parks || []).find(p=>p.id===parkId);
    const titleMap = {
      general:"Relatório Geral",
      rounds:"Relatório de Rondas",
      incidents:"Relatório de Ocorrências",
      parks:"Relatório por Parque",
      veterinary:"Relatório Veterinário",
      sick:"Animais Doentes",
      mortality:"Mortalidades"
    };

    const header = `
      <section class="report-document-header">
        <div>
          <div class="report-brand">MONTE DO PASTO</div>
          <h2>${titleMap[reportType]}</h2>
          <p>BoviRonda · ${escapeHtml(from)} a ${escapeHtml(to)}</p>
          <small>${escapeHtml(farm || "Todas as explorações")} · ${escapeHtml(selectedPark?.name || "Todos os parques")}</small>
        </div>
        <div class="report-generated-at">Gerado em ${new Date().toLocaleString("pt-PT")}</div>
      </section>`;

    const summary = `
      <section class="reports-kpis">
        <article class="card report-kpi"><span>Rondas</span><strong>${rounds.length}</strong><small>${distinctParkIds.size} parques</small></article>
        <article class="card report-kpi"><span>Ocorrências</span><strong>${incidents.length}</strong><small>${openIncidents.length} abertas</small></article>
        <article class="card report-kpi"><span>Veterinária</span><strong>${vetIncidents.length}</strong><small>no período</small></article>
        <article class="card report-kpi"><span>Problemas</span><strong>${waterProblems+feedProblems+infraProblems}</strong><small>água/comida/infra.</small></article>
      </section>`;

    const roundsSection = `
      <section class="card card-pad report-section">
        <div class="report-section-head"><div><h3>Rondas</h3><p>${rounds.length} registos</p></div></div>
        <div class="table-wrap"><table class="report-table">
          <thead><tr><th>Data</th><th>Exploração</th><th>Parque</th><th>Colaborador</th><th>Água</th><th>Comida</th><th>Infra.</th><th>Observações</th></tr></thead>
          <tbody>${rounds.length ? rounds.map(r=>`<tr>
            <td>${escapeHtml(r.completedAtLabel||"")}</td>
            <td>${escapeHtml(r.farmName||"")}</td>
            <td><strong>${escapeHtml(visibleParkName(r))}</strong></td>
            <td>${escapeHtml(r.userName||"")}</td>
            <td>${escapeHtml(reportStatusText(r.water))}</td>
            <td>${escapeHtml(reportStatusText(r.feed))}</td>
            <td>${escapeHtml(reportStatusText(r.infrastructure))}</td>
            <td>${escapeHtml(r.notes||"")}</td>
          </tr>`).join("") : `<tr><td colspan="8" class="report-empty">Sem rondas.</td></tr>`}</tbody>
        </table></div>
      </section>`;

    const incidentsSection = `
      <section class="card card-pad report-section">
        <div class="report-section-head"><div><h3>Ocorrências</h3><p>${incidents.length} registos</p></div></div>
        <div class="table-wrap"><table class="report-table">
          <thead><tr><th>Data</th><th>Exploração</th><th>Parque</th><th>Tipo</th><th>Estado</th><th>Reportado por</th><th>Descrição</th></tr></thead>
          <tbody>${incidents.length ? incidents.map(i=>`<tr>
            <td>${escapeHtml(i.reportedAtLabel||"")}</td>
            <td>${escapeHtml(i.farmName||"")}</td>
            <td><strong>${escapeHtml(visibleParkName(i))}</strong></td>
            <td>${escapeHtml(i.typeLabel||"")}</td>
            <td>${escapeHtml(i.statusLabel||i.status||"")}</td>
            <td>${escapeHtml(i.reportedByName||"")}</td>
            <td>${escapeHtml(i.description||"")}</td>
          </tr>`).join("") : `<tr><td colspan="7" class="report-empty">Sem ocorrências.</td></tr>`}</tbody>
        </table></div>
      </section>`;

    const parksSection = `
      <section class="card card-pad report-section">
        <div class="report-section-head"><div><h3>Parques</h3><p>Resumo de atividade</p></div></div>
        <div class="table-wrap"><table class="report-table">
          <thead><tr><th>Exploração</th><th>Parque</th><th>Rondas</th><th>Ocorrências</th><th>Última ronda</th></tr></thead>
          <tbody>${parks.length ? parks.map(p=>{
            const pr = rounds.filter(r=>r.parkId===p.id);
            const pi = incidents.filter(i=>i.parkId===p.id);
            const last = pr.slice().sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt))[0];
            return `<tr><td>${escapeHtml(p.farmName||"")}</td><td><strong>${escapeHtml(p.name||"Parque")}</strong></td><td>${pr.length}</td><td>${pi.length}</td><td>${last?escapeHtml(last.completedAtLabel||""):"Sem ronda"}</td></tr>`;
          }).join("") : `<tr><td colspan="5" class="report-empty">Sem parques.</td></tr>`}</tbody>
        </table></div>
      </section>`;

    const vetSection = `
      <section class="card card-pad report-section">
        <div class="report-section-head"><div><h3>Veterinária</h3><p>${vetIncidents.length} ocorrências</p></div></div>
        <div class="table-wrap"><table class="report-table">
          <thead><tr><th>Data</th><th>Exploração</th><th>Parque</th><th>Tipo</th><th>Estado</th><th>Descrição</th></tr></thead>
          <tbody>${vetIncidents.length ? vetIncidents.map(i=>`<tr>
            <td>${escapeHtml(i.reportedAtLabel||"")}</td>
            <td>${escapeHtml(i.farmName||"")}</td>
            <td><strong>${escapeHtml(visibleParkName(i))}</strong></td>
            <td>${escapeHtml(i.typeLabel||"")}</td>
            <td>${escapeHtml(i.statusLabel||i.status||"")}</td>
            <td>${escapeHtml(i.description||"")}</td>
          </tr>`).join("") : `<tr><td colspan="6" class="report-empty">Sem ocorrências veterinárias.</td></tr>`}</tbody>
        </table></div>
      </section>`;

    const sickSection = `
      <section class="card card-pad report-section">
        <div class="report-section-head">
          <div><h3>Animais Doentes</h3><p>${sickAnimals.length} registos no período</p></div>
        </div>
        <div class="table-wrap">
          <table class="report-table health-report-table">
            <thead>
              <tr>
                <th>Data</th><th>Exploração</th><th>Parque</th><th>Identificação</th>
                <th>Estado</th><th>Observação clínica</th><th>Diagnóstico</th>
                <th>Tratamento</th><th>Medicamento</th><th>Dose</th>
              </tr>
            </thead>
            <tbody>
              ${sickAnimals.length ? sickAnimals.map(h=>{
                const i=h.incident||{}, v=h.veterinary||{};
                return `<tr>
                  <td>${escapeHtml(i.reportedAtLabel||"")}</td>
                  <td>${escapeHtml(i.farmName||"")}</td>
                  <td><strong>${escapeHtml(visibleParkName(i))}</strong></td>
                  <td><strong>${escapeHtml(v.nrPt||(i.photoUrl ? "Fotografia do brinco" : "Sem fotografia (registo antigo)"))}</strong></td>
                  <td>${escapeHtml(i.statusLabel||i.status||"")}</td>
                  <td>${escapeHtml(v.clinicalObservation||"")}</td>
                  <td>${escapeHtml(v.diagnosis||"")}</td>
                  <td>${escapeHtml(v.treatment||"")}</td>
                  <td>${escapeHtml(v.medication||"")}</td>
                  <td>${escapeHtml(v.dosage||"")}</td>
                </tr>`;
              }).join("") : `<tr><td colspan="10" class="report-empty">Sem animais doentes no período selecionado.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>`;

    const mortalitySection = `
      <section class="card card-pad report-section">
        <div class="report-section-head">
          <div><h3>Mortalidades</h3><p>${mortalities.length} registos no período</p></div>
        </div>
        <div class="table-wrap">
          <table class="report-table health-report-table">
            <thead>
              <tr>
                <th>Data</th><th>Exploração</th><th>Parque</th><th>Identificação</th>
                <th>Estado</th><th>Resumo necrópsia</th><th>Causa provável</th><th>Conclusão</th>
              </tr>
            </thead>
            <tbody>
              ${mortalities.length ? mortalities.map(h=>{
                const i=h.incident||{}, v=h.veterinary||{}, n=h.necropsy||{};
                return `<tr>
                  <td>${escapeHtml(i.reportedAtLabel||"")}</td>
                  <td>${escapeHtml(i.farmName||"")}</td>
                  <td><strong>${escapeHtml(visibleParkName(i))}</strong></td>
                  <td><strong>${escapeHtml(v.nrPt||n.nrPt||(i.photoUrl ? "Fotografia do brinco" : "Sem fotografia (registo antigo)"))}</strong></td>
                  <td>${escapeHtml(i.statusLabel||i.status||"")}</td>
                  <td>${escapeHtml(n.summary||"")}</td>
                  <td>${escapeHtml(n.probableCause||"")}</td>
                  <td>${escapeHtml(n.conclusion||"")}</td>
                </tr>`;
              }).join("") : `<tr><td colspan="8" class="report-empty">Sem mortalidades no período selecionado.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>`;

    let body = summary;
    if (reportType === "general") body += roundsSection + incidentsSection + parksSection;
    if (reportType === "rounds") body += roundsSection;
    if (reportType === "incidents") body += incidentsSection;
    if (reportType === "parks") body += parksSection;
    if (reportType === "veterinary") body += vetSection;
    if (reportType === "sick") body += sickSection;
    if (reportType === "mortality") body += mortalitySection;

    const loadedInfo = `
      <div class="report-loaded-info">
        Dados carregados: ${state.rounds.length} rondas · ${state.reportIncidents.length} ocorrências
      </div>`;
    root.innerHTML = `<div class="report-document">${header}${loadedInfo}${body}</div>`;
  }

  function exportReportsCsv() {
    const reportType = document.getElementById("reportType")?.value || "general";
    const {from,to,farm,parkId,rounds,incidents,parks} = filteredReportData();

    const selectedPark = (state.parks || []).find(p => p.id === parkId);
    const reportNames = {
      general: "Relatório Geral",
      rounds: "Relatório de Rondas",
      incidents: "Relatório de Ocorrências",
      parks: "Relatório por Parque",
      veterinary: "Relatório Veterinário",
      sick: "Animais Doentes",
      mortality: "Mortalidades"
    };

    const rows = [
      ["MONTE DO PASTO · BoviRonda"],
      ["Relatório", reportNames[reportType] || "Relatório"],
      ["Período", `${from} a ${to}`],
      ["Exploração", farm || "Todas"],
      ["Parque", selectedPark?.name || "Todos"],
      []
    ];

    if (reportType === "general") {
      rows.push(["RESUMO"]);
      rows.push(["Rondas", rounds.length]);
      rows.push(["Ocorrências", incidents.length]);
      rows.push(["Veterinária", incidents.filter(i=>i.category==="veterinaria").length]);
      rows.push([]);

      rows.push(["RONDAS"]);
      rows.push(["Data","Exploração","Parque","Colaborador","Água","Comida","Infraestrutura","Observações"]);
      rounds.forEach(r => rows.push([
        r.completedAtLabel || "",
        r.farmName || "",
        visibleParkName(r),
        r.userName || "",
        reportStatusText(r.water),
        reportStatusText(r.feed),
        reportStatusText(r.infrastructure),
        r.notes || ""
      ]));

      rows.push([]);
      rows.push(["OCORRÊNCIAS"]);
      rows.push(["Data","Exploração","Parque","Tipo","Estado","Reportado por","Descrição"]);
      incidents.forEach(i => rows.push([
        i.reportedAtLabel || "",
        i.farmName || "",
        visibleParkName(i),
        i.typeLabel || "",
        i.statusLabel || i.status || "",
        i.reportedByName || "",
        i.description || ""
      ]));

      rows.push([]);
      rows.push(["PARQUES"]);
      rows.push(["Exploração","Parque","Dias desde última ronda"]);
      parks.forEach(p => rows.push([
        p.farmName || "",
        p.name || "Parque",
        p.daysSinceRound === null || p.daysSinceRound === undefined ? "Sem histórico" : p.daysSinceRound
      ]));
    }

    if (reportType === "rounds") {
      rows.push(["Data","Exploração","Parque","Colaborador","Água","Comida","Infraestrutura","Observações"]);
      rounds.forEach(r => rows.push([
        r.completedAtLabel || "",
        r.farmName || "",
        visibleParkName(r),
        r.userName || "",
        reportStatusText(r.water),
        reportStatusText(r.feed),
        reportStatusText(r.infrastructure),
        r.notes || ""
      ]));
    }

    if (reportType === "incidents") {
      rows.push(["Data","Exploração","Parque","Tipo","Estado","Reportado por","Descrição"]);
      incidents.forEach(i => rows.push([
        i.reportedAtLabel || "",
        i.farmName || "",
        visibleParkName(i),
        i.typeLabel || "",
        i.statusLabel || i.status || "",
        i.reportedByName || "",
        i.description || ""
      ]));
    }

    if (reportType === "parks") {
      rows.push(["Exploração","Parque","Rondas no período","Ocorrências no período","Última ronda no período"]);
      parks.forEach(p => {
        const pr = rounds.filter(r => r.parkId === p.id);
        const pi = incidents.filter(i => i.parkId === p.id);
        const last = pr.slice().sort((a,b) => {
          const da = parseReportDate(a.completedAt, a.completedAtLabel)?.getTime() || 0;
          const db = parseReportDate(b.completedAt, b.completedAtLabel)?.getTime() || 0;
          return db - da;
        })[0];

        rows.push([
          p.farmName || "",
          p.name || "Parque",
          pr.length,
          pi.length,
          last?.completedAtLabel || "Sem ronda"
        ]);
      });
    }

    if (reportType === "veterinary") {
      const vetIncidents = incidents.filter(i => i.category === "veterinaria");
      rows.push(["Data","Exploração","Parque","Tipo","Estado","Reportado por","Descrição"]);
      vetIncidents.forEach(i => rows.push([
        i.reportedAtLabel || "",
        i.farmName || "",
        visibleParkName(i),
        i.typeLabel || "",
        i.statusLabel || i.status || "",
        i.reportedByName || "",
        i.description || ""
      ]));
    }

    if (reportType === "sick" || reportType === "mortality") {
      const healthInRange = (state.reportHealth || []).filter(h => {
        const i = h.incident || {};
        return reportDateInRange(i._reportDate || i.reportedAt, from, to, i.reportedAtLabel) &&
          (!farm || i.farmName === farm) &&
          (!parkId || i.parkId === parkId);
      });

      if (reportType === "sick") {
        rows.push([
          "Data","Exploração","Parque","Identificação","Estado",
          "Observação clínica","Diagnóstico","Tratamento","Medicamento","Dose"
        ]);

        healthInRange
          .filter(h => h.incident?.type === "animal_doente")
          .forEach(h => {
            const i = h.incident || {};
            const v = h.veterinary || {};
            rows.push([
              i.reportedAtLabel || "",
              i.farmName || "",
              visibleParkName(i),
              v.nrPt || i.photoUrl || "",
              i.statusLabel || i.status || "",
              v.clinicalObservation || "",
              v.diagnosis || "",
              v.treatment || "",
              v.medication || "",
              v.dosage || ""
            ]);
          });
      }

      if (reportType === "mortality") {
        rows.push([
          "Data","Exploração","Parque","Identificação","Estado",
          "Resumo necrópsia","Causa provável","Conclusão"
        ]);

        healthInRange
          .filter(h => h.incident?.type === "animal_morto")
          .forEach(h => {
            const i = h.incident || {};
            const v = h.veterinary || {};
            const n = h.necropsy || {};
            rows.push([
              i.reportedAtLabel || "",
              i.farmName || "",
              visibleParkName(i),
              v.nrPt || n.nrPt || i.photoUrl || "",
              i.statusLabel || i.status || "",
              n.summary || "",
              n.probableCause || "",
              n.conclusion || ""
            ]);
          });
      }
    }

    const safeType = String(reportNames[reportType] || reportType)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-zA-Z0-9]+/g,"_")
      .replace(/^_+|_+$/g,"");

    downloadCsv(
      `BoviRonda_${safeType}_${from || "inicio"}_${to || "fim"}.csv`,
      rows
    );
  }

  function renderHome(el) {
    const d = state.dashboard || {};
    const parks = state.parks || [];
    const incidents = (state.incidents || []).filter(i => i.status !== "resolvida");

    const todayParks = parks.filter(p => p.daysSinceRound === 0);
    const notTodayParks = parks.filter(p => p.daysSinceRound !== 0);
    const overdueParks = parks
      .filter(p => p.daysSinceRound === null || p.daysSinceRound >= (C.WARNING_DAYS || 3))
      .sort((a,b) => (b.daysSinceRound ?? 9999) - (a.daysSinceRound ?? 9999));

    const criticalIncidents = incidents.filter(i => ["sem_agua","sem_comida"].includes(i.type));
    const vetIncidents = incidents.filter(i => i.category === "veterinaria");
    const operationalIncidents = incidents.filter(i => i.category === "operacional" && !["sem_agua","sem_comida"].includes(i.type));

    const farmCards = (d.farms || []).map(f => {
      const farmParks = parks.filter(p => p.farmId === f.id);
      const today = farmParks.filter(p => p.daysSinceRound === 0).length;
      const withoutToday = farmParks.length - today;
      const overdue = farmParks.filter(p => p.daysSinceRound === null || p.daysSinceRound >= (C.WARNING_DAYS || 3)).length;
      return {...f, today, withoutToday, overdue};
    });

    el.innerHTML = `
      ${renderTopAlerts(criticalIncidents, vetIncidents, operationalIncidents, overdueParks)}

      <section class="card hero dashboard-hero">
        <small>Estado das rondas de hoje</small>
        <h2>${todayParks.length} de ${parks.length} parques já tiveram ronda</h2>
        <p>Os restantes continuam visíveis abaixo. A cor mostra há quanto tempo foi feita a última ronda.</p>

        <div class="dashboard-progress-wrap">
          <div class="dashboard-progress-label">
            <span>${todayParks.length} com ronda hoje</span>
            <strong>${parks.length ? Math.round((todayParks.length / parks.length) * 100) : 0}%</strong>
          </div>
          <div class="dashboard-progress"><span style="width:${parks.length ? Math.round((todayParks.length / parks.length) * 100) : 0}%"></span></div>
        </div>

        <div class="hero-actions">
          ${roleCanRound() ? `<button id="homeScanBtn" class="btn btn-light">▣ &nbsp; Ler QR do parque</button>` : ""}
          <button id="refreshBtn" class="btn hero-secondary-btn">↻ Atualizar</button>
        </div>
      </section>

      <section class="dashboard-kpis">
        <button class="dashboard-kpi dashboard-kpi-done" id="showTodayBtn">
          <span class="dashboard-kpi-icon">✓</span>
          <div><strong>${todayParks.length}</strong><span>Com ronda hoje</span></div>
        </button>

        <button class="dashboard-kpi dashboard-kpi-pending" id="showPendingBtn">
          <span class="dashboard-kpi-icon">○</span>
          <div><strong>${notTodayParks.length}</strong><span>Sem ronda hoje</span></div>
        </button>

        <button class="dashboard-kpi dashboard-kpi-warning" id="showOverdueBtn">
          <span class="dashboard-kpi-icon">!</span>
          <div><strong>${overdueParks.length}</strong><span>Há +${C.WARNING_DAYS || 3} dias</span></div>
        </button>

        <button class="dashboard-kpi dashboard-kpi-alert" id="showAlertsBtn">
          <span class="dashboard-kpi-icon">⚠</span>
          <div><strong>${incidents.length}</strong><span>Alertas abertos</span></div>
        </button>
      </section>

      <div class="section-title dashboard-section-title">
        <div>
          <h3>Explorações</h3>
          <p>Comparação rápida entre Monte Ruivo e Trolho</p>
        </div>
      </div>

      <section class="farms dashboard-farms">
        ${farmCards.map(f => `
          <article class="card farm-card dashboard-farm-card">
            <div class="farm-head">
              <div><h3>${escapeHtml(f.name)}</h3><p>${f.totalParks} parques</p></div>
              <span class="badge ${f.openIncidents ? 'badge-red':'badge-green'}">${f.openIncidents} alertas</span>
            </div>

            <div class="farm-round-status">
              <div class="farm-round-main"><strong>${f.today}</strong><span>com ronda hoje</span></div>
              <div class="farm-round-bar"><span style="width:${f.totalParks ? Math.round((f.today/f.totalParks)*100) : 0}%"></span></div>
            </div>

            <div class="stats-row">
              <div class="stat stat-ok"><strong>${f.today}</strong><span>Feitos hoje</span></div>
              <div class="stat"><strong>${f.withoutToday}</strong><span>Sem ronda hoje</span></div>
              <div class="stat ${f.overdue ? 'stat-alert' : ''}"><strong>${f.overdue}</strong><span>+${C.WARNING_DAYS || 3} dias</span></div>
            </div>
          </article>`).join("")}
      </section>

      <div id="dashboardParkSection">
        ${renderDashboardParkSections(todayParks, notTodayParks, overdueParks)}
      </div>

      ${incidents.length ? `
        <div class="section-title dashboard-section-title">
          <div>
            <h3>Ocorrências abertas</h3>
            <p>Problemas que ainda não foram dados como resolvidos</p>
          </div>
          <button id="allIncBtn" class="btn btn-soft">Ver todas</button>
        </div>
        <section class="list dashboard-incident-list">
          ${incidents.slice(0,6).map(incidentListItem).join("")}
        </section>
      ` : ""}
    `;

    document.getElementById("homeScanBtn")?.addEventListener("click", () => navigate("rounds"));
    document.getElementById("refreshBtn").addEventListener("click", refreshAll);
    document.getElementById("allIncBtn")?.addEventListener("click", () => navigate("incidents"));

    document.getElementById("showTodayBtn").addEventListener("click", () => {
      document.getElementById("dashboardParkSection").innerHTML = renderDashboardParkGroup("Parques com ronda hoje","Já foram verificados hoje",todayParks,"done");
      bindParkButtons();
    });

    document.getElementById("showPendingBtn").addEventListener("click", () => {
      document.getElementById("dashboardParkSection").innerHTML = renderDashboardParkGroup("Parques sem ronda hoje","Não significa necessariamente atraso; mostra apenas que ainda não foram visitados hoje",notTodayParks,"pending");
      bindParkButtons();
    });

    document.getElementById("showOverdueBtn").addEventListener("click", () => {
      document.getElementById("dashboardParkSection").innerHTML = renderDashboardParkGroup(`Parques há +${C.WARNING_DAYS || 3} dias sem ronda`,"Estes parques merecem maior atenção",overdueParks,"overdue");
      bindParkButtons();
    });

    document.getElementById("showAlertsBtn").addEventListener("click", () => navigate("incidents"));

    document.querySelectorAll(".dashboard-alert-click").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.target === "incidents") navigate("incidents");
        if (btn.dataset.target === "parks") {
          document.getElementById("dashboardParkSection").innerHTML = renderDashboardParkGroup(`Parques há +${C.WARNING_DAYS || 3} dias sem ronda`,"Estes parques merecem maior atenção",overdueParks,"overdue");
          bindParkButtons();
          document.getElementById("dashboardParkSection").scrollIntoView({behavior:"smooth", block:"start"});
        }
      });
    });

    bindParkButtons();
    bindIncidentButtons();
  }

  function renderTopAlerts(criticalIncidents, vetIncidents, operationalIncidents, overdueParks) {
    const blocks = [];

    if (criticalIncidents.length) {
      blocks.push(`
        <button class="dashboard-alert dashboard-alert-critical dashboard-alert-click" data-target="incidents">
          <div class="dashboard-alert-icon">!</div>
          <div class="dashboard-alert-content">
            <strong>${criticalIncidents.length} alerta${criticalIncidents.length===1?"":"s"} crítico${criticalIncidents.length===1?"":"s"}</strong>
            <span>${criticalIncidents.slice(0,2).map(i => `${visibleParkName(i)} · ${i.typeLabel}`).join("  •  ")}${criticalIncidents.length>2?"  •  +"+(criticalIncidents.length-2):""}</span>
          </div>
          <div class="dashboard-alert-arrow">›</div>
        </button>`);
    }

    if (vetIncidents.length) {
      blocks.push(`
        <button class="dashboard-alert dashboard-alert-vet dashboard-alert-click" data-target="incidents">
          <div class="dashboard-alert-icon">✚</div>
          <div class="dashboard-alert-content">
            <strong>${vetIncidents.length} ocorrência${vetIncidents.length===1?"":"s"} veterinária${vetIncidents.length===1?"":"s"}</strong>
            <span>${vetIncidents.slice(0,2).map(i => `${visibleParkName(i)} · ${i.typeLabel}`).join("  •  ")}${vetIncidents.length>2?"  •  +"+(vetIncidents.length-2):""}</span>
          </div>
          <div class="dashboard-alert-arrow">›</div>
        </button>`);
    }

    if (operationalIncidents.length) {
      blocks.push(`
        <button class="dashboard-alert dashboard-alert-warning dashboard-alert-click" data-target="incidents">
          <div class="dashboard-alert-icon">⚠</div>
          <div class="dashboard-alert-content">
            <strong>${operationalIncidents.length} problema${operationalIncidents.length===1?"":"s"} ${operationalIncidents.length===1?"operacional":"operacionais"}</strong>
            <span>${operationalIncidents.slice(0,2).map(i => `${visibleParkName(i)} · ${i.typeLabel}`).join("  •  ")}${operationalIncidents.length>2?"  •  +"+(operationalIncidents.length-2):""}</span>
          </div>
          <div class="dashboard-alert-arrow">›</div>
        </button>`);
    }

    if (overdueParks.length) {
      blocks.push(`
        <button class="dashboard-alert dashboard-alert-stale dashboard-alert-click" data-target="parks">
          <div class="dashboard-alert-icon">◷</div>
          <div class="dashboard-alert-content">
            <strong>${overdueParks.length} parque${overdueParks.length===1?"":"s"} há vários dias sem ronda</strong>
            <span>${overdueParks.slice(0,3).map(p => `${visibleParkName(p)} · ${p.daysSinceRound===null?"sem histórico":p.daysSinceRound+" dias"}`).join("  •  ")}</span>
          </div>
          <div class="dashboard-alert-arrow">›</div>
        </button>`);
    }

    if (!blocks.length) {
      blocks.push(`
        <div class="dashboard-alert dashboard-alert-clear">
          <div class="dashboard-alert-icon">✓</div>
          <div class="dashboard-alert-content">
            <strong>Sem alertas ativos</strong>
            <span>Não existem ocorrências críticas ou parques a exigir atenção neste momento.</span>
          </div>
        </div>`);
    }

    return `<section class="dashboard-alert-stack">${blocks.join("")}</section>`;
  }

  function renderDashboardParkSections(todayParks, notTodayParks, overdueParks) {
    return `
      ${renderDashboardParkGroup("Parques com ronda hoje",`${todayParks.length} parque${todayParks.length===1?"":"s"} já verificado${todayParks.length===1?"":"s"} hoje`,todayParks,"done")}
      ${renderDashboardParkGroup("Ainda sem ronda hoje","Informação de acompanhamento; não significa obrigatoriamente atraso",notTodayParks,"pending")}
      ${overdueParks.length ? renderDashboardParkGroup(`Atenção · +${C.WARNING_DAYS || 3} dias sem ronda`,"Os parques abaixo devem destacar-se no acompanhamento da exploração",overdueParks,"overdue") : ""}
    `;
  }

  function renderDashboardParkGroup(title, subtitle, parks, mode) {
    const icon = mode === "done" ? "✓" : mode === "overdue" ? "!" : "○";
    return `
      <section class="dashboard-park-group dashboard-park-group-${mode}">
        <div class="section-title dashboard-section-title">
          <div>
            <h3><span class="dashboard-section-icon">${icon}</span>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <span class="dashboard-count">${parks.length}</span>
        </div>
        <div class="dashboard-park-grid">
          ${parks.length ? parks.map(p => dashboardParkCard(p, mode)).join("") : `<div class="card empty dashboard-empty">${mode === "done" ? "Ainda nenhum parque recebeu ronda hoje." : "Não existem parques nesta situação."}</div>`}
        </div>
      </section>`;
  }

  function dashboardParkCard(p, mode) {
    let stateClass = "park-state-pending";
    let stateText = "Sem ronda hoje";
    let stateIcon = "○";

    if (p.daysSinceRound === 0) {
      stateClass = "park-state-done";
      stateText = "Ronda feita hoje";
      stateIcon = "✓";
    } else if (p.daysSinceRound < 0) {
      stateText = "Ronda com data futura";
    } else if (p.daysSinceRound === null) {
      stateClass = "park-state-overdue";
      stateText = "Nunca teve ronda";
      stateIcon = "!";
    } else if (p.daysSinceRound >= (C.CRITICAL_DAYS || 5)) {
      stateClass = "park-state-critical";
      stateText = `${p.daysSinceRound} dias sem ronda`;
      stateIcon = "!";
    } else if (p.daysSinceRound >= (C.WARNING_DAYS || 3)) {
      stateClass = "park-state-overdue";
      stateText = `${p.daysSinceRound} dias sem ronda`;
      stateIcon = "!";
    } else {
      stateText = p.daysSinceRound === 1 ? "Última ronda ontem" : `Última ronda há ${p.daysSinceRound} dias`;
    }

    return `
      <button class="dashboard-park-card park-open ${stateClass}" data-id="${escapeHtml(p.id)}">
        <div class="dashboard-park-card-top">
          <div>
            <strong>${escapeHtml(visibleParkName(p))}</strong>
            <span>${escapeHtml(p.farmName)}</span>
          </div>
          <div class="dashboard-park-status-icon">${stateIcon}</div>
        </div>
        <div class="dashboard-park-state">${stateText}</div>
        <div class="dashboard-park-last">${p.lastRoundUser ? `Última por ${escapeHtml(p.lastRoundUser)}` : "Sem histórico de rondas"}</div>
        ${p.daysSinceRound === 0 ? `<div class="dashboard-last-state"><span>💧 ${p.water ? escapeHtml(statusDisplay(p.water)) : "—"}</span><span>🌾 ${p.feed ? escapeHtml(statusDisplay(p.feed)) : "—"}</span></div>` : ""}
      </button>`;
  }

  function visibleParkName(obj) {
    if (!obj) return "Parque";
    const direct = String(obj.parkName || obj.name || "").trim();
    if (direct) return direct.replace(/\b(?:MR|TR)[- ]?\d+\b/gi, "").replace(/^[\s·:–—-]+|[\s·:–—-]+$/g, "") || "Parque";

    const code = String(obj.parkCode || obj.code || "").trim();
    const pool = [
      ...(state.parks || []),
      ...(state.adminParks || [])
    ];
    const found = pool.find(p => String(p.code || "").trim() === code);
    return String(found?.name || "Parque").replace(/\b(?:MR|TR)[- ]?\d+\b/gi, "").replace(/^[\s·:–—-]+|[\s·:–—-]+$/g, "") || "Parque";
  }

  function statusDisplay(value) {
    const map = {ok:"OK",sem_agua:"Sem água",problema_bebedouro:"Problema",sem_comida:"Sem comida",insuficiente:"Insuficiente",problema:"Problema"};
    return map[value] || value || "—";
  }

  function parkListItem(p) {
    return `<button class="list-item park-open" data-id="${escapeHtml(p.id)}" style="width:100%;text-align:left">
      <div class="list-main">
        <strong>${escapeHtml(visibleParkName(p))}</strong>
        <span>${escapeHtml(p.farmName)} · ${p.lastRoundUser ? "Última por "+escapeHtml(p.lastRoundUser) : "Ainda sem rondas"}</span>
      </div>
      ${daysBadge(p.daysSinceRound)}
    </button>`;
  }

  function incidentListItem(i) {
    const cls = i.category === "veterinaria" ? "badge-blue" : "badge-red";
    return `<button class="list-item incident-open" data-id="${escapeHtml(i.id)}" style="width:100%;text-align:left">
      <div class="list-main">
        <strong>${i.category === "veterinaria" ? "🩺" : "⚠️"} ${escapeHtml(i.typeLabel || i.type)}</strong>
        <span>${escapeHtml(i.farmName)} · ${escapeHtml(visibleParkName(i))} · ${escapeHtml(i.reportedByName || "")}</span>
      </div>
      <span class="badge ${cls}">${escapeHtml(i.statusLabel || i.status)}</span>
    </button>`;
  }

  async function refreshAll() {
    toast("A atualizar…");
    await loadInitialData();
    renderShell();
    toast("Dados atualizados.");
  }

  function renderParks(el) {
    const filtered = state.farmFilter === "Todos" ? state.parks : state.parks.filter(p => p.farmName === state.farmFilter);
    const ordered = [...filtered].sort((a,b) => (b.daysSinceRound ?? 9999) - (a.daysSinceRound ?? 9999));

    el.innerHTML = `
      <div class="page-head"><h2>Parques</h2><p>Última ronda e estado conhecido de cada parque.</p></div>
      <div class="filters" style="margin-bottom:12px">
        ${["Todos","Monte Ruivo","Trolho"].map(f => `<button class="filter-btn ${state.farmFilter===f?'active':''}" data-farm="${f}">${f}</button>`).join("")}
      </div>
      <section class="list">${ordered.map(parkListItem).join("") || `<div class="card empty">Sem parques.</div>`}</section>`;
    document.querySelectorAll("[data-farm]").forEach(b => b.addEventListener("click", () => {
      state.farmFilter = b.dataset.farm;
      renderParks(el);
    }));
    bindParkButtons();
  }

  function bindParkButtons() {
    document.querySelectorAll(".park-open").forEach(b => b.addEventListener("click", () => openPark(b.dataset.id)));
  }

  async function openPark(id) {
    try {
      const data = await api("getPark", {parkId:id});
      const p = data.park;
      const rounds = data.rounds || [];
      const incidents = data.incidents || [];
      showModal(`
        <div class="modal-head"><div><h2>${escapeHtml(visibleParkName(p))}</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(p.farmName)}</div></div><button class="icon-btn modal-close">×</button></div>
        <div class="kpis">
          <div class="card kpi"><div class="value">${p.daysSinceRound ?? "—"}</div><div class="label">Dias desde ronda</div></div>
          <div class="card kpi"><div class="value">${incidents.filter(x=>x.status!=="resolvida").length}</div><div class="label">Ocorrências abertas</div></div>
        </div>
        ${roleCanRound() ? `<button id="startRoundPark" class="btn btn-primary btn-block" style="margin-top:14px">Iniciar ronda neste parque</button>` : ""}
        <div class="section-title"><div><h3>Histórico de rondas</h3></div></div>
        <div class="list">
          ${rounds.length ? rounds.map(r => `<div class="list-item"><div class="list-main"><strong>${escapeHtml(r.completedAtLabel)}</strong><span>${escapeHtml(r.userName)} · Água: ${escapeHtml(r.waterLabel)} · Comida: ${escapeHtml(r.feedLabel)}</span>${photoMarkup(r.photoUrl)}</div></div>`).join("") : `<div class="empty">Ainda sem rondas.</div>`}
        </div>`);
      document.getElementById("startRoundPark")?.addEventListener("click", () => {
        closeModal(); renderRoundForm(p);
      });
    } catch (e) { toast(e.message); }
  }

  function renderRounds(el) {
    const rounds = state.rounds || [];
    const farms = [...new Set(
      (state.parks || [])
        .map(p => String(p.farmName || "").trim())
        .filter(Boolean)
    )].sort((a,b) => {
      const preferred = {"Monte Ruivo": 1, "Trolho": 2};
      return (preferred[a] || 99) - (preferred[b] || 99) || a.localeCompare(b, "pt", {numeric:true});
    });

    el.innerHTML = `
      <div class="page-head">
        <h2>Rondas</h2>
        <p>Registe uma nova ronda ou consulte as rondas já efetuadas.</p>
      </div>

      ${roleCanRound() ? `
        <section class="card card-pad new-round-card">
          <div class="new-round-head">
            <div>
              <h3>Registar nova ronda</h3>
              <p>Escolha a exploração e um ou vários parques, ou identifique um parque através do QR.</p>
            </div>
          </div>

          <div class="field">
            <label for="roundFarmSelect">Exploração</label>
            <select id="roundFarmSelect">
              <option value="">Escolher exploração…</option>
              ${farms.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")}
            </select>
          </div>

          <div class="round-start-row">
            <div class="field round-park-field">
              <span id="roundParksLabel">Parques</span>
              <div class="round-selection-actions">
                <button id="selectAllRoundParks" class="btn btn-outline" type="button" disabled>Selecionar todos</button>
                <button id="clearRoundParks" class="btn btn-outline" type="button" disabled>Limpar seleção</button>
              </div>
              <div id="roundParkSelect" class="round-park-checks" role="group" aria-labelledby="roundParksLabel">Escolha primeiro a exploração…</div>
              <p id="roundParkCount" role="status">0 parques selecionados</p>
            </div>

            <button id="roundQrBtn" class="btn btn-outline round-qr-btn" type="button">
              <span class="round-qr-icon">▣</span>
              <span>Ler QR</span>
            </button>
          </div>

          <button id="startSelectedRoundBtn" class="btn btn-primary btn-block" type="button" disabled>
            Iniciar ronda
          </button>
        </section>
      ` : `<div class="alert-box">O seu perfil pode consultar rondas, mas não pode registar novas rondas.</div>`}

      <div class="section-title rounds-history-title">
        <div>
          <h3>Rondas efetuadas</h3>
          <p>${rounds.length} registo${rounds.length===1?"":"s"} encontrado${rounds.length===1?"":"s"}</p>
        </div>
      </div>

      <div class="rounds-list">
        ${rounds.length ? rounds.map(roundHistoryCard).join("") : `<div class="card empty">Ainda não existem rondas registadas.</div>`}
      </div>
    `;

    if (roleCanRound()) {
      const farmSelect = document.getElementById("roundFarmSelect");
      const parkSelect = document.getElementById("roundParkSelect");
      const startBtn = document.getElementById("startSelectedRoundBtn");

      const allBtn = document.getElementById("selectAllRoundParks");
      const clearBtn = document.getElementById("clearRoundParks");
      const selectedParks = () => {
        const ids = new Set([...parkSelect.querySelectorAll("input:checked")].map(input => input.value));
        return state.parks.filter(p => p.farmName === farmSelect.value && ids.has(String(p.id)));
      };
      const updateSelection = () => {
        const count = selectedParks().length;
        document.getElementById("roundParkCount").textContent = `${count} parque${count === 1 ? " selecionado" : "s selecionados"}`;
        startBtn.disabled = !count;
        startBtn.textContent = count > 1 ? `Iniciar ronda em ${count} parques` : "Iniciar ronda";
      };
      farmSelect.addEventListener("change", () => {
        const farmParks = (state.parks || [])
          .filter(p => farmSelect.value && p.farmName === farmSelect.value)
          .slice()
          .sort((a,b) => visibleParkName(a).localeCompare(visibleParkName(b), "pt", {numeric:true}));
        parkSelect.innerHTML = farmParks.length ? farmParks.map(p => `
          <label class="round-park-option"><input type="checkbox" value="${escapeHtml(p.id)}"><span>${escapeHtml(visibleParkName(p))}</span></label>
        `).join("") : (farmSelect.value ? "Não existem parques nesta exploração." : "Escolha primeiro a exploração…");
        allBtn.disabled = clearBtn.disabled = !farmParks.length;
        updateSelection();
      });
      parkSelect.addEventListener("change", updateSelection);
      allBtn.addEventListener("click", () => {
        parkSelect.querySelectorAll("input").forEach(input => { input.checked = true; });
        updateSelection();
      });
      clearBtn.addEventListener("click", () => {
        parkSelect.querySelectorAll("input").forEach(input => { input.checked = false; });
        updateSelection();
      });
      startBtn.addEventListener("click", () => {
        const parks = selectedParks();
        if (parks.length) renderRoundForm(parks);
      });

      document.getElementById("roundQrBtn").addEventListener("click", openQrScannerModal);
    }
  }

  function roundHistoryCard(r) {
    const waterBad = r.water && r.water !== "ok";
    const feedBad = r.feed && r.feed !== "ok";
    return `
      <article class="card round-history-card">
        <div class="round-history-top">
          <div>
            <strong>${escapeHtml(visibleParkName(r))}</strong>
            <span>${escapeHtml(r.farmName)}</span>
          </div>
          <span class="badge badge-green">Concluída</span>
        </div>
        <div class="round-history-meta">
          <span>${escapeHtml(r.completedAtLabel)}</span>
          <span>${escapeHtml(r.userName)}</span>
        </div>
        <div class="round-history-status">
          <span class="${waterBad ? "round-status-bad":"round-status-ok"}">💧 ${escapeHtml(r.waterLabel || "—")}</span>
          <span class="${feedBad ? "round-status-bad":"round-status-ok"}">🌾 ${escapeHtml(r.feedLabel || "—")}</span>
          <span class="${r.infrastructure === "problema" ? "round-status-bad":"round-status-ok"}">🔧 ${r.infrastructure === "problema" ? "Problema":"OK"}</span>
        </div>
        ${r.notes ? `<div class="round-history-notes">${escapeHtml(r.notes)}</div>` : ""}
        ${photoMarkup(r.photoUrl || r.FotoURL)}
      </article>`;
  }

  function openQrScannerModal() {
    showModal(`
      <div class="modal-head">
        <div>
          <h2>Ler QR do parque</h2>
          <div style="color:var(--muted);font-size:.82rem">Aponte a câmara para o QR colocado no parque.</div>
        </div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <div class="qr-reader-wrap"><div id="qr-reader"></div></div>
      <div id="modalScanStatus" class="alert-box" style="margin-top:12px">A iniciar câmara…</div>
    `);
    setTimeout(startModalScanner, 120);
  }

  async function startModalScanner() {
    const status = document.getElementById("modalScanStatus");
    if (!status) return;
    if (!window.Html5Qrcode) { status.textContent = "O leitor QR não carregou."; return; }
    try {
      await stopScanner();
      state.scanner = new Html5Qrcode("qr-reader");
      await state.scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: {width:240,height:240} },
        async decoded => {
          await stopScanner();
          closeModal();
          await handleQrFromRounds(decoded);
        },
        () => {}
      );
      status.textContent = "Câmara ativa. Aponte para o QR do parque.";
    } catch { status.textContent = "Não foi possível abrir a câmara."; }
  }

  async function handleQrFromRounds(text) {
    try {
      let token = text.trim();
      try {
        const u = new URL(text);
        token = u.searchParams.get("park") || u.pathname.split("/").filter(Boolean).pop();
      } catch {}
      const data = await api("findParkByQr", {qrToken:token});
      renderRoundForm(data.park);
    } catch (e) {
      toast("QR inválido: " + e.message);
      renderRounds(document.getElementById("page"));
    }
  }

  function renderScanner(el) {
    if (!roleCanRound()) { el.innerHTML = `<div class="error-box">O seu perfil não tem permissão para registar rondas.</div>`; return; }
    el.innerHTML = `
      <div class="page-head"><h2>Ler QR do parque</h2><p>Aponte a câmara para o código existente no parque.</p></div>
      <div class="card card-pad">
        <div class="qr-reader-wrap"><div id="qr-reader"></div></div>
        <div id="scanStatus" class="alert-box" style="margin-top:12px">A iniciar câmara…</div>
      </div>
      <div class="section-title"><div><h3>Alternativa</h3><p>Se o QR estiver danificado, procure o parque.</p></div></div>
      <button id="manualParkBtn" class="btn btn-outline btn-block">Escolher parque manualmente</button>`;
    document.getElementById("manualParkBtn").addEventListener("click", openManualPark);
    setTimeout(startScanner, 150);
  }

  async function startScanner() {
    const status = document.getElementById("scanStatus");
    if (!window.Html5Qrcode) {
      status.textContent = "O leitor QR não carregou. Use a seleção manual.";
      return;
    }
    try {
      state.scanner = new Html5Qrcode("qr-reader");
      await state.scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: {width:240,height:240} },
        async decoded => {
          await stopScanner();
          await handleQr(decoded);
        },
        () => {}
      );
      status.textContent = "Câmara ativa. Aponte para o QR do parque.";
    } catch {
      status.textContent = "Não foi possível abrir a câmara. Use a seleção manual.";
    }
  }

  async function stopScanner() {
    try {
      if (state.scanner) {
        await state.scanner.stop();
        await state.scanner.clear();
      }
    } catch {}
    state.scanner = null;
  }

  async function handleQr(text) {
    try {
      let token = text.trim();
      try {
        const u = new URL(text);
        token = u.searchParams.get("park") || u.pathname.split("/").filter(Boolean).pop();
      } catch {}
      const data = await api("findParkByQr", {qrToken:token});
      state.page = "parks";
      renderShell();
      renderRoundForm(data.park);
    } catch (e) {
      toast("QR inválido: " + e.message);
      navigate("rounds");
    }
  }

  function openManualPark() {
    showModal(`
      <div class="modal-head"><h2>Escolher parque</h2><button class="icon-btn modal-close">×</button></div>
      <div class="list">
        ${state.parks.map(p => `<button class="list-item manual-park" data-id="${p.id}" style="width:100%;text-align:left"><div class="list-main"><strong>${escapeHtml(visibleParkName(p))}</strong><span>${escapeHtml(p.farmName)}</span></div></button>`).join("")}
      </div>`);
    document.querySelectorAll(".manual-park").forEach(b => b.addEventListener("click", () => {
      const p = state.parks.find(x=>x.id===b.dataset.id);
      closeModal(); renderRoundForm(p);
    }));
  }

  function renderRoundForm(selection) {
    const parks = Array.isArray(selection) ? selection : [selection];
    if (!parks.length) return;
    const park = parks[0];
    const el = document.getElementById("page");
    state.page = "parks";
    el.innerHTML = `
      <div class="page-head"><h2>Ronda · ${parks.length === 1 ? escapeHtml(visibleParkName(park)) : `${parks.length} parques`}</h2><p>${escapeHtml(park.farmName)}</p></div>
      ${parks.length > 1 ? `<section class="card card-pad"><strong>Parques selecionados</strong><p>${parks.map(p => escapeHtml(visibleParkName(p))).join(" · ")}</p><p>Preencha uma vez. Todos os dados, alertas e fotografia serão aplicados a cada parque selecionado.</p></section>` : ""}
      <form id="roundForm" class="form-grid">
        <section class="card card-pad">
          <h3 style="margin-top:0">Água</h3>
          <div class="choice-grid three">
            ${radioChoice("water","ok","✅","OK",true)}
            ${radioChoice("water","sem_agua","🚨","Sem água")}
            ${radioChoice("water","problema_bebedouro","⚠️","Problema")}
          </div>
        </section>
        <section class="card card-pad">
          <h3 style="margin-top:0">Alimentação</h3>
          <div class="choice-grid three">
            ${radioChoice("feed","ok","✅","OK",true)}
            ${radioChoice("feed","sem_comida","🚨","Sem comida")}
            ${radioChoice("feed","insuficiente","⚠️","Insuficiente")}
          </div>
        </section>
        <section class="card card-pad">
          <h3 style="margin-top:0">Animais</h3>
          <div class="choice-grid two">
            ${checkChoice("animalSick","🩺","Animal doente")}
            ${checkChoice("animalDead","☠️","Animal morto")}
          </div>
        </section>
        <section class="card card-pad">
          <h3 style="margin-top:0">Infraestruturas</h3>
          <div class="choice-grid two">
            ${radioChoice("infra","ok","✅","OK",true)}
            ${radioChoice("infra","problema","⚠️","Problema")}
          </div>
          <div id="infraExtra" class="field hidden" style="margin-top:12px">
            <label>Tipo de problema</label>
            <select id="infraType"><option value="">Selecionar…</option><option>Vedação</option><option>Portão</option><option>Bebedouro</option><option>Comedouro</option><option>Outro</option></select>
          </div>
        </section>
        <section class="card card-pad">
          <div class="field"><label>Observações</label><textarea id="roundNotes" placeholder="Opcional"></textarea></div>
          <div class="field" style="margin-top:12px"><label id="roundPhotoLabel">Fotografia</label><input id="roundPhoto" type="file" accept="image/*" capture="environment"></div>
          <img id="roundPhotoPreview" class="photo-preview hidden" alt="Pré-visualização">
        </section>
        <button class="btn btn-primary btn-block" type="submit">${parks.length > 1 ? `Guardar rondas em ${parks.length} parques` : "Guardar ronda"}</button>
        <section id="roundBatchStatus" class="card card-pad hidden" role="status" aria-live="polite"></section>
      </form>`;
    document.querySelectorAll('input[name="infra"]').forEach(r => r.addEventListener("change", () => {
      document.getElementById("infraExtra").classList.toggle("hidden", r.value !== "problema" || !r.checked);
    }));
    function requireEarTagPhoto() {
      const required=document.getElementById("animalSick").checked || document.getElementById("animalDead").checked;
      document.getElementById("roundPhoto").required=required;
      document.getElementById("roundPhotoLabel").textContent=required ? "Fotografia do brinco *" : "Fotografia";
    }
    ["animalSick","animalDead"].forEach(id=>document.getElementById(id).addEventListener("change",requireEarTagPhoto));
    document.getElementById("roundPhoto").addEventListener("change", previewPhoto);
    document.getElementById("roundForm").addEventListener("submit", e => submitRound(e, parks));
  }

  function radioChoice(name,value,icon,label,checked=false) {
    const id = `${name}_${value}`;
    return `<div class="choice"><input id="${id}" type="radio" name="${name}" value="${value}" ${checked?"checked":""}><label for="${id}"><span>${icon}</span>${label}</label></div>`;
  }
  function checkChoice(id,icon,label) {
    return `<div class="choice"><input id="${id}" type="checkbox"><label for="${id}"><span>${icon}</span>${label}</label></div>`;
  }

  function previewPhoto(e) {
    const file = e.target.files?.[0], img = document.getElementById("roundPhotoPreview");
    if (!file) { img.classList.add("hidden"); return; }
    img.src = URL.createObjectURL(file); img.classList.remove("hidden");
  }

  async function fileToBase64(file) {
    if (!file) return null;
    const max = 1600;
    const bitmap = await new Promise((resolve,reject)=>{
      const image=new Image(), url=URL.createObjectURL(file);
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Fotografia inválida"));};
      image.src=url;
    });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg", .78);
  }

  // One request at a time: failures do not prevent the remaining parks being saved.
  async function createRoundsSequentially(parks, payload, onProgress) {
    const created = [], failed = [];
    for (let index = 0; index < parks.length; index++) {
      const park = parks[index];
      onProgress(index, parks.length, park);
      try {
        const result = await api("createRound", {...payload, parkId:park.id});
        created.push({park, result});
      } catch (error) {
        failed.push({park, error:String(error.message || error)});
      }
      onProgress(index + 1, parks.length);
    }
    return {created, failed};
  }

  async function submitRound(e, parks) {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.dataset.saving === "true") return;
    const btn = form.querySelector('[type="submit"]');
    const status = document.getElementById("roundBatchStatus");
    let payload;
    // Freeze the common values before disabling fields; preserve this snapshot for retries.
    try {
      const fd = new FormData(form);
      payload = {
        requestId: Date.now().toString(36)+"-"+Math.random().toString(36).slice(2),
        water: fd.get("water"), feed: fd.get("feed"),
        animalSick: document.getElementById("animalSick").checked,
        animalDead: document.getElementById("animalDead").checked,
        infrastructure: fd.get("infra"),
        infrastructureType: document.getElementById("infraType").value || "",
        notes: document.getElementById("roundNotes").value.trim()
      };
      if((payload.animalSick||payload.animalDead) && !document.getElementById("roundPhoto").files[0])
        throw new Error("É obrigatória uma fotografia do brinco");
      setBusy(true);
      status.textContent = "A preparar fotografia…";
      payload.photoDataUrl = await fileToBase64(document.getElementById("roundPhoto").files?.[0]);
    } catch (error) {
      setBusy(false);
      status.textContent = `Não foi possível preparar a ronda: ${publicRoundError(error.message)}. Nenhum parque foi enviado.`;
      return;
    }
    let created = [], failed = [];
    function setBusy(busy) {
      form.dataset.saving = String(busy);
      form.querySelectorAll("input, select, textarea, button").forEach(control => { control.disabled = busy; });
      document.querySelectorAll("[data-page], #logoutBtn").forEach(control => { control.disabled = busy; });
      status.classList.remove("hidden");
      if (busy) window.addEventListener("beforeunload", preventLeaving);
      else window.removeEventListener("beforeunload", preventLeaving);
    }
    function preventLeaving(event) { event.preventDefault(); event.returnValue = ""; }
    async function save(pending) {
      setBusy(true);
      const batch = await createRoundsSequentially(pending, payload, (done, total, park) => {
        btn.textContent = `A guardar… ${done}/${total}`;
        status.textContent = park ? `A guardar ${done + 1} de ${total}: ${visibleParkName(park)}` : `${done} de ${total} processados`;
      });
      created.push(...batch.created);
      failed = batch.failed;
      setBusy(false);
      // Completed parks must never be submitted again from this form.
      form.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
      btn.disabled = true;
      btn.textContent = "Gravação terminada";
      status.innerHTML = `<h3>Resumo da gravação</h3>
        <p><strong>Criados: ${created.length}</strong> · <strong>Falhados: ${failed.length}</strong> · Total: ${parks.length}</p>
        ${created.length ? `<p>Criados: ${created.map(item => escapeHtml(visibleParkName(item.park))).join(" · ")}</p>` : ""}
        ${failed.length ? `<ul>${failed.map(item => `<li><strong>${escapeHtml(visibleParkName(item.park))}</strong>: ${escapeHtml(publicRoundError(item.error))}</li>`).join("")}</ul>
        <p>Se houve uma falha de ligação, confirme o histórico antes de repetir: o servidor pode ter guardado a ronda sem devolver confirmação.</p>
        <button id="retryFailedRounds" class="btn btn-outline" type="button">Repetir apenas os ${failed.length} falhados</button>` : ""}
        <button id="finishRounds" class="btn btn-primary" type="button">Ver rondas / atualizar</button>`;
      document.getElementById("retryFailedRounds")?.addEventListener("click", () => {
        if (form.dataset.saving !== "true") save(failed.map(item => item.park));
      });
      document.getElementById("finishRounds").addEventListener("click", async event => {
        event.currentTarget.disabled = true;
        try {
          await loadInitialData();
          state.page = "rounds";
          renderShell();
        } catch (error) {
          event.currentTarget.disabled = false;
          toast(`Rondas processadas. Não foi possível atualizar: ${publicRoundError(error.message)}`);
        }
      });
    }
    await save(parks);
  }

  function publicRoundError(message) {
    return String(message || "Erro ao guardar a ronda.").replace(/\b(?:MR|TR)[- ]?\d+\b/gi, "parque");
  }

  function canResolveIncident(i) {
    const role=state.profile?.role;
    return i.status!=="resolvida" && (i.category==="operacional" ? ["admin","chefia"].includes(role) : i.category==="veterinaria" && ["admin","veterinario"].includes(role));
  }

  function renderIncidents(el, selected=new Set()) {
    let list = state.incidents || [];
    if (!roleCanSeeVet()) list = list.filter(i => i.category !== "veterinaria");
    if (!roleCanSeeOperations() && state.profile.role !== "admin") list = list.filter(i => i.reportedById === state.profile.id);
    const eligible=list.filter(canResolveIncident), allowed=new Set(eligible.map(i=>i.id));
    [...selected].forEach(id=>{if(!allowed.has(id)) selected.delete(id);});
    el.innerHTML = `
      <div class="page-head"><h2>Ocorrências</h2><p>Alertas operacionais e veterinários.</p></div>
      ${eligible.length ? `<section class="card card-pad incident-bulk-bar" aria-label="Resolver várias ocorrências">
        <label class="incident-select-all"><input id="incidentSelectAll" type="checkbox"> Selecionar todas</label>
        <span id="incidentSelectionCount" role="status" aria-live="polite"></span>
        <button id="resolveSelectedIncidents" class="btn btn-primary" type="button" disabled>Resolver selecionadas</button>
      </section>` : ""}
      <section class="list">${list.map(i=>`<div class="incident-select-row ${allowed.has(i.id)?'is-selectable':''}">
        ${allowed.has(i.id) ? `<label class="incident-select-box"><input type="checkbox" class="incident-select" value="${escapeHtml(i.id)}" aria-label="Selecionar ${escapeHtml(i.typeLabel||i.type)} · ${escapeHtml(i.farmName)} · ${escapeHtml(visibleParkName(i))}" ${selected.has(i.id)?'checked':''}></label>` : ""}
        ${incidentListItem(i)}</div>`).join("") || `<div class="card empty">Sem ocorrências abertas.</div>`}</section>`;
    bindIncidentButtons();
    const boxes=[...el.querySelectorAll(".incident-select")], all=el.querySelector("#incidentSelectAll"), button=el.querySelector("#resolveSelectedIncidents");
    if(!all) return;
    function updateSelection() {
      all.checked=selected.size===eligible.length;
      all.indeterminate=selected.size>0 && selected.size<eligible.length;
      el.querySelector("#incidentSelectionCount").textContent=`${selected.size} selecionada${selected.size===1?'':'s'}`;
      button.disabled=!selected.size;
      button.textContent=selected.size ? `Resolver ${selected.size} selecionada${selected.size===1?'':'s'}` : "Resolver selecionadas";
      boxes.forEach(box=>box.closest(".incident-select-row").classList.toggle("is-selected",box.checked));
    }
    boxes.forEach(box=>box.addEventListener("change",()=>{
      if(box.checked) selected.add(box.value); else selected.delete(box.value);
      updateSelection();
    }));
    all.addEventListener("change",()=>{
      boxes.forEach(box=>{box.checked=all.checked;if(all.checked) selected.add(box.value);else selected.delete(box.value);});
      updateSelection();
    });
    button.addEventListener("click",()=>confirmResolveIncidents(list.filter(i=>selected.has(i.id)),el,selected));
    updateSelection();
  }

  async function resolveIncidentBatches(ids,note,onProgress) {
    const result={resolved:[],alreadyResolved:[],failed:[],warnings:[]};
    for(let offset=0;offset<ids.length;offset+=25) {
      const chunk=ids.slice(offset,offset+25);
      try {
        const batch=await api("resolveIncidentsBulk",{incidentIds:chunk,note});
        result.resolved.push(...batch.resolved);
        result.alreadyResolved.push(...batch.alreadyResolved);
        result.failed.push(...batch.failed);
        result.warnings.push(...(batch.warnings||[]));
      } catch(error) {
        chunk.forEach(id=>result.failed.push({id,message:`Não confirmado: ${error.message}. Atualize a lista ou repita; as já resolvidas não serão alteradas.`}));
      }
      onProgress(Math.min(offset+chunk.length,ids.length),ids.length);
    }
    return result;
  }

  function confirmResolveIncidents(incidents,el,selected) {
    if(!incidents.length) return;
    const label=i=>`${i.typeLabel||i.type} · ${i.farmName} · ${visibleParkName(i)}`;
    showModal(`
      <div class="modal-head"><h2>Resolver ${incidents.length} ocorrência${incidents.length===1?'':'s'}</h2><button type="button" class="icon-btn modal-close" aria-label="Fechar">×</button></div>
      <p>As ocorrências selecionadas vão ficar como <strong>Resolvidas</strong>, com a data e o seu nome.</p>
      <ul class="incident-bulk-preview">${incidents.map(i=>`<li>${escapeHtml(label(i))}</li>`).join("")}</ul>
      ${incidents.some(i=>i.category==="veterinaria") ? '<p>Nos casos veterinários, em caso de morte, o resumo da necrópsia tem de estar preenchido. Os dados clínicos serão mantidos.</p>' : ''}
      <form id="bulkResolveForm" class="form-grid">
        <div class="field"><label for="bulkResolveNote">Nota de resolução para todas (opcional)</label><textarea id="bulkResolveNote" maxlength="2000" placeholder="Ex.: Bebedouros verificados e reparados."></textarea></div>
        <p id="bulkResolveProgress" role="status" aria-live="polite"></p>
        <div id="bulkResolveResult" role="status"></div>
        <div class="incident-bulk-actions"><button type="button" class="btn btn-outline modal-close">Cancelar</button><button id="bulkResolveSubmit" type="submit" class="btn btn-primary">Resolver ${incidents.length} ocorrência${incidents.length===1?'':'s'}</button></div>
      </form>`);
    const root=document.getElementById("modalRoot"), form=root.querySelector("#bulkResolveForm");
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      if(form.dataset.submitted) return;
      form.dataset.submitted="true";root.dataset.busy="true";
      const note=root.querySelector("#bulkResolveNote").value.trim();
      root.querySelectorAll("button,textarea").forEach(control=>control.disabled=true);
      const progress=root.querySelector("#bulkResolveProgress");
      progress.textContent=`A resolver 0 de ${incidents.length}…`;
      const result=await resolveIncidentBatches(incidents.map(i=>i.id),note,(done,total)=>{progress.textContent=`A processar ${done} de ${total}…`;});
      const completed=new Set([...result.resolved,...result.alreadyResolved]);
      completed.forEach(id=>selected.delete(id));
      state.incidents=state.incidents.filter(i=>!completed.has(i.id));
      let refreshError="";
      try { await loadInitialData(); } catch(error) { refreshError=`Não foi possível atualizar os restantes dados: ${error.message}`; }
      renderIncidents(el,selected);
      const byId=new Map(incidents.map(i=>[i.id,i]));
      progress.textContent="Processamento terminado.";
      root.querySelector("#bulkResolveResult").innerHTML=`<p><strong>Resolvidas: ${result.resolved.length}</strong> · Já resolvidas: ${result.alreadyResolved.length} · Não resolvidas ou por confirmar: ${result.failed.length}</p>
        ${result.failed.length ? `<ul>${result.failed.map(f=>`<li><strong>${escapeHtml(byId.has(f.id)?label(byId.get(f.id)):f.id)}</strong>: ${escapeHtml(f.message)}</li>`).join("")}</ul><p>As ocorrências pendentes continuam selecionadas na lista para poder repetir apenas essas.</p>` : ''}
        ${result.warnings.length?`<ul>${result.warnings.map(w=>`<li>${escapeHtml(byId.has(w.id)?label(byId.get(w.id)):w.id)}: ${escapeHtml(w.message)}</li>`).join("")}</ul>`:''}
        ${refreshError?`<p>${escapeHtml(refreshError)}</p>`:''}`;
      delete root.dataset.busy;
      root.querySelectorAll(".modal-close").forEach(control=>{control.disabled=false;if(control.classList.contains("btn"))control.textContent="Fechar";});
      root.querySelector("#bulkResolveSubmit").classList.add("hidden");
    });
  }

  function bindIncidentButtons() {
    document.querySelectorAll(".incident-open").forEach(b => b.addEventListener("click", () => openIncident(b.dataset.id)));
  }

  async function openIncident(id) {
    try {
      const data = await api("getIncident", {incidentId:id});
      const i = data.incident;
      const canVetEdit = i.category === "veterinaria" && roleCanSeeVet();
      const canOpEdit = i.category === "operacional" && ["admin","chefia"].includes(state.profile.role);

      showModal(`
        <div class="modal-head"><div><h2>${escapeHtml(i.typeLabel)}</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(i.farmName)} · ${escapeHtml(visibleParkName(i))}</div></div><button class="icon-btn modal-close">×</button></div>
        <div class="card card-pad">
          <div class="list-main"><strong>Reportado por ${escapeHtml(i.reportedByName)}</strong><span>${escapeHtml(i.reportedAtLabel)}</span></div>
          ${i.description ? `<p>${escapeHtml(i.description)}</p>`:""}
          ${photoMarkup(i.photoUrl)}
        </div>
        ${canVetEdit ? vetForm(i, data.veterinary, data.necropsy) : ""}
        ${canOpEdit ? operationalForm(i) : ""}
      `);
      if (canVetEdit) {
        document.getElementById("vetForm").addEventListener("submit", e => saveVeterinary(e, i));
      }
      if (canOpEdit) {
        document.getElementById("opForm").addEventListener("submit", e => saveOperational(e, i));
      }
    } catch(e) { toast(e.message); }
  }

  function vetForm(i, v={}, n={}) {
    const dead = i.type === "animal_morto";
    return `
      <form id="vetForm" class="form-grid" style="margin-top:16px">
        <section class="card card-pad">
          <h3 style="margin-top:0">Intervenção veterinária</h3>
          ${!dead ? `
          <div class="field" style="margin-top:10px"><label>Observação clínica</label><textarea id="clinical">${escapeHtml(v?.clinicalObservation || "")}</textarea></div>
          <div class="field" style="margin-top:10px"><label>Diagnóstico / suspeita</label><textarea id="diagnosis">${escapeHtml(v?.diagnosis || "")}</textarea></div>
          <div class="field" style="margin-top:10px"><label>Tratamento</label><textarea id="treatment">${escapeHtml(v?.treatment || "")}</textarea></div>
          <div class="form-grid two" style="margin-top:10px"><div class="field"><label>Medicamento</label><input id="medication" value="${escapeHtml(v?.medication || "")}"></div><div class="field"><label>Dose</label><input id="dosage" value="${escapeHtml(v?.dosage || "")}"></div></div>
          ` : `
          <div class="field" style="margin-top:10px"><label>Resumo da necrópsia *</label><textarea id="necSummary" required>${escapeHtml(n?.summary || "")}</textarea></div>
          <div class="field" style="margin-top:10px"><label>Causa provável</label><input id="probableCause" value="${escapeHtml(n?.probableCause || "")}"></div>
          <div class="field" style="margin-top:10px"><label>Conclusão</label><textarea id="conclusion">${escapeHtml(n?.conclusion || "")}</textarea></div>
          `}
          <div class="field" style="margin-top:10px"><label>Estado</label>
            <select id="vetStatus">
              ${["por_observar","em_tratamento","em_acompanhamento","resolvida"].map(s => `<option value="${s}" ${i.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}
            </select>
          </div>
        </section>
        <button class="btn btn-primary btn-block" type="submit">Guardar intervenção</button>
      </form>`;
  }

  function operationalForm(i) {
    return `
      <form id="opForm" class="form-grid" style="margin-top:16px">
        <section class="card card-pad">
          <div class="field"><label>Estado</label>
            <select id="opStatus">
              ${["aberta","em_resolucao","resolvida"].map(s => `<option value="${s}" ${i.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="margin-top:10px"><label>Nota da Chefia</label><textarea id="opNote"></textarea></div>
        </section>
        <button class="btn btn-primary btn-block" type="submit">Atualizar ocorrência</button>
      </form>`;
  }

  function statusLabel(s) {
    return ({aberta:"Aberta",em_resolucao:"Em resolução",por_observar:"Por observar",em_tratamento:"Em tratamento",em_acompanhamento:"Em acompanhamento",resolvida:"Resolvida"})[s] || s;
  }

  async function saveVeterinary(e, incident) {
    e.preventDefault();
    const dead = incident.type === "animal_morto";
    const payload = {
      incidentId: incident.id,
      status: document.getElementById("vetStatus").value,
      clinicalObservation: document.getElementById("clinical")?.value.trim() || "",
      diagnosis: document.getElementById("diagnosis")?.value.trim() || "",
      treatment: document.getElementById("treatment")?.value.trim() || "",
      medication: document.getElementById("medication")?.value.trim() || "",
      dosage: document.getElementById("dosage")?.value.trim() || "",
      necropsySummary: document.getElementById("necSummary")?.value.trim() || "",
      probableCause: document.getElementById("probableCause")?.value.trim() || "",
      conclusion: document.getElementById("conclusion")?.value.trim() || ""
    };
    try {
      await api("updateVeterinaryCase", payload);
      toast("Intervenção veterinária guardada.");
      closeModal(); await refreshAll();
    } catch(e2) { toast(e2.message); }
  }

  async function saveOperational(e, incident) {
    e.preventDefault();
    try {
      await api("updateOperationalIncident", {
        incidentId: incident.id,
        status: document.getElementById("opStatus").value,
        note: document.getElementById("opNote").value.trim()
      });
      toast("Ocorrência atualizada.");
      closeModal(); await refreshAll();
    } catch(e2) { toast(e2.message); }
  }

  async function renderAdmin(el) {
    if (state.profile.role !== "admin") { el.innerHTML = `<div class="error-box">Acesso reservado ao Administrador.</div>`; return; }
    el.innerHTML = `
      <div class="page-head"><h2>Administração</h2><p>Utilizadores, parques e QR Codes.</p></div>
      <div class="admin-tabs">
        <button class="filter-btn active" data-admin-tab="users">Utilizadores</button>
        <button class="filter-btn" data-admin-tab="parks">Parques</button>
        <button class="filter-btn" data-admin-tab="qr">QR Codes</button>
        <button class="filter-btn" data-admin-tab="records">Registos</button>
        <button class="filter-btn" data-admin-tab="notifications">Configurações / Notificações</button>
      </div>
      <div id="adminBody" style="margin-top:14px"><div class="card empty">A carregar…</div></div>`;
    document.querySelectorAll("[data-admin-tab]").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-tab]").forEach(x=>x.classList.toggle("active",x===b));
      loadAdminTab(b.dataset.adminTab);
    }));
    loadAdminTab("users");
  }

  async function loadAdminTab(tab) {
    const body = document.getElementById("adminBody");
    try {
      if (tab === "notifications") {
        const settings=await api("getNotificationSettings");
        body.innerHTML=`<form id="notificationForm" class="card card-pad form-grid">
          <h3>Notificações por email</h3><p>Separe os emails por vírgula ou ponto e vírgula. Uma lista vazia suspende o respetivo envio; as novas ocorrências ficam pendentes.</p>
          <div class="field"><label>Destinatários operacionais</label><textarea id="mailOperational">${escapeHtml(settings.operational)}</textarea></div>
          <div class="field"><label>Destinatários veterinários (animal doente / morto)</label><textarea id="mailVeterinary">${escapeHtml(settings.veterinary)}</textarea></div>
          <p>As notificações começam após a primeira configuração. Os registos anteriores não são enviados.</p>
          ${settings.uncertain.length ? `<p role="alert">Envios por confirmar (ver folha Notificacoes): ${settings.uncertain.map(escapeHtml).join(", ")}. Confirme o envio antes de qualquer repetição.</p>` : ""}
          <button class="btn btn-primary" type="submit">Guardar notificações</button></form>`;
        document.getElementById("notificationForm").addEventListener("submit",async event=>{
          event.preventDefault();const button=event.currentTarget.querySelector("button");button.disabled=true;
          try {await api("saveNotificationSettings",{operational:document.getElementById("mailOperational").value,veterinary:document.getElementById("mailVeterinary").value});toast("Notificações guardadas.");}
          catch(error){toast(error.message);} finally {button.disabled=false;}
        });
      } else if (tab === "users") {
        const users = await api("listUsers");
        state.users = users;
        body.innerHTML = `
          <button id="addUserBtn" class="btn btn-primary" style="margin-bottom:12px">+ Novo utilizador</button>
          <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Utilizador</th><th>Perfil</th><th>Estado</th><th></th></tr></thead><tbody>
          ${users.map(u=>`<tr>
            <td>${escapeHtml(u.fullName)}</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(ROLE_LABELS[u.role]||u.role)}</td>
            <td>${u.active?'<span class="badge badge-green">Ativo</span>':'<span class="badge badge-grey">Inativo</span>'}</td>
            <td><button class="btn btn-soft edit-user-btn" data-id="${u.id}">Editar</button></td>
          </tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("addUserBtn").addEventListener("click", newUserModal);
        document.querySelectorAll(".edit-user-btn").forEach(btn => btn.addEventListener("click", () => {
          const user = state.users.find(u => u.id === btn.dataset.id);
          if (user) editUserModal(user);
        }));
      } else if (tab === "parks") {
        const adminParks = await api("listAdminParks");
        state.adminParks = adminParks;
        body.innerHTML = `
          <div class="admin-action-row" style="margin-bottom:12px">
          <button id="addParkBtn" class="btn btn-primary">+ Novo parque</button>
          <button id="bulkParkBtn" class="btn btn-outline">⇩ Importar parques em massa</button>
        </div>
          <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Exploração</th><th>Estado</th><th>QR</th><th></th></tr></thead><tbody>
          ${adminParks.map(p=>`<tr>
            <td>${escapeHtml(p.name||"Parque")}</td>
            <td>${escapeHtml(p.farmName)}</td>
            <td>${p.active?'<span class="badge badge-green">Disponível</span>':'<span class="badge badge-grey">Indisponível</span>'}</td>
            <td><button class="btn btn-soft show-qr" data-id="${p.id}" ${p.active?"":"disabled"}>Ver QR</button></td>
            <td><button class="btn btn-soft edit-park-btn" data-id="${p.id}">Editar</button></td>
          </tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("addParkBtn").addEventListener("click", newParkModal);
        document.getElementById("bulkParkBtn").addEventListener("click", bulkParkImportModal);
        document.querySelectorAll(".show-qr").forEach(b=>b.addEventListener("click",()=>showParkQr(b.dataset.id, adminParks)));
        document.querySelectorAll(".edit-park-btn").forEach(b=>b.addEventListener("click",()=>{
          const park=adminParks.find(p=>p.id===b.dataset.id);
          if(park) editParkModal(park);
        }));
      } else if (tab === "records") {
        try {
          state.adminParks = await api("listAdminParks");
        } catch {}
        const data = await api("listAdminRecords");
        state.adminRounds = data.rounds || [];
        state.adminIncidents = data.incidents || [];

        body.innerHTML = `
          <div class="card card-pad" style="margin-bottom:14px">
            <h3 style="margin:0 0 5px">Correção de registos</h3>
            <p style="margin:0;color:var(--muted);font-size:.84rem">Aqui o Admin pode corrigir ou eliminar rondas e ocorrências criadas por engano. Todas as alterações ficam registadas no AuditLog.</p>
          </div>
          <div class="filters" style="margin-bottom:12px">
            <button class="filter-btn active" data-record-type="rounds">Rondas (${state.adminRounds.length})</button>
            <button class="filter-btn" data-record-type="incidents">Ocorrências (${state.adminIncidents.length})</button>
          </div>
          <div id="recordsBody"></div>`;

        const renderRecords = (type) => {
          const box = document.getElementById("recordsBody");

          if (type === "rounds") {
            box.innerHTML = state.adminRounds.length ? `
              <div class="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Parque</th>
                    <th>Utilizador</th>
                    <th>Água</th>
                    <th>Comida</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.adminRounds.map(r=>`<tr>
                    <td>${escapeHtml(r.completedAtLabel)}</td>
                    <td>${escapeHtml(visibleParkName(r))} · ${escapeHtml(r.farmName)}</td>
                    <td>${escapeHtml(r.userName)}</td>
                    <td>${escapeHtml(r.waterLabel)}</td>
                    <td>${escapeHtml(r.feedLabel)}</td>
                    <td>
                      <div style="display:flex;gap:7px;flex-wrap:wrap">
                        <button class="btn btn-soft edit-round-btn" data-id="${r.id}">Editar</button>
                        <button class="btn btn-danger delete-round-direct-btn" data-id="${r.id}">Eliminar</button>
                      </div>
                    </td>
                  </tr>`).join("")}
                </tbody>
              </table></div>` : `<div class="card empty">Ainda não existem rondas registadas.</div>`;

            document.querySelectorAll(".edit-round-btn").forEach(b=>b.addEventListener("click",()=>{
              const rec=state.adminRounds.find(r=>r.id===b.dataset.id);
              if(rec) editRoundModal(rec);
            }));

            document.querySelectorAll(".delete-round-direct-btn").forEach(b=>b.addEventListener("click",async ()=>{
              const rec=state.adminRounds.find(r=>r.id===b.dataset.id);
              if(!rec) return;
              if(!window.confirm(`Eliminar a ronda de ${visibleParkName(rec)} em ${rec.completedAtLabel}? As ocorrências criadas por esta ronda também serão eliminadas.`)) return;
              try {
                await api("deleteRoundAdmin",{roundId:rec.id});
                toast("Ronda eliminada.");
                loadAdminTab("records");
                await loadInitialData();
              } catch(err){ toast(err.message); }
            }));

          } else {
            box.innerHTML = state.adminIncidents.length ? `
              <div class="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Parque</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Reportado por</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.adminIncidents.map(i=>`<tr>
                    <td>${escapeHtml(i.reportedAtLabel)}</td>
                    <td>${escapeHtml(visibleParkName(i))} · ${escapeHtml(i.farmName)}</td>
                    <td>${escapeHtml(i.typeLabel)}</td>
                    <td>${escapeHtml(i.statusLabel)}</td>
                    <td>${escapeHtml(i.reportedByName)}</td>
                    <td>
                      <div style="display:flex;gap:7px;flex-wrap:wrap">
                        <button class="btn btn-soft edit-incident-admin-btn" data-id="${i.id}">Editar</button>
                        <button class="btn btn-danger delete-incident-direct-btn" data-id="${i.id}">Eliminar</button>
                      </div>
                    </td>
                  </tr>`).join("")}
                </tbody>
              </table></div>` : `<div class="card empty">Ainda não existem ocorrências registadas.</div>`;

            document.querySelectorAll(".edit-incident-admin-btn").forEach(b=>b.addEventListener("click",()=>{
              const rec=state.adminIncidents.find(i=>i.id===b.dataset.id);
              if(rec) editIncidentAdminModal(rec);
            }));

            document.querySelectorAll(".delete-incident-direct-btn").forEach(b=>b.addEventListener("click",async ()=>{
              const rec=state.adminIncidents.find(i=>i.id===b.dataset.id);
              if(!rec) return;
              if(!window.confirm(`Eliminar a ocorrência "${rec.typeLabel}" do parque ${visibleParkName(rec)}?`)) return;
              try {
                await api("deleteIncidentAdmin",{incidentId:rec.id});
                toast("Ocorrência eliminada.");
                loadAdminTab("records");
                await loadInitialData();
              } catch(err){ toast(err.message); }
            }));
          }
        };

        document.querySelectorAll("[data-record-type]").forEach(btn=>btn.addEventListener("click",()=>{
          document.querySelectorAll("[data-record-type]").forEach(x=>x.classList.toggle("active",x===btn));
          renderRecords(btn.dataset.recordType);
        }));

        renderRecords("rounds");
      } else {
        body.innerHTML = `<div class="card card-pad"><h3 style="margin-top:0">QR Codes dos parques</h3><p style="color:var(--muted)">Cada parque tem um QR permanente, mesmo que o nome do parque seja alterado.</p><div class="list">${state.parks.filter(p=>p.active!==false).map(p=>`<button class="list-item show-qr" data-id="${p.id}" style="width:100%;text-align:left"><div class="list-main"><strong>${escapeHtml(visibleParkName(p))}</strong><span>${escapeHtml(p.farmName)}</span></div><span>▣</span></button>`).join("")}</div></div>`;
        document.querySelectorAll(".show-qr").forEach(b=>b.addEventListener("click",()=>showParkQr(b.dataset.id, state.parks)));
      }
    } catch(e) { body.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
  }

  function newUserModal() {
    showModal(`
      <div class="modal-head"><h2>Novo utilizador</h2><button class="icon-btn modal-close">×</button></div>
      <form id="newUserForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="newFullName" required></div>
        <div class="field"><label>Username</label><input id="newUsername" required></div>
        <div class="field"><label>PIN</label><input id="newPin" type="password" inputmode="numeric" pattern="[0-9]*" required placeholder="4 a 8 dígitos"></div>
        <div class="field"><label>Confirmar PIN</label><input id="newPinConfirm" type="password" inputmode="numeric" pattern="[0-9]*" required></div>
        <div class="field"><label>Perfil</label><select id="newRole"><option value="utilizador">Utilizador</option><option value="veterinario">Veterinário</option><option value="chefia">Chefia</option><option value="admin">Admin</option></select></div>
        <button class="btn btn-primary" type="submit">Criar utilizador</button>
      </form>`);
    document.getElementById("newUserForm").addEventListener("submit", async e=>{
      e.preventDefault();
      const pin = document.getElementById("newPin").value.trim();
      const confirm = document.getElementById("newPinConfirm").value.trim();
      if (!/^\d{4,8}$/.test(pin)) { toast("O PIN deve ter entre 4 e 8 dígitos."); return; }
      if (pin !== confirm) { toast("Os dois PIN não coincidem."); return; }
      try {
        await api("createUser",{fullName:newFullName.value.trim(),username:newUsername.value.trim(),pin,role:newRole.value});
        toast("Utilizador criado."); closeModal(); loadAdminTab("users");
      } catch(err){toast(err.message)}
    });
  }

  function editUserModal(user) {
    showModal(`
      <div class="modal-head">
        <div><h2>Editar utilizador</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(user.username)}</div></div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <form id="editUserForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="editFullName" required value="${escapeHtml(user.fullName)}"></div>
        <div class="field"><label>Utilizador</label><input id="editUsername" required value="${escapeHtml(user.username)}"></div>
        <div class="field"><label>Perfil</label>
          <select id="editRole">
            <option value="utilizador" ${user.role==="utilizador"?"selected":""}>Utilizador</option>
            <option value="veterinario" ${user.role==="veterinario"?"selected":""}>Veterinário</option>
            <option value="chefia" ${user.role==="chefia"?"selected":""}>Chefia</option>
            <option value="admin" ${user.role==="admin"?"selected":""}>Admin</option>
          </select>
        </div>
        <div class="field"><label>Estado</label>
          <select id="editActive">
            <option value="true" ${user.active?"selected":""}>Ativo</option>
            <option value="false" ${!user.active?"selected":""}>Inativo</option>
          </select>
        </div>
        <section class="card card-pad">
          <h3 style="margin-top:0;margin-bottom:5px">Alterar / Resetar PIN</h3>
          <p style="margin-top:0;color:var(--muted);font-size:.82rem">Deixe vazio para manter o PIN atual.</p>
          <div class="form-grid two">
            <div class="field"><label>Novo PIN</label><input id="editPin" type="password" inputmode="numeric" pattern="[0-9]*" placeholder="4 a 8 dígitos"></div>
            <div class="field"><label>Confirmar novo PIN</label><input id="editPinConfirm" type="password" inputmode="numeric" pattern="[0-9]*"></div>
          </div>
        </section>
        <button class="btn btn-primary btn-block" type="submit">Guardar alterações</button>
      </form>
    `);

    document.getElementById("editUserForm").addEventListener("submit", async e => {
      e.preventDefault();
      const pin = document.getElementById("editPin").value.trim();
      const pinConfirm = document.getElementById("editPinConfirm").value.trim();
      if (pin && !/^\d{4,8}$/.test(pin)) { toast("O PIN deve ter entre 4 e 8 dígitos."); return; }
      if (pin !== pinConfirm) { toast("Os dois PIN não coincidem."); return; }

      try {
        await api("updateUser",{
          userId:user.id,
          fullName:document.getElementById("editFullName").value.trim(),
          username:document.getElementById("editUsername").value.trim(),
          role:document.getElementById("editRole").value,
          active:document.getElementById("editActive").value==="true",
          pin
        });
        toast(pin ? "Utilizador e PIN atualizados." : "Utilizador atualizado.");
        closeModal();
        loadAdminTab("users");
      } catch(err){toast(err.message)}
    });
  }

  function bulkParkImportModal() {
    showModal(`
      <div class="modal-head">
        <div>
          <h2>Importar parques em massa</h2>
          <div style="color:var(--muted);font-size:.82rem">Crie vários parques de uma só vez.</div>
        </div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>

      <div class="form-grid">
        <section class="card card-pad">
          <h3 style="margin-top:0">Opção 1 · Colar lista</h3>
          <p style="margin-top:0;color:var(--muted);font-size:.82rem">
            Uma linha por parque no formato: <strong>Exploração | Nome</strong>
          </p>
          <div class="field">
            <label>Lista de parques</label>
            <textarea id="bulkParkText" rows="10" placeholder="Monte Ruivo | Novilhas Norte&#10;Monte Ruivo | Engorda 1&#10;Trolho | Vacas 3"></textarea>
          </div>
          <button id="bulkPasteImportBtn" class="btn btn-primary btn-block" type="button">Importar lista</button>
        </section>

        <section class="card card-pad">
          <h3 style="margin-top:0">Opção 2 · CSV</h3>
          <p style="margin-top:0;color:var(--muted);font-size:.82rem">
            Ficheiro com as colunas <strong>Exploracao</strong> e <strong>Nome</strong>.
          </p>
          <div class="field">
            <label>Ficheiro CSV</label>
            <input id="bulkCsvFile" type="file" accept=".csv,text/csv">
          </div>
          <button id="bulkCsvImportBtn" class="btn btn-outline btn-block" type="button">Importar CSV</button>
        </section>

        <div class="success-box">
          Os códigos são criados automaticamente. Ex.: MR-001, MR-002… e TR-001, TR-002…
        </div>

        <div id="bulkImportResult" class="hidden"></div>
      </div>
    `);

    document.getElementById("bulkPasteImportBtn").addEventListener("click", async () => {
      const raw = document.getElementById("bulkParkText").value.trim();
      if (!raw) { toast("Cole primeiro a lista de parques."); return; }

      const items = raw.split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split("|").map(x => x.trim());
          return { farmName: parts[0] || "", name: parts.slice(1).join(" | ").trim() };
        });

      await runBulkParkImport(items);
    });

    document.getElementById("bulkCsvImportBtn").addEventListener("click", async () => {
      const file = document.getElementById("bulkCsvFile").files?.[0];
      if (!file) { toast("Selecione um ficheiro CSV."); return; }

      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(x => x.trim());
      if (lines.length < 2) { toast("CSV vazio ou inválido."); return; }

      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map(x => x.trim().replace(/^"|"$/g,"").toLowerCase());
      const farmIdx = headers.findIndex(h => ["exploracao","exploração","farm"].includes(h));
      const nameIdx = headers.findIndex(h => ["nome","name"].includes(h));

      if (farmIdx < 0 || nameIdx < 0) {
        toast("O CSV deve ter as colunas Exploracao e Nome.");
        return;
      }

      const items = lines.slice(1).map(line => {
        const cols = line.split(sep).map(x => x.trim().replace(/^"|"$/g,""));
        return { farmName: cols[farmIdx] || "", name: cols[nameIdx] || "" };
      }).filter(x => x.farmName || x.name);

      await runBulkParkImport(items);
    });
  }

  async function runBulkParkImport(items) {
    const resultBox = document.getElementById("bulkImportResult");

    if (!Array.isArray(items) || !items.length) {
      resultBox.className = "error-box";
      resultBox.textContent = "Não existem parques para importar.";
      return;
    }

    if (items.length > 500) {
      resultBox.className = "error-box";
      resultBox.textContent = "Máximo de 500 parques por importação.";
      return;
    }

    resultBox.className = "alert-box";
    resultBox.textContent = `A importar 0 de ${items.length} parques…`;

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const farmName = String(item.farmName || "").trim();
      const name = String(item.name || "").trim();

      resultBox.textContent = `A importar ${i + 1} de ${items.length} parques…`;

      if (!farmName) {
        skipped++;
        errors.push({ line: `Linha ${i + 1}`, error: "Exploração em falta" });
        continue;
      }

      try {
        await api("createPark", { name, farmName });
        created++;
      } catch (err) {
        skipped++;
        errors.push({
          line: `Linha ${i + 1}`,
          error: err.message || String(err)
        });
      }
    }

    resultBox.className = errors.length ? "alert-box" : "success-box";
    resultBox.innerHTML = `
      <strong>Importação concluída</strong>
      <div style="margin-top:6px">
        Criados: ${created}<br>
        Ignorados: ${skipped}<br>
        Erros: ${errors.length}
      </div>
      ${errors.length ? `
        <div style="margin-top:8px;font-size:.78rem">
          ${errors.slice(0,20).map(e => `${escapeHtml(e.line)} — ${escapeHtml(e.error)}`).join("<br>")}
        </div>
      ` : ""}
    `;

    try {
      await loadInitialData();
    } catch {}
  }

  function newParkModal() {
    showModal(`
      <div class="modal-head"><h2>Novo parque</h2><button class="icon-btn modal-close">×</button></div>
      <form id="newParkForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="newParkName" placeholder="Ex.: Novilhas Norte"></div>
        <div class="field"><label>Exploração</label><select id="newFarm"><option>Monte Ruivo</option><option>Trolho</option></select></div>
        <div class="success-box">A identificação técnica do parque é criada automaticamente pela BoviRonda.</div>
        <button class="btn btn-primary" type="submit">Criar parque</button>
      </form>`);
    document.getElementById("newParkForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        const result = await api("createPark",{name:newParkName.value.trim(),farmName:newFarm.value});
        toast("Parque criado com sucesso.");
        closeModal();
        await refreshAll();
        state.page="admin";
        renderShell();
        setTimeout(()=>loadAdminTab("parks"),30);
      } catch(err){toast(err.message)}
    });
  }

  function editParkModal(park) {
    showModal(`
      <div class="modal-head">
        <div><h2>Editar parque</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(visibleParkName(park))}</div></div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <form id="editParkForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="editParkName" value="${escapeHtml(park.name||"")}"></div>
        <div class="field"><label>Exploração</label>
          <select id="editParkFarm">
            <option value="Monte Ruivo" ${park.farmName==="Monte Ruivo"?"selected":""}>Monte Ruivo</option>
            <option value="Trolho" ${park.farmName==="Trolho"?"selected":""}>Trolho</option>
          </select>
        </div>
        <div class="field"><label>Estado</label>
          <select id="editParkActive">
            <option value="true" ${park.active?"selected":""}>Disponível</option>
            <option value="false" ${!park.active?"selected":""}>Indisponível</option>
          </select>
        </div>
        <div class="alert-box">Ao colocar um parque como indisponível, deixa de aparecer nas rondas e o respetivo QR deixa de abrir esse parque. O histórico é mantido.</div>
        <button class="btn btn-primary btn-block" type="submit">Guardar alterações</button>
        <button id="deleteParkBtn" class="btn btn-danger btn-block" type="button">Eliminar parque</button>
      </form>
    `);

    document.getElementById("editParkForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await api("updatePark",{
          parkId:park.id,
          name:document.getElementById("editParkName").value.trim(),
          farmName:document.getElementById("editParkFarm").value,
          active:document.getElementById("editParkActive").value==="true"
        });
        toast("Parque atualizado.");
        closeModal();
        await refreshAll();
        state.page="admin";
        renderShell();
        setTimeout(()=>loadAdminTab("parks"),30);
      } catch(err){toast(err.message)}
    });

    document.getElementById("deleteParkBtn").addEventListener("click", async () => {
      const ok = window.confirm(`Eliminar definitivamente o parque ${visibleParkName(park)}? Só é possível se ainda não tiver rondas nem ocorrências.`);
      if(!ok) return;
      try {
        await api("deletePark",{parkId:park.id});
        toast("Parque eliminado.");
        closeModal();
        await refreshAll();
        state.page="admin";
        renderShell();
        setTimeout(()=>loadAdminTab("parks"),30);
      } catch(err){toast(err.message)}
    });
  }

  function editRoundModal(round) {
    showModal(`
      <div class="modal-head">
        <div><h2>Editar ronda</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(visibleParkName(round))} · ${escapeHtml(round.completedAtLabel)}</div></div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <form id="editRoundForm" class="form-grid">
        <div class="field"><label>Água</label>
          <select id="editRoundWater">
            <option value="ok" ${round.water==="ok"?"selected":""}>OK</option>
            <option value="sem_agua" ${round.water==="sem_agua"?"selected":""}>Sem água</option>
            <option value="problema_bebedouro" ${round.water==="problema_bebedouro"?"selected":""}>Problema no bebedouro</option>
          </select>
        </div>
        <div class="field"><label>Comida</label>
          <select id="editRoundFeed">
            <option value="ok" ${round.feed==="ok"?"selected":""}>OK</option>
            <option value="sem_comida" ${round.feed==="sem_comida"?"selected":""}>Sem comida</option>
            <option value="insuficiente" ${round.feed==="insuficiente"?"selected":""}>Insuficiente</option>
          </select>
        </div>
        <div class="field"><label>Infraestrutura</label>
          <select id="editRoundInfra">
            <option value="ok" ${round.infrastructure==="ok"?"selected":""}>OK</option>
            <option value="problema" ${round.infrastructure==="problema"?"selected":""}>Problema</option>
          </select>
        </div>
        <div class="field"><label>Tipo de infraestrutura</label><input id="editRoundInfraType" value="${escapeHtml(round.infrastructureType||"")}"></div>
        <div class="field"><label>Observações</label><textarea id="editRoundNotes">${escapeHtml(round.notes||"")}</textarea></div>
        <div class="alert-box">A correção fica registada no AuditLog.</div>
        <button class="btn btn-primary btn-block" type="submit">Guardar correção</button>
        <button id="deleteRoundBtn" class="btn btn-danger btn-block" type="button">Eliminar ronda</button>
      </form>`);

    document.getElementById("editRoundForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        await api("updateRoundAdmin",{
          roundId:round.id,
          water:document.getElementById("editRoundWater").value,
          feed:document.getElementById("editRoundFeed").value,
          infrastructure:document.getElementById("editRoundInfra").value,
          infrastructureType:document.getElementById("editRoundInfraType").value.trim(),
          notes:document.getElementById("editRoundNotes").value.trim()
        });
        toast("Ronda corrigida.");
        closeModal();
        loadAdminTab("records");
        await loadInitialData();
      } catch(err){toast(err.message)}
    });

    document.getElementById("deleteRoundBtn").addEventListener("click", async ()=>{
      if(!window.confirm("Eliminar esta ronda? As ocorrências criadas por esta ronda também serão eliminadas.")) return;
      try {
        await api("deleteRoundAdmin",{roundId:round.id});
        toast("Ronda eliminada.");
        closeModal();
        loadAdminTab("records");
        await loadInitialData();
      } catch(err){toast(err.message)}
    });
  }

  function editIncidentAdminModal(incident) {
    showModal(`
      <div class="modal-head">
        <div><h2>Editar ocorrência</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(visibleParkName(incident))} · ${escapeHtml(incident.typeLabel)}</div></div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <form id="editIncidentAdminForm" class="form-grid">
        <div class="field"><label>Estado</label>
          <select id="editIncidentStatus">
            ${["aberta","em_resolucao","por_observar","em_tratamento","em_acompanhamento","resolvida"].map(s=>`<option value="${s}" ${incident.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Descrição</label><textarea id="editIncidentDescription">${escapeHtml(incident.description||"")}</textarea></div>
        <div class="field"><label>Nota de resolução</label><textarea id="editIncidentResolutionNote">${escapeHtml(incident.resolutionNote||"")}</textarea></div>
        <div class="alert-box">A correção fica registada no AuditLog.</div>
        <button class="btn btn-primary btn-block" type="submit">Guardar correção</button>
        <button id="deleteIncidentBtn" class="btn btn-danger btn-block" type="button">Eliminar ocorrência</button>
      </form>`);

    document.getElementById("editIncidentAdminForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        await api("updateIncidentAdmin",{
          incidentId:incident.id,
          status:document.getElementById("editIncidentStatus").value,
          description:document.getElementById("editIncidentDescription").value.trim(),
          resolutionNote:document.getElementById("editIncidentResolutionNote").value.trim()
        });
        toast("Ocorrência corrigida.");
        closeModal();
        loadAdminTab("records");
        await loadInitialData();
      } catch(err){toast(err.message)}
    });

    document.getElementById("deleteIncidentBtn").addEventListener("click", async ()=>{
      if(!window.confirm("Eliminar esta ocorrência? Os registos veterinários/necrópsia associados também serão eliminados.")) return;
      try {
        await api("deleteIncidentAdmin",{incidentId:incident.id});
        toast("Ocorrência eliminada.");
        closeModal();
        loadAdminTab("records");
        await loadInitialData();
      } catch(err){toast(err.message)}
    });
  }

  function showParkQr(id, sourceList=state.parks) {
    const p = sourceList.find(x=>x.id===id); if(!p)return;
    showModal(`
      <div class="modal-head"><h2>QR · ${escapeHtml(visibleParkName(p))}</h2><button class="icon-btn modal-close">×</button></div>
      <div class="card qr-card">
        <div style="font-size:.8rem;color:var(--muted)">MONTE DO PASTO</div>
        <h2 style="margin:5px 0">${escapeHtml(p.farmName)}</h2>
        <div style="font-size:1.6rem;font-weight:900">${escapeHtml(visibleParkName(p))}</div>
        <div id="qrBox" class="qr-box"></div>
        <p style="color:var(--muted);font-size:.82rem">Ler com a aplicação BoviRonda</p>
        <button id="printQrBtn" class="btn btn-primary">Imprimir</button>
      </div>`);
    const value = p.qrToken;
    if (window.QRCode) new QRCode(document.getElementById("qrBox"), {text:value,width:200,height:200});
    document.getElementById("printQrBtn").addEventListener("click",()=>window.print());
  }

  function showModal(html) {
    const old=document.getElementById("modalRoot"); if(old)old.remove();
    const root=document.createElement("div");
    root.id="modalRoot"; root.className="modal-backdrop";
    root.innerHTML=`<div class="modal">${html}</div>`;
    document.body.appendChild(root);
    root.addEventListener("click",e=>{if(e.target===root)closeModal()});
    root.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",closeModal));
  }
  function closeModal(){const root=document.getElementById("modalRoot");if(root?.dataset.busy!=="true")root?.remove()}

  async function logout() {
    try { await api("logout"); } catch {}
    state.session=null; state.profile=null; saveSession(); stopScanner(); renderLogin();
  }

  async function init() {
    loadSession();
    if (state.session && await resumeSession()) renderShell();
    else renderLogin();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
  init();
})();

