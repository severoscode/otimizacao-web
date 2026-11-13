---
name: otimizacao-web
description: Deixa páginas e sistemas web mais rápidos com um checklist de 31 itens (frontend, rede, API, backend, banco de dados e medição). Faz auditoria só de leitura, corrige um item por vez medindo antes e depois, e aplica os padrões certos ao escrever código novo. Use sempre que falarem em página, site, app ou sistema lento, demorando, travando ou pesado; em otimizar, acelerar ou melhorar performance; em Core Web Vitals, LCP, INP, CLS, TTFB, Lighthouse ou PageSpeed; em bundle grande, imagem pesada, fonte, cache, CDN, compressão, consulta lenta, N+1, índice, paginação, debounce, skeleton, timeout, fila ou streaming de IA, mesmo sem a palavra "otimização". Use também ao criar listas, buscas, integrações com APIs externas, chamadas de IA e consultas ao Supabase ou Postgres, para o código já nascer rápido. Cobre TanStack Start, React, Vite, Next.js, Cloudflare Workers, Vercel, Supabase, Postgres, Python e N8N.
---

# Otimização web

Checklist de 31 itens para deixar página e sistema rápidos, com um jeito de conferir cada
um e o modo de corrigir nas stacks que mais usamos. A regra que vale para tudo: **meça,
mude uma coisa, meça de novo**.

## Metas

O Google chama de "bom" quando 75% das visitas (p75) ficam dentro destes limites, no
celular e no computador:

| Métrica | O que mede | Bom |
|---|---|---|
| **LCP** | quando o conteúdo principal aparece | ≤ 2,5 s |
| **INP** | quanto a tela demora a responder a um toque ou clique | ≤ 200 ms |
| **CLS** | quanto a tela pula enquanto carrega | ≤ 0,1 |
| TTFB (apoio) | quando chega o primeiro byte do HTML | ≤ 0,8 s |
| FCP (apoio) | quando aparece o primeiro conteúdo | ≤ 1,8 s |

API e banco não têm meta universal: compare com a linha de base da própria rota (tempo
médio e p95, tamanho da resposta, número de consultas).

## Regras de trabalho

1. **Meça antes.** Sem o número do "antes", não dá para dizer que melhorou. Guarde-o.
2. **Um item por vez.** Mudando cinco coisas juntas, ninguém sabe o que ajudou nem o que
   quebrou.
3. **Não precisa dos 31.** Num app pequeno, uns 10 resolvem quase tudo. Fila, Redis,
   OpenTelemetry e várias instâncias são para quando o app cresce.
4. **Não invente número.** Evidência é `arquivo:linha` ou uma medida feita. Se não mediu,
   escreva "não medido". Ganho estimado não é ganho medido.
5. **Banco e produção são do usuário.** Mostre o SQL (índice, migração) e espere a pessoa
   rodar ou liberar. `EXPLAIN ANALYZE` executa a consulta: use só com `SELECT`.
6. **Fique no item.** Não refatore fora dele nem troque biblioteca sem perguntar.
7. **Meça o build de produção.** O servidor de desenvolvimento não minifica, não divide e,
   com o StrictMode do React, roda os efeitos duas vezes. Use `npm run build` e
   `npm run preview` (ou a URL publicada).

## Passo 0: reconhecer o sistema

Antes de qualquer item, descubra e resuma em até 5 linhas:

- **Framework:** `package.json` (TanStack Start/Router, Next, Vite puro, Astro), ou
  `requirements.txt`/`pyproject.toml` (FastAPI, Django, Flask), ou workflows do N8N.
- **Onde roda:** `wrangler.jsonc`/`wrangler.toml` (Cloudflare Workers), `vercel.json` ou
  `.vercel/` (Vercel), `netlify.toml`, `Dockerfile`/`nginx.conf` (servidor próprio).
- **Banco:** `@supabase/supabase-js`, pasta `supabase/`, `pg`, `postgres`, Prisma,
  Drizzle, SQLAlchemy.
- **Como o front busca dados:** supabase-js direto do navegador, server functions,
  loaders de rota, rotas de API.
- **Se chama IA ou APIs externas** (pagamento, e-mail, WhatsApp, CEP).

