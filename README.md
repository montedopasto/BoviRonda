# BoviRonda

Aplicação mobile-first para registo das rondas de gado do **Monte do Pasto**, com suporte a:

- **Monte Ruivo** e **Trolho**
- Login por **utilizador + PIN**
- Perfis:
  - Admin
  - Utilizador
  - Veterinário
  - Chefia
- QR Code único por parque
- Registo de rondas
- Água / comida / infraestruturas
- Animal doente / animal morto
- Ocorrências automáticas
- NR PT obrigatório para intervenção veterinária
- Resumo de necrópsia para animais mortos
- Fotografias guardadas no Google Drive
- Dashboard responsive para telemóvel e PC
- Google Sheets como armazenamento principal
- Google Apps Script como API
- GitHub Pages como frontend

---

## 1. Criar a Google Sheet

Pode usar o ficheiro `BoviRonda_GoogleSheet_Template.xlsx` incluído no ZIP:

1. Vá ao Google Drive.
2. Faça upload do XLSX.
3. Abra com Google Sheets.
4. Guarde/converta para Google Sheets.

**OU**, mais simples:

1. Crie uma Google Sheet vazia.
2. Abra **Extensões > Apps Script**.
3. Cole o conteúdo de `Code.gs`.
4. Guarde.
5. Execute manualmente a função:

`setupBoviRonda()`

Na primeira execução o Google irá pedir permissões.

Esta função cria todas as folhas e também cria:

- Monte Ruivo
- Trolho
- utilizador inicial:
  - Username: `admin`
  - PIN: `1234`

> Depois do primeiro login, crie as contas reais através do menu Admin da BoviRonda.

---

## 2. Implementar o Apps Script como Web App

No Apps Script:

1. Clique **Implementar / Deploy**
2. **Nova implementação**
3. Tipo: **Aplicação Web / Web app**
4. Executar como: **Eu**
5. Quem tem acesso: **Qualquer pessoa**
6. Implementar
7. Copie o URL que termina em `/exec`

Exemplo:

`https://script.google.com/macros/s/XXXXXXXXXXXX/exec`

---

## 3. Configurar o frontend

Abra:

`config.js`

Troque:

`COLE_AQUI_O_URL_DO_APPS_SCRIPT_EXEC`

pelo URL `/exec` do Apps Script.

---

## 4. Colocar no GitHub

Crie um repositório, por exemplo:

`BoviRonda`

Faça upload destes ficheiros na raiz:

- index.html
- styles.css
- app.js
- config.js
- manifest.json
- sw.js

Pode também guardar as pastas:


mas estes dois não são necessários para o GitHub Pages funcionar.

---

## 5. Ativar GitHub Pages

No GitHub:

**Settings > Pages**

Em **Build and deployment**:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

Depois de alguns instantes terá um endereço semelhante a:

`https://SEU-UTILIZADOR.github.io/BoviRonda/`

---

## 6. Criar parques

Entre com:

- `admin`
- `1234`

Abra:

**Admin > Parques > Novo parque**

Exemplo:

- Código: `MR-01`
- Nome: `Novilhas`
- Exploração: `Monte Ruivo`

Ao criar o parque, o backend gera automaticamente um **QRToken permanente**.

Em:

**Admin > QR Codes**

pode abrir o QR do parque e imprimir.

O QR não depende do nome do parque. Pode alterar o nome futuramente sem precisar de substituir a placa.

---

## 7. Fotografias

As fotografias são enviadas para uma pasta criada automaticamente no Google Drive:

`BoviRonda_Fotos`

Na Google Sheet fica guardado o URL correspondente.

---

## Estrutura da Google Sheet

### Utilizadores
ID, Nome, Username, PINHash, Perfil, Ativo, CriadoEm, AtualizadoEm

### Exploracoes
ID, Nome, Codigo, Ativo, CriadoEm

### Parques
ID, Codigo, Nome, ExploracaoID, QRToken, Ativo, CriadoEm, AtualizadoEm

### Rondas
Registo de cada ronda realizada.

### Ocorrencias
Alertas operacionais e veterinários.

### Veterinaria
Intervenções veterinárias e NR PT.

### Necropsias
Informação de necrópsias.

### Fotos
Referências de fotografias guardadas no Drive.

### Sessoes
Sessões de login.

### AuditLog
Histórico de operações importantes.

---

## Nota sobre o PIN

O PIN não é guardado diretamente na Sheet.

O Apps Script guarda um **SHA-256** do PIN em `PINHash`.

---

## Nota sobre offline

O frontend já inclui Service Worker para cache básica da aplicação.

O registo de rondas offline com sincronização posterior **ainda não está implementado nesta primeira base**, porque isso deve ser feito depois de testarmos o fluxo real no terreno para evitar conflitos de dados.

---

## Primeira credencial

**Utilizador:** admin  
**PIN:** 1234

Altere/crie utilizadores reais assim que validar a instalação.
