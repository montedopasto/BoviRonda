# BoviRonda 1.9.10 — identificação por fotografia e notificações

## Ativação

1. Substituir o Code.gs do projeto Apps Script ligado à folha por esta versão. Não executar setupBoviRonda: essa função apaga os dados das folhas.
2. Autorizar os novos serviços de envio de email e gestão de acionadores no Apps Script (executar processBoviRondaNotifications pelo editor permite solicitar as permissões sem criar dados quando ainda não existe configuração).
3. Atualizar a implementação Web App existente, mantendo o URL /exec, execução como proprietário e as opções de acesso atuais.
4. Publicar app.js, index.html e sw.js desta versão. A versão do recurso e a cache PWA foram atualizadas.
5. Na aplicação, entrar como Admin → Configurações / Notificações. Guardar as listas operacionais e veterinárias, separando emails por vírgulas ou ponto e vírgula. Espaços são removidos, emails validados e duplicados eliminados.

A primeira configuração inicia as notificações para ocorrências criadas a partir desse momento; não envia o histórico. Lista vazia deixa o respetivo grupo pendente. Não há destinatários predefinidos.

## Comportamento

- Animal doente e animal morto exigem uma fotografia do brinco antes de guardar, tanto na aplicação como na API. A fotografia existente da ronda passa a ter esse significado quando há alerta veterinário e continua associada à ocorrência; a intervenção/necrópsia referencia a mesma ocorrência e devolve o respetivo photoUrl. A fotografia pode ser vista no detalhe da ocorrência e aberta no Drive.
- NR PT deixa de ser solicitado ou enviado na intervenção. As colunas NR_PT permanecem, os valores antigos são preservados ao editar e continuam disponíveis nos relatórios históricos. Nos novos registos a coluna fica vazia. Os relatórios usam o cabeçalho Identificação e a exportação usa o link da fotografia quando não há identificação antiga.
- Cada ocorrência operacional usa a lista operacional. Animal doente/morto usa exclusivamente a lista veterinária. O email inclui tipo, exploração, parque, data/hora no fuso do Apps Script, autor, descrição, ID e, para saúde animal, link da fotografia quando disponível.
- MailApp envia após guardar a ronda. Um acionador de cinco em cinco minutos recupera ocorrências pendentes, inclusive por falta de quota. O envio respeita as quotas gratuitas da conta Google; não exige serviço pago.
- O registo Notificacoes é criado sem alterar folhas existentes. Um bloqueio impede envios concorrentes, e o ID da ocorrência impede novo envio após sucesso. A aplicação reutiliza uma chave por ronda/parque ao repetir um pedido sem confirmação.
- MailApp não oferece transações nem chave de idempotência. Um envio interrompido ou com erro após a chamada fica em a_enviar/incerto e não é repetido automaticamente, para evitar duplicados. Os IDs aparecem no Admin; confirmar o envio nos registos Google antes de remover manualmente uma linha de Notificacoes para permitir repetição. Não é possível garantir simultaneamente entrega e ausência absoluta de duplicados em falhas ambíguas.
- Registos antigos sem fotografia continuam editáveis. Não são forçados a fornecer uma fotografia retroativamente.

## Validação

Executados `node --check app.js`, `node --check sw.js`, `node --check < Code.gs` e `node tests/notifications.cjs`.
Os testes usam serviços Google simulados, sem emails reais ou alterações em produção. Cobrem permissões Admin, parsing e deduplicação de destinatários, fotografia obrigatória antes de escritas, preservação de NR_PT, validação de necrópsia antes de guardar, destinos/conteúdo, repetição de pedidos e de processamento, quota insuficiente e envio ambíguo.

A preparação da imagem usa Image + canvas, disponível em browsers sem createImageBitmap. A sintaxe restante mantém os requisitos da versão existente (incluindo optional chaining, async/await e APIs já utilizadas). Não houve ensaio físico em tablets antigos nem envio real no Apps Script.

Nota da versão base: o frontend já chama ações como resolveIncidentsBulk e getPhoto que não estão definidas no Code.gs atualmente em main. Esta alteração não implementa nem remove essas funcionalidades preexistentes; confirmar que o projeto Apps Script em produção não contém extensões adicionais antes de substituir o ficheiro.
