/**
 * BoviRonda · Google Apps Script API
 * Backend: Google Sheets + Google Drive
 *
 * 1) Crie uma Google Sheet.
 * 2) Extensions > Apps Script.
 * 3) Cole este Code.gs.
 * 4) ATUALIZAÇÃO EXISTENTE: nunca executar setupBoviRonda(); consultar ATUALIZAR_OCORRENCIAS.txt.
 * 5) Deploy > New deployment > Web app.
 * 6) Execute as: Me
 * 7) Who has access: Anyone
 * 8) Cole o URL /exec em config.js no GitHub.
 */

const BR = {
  SHEETS: {
    USERS: "Utilizadores",
    FARMS: "Exploracoes",
    PARKS: "Parques",
    ROUNDS: "Rondas",
    INCIDENTS: "Ocorrencias",
    VET: "Veterinaria",
    NECROPSIES: "Necropsias",
    PHOTOS: "Fotos",
    SESSIONS: "Sessoes",
    AUDIT: "AuditLog"
  },
  ROLES: ["admin","utilizador","veterinario","chefia"],
  SESSION_HOURS: 24 * 7,
  PHOTO_FOLDER_PROP: "BOVIRONDA_PHOTO_FOLDER_ID"
};

function doGet(e) {
  return json_({ok:true,data:{service:"BoviRonda API",version:"1.0"}});
}

function doPost(e) {
  try {
    const action = String(e.parameter.action || "").trim();
    const payload = JSON.parse(e.parameter.payload || "{}");
    const token = String(e.parameter.token || "");
    const publicActions = ["login"];
    const session = publicActions.includes(action) ? null : requireSession_(token);

    let data;
    switch (action) {
      case "getNotificationSettings": data = getNotificationSettings_(session); break;
      case "saveNotificationSettings": data = saveNotificationSettings_(session,payload); break;
      case "login": data = login_(payload); break;
      case "logout": data = logout_(session); break;
      case "getPhoto": data = getPhoto_(session,payload); break;
      case "me": data = {profile: profileForClient_(session.user)}; break;
      case "dashboard": data = dashboard_(session); break;
      case "listParks": data = listParks_(session); break;
      case "listRounds": data = listRounds_(session); break;
      case "getPark": data = getPark_(session,payload); break;
      case "findParkByQr": data = findParkByQr_(session,payload); break;
      case "createRound": data = createRound_(session,payload); break;
      case "listIncidents": data = listIncidents_(session,payload); break;
      case "getIncident": data = getIncident_(session,payload); break;
      case "updateVeterinaryCase": data = updateVeterinaryCase_(session,payload); break;
      case "resolveIncidentsBulk": data = resolveIncidentsBulk_(session,payload); break;
      case "updateOperationalIncident": data = updateOperationalIncident_(session,payload); break;
      case "listUsers": data = listUsers_(session); break;
      case "createUser": data = createUser_(session,payload); break;
      case "updateUser": data = updateUser_(session,payload); break;
      case "listAdminParks": data = listAdminParks_(session); break;
      case "listAdminRecords": data = listAdminRecords_(session); break;
      case "updateRoundAdmin": data = updateRoundAdmin_(session,payload); break;
      case "deleteRoundAdmin": data = deleteRoundAdmin_(session,payload); break;
      case "updateIncidentAdmin": data = updateIncidentAdmin_(session,payload); break;
      case "deleteIncidentAdmin": data = deleteIncidentAdmin_(session,payload); break;
      case "bulkCreateParks": data = bulkCreateParks_(session,payload); break;
      case "createPark": data = createPark_(session,payload); break;
      case "updatePark": data = updatePark_(session,payload); break;
      case "deletePark": data = deletePark_(session,payload); break;
      default: throw new Error("Ação desconhecida.");
    }
    return json_({ok:true,data});
  } catch (err) {
    return json_({ok:false,error:err.message || String(err)});
  }
}

function setupBoviRonda() {
  const ss = SpreadsheetApp.getActive();
  const specs = {};
  specs[BR.SHEETS.USERS] = ["ID","Nome","Username","PINHash","Perfil","Ativo","CriadoEm","AtualizadoEm"];
  specs[BR.SHEETS.FARMS] = ["ID","Nome","Codigo","Ativo","CriadoEm"];
  specs[BR.SHEETS.PARKS] = ["ID","Codigo","Nome","ExploracaoID","QRToken","Ativo","CriadoEm","AtualizadoEm"];
  specs[BR.SHEETS.ROUNDS] = ["ID","ParqueID","UtilizadorID","DataHoraInicio","DataHoraFim","Agua","Comida","Infraestrutura","TipoInfraestrutura","Observacoes","FotoURL","CriadoEm"];
  specs[BR.SHEETS.INCIDENTS] = ["ID","RondaID","ParqueID","ReportadoPorID","Categoria","Tipo","Estado","Descricao","FotoURL","ReportadoEm","ResolvidoEm","ResolvidoPorID","NotaResolucao","AtualizadoEm"];
  specs[BR.SHEETS.VET] = ["ID","OcorrenciaID","NR_PT","VeterinarioID","ObservacaoClinica","Diagnostico","Tratamento","Medicamento","Dose","ProximaRevisao","CriadoEm","AtualizadoEm"];
  specs[BR.SHEETS.NECROPSIES] = ["ID","OcorrenciaID","NR_PT","VeterinarioID","DataNecropsia","Resumo","CausaProvavel","Conclusao","Observacoes","CriadoEm","AtualizadoEm"];
  specs[BR.SHEETS.PHOTOS] = ["ID","OcorrenciaID","RondaID","DriveFileID","URL","EnviadoPorID","CriadoEm"];
  specs[BR.SHEETS.SESSIONS] = ["Token","UtilizadorID","ExpiraEm","CriadoEm"];
  specs[BR.SHEETS.AUDIT] = ["ID","UtilizadorID","Entidade","EntidadeID","Acao","AntesJSON","DepoisJSON","DataHora"];

  Object.keys(specs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1,1,1,specs[name].length).setValues([specs[name]]);
    sh.getRange(1,1,1,specs[name].length)
      .setBackground("#173f32").setFontColor("#ffffff").setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1,specs[name].length);
  });

  seedBaseData_();
  createPhotoFolder_();
  SpreadsheetApp.getUi().alert("BoviRonda configurada. Utilizador inicial: admin | PIN: 1234");
}

function seedBaseData_() {
  const farms = sheet_(BR.SHEETS.FARMS);
  if (farms.getLastRow() === 1) {
    append_(farms, [id_(),"Monte Ruivo","MR",true,now_()]);
    append_(farms, [id_(),"Trolho","TR",true,now_()]);
  }

  const users = sheet_(BR.SHEETS.USERS);
  if (users.getLastRow() === 1) {
    const now = now_();
    append_(users,[id_(),"Administrador","admin",hashPin_("1234"),"admin",true,now,now]);
  }
}

function createPhotoFolder_() {
  let id = PropertiesService.getScriptProperties().getProperty(BR.PHOTO_FOLDER_PROP);
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder("BoviRonda_Fotos");
  PropertiesService.getScriptProperties().setProperty(BR.PHOTO_FOLDER_PROP,folder.getId());
  return folder;
}

/* =========================
   AUTH
========================= */

