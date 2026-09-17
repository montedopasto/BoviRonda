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
    users: [],
    farms: [],
    page: "home",
    farmFilter: "Todos",
    scanner: null
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

  async function api(action, payload={}) {
    if (!C.API_URL || C.API_URL.includes("COLE_AQUI")) {
      throw new Error("Configura primeiro o API_URL em config.js.");
    }
    const body = new URLSearchParams();
    body.set("action", action);
    body.set("payload", JSON.stringify(payload));
    if (state.session?.token) body.set("token", state.session.token);

    const res = await fetch(C.API_URL, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
      body
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error("Resposta inválida do Apps Script.");
    }
    if (!data.ok) throw new Error(data.error || "Erro na API.");
    return data.data;
  }

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

  async function login(username, pin) {
    const data = await api("login", {username, pin});
    state.session = {token: data.token, expiresAt: data.expiresAt};
    state.profile = data.profile;
    saveSession();
    await loadInitialData();
    renderShell();
  }

  async function resumeSession() {
    if (!state.session?.token) return false;
    try {
      const data = await api("me");
      state.profile = data.profile;
      await loadInitialData();
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
  }

  function renderLogin(error="") {
    app.innerHTML = `
      <main class="login-screen">
        <section class="card login-card">
          <div class="login-brand">
            <div class="brand-mark">BR</div>
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
      ["parks","▦","Parques"],
      ["incidents","!","Ocorrências"]
    ];
    if (roleCanRound()) items.splice(1,0,["scan","▣","QR"]);
    if (state.profile?.role === "admin") items.push(["admin","⚙","Admin"]);
    return items;
  }

  function renderShell() {
    const nav = navItems();
    app.innerHTML = `
      <div class="desktop-layout">
        <aside class="desktop-sidebar">
          <div class="sidebar-brand">
            <div class="brand-mark">BR</div>
            <h2>BoviRonda</h2>
            <small style="opacity:.65">Monte do Pasto</small>
          </div>
          <nav class="sidebar-nav">
            ${nav.map(([p,i,l]) => `<button class="sidebar-btn ${state.page===p?'active':''}" data-page="${p}">${i} &nbsp; ${l}</button>`).join("")}
          </nav>
        </aside>
        <div class="app-shell">
          <main class="container">
            <header class="topbar">
              <div class="brand">
                <div class="brand-mark mobile-only">BR</div>
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
              ${nav.slice(0,4).map(([p,i,l]) => `<button class="nav-btn ${state.page===p?'active':''}" data-page="${p}"><span>${i}</span>${l}</button>`).join("")}
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
    const el = document.getElementById("page");
    if (!el) return;
    if (state.page === "home") renderHome(el);
    else if (state.page === "scan") renderScanner(el);
    else if (state.page === "parks") renderParks(el);
    else if (state.page === "incidents") renderIncidents(el);
    else if (state.page === "admin") renderAdmin(el);
  }

  function renderHome(el) {
    const d = state.dashboard || {};
    const farms = d.farms || [];
    const attention = (state.parks || []).filter(p => p.daysSinceRound === null || p.daysSinceRound >= (C.WARNING_DAYS || 3)).slice(0,6);

    el.innerHTML = `
      <section class="card hero">
        <small>Visão do terreno</small>
        <h2>Bom dia, ${escapeHtml((state.profile.fullName || "").split(" ")[0])}</h2>
        <p>${d.totalParks || 0} parques · ${d.openIncidents || 0} ocorrências abertas</p>
        <div class="hero-actions">
          ${roleCanRound() ? `<button id="homeScanBtn" class="btn btn-light">▣ &nbsp; Ler QR do parque</button>` : ""}
          <button id="refreshBtn" class="btn" style="background:rgba(255,255,255,.13);color:#fff">↻ Atualizar</button>
        </div>
      </section>

      <div class="section-title"><div><h3>Explorações</h3><p>Estado das rondas por exploração</p></div></div>
      <section class="farms">
        ${farms.map(f => `
          <article class="card farm-card">
            <div class="farm-head">
              <div><h3>${escapeHtml(f.name)}</h3><p>${f.totalParks} parques</p></div>
              <span class="badge ${f.openIncidents ? 'badge-red':'badge-green'}">${f.openIncidents} alertas</span>
            </div>
            <div class="stats-row">
              <div class="stat"><strong>${f.roundsToday}</strong><span>Hoje</span></div>
              <div class="stat"><strong>${f.withoutRecentRound}</strong><span>+${C.WARNING_DAYS || 3} dias</span></div>
              <div class="stat"><strong>${f.openIncidents}</strong><span>Ocorrências</span></div>
            </div>
          </article>`).join("")}
      </section>

      <div class="section-title"><div><h3>Atenção</h3><p>Parques há mais tempo sem ronda</p></div><button id="allParksBtn" class="btn btn-soft">Ver todos</button></div>
      <section class="list">
        ${attention.length ? attention.map(p => parkListItem(p)).join("") : `<div class="card empty">Não existem parques a exigir atenção.</div>`}
      </section>

      ${(roleCanSeeVet() || roleCanSeeOperations()) ? `
      <div class="section-title"><div><h3>Ocorrências abertas</h3><p>Últimos alertas registados</p></div><button id="allIncBtn" class="btn btn-soft">Ver todas</button></div>
      <section class="list">
        ${(state.incidents || []).slice(0,5).map(incidentListItem).join("") || `<div class="card empty">Sem ocorrências abertas.</div>`}
      </section>` : ""}`;

    document.getElementById("homeScanBtn")?.addEventListener("click", () => navigate("scan"));
    document.getElementById("allParksBtn").addEventListener("click", () => navigate("parks"));
    document.getElementById("allIncBtn")?.addEventListener("click", () => navigate("incidents"));
    document.getElementById("refreshBtn").addEventListener("click", refreshAll);
    bindParkButtons();
    bindIncidentButtons();
  }

  function parkListItem(p) {
    return `<button class="list-item park-open" data-id="${escapeHtml(p.id)}" style="width:100%;text-align:left">
      <div class="list-main">
        <strong>${escapeHtml(p.code)} ${p.name ? "· "+escapeHtml(p.name) : ""}</strong>
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
        <span>${escapeHtml(i.farmName)} · ${escapeHtml(i.parkCode)} · ${escapeHtml(i.reportedByName || "")}</span>
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
        <div class="modal-head"><div><h2>${escapeHtml(p.code)} ${p.name ? "· "+escapeHtml(p.name) : ""}</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(p.farmName)}</div></div><button class="icon-btn modal-close">×</button></div>
        <div class="kpis">
          <div class="card kpi"><div class="value">${p.daysSinceRound ?? "—"}</div><div class="label">Dias desde ronda</div></div>
          <div class="card kpi"><div class="value">${incidents.filter(x=>x.status!=="resolvida").length}</div><div class="label">Ocorrências abertas</div></div>
        </div>
        ${roleCanRound() ? `<button id="startRoundPark" class="btn btn-primary btn-block" style="margin-top:14px">Iniciar ronda neste parque</button>` : ""}
        <div class="section-title"><div><h3>Histórico de rondas</h3></div></div>
        <div class="list">
          ${rounds.length ? rounds.map(r => `<div class="list-item"><div class="list-main"><strong>${escapeHtml(r.completedAtLabel)}</strong><span>${escapeHtml(r.userName)} · Água: ${escapeHtml(r.waterLabel)} · Comida: ${escapeHtml(r.feedLabel)}</span></div></div>`).join("") : `<div class="empty">Ainda sem rondas.</div>`}
        </div>`);
      document.getElementById("startRoundPark")?.addEventListener("click", () => {
        closeModal(); renderRoundForm(p);
      });
    } catch (e) { toast(e.message); }
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
      navigate("scan");
    }
  }

  function openManualPark() {
    showModal(`
      <div class="modal-head"><h2>Escolher parque</h2><button class="icon-btn modal-close">×</button></div>
      <div class="list">
        ${state.parks.map(p => `<button class="list-item manual-park" data-id="${p.id}" style="width:100%;text-align:left"><div class="list-main"><strong>${escapeHtml(p.code)}</strong><span>${escapeHtml(p.farmName)} ${p.name ? "· "+escapeHtml(p.name):""}</span></div></button>`).join("")}
      </div>`);
    document.querySelectorAll(".manual-park").forEach(b => b.addEventListener("click", () => {
      const p = state.parks.find(x=>x.id===b.dataset.id);
      closeModal(); renderRoundForm(p);
    }));
  }

  function renderRoundForm(park) {
    const el = document.getElementById("page");
    state.page = "parks";
    el.innerHTML = `
      <div class="page-head"><h2>Ronda · ${escapeHtml(park.code)}</h2><p>${escapeHtml(park.farmName)} ${park.name ? "· "+escapeHtml(park.name):""}</p></div>
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
          <div class="field" style="margin-top:12px"><label>Fotografia</label><input id="roundPhoto" type="file" accept="image/*" capture="environment"></div>
          <img id="roundPhotoPreview" class="photo-preview hidden" alt="Pré-visualização">
        </section>
        <button class="btn btn-primary btn-block" type="submit">Guardar ronda</button>
      </form>`;
    document.querySelectorAll('input[name="infra"]').forEach(r => r.addEventListener("change", () => {
      document.getElementById("infraExtra").classList.toggle("hidden", r.value !== "problema" || !r.checked);
    }));
    document.getElementById("roundPhoto").addEventListener("change", previewPhoto);
    document.getElementById("roundForm").addEventListener("submit", e => submitRound(e, park));
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
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg", .78);
  }

  async function submitRound(e, park) {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = "A guardar…";
    try {
      const fd = new FormData(e.currentTarget);
      const photoFile = document.getElementById("roundPhoto").files?.[0];
      const photo = await fileToBase64(photoFile);
      const payload = {
        parkId: park.id,
        water: fd.get("water"),
        feed: fd.get("feed"),
        animalSick: document.getElementById("animalSick").checked,
        animalDead: document.getElementById("animalDead").checked,
        infrastructure: fd.get("infra"),
        infrastructureType: document.getElementById("infraType")?.value || "",
        notes: document.getElementById("roundNotes").value.trim(),
        photoDataUrl: photo
      };
      const result = await api("createRound", payload);
      toast(`Ronda guardada · ${result.incidentsCreated} ocorrência(s) criada(s).`);
      await refreshAll();
      state.page = "home";
      renderShell();
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = "Guardar ronda";
    }
  }

  function renderIncidents(el) {
    let list = state.incidents || [];
    if (!roleCanSeeVet()) list = list.filter(i => i.category !== "veterinaria");
    if (!roleCanSeeOperations() && state.profile.role !== "admin") list = list.filter(i => i.reportedById === state.profile.id);

    el.innerHTML = `
      <div class="page-head"><h2>Ocorrências</h2><p>Alertas operacionais e veterinários.</p></div>
      <section class="list">${list.map(incidentListItem).join("") || `<div class="card empty">Sem ocorrências abertas.</div>`}</section>`;
    bindIncidentButtons();
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
        <div class="modal-head"><div><h2>${escapeHtml(i.typeLabel)}</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(i.farmName)} · ${escapeHtml(i.parkCode)}</div></div><button class="icon-btn modal-close">×</button></div>
        <div class="card card-pad">
          <div class="list-main"><strong>Reportado por ${escapeHtml(i.reportedByName)}</strong><span>${escapeHtml(i.reportedAtLabel)}</span></div>
          ${i.description ? `<p>${escapeHtml(i.description)}</p>`:""}
          ${i.photoUrl ? `<img src="${escapeHtml(i.photoUrl)}" class="photo-preview" alt="Fotografia da ocorrência">`:""}
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
          <div class="field"><label>NR PT *</label><input id="nrPt" required value="${escapeHtml(v?.nrPt || "")}" placeholder="PT..."></div>
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
      nrPt: document.getElementById("nrPt").value.trim(),
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
      if (tab === "users") {
        const users = await api("listUsers");
        state.users = users;
        body.innerHTML = `
          <button id="addUserBtn" class="btn btn-primary" style="margin-bottom:12px">+ Novo utilizador</button>
          <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Utilizador</th><th>Perfil</th><th>Estado</th></tr></thead><tbody>
          ${users.map(u=>`<tr><td>${escapeHtml(u.fullName)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(ROLE_LABELS[u.role]||u.role)}</td><td>${u.active?"Ativo":"Inativo"}</td></tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("addUserBtn").addEventListener("click", newUserModal);
      } else if (tab === "parks") {
        body.innerHTML = `
          <button id="addParkBtn" class="btn btn-primary" style="margin-bottom:12px">+ Novo parque</button>
          <div class="table-wrap"><table><thead><tr><th>Código</th><th>Nome</th><th>Exploração</th><th>QR</th></tr></thead><tbody>
          ${state.parks.map(p=>`<tr><td>${escapeHtml(p.code)}</td><td>${escapeHtml(p.name||"")}</td><td>${escapeHtml(p.farmName)}</td><td><button class="btn btn-soft show-qr" data-id="${p.id}">Ver QR</button></td></tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("addParkBtn").addEventListener("click", newParkModal);
        document.querySelectorAll(".show-qr").forEach(b=>b.addEventListener("click",()=>showParkQr(b.dataset.id)));
      } else {
        body.innerHTML = `<div class="card card-pad"><h3 style="margin-top:0">QR Codes dos parques</h3><p style="color:var(--muted)">Cada parque tem um token permanente. Alterar o nome ou o código visível não invalida o QR.</p><div class="list">${state.parks.map(p=>`<button class="list-item show-qr" data-id="${p.id}" style="width:100%;text-align:left"><div class="list-main"><strong>${escapeHtml(p.code)}</strong><span>${escapeHtml(p.farmName)}</span></div><span>▣</span></button>`).join("")}</div></div>`;
        document.querySelectorAll(".show-qr").forEach(b=>b.addEventListener("click",()=>showParkQr(b.dataset.id)));
      }
    } catch(e) { body.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
  }

  function newUserModal() {
    showModal(`
      <div class="modal-head"><h2>Novo utilizador</h2><button class="icon-btn modal-close">×</button></div>
      <form id="newUserForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="newFullName" required></div>
        <div class="field"><label>Username</label><input id="newUsername" required></div>
        <div class="field"><label>PIN</label><input id="newPin" inputmode="numeric" required></div>
        <div class="field"><label>Perfil</label><select id="newRole"><option value="utilizador">Utilizador</option><option value="veterinario">Veterinário</option><option value="chefia">Chefia</option><option value="admin">Admin</option></select></div>
        <button class="btn btn-primary" type="submit">Criar utilizador</button>
      </form>`);
    document.getElementById("newUserForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        await api("createUser",{fullName:newFullName.value.trim(),username:newUsername.value.trim(),pin:newPin.value.trim(),role:newRole.value});
        toast("Utilizador criado."); closeModal(); loadAdminTab("users");
      } catch(err){toast(err.message)}
    });
  }

  function newParkModal() {
    showModal(`
      <div class="modal-head"><h2>Novo parque</h2><button class="icon-btn modal-close">×</button></div>
      <form id="newParkForm" class="form-grid">
        <div class="field"><label>Código</label><input id="newParkCode" required placeholder="MR-01"></div>
        <div class="field"><label>Nome</label><input id="newParkName"></div>
        <div class="field"><label>Exploração</label><select id="newFarm"><option>Monte Ruivo</option><option>Trolho</option></select></div>
        <button class="btn btn-primary" type="submit">Criar parque</button>
      </form>`);
    document.getElementById("newParkForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        await api("createPark",{code:newParkCode.value.trim(),name:newParkName.value.trim(),farmName:newFarm.value});
        toast("Parque criado e QR associado."); closeModal(); await refreshAll(); state.page="admin"; renderShell();
      } catch(err){toast(err.message)}
    });
  }

  function showParkQr(id) {
    const p = state.parks.find(x=>x.id===id); if(!p)return;
    showModal(`
      <div class="modal-head"><h2>QR · ${escapeHtml(p.code)}</h2><button class="icon-btn modal-close">×</button></div>
      <div class="card qr-card">
        <div style="font-size:.8rem;color:var(--muted)">MONTE DO PASTO</div>
        <h2 style="margin:5px 0">${escapeHtml(p.farmName)}</h2>
        <div style="font-size:1.6rem;font-weight:900">${escapeHtml(p.code)}</div>
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
  function closeModal(){document.getElementById("modalRoot")?.remove()}

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
