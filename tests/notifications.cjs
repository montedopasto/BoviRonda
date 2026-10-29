const fs=require('fs'),vm=require('vm'),assert=require('assert');
const tables={};let serial=0,quota=100,sends=[],props={BR_MAIL_START:'2026-01-01',BR_MAIL_OPERATIONAL:'op@example.com',BR_MAIL_VETERINARY:'vet@example.com'};
function sheet(name){if(!tables[name])throw Error('Missing '+name);return {appendRow:r=>tables[name].push(r),getLastRow:()=>tables[name].length,getDataRange:()=>({getValues:()=>tables[name]}),getRange:(r,c)=>({setValue:v=>{tables[name][r-1][c-1]=v;}})};}
const ctx={console,MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>sends.push(m)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v,setProperties:o=>Object.assign(props,o)})},SpreadsheetApp:{getActive:()=>({getSheetByName:n=>tables[n]?sheet(n):null,insertSheet:n=>{tables[n]=[];return sheet(n)}}),flush:()=>{}},Session:{getScriptTimeZone:()=> 'Europe/Lisbon'},Utilities:{getUuid:()=>String(++serial),formatDate:d=>new Date(d).toISOString(),computeDigest:()=>[1,2,3],DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},tryLock:()=>true})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../Code.gs'),'utf8'),ctx);
ctx.rows_=n=>(tables[n]||[]).map(r=>r);ctx.rowById_=(n,id)=>(tables[n]||[]).find(r=>r.ID===id);ctx.findRow_=(n,k,v)=>{let i=(tables[n]||[]).findIndex(r=>r[k]===v);return i<0?null:{row:i+1,object:tables[n][i]}};ctx.updateCells_=(n,row,v)=>Object.assign(tables[n][row-1],v);ctx.audit_=()=>{};ctx.sheet_=n=>({appendRow:r=>(tables[n]||(tables[n]=[])).push(r)});
assert.equal(ctx.notificationRecipients_(' A@EXAMPLE.com; a@example.com, b@example.org ').join(','),'a@example.com,b@example.org');assert.throws(()=>ctx.notificationRecipients_('bad'));
const admin={user:{ID:'u',Perfil:'admin',Nome:'User'}};assert.throws(()=>ctx.getNotificationSettings_({user:{Perfil:'utilizador'}}));
tables.Parques=[{ID:'p',Nome:'P1',ExploracaoID:'f'}];tables.Exploracoes=[{ID:'f',Nome:'Farm'}];tables.Utilizadores=[{ID:'u',Nome:'User'}];tables.Rondas=[];
assert.throws(()=>ctx.createRound_(admin,{parkId:'p',animalSick:true}),/fotografia/);assert.equal(tables.Rondas.length,0);
tables.Ocorrencias=[{ID:'i',Tipo:'animal_doente',Categoria:'veterinaria',Estado:'por_observar',FotoURL:'photo'}];tables.Veterinaria=[{ID:'v',OcorrenciaID:'i',NR_PT:'PTOLD'}];
ctx.updateVeterinaryCase_(admin,{incidentId:'i',diagnosis:'New'});assert.equal(tables.Veterinaria[0].NR_PT,'PTOLD');assert.equal(tables.Veterinaria[0].Diagnostico,'New');
tables.Ocorrencias[0].Tipo='animal_morto';assert.throws(()=>ctx.updateVeterinaryCase_(admin,{incidentId:'i',diagnosis:'Must not save'}),/resumo/);assert.equal(tables.Veterinaria[0].Diagnostico,'New');
// Notification worker uses its actual sheet reader for its ledger.
const rowsOverride=ctx.rows_;ctx.rows_=n=>n==='Notificacoes'?(tables[n]||[]).slice(1).map(r=>Object.fromEntries(tables[n][0].map((h,i)=>[h,r[i]]))):rowsOverride(n);
tables.Ocorrencias=[{ID:'op',Categoria:'operacional',Tipo:'sem_agua',ParqueID:'p',ReportadoPorID:'u',ReportadoEm:'2026-10-29',Descricao:'D'},{ID:'vet',Categoria:'veterinaria',Tipo:'animal_morto',ParqueID:'p',ReportadoPorID:'u',ReportadoEm:'2026-10-29',FotoURL:'https://photo'}];
ctx.processNotificationsLocked_();ctx.processNotificationsLocked_();assert.equal(sends.length,2);assert.equal(sends[0].to,'op@example.com');assert.equal(sends[1].to,'vet@example.com');assert.match(sends[1].body,/https:\/\/photo/);assert.match(sends[0].body,/Farm/);
tables.Ocorrencias.push({...tables.Ocorrencias[0],ID:'quota'});quota=0;ctx.processNotificationsLocked_();assert.equal(sends.length,2);quota=100;ctx.processNotificationsLocked_();assert.equal(sends.length,3);
tables.Ocorrencias.push({...tables.Ocorrencias[0],ID:'ambiguous'});ctx.MailApp.sendEmail=()=>{throw Error('timeout')};ctx.processNotificationsLocked_();ctx.processNotificationsLocked_();assert.equal(tables.Notificacoes.filter(r=>r[0]==='ambiguous').length,1);assert.equal(tables.Notificacoes.at(-1)[1],'incerto');
console.log('PASS: recipients, admin authorization, required photo before writes, legacy NR_PT preservation, atomic necropsy validation, routing/content, deduplication, quota retry and ambiguous-send handling');

// A lost response followed by retry must not create another round or email.
ctx.hashPin_=value=>require('crypto').createHash('sha256').update(value).digest('hex');
ctx.processNotificationsLocked_=()=>{};
ctx.savePhoto_=()=>({url:'https://photo',id:'photo'});
ctx.append_=(sh,row)=>sh.appendRow(row);
ctx.sheet_=name=>({appendRow:row=>{
 const headers=name==='Rondas'?['ID','ParqueID','UtilizadorID']:['ID','RondaID','ParqueID','ReportadoPorID','Categoria','Tipo'];
 (tables[name]||(tables[name]=[])).push(Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
}});
const request={parkId:'p',requestId:'stable',animalSick:true,photoDataUrl:'data:image/jpeg;base64,AA=='};
const first=ctx.createRound_(admin,request),second=ctx.createRound_(admin,request);
assert.equal(first.roundId,second.roundId);assert.equal(second.alreadyCreated,true);assert.equal(tables.Rondas.length,1);
const source=fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8');
assert(!source.includes('id="nrPt"'));assert(!source.includes('nrPt: document.getElementById'));
assert(source.includes('roundPhoto").required=required'));assert(!source.includes('await createImageBitmap(file)'));
console.log('PASS: stable round retries, NR PT input removal, dynamic photo requirement and older image-decoder fallback');