function login_(p) {
  const username = normalize_(p.username);
  const pin = String(p.pin || "");
  if (!username || !pin) throw new Error("Indique utilizador e PIN.");

  const user = rows_(BR.SHEETS.USERS).find(r =>
    normalize_(r.Username) === username &&
    bool_(r.Ativo)
  );
  if (!user || user.PINHash !== hashPin_(pin)) throw new Error("Utilizador ou PIN incorreto.");

  cleanupSessions_();
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g,"");
  const expires = new Date(Date.now() + BR.SESSION_HOURS * 3600000);
  append_(sheet_(BR.SHEETS.SESSIONS),[token,user.ID,expires,now_()]);
  audit_(user.ID,"Sessao",token,"LOGIN",null,{username:user.Username});
  return {token,expiresAt:expires.toISOString(),profile:profileForClient_(user)};
}

function logout_(session) {
  const sh = sheet_(BR.SHEETS.SESSIONS);
  const values = sh.getDataRange().getValues();
  for (let i=values.length-1;i>=1;i--) {
    if (values[i][0] === session.token) sh.deleteRow(i+1);
  }
  return {success:true};
}

function requireSession_(token) {
  if (!token) throw new Error("Sessão inválida.");
  cleanupSessions_();
  const s = rows_(BR.SHEETS.SESSIONS).find(r => r.Token === token);
  if (!s) throw new Error("Sessão expirada. Entre novamente.");
  const user = rowById_(BR.SHEETS.USERS,s.UtilizadorID);
  if (!user || !bool_(user.Ativo)) throw new Error("Utilizador inativo.");
  return {token,user};
}

function cleanupSessions_() {
  const sh=sheet_(BR.SHEETS.SESSIONS), values=sh.getDataRange().getValues(), now=Date.now();
  for(let i=values.length-1;i>=1;i--){
    const expiry=new Date(values[i][2]).getTime();
    if(!expiry || expiry<now) sh.deleteRow(i+1);
  }
}

function profileForClient_(u) {
  return {id:u.ID,fullName:u.Nome,username:u.Username,role:u.Perfil,active:bool_(u.Ativo)};
}

/* =========================
   DASHBOARD / PARKS
========================= */

function dashboard_(session) {
  const parks = listParks_(session);
  const incidents = listIncidents_(session,{status:"open"});
  const farms = rows_(BR.SHEETS.FARMS).filter(f=>bool_(f.Ativo));
  const today = Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");

  return {
    totalParks: parks.length,
    openIncidents: incidents.length,
    farms: farms.map(f => {
      const fp = parks.filter(p=>p.farmId===f.ID);
      const rounds = rows_(BR.SHEETS.ROUNDS).filter(r => fp.some(p=>p.id===r.ParqueID));
      return {
        id:f.ID,name:f.Nome,totalParks:fp.length,
        roundsToday: rounds.filter(r => dateKey_(r.DataHoraFim)===today).length,
        withoutRecentRound: fp.filter(p=>p.daysSinceRound===null || p.daysSinceRound>=3).length,
        openIncidents: incidents.filter(i=>i.farmId===f.ID).length
      };
    })
  };
}

function listParks_(session) {
  const farms = indexBy_(rows_(BR.SHEETS.FARMS),"ID");
  const rounds = rows_(BR.SHEETS.ROUNDS);
  return rows_(BR.SHEETS.PARKS).filter(p=>bool_(p.Ativo)).map(p => {
    const pr = rounds.filter(r=>r.ParqueID===p.ID).sort((a,b)=>new Date(b.DataHoraFim)-new Date(a.DataHoraFim));
    const last = pr[0] || null;
    const user = last ? rowById_(BR.SHEETS.USERS,last.UtilizadorID) : null;
    const lastDate = last ? new Date(last.DataHoraFim) : null;
    return {
      id:p.ID,code:p.Codigo,name:p.Nome||"",farmId:p.ExploracaoID,
      farmName:farms[p.ExploracaoID]?.Nome||"",qrToken:p.QRToken,
      lastRoundAt:lastDate?lastDate.toISOString():null,
      lastRoundUser:user?.Nome||"",
      daysSinceRound:lastDate?Math.floor((Date.now()-lastDate.getTime())/86400000):null,
      water:last?.Agua||null,feed:last?.Comida||null,infrastructure:last?.Infraestrutura||null
    };
  });
}

function listRounds_(session) {
  const parks=indexBy_(listAdminParksForRounds_(),"id");
  const users=indexBy_(rows_(BR.SHEETS.USERS),"ID");
  return rows_(BR.SHEETS.ROUNDS)
    .sort((a,b)=>new Date(b.DataHoraFim||b.CriadoEm)-new Date(a.DataHoraFim||a.CriadoEm))
    .slice(0,5000)
    .map(r=>({
      id:r.ID,
      parkId:r.ParqueID,
      parkCode:parks[r.ParqueID]?.code||"(parque removido)",
      parkName:parks[r.ParqueID]?.name||"",
      farmName:parks[r.ParqueID]?.farmName||"",
      userName:users[r.UtilizadorID]?.Nome||"(utilizador removido)",
      completedAt:r.DataHoraFim||r.CriadoEm,
      completedAtLabel:dateTimeLabel_(r.DataHoraFim||r.CriadoEm),
      water:r.Agua||"ok",
      waterLabel:statusText_(r.Agua||"ok"),
      feed:r.Comida||"ok",
      feedLabel:statusText_(r.Comida||"ok"),
      infrastructure:r.Infraestrutura||"ok",
      infrastructureType:r.TipoInfraestrutura||"",
      photoUrl:roundPhotoUrl_(r),notes:r.Observacoes||""
    }));
}

function listAdminParksForRounds_() {
  const farms=indexBy_(rows_(BR.SHEETS.FARMS),"ID");
  return rows_(BR.SHEETS.PARKS).map(p=>({
    id:p.ID,code:p.Codigo,name:p.Nome||"",farmId:p.ExploracaoID,
    farmName:farms[p.ExploracaoID]?.Nome||"",active:bool_(p.Ativo)
  }));
}

function getPark_(session,p) {
  const parks=listParks_(session), park=parks.find(x=>x.id===p.parkId);
  if(!park) throw new Error("Parque não encontrado.");
  const users=indexBy_(rows_(BR.SHEETS.USERS),"ID");
  const rounds=rows_(BR.SHEETS.ROUNDS).filter(r=>r.ParqueID===park.id).sort((a,b)=>new Date(b.DataHoraFim)-new Date(a.DataHoraFim)).slice(0,30).map(r=>({
    id:r.ID,userName:users[r.UtilizadorID]?.Nome||"",completedAt:r.DataHoraFim,
    completedAtLabel:dateTimeLabel_(r.DataHoraFim),water:r.Agua,waterLabel:statusText_(r.Agua),
    feed:r.Comida,feedLabel:statusText_(r.Comida),photoUrl:roundPhotoUrl_(r),notes:r.Observacoes||""
  }));
  const incidents=listIncidents_(session,{}).filter(i=>i.parkId===park.id);
  return {park,rounds,incidents};
}

function findParkByQr_(session,p) {
  const park=listParks_(session).find(x=>String(x.qrToken)===String(p.qrToken));
  if(!park) throw new Error("Parque não encontrado.");
  return {park};
}

/* =========================
   ROUNDS
========================= */

function createRound_(session,p) {
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try { return createRoundLocked_(session,p); }
  finally { lock.releaseLock(); }
}

