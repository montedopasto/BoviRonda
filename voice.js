/* Optional browser voice input. No API, storage or automatic submission. */
(function (root) {
  'use strict';
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  // Whole clauses only: unknown wording and negations never become positive states.
  const rules = [
    ['water', 'ok', /^(?:a )?agua (?:esta )?(?:bem|ok)$/],
    ['water', 'sem_agua', /^(?:sem agua|nao ha agua)$/],
    ['water', 'problema_bebedouro', /^problema (?:no )?bebedouro$/],
    ['feed', 'ok', /^(?:a )?(?:comida|alimentacao) (?:esta )?(?:bem|ok)$/],
    ['feed', 'sem_comida', /^(?:sem comida|nao ha comida)$/],
    ['feed', 'insuficiente', /^(?:a )?(?:comida|alimentacao) (?:esta )?insuficiente$/],
    ['infra', 'problema', /^(?:ha (?:uma? )?)?(vedacao|portao|bebedouro|comedouro) (?:esta )?(?:partid[oa]|avariad[oa])$/]
  ];
  function interpret(text) {
    const candidates = {}, unresolved = [];
    const source = String(text).replace(/(^|[.,;!?\n]\s*)(?:a )?água e (?:a )?comida (?:estão )?(?:bem|ok)(?=[.,;!\n]|$)/gi, '$1Água ok. Comida ok');
    const clauses = source.split(/[.,;!\n]+|\s+mas\s+|\s+e\s+/i).map(s => s.trim()).filter(Boolean);
    for (const clause of clauses) {
      const normalized = normalize(clause);
      const match = rules.find(rule => rule[2].test(normalized));
      if (!match) { unresolved.push(clause); continue; }
      const [field, value, pattern] = match;
      const type = field === 'infra' ? ({vedacao:'Vedação',portao:'Portão',bebedouro:'Bebedouro',comedouro:'Comedouro'})[normalized.match(pattern)[1]] : '';
      (candidates[field] ||= []).push({value, type});
    }
    const fields = {};
    for (const [field, values] of Object.entries(candidates)) {
      if (new Set(values.map(v => v.value + v.type)).size === 1) fields[field] = values[0];
      else unresolved.push(`Informação contraditória: ${field === 'water' ? 'água' : field === 'feed' ? 'alimentação' : 'infraestruturas'}`);
    }
    return {fields, unresolved};
  }
  function mount(form, parkCount) {
    const panel = document.createElement('section');
    panel.className = 'card card-pad';
    panel.innerHTML = `<h3>Registar por voz · experimental</h3>
      <p>Descreva água, comida e ocorrências em frases curtas. Exemplo: “Água está bem. Sem comida. Há uma vedação partida.”</p>
      <p>O reconhecimento usa o serviço do navegador e pode enviar áudio ao respetivo fornecedor; pode precisar de Internet. Só começa ao tocar no botão. O formulário manual continua disponível.</p>
      <button type="button" class="btn btn-outline" data-voice="start">🎤 Falar em português de Portugal</button>
      <button type="button" class="btn btn-outline" data-voice="stop" hidden>Terminar</button>
      <p role="status" aria-live="polite" data-voice="status"></p>
      <div class="field"><label>Transcrição (pode corrigir)<textarea data-voice="text" maxlength="4000"></textarea></label></div>
      <button type="button" class="btn btn-outline" data-voice="analyse">Interpretar e rever</button>
      <div data-voice="preview" role="status"></div>
      <button type="button" class="btn btn-outline" data-voice="apply" hidden>Aplicar proposta ao formulário</button>
      <button type="button" class="btn btn-outline" data-voice="discard">Descartar voz</button>
      <label data-voice="reviewRow" hidden><input type="checkbox" data-voice="review"> Revi todos os campos, ocorrências, fotografia e ${parkCount > 1 ? `os ${parkCount} parques selecionados (os mesmos dados aplicam-se a todos)` : 'o parque selecionado'}. Confirmo os dados antes de guardar.</label>`;
    form.prepend(panel);
    const get = key => panel.querySelector(`[data-voice="${key}"]`);
    const status = message => { get('status').textContent = message; };
    let recognition = null, proposal = null, pending = false, applied = false, disposed = false, timer;
    const Constructor = root.SpeechRecognition || root.webkitSpeechRecognition;
    get('start').disabled = !Constructor || !root.isSecureContext;
    if (get('start').disabled) status('Voz indisponível neste navegador ou ligação. Use o formulário manual ou escreva a transcrição.');
    function invalidate() { proposal = null; get('apply').hidden = true; get('preview').textContent = ''; }
    get('text').addEventListener('input', () => { pending = !!get('text').value.trim(); invalidate(); });
    function stop(abort) {
      clearTimeout(timer);
      if (recognition) { const old = recognition; recognition = null; old.onresult = old.onerror = old.onend = null; try { abort ? old.abort() : old.stop(); } catch (_) {} }
      get('stop').hidden = true;
    }
    get('start').addEventListener('click', () => {
      if (recognition || form.dataset.saving === 'true' || !form.isConnected) return;
      invalidate(); pending = true;
      const session = new Constructor(); recognition = session;
      session.lang = 'pt-PT'; session.interimResults = false; session.continuous = false; session.maxAlternatives = 1;
      session.onresult = event => {
        if (disposed || !form.isConnected || recognition !== session) return;
        const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ');
        get('text').value = (get('text').value + ' ' + transcript).trim().slice(0, 4000);
        status('Transcrição recebida. Corrija o texto e escolha Interpretar e rever.');
      };
      session.onerror = event => { status(event.error === 'not-allowed' ? 'Permissão de microfone recusada. Use o formulário manual.' : 'Não foi possível reconhecer a fala. Tente novamente ou use o formulário manual.'); stop(true); };
      session.onend = () => { stop(true); if (!get('text').value.trim()) status('Sem transcrição. Tente novamente ou descarte a voz para continuar manualmente.'); };
      try { session.start(); get('stop').hidden = false; status('A ouvir em português de Portugal…'); timer = setTimeout(() => session.stop(), 60000); }
      catch (_) { stop(true); status('Não foi possível iniciar o microfone. Use o formulário manual.'); }
    });
    get('stop').addEventListener('click', () => { if (recognition) { recognition.stop(); status('A terminar reconhecimento…'); } });
    get('analyse').addEventListener('click', () => {
      if (recognition) return status('Termine o reconhecimento antes de interpretar.');
      if (!get('text').value.trim()) return status('Introduza ou dite uma transcrição.');
      proposal = interpret(get('text').value); pending = true;
      const labels = {water:'Água',feed:'Alimentação',infra:'Infraestruturas'};
      const values = {ok:'OK',sem_agua:'Sem água',problema_bebedouro:'Problema no bebedouro',sem_comida:'Sem comida',insuficiente:'Insuficiente',problema:'Problema'};
      get('preview').textContent = Object.entries(proposal.fields).map(([field, item]) => `${labels[field]}: ${values[item.value]}${item.type ? ' — '+item.type : ''}.`).join(' ') +
        ' Campos não reconhecidos mantêm o valor manual atual, incluindo valores OK. Animais e fotografia exigem revisão manual. ' +
        (proposal.unresolved.length ? 'Por interpretar manualmente: '+proposal.unresolved.join('; ') : '') +
        (parkCount > 1 ? ` Atenção: aplica-se a todos os ${parkCount} parques selecionados.` : '');
      get('apply').hidden = false;
    });
    get('apply').addEventListener('click', () => {
      if (!proposal || recognition || form.dataset.saving === 'true') return;
      for (const [field, item] of Object.entries(proposal.fields)) {
        const control = form.querySelector(`input[name="${field}"][value="${item.value}"]`);
        control.checked = true; control.dispatchEvent(new Event('change', {bubbles:true}));
        if (field === 'infra') form.querySelector('#infraType').value = item.type;
      }
      // Preserve the entire utterance verbatim for human review, never infer clinical fields.
      const notes = form.querySelector('#roundNotes');
      notes.value = [notes.value.trim(), get('text').value.trim()].filter(Boolean).join('\n');
      applied = true; pending = false; invalidate(); get('reviewRow').hidden = false; get('review').checked = false;
      status('Proposta aplicada, ainda não guardada. Reveja e confirme todos os campos antes de Guardar ronda.');
    });
    get('discard').addEventListener('click', () => { stop(true); pending = false; invalidate(); get('text').value = ''; status(applied ? 'Transcrição descartada. As alterações já aplicadas continuam no formulário; reveja-as antes de guardar.' : 'Voz descartada. Pode continuar manualmente.'); });
    form.addEventListener('input', event => { if (applied && event.target !== get('review')) get('review').checked = false; });
    form.addEventListener('change', event => { if (applied && event.target !== get('review')) get('review').checked = false; });
    form.addEventListener('submit', event => {
      if (recognition || pending || (applied && !get('review').checked)) {
        event.preventDefault(); event.stopImmediatePropagation();
        status(pending || recognition ? 'Termine e aplique a proposta, ou descarte a voz, antes de guardar.' : 'Reveja todos os campos e assinale a confirmação antes de guardar.');
        panel.scrollIntoView({block:'nearest'});
      }
    }, true);
    const observer = new MutationObserver(() => { if (!form.isConnected) { disposed = true; stop(true); root.removeEventListener('pagehide', onPageHide); observer.disconnect(); } });
    observer.observe(document.body, {childList:true,subtree:true});
    function onPageHide() { stop(true); }
    root.addEventListener('pagehide', onPageHide, {once:true});
  }
  root.BoviRondaVoice = {interpret, mount};
  if (typeof module !== 'undefined') module.exports = {interpret, mount};
})(typeof window === 'undefined' ? globalThis : window);
