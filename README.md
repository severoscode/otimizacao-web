# otimizacao-web

Skill de performance web para o [Claude Code](https://claude.com/claude-code): um checklist
de 31 itens para deixar páginas e sistemas mais rápidos, com o jeito de conferir cada um e o
modo de corrigir nas stacks mais comuns. Tudo em português.

- **Auditoria só de leitura:** percorre os 31 itens no projeto e devolve uma tabela com
  status, evidência (`arquivo:linha` ou medida), impacto e esforço, mais os 5 próximos passos.
- **Correção de um item por vez:** mede antes, mostra o plano, aplica só aquele item, roda
  build e lint, mede depois e mostra antes × depois com números reais.
- **Código novo já rápido:** paginação, colunas certas, debounce, timeout, streaming de IA,
  imagens e fontes leves desde a primeira versão.

## Os 31 itens

| Camada | Itens |
|---|---|
| Frontend | skeleton, WebP/AVIF, debounce, dependências sem uso, UI otimista, lazy loading, SSR/build, scripts de terceiros, divisão do JS, listas virtualizadas, re-render, fontes |
| Rede | CDN, Brotli/Gzip, servidor perto do banco, cache dos estáticos |
| API | chamadas duplicadas, paginação, timeout, streaming de IA, requisições em paralelo |
| Backend | fila, cache (Redis/KV), várias instâncias |
| Banco | N+1, índices (e RLS no Supabase), só as colunas usadas, pool de conexões |
| Medição | OpenTelemetry, usuários reais (RUM), celular em rede lenta |

Cobre TanStack Start, React, Vite, Next.js, Cloudflare Workers, Vercel, Supabase, Postgres,
Python e N8N.

## Instalar

Para valer em todos os projetos, clone na pasta de skills do usuário:

```bash
# macOS / Linux
git clone https://github.com/severoscode/otimizacao-web ~/.claude/skills/otimizacao-web
```

```powershell
# Windows (PowerShell)
git clone https://github.com/severoscode/otimizacao-web "$env:USERPROFILE\.claude\skills\otimizacao-web"
```

Só num projeto: clone em `.claude/skills/otimizacao-web` dentro dele.

Atualizar: `git -C ~/.claude/skills/otimizacao-web pull`.

## Usar

O Claude Code carrega a skill sozinho quando o assunto é lentidão ou performance. Também dá
para chamar direto com `/otimizacao-web`. Exemplos:

- "audita a performance deste projeto"
- "a tela de leads demora uns 4 segundos para abrir, descobre o porquê"
- "corrige o item 24 da auditoria"
- "mede o site em produção no celular"

## Scripts

Dois scripts Node, sem dependências (Node 18+), na pasta `scripts/`:

```bash
# Entrega da página: CDN, compressão, cache, imagens, fontes, terceiros, SSR
node scripts/conferir-entrega.mjs https://seu-site.com.br

# Resumo do Lighthouse: nota, métricas, elemento do LCP e o que corrigir
npx lighthouse https://seu-site.com.br --only-categories=performance --locale=pt-BR \
  --output=json --output-path=lh.json --chrome-flags="--headless=new" --quiet
node scripts/medir-pagina.mjs lh.json

# Ou pelo PageSpeed Insights (traz também os dados de usuários reais; defina PSI_API_KEY)
node scripts/medir-pagina.mjs https://seu-site.com.br
```

Cada aviso sai com o número do item do checklist. Rode no seu site, não no dos outros.

## Estrutura

```
SKILL.md              fluxo, metas, os 31 itens, ordem de ataque e modos de trabalho
references/
  frontend.md         01 02 04 11 14 15 20 21 22 23 26 29 + extras de landing page
  rede.md             06 09 19 27
  api.md              03 05 12 13 16
  backend.md          07 10 28
  banco.md            08 17 24 25 + RLS no Supabase
  medicao.md          18 30 31 + Lighthouse, PSI e relatório de antes e depois
  stacks.md           TanStack Start + Cloudflare, Vite SPA, Next + Vercel, Supabase, Python, N8N, GSAP
scripts/
  conferir-entrega.mjs
  medir-pagina.mjs
```

## Licença

[MIT](LICENSE)