function createRoundLocked_(session,p) {
  requireRole_(session,["admin","utilizador","veterinario"]);
  const park=rowById_(BR.SHEETS.PARKS,p.parkId);
  if(!park) throw new Error("Parque inválido.");

  if((bool_(p.animalSick)||bool_(p.animalDead)) && !p.photoDataUrl)
    throw new Error("É obrigatória uma fotografia do brinco para animal doente ou morto.");
  // The client reuses this key for a park when a response is lost.
  const requestId=String(p.requestId||"");
  const roundId=requestId ? "req_"+hashPin_(session.user.ID+":"+park.ID+":"+requestId) : id_();
  const existing=rowById_(BR.SHEETS.ROUNDS,roundId);
  if(existing) return {roundId,incidentsCreated:rows_(BR.SHEETS.INCIDENTS).filter(i=>i.RondaID===roundId).length,alreadyCreated:true};
  const start=now_(), end=now_();
  let photoUrl="", savedPhoto=null;
  if(p.photoDataUrl) { savedPhoto=savePhoto_(p.photoDataUrl,`ronda_${park.Codigo}_${roundId}.jpg`); photoUrl=savedPhoto.url; }

  append_(sheet_(BR.SHEETS.ROUNDS),[
    roundId,park.ID,session.user.ID,start,end,
    p.water||"ok",p.feed||"ok",p.infrastructure||"ok",
    p.infrastructureType||"",p.notes||"",photoUrl,now_()
  ]);

  const photoSheet=SpreadsheetApp.getActive().getSheetByName(BR.SHEETS.PHOTOS);
  if(savedPhoto && photoSheet) {
    const entry={ID:id_(),OcorrenciaID:"",RondaID:roundId,DriveFileID:savedPhoto.id,URL:photoUrl,EnviadoPorID:session.user.ID,CriadoEm:now_()};
    const headers=photoSheet.getRange(1,1,1,photoSheet.getLastColumn()).getValues()[0];
    append_(photoSheet,headers.map(h=>entry[h]===undefined?"":entry[h]));
  }
  let count=0;
  function incident(category,type,status,description){
    createIncidentRow_(roundId,park.ID,session.user.ID,category,type,status,description||p.notes||"",photoUrl);
    count++;
  }
  if(p.water==="sem_agua") incident("operacional","sem_agua","aberta","");
  if(p.water==="problema_bebedouro") incident("operacional","problema_bebedouro","aberta","");
  if(p.feed==="sem_comida") incident("operacional","sem_comida","aberta","");
  if(p.feed==="insuficiente") incident("operacional","comida_insuficiente","aberta","");
  if(p.infrastructure==="problema") incident("operacional",infraTypeToIncident_(p.infrastructureType),"aberta",p.infrastructureType||"Problema de infraestrutura");
  if(bool_(p.animalSick)) incident("veterinaria","animal_doente","por_observar","");
  if(bool_(p.animalDead)) incident("veterinaria","animal_morto","por_observar","");

  audit_(session.user.ID,"Ronda",roundId,"CREATE",null,p);
  try { processNotificationsLocked_(); } catch(error) { console.error(error); }
  return {roundId,incidentsCreated:count};
}

function createIncidentRow_(roundId,parkId,userId,category,type,status,description,photoUrl) {
  const id=id_();
  append_(sheet_(BR.SHEETS.INCIDENTS),[
    id,roundId,parkId,userId,category,type,status,description||"",photoUrl||"",
    now_(),"","","",now_()
  ]);
  return id;
}

/* =========================
   INCIDENTS
========================= */

function listIncidents_(session,p) {
  const parks=indexBy_(listParks_(session),"id");
  const users=indexBy_(rows_(BR.SHEETS.USERS),"ID");
  let list=rows_(BR.SHEETS.INCIDENTS);
  if(p && p.status==="open") list=list.filter(i=>i.Estado!=="resolvida");
  return list.sort((a,b)=>new Date(b.ReportadoEm)-new Date(a.ReportadoEm)).map(i=>({
    id:i.ID,roundId:i.RondaID,parkId:i.ParqueID,reportedById:i.ReportadoPorID,
    category:i.Categoria,type:i.Tipo,typeLabel:incidentTypeText_(i.Tipo),status:i.Estado,statusLabel:statusText_(i.Estado),
    description:i.Descricao||"",photoUrl:incidentPhotoUrl_(i),reportedAt:i.ReportadoEm,
    reportedAtLabel:dateTimeLabel_(i.ReportadoEm),reportedByName:users[i.ReportadoPorID]?.Nome||"",
    parkCode:parks[i.ParqueID]?.code||"",farmId:parks[i.ParqueID]?.farmId||"",farmName:parks[i.ParqueID]?.farmName||""
  }));
}

function getIncident_(session,p) {
  const incident=listIncidents_(session,{}).find(i=>i.id===p.incidentId);
  if(!incident) throw new Error("Ocorrência não encontrada.");

  if(incident.category==="veterinaria") requireRole_(session,["admin","veterinario","chefia","utilizador"]);
  const veterinary=rows_(BR.SHEETS.VET).find(v=>v.OcorrenciaID===incident.id);
  const necropsy=rows_(BR.SHEETS.NECROPSIES).find(n=>n.OcorrenciaID===incident.id);
  return {
    incident,
    veterinary:veterinary ? {
      photoUrl:incident.photoUrl,id:veterinary.ID,nrPt:veterinary.NR_PT||"",veterinarianId:veterinary.VeterinarioID||"",
      clinicalObservation:veterinary.ObservacaoClinica||"",diagnosis:veterinary.Diagnostico||"",
      treatment:veterinary.Tratamento||"",medication:veterinary.Medicamento||"",dosage:veterinary.Dose||""
    } : null,
    necropsy:necropsy ? {
      photoUrl:incident.photoUrl,id:necropsy.ID,nrPt:necropsy.NR_PT||"",summary:necropsy.Resumo||"",
      probableCause:necropsy.CausaProvavel||"",conclusion:necropsy.Conclusao||""
    } : null
  };
}

function updateVeterinaryCase_(session,p) {
  requireRole_(session,["admin","veterinario"]);

  const incidentRow=findRow_(BR.SHEETS.INCIDENTS,"ID",p.incidentId);
  if(!incidentRow) throw new Error("Ocorrência não encontrada.");
  const incident=incidentRow.object;
  if(incident.Categoria!=="veterinaria") throw new Error("Esta não é uma ocorrência veterinária.");

  if(incident.Tipo==="animal_morto" && !String(p.necropsySummary||"").trim())
    throw new Error("O resumo da necrópsia é obrigatório.");
  upsertVet_(session,p);
  if(incident.Tipo==="animal_morto") {
    upsertNecropsy_(session,p);
  }
  updateCells_(BR.SHEETS.INCIDENTS,incidentRow.row,{
    Estado:p.status||incident.Estado,
    ResolvidoEm:(p.status==="resolvida"?now_():""),
    ResolvidoPorID:(p.status==="resolvida"?session.user.ID:""),
    AtualizadoEm:now_()
  });
  audit_(session.user.ID,"Ocorrencia",incident.ID,"VET_UPDATE",incident,p);
  return {success:true};
}

function upsertVet_(session,p) {
  const found=findRow_(BR.SHEETS.VET,"OcorrenciaID",p.incidentId);
  const values={
    VeterinarioID:session.user.ID,ObservacaoClinica:p.clinicalObservation||"",
    Diagnostico:p.diagnosis||"",Tratamento:p.treatment||"",Medicamento:p.medication||"",
    Dose:p.dosage||"",AtualizadoEm:now_()
  };
  if(found) updateCells_(BR.SHEETS.VET,found.row,values);
  else append_(sheet_(BR.SHEETS.VET),[
    id_(),p.incidentId,"",session.user.ID,p.clinicalObservation||"",p.diagnosis||"",
    p.treatment||"",p.medication||"",p.dosage||"","",now_(),now_()
  ]);
}

