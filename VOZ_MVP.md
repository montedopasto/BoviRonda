# MVP de voz nas rondas

## Estrutura e regras preservadas

O frontend é JavaScript sem compilação (`app.js`), alojado no GitHub Pages, com cache em `sw.js`. `renderRoundForm` cria o formulário; `submitRound` conserva uma fotografia dos dados para o envio sequencial e repetição apenas dos parques falhados. `Code.gs` continua a receber `createRound`, verificar perfil/parque, exigir fotografia em casos veterinários, evitar duplicados e criar ocorrências/notificações a partir dos estados existentes.

Não se alteraram `Code.gs`, configuração, autenticação, fotografias, notificações ou formato de envio. O formulário manual conserva os valores iniciais existentes (OK). Não há chamadas de IA nem chaves novas.

## Utilização

1. Selecionar o parque ou parques pelos meios existentes.
2. Tocar em **Falar em português de Portugal**, aceitar o microfone e falar. Terminar ou aguardar o fim do reconhecimento.
3. Corrigir a transcrição e tocar em **Interpretar e rever**.
4. Rever a proposta e os trechos não reconhecidos. **Aplicar proposta ao formulário** só altera os campos reconhecidos e acrescenta a transcrição integral às observações.
5. Rever TODOS os campos manuais, incluindo os que continuam em OK, animais e fotografia. Assinalar a confirmação e usar o botão normal de guardar.

Enquanto há áudio ou transcrição pendente, guardar fica bloqueado até aplicar ou descartar. Alterar dados depois da confirmação exige nova confirmação. Descartar a voz depois de aplicar não desfaz alterações já aplicadas; a interface avisa e mantém a exigência de revisão. Uma seleção de vários parques recebe os mesmos dados, como no fluxo manual, com aviso explícito.

## Interpretação conservadora

Reconhece frases completas, sem inferir informação ausente:

- «Água está bem», «Água OK», «Sem água», «Não há água», «Problema no bebedouro».
- «Comida está bem», «Sem comida», «Não há comida», «Comida insuficiente» (também «alimentação» nos estados bem/insuficiente).
- «Água e comida estão bem».
- «Há uma vedação partida», «Portão avariado», «Bebedouro avariado», «Comedouro partido».

Se houver estados contraditórios no mesmo campo, esse campo não é proposto. Expressões desconhecidas, incertas ou negativas fora da lista ficam indicadas para revisão manual e preservadas nas observações. «Sem ocorrências» não limpa alertas. Animais doentes/mortos, parque, exploração, utilizador e fotografia nunca são preenchidos por inferência. Ocorrências usam exclusivamente as opções existentes; a gravação normal é que as cria.

## Compatibilidade e privacidade

Usa `SpeechRecognition` / `webkitSpeechRecognition` com `lang = pt-PT`, apenas em contexto seguro. O idioma é solicitado ao motor do navegador; a qualidade e disponibilidade dependem do navegador, sistema e serviço. Não garante funcionamento offline. O serviço do navegador pode enviar áudio ao fornecedor; esta informação aparece antes de iniciar. Não há gravação de áudio nem persistência da transcrição pelo módulo; se aplicada e guardada, a transcrição fica nas observações pelos mecanismos existentes.

Sem suporte, permissão recusada, falta de Internet ou falha de reconhecimento: há mensagem e o formulário manual continua disponível. Também é possível escrever a transcrição. A captura termina ao sair do formulário/página, ao descartar ou após o limite de 60 segundos.

## Verificação

- `node --check voice.js` e `node --check app.js`
- `node tests/voice.cjs`
- `node tests/notifications.cjs`
- `node tests/voice-dom.cjs` com `jsdom` instalado separadamente (ou via `NODE_PATH`): reconhecimento simulado, revisão, bloqueio antes da confirmação, erros, ausência de suporte e limpeza ao navegar.

Antes de publicar, testar em telemóveis reais (Chrome Android e Safari iOS) e computador, com permissões aceites/recusadas, silêncio, ruído, perda de ligação, correções, frases contraditórias, fotografia obrigatória e vários parques. Os testes simulados não validam a precisão do microfone ou do motor de transcrição. Não enviar registos reais durante esta verificação sem intenção explícita.

O PR não publica em produção nem atualiza o Apps Script. Ao integrar no futuro, `index.html` e `sw.js` incluem versões novas dos recursos e o módulo `voice.js`.
