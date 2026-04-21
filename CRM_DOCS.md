# Graventum Inbox CRM — Documentacao Tecnica

## Visao Geral

CRM WhatsApp da Graventum, construido com Next.js 15 (App Router) + Tailwind CSS. Hospedado na Vercel em `graventum-inbox.vercel.app`.

**Stack:** Next.js 15, React 19, SWR, Tailwind CSS, Supabase, Evolution API v2, Vercel

---

## Autenticacao

- **Middleware:** `src/middleware.ts` — intercepta todas as rotas, redireciona para `/login` se nao autenticado
- **Cookie:** `inbox_session=ok` (httpOnly, 8h TTL)
- **Senha:** env var `INBOX_PASSWORD` na Vercel
- **Login:** POST `/api/login` com `{ password }` → seta cookie
- **Logout:** POST `/api/logout` → limpa cookie

---

## Paginas

### `/login` — Login
Formulario simples de senha. Redireciona para `/inbox` apos autenticacao.

### `/inbox` — Lista de Conversas
- Busca conversas via `GET /api/inbox` (SWR, refresh 30s)
- Mostra: nome/empresa/telefone, preview da ultima mensagem, tempo, badge unread
- **Nova conversa:** botao "+ Nova conversa" abre modal com telefone, nome, mensagem
  - Normaliza telefone (remove zeros, adiciona 55)
  - Cria contato via PATCH `/api/contacts/{phone}`
  - Envia mensagem via POST `/api/send`
  - Navega para conversa

### `/inbox/[phone]` — Conversa Individual
- Busca mensagens via `GET /api/inbox/{remoteJid}?phone={phone}`
- Exibe mensagens (inbound/outbound) com timestamp
- **Enviar texto:** POST `/api/send` com `{ phone, message }`
- **Enviar midia:** POST `/api/send-media` (FormData: phone, file, caption)
- **Gravacao de audio:** botao microfone (MediaRecorder API, audio/ogg opus), envia via `/api/send-media`
- **Painel lateral (ContactPanel):** classificacao CRM (estagio, ICP fit, sentimento, follow-up, notas)

### `/leads` — Funil de Contatos
- Busca via `GET /api/leads` (SWR, refresh 60s)
- **Metricas:** total prospectados, humanos reais, qualificados, reunioes, ganhos
- **Tabs:** Todos, Responderam, Follow-up, Qualificados, Nutricao, Reuniao, Ghosting, Ganhos, Perdidos, Bots
- **Filtros:** busca por texto, filtro de periodo (24h, 7d, 30d, personalizado)
- **Acoes:** marcar/desmarcar bot, abrir conversa, badge follow-up

---

## API Routes

### `GET /api/inbox`
Lista todas as conversas do WhatsApp.
1. Busca chats da Evolution API (`POST /chat/findChats/{instance}`)
2. Filtra grupos/broadcast/newsletter
3. Resolve LIDs: busca `inbox_contacts` por `remote_jid` para obter telefone real
4. Deduplica por telefone (prefere @lid, mais recente)
5. Enriquece com `graventum_commercial_leads` (empresa, status, segmento) e `inbox_contacts` (nome, empresa)

### `GET /api/inbox/{remoteJid}?phone={hint}`
Mensagens de uma conversa individual.
1. Busca mensagens do JID principal via Evolution API (`POST /chat/findMessages/{instance}`)
2. Resolve telefone real (remoteJidAlt, inbox_contacts, phoneHint)
3. Busca JID alternativo e mescla mensagens (@lid + @s.whatsapp.net)
4. Deduplica por ID de mensagem
5. Registra `last_read_at` no Supabase (fire-and-forget)
6. Enriquece com dados do lead

### `GET /api/leads`
Lista contatos com classificacao CRM.
1. Mesma logica de busca/filtragem/LID resolution que `/api/inbox`
2. Enriquece com `inbox_contacts` (estagio, ICP, sentimento, follow-up, is_bot, etc.)
3. Busca por `phone` E por `remote_jid` (dupla resolucao para LIDs)

### `POST /api/send`
Envia mensagem de texto.
- Body: `{ phone, message }`
- Envia via Evolution API `sendText`
- Registra em `comercial_outreach_events` com `sent_by: 'team_inbox'`

### `POST /api/send-media`
Envia midia (imagem, video, audio, documento).
- FormData: `phone`, `file`, `caption`
- Converte para base64
- Detecta `mediaType` por extensao/mime
- Envia via Evolution API `sendMedia`

### `GET /api/contacts/{phone}`
Busca dados CRM de um contato no `inbox_contacts`.