function upsertNecropsy_(session,p) {
  const found=findRow_(BR.SHEETS.NECROPSIES,"OcorrenciaID",p.incidentId);
  const values={
    VeterinarioID:session.user.ID,DataNecropsia:now_(),Resumo:p.necropsySummary||"",
    CausaProvavel:p.probableCause||"",Conclusao:p.conclusion||"",AtualizadoEm:now_()
  };
  if(found) updateCells_(BR.SHEETS.NECROPSIES,found.row,values);
  else append_(sheet_(BR.SHEETS.NECROPSIES),[
    id_(),p.incidentId,"",session.user.ID,now_(),p.necropsySummary||"",
    p.probableCause||"",p.conclusion||"","",now_(),now_()
  ]);
}

// Close selected records without modifying clinical data or previous resolution notes.
function resolveIncidentsBulk_(session,p) {
  requireRole_(session,["admin","chefia","veterinario"]);
  if(!Array.isArray(p.incidentIds) || !p.incidentIds.length || p.incidentIds.length>50 ||
     p.incidentIds.some(id=>typeof id!=="string" || !id.trim()))
    throw new Error("Selecione entre 1 e 50 ocorrências por pedido.");
  const ids=[...new Set(p.incidentIds)], note=String(p.note||"").trim();
  if(note.length>2000) throw new Error("A nota deve ter no máximo 2000 caracteres.");
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) throw new Error("Existe outra gravação em curso. Tente novamente.");
  try {
    const sh=sheet_(BR.SHEETS.INCIDENTS), data=sh.getDataRange().getValues(), headers=data[0].map(String);
    ["ID","ParqueID","Categoria","Tipo","Estado","NotaResolucao","ResolvidoEm","ResolvidoPorID","AtualizadoEm"].forEach(h=>{
      if(!headers.includes(h)) throw new Error("Falta a coluna "+h+" em Ocorrencias. Não execute setupBoviRonda.");
    });
    const records={};
    data.slice(1).forEach((row,index)=>{
      const object={};headers.forEach((h,col)=>object[h]=row[col]);
      if(object.ID) records[String(object.ID)]={row:index+2,object};
    });
    const parks=new Set(listParks_(session).map(p=>String(p.id)));
    // Load clinical rows only if they are needed for this batch.
    const needsVet=ids.some(id=>records[id]?.object.Categoria==="veterinaria" && ["admin","veterinario"].includes(session.user.Perfil));
    const vets=needsVet ? rows_(BR.SHEETS.VET) : [];
    const necropsies=needsVet ? rows_(BR.SHEETS.NECROPSIES) : [];
    const result={resolved:[],alreadyResolved:[],failed:[],warnings:[]};
    ids.forEach(id=>{
      try {
        const found=records[id], incident=found?.object;
        if(!incident || !parks.has(String(incident.ParqueID))) throw new Error("Ocorrência não encontrada ou sem acesso ao parque.");
        const allowed=incident.Categoria==="operacional" ? ["admin","chefia"] : incident.Categoria==="veterinaria" ? ["admin","veterinario"] : [];
        if(!allowed.includes(session.user.Perfil)) throw new Error("O seu perfil não pode resolver esta ocorrência.");
        if(incident.Estado==="resolvida") { result.alreadyResolved.push(id); return; }
        if(incident.Categoria==="veterinaria") {
          if(incident.Tipo==="animal_morto" && !necropsies.some(n=>String(n.OcorrenciaID)===id && String(n.Resumo||"").trim()))
            throw new Error("Complete primeiro o resumo da necrópsia.");
        }
        const now=now_(), previousNote=String(incident.NotaResolucao||"");
        const combined=note && previousNote!==note && !previousNote.endsWith("\n"+note) ? [previousNote,note].filter(Boolean).join("\n") : previousNote;
        updateCells_(BR.SHEETS.INCIDENTS,found.row,{
          NotaResolucao:combined,ResolvidoEm:now,ResolvidoPorID:session.user.ID,AtualizadoEm:now,Estado:"resolvida"
        });
        result.resolved.push(id);
        try {
          audit_(session.user.ID,"Ocorrencia",id,"BULK_RESOLVE",incident,{Estado:"resolvida",NotaResolucao:combined,ResolvidoEm:now,ResolvidoPorID:session.user.ID});
        } catch(e) { result.warnings.push({id,message:"Resolvida; não foi possível registar a auditoria: "+e.message}); }
      } catch(e) { result.failed.push({id,message:e.message||String(e)}); }
    });
    return result;
  } finally { lock.releaseLock(); }
}

function updateOperationalIncident_(session,p) {
  requireRole_(session,["admin","chefia"]);
  const found=findRow_(BR.SHEETS.INCIDENTS,"ID",p.incidentId);
  if(!found) throw new Error("Ocorrência não encontrada.");
  if(found.object.Categoria!=="operacional") throw new Error("Ocorrência não operacional.");
  updateCells_(BR.SHEETS.INCIDENTS,found.row,{
    Estado:p.status||found.object.Estado,
    NotaResolucao:p.note||"",
    ResolvidoEm:p.status==="resolvida"?now_():"",
    ResolvidoPorID:p.status==="resolvida"?session.user.ID:"",
    AtualizadoEm:now_()
  });
  audit_(session.user.ID,"Ocorrencia",p.incidentId,"OP_UPDATE",found.object,p);
  return {success:true};
}

/* =========================
   ADMIN
========================= */

function listUsers_(session) {
  requireRole_(session,["admin"]);
  return rows_(BR.SHEETS.USERS).map(profileForClient_);
}

function createUser_(session,p) {
  requireRole_(session,["admin"]);
  const username=normalize_(p.username), role=String(p.role||"utilizador");
  if(!p.fullName || !username || !p.pin) throw new Error("Nome, utilizador e PIN são obrigatórios.");
  if(!BR.ROLES.includes(role)) throw new Error("Perfil inválido.");
  if(rows_(BR.SHEETS.USERS).some(u=>normalize_(u.Username)===username)) throw new Error("Este username já existe.");
  const now=now_(), id=id_();
  append_(sheet_(BR.SHEETS.USERS),[id,p.fullName,username,hashPin_(String(p.pin)),role,true,now,now]);
  audit_(session.user.ID,"Utilizador",id,"CREATE",null,{fullName:p.fullName,username,role});
  return {id};
}

function updateUser_(session,p) {
  requireRole_(session,["admin"]);

  const found = findRow_(BR.SHEETS.USERS,"ID",p.userId);
  if(!found) throw new Error("Utilizador não encontrado.");

  const username = normalize_(p.username);
  const role = String(p.role || found.object.Perfil);
  const fullName = String(p.fullName || "").trim();

  if(!fullName) throw new Error("O nome é obrigatório.");
  if(!username) throw new Error("O username é obrigatório.");
  if(!BR.ROLES.includes(role)) throw new Error("Perfil inválido.");

  const duplicated = rows_(BR.SHEETS.USERS).some(u =>
    normalize_(u.Username) === username &&
    String(u.ID) !== String(p.userId)
  );
  if(duplicated) throw new Error("Já existe outro utilizador com esse username.");

  const before = found.object;
  const update = {
    Nome: fullName,
    Username: username,
    Perfil: role,
    Ativo: p.active !== false,
    AtualizadoEm: now_()
  };

  const newPin = String(p.pin || "").trim();
  if(newPin) {
    if(!/^\d{4,8}$/.test(newPin)) throw new Error("O PIN deve ter entre 4 e 8 dígitos.");
    update.PINHash = hashPin_(newPin);
  }

  updateCells_(BR.SHEETS.USERS,found.row,update);

  audit_(session.user.ID,"Utilizador",p.userId,"UPDATE",before,{
    fullName,
    username,
    role,
    active:p.active !== false,
    pinChanged:!!newPin
  });

  return {success:true};
}


