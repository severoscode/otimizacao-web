# Frontend

O que a pessoa vê e sente na tela. Itens 01, 02, 04, 11, 14, 15, 20, 21, 22, 23, 26 e 29,
mais os extras de landing page no fim.

Os nomes de menu do DevTools estão em inglês, como aparecem no Chrome e no Edge.

## Sumário

- [01 Skeleton de carregamento](#01)
- [02 Imagens em WebP ou AVIF](#02)
- [04 Debounce na busca](#04)
- [11 Dependências sem uso](#11)
- [14 Atualizar a tela sem esperar o servidor](#14)
- [15 Lazy loading nas imagens fora da tela](#15)
- [20 Renderizar no servidor ou no build](#20)
- [21 Scripts de terceiros depois da página](#21)
- [22 Dividir o JavaScript por página](#22)
- [23 Virtualizar listas longas](#23)
- [26 Evitar re-render desnecessário](#26)
- [29 Fontes no próprio domínio](#29)
- [Extras de landing page](#extras)

---

<a id="01"></a>
## 01 · Skeleton de carregamento (TOP)

**O que é.** Enquanto os dados chegam, a tela mostra blocos cinza no formato do conteúdo
final, em vez de tela branca ou um spinner solto no meio. A espera parece menor e, se o
skeleton tem o mesmo tamanho do conteúdo, nada pula quando os dados chegam (CLS).

**Vale:** toda tela que busca dados depois de abrir. **Não vale:** conteúdo que já chega
pronto no HTML (SSR ou pré-renderizado): ali o skeleton só pisca. Também não vale mostrar
skeleton em carga muito rápida; ele vira um flash.

**Como conferir.**
- DevTools → Network → troque "No throttling" por "Slow 4G" e recarregue. Tem que aparecer
  o skeleton com o tamanho do conteúdo, e nada pode empurrar o resto da tela quando os
  dados chegam.
- No código, procure telas que retornam `null`, um spinner ou "Carregando..." enquanto
  `isLoading`/`isPending`.

**Como corrigir.** Cubra três estados, não só o carregando:
- **carregando:** skeleton com as mesmas alturas de cards, linhas e imagens;
- **vazio:** uma frase dizendo o que a tela mostra e um botão com o próximo passo;
- **erro:** mensagem em português comum e um botão "tentar de novo".

Por stack:
- **TanStack Router/Start:** `pendingComponent` na rota (ou `defaultPendingComponent` no
  router). Ele só aparece depois de `pendingMs` (padrão 1000 ms) e fica pelo menos
  `pendingMinMs` (padrão 500 ms), o que evita o flash. Com TanStack Query, dá para usar
  `useSuspenseQuery` com `<Suspense fallback={<Skeleton />}>` em volta só do pedaço lento.
- **Next (App Router):** `loading.tsx` na pasta da rota, ou `<Suspense>` em volta do
  componente que busca.
- **Vite/React puro:** o estado da busca (`isPending` do TanStack Query) decide entre
  skeleton, vazio, erro e conteúdo.
- **shadcn/ui:** já tem o componente `<Skeleton>`.

**Cuidado.** Skeleton mais baixo ou mais alto que o conteúdo causa o mesmo pulo que ele
deveria evitar. Brilho animado no skeleton deve respeitar `prefers-reduced-motion`.
Marque a região com `aria-busy="true"` enquanto carrega.

---

<a id="02"></a>
## 02 · Imagens em WebP ou AVIF, no tamanho exibido (TOP)

**O que é.** WebP e AVIF costumam pesar bem menos que JPG e PNG com a mesma qualidade. E a
imagem deve chegar no tamanho em que aparece: uma foto de 4000 px mostrada num card de
400 px é desperdício puro.

**Vale:** quase sempre, principalmente com foto e com imagem enviada pelo usuário. **Não
vale:** ícone e logo (use SVG). A imagem de compartilhamento (`og:image`) fica em JPG ou PNG,
com até uns 300 KB, porque nem toda rede social lê WebP.

**Como conferir.**
- DevTools → Network → filtro "Img" → recarregue. A coluna Type deve mostrar `webp` ou
  `avif`; a coluna Size não deve ter imagem de MB.
- Clique na imagem no Elements: compare "Rendered size" com "Intrinsic size".
- `node scripts/conferir-entrega.mjs <url>` avisa formato antigo e imagem pesada.
- No código: `grep -rE "\.(png|jpe?g)" src/`.

**Como corrigir.**
- **Converter (sharp, que já costuma estar em `node_modules`):**

  ```js
  // node converter.mjs entrada.jpg saida
  import sharp from "sharp";
  const [entrada, saida] = process.argv.slice(2);
  for (const largura of [480, 960, 1600]) {
    const base = sharp(entrada).resize({ width: largura, withoutEnlargement: true });
    await base.clone().webp({ quality: 78 }).toFile(`${saida}-${largura}.webp`);
    await base.clone().avif({ quality: 50 }).toFile(`${saida}-${largura}.avif`);
  }
  ```

- **Servir o tamanho certo com `srcset` e `sizes`:**

  ```html
  <picture>
    <source type="image/avif" srcset="/img/foto-480.avif 480w, /img/foto-960.avif 960w, /img/foto-1600.avif 1600w" sizes="(max-width: 768px) 100vw, 50vw" />
    <img src="/img/foto-960.webp" srcset="/img/foto-480.webp 480w, /img/foto-960.webp 960w, /img/foto-1600.webp 1600w"
         sizes="(max-width: 768px) 100vw, 50vw" width="1600" height="900" alt="..." loading="lazy" decoding="async" />
  </picture>
  ```

- **Vite:** importe a imagem de `src/assets` para ela ganhar hash no nome (cache longo, item
  27). O plugin `vite-imagetools` gera as variantes no build, se valer o trabalho.
- **Next:** `next/image` com `width` e `height` (ou `fill` + `sizes`) e
  `images.formats: ['image/avif', 'image/webp']` no `next.config`.
- **Imagem enviada pelo usuário (Supabase Storage):** reduza antes de subir (canvas no
  navegador, ou `sharp` no servidor) ou use a transformação de imagem do Storage
  (`getPublicUrl(caminho, { transform: { width: 400, quality: 75 } })`), que depende do
  plano. Nunca guarde imagem em base64 dentro de coluna do banco.
- **Cloudflare:** Image Transformations (`/cdn-cgi/image/width=800,format=auto/<caminho>`),
  se estiver ligado na zona.
- **Sempre** `width` e `height` no `<img>` (ou `aspect-ratio` no CSS), para a tela não pular.

**Cuidado.** AVIF demora para gerar e às vezes perde detalhe em degradê; confira no olho.
Não aumente imagem pequena. Imagem decorativa de fundo em CSS não tem `srcset`: use
`image-set()` ou troque por `<img>`.

---

<a id="04"></a>
## 04 · Debounce na busca e no autocompletar (TOP)

**O que é.** Esperar a pessoa parar de digitar por um instante antes de buscar, em vez de
mandar uma requisição por tecla.

**Vale:** busca, filtro e autocompletar que consultam o servidor, e salvamento automático.
**Não vale:** filtro feito no navegador sobre uma lista pequena já carregada. Se esse filtro
for pesado de desenhar, use `useDeferredValue` (item 26) em vez de debounce.

**Como conferir.** DevTools → Network → filtro "Fetch/XHR". Digite "notebook" na busca: tem
que sair 1 requisição, não 8.

**Como corrigir.** Um hook pequeno resolve; não precisa de biblioteca.

```ts
import { useEffect, useState } from "react";

export function useDebounce<T>(valor: T, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
```

Com TanStack Query, a chave da consulta muda só depois da pausa, e o `signal` cancela a
requisição velha:

```ts
const termo = useDebounce(busca.trim(), 300);
const { data, isFetching } = useQuery({
  queryKey: ["clientes", "busca", termo],
  queryFn: async ({ signal }) => {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome")
      .ilike("nome", `%${termo}%`)
      .limit(20)
      .abortSignal(signal);
    if (error) throw error;
    return data;
  },
  enabled: termo.length >= 2,
  placeholderData: keepPreviousData,
});
```

Sem TanStack Query: guarde um `AbortController` por busca e chame `abort()` no anterior
antes de disparar o novo, para uma resposta velha não sobrescrever a nova.

Salvamento automático: debounce de 500 a 1000 ms e salve na hora no `blur` e antes de
sair da página.

**Cuidado.** O campo continua respondendo na hora; só a busca espera. Mostre um "buscando..."
discreto. `ilike '%termo%'` em tabela grande precisa de índice trigram (ver banco, item 17).

---

<a id="11"></a>
## 11 · Remover dependências que você não usa

**O que é.** Projeto que passou por muita iteração (e todo projeto que nasceu no Lovable)
acumula pacote instalado "para testar" e arquivo que ninguém importa.

**Vale:** projeto com muita iteração ou bundle grande. **Não vale:** perder tempo caçando
pacote que roda só no build ou no servidor.

O que pesa para o usuário é o que é **importado** no código do navegador. Pacote listado no
`package.json` e nunca importado não entra no bundle; atrapalha a instalação e a
segurança, não a velocidade. Por isso olhe o bundle primeiro.

**Como conferir.**
- `npx knip`: lista dependências, arquivos e exports que ninguém usa.
- `npx vite-bundle-visualizer` (Vite) ou `@next/bundle-analyzer` (Next): mostra o que ocupa
  espaço no JavaScript.
- DevTools → Coverage (item 22) mostra quanto do JS baixado não roda.

**Como corrigir.** Confira cada item do knip com `grep` antes de apagar (ele erra com
pacote usado só em config, plugin do Tailwind/PostCSS/Vite, script de CLI ou tipos).
`npm uninstall`, build, teste. Troque o que é pesado por equivalente leve quando fizer
sentido: `moment` → `Intl`/`date-fns`, `lodash` inteiro → funções nativas ou import por
função, biblioteca de ícones inteira → import nomeado (`lucide-react` já faz tree-shaking).

**Cuidado.** Componentes do shadcn/ui sem uso em `src/components/ui` não pesam se ninguém
importa; apagar é só limpeza.

---

<a id="14"></a>
## 14 · Atualizar a tela sem esperar o servidor (UI otimista)

**O que é.** O check, o like, a renomeação ou a troca de coluna aparece na hora; o servidor
confirma por trás. Se falhar, a tela volta ao estado anterior e avisa.

**Vale:** ação simples que quase nunca falha (marcar, favoritar, renomear, reordenar,
arrastar card). **Não vale:** pagamento, estoque, permissão, nada em que o servidor precise
dizer "pode".

**Como conferir.** Com a rede em "Slow 4G", clique: muda na hora. Depois ponha a Network em
"Offline" e clique de novo: tem que voltar e mostrar um aviso.

**Como corrigir.**
- **TanStack Query:** o jeito simples é desenhar a partir de `variables` e `isPending` do
  `useMutation`. Para mexer no cache:

  ```ts
  const qc = useQueryClient();
  const mover = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      supabase.from("leads").update({ status: v.status }).eq("id", v.id).throwOnError(),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const antes = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], (lista) =>
        lista?.map((l) => (l.id === v.id ? { ...l, status: v.status } : l)),
      );
      return { antes };
    },
    onError: (_erro, _v, ctx) => {
      qc.setQueryData(["leads"], ctx?.antes);
      toast.error("Não deu para mover o lead. Tente de novo.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
  ```

- **React 19 sem TanStack Query:** `useOptimistic` dentro de uma action de formulário.

**Cuidado.** Sempre desfazer e avisar no erro. Cliques repetidos rápidos (arrastar várias
vezes) precisam cancelar a consulta em andamento (`cancelQueries`) para uma resposta velha
não desfazer a nova.

---

<a id="15"></a>
## 15 · Lazy loading nas imagens fora da tela (TOP)

**O que é.** A imagem que está lá embaixo só baixa quando a pessoa rola até perto dela.

**Vale:** listas, feeds, galerias, portfólio, páginas longas. **Não vale:** a imagem
principal do topo. Ela é o LCP na maioria das páginas e tem que carregar primeiro: lazy nela
atrasa a página.

**Como conferir.**
- DevTools → Network → filtro "Img" → recarregue sem rolar. Só as imagens da primeira tela
  aparecem; rolando, as outras entram.
- O Lighthouse aponta a imagem do LCP com lazy (`lcp-discovery`).
- `node scripts/conferir-entrega.mjs <url>` avisa quando a primeira `<img>` do HTML é lazy.

**Como corrigir.**
- Fora da primeira tela: `loading="lazy" decoding="async"`, com `width` e `height`.
- A do topo: sem lazy, com `fetchpriority="high"`. Se ela é fundo de CSS ou só aparece
  depois do JS, adicione `<link rel="preload" as="image" href="..." fetchpriority="high">`
  no `<head>` (com `imagesrcset`/`imagesizes` se for responsiva).
- `iframe` de YouTube e mapa: `loading="lazy"`, ou melhor, uma fachada (a miniatura com um
  botão de play que só carrega o player no clique).
- Vídeo fora da primeira tela: `preload="none"` e `poster`, ou carregar quando a seção
  chega perto com `IntersectionObserver`.

**Cuidado.** Carrossel: o primeiro slide não é lazy. Imagem que entra por animação ou por
biblioteca JS pode ser o LCP mesmo sem parecer.

---

<a id="20"></a>
## 20 · Renderizar no servidor ou no build

**O que é.** A página chega com o texto já no HTML (SSR, ou gerada no build), em vez de um
HTML vazio que o JavaScript preenche depois. O conteúdo aparece antes e o Google lê tudo.

**Vale:** landing page, site institucional, blog, página de produto: tudo que é público e
precisa de busca. **Não vale:** painel atrás de login. Projeto Vite puro (comum no Lovable)
renderiza só no navegador; mudar isso é migração, então só faça na parte pública que
precisa de SEO.

**Como conferir.**
- Na página, Ctrl+U (código-fonte). O texto está lá? Ok. Só um `<div id="root"></div>`
  vazio? É renderizado no navegador.
- `node scripts/conferir-entrega.mjs <url>` conta o texto visível do HTML.

**Como corrigir.**
- **TanStack Start:** já faz SSR por padrão. Por rota dá para escolher `ssr: false` ou
  `ssr: 'data-only'` nas partes que só funcionam no navegador. Página que não muda pode
  ser pré-renderizada no build (opção `prerender` do plugin do TanStack Start; confira o
  nome na versão instalada).
- **Next:** Server Components por padrão; páginas estáticas com `generateStaticParams` e
  `revalidate`.
- **Vite SPA com página pública importante:** passe a parte pública para TanStack Start (com
  pré-renderização) ou Astro. É trabalho grande: combine antes.

**Cuidado.** SSR com loader lento piora o TTFB: o HTML espera os dados. Mande o essencial
primeiro e deixe o resto em streaming (no TanStack Router, devolva a promessa sem `await` no
loader e use `<Await>` ou `useSuspenseQuery` no componente).

---

<a id="21"></a>
## 21 · Scripts de terceiros depois da página

**O que é.** Pixel da Meta, Google Tag Manager, chat de suporte, analytics e mapa carregam
depois que a página já apareceu, não antes.

**Vale:** todo site com pixel, GTM, chat, analytics ou widget. **Não vale:** script que
precisa rodar antes de tudo (aviso de cookies exigido por lei, por exemplo).

**Como conferir.**
- DevTools → Network → recarregue e olhe a Waterfall: scripts de outros domínios devem
  começar depois da linha vermelha (Load).
- Lighthouse: os insights `third-parties-insight` (terceiros) e `render-blocking-insight`
  (requisições que bloqueiam a renderização).
- `node scripts/conferir-entrega.mjs <url>` avisa script de terceiro sem `async`/`defer`.
- No código: procure `<script` no `index.html` ou no `__root.tsx`, `gtag`, `fbq`,
  `googletagmanager`.

**Como corrigir.**
- No mínimo, `async` (independente) ou `defer` (precisa da ordem).
- Melhor: injetar depois do `load`, quando o navegador estiver livre:

  ```ts
  function depoisDaPagina(src: string) {
    const carregar = () => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    };
    const quandoLivre = () =>
      "requestIdleCallback" in window ? requestIdleCallback(carregar) : setTimeout(carregar, 1);
    if (document.readyState === "complete") quandoLivre();
    else window.addEventListener("load", quandoLivre, { once: true });
  }
  ```

- Chat e vídeo: fachada que só carrega o widget de verdade no primeiro clique.
- **Next:** `next/script` com `strategy="lazyOnload"` (ou `"afterInteractive"`).

**Cuidado.** Pixel carregado tarde perde um pouco das visitas que saem em 1 ou 2 segundos.
É troca: combine com quem cuida do marketing. Respeite o consentimento da LGPD.

---

<a id="22"></a>
## 22 · Dividir o JavaScript por página

**O que é.** Cada página baixa só o código dela. Componente pesado (editor de texto,
gráfico, mapa, grafo, gerador de PDF) carrega só quando aparece.

**Vale:** app com editor, gráfico ou biblioteca grande em uma tela só. **Não vale:** repartir
componente pequeno; os roteadores modernos já dividem por rota.

**Como conferir.**
- DevTools → Ctrl+Shift+P → "Show Coverage" → recarregue. Mostra quanto do JS baixado não
  rodou naquela página.
- Bundle visualizer (item 11): procure biblioteca grande no pacote principal.

**Como corrigir.**
- `React.lazy(() => import("./Editor"))` com `<Suspense fallback={<SkeletonDoEditor />}>`.
- Biblioteca usada só numa ação: import dentro do clique
  (`const { gerarPdf } = await import("./pdf")`).
- **TanStack Router/Start:** a divisão automática por rota (`autoCodeSplitting`) separa o
  componente de cada rota; confira se está ligada na config do plugin. `defaultPreload:
  'intent'` baixa a próxima rota quando o mouse passa no link.
- **Next:** `next/dynamic`; com `ssr: false` para o que só roda no navegador.

**Cuidado.** Não faça lazy de nada que aparece na primeira tela: atrasa o LCP. Depois de um
deploy, quem está com a página antiga aberta pode pedir um pedaço que não existe mais
(`Failed to fetch dynamically imported module`); no Vite, trate com
`window.addEventListener("vite:preloadError", () => location.reload())`.

---

<a id="23"></a>
## 23 · Virtualizar listas longas

**O que é.** Numa lista de mil linhas, só as que estão na tela existem no DOM; as outras são
criadas conforme a rolagem.

**Vale:** tabela, log ou kanban com centenas de itens numa tela só. **Não vale:** lista que
já pagina de 20 em 20 (item 05).

**Como conferir.** DevTools → Elements: conte as linhas no DOM. Virtualizada, são umas
dezenas mesmo com mil itens. Na aba Performance, rolar a lista não deve gerar tarefas
longas (blocos vermelhos). O Lighthouse aponta DOM grande.

**Como corrigir.**
- `@tanstack/react-virtual`:

  ```tsx
  const pai = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: itens.length, getScrollElement: () => pai.current, estimateSize: () => 56, overscan: 8 });
  return (
    <div ref={pai} style={{ height: 600, overflow: "auto" }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((linha) => (
          <div key={linha.key} style={{ position: "absolute", top: 0, width: "100%", transform: `translateY(${linha.start}px)` }}>
            <Linha item={itens[linha.index]} />
          </div>
        ))}
      </div>
    </div>
  );
  ```

- Página longa com seções pesadas mas estáticas: `content-visibility: auto;
  contain-intrinsic-size: auto 600px;` no CSS. O navegador pula o desenho do que está fora
  da tela, sem JS.

**Cuidado.** Ctrl+F não acha linha que não está no DOM. Altura variável pede
`measureElement`. Arrastar e soltar com virtualização dá trabalho: pagine antes, se der.

---

<a id="26"></a>
## 26 · Evitar re-render desnecessário

**O que é.** Componente que redesenha a cada tecla ou a cada mudança que não tem nada a ver
com ele deixa digitar, clicar e rolar travado (INP alto).

**Vale:** quando a tela trava ao digitar ou rolar, ou o Profiler mostra a árvore inteira
redesenhando. **Não vale:** espalhar `memo` em tudo por precaução. Com o React Compiler
ligado, a memoização já é automática.

**Como conferir.**
- Extensão React Developer Tools → Profiler → engrenagem → "Highlight updates when
  components render". Digite num campo: só ele deve piscar, não a página toda.
- No Profiler, ligue "Record why each component rendered" e grave a interação lenta.
- DevTools → Performance: grave o clique e veja a interação (INP) e as tarefas longas.

**Como corrigir.**
- Desça o estado para perto de quem usa (estado de um campo não mora no topo da página).
- Contexto grande que muda muito: divida em contextos menores ou use uma store com seletor
  (Zustand); não crie objeto novo no `value` a cada render.
- TanStack Query: `select` para o componente assinar só o pedaço que usa.
- Lista filtrada pesada: `useDeferredValue` no termo, ou `startTransition` na atualização.
- `memo`, `useMemo` e `useCallback` onde o Profiler mostrou o custo.
- React Compiler (`babel-plugin-react-compiler`): confira na documentação como ligar na
  versão instalada do plugin do Vite ou do Next.
- Formulário grande: React Hook Form com campos não controlados.

**Cuidado.** Animação de rolagem (GSAP, Lenis) que grava `useState` a cada quadro redesenha
o React 60 vezes por segundo. Guarde em `ref` ou deixe a animação mexer direto no DOM.

---

<a id="29"></a>
## 29 · Fontes no próprio domínio e poucos pesos

**O que é.** A fonte sai do seu domínio (sem conexão extra com o Google Fonts) e só nos
pesos que a página usa.

**Vale:** sempre que há fonte customizada. **Não vale:** fonte do sistema.

**Como conferir.**
- DevTools → Network → filtro "Font" → recarregue. Conte os arquivos (2 ou 3 é o normal) e
  veja se vêm do seu domínio e em WOFF2.
- `node scripts/conferir-entrega.mjs <url>` conta só os arquivos que o navegador baixaria
  para texto em português.
- No código: `fonts.googleapis.com` no `index.html`, no `__root.tsx` ou no CSS.

**Como corrigir.**
- Pacotes `@fontsource/<fonte>` ou `@fontsource-variable/<fonte>`, importando só os pesos
  usados (`import "@fontsource/inter/400.css"`), ou os WOFF2 baixados em `public/fonts` com
  `@font-face` próprio.
- Três pesos ou mais da mesma família: prefira a versão variável (um arquivo).
- `font-display: swap`, e só o subconjunto latino (português cabe nele).
- Pré-carregue só a fonte do texto principal do topo:
  `<link rel="preload" href="/fonts/inter-latin-400.woff2" as="font" type="font/woff2" crossorigin>`
  (o `crossorigin` é obrigatório mesmo no mesmo domínio).
- **Next:** `next/font` faz tudo isso.

**Cuidado.** Pré-carregar fonte demais disputa banda com a imagem do LCP. Fonte de reserva
com métrica diferente faz o texto pular na troca (CLS); `size-adjust` no `@font-face` de
reserva ajuda.

---

<a id="extras"></a>
## Extras de landing page

Coisas que não estão nos 31, mas aparecem em quase toda landing page com animação.

- **Animação de entrada no elemento do LCP.** Se o título ou o parágrafo do topo começa com
  `opacity: 0` e só aparece depois que o JS carrega e a animação roda, o LCP só conta quando
  ele fica visível. A fase de atraso de renderização do elemento (element render delay) do
  Lighthouse denuncia isso
  (`node scripts/medir-pagina.mjs lh.json` mostra as fases). Saídas: deixar o elemento do
  LCP visível desde o início e animar só o resto; começar a animação logo, curta (menos
  de ~0,5 s); ou animar com `transform` sem esconder (`opacity` partindo de algo maior que
  zero). Sempre com o fallback em CSS para quando o JS não carrega.
- **Vídeo no topo.** Use `poster` leve, `preload="metadata"` ou `"none"`, e prefira vídeo
  curto, sem áudio, em AV1/HEVC/H.264. Vídeo grande no topo é o LCP mais caro que existe.
- **`preconnect`** para a origem de que a página depende cedo (API, Supabase, CDN de
  imagem): `<link rel="preconnect" href="https://xyz.supabase.co" crossorigin>`. No máximo 2
  ou 3; preconnect sobrando custa.
- **Animação só com `transform` e `opacity`.** Animar `top`, `width`, `height`, `filter` ou
  `box-shadow` força recálculo de layout ou de pintura a cada quadro. Detalhes na skill
  `gsap-performance`, se instalada.
- **JavaScript de animação pesando no TBT.** Plugins de texto que quebram em letras
  (SplitText), rolagem suave e WebGL custam CPU no celular. Corte a quebra em letras de
  textos longos, adie o que está abaixo da dobra e desligue tudo com
  `prefers-reduced-motion`.
