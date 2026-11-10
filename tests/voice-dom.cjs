// Optional integration test: npm install --no-save jsdom; node tests/voice-dom.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), assert = require('node:assert/strict');
function setup(supported = true) {
  const dom = new JSDOM(`<form id="roundForm"><input type="radio" name="water" value="ok" checked><input type="radio" name="water" value="sem_agua"><input type="radio" name="feed" value="ok" checked><input type="radio" name="feed" value="sem_comida"><input type="radio" name="infra" value="ok" checked><input type="radio" name="infra" value="problema"><select id="infraType"><option></option><option>Vedação</option></select><textarea id="roundNotes">Manual</textarea><input id="animalDead" type="checkbox"><input id="roundPhoto" type="file"><button type="submit">Guardar</button></form>`, {url:'https://example.com',runScripts:'outside-only'});
  const w=dom.window, form=w.document.querySelector('form'); w.isSecureContext=true; w.HTMLElement.prototype.scrollIntoView=function(){};
  let session, saves=0;
  if (supported) w.SpeechRecognition=class {constructor(){session=this;} start(){} stop(){this.onend?.();} abort(){this.aborted=true;}};
  w.eval(fs.readFileSync(require('node:path').join(__dirname,'../voice.js'),'utf8'));
  w.BoviRondaVoice.mount(form, 2);
  form.addEventListener('submit', event=>{event.preventDefault(); saves++;});
  const get=key=>form.querySelector(`[data-voice="${key}"]`), click=key=>get(key).click(), submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,w,form,get,click,submit,session:()=>session,saves:()=>saves};
}
(async()=>{
 let t=setup(); t.submit(); assert.equal(t.saves(),1); // manual path intact
 t.click('start'); assert.equal(t.session().lang,'pt-PT'); t.submit(); assert.equal(t.saves(),1);
 t.session().onresult({results:[{isFinal:true,0:{transcript:'Sem água. Há uma vedação partida. Há um animal morto.'}}]});
 t.click('stop'); t.click('analyse');
 assert.match(t.get('preview').textContent,/todos os 2 parques/); assert.match(t.get('preview').textContent,/animal morto/);
 assert(t.form.querySelector('[name=water][value=ok]').checked); // preview does not mutate form
 t.submit(); assert.equal(t.saves(),1);
 t.click('apply'); assert(t.form.querySelector('[name=water][value=sem_agua]').checked);
 assert.equal(t.form.querySelector('#infraType').value,'Vedação'); assert(!t.form.querySelector('#animalDead').checked);
 assert.match(t.form.querySelector('#roundNotes').value,/^Manual\nSem água/);
 t.submit(); assert.equal(t.saves(),1); t.get('review').checked=true; t.submit(); assert.equal(t.saves(),2);
 t.form.querySelector('#roundNotes').dispatchEvent(new t.w.Event('input',{bubbles:true})); t.submit(); assert.equal(t.saves(),2);
 t.get('text').value='Água ok';t.get('text').dispatchEvent(new t.w.Event('input',{bubbles:true}));t.click('analyse');
 t.get('text').value='Sem comida';t.get('text').dispatchEvent(new t.w.Event('input',{bubbles:true}));assert(t.get('apply').hidden);
 t.click('discard'); t.submit(); assert.equal(t.saves(),2); // applied changes still need confirmation
 t.get('review').checked=true; t.submit(); assert.equal(t.saves(),3);
 t.click('start');const old=t.session();t.form.remove();await new Promise(r=>setTimeout(r,0));assert(old.aborted);assert.equal(old.onresult,null);t.dom.window.close();
 t=setup();t.click('start');t.session().onerror({error:'not-allowed'});assert.match(t.get('status').textContent,/recusada/);t.click('discard');t.submit();assert.equal(t.saves(),1);t.dom.window.close();
 t=setup(false);assert(t.get('start').disabled);t.submit();assert.equal(t.saves(),1);t.dom.window.close();
 console.log('PASS: manual submit, pt-PT capture, review without writes, confirmation, multi-park warning, stale proposals, permission failure, unsupported browser and navigation cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