function bulkCreateParks_(session,p) {
  requireRole_(session,["admin"]);

  const items = Array.isArray(p.items) ? p.items : [];
  if(!items.length) throw new Error("Não foram enviados parques para importar.");
  if(items.length > 500) throw new Error("Máximo de 500 parques por importação.");

  const farms = rows_(BR.SHEETS.FARMS).filter(f=>bool_(f.Ativo));
  const farmByName = {};
  farms.forEach(f=>{
    farmByName[normalize_(f.Nome)] = f;
    farmByName[normalize_(f.Codigo)] = f;
  });

  let created = 0;
  let skipped = 0;
  const errors = [];
  const parksSh = sheet_(BR.SHEETS.PARKS);
  const existing = rows_(BR.SHEETS.PARKS);
  const counters = {};

  farms.forEach(f=>{
    const prefix = String(f.Codigo||"").trim().toUpperCase();
    const nums = existing
      .map(x=>String(x.Codigo||"").trim().toUpperCase())
      .filter(c=>c.indexOf(prefix+"-")===0)
      .map(c=>parseInt(c.split("-")[1],10))
      .filter(n=>!isNaN(n));
    counters[prefix] = nums.length ? Math.max.apply(null,nums) : 0;
  });

  items.forEach((item,index)=>{
    const lineLabel = `Linha ${index+1}`;
    try {
      const farmName = String(item.farmName||"").trim();
      const name = String(item.name||"").trim();

      if(!farmName) {
        skipped++;
        errors.push({line:lineLabel,error:"Exploração em falta"});
        return;
      }

      const farm = farmByName[normalize_(farmName)];
      if(!farm) {
        skipped++;
        errors.push({line:lineLabel,error:`Exploração inválida: ${farmName}`});
        return;
      }

      const prefix = String(farm.Codigo||"").trim().toUpperCase();
      counters[prefix] = (counters[prefix] || 0) + 1;
      const code = prefix + "-" + ("000" + counters[prefix]).slice(-3);

      const id = id_();
      const token = Utilities.getUuid();
      const now = now_();

      append_(parksSh,[id,code,name,farm.ID,token,true,now,now]);

      audit_(session.user.ID,"Parque",id,"BULK_CREATE",null,{
        code,name,farmName:farm.Nome,qrToken:token
      });

      created++;
    } catch(err) {
      skipped++;
      errors.push({line:lineLabel,error:err.message||String(err)});
    }
  });

  return {created,skipped,errors};
}

function createPark_(session,p) {
  requireRole_(session,["admin"]);
  const farm=rows_(BR.SHEETS.FARMS).find(f=>f.Nome===p.farmName && bool_(f.Ativo));
  if(!farm) throw new Error("Exploração inválida.");

  const code=nextParkCode_(farm.Codigo);
  const id=id_(), token=Utilities.getUuid(), now=now_();

  append_(sheet_(BR.SHEETS.PARKS),[
    id,code,p.name||"",farm.ID,token,true,now,now
  ]);

  audit_(session.user.ID,"Parque",id,"CREATE",null,{
    code,name:p.name||"",farmName:p.farmName,qrToken:token
  });

  return {id,code,qrToken:token};
}

function listAdminParks_(session) {
  requireRole_(session,["admin"]);
  const farms=indexBy_(rows_(BR.SHEETS.FARMS),"ID");
  return rows_(BR.SHEETS.PARKS).map(p=>({
    id:p.ID,
    code:p.Codigo,
    name:p.Nome||"",
    farmId:p.ExploracaoID,
    farmName:farms[p.ExploracaoID]?.Nome||"",
    qrToken:p.QRToken,
    active:bool_(p.Ativo)
  })).sort((a,b)=>a.farmName.localeCompare(b.farmName)||a.code.localeCompare(b.code));
}

function updatePark_(session,p) {
  requireRole_(session,["admin"]);
  const found=findRow_(BR.SHEETS.PARKS,"ID",p.parkId);
  if(!found) throw new Error("Parque não encontrado.");

  const name=String(p.name||"").trim();
  const farm=rows_(BR.SHEETS.FARMS).find(f=>f.Nome===p.farmName && bool_(f.Ativo));
  if(!farm) throw new Error("Exploração inválida.");

  const before=found.object;
  updateCells_(BR.SHEETS.PARKS,found.row,{
    Nome:name,
    ExploracaoID:farm.ID,
    Ativo:p.active!==false,
    AtualizadoEm:now_()
  });

  audit_(session.user.ID,"Parque",p.parkId,"UPDATE",before,{
    code:found.object.Codigo,name,farmName:p.farmName,active:p.active!==false
  });
  return {success:true};
}

function deletePark_(session,p) {
  requireRole_(session,["admin"]);
  const found=findRow_(BR.SHEETS.PARKS,"ID",p.parkId);
  if(!found) throw new Error("Parque não encontrado.");

  const hasRounds=rows_(BR.SHEETS.ROUNDS).some(r=>String(r.ParqueID)===String(p.parkId));
  const hasIncidents=rows_(BR.SHEETS.INCIDENTS).some(i=>String(i.ParqueID)===String(p.parkId));

  if(hasRounds || hasIncidents) {
    throw new Error("Este parque já tem histórico. Não pode ser eliminado; coloque-o como indisponível.");
  }

  audit_(session.user.ID,"Parque",p.parkId,"DELETE",found.object,null);
  sheet_(BR.SHEETS.PARKS).deleteRow(found.row);
  return {success:true};
}

function listAdminRecords_(session) {
  requireRole_(session,["admin"]);

  const adminParks=listAdminParks_(session);
  const parks=indexBy_(adminParks,"id");
  const users=indexBy_(rows_(BR.SHEETS.USERS),"ID");
  const incidentRows=rows_(BR.SHEETS.INCIDENTS);

  const rounds=rows_(BR.SHEETS.ROUNDS)
    .sort((a,b)=>new Date(b.DataHoraFim||b.CriadoEm)-new Date(a.DataHoraFim||a.CriadoEm))
    .map(r=>({
      id:r.ID,
      parkId:r.ParqueID,
      parkCode:parks[r.ParqueID]?.code||"(parque removido)",
      farmName:parks[r.ParqueID]?.farmName||"",
      userName:users[r.UtilizadorID]?.Nome||"(utilizador removido)",
      completedAt:r.DataHoraFim||r.CriadoEm,
      completedAtLabel:dateTimeLabel_(r.DataHoraFim||r.CriadoEm),
      water:r.Agua||"ok",
      waterLabel:statusText_(r.Agua||"ok"),
      feed:r.Comida||"ok",
      feedLabel:statusText_(r.Comida||"ok"),
      infrastructure:r.Infraestrutura||"ok",
      infrastructureType:r.TipoInfraestrutura||"",
      photoUrl:roundPhotoUrl_(r),notes:r.Observacoes||""
    }));

  const incidents=incidentRows
    .sort((a,b)=>new Date(b.ReportadoEm||b.AtualizadoEm)-new Date(a.ReportadoEm||a.AtualizadoEm))
    .map(i=>({
      id:i.ID,
      roundId:i.RondaID||"",
      parkId:i.ParqueID,
      reportedById:i.ReportadoPorID,
      category:i.Categoria,
      type:i.Tipo,
      typeLabel:incidentTypeText_(i.Tipo),
      status:i.Estado,
      statusLabel:statusText_(i.Estado),
      description:i.Descricao||"",
      resolutionNote:i.NotaResolucao||"",
      photoUrl:incidentPhotoUrl_(i),
      reportedAt:i.ReportadoEm||i.AtualizadoEm,
      reportedAtLabel:dateTimeLabel_(i.ReportadoEm||i.AtualizadoEm),
      reportedByName:users[i.ReportadoPorID]?.Nome||"(utilizador removido)",
      parkCode:parks[i.ParqueID]?.code||"(parque removido)",
      farmId:parks[i.ParqueID]?.farmId||"",
      farmName:parks[i.ParqueID]?.farmName||""
    }));

  return {rounds,incidents};
}