Depois leia a seção da stack em [references/stacks.md](references/stacks.md): ela diz o
que já vem resolvido na plataforma e onde ficam os ajustes.

## Os 31 itens

TOP = comece por esses. A coluna "Vale quando" é a triagem rápida; o detalhe (o que é,
quando não vale, como conferir, como corrigir em cada stack) está no arquivo indicado.

| # | Item | Vale quando | Arquivo |
|---|---|---|---|
| 01 | Skeleton de carregamento · TOP | tela busca dados depois de abrir | [frontend](references/frontend.md#01) |
| 02 | Imagens em WebP/AVIF, no tamanho exibido · TOP | quase sempre | [frontend](references/frontend.md#02) |
| 03 | Evitar chamadas duplicadas | sempre | [api](references/api.md#03) |
| 04 | Debounce na busca e no autocompletar · TOP | campo que busca no servidor | [frontend](references/frontend.md#04) |
| 05 | Paginar os resultados · TOP | lista que cresce com o uso | [api](references/api.md#05) |
| 06 | Estáticos por CDN | servidor próprio (VPS) | [rede](references/rede.md#06) |
| 07 | Tarefas lentas numa fila | tarefa de vários segundos | [backend](references/backend.md#07) |
| 08 | Corrigir consultas N+1 · TOP | sempre | [banco](references/banco.md#08) |
| 09 | Compressão Brotli/Gzip | servidor próprio | [rede](references/rede.md#09) |
| 10 | Cache (Redis, KV) dos dados mais pedidos | consulta pesada, muito pedida, que muda pouco | [backend](references/backend.md#10) |
| 11 | Remover dependências sem uso | projeto com muita iteração | [frontend](references/frontend.md#11) |
| 12 | Timeout nas APIs externas | toda chamada para fora | [api](references/api.md#12) |
| 13 | Resposta da IA em streaming · TOP | app mostra texto gerado por IA | [api](references/api.md#13) |
| 14 | Atualizar a tela sem esperar o servidor | ação simples que quase nunca falha | [frontend](references/frontend.md#14) |
| 15 | Lazy loading nas imagens fora da tela · TOP | listas e páginas longas (nunca no topo) | [frontend](references/frontend.md#15) |
| 16 | Requisições independentes em paralelo | tela carrega várias coisas | [api](references/api.md#16) |
| 17 | Índices nas consultas mais comuns · TOP | filtro e ordenação em tabela que cresce | [banco](references/banco.md#17) |
| 18 | Rastrear requisições lentas (OpenTelemetry) | backend com várias etapas | [medicao](references/medicao.md#18) |
| 19 | Servidor perto do banco · TOP | servidor consulta o banco | [rede](references/rede.md#19) |
| 20 | Renderizar no servidor ou no build | página pública que precisa de Google | [frontend](references/frontend.md#20) |
| 21 | Scripts de terceiros depois da página | pixel, chat, analytics, mapa | [frontend](references/frontend.md#21) |
| 22 | Dividir o JavaScript por página | componente pesado em uma tela só | [frontend](references/frontend.md#22) |
| 23 | Virtualizar listas longas | centenas de linhas numa tela | [frontend](references/frontend.md#23) |
| 24 | Pedir só as colunas usadas · TOP | sempre, principalmente em lista | [banco](references/banco.md#24) |
| 25 | Pool de conexões | servidor conecta direto no Postgres | [banco](references/banco.md#25) |
| 26 | Evitar re-render desnecessário | tela trava ao digitar ou rolar | [frontend](references/frontend.md#26) |
| 27 | Cache dos estáticos no navegador | arquivos com hash no nome | [rede](references/rede.md#27) |
| 28 | Várias instâncias com balanceador | servidor próprio no limite | [backend](references/backend.md#28) |
| 29 | Fontes no próprio domínio, poucos pesos | fonte customizada | [frontend](references/frontend.md#29) |
| 30 | Medir os usuários reais (RUM) | app já tem tráfego | [medicao](references/medicao.md#30) |
| 31 | Testar no celular e em rede lenta · TOP | sempre, antes e depois | [medicao](references/medicao.md#31) |

## Por onde começar

Impacto alto e esforço baixo primeiro.

**Sistema com dados** (painel, SaaS, app com Supabase):

1. **31** meça no celular com rede lenta e guarde o "antes";
2. **19** servidor e banco na mesma região (é configuração, não código);
3. **24** só as colunas usadas;
4. **08** N+1;
5. **17** índices nas colunas de filtro e ordenação, com o `EXPLAIN` do lado (e as
   políticas de RLS, no Supabase);
6. **02 + 15** imagens leves e lazy, menos a do topo;
7. **01** skeleton nas telas que buscam dados;
8. **05** paginação nas listas que crescem;
9. **13** streaming, se o app tem IA;
10. **04** debounce na busca.

Depois: 03, 12, 16, 27, 21, 22, 29, 14, 26, 30. Só quando crescer: 07, 10, 18, 23, 28.
Conferir e seguir: 06 e 09 (Cloudflare e Vercel já fazem) e 25 (só com conexão direta ao
Postgres).

**Landing page ou site institucional** (sem banco, com animação):

1. **31** meça no celular;
2. **02 + 15** imagem do topo leve, sem lazy e com `fetchpriority="high"`; o resto lazy;
3. a animação de entrada não pode esconder o elemento do LCP por muito tempo (ver
   [frontend.md, "Extras de landing page"](references/frontend.md#extras));
4. **29** fontes no próprio domínio, 2 ou 3 arquivos;
5. **21** pixel, chat e analytics depois da página;
6. **20** HTML já com o texto (SSR ou pré-renderizado);
7. **27** cache longo nos arquivos com hash;
8. **22** e **11** JavaScript só do que a página usa;
9. **30** medir os usuários reais.

## Modos de trabalho

Descubra pelo pedido qual modo vale. Na dúvida, comece pela auditoria.

### Auditoria (só leitura)

Para "audita a performance", "por que está lento", "o que dá para melhorar".

1. Não altere, crie nem apague arquivo do projeto; não instale pacote; não mexa no banco.
   Comandos que só leem ou medem (os scripts desta skill, `npx knip`, `npm run build`)
   podem rodar, e a saída deles (`lh.json`, `dist/`) pode ficar.
2. Faça o Passo 0.
3. Meça o que der (ver "Ferramentas"): a URL publicada, ou o build local.
4. Percorra os 31 itens com o "como conferir" de cada arquivo de referência.
5. Liste as consultas ao banco (`arquivo:linha`) e marque as com `select('*')`, as que
   rodam dentro de loop e as que filtram ou ordenam por coluna talvez sem índice. Para cada
   suspeita, entregue o `EXPLAIN ANALYZE` (só `SELECT`) para o usuário rodar.
6. Entregue neste formato:

```markdown
## Sistema
(as 5 linhas do Passo 0)

## Medidas de agora
(nota e métricas do Lighthouse no celular, campo se houver, achados do conferir-entrega)

## Checklist
| # | Item | Status | Evidência | Impacto | Esforço |
|---|---|---|---|---|---|
| 01 | Skeleton | FALTA | src/routes/leads.tsx:42 mostra spinner solto | médio | baixo |

## Consultas ao banco
(lista com arquivo:linha, o problema e o EXPLAIN para rodar)

## Próximos 5
1. Item, o que mudar em uma frase, por que primeiro.
```

- **Status:** `OK`, `FALTA`, `NÃO SE APLICA` (diga o porquê em poucas palavras, ex.: fila
  num app pequeno no Workers) ou `NÃO VERIFICADO` (depende de painel, produção ou medida
  que você não alcança; diga exatamente onde olhar ou o que rodar).
- **Impacto e esforço:** alto, médio ou baixo, pensando no tamanho real deste app.

Pare depois dos "Próximos 5" e espere a pessoa escolher.

### Correção (um item por vez)

Para "corrige o item X", "aplica o debounce", ou depois de uma auditoria.

1. **Antes:** defina uma medida que dê para repetir (tamanho da resposta na aba Network,
   número de requisições, tempo da rota, tempo do `EXPLAIN ANALYZE`, LCP do Lighthouse no
   celular). Meça. Se não der para medir daqui, passe o passo a passo e espere o número.
2. **Plano:** liste os arquivos e o que muda em cada um. Espere o "pode", a não ser que a
   pessoa já tenha liberado aplicar direto.
3. **Aplique só esse item.**
4. **Rode** o build, o lint e os testes que o projeto tiver.
5. **Depois:** repita a mesma medida e mostre antes × depois com números reais. Se não
   melhorou ou piorou, diga isso e proponha desfazer.
6. **Teste à mão:** diga qual tela abrir e o que clicar para ver que nada quebrou.

SQL de índice ou migração: mostre e espere a pessoa rodar. Commit só se ela pedir.

### Construção (código novo)

Ao escrever código novo, já nasça rápido, sem pedir licença para o óbvio:

- **Lista que cresce:** paginação (20 a 50 por vez), só as colunas usadas, índice na coluna
  de filtro e ordenação.
- **Dados relacionados:** uma consulta com relação embutida ou JOIN, nunca consulta por
  item de lista.
- **Tela que busca dados:** skeleton com o tamanho final, mais os estados vazio e erro
  (com "tentar de novo").
- **Campo de busca:** debounce de ~300 ms, cancelar a requisição anterior, mínimo de 2
  caracteres.
- **Chamada para fora** (IA, pagamento, e-mail, WhatsApp): timeout e erro que a pessoa
  entende.
- **Texto de IA mostrado ao usuário:** streaming.
- **Buscas independentes:** em paralelo (`Promise.all`).
- **Imagem:** WebP/AVIF no tamanho exibido, `width` e `height`, lazy fora da primeira
  tela; a do topo com `fetchpriority="high"`.
- **Componente pesado** (editor, gráfico, mapa) usado numa tela só: carregar sob demanda.
- **Script de terceiro:** depois da página.
- **Fonte:** WOFF2 no próprio domínio, 2 ou 3 pesos, `font-display: swap`.

Não monte por conta própria fila, Redis, virtualização ou várias instâncias: isso é
decisão de quando o app cresce. Sugira, explicando o porquê.

## Ferramentas desta skill

Os scripts ficam na pasta `scripts/` desta skill e só precisam do Node 18+.

- `node scripts/conferir-entrega.mjs https://site.com.br`: baixa a página e os arquivos que
  ela usa e confere CDN, compressão, `cache-control`, formato e peso das imagens, lazy e
  `width`/`height`, fontes, scripts de terceiros que travam a página e se o HTML chega com
  texto. Cada aviso já vem com o número do item.
- `node scripts/medir-pagina.mjs lh.json`: resume um relatório do Lighthouse (nota,
  métricas, elemento do LCP e suas fases, o que corrigir com o número do item). Para gerar o
  `lh.json`:

  ```bash
  npx lighthouse <url> --only-categories=performance --locale=pt-BR --output=json \
    --output-path=lh.json --chrome-flags="--headless=new" --quiet
  ```

  Sem Chrome instalado, aponte `CHROME_PATH` para o Edge ou para o Chromium do Playwright.
  Com URL pública, `node scripts/medir-pagina.mjs https://site.com.br` usa o PageSpeed
  Insights e traz também os dados de usuários reais (CrUX), mas a cota sem chave acaba
  cedo: defina `PSI_API_KEY` ou use o Lighthouse local.

Detalhes, leitura dos números e como comparar antes e depois:
[references/medicao.md](references/medicao.md).

## Referências

Leia só o arquivo da camada em que está trabalhando.

- [references/frontend.md](references/frontend.md): itens 01, 02, 04, 11, 14, 15, 20, 21,
  22, 23, 26, 29 e os extras de landing page (animação e LCP, vídeo, `content-visibility`).
- [references/rede.md](references/rede.md): itens 06, 09, 19, 27.
- [references/api.md](references/api.md): itens 03, 05, 12, 13, 16.
- [references/backend.md](references/backend.md): itens 07, 10, 28.
- [references/banco.md](references/banco.md): itens 08, 17, 24, 25 e RLS lenta no Supabase.
- [references/medicao.md](references/medicao.md): itens 18, 30, 31, Lighthouse, PSI e o
  relatório de antes e depois.
- [references/stacks.md](references/stacks.md): TanStack Start + Cloudflare Workers, Vite
  SPA, Next + Vercel, Supabase, Python, N8N e animações (GSAP).

Se estiverem instaladas, estas skills aprofundam partes do checklist:
`supabase-postgres-best-practices` (banco), `vercel-react-best-practices` (React),
`gsap-performance` (animação) e `claude-api` (chamadas à API da Claude).
