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
        <button class="filter-btn" data-admin-tab="records">Registos</button>
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
          <button id="addParkBtn" class="btn btn-primary" style="margin-bottom:12px">+ Novo parque</button>
          <div class="table-wrap"><table><thead><tr><th>Código</th><th>Nome</th><th>Exploração</th><th>Estado</th><th>QR</th><th></th></tr></thead><tbody>
          ${adminParks.map(p=>`<tr>
            <td>${escapeHtml(p.code)}</td>
            <td>${escapeHtml(p.name||"")}</td>
            <td>${escapeHtml(p.farmName)}</td>
            <td>${p.active?'<span class="badge badge-green">Disponível</span>':'<span class="badge badge-grey">Indisponível</span>'}</td>
            <td><button class="btn btn-soft show-qr" data-id="${p.id}" ${p.active?"":"disabled"}>Ver QR</button></td>
            <td><button class="btn btn-soft edit-park-btn" data-id="${p.id}">Editar</button></td>
          </tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("addParkBtn").addEventListener("click", newParkModal);
        document.querySelectorAll(".show-qr").forEach(b=>b.addEventListener("click",()=>showParkQr(b.dataset.id, adminParks)));
        document.querySelectorAll(".edit-park-btn").forEach(b=>b.addEventListener("click",()=>{
          const park=adminParks.find(p=>p.id===b.dataset.id);
          if(park) editParkModal(park);
        }));
      } else if (tab === "records") {
        const data = await api("listAdminRecords");
        state.adminRounds = data.rounds || [];
        state.adminIncidents = data.incidents || [];

        body.innerHTML = `
          <div class="filters" style="margin-bottom:12px">
            <button class="filter-btn active" data-record-type="rounds">Rondas</button>
            <button class="filter-btn" data-record-type="incidents">Ocorrências</button>
          </div>
          <div id="recordsBody"></div>`;

        const renderRecords = (type) => {
          const box = document.getElementById("recordsBody");
          if (type === "rounds") {
            box.innerHTML = `
              <div class="table-wrap"><table>
                <thead><tr><th>Data</th><th>Parque</th><th>Utilizador</th><th>Água</th><th>Comida</th><th></th></tr></thead>
                <tbody>
                  ${state.adminRounds.map(r=>`<tr>
                    <td>${escapeHtml(r.completedAtLabel)}</td>
                    <td>${escapeHtml(r.parkCode)} · ${escapeHtml(r.farmName)}</td>
                    <td>${escapeHtml(r.userName)}</td>
                    <td>${escapeHtml(r.waterLabel)}</td>
                    <td>${escapeHtml(r.feedLabel)}</td>
                    <td><button class="btn btn-soft edit-round-btn" data-id="${r.id}">Editar</button></td>
                  </tr>`).join("")}
                </tbody>
              </table></div>`;
            document.querySelectorAll(".edit-round-btn").forEach(b=>b.addEventListener("click",()=>{
              const rec=state.adminRounds.find(r=>r.id===b.dataset.id);
              if(rec) editRoundModal(rec);
            }));
          } else {
            box.innerHTML = `
              <div class="table-wrap"><table>
                <thead><tr><th>Data</th><th>Parque</th><th>Tipo</th><th>Estado</th><th>Reportado por</th><th></th></tr></thead>
                <tbody>
                  ${state.adminIncidents.map(i=>`<tr>
                    <td>${escapeHtml(i.reportedAtLabel)}</td>
                    <td>${escapeHtml(i.parkCode)} · ${escapeHtml(i.farmName)}</td>
                    <td>${escapeHtml(i.typeLabel)}</td>
                    <td>${escapeHtml(i.statusLabel)}</td>
                    <td>${escapeHtml(i.reportedByName)}</td>
                    <td><button class="btn btn-soft edit-incident-admin-btn" data-id="${i.id}">Editar</button></td>
                  </tr>`).join("")}
                </tbody>
              </table></div>`;
            document.querySelectorAll(".edit-incident-admin-btn").forEach(b=>b.addEventListener("click",()=>{
              const rec=state.adminIncidents.find(i=>i.id===b.dataset.id);
              if(rec) editIncidentAdminModal(rec);
            }));
          }
        };

        document.querySelectorAll("[data-record-type]").forEach(btn=>btn.addEventListener("click",()=>{
          document.querySelectorAll("[data-record-type]").forEach(x=>x.classList.toggle("active",x===btn));
          renderRecords(btn.dataset.recordType);
        }));
        renderRecords("rounds");
      } else {
        body.innerHTML = `<div class="card card-pad"><h3 style="margin-top:0">QR Codes dos parques</h3><p style="color:var(--muted)">Cada parque tem um token permanente. Alterar o nome ou o código visível não invalida o QR.</p><div class="list">${state.parks.filter(p=>p.active!==false).map(p=>`<button class="list-item show-qr" data-id="${p.id}" style="width:100%;text-align:left"><div class="list-main"><strong>${escapeHtml(p.code)}</strong><span>${escapeHtml(p.farmName)}</span></div><span>▣</span></button>`).join("")}</div></div>`;
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

  function newParkModal() {
    showModal(`
      <div class="modal-head"><h2>Novo parque</h2><button class="icon-btn modal-close">×</button></div>
      <form id="newParkForm" class="form-grid">
        <div class="field"><label>Nome</label><input id="newParkName" placeholder="Ex.: Novilhas Norte"></div>
        <div class="field"><label>Exploração</label><select id="newFarm"><option>Monte Ruivo</option><option>Trolho</option></select></div>
        <div class="success-box">O código do parque é atribuído automaticamente pela BoviRonda.</div>
        <button class="btn btn-primary" type="submit">Criar parque</button>
      </form>`);
    document.getElementById("newParkForm").addEventListener("submit", async e=>{
      e.preventDefault();
      try {
        const result = await api("createPark",{name:newParkName.value.trim(),farmName:newFarm.value});
        toast(`Parque criado: ${result.code}`);
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
        <div><h2>Editar parque</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(park.code)}</div></div>
        <button class="icon-btn modal-close" type="button">×</button>
      </div>
      <form id="editParkForm" class="form-grid">
        <div class="field"><label>Código</label><input id="editParkCode" value="${escapeHtml(park.code)}" readonly></div>
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
      const ok = window.confirm(`Eliminar definitivamente o parque ${park.code}? Só é possível se ainda não tiver rondas nem ocorrências.`);
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
        <div><h2>Editar ronda</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(round.parkCode)} · ${escapeHtml(round.completedAtLabel)}</div></div>
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
        <div><h2>Editar ocorrência</h2><div style="color:var(--muted);font-size:.82rem">${escapeHtml(incident.parkCode)} · ${escapeHtml(incident.typeLabel)}</div></div>
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