function updateRoundAdmin_(session,p) {
  requireRole_(session,["admin"]);
  const found=findRow_(BR.SHEETS.ROUNDS,"ID",p.roundId);
  if(!found) throw new Error("Ronda não encontrada.");

  const before=found.object;
  updateCells_(BR.SHEETS.ROUNDS,found.row,{
    Agua:p.water||found.object.Agua,
    Comida:p.feed||found.object.Comida,
    Infraestrutura:p.infrastructure||found.object.Infraestrutura,
    TipoInfraestrutura:p.infrastructureType||"",
    Observacoes:p.notes||""
  });

  audit_(session.user.ID,"Ronda",p.roundId,"ADMIN_CORRECTION",before,p);
  return {success:true};
}

function deleteRoundAdmin_(session,p) {
  requireRole_(session,["admin"]);

  const found=findRow_(BR.SHEETS.ROUNDS,"ID",p.roundId);
  if(!found) throw new Error("Ronda não encontrada.");

  const linked=rows_(BR.SHEETS.INCIDENTS)
    .filter(i=>String(i.RondaID)===String(p.roundId));

  linked.forEach(i=>deleteIncidentCascade_(session,i.ID,false));

  // Remove também referências de fotos diretamente ligadas à ronda.
  deleteRowsByValue_(BR.SHEETS.PHOTOS,"RondaID",p.roundId);

  audit_(session.user.ID,"Ronda",p.roundId,"DELETE",found.object,null);
  sheet_(BR.SHEETS.ROUNDS).deleteRow(found.row);

  return {success:true};
}

function updateIncidentAdmin_(session,p) {
  requireRole_(session,["admin"]);
  const found=findRow_(BR.SHEETS.INCIDENTS,"ID",p.incidentId);
  if(!found) throw new Error("Ocorrência não encontrada.");

  const before=found.object;
  const resolved=p.status==="resolvida";

  updateCells_(BR.SHEETS.INCIDENTS,found.row,{
    Estado:p.status||found.object.Estado,
    Descricao:p.description||"",
    NotaResolucao:p.resolutionNote||"",
    ResolvidoEm:resolved?now_():"",
    ResolvidoPorID:resolved?session.user.ID:"",
    AtualizadoEm:now_()
  });

  audit_(session.user.ID,"Ocorrencia",p.incidentId,"ADMIN_CORRECTION",before,p);
  return {success:true};
}

function deleteIncidentAdmin_(session,p) {
  requireRole_(session,["admin"]);
  return deleteIncidentCascade_(session,p.incidentId,true);
}

function deleteIncidentCascade_(session,incidentId,writeAudit) {
  const incident=findRow_(BR.SHEETS.INCIDENTS,"ID",incidentId);
  if(!incident) {
    if(writeAudit) throw new Error("Ocorrência não encontrada.");
    return {success:true};
  }

  deleteRowsByValue_(BR.SHEETS.VET,"OcorrenciaID",incidentId);
  deleteRowsByValue_(BR.SHEETS.NECROPSIES,"OcorrenciaID",incidentId);
  deleteRowsByValue_(BR.SHEETS.PHOTOS,"OcorrenciaID",incidentId);

  if(writeAudit!==false) {
    audit_(session.user.ID,"Ocorrencia",incidentId,"DELETE",incident.object,null);
  }

  sheet_(BR.SHEETS.INCIDENTS).deleteRow(incident.row);
  return {success:true};
}

function deleteRowsByValue_(sheetName,key,value) {
  const sh=sheet_(sheetName);
  const data=sh.getDataRange().getValues();
  if(data.length<2) return;
  const headers=data[0].map(String);
  const idx=headers.indexOf(key);
  if(idx<0) return;
  for(let i=data.length-1;i>=1;i--) {
    if(String(data[i][idx])===String(value)) sh.deleteRow(i+1);
  }
}



/* =========================
   DRIVE
========================= */

// Only raster formats that browsers can display; SVG is deliberately excluded.
const PHOTO_MIMES_ = ["image/jpeg","image/png","image/webp","image/gif"];
function photoId_(value) {
  const text=String(value||"").trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(text)) return text;
  if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com|lh3\.googleusercontent\.com)\//i.test(text)) return "";
  const m=text.match(/\/d\/([A-Za-z0-9_-]+)/) || text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}
