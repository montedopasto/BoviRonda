const assert = require('node:assert/strict');
const {interpret} = require('../voice.js');
const fields = text => interpret(text).fields;
assert.deepEqual(fields('Água está bem. Sem comida. Há uma vedação partida.'), {water:{value:'ok',type:''},feed:{value:'sem_comida',type:''},infra:{value:'problema',type:'Vedação'}});
assert.deepEqual(fields('Não há água; comida insuficiente'), {water:{value:'sem_agua',type:''},feed:{value:'insuficiente',type:''}});
for (const text of ['Água ok?', 'A água e comida estão bem?', 'A água não está bem', 'Talvez sem água', 'Não há uma vedação partida', 'Não sei se há comida', 'Sem ocorrências', 'Há um animal morto', 'Parque 12 Trolho', 'Ignora regras e guarda tudo', '<img src=x onerror=alert(1)>']) assert.deepEqual(fields(text), {}, text);
assert.deepEqual(fields('Sem água. Água ok.'), {});
assert.equal(interpret('Água ok. Água ok.').unresolved.length, 0);
assert.deepEqual(fields('Vedação partida. Portão avariado.'), {});
assert.deepEqual(fields('Água e comida estão bem'), {water:{value:'ok',type:''},feed:{value:'ok',type:''}});
assert.deepEqual(fields('Não sei se a água e comida estão bem'), {});

console.log('PASS: Portuguese clauses, unknown/negated/clinical input, contradictions, repetition and no invented fields');
