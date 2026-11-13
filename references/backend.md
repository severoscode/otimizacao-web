# Backend

O servidor. Itens 07, 10 e 28. É a camada que mais dá para pular num app pequeno: antes de
fila, cache ou mais servidores, arrume as consultas (banco.md) e a região (rede, item 19).

## Sumário

- [07 Tarefas lentas numa fila](#07)
- [10 Cache dos dados mais consultados](#10)
- [28 Tráfego entre várias instâncias](#28)

---

<a id="07"></a>
## 07 · Tarefas lentas numa fila

**O que é.** Gerar PDF ou vídeo, mandar 500 e-mails ou mensagens de WhatsApp, processar
planilha, chamar IA em lote: a rota responde "recebido" na hora e o trabalho roda por trás.

**Vale:** tarefa que leva vários segundos ou que estoura o tempo limite da função. **Não
vale:** app pequeno com tarefa de 1 ou 2 segundos. Antes de montar fila, veja se "responder e
continuar" resolve.

**Como conferir.** DevTools → Network → requisição que dispara a tarefa → Timing. Com fila,
ela responde rápido e o trabalho aparece no painel da fila.

**Como corrigir.** Do mais simples ao mais robusto:

1. **Responder e continuar (até alguns segundos):**
   - **Cloudflare Workers:** `ctx.waitUntil(promessa)`, ou
     `import { waitUntil } from "cloudflare:workers"` em qualquer ponto do código (útil no
     TanStack Start, que não entrega o `ctx`). Tem limite de tempo depois da resposta.
   - **Next na Vercel:** `after()`.
   - **Supabase Edge Functions:** `EdgeRuntime.waitUntil(promessa)`.
   - **FastAPI:** `BackgroundTasks`, no mesmo processo.
   - **N8N:** o nó "Respond to Webhook" logo depois do gatilho responde na hora e o resto do
     fluxo continua.
2. **Fila de verdade (tarefa longa, repetição em caso de erro, volume):**
   - **Cloudflare Queues** (`env.FILA.send({...})` no produtor e o handler `queue()` no
     consumidor), ou **Cloudflare Workflows** para tarefa com várias etapas que precisam
     sobreviver a falhas.
   - **Supabase Queues** (pgmq) com uma Edge Function ou um cron consumindo.
   - Serviços: Inngest, Trigger.dev, QStash.
   - **Python:** Celery, RQ ou arq com Redis.
   - **N8N com volume:** modo fila (`EXECUTIONS_MODE=queue`) com workers separados.

Na tela: responda com "recebido" (HTTP 202), mostre o andamento (Supabase Realtime ou
consulta a cada poucos segundos) e avise quando ficar pronto.

**Cuidado.** Fila repete tarefa que falhou: o trabalho precisa ser idempotente (rodar duas
vezes não pode mandar dois e-mails nem cobrar duas vezes). `waitUntil` não garante
conclusão se der erro: não use para nada crítico, como confirmar pagamento. Deixe as falhas
visíveis (fila de mortos, log, alerta).

---

<a id="10"></a>
## 10 · Cache dos dados mais consultados (Redis, KV)

**O que é.** Guardar em memória o resultado de uma consulta cara que muita gente pede, para
não ir ao banco toda vez.

**Vale:** muita gente pedindo a mesma consulta pesada, com dado que muda pouco (catálogo,
ranking, totais de painel, resultado de API externa com limite de uso). **Não vale:** app
pequeno; dado diferente para cada usuário e pouco repetido. Antes, arrume as consultas
(itens 08, 17, 24): cache em cima de consulta ruim só esconde o problema.

**Como conferir.** Logue "hit" e "miss" do cache e compare o tempo da rota no primeiro e no
segundo acesso (Network → Timing, ou `Server-Timing`).

**Como corrigir.** Do mais barato ao mais caro:

1. **Cache HTTP** em resposta pública de leitura:
   `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` deixa a CDN guardar por
   60 s e servir a versão velha enquanto busca a nova. Na Cloudflare, resposta gerada pelo
   Worker não vai para o cache sozinha: use a Cache API (`caches.default.match` e `put`).
2. **Cache do framework:** no Next, `revalidate` e as funções de cache; no TanStack Query,
   `staleTime` (cache no navegador de cada pessoa).
3. **Workers KV:** leitura rápida no mundo todo para dado que muda pouco. A gravação leva até
   cerca de um minuto para aparecer em todos os lugares.
4. **Redis:** Upstash (por HTTP, funciona no Workers e em serverless) ou Redis próprio
   (`ioredis`, `redis-py`) num servidor.

Padrão "olha no cache, senão busca e guarda":

```ts
async function comCache<T>(chave: string, segundos: number, buscar: () => Promise<T>): Promise<T> {
  const guardado = await redis.get<T>(chave);
  if (guardado !== null) return guardado; // hit
  const valor = await buscar(); // miss
  await redis.set(chave, valor, { ex: segundos });
  return valor;
}
```

Ao gravar o dado de origem, apague a chave (`redis.del(chave)`) ou deixe o tempo curto.

**Cuidado.** Nunca guarde dado de um usuário numa chave que outro usuário pode ler (inclua o
id do usuário ou da organização na chave, ou não guarde). Muitas requisições na mesma chave
vencida ao mesmo tempo derrubam o banco: `stale-while-revalidate` ou uma trava curta evitam.
Redis é mais um serviço para pagar, monitorar e manter.

---

<a id="28"></a>
## 28 · Tráfego distribuído entre várias instâncias

**O que é.** Várias cópias do servidor dividindo os acessos, com um balanceador na frente.

**Vale:** servidor próprio (VPS, container único) com o processador no talo no horário de
pico. **Não vale:** Cloudflare Workers, Vercel, Netlify e Supabase Edge Functions, que já
escalam sozinhos. Num app pequeno, não faz sentido.

**Como conferir.**
- Uso de CPU e memória no painel do servidor no pico.
- Teste de carga, só no seu próprio app e de preferência fora do horário de uso:
  `npx autocannon -c 50 -d 20 https://seu-app/rota`.

**Como corrigir.**
- **Node:** PM2 em modo cluster (`pm2 start app.js -i max`), ou vários containers atrás de
  nginx, Traefik ou Caddy.
- **Python:** `uvicorn app:app --workers 4`, ou gunicorn com o pacote `uvicorn-worker`
  (`gunicorn -k uvicorn_worker.UvicornWorker -w 4 app:app`). Comece com o número de núcleos
  e meça.
- **N8N:** modo fila com workers (ver item 07).
- O app precisa ser sem estado: sessão no banco ou no Redis, arquivo enviado em storage, não
  na memória nem no disco de uma cópia.

**Cuidado.** Antes de escalar, descubra o gargalo (medicao, item 18). Uma consulta lenta
copiada quatro vezes continua lenta e ainda multiplica as conexões com o banco: confira o
pool (banco, item 25).