function photoUrl_(id,key) {
  return "https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w1600"+(key?"&resourcekey="+encodeURIComponent(key):"");
}
function photoFile_(id,key) {
  return key ? DriveApp.getFileByIdAndResourceKey(id,key) : DriveApp.getFileById(id);
}
function photoKey_(value) {
  const m=String(value||"").match(/[?&]resourcekey=([^&#]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}
function sharePhoto_(file) {
  // Workspace may prohibit public links. Authenticated getPhoto remains available.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW); return "partilha por ligação ativa"; }
  catch(e) { return "partilha pública bloqueada: "+e.message+"; usar sessão da app"; }
}
function savePhoto_(dataUrl,name) {
  const m=String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!m || !PHOTO_MIMES_.includes(m[1])) throw new Error("Fotografia inválida. Use JPEG, PNG, WebP ou GIF.");
  const bytes=Utilities.base64Decode(m[2]);
  if(!bytes.length || bytes.length>12*1024*1024) throw new Error("Fotografia vazia ou superior a 12 MB.");
  const file=createPhotoFolder_().createFile(Utilities.newBlob(bytes,m[1],name));
  const sharing=sharePhoto_(file);
  return {id:file.getId(),url:photoUrl_(file.getId(),file.getResourceKey()),sharing};
}
let photoIndexCache_;
function photoIndex_() {
  if(photoIndexCache_) return photoIndexCache_;
  const index={rounds:{},incidents:{}};
  const sh=SpreadsheetApp.getActive().getSheetByName(BR.SHEETS.PHOTOS);
  if(sh) rows_(BR.SHEETS.PHOTOS).forEach(p=>{
    const url=photoId_(p.URL) ? p.URL : (photoId_(p.DriveFileID)?photoUrl_(p.DriveFileID):"");
    if(url && p.RondaID && !index.rounds[p.RondaID]) index.rounds[p.RondaID]=url;
    if(url && p.OcorrenciaID && !index.incidents[p.OcorrenciaID]) index.incidents[p.OcorrenciaID]=url;
  });
  rows_(BR.SHEETS.ROUNDS).forEach(r=>{if(r.FotoURL) index.rounds[r.ID]=r.FotoURL;});
  photoIndexCache_=index;
  return index;
}
function roundPhotoUrl_(r) { return r.FotoURL||photoIndex_().rounds[r.ID]||""; }
function incidentPhotoUrl_(r) { return r.FotoURL||photoIndex_().incidents[r.ID]||photoIndex_().rounds[r.RondaID]||""; }
function getPhoto_(session,p) {
  const id=photoId_(p.fileId);
  if(!id) throw new Error("Identificador de fotografia inválido.");
  // Authorize against records visible to this session, never arbitrary owner Drive IDs.
  const parks=new Set(listParks_(session).map(x=>String(x.id)));
  const rounds=rows_(BR.SHEETS.ROUNDS).filter(r=>parks.has(String(r.ParqueID)));
  const incidents=rows_(BR.SHEETS.INCIDENTS).filter(r=>parks.has(String(r.ParqueID)));
  let ref=rounds.concat(incidents).find(r=>photoId_(r.FotoURL)===id);
  let url=ref ? ref.FotoURL : "";
  const photosSh=SpreadsheetApp.getActive().getSheetByName(BR.SHEETS.PHOTOS);
  if(!ref && photosSh) {
    const rids=new Set(rounds.map(r=>String(r.ID))), iids=new Set(incidents.map(r=>String(r.ID)));
    ref=rows_(BR.SHEETS.PHOTOS).find(r=>(photoId_(r.URL)===id||String(r.DriveFileID)===id) && (rids.has(String(r.RondaID))||iids.has(String(r.OcorrenciaID))));
    if(ref) url=ref.URL;
  }
  if(!ref) throw new Error("Sem acesso à fotografia deste registo.");
  const file=photoFile_(id,photoKey_(url));
  const mime=file.getMimeType();
  if(!PHOTO_MIMES_.includes(mime)) throw new Error("Formato de fotografia não suportado.");
  if(file.getSize()>12*1024*1024) throw new Error("Fotografia superior a 12 MB. Abra no Drive.");
  return {mime,base64:Utilities.base64Encode(file.getBlob().getBytes())};
}

// Execute ONLY this public entry point once from the Apps Script editor.
// Scheduled batches continue automatically; the cursor survives timeouts/retries.
function repararFotosBoviRonda() {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const props=PropertiesService.getScriptProperties();
    if(!props.getProperty("BR_PHOTO_REPAIR")) {
      const ss=SpreadsheetApp.getActive();
      const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyyMMdd_HHmmss");
      ["Rondas","Ocorrencias","Fotos"].forEach(n=>{
        const sh=ss.getSheetByName(n);
        if(sh) sh.copyTo(ss).setName("BackupFoto_"+stamp+"_"+n);
      });
      const log=ss.insertSheet("ReparacaoFotos_"+stamp);
      log.appendRow(["Data","Folha","Linha","Coluna","Antes","Depois","Estado"]);
      props.setProperty("BR_PHOTO_REPAIR",JSON.stringify({sheet:0,row:2,log:log.getName(),done:false}));
    }
    const job=JSON.parse(props.getProperty("BR_PHOTO_REPAIR"));
    if(job.done) { console.log("Reparação já concluída. Consulte "+job.log); return; }
    if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==="continuarReparacaoFotosBoviRonda"))
      ScriptApp.newTrigger("continuarReparacaoFotosBoviRonda").timeBased().everyMinutes(5).create();
  } finally { lock.releaseLock(); }
  continuarReparacaoFotosBoviRonda();
}
function continuarReparacaoFotosBoviRonda() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(1000)) return;
  try {
    const props=PropertiesService.getScriptProperties(), raw=props.getProperty("BR_PHOTO_REPAIR");
    if(!raw) return;
    const job=JSON.parse(raw), ss=SpreadsheetApp.getActive(), started=Date.now(), memo={};
    const log=ss.getSheetByName(job.log);
    const names=["Rondas","Ocorrencias","Fotos"];
    while(!job.done && Date.now()-started<200000) {
      const name=names[job.sheet], sh=ss.getSheetByName(name);
      if(!sh || job.row>sh.getLastRow()) {
        job.sheet++; job.row=2; job.done=job.sheet>=names.length;
        props.setProperty("BR_PHOTO_REPAIR",JSON.stringify(job)); continue;
      }
      const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
      const row=sh.getRange(job.row,1,1,headers.length).getValues()[0];
      const fid=headers.indexOf("DriveFileID");
      headers.forEach((h,col)=>{
        if(!(h==="FotoURL" || (name==="Fotos" && h==="URL"))) return;
        const cell=sh.getRange(job.row,col+1), before=row[col];
        const rich=cell.getRichTextValue();
        const record={}; headers.forEach((key,i)=>record[key]=row[i]);
        const source=(rich&&rich.getLinkUrl())||before||(name==="Rondas"?roundPhotoUrl_(record):name==="Ocorrencias"?incidentPhotoUrl_(record):"");
        const id=photoId_(source)||(fid>=0?photoId_(row[fid]):"");
        if(!id) { if(before) log.appendRow([new Date(),name,job.row,h,String(before),"","Não reconhecido; preservado"]); return; }
        if(cell.getFormula()) { log.appendRow([new Date(),name,job.row,h,String(before),"","Fórmula preservada; rever manualmente"]); return; }
        try {
          if(!memo[id]) {
            const file=photoFile_(id,photoKey_(source));
            if(!PHOTO_MIMES_.includes(file.getMimeType())) throw new Error("Formato não suportado");
            memo[id]={url:photoUrl_(id,file.getResourceKey()),status:sharePhoto_(file)};
          }
          const result=memo[id];
          if(String(before)!==result.url) cell.setValue(result.url);
          log.appendRow([new Date(),name,job.row,h,String(before),result.url,result.status]);
        } catch(e) { log.appendRow([new Date(),name,job.row,h,String(before),"","Erro; preservado: "+e.message]); }
      });
      job.row++;
      props.setProperty("BR_PHOTO_REPAIR",JSON.stringify(job));
    }
    if(job.done) {
      ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="continuarReparacaoFotosBoviRonda").forEach(t=>ScriptApp.deleteTrigger(t));
      log.appendRow([new Date(),"",0,"","","","CONCLUÍDO — verificar eventuais erros acima"]);
    }
    console.log(JSON.stringify(job));
  } finally { lock.releaseLock(); }
}

/* =========================
   HELPERS
========================= */

function sheet_(name) {
  const sh=SpreadsheetApp.getActive().getSheetByName(name);
  if(!sh) throw new Error(`Folha ${name} não encontrada. Execute setupBoviRonda().`);
  return sh;
}

function rows_(name) {
  const sh=sheet_(name), data=sh.getDataRange().getValues();
  if(data.length<2) return [];
  const headers=data[0].map(String);
  return data.slice(1).filter(r=>r.some(v=>v!=="" && v!==null)).map(row=>{
    const o={}; headers.forEach((h,i)=>o[h]=row[i]); return o;
  });
}

