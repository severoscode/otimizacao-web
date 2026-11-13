# Stacks

O que cada plataforma já resolve e onde ficam os ajustes. Leia só a seção da stack do
projeto (Passo 0 do SKILL.md).

## Sumário

- [TanStack Start no Cloudflare Workers](#tanstack-cloudflare)
- [Vite SPA (React puro, projetos vindos do Lovable)](#vite-spa)
- [Next.js na Vercel](#next-vercel)
- [Supabase (qualquer front)](#supabase)
- [Python (FastAPI, Django, Flask)](#python)
- [N8N](#n8n)
- [Animações (GSAP, Lenis, WebGL)](#animacoes)

---

<a id="tanstack-cloudflare"></a>
## TanStack Start no Cloudflare Workers

React 19 + Vite + TanStack Start/Router, deploy com `@cloudflare/vite-plugin` e
`wrangler.jsonc`.

**Já vem resolvido (confira e siga):** 06 CDN (os estáticos saem da borda da Cloudflare),
09 compressão (automática), 28 escala (o Workers escala sozinho), 20 SSR (padrão do Start).

**Onde mexer:**

| Item | Onde |
|---|---|
| 27 cache dos estáticos | `public/_headers` com `/assets/*` imutável (o padrão do Workers é `max-age=0, must-revalidate`) |
| 19 região | região do Supabase; `"placement": { "mode": "smart" }` no `wrangler.jsonc` se o Worker faz muitas consultas em sequência |
| 25 pool | Hyperdrive, só se conectar direto no Postgres (com supabase-js não precisa) |
| 01 skeleton | `pendingComponent`, `pendingMs`, `pendingMinMs` na rota ou no router |
| 03 duplicadas | `queryOptions` + `ensureQueryData` no loader + `useSuspenseQuery` no componente |
| 16 paralelo | loaders aninhados já são paralelos; `useSuspenseQueries` em vez de dois `useSuspenseQuery` |
| 20 streaming do SSR | promessa sem `await` no loader + `<Await>` ou `useSuspenseQuery` |
| 22 divisão | `autoCodeSplitting` do plugin do router; `React.lazy` para componente pesado; `defaultPreload: 'intent'` |
| 07 fila | `waitUntil` de `cloudflare:workers` para pouco tempo; Cloudflare Queues ou Workflows para tarefa longa |
| 10 cache | Cache API (`caches.default`) para resposta pública; Workers KV para dado que muda pouco |
| 18, 30 medição | Workers Observability no `wrangler.jsonc`; Cloudflare Web Analytics |

**Armadilhas conhecidas:**
- **Vídeo e o cabeçalho `Range`:** o Static Assets ignora `Range` e devolve 200 com o
  arquivo inteiro. O Safari exige 206 para tocar vídeo. Saída: baixar com `fetch` e tocar de
  um `blob:` (ou servir o vídeo de outro lugar, como R2 ou Stream).
- **Limite de CPU:** no plano gratuito o Worker tem poucos milissegundos de CPU por
  requisição; SSR pesado pode estourar (erro 1102). Meça antes de culpar o código.
- **Tamanho do Worker:** dependência grande no servidor aumenta o pacote e o tempo de
  partida. Biblioteca usada só no navegador não deve entrar no código do servidor.
- **Medir:** `npm run build && npm run preview` roda no workerd, o mesmo runtime de
  produção.

---

<a id="vite-spa"></a>
## Vite SPA (React puro, projetos vindos do Lovable)

Tudo é desenhado no navegador: o HTML chega com `<div id="root"></div>` vazio.

- **20:** para landing page que precisa de Google, a saída real é pré-renderizar ou migrar a
  parte pública (TanStack Start com pré-renderização, ou Astro). É trabalho grande: combine.
  Enquanto isso, deixe o HTML inicial com título, descrição e Open Graph corretos.
- **22:** `React.lazy` nas rotas (com React Router, `lazy` na definição da rota).
- **11:** projetos do Lovable trazem dezenas de componentes Radix/shadcn; só pesa o que é
  importado. Rode `npx knip` e o `vite-bundle-visualizer`.
- **06, 09, 27:** dependem de onde está publicado (Cloudflare Pages e Netlify usam
  `_headers`; Vercel, `vercel.json`).
- **Supabase direto do navegador:** a região do Supabase precisa estar perto dos usuários
  (19), e `preconnect` para a URL do projeto ajuda a primeira consulta.

---

<a id="next-vercel"></a>
## Next.js na Vercel

| Item | Onde |
|---|---|
| 01 | `loading.tsx` e `<Suspense>` |
| 02, 15 | `next/image` com `sizes`; `images.formats: ['image/avif', 'image/webp']`; a imagem do topo com `fetchPriority="high"` (ou `loading="eager"`); `preload`, que substituiu `priority` no Next 16, só se ela for a única candidata a LCP em todos os tamanhos de tela |
| 07 | `after()` para pouco tempo; Inngest, Trigger.dev ou QStash para fila |
| 10 | `revalidate` e as funções de cache do Next antes de Redis |
| 18 | `instrumentation.ts` com `@vercel/otel` |
| 19 | região das funções: o padrão é `iad1` (Washington); para banco em São Paulo, `gru1` |
| 21 | `next/script` com `strategy="lazyOnload"` ou `"afterInteractive"` |
| 22 | divisão por rota automática; `next/dynamic` para componente pesado |
| 29 | `next/font` |
| 30 | Vercel Speed Insights |

Já vem resolvido: 06, 09, 28, e 27 em `/_next/static`.

---

<a id="supabase"></a>
## Supabase (qualquer front)

- **24:** `.select("col1, col2")`, nunca `*` em lista.
- **08:** relação embutida (`autor:profiles(nome)`) ou `.in("id", ids)`.
- **05:** `.range(de, ate)`; `count: "estimated"` em vez de `"exact"`; o corte padrão de
  1000 linhas da API.
- **17 e RLS:** Query Performance, Performance Advisor, Index Advisor;
  `(select auth.uid())` nas políticas; índice nas colunas das políticas.
- **25:** só para conexão direta ao Postgres; o supabase-js usa HTTP.
- **19:** região do projeto (Project Settings → General); não muda depois de criado.
- **02:** transformação de imagem do Storage (depende do plano) ou reduzir antes de subir.
- **07:** Supabase Queues; `EdgeRuntime.waitUntil` nas Edge Functions.
- **03:** `auth.getUser()` vai ao servidor de Auth a cada chamada; leia a sessão uma vez.
- **Realtime:** assine só a tabela e o filtro necessários (`filter: "org_id=eq.123"`), não a
  tabela inteira.

---

<a id="python"></a>
## Python (FastAPI, Django, Flask)

- **12:** `requests` não tem timeout padrão; sempre `timeout=(3, 10)`. `httpx` com
  `httpx.Timeout`.
- **16:** `asyncio.gather` com `httpx.AsyncClient` (um cliente reaproveitado, não um por
  chamada).
- **08:** `selectinload`/`joinedload` (SQLAlchemy), `select_related`/`prefetch_related`
  (Django).
- **24:** `load_only`/`defer` (SQLAlchemy), `only`/`values` (Django).
- **25:** um engine/pool por processo, criado na subida.
- **09:** `GZipMiddleware` (atenção com streaming).
- **13:** `StreamingResponse` com o `text_stream` da SDK.
- **07:** `BackgroundTasks` para pouco; Celery, RQ ou arq para fila.
- **28:** `uvicorn app:app --workers N`, ou gunicorn com o pacote `uvicorn-worker`
  (`gunicorn -k uvicorn_worker.UvicornWorker -w N app:app`; o antigo `uvicorn.workers` está
  obsoleto).
- **18:** `opentelemetry-instrument` com as instrumentações automáticas.
- Endpoint `async def` não pode chamar biblioteca bloqueante (requests, psycopg2) sem
  `run_in_threadpool`: trava todas as requisições do processo.

---

<a id="n8n"></a>
## N8N

- **07:** "Respond to Webhook" logo no começo quando quem chamou não precisa esperar o
  resultado; modo fila com workers para volume.
- **12:** Timeout no nó HTTP Request; "Retry On Fail" só no que pode repetir.
- **08:** consulta ao banco ou chamada de API por item dentro de um loop é N+1 também. Use
  uma consulta com `in (...)` ou uma chamada em lote, e "Loop Over Items" com lotes.
- **05:** pagine a leitura de APIs grandes (o HTTP Request tem opção de paginação).
- **13:** resposta em streaming para agentes nas versões recentes (Webhook e Chat Trigger).
- **Banco do N8N:** a limpeza do histórico já vem ligada (336 h, até 10 000 execuções). Com
  muito volume, reduza `EXECUTIONS_DATA_MAX_AGE` ou `EXECUTIONS_DATA_PRUNE_MAX_COUNT`, senão o
  próprio N8N fica lento.

---

<a id="animacoes"></a>
## Animações (GSAP, Lenis, WebGL)

- Anime só `transform` e `opacity`.
- O elemento do LCP não pode ficar escondido esperando o JS (ver frontend.md, extras).
- Respeite `prefers-reduced-motion`: sem animação, sem rolagem suave, nada escondido.
- SplitText em texto longo e quebra por letra custam CPU no celular (TBT); prefira linhas ou
  palavras.
- Rolagem que atualiza estado do React a cada quadro trava a tela (item 26); use `ref` ou
  deixe o GSAP mexer no DOM.
- WebGL e vídeo: carregar quando a seção chega perto da tela e pausar fora dela.
- Mais na skill `gsap-performance`, se instalada.
