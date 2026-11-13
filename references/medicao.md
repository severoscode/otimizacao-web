# Medição

Sem medir, é chute. Itens 18, 30 e 31, mais como usar o Lighthouse, o PageSpeed Insights e
os scripts desta skill, e como apresentar o antes e depois.

## Sumário

- [Laboratório e campo](#lab)
- [Medida certa para cada tipo de item](#medida)
- [Lighthouse e os scripts](#lighthouse)
- [31 Testar no celular e em rede lenta](#31)
- [30 Medir os usuários reais](#30)
- [18 Rastrear requisições lentas](#18)
- [Relatório de antes e depois](#relatorio)

---

<a id="lab"></a>
## Laboratório e campo

- **Laboratório** (Lighthouse, PageSpeed, DevTools): uma carga simulada, num aparelho e numa
  rede escolhidos. Bom para achar a causa e comparar antes e depois. Não mede INP (não há
  ninguém clicando); o TBT é o sinal mais próximo.
- **Campo** (CrUX, RUM): o que aconteceu de verdade com as pessoas, no celular e na internet
  delas, no p75. É o que o Google usa. Precisa de tráfego.

Quando os dois discordam, vale o campo. Use o laboratório para descobrir o porquê.

<a id="medida"></a>
## Medida certa para cada tipo de item

| Item | Medida que dá para repetir |
|---|---|
| 01, 02, 15, 20, 29, extras | LCP e CLS do Lighthouse no celular (mediana de 3 rodadas) |
| 21, 22, 11, 26 | TBT do Lighthouse; KB de JS na primeira carga; INP gravado na aba Performance |
| 03, 16 | número de requisições e a Waterfall ao abrir a tela |
| 04 | requisições ao digitar uma palavra |
| 05, 24 | tamanho da resposta (Size) e tempo da requisição |
| 06, 09, 27 | cabeçalhos (`conferir-entrega.mjs`); tamanho transferido; segunda visita |
| 08 | número de consultas por tela |
| 17, RLS | "Execution Time" do `EXPLAIN ANALYZE` |
| 19, 25 | tempo da consulta medido no servidor (`Server-Timing`) |
| 07, 12, 13 | tempo até a resposta; tempo até a primeira palavra |
| 10 | tempo da rota com cache vazio e cheio |

---

<a id="lighthouse"></a>
## Lighthouse e os scripts

Meça sempre o build de produção, nunca o servidor de desenvolvimento:

```bash
npm run build && npm run preview     # ou a URL publicada
```

**Lighthouse local** (caminho garantido; funciona com localhost):

```bash
npx lighthouse http://localhost:4173 --only-categories=performance --locale=pt-BR \
  --output=json --output-path=lh.json --chrome-flags="--headless=new" --quiet
node scripts/medir-pagina.mjs lh.json
```

- Sem Chrome instalado, aponte `CHROME_PATH` para outro Chromium: o Edge
  (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` no Windows) ou o do
  Playwright.
- O padrão do Lighthouse já é celular com rede e CPU lentas simuladas. `--preset=desktop`
  mede o computador.
- O aviso de que o aparelho testado tem CPU mais lenta do que o Lighthouse espera quer dizer
  que a nota sai pior que a real. Compare sempre na mesma máquina.
- Com `--locale=pt-BR`, títulos, fases e avisos saem traduzidos. Os ids (`lcp-breakdown-insight`,
  `render-blocking-insight`, `third-parties-insight`) não mudam: o `medir-pagina.mjs` mostra
  cada id entre crases.
- O Lighthouse varia de uma rodada para outra. Para antes e depois, rode 3 vezes e use a
  mediana.

**PageSpeed Insights** (URL pública; traz também o campo, se houver tráfego):

```bash
node scripts/medir-pagina.mjs https://site.com.br            # celular
node scripts/medir-pagina.mjs https://site.com.br --desktop
```

A cota sem chave é dividida com todo mundo e acaba cedo (erro 429). Uma chave gratuita do
Google Cloud resolve: defina `PSI_API_KEY`. O site pagespeed.web.dev mostra o mesmo, no
navegador.

**Entrega da página** (CDN, compressão, cache, imagens, fontes, terceiros):

```bash
node scripts/conferir-entrega.mjs https://site.com.br
```

**Como ler o resumo do Lighthouse:**
- **Elemento do LCP e as quatro fases** (insight `lcp-breakdown-insight`). Tempo até o
  primeiro byte (TTFB) alto aponta servidor ou região (19, 20). Atraso de carga do recurso
  (resource load delay) alto: a imagem foi descoberta tarde (15, preload). Duração da carga
  (resource load duration) alta: imagem pesada (02). Atraso de renderização do elemento
  (element render delay) alto: o elemento existe mas demora a aparecer (fonte, JS travando,
  animação de entrada).
- **TBT alto:** JavaScript demais rodando no carregamento (22, 11, 21, 26).
- Cada achado vem com o número do item da skill entre colchetes.

---

<a id="31"></a>
## 31 · Testar no celular e em rede lenta (TOP)

**O que é.** O notebook com wi-fi bom esconde quase tudo. Quem chega pelo Instagram ou pelo
WhatsApp está no celular, muitas vezes no 4G fraco e num aparelho intermediário.

**Vale:** sempre, antes e depois de cada mudança.

**Como conferir.**
- DevTools → ícone de celular (Ctrl+Shift+M) → Network em "Slow 4G". Na aba Performance,
  ligue o CPU throttling (4x ou 6x).
- No celular de verdade, no 4G, com o wi-fi desligado. Android: `chrome://inspect` no
  computador mostra o DevTools do celular pelo cabo. iPhone: Safari do Mac → Desenvolver.
- Teste também no iPhone: o Safari tem diferenças (vídeo, rolagem, `100vh`).

---

<a id="30"></a>
## 30 · Medir a velocidade dos usuários reais (RUM)

**O que é.** O Lighthouse testa uma máquina; isto mede no celular de quem usa o app, com a
internet de verdade, página por página.

**Vale:** assim que o app tem usuários. **Não vale:** antes de ter tráfego (não há dado).

**Como fazer.**
- **Cloudflare Web Analytics:** gratuito, mostra LCP, INP e CLS por página. Em site que
  passa pelo proxy da Cloudflare dá para ligar no painel; senão, é um script pequeno.
- **Vercel Speed Insights,** em projeto na Vercel.
- **Biblioteca `web-vitals`** mandando para um endpoint seu:

  ```ts
  import { onCLS, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

  function enviar(m: Metric) {
    const corpo = JSON.stringify({ nome: m.name, valor: m.value, nota: m.rating, pagina: location.pathname });
    navigator.sendBeacon("/api/vitals", corpo);
  }
  onCLS(enviar);
  onINP(enviar);
  onLCP(enviar);
  onTTFB(enviar);
  ```

- **CrUX** (dados do Chrome): no PageSpeed Insights e no relatório "Core Web Vitals" do
  Google Search Console, para sites com tráfego suficiente.

Compare o p75 de cada página com as metas: LCP 2,5 s, INP 200 ms, CLS 0,1.

---

<a id="18"></a>
## 18 · Rastrear requisições lentas (OpenTelemetry)

**O que é.** Cada requisição vira uma linha do tempo: quanto foi no banco, quanto na API de
fora, quanto no seu código.

**Vale:** backend com várias etapas em que não se sabe onde está a demora. **Não vale:** app
pequeno. Comece pelo simples: logar o tempo de cada rota e de cada consulta.

**Do simples ao completo:**

1. **`Server-Timing`:** o servidor diz quanto gastou em cada etapa, e o DevTools mostra na
   aba Timing da requisição.

   ```ts
   const t0 = performance.now();
   const leads = await buscarLeads();
   const t1 = performance.now();
   const resumo = await resumirComIA(leads);
   const t2 = performance.now();
   return new Response(JSON.stringify(resumo), {
     headers: {
       "content-type": "application/json",
       "server-timing": `db;dur=${(t1 - t0).toFixed(0)}, ia;dur=${(t2 - t1).toFixed(0)}`,
     },
   });
   ```

   No Cloudflare Workers, o relógio só anda durante I/O (fetch, banco). Para medir consulta e
   chamada externa isso basta; para medir CPU pura, não serve.
2. **Logs com tempo** por rota, na plataforma: Cloudflare Workers Observability
   (`"observability": { "enabled": true }` no `wrangler.jsonc`), logs da Vercel, Logs do
   Supabase.
3. **OpenTelemetry:**
   - **Cloudflare Workers:** a observabilidade da Cloudflare gera traces e exporta por OTLP
     para Honeycomb, Grafana, Sentry e outros (confira o estado no painel e na documentação).
   - **Next:** `instrumentation.ts` com `@vercel/otel`.
   - **Python:** `opentelemetry-instrument` com as instrumentações de FastAPI, httpx,
     SQLAlchemy e psycopg.
   - Onde ver: Sentry, Honeycomb, Grafana Cloud, SigNoz, ou Jaeger local.

Abra a requisição lenta na ferramenta e veja qual trecho ocupa mais tempo; esse trecho
aponta o item.

---

<a id="relatorio"></a>
## Relatório de antes e depois

Ao terminar um item, entregue assim, com números medidos do mesmo jeito:

```markdown
### Item 24 · Só as colunas usadas (tela de Leads)

| Medida | Antes | Depois |
|---|---|---|
| Resposta da lista (Size) | 412 KB | 38 KB |
| Tempo da requisição (mediana de 3) | 820 ms | 240 ms |
| LCP no celular (Lighthouse, mediana de 3) | 3,9 s | 3,1 s |

Mudou: src/features/leads/consultas.ts:18 (select com 6 colunas em vez de *).
Testar à mão: abrir Leads, filtrar por status, abrir um lead (o detalhe busca a descrição).
```

Se não melhorou, diga isso com os números e proponha desfazer.