function append_(sh,row){sh.appendRow(row)}
function id_(){return Utilities.getUuid()}
function now_(){return new Date()}
function normalize_(s){return String(s||"").trim().toLowerCase()}
function bool_(v){return v===true || String(v).toLowerCase()==="true" || v===1}
function hashPin_(pin){
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(pin),Utilities.Charset.UTF_8);
  return digest.map(b=>(b+256)%256).map(b=>("0"+b.toString(16)).slice(-2)).join("");
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
function indexBy_(arr,key){return arr.reduce((a,x)=>(a[x[key]]=x,a),{})}
function rowById_(sheetName,id){return rows_(sheetName).find(r=>String(r.ID)===String(id))}
function requireRole_(session,roles){if(!roles.includes(session.user.Perfil))throw new Error("Sem permissão para esta operação.");}
function dateKey_(d){return d?Utilities.formatDate(new Date(d),Session.getScriptTimeZone(),"yyyy-MM-dd"):""}
function dateTimeLabel_(d){return d?Utilities.formatDate(new Date(d),Session.getScriptTimeZone(),"dd/MM/yyyy HH:mm"):""}
function statusText_(s){
  const m={ok:"OK",sem_agua:"Sem água",problema_bebedouro:"Problema no bebedouro",sem_comida:"Sem comida",
  insuficiente:"Insuficiente",problema:"Problema",aberta:"Aberta",em_resolucao:"Em resolução",
  por_observar:"Por observar",em_tratamento:"Em tratamento",em_acompanhamento:"Em acompanhamento",resolvida:"Resolvida"};
  return m[s]||String(s||"");
}
function incidentTypeText_(t){
  const m={sem_agua:"Sem água",problema_bebedouro:"Problema no bebedouro",sem_comida:"Sem comida",
  comida_insuficiente:"Comida insuficiente",problema_vedacao:"Problema na vedação",problema_portao:"Problema no portão",
  problema_comedouro:"Problema no comedouro",problema_infraestrutura:"Problema de infraestrutura",
  animal_doente:"Animal doente",animal_morto:"Animal morto"};
  return m[t]||t;
}
function nextParkCode_(farmCode) {
  const prefix=String(farmCode||"").trim().toUpperCase();
  const nums=rows_(BR.SHEETS.PARKS)
    .map(p=>String(p.Codigo||"").toUpperCase())
    .filter(c=>c.indexOf(prefix+"-")===0)
    .map(c=>parseInt(c.split("-")[1],10))
    .filter(n=>!isNaN(n));
  const next=(nums.length?Math.max.apply(null,nums):0)+1;
  return prefix+"-"+("000"+next).slice(-3);
}

function infraTypeToIncident_(t){
  const n=normalize_(t);
  if(n==="vedação"||n==="vedacao")return"problema_vedacao";
  if(n==="portão"||n==="portao")return"problema_portao";
  if(n==="comedouro")return"problema_comedouro";
  if(n==="bebedouro")return"problema_bebedouro";
  return"problema_infraestrutura";
}
function findRow_(sheetName,key,value){
  const sh=sheet_(sheetName),data=sh.getDataRange().getValues(),headers=data[0].map(String),idx=headers.indexOf(key);
  for(let i=1;i<data.length;i++)if(String(data[i][idx])===String(value)){
    const o={};headers.forEach((h,j)=>o[h]=data[i][j]);return{row:i+1,object:o,headers};
  }
  return null;
}
function updateCells_(sheetName,rowNum,values){
  const sh=sheet_(sheetName),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  Object.keys(values).forEach(k=>{const idx=headers.indexOf(k);if(idx>=0)sh.getRange(rowNum,idx+1).setValue(values[k])});
}
function audit_(userId,entity,entityId,action,before,after){
  append_(sheet_(BR.SHEETS.AUDIT),[id_(),userId||"",entity,entityId||"",action,JSON.stringify(before||{}),JSON.stringify(after||{}),now_()]);
}









/* Notification settings are script properties: no setup or existing-sheet reset. */
function notificationRecipients_(value) {
  const emails=String(value||"").split(/[,;]/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  emails.forEach(email=>{if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error("Email inválido: "+email);});
  return [...new Set(emails)];
}
function getNotificationSettings_(session) {
  requireRole_(session,["admin"]);
  const props=PropertiesService.getScriptProperties();
  const result={operational:props.getProperty("BR_MAIL_OPERATIONAL")||"",veterinary:props.getProperty("BR_MAIL_VETERINARY")||""};
  const ss=SpreadsheetApp.getActive();
  const sh=ss.getSheetByName("Notificacoes");
  result.uncertain=sh ? rows_("Notificacoes").filter(r=>r.Estado==="a_enviar"||r.Estado==="incerto").map(r=>r.ID) : [];
  return result;
}
function saveNotificationSettings_(session,p) {
  requireRole_(session,["admin"]);
  const operational=notificationRecipients_(p.operational).join(",");
  const veterinary=notificationRecipients_(p.veterinary).join(",");
  // Install the retry worker before reporting success (requires owner authorization).
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==="processBoviRondaNotifications"))
    ScriptApp.newTrigger("processBoviRondaNotifications").timeBased().everyMinutes(5).create();
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const props=PropertiesService.getScriptProperties();
    // Start at configuration time; never email historic incidents unexpectedly.
    if(!props.getProperty("BR_MAIL_START")) props.setProperty("BR_MAIL_START",new Date().toISOString());
    props.setProperties({BR_MAIL_OPERATIONAL:operational,BR_MAIL_VETERINARY:veterinary});
    return {success:true};
  } finally {lock.releaseLock();}
}
function processBoviRondaNotifications() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try {processNotificationsLocked_();} finally {lock.releaseLock();}
}
function processNotificationsLocked_() {
  const props=PropertiesService.getScriptProperties(), start=props.getProperty("BR_MAIL_START");
  if(!start) return;
  const ss=SpreadsheetApp.getActive();
  let sh=ss.getSheetByName("Notificacoes");
  if(!sh) {sh=ss.insertSheet("Notificacoes");sh.appendRow(["ID","Estado","Destinatarios","AtualizadoEm","Erro"]);}
  const delivered=indexBy_(rows_("Notificacoes"),"ID");
  const parks=indexBy_(rows_(BR.SHEETS.PARKS),"ID"),farms=indexBy_(rows_(BR.SHEETS.FARMS),"ID"),users=indexBy_(rows_(BR.SHEETS.USERS),"ID");
  const pending=rows_(BR.SHEETS.INCIDENTS).filter(i=>new Date(i.ReportadoEm)>=new Date(start) && !delivered[i.ID]);
  let processed=0;
  for(const incident of pending) {
    if(processed>=20) break;
    const vet=incident.Tipo==="animal_doente"||incident.Tipo==="animal_morto";
    if(!vet && incident.Categoria!=="operacional") continue;
    const recipients=notificationRecipients_(props.getProperty(vet?"BR_MAIL_VETERINARY":"BR_MAIL_OPERATIONAL"));
    if(!recipients.length || MailApp.getRemainingDailyQuota()<recipients.length) continue;
    const park=parks[incident.ParqueID]||{},farm=farms[park.ExploracaoID]||{},user=users[incident.ReportadoPorID]||{};
    const type=incidentTypeText_(incident.Tipo);
    const body=["Tipo: "+type,"Exploração: "+(farm.Nome||""),"Parque: "+(park.Nome||park.Codigo||""),
      "Data/hora: "+dateTimeLabel_(incident.ReportadoEm),"Registado por: "+(user.Nome||""),
      "Descrição: "+(incident.Descricao||""),"Ocorrência: "+incident.ID];
    if(vet && incident.FotoURL) body.push("Fotografia do brinco: "+incident.FotoURL);
    // Claim durably before send. MailApp has no idempotency key: never retry an ambiguous send.
    sh.appendRow([incident.ID,"a_enviar",recipients.join(","),now_(),""]);
    const row=sh.getLastRow();SpreadsheetApp.flush();
    try {
      MailApp.sendEmail({to:recipients.join(","),subject:"BoviRonda · "+type+" · "+(farm.Nome||"")+" · "+(park.Nome||park.Codigo||""),body:body.join("\n"),name:"BoviRonda"});
      sh.getRange(row,2).setValue("enviado");
    } catch(error) {
      sh.getRange(row,2).setValue("incerto");
      sh.getRange(row,5).setValue(String(error.message||error));
    }
    SpreadsheetApp.flush();processed++;
  }
}
