# API

Como o app pede e recebe dados. Itens 03, 05, 12, 13 e 16.

## Sumário

- [03 Evitar chamadas duplicadas](#03)
- [05 Paginar os resultados](#05)
- [12 Timeout nas APIs externas](#12)
- [13 Resposta da IA em streaming](#13)
- [16 Requisições independentes em paralelo](#16)

---

<a id="03"></a>
## 03 · Evitar chamadas duplicadas

**O que é.** A mesma requisição disparada duas ou três vezes ao abrir uma tela, porque cada
componente busca o mesmo dado sozinho, ou porque um efeito roda de novo sem precisar.

**Vale:** sempre.

**Como conferir.**
- DevTools → Network → filtro "Fetch/XHR" → recarregue e ordene por Name. A mesma URL com
  os mesmos parâmetros repetida é duplicada. No Supabase, filtre por `rest/v1`.
- Faça isso no build de produção. Em desenvolvimento, o StrictMode do React roda os efeitos
  duas vezes de propósito.

**Como corrigir.**
- **Uma camada de cache de dados** (TanStack Query, SWR): componentes que pedem a mesma
  `queryKey` compartilham uma requisição só. Ajuste `staleTime` (o padrão é 0, que busca de
  novo a cada montagem e a cada volta para a aba) para o quanto o dado aguenta ficar velho:
  30 a 60 s em lista de painel, minutos em cadastro que quase não muda.
- **Loader + componente com a mesma consulta:** defina um `queryOptions` e use nos dois.

  ```ts
  const leadsQuery = queryOptions({ queryKey: ["leads"], queryFn: buscarLeads, staleTime: 30_000 });

  export const Route = createFileRoute("/leads")({
    loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
    component: () => {
      const { data } = useSuspenseQuery(leadsQuery); // não busca de novo
      return <ListaDeLeads leads={data} />;
    },
  });
  ```

- **Sem camada de cache:** busque uma vez no componente pai e passe por props.
- **Supabase Auth:** `supabase.auth.getUser()` faz uma chamada ao servidor de Auth toda vez.
  No navegador, leia a sessão uma vez num provider e passe para baixo; não chame em cada
  componente.

**Cuidado.** `useEffect` que depende de um objeto ou função recriado a cada render busca em
loop. Confira as dependências.

---

<a id="05"></a>
## 05 · Paginar os resultados (TOP)

**O que é.** Trazer 20 ou 50 itens por vez em vez da tabela inteira. Com 50 registros não
faz diferença; com 50 mil, faz: no banco, na rede e no desenho da tela.

**Vale:** qualquer lista que cresce com o uso (leads, pedidos, clientes, mensagens,
tickets, logs). **Não vale:** lista que nunca passa de algumas dezenas (categorias,
status, etapas do funil).

**Como conferir.**
- DevTools → Network → requisição da lista → Response: conte os itens que vieram.
- No código: `.select(` sem `.range(` ou `.limit(` em tabela que cresce.

**Como corrigir.**
- **Por página (offset), bom para tabela com "página 1, 2, 3":**

  ```ts
  const POR_PAGINA = 20;
  const de = pagina * POR_PAGINA;
  const { data, count } = await supabase
    .from("leads")
    .select("id, nome, status, criado_em", { count: "estimated" })
    .order("criado_em", { ascending: false })
    .range(de, de + POR_PAGINA - 1);
  ```

- **Por cursor (keyset), bom para rolagem infinita e tabela grande:** em vez de pular N
  linhas, peça as que vêm depois da última vista. Use uma coluna de desempate para não
  perder linhas com a mesma data.

  ```sql
  select id, nome, criado_em from leads
  where (criado_em, id) < ($1, $2)
  order by criado_em desc, id desc
  limit 20;
  ```

  No supabase-js, `.lt("criado_em", cursor)` com `.order(...)` e `.limit(20)` resolve quando
  a data não se repete; com desempate, use uma função do Postgres (`rpc`).
- **TanStack Query:** `useInfiniteQuery` com `getNextPageParam` para rolagem;
  `placeholderData: keepPreviousData` para a troca de página não piscar.
- **API própria:** limite máximo no servidor (ex.: 100), mesmo que o cliente peça mais.

**Cuidado.**
- `count: "exact"` conta a tabela inteira a cada página e fica lento em tabela grande. Use
  `"estimated"` ou `"planned"`, ou não conte.
- `offset` alto é lento: o banco lê e descarta tudo o que pulou. Passou de algumas
  centenas de páginas, use cursor.
- O Supabase corta a resposta em 1000 linhas por padrão (configuração "Max rows" da API),
  sem erro. Lista "completa" que para em 1000 é isso.
- A coluna do `order by` precisa de índice (banco, item 17).

---

<a id="12"></a>
## 12 · Timeout nas APIs externas

**O que é.** Se a API de IA, de pagamento, de e-mail ou de CEP travar, o app desiste depois
de alguns segundos e mostra um erro com "tentar de novo", em vez de girar para sempre.

**Vale:** toda chamada a serviço de fora, incluindo webhooks do N8N. Ajuste o tempo ao
serviço: CEP, 3 a 5 s; pagamento, 10 a 15 s; IA com resposta longa, prefira streaming (item
13) com tempo máximo sem receber nada.

**Como conferir.**
- No código: `fetch(` sem `signal`, cliente HTTP sem `timeout`, SDK sem a opção de tempo.
- Teste: aponte a chamada para `https://httpbin.org/delay/30`. A tela tem que mostrar o erro
  e o "tentar de novo".

**Como corrigir.**
- **fetch:**

  ```ts
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      // mostrar "O serviço demorou para responder. Tentar de novo?"
    }
    throw e;
  }
  ```

  Junto com o botão "cancelar" da pessoa: `AbortSignal.any([controle.signal, AbortSignal.timeout(8000)])`.
- **supabase-js:** `.abortSignal(AbortSignal.timeout(5000))` na consulta.
- **SDK da Anthropic (TypeScript):** `new Anthropic({ timeout: 20_000, maxRetries: 2 })`, em
  milissegundos, ou por chamada no segundo argumento (`{ timeout: 20_000 }`).
- **Python:** `requests` não tem tempo padrão e espera para sempre: sempre
  `requests.get(url, timeout=(3, 10))` (conectar, ler). Com `httpx`:
  `httpx.Client(timeout=httpx.Timeout(10.0, connect=3.0))`.
- **N8N:** nó HTTP Request → Options → Timeout, e "Retry On Fail" só se a operação puder
  repetir sem estrago.

**Cuidado.** Repetir automaticamente só o que é seguro repetir (consulta). Pagamento e envio
de mensagem precisam de chave de idempotência, senão a pessoa é cobrada ou recebe duas
vezes. Os SDKs repetem a chamada depois de um timeout: o tempo total pode chegar a
`timeout × (tentativas + 1)`.

---

<a id="13"></a>
## 13 · Resposta da IA em streaming (TOP)

**O que é.** O texto da IA aparece enquanto é gerado, em vez de 20 segundos de tela parada e
tudo de uma vez. O tempo total é o mesmo; a espera percebida cai para o tempo até a primeira
palavra.

**Vale:** todo app que mostra texto gerado por IA (chat, resumo, rascunho de mensagem).
**Não vale:** quando a resposta é um JSON que o app processa antes de mostrar (extração,
classificação). Ali, mostre um estado de progresso.

**Como conferir.** Peça uma resposta longa: as primeiras palavras têm que aparecer antes do
fim. Na Network, a requisição fica aberta enquanto o texto chega (aba EventStream, se for
SSE).

**Como corrigir.** A chave da API fica só no servidor. Exemplo com a SDK da Anthropic numa
rota de servidor (TanStack Start, Worker ou Node), devolvendo texto puro em pedaços:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ timeout: 60_000 });

export function responderEmStreaming(pergunta: string, signal: AbortSignal) {
  const stream = client.messages.stream(
    { model: "claude-opus-5-5", max_tokens: 64000, messages: [{ role: "user", content: pergunta }] },
    { signal },
  );
  const encoder = new TextEncoder();
  const corpo = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        // a resposta completa, para salvar no banco só no fim:
        // const final = await stream.finalMessage();
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(corpo, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
```

Modelo, thinking e o resto da API da Claude: skill `claude-api`, se instalada.

No navegador, leia o corpo aos poucos:

```ts
const controle = new AbortController(); // ligar ao botão "parar"
const r = await fetch("/api/ia", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ pergunta }),
  signal: controle.signal,
});
const leitor = r.body!.pipeThrough(new TextDecoderStream()).getReader();
for (;;) {
  const { value, done } = await leitor.read();
  if (done) break;
  setTexto((t) => t + value);
}
```

- Com muitos pedaços por segundo, junte num `ref` e atualize a tela uma vez por quadro
  (`requestAnimationFrame`); renderizar Markdown a cada pedaço trava em resposta longa.
- **Vercel AI SDK:** `streamText` no servidor e `useChat`/`useCompletion` no front, se o
  projeto já usa.
- **Python (FastAPI):** `StreamingResponse(gerador(), media_type="text/plain")`, com o
  gerador lendo `stream.text_stream` da SDK da Anthropic.
- **N8N:** versões recentes têm resposta em streaming no Webhook e no Chat Trigger para o nó
  de agente; confira a versão instalada.

Mantenha: botão de parar, mensagem se a conexão cair no meio, timeout de inatividade, e
gravar a resposta no banco só no fim.

**Cuidado.** Proxy no meio pode segurar os pedaços: no nginx, `proxy_buffering off` ou o
cabeçalho `X-Accel-Buffering: no`. Middleware de compressão também pode (rede, item 09).

---

<a id="16"></a>
## 16 · Requisições independentes em paralelo

**O que é.** Se a tela precisa do perfil, dos pedidos e dos avisos, e um não depende do
outro, peça os três ao mesmo tempo. Em sequência, o tempo é a soma; em paralelo, é o da mais
lenta.

**Vale:** tela que carrega várias coisas. **Não vale:** quando a segunda precisa do
resultado da primeira (aí é em ordem mesmo; considere juntar as duas numa consulta só).

**Como conferir.**
- DevTools → Network → Waterfall. Barras em escada (uma começa quando a outra termina) são
  sequenciais; em paralelo, começam juntas.
- No código: `await` em linhas seguidas em que a de baixo não usa o resultado da de cima.

**Como corrigir.**
- `const [perfil, pedidos, avisos] = await Promise.all([buscarPerfil(), buscarPedidos(), buscarAvisos()]);`
- Se uma pode falhar sem derrubar a tela: `Promise.allSettled` e trate cada uma.
- **TanStack Router/Start:** loaders de rotas aninhadas já rodam em paralelo. Dentro de um
  loader, use `Promise.all`.
- **TanStack Query:** dois `useSuspenseQuery` no mesmo componente viram cascata (o segundo só
  começa depois do primeiro). Use `useSuspenseQueries`, ou chame `ensureQueryData` das duas
  no loader. `useQuery` comuns já rodam em paralelo.
- **Cascata de componentes:** pai busca, renderiza o filho, o filho busca. Suba as buscas
  para o loader da rota.
- **Python:** `await asyncio.gather(...)` com `httpx.AsyncClient`.

**Cuidado.** Paralelo demais contra a mesma API externa estoura limite de taxa (429).
`Promise.all` falha inteiro se uma falhar.
