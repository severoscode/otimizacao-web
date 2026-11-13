# Rede

O caminho entre o servidor e o celular da pessoa. Itens 06, 09, 19 e 27.

Para conferir cabeçalhos pelo terminal no Windows, use `curl.exe` (no PowerShell 5.1,
`curl` sozinho é outro comando):

```bash
curl.exe -sI -H "Accept-Encoding: br, gzip" https://site.com.br/assets/index-AbC123.js
```

Ou rode `node scripts/conferir-entrega.mjs <url>`, que confere a página e todos os
arquivos dela de uma vez.

## Sumário

- [06 Estáticos por CDN](#06)
- [09 Compressão Brotli ou Gzip](#09)
- [19 Servidor perto do banco](#19)
- [27 Cache dos estáticos no navegador](#27)

---

<a id="06"></a>
## 06 · Arquivos estáticos por uma CDN

**O que é.** Imagem, CSS, JS e fonte ficam copiados em servidores espalhados pelo mundo e
saem do mais perto de quem acessa.

**Vale:** app que roda num servidor próprio (VPS, Docker, hospedagem compartilhada). **Não
vale:** Cloudflare Workers ou Pages, Vercel e Netlify, que já entregam os estáticos pela CDN
deles. Confira e passe para o próximo.

**Como conferir.** DevTools → Network → clique num arquivo JS → Headers. Procure
`cf-cache-status: HIT` (Cloudflare), `x-vercel-cache: HIT`, `x-cache: Hit`, ou um `age`
maior que zero. O `conferir-entrega.mjs` mostra isso na coluna CDN.

**Como corrigir.**
- Servidor próprio: ponha a Cloudflare na frente (proxy, a nuvem laranja no DNS) e crie uma
  regra de cache para `/assets/*`.
- Arquivos grandes enviados por usuários: guarde num storage com CDN (Supabase Storage,
  Cloudflare R2 com domínio próprio) em vez do disco do servidor.

**Cuidado.** Nunca deixe a CDN guardar resposta que depende de quem está logado (HTML com
dados da pessoa, API com cookie). Isso entrega os dados de um usuário para outro.

---

<a id="09"></a>
## 09 · Compressão Brotli ou Gzip

**O que é.** Texto (HTML, CSS, JS, JSON, SVG) é compactado antes de viajar e o navegador
descompacta. Costuma cortar de 60% a 80% do tamanho.

**Vale:** servidor próprio (nginx, Node, Python). **Não vale:** Cloudflare, Vercel e
Netlify, que já comprimem.

**Como conferir.** Response Headers do arquivo: `content-encoding: br` (Brotli), `gzip` ou
`zstd`. O `conferir-entrega.mjs` avisa texto sem compressão.

**Como corrigir.**
- **nginx:** `gzip on; gzip_types text/css application/javascript application/json image/svg+xml;`
  e, com o módulo `ngx_brotli`, `brotli on;` com os mesmos tipos.
- **Node (Express):** middleware `compression()`.
- **FastAPI/Starlette:** `app.add_middleware(GZipMiddleware, minimum_size=1000)`.
- **Servidor só de arquivos:** gere `.br` e `.gz` no build (plugin de compressão do Vite) e
  sirva o pré-comprimido.

**Cuidado.** Não comprima o que já é comprimido (JPG, PNG, WebP, AVIF, WOFF2, MP4): só gasta
CPU. Compressão em resposta de streaming (SSE, IA) pode segurar os pedaços até juntar um
bloco: confira se o middleware ignora `text/event-stream`, ou desligue nela.

---

<a id="19"></a>
## 19 · Servidor perto do banco de dados (TOP)

**O que é.** Cada consulta vai e volta entre o servidor e o banco. Com o servidor nos EUA e
o banco em São Paulo, cada ida e volta atravessa o continente (uns 120 a 150 ms). Uma tela
que faz 5 consultas em sequência perde quase um segundo só de viagem.

**Vale:** muito, quando o código do servidor consulta o banco (server functions, rotas de
API, loaders, Workers, Python), principalmente com várias consultas em sequência. **Não
vale:** quando o front fala direto com o Supabase pelo navegador e não há servidor no meio.
Aí o que conta é a região do Supabase em relação aos usuários: para público no Brasil,
`sa-east-1` (São Paulo).

**Como conferir.**
- **Supabase:** Project Settings → General → região do projeto.
- **Vercel:** Project → Settings → Functions → Function Region. O padrão é Washington
  (`iad1`).
- **Cloudflare Workers:** por padrão o Worker roda no ponto da Cloudflare mais perto de
  quem acessa (para quem está no Brasil, no Brasil). Com banco em São Paulo e público
  brasileiro, já está perto. Com banco nos EUA, cada consulta atravessa.
- **Servidor próprio:** a região da VPS em relação à do banco.
- Medida: logue o tempo de cada consulta no servidor, ou mande um cabeçalho `Server-Timing`
  (ver medicao, item 18) e leia na aba Timing da requisição.

**Como corrigir.**
- **Vercel:** troque a região das funções para a do banco (São Paulo é `gru1`) nas
  configurações do projeto ou em `vercel.json` (`"regions": ["gru1"]`).
- **Cloudflare Workers:** `"placement": { "mode": "smart" }` no `wrangler.jsonc` faz a
  Cloudflare rodar o Worker perto do banco quando ele faz várias idas e voltas por
  requisição. Com conexão direta ao Postgres, o Hyperdrive (item 25) também encurta o
  caminho.
- **Supabase:** a região não muda depois de criado o projeto; mudar é migrar para um
  projeto novo. Escolha certo na criação.
- **Menos viagens:** junte as consultas de uma tela numa só (relação embutida, JOIN) ou numa
  função do Postgres chamada com `supabase.rpc()`. Uma ida e volta longa é melhor que
  cinco.

**Cuidado.** Smart Placement afasta o Worker de quem acessa; só compensa quando a conversa
com o banco pesa mais que a distância até o usuário. Meça antes e depois.

---

<a id="27"></a>
## 27 · Cache dos estáticos no navegador

**O que é.** Arquivo que não muda fica guardado no aparelho e não é baixado de novo na
próxima visita nem na próxima página.

**Vale:** arquivos com hash no nome (`index-B2NdayeP.js`, `foto-D65LfEvC.webp`), que o build
gera de novo com outro nome quando mudam. **Não vale:** no HTML, em dado que muda, nem em
arquivo sem hash (`favicon.ico`, `og.jpg`): ali a pessoa ficaria com a versão velha.

**Como conferir.**
- Response Headers do JS: `cache-control: public, max-age=31536000, immutable`.
- Recarregue a página: a coluna Size mostra "(memory cache)" ou "(disk cache)".
- O `conferir-entrega.mjs` lista os arquivos com hash que estão sem cache longo.

**Como corrigir.**
- **Cloudflare Workers (Static Assets):** o padrão é `public, max-age=0, must-revalidate`,
  ou seja, o navegador pergunta ao servidor a cada visita. Crie `public/_headers` (o Vite
  copia para a raiz do build, que é de onde o Workers lê):

  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```

  Depois do deploy, confira o cabeçalho num arquivo de `/assets/`. Se a requisição passa
  pelo código do Worker antes dos assets (`run_worker_first`), o cabeçalho pode ter de ser
  posto no próprio Worker.
- **Netlify e Cloudflare Pages:** o mesmo arquivo `_headers`.
- **Vercel:** o Next já marca `/_next/static` como imutável. Em projeto Vite, configure
  `headers` no `vercel.json` para `/assets/(.*)`.
- **nginx:** `location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }`.

**Cuidado.** Nunca ponha cache longo no HTML: ele aponta para os arquivos novos, e um HTML
velho guardado aponta para arquivos que o deploy apagou. Por isso o HTML fica com
`max-age=0` (ou sem cache) e só os arquivos com hash ganham um ano.