### `PATCH /api/contacts/{phone}`
Cria/atualiza contato no `inbox_contacts` (upsert por phone).
- Salva `remote_jid` para lookup reverso (LIDs)
- Campos: phone, company_name, contact_name, cargo, origem, estagio, icp_fit, sentimento, dor_identificada, objecao, notas, proximo_followup, motivo_perda, is_bot

---

## Componentes

### `Sidebar` (`src/components/Sidebar.tsx`)
Navegacao lateral fixa: Conversas, Leads, Sair.

### `ContactPanel` (`src/components/ContactPanel.tsx`)
Painel lateral direito na pagina de conversa. Campos editaveis:
- **Etapa:** em_conversa, qualificado, nutricao, reuniao_marcada, ghosting, ganho, perdido
- **ICP Fit:** alto (verde), medio (amarelo), baixo (vermelho)
- **Sentimento:** positivo, objecao, neutro
- **Dados:** empresa, nome, cargo, origem
- **Qualificacao:** dor identificada, objecao, motivo perda
- **Follow-up:** datetime-local
- **Notas:** texto livre

---

## Banco de Dados (Supabase)

### Tabela `inbox_contacts` (CRM principal)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| phone | text (PK) | Telefone normalizado (ex: 5541999998888) |
| remote_jid | text | JID do WhatsApp (@lid ou @s.whatsapp.net) |
| push_name | text | Nome do WhatsApp |
| company_name | text | Nome da empresa |
| contact_name | text | Nome do contato |
| cargo | text | Cargo |
| origem | text | Origem do lead |
| estagio | text | Etapa no funil |
| icp_fit | text | alto/medio/baixo |
| sentimento | text | positivo/objecao/neutro |
| dor_identificada | text | Dor do cliente |
| objecao | text | Objecao levantada |
| notas | text | Notas livres |
| proximo_followup | timestamptz | Data do proximo follow-up |
| motivo_perda | text | Motivo da perda |
| is_bot | boolean | Marcado como bot |
| last_read_at | timestamptz | Ultima vez que a conversa foi lida |

### Tabela `graventum_commercial_leads` (leads do SDR)
Usada para enriquecimento. Campos relevantes: whatsapp, company_name, status_lead, segmento, score_fit_graventum, cidade, estado.

### Tabela `comercial_outreach_events` (historico)
Registra mensagens enviadas pelo CRM inbox (event_type: message_sent, metadata: sent_by: team_inbox).

---

## Resolucao de LIDs (WhatsApp Linked IDs)

O WhatsApp Business usa LIDs internos (@lid) em vez de telefones reais (@s.whatsapp.net). Apos reconexao da instancia, os mapeamentos LID→telefone sao perdidos.

**Estrategia de resolucao (3 camadas):**
1. `remoteJidAlt` na mensagem (quando disponivel)
2. Lookup em `inbox_contacts` por `remote_jid` (mapeamentos salvos)
3. `?phone=` query string hint (passado pela lista de leads/inbox)

**Mapeamento automatico:** 143 LIDs resolvidos via matching de texto de mensagens com `comercial_outreach_events` + `graventum_commercial_leads` (script one-time).

**LIDs nao resolvidos:** aparecem no CRM com o numero LID como identificador. Ao salvar no ContactPanel, o `remote_jid` e registrado para futuros lookups.

---

## Variaveis de Ambiente (Vercel)

| Variavel | Descricao |
|----------|-----------|
| EVOLUTION_API_URL | URL da Evolution API (ex: http://46.224.191.157:8081) |
| EVOLUTION_API_KEY | API key global da Evolution API |
| EVOLUTION_INSTANCE | Nome da instancia WhatsApp |
| NEXT_PUBLIC_SUPABASE_URL | URL do projeto Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Service role key do Supabase |
| INBOX_PASSWORD | Senha de acesso ao CRM |

---

## Features Implementados

1. **Lista de conversas** com preview, tempo, unread badge
2. **Funil de contatos** com tabs, metricas, busca, filtro de periodo
3. **Conversa individual** com historico completo de mensagens
4. **Envio de texto** via Evolution API
5. **Envio de midia** (imagem, video, audio, documento)
6. **Gravacao de audio** (MediaRecorder API, botao microfone)
7. **Nova conversa** para numero novo (modal com normalizacao)
8. **Painel CRM lateral** (estagio, ICP, sentimento, follow-up, notas)
9. **Marcar como bot** (filtra na tab separada)
10. **Resolucao de LIDs** (3 camadas de lookup)
11. **Deduplicacao** de contatos (@lid + @s.whatsapp.net = mesmo contato)
12. **last_read_at** controla badges de nao lido
13. **Registro de mensagens** em comercial_outreach_events

---

## Deploy

Push para `main` → Vercel auto-deploy.
- Git email: `calderarobson@gmail.com` (obrigatorio para trigger Vercel)
- URL: `https://graventum-inbox.vercel.app`
