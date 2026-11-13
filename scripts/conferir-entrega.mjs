#!/usr/bin/env node
// conferir-entrega.mjs: confere como o servidor entrega a página e os arquivos dela.
//
// Olha: CDN (item 06), compressão br/gzip (09), cache no navegador (27), formato e
// peso das imagens (02), lazy e width/height nas <img> (15, 01), fontes (29),
// scripts de terceiros que travam a página (21) e se o HTML já chega com texto (20).
//
// Uso:
//   node conferir-entrega.mjs https://site.com.br
//   node conferir-entrega.mjs https://site.com.br --todos   (sem o limite de 60 arquivos)
//
// Faz GET só nas URLs que a própria página referencia (HTML, CSS, JS, imagens,
// fontes). Vídeo e áudio não são baixados. Rode no seu site, não no dos outros.
// Sem dependências: precisa só do Node 18 ou mais novo.

import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const args = process.argv.slice(2);
const alvo = args.find((a) => !a.startsWith("--"));
const LIMITE = args.includes("--todos") ? Infinity : 60;

if (!alvo || !/^https?:\/\//i.test(alvo)) {
  console.error("Uso: node conferir-entrega.mjs https://site.com.br [--todos]");
  process.exit(1);
}

// ---------------------------------------------------------------- rede

// Accept igual ao do Chrome: next/image, Cloudflare (format=auto, Polish) e outros
// escolhem AVIF/WebP por este cabeçalho. Com "*/*" eles devolvem o formato original.
const ACCEPT_HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ACCEPT_ARQUIVO = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

function pedir(url, saltos = [], accept = ACCEPT_ARQUIVO) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const inicio = performance.now();
    const req = mod.request(
      u,
      {
        method: "GET",
        headers: { "user-agent": UA, "accept-encoding": "br, gzip", accept },
        timeout: 20_000,
      },
      (res) => {
        const { statusCode: st, headers } = res;
        if (st >= 300 && st < 400 && headers.location && saltos.length < 5) {
          res.resume();
          const prox = new URL(headers.location, u).href;
          resolve(pedir(prox, [...saltos, `${st} ${u.href}`], accept));
          return;
        }
        const partes = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () =>
          resolve({
            url: u.href,
            status: st,
            headers,
            bruto: Buffer.concat(partes),
            ms: performance.now() - inicio,
            saltos,
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado (20 s)")));
    req.on("error", reject);
    req.end();
  });
}

function decodificar(r) {
  const enc = (r.headers["content-encoding"] || "").toLowerCase();
  try {
    if (enc === "br") return zlib.brotliDecompressSync(r.bruto);
    if (enc === "gzip") return zlib.gunzipSync(r.bruto);
    if (enc === "deflate") return zlib.inflateSync(r.bruto);
    if (enc === "zstd" && zlib.zstdDecompressSync) return zlib.zstdDecompressSync(r.bruto);
  } catch {
    // corpo inválido para a codificação declarada: devolve cru
  }
  return r.bruto;
}

async function emLotes(lista, n, fn) {
  const saida = new Array(lista.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (i < lista.length) {
        const k = i++;
        saida[k] = await fn(lista[k]);
      }
    }),
  );
  return saida;
}

// ---------------------------------------------------------------- HTML

const tags = (html, nome) => [...html.matchAll(new RegExp(`<${nome}\\b[^>]*>`, "gi"))].map((m) => m[0]);
function attr(tag, nome) {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
const temAttr = (tag, nome) => new RegExp(`\\s${nome}(?:\\s|=|>|/)`, "i").test(tag);
// srcset aceita vírgula dentro da URL (/cdn-cgi/image/width=480,format=auto/f.jpg):
// separa só na vírgula seguida de espaço ou logo depois de um descritor (480w, 2x).
const candidatosSrcset = (v) =>
  (v || "")
    .trim()
    .split(/,(?=\s)|(?<=\s[\d.]+[wx]),/)
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
const urlsDoCss = (css) =>
  [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)]
    .map((m) => m[2].trim())
    .filter((u) => !/^(data:|#|%23)/i.test(u));

// O navegador só baixa a fonte cujo unicode-range cobre o texto da página. Para
// não contar os subconjuntos cirílico, grego etc. do Google Fonts, pega só o
// @font-face que cobre o latim (a letra "a") e só a primeira url() de cada um.
function cobreLatim(faixas) {
  return faixas.split(",").some((f) => {
    const m = f.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (!m) return false;
    const ini = parseInt(m[1].replace(/\?/g, "0"), 16);
    const fim = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "F"), 16);
    return ini <= 0x61 && 0x61 <= fim;
  });
}
function urlsDoCssUteis(css) {
  const urls = [];
  const resto = css.replace(/@font-face\s*{([^}]*)}/gi, (_, corpo) => {
    const faixa = corpo.match(/unicode-range\s*:\s*([^;]+)/i);
    if (!faixa || cobreLatim(faixa[1])) {
      const u = urlsDoCss(corpo)[0];
      if (u) urls.push(u);
    }
    return "";
  });
  return urls.concat(urlsDoCss(resto));
}

// ---------------------------------------------------------------- classificação

const virgula = (n, c) => n.toFixed(c).replace(".", ",");
const kb = (b) => (b >= 1024 * 1024 ? `${virgula(b / 1048576, 1)} MB` : `${virgula(b / 1024, b < 10240 ? 1 : 0)} KB`);

function tipoDe(url, ct = "") {
  ct = ct.toLowerCase();
  if (ct.includes("html")) return "html";
  if (ct.includes("javascript") || /\.m?js(\?|$)/i.test(url)) return "js";
  if (ct.includes("css") || /\.css(\?|$)/i.test(url)) return "css";
  if (ct.startsWith("font/") || ct.includes("font") || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return "fonte";
  if (ct.startsWith("image/") || /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i.test(url)) return "img";
  if (ct.includes("json")) return "json";
  return "outro";
}

// Arquivo com hash no nome (index-BwXyZ12a.js, main.3f9a1c2b.css) ou em pasta de
// build (/assets/, /_next/static/, /_astro/): pode ter cache de um ano.
function pareceVersionado(url) {
  const { pathname } = new URL(url);
  if (/\/(assets|_next\/static|_astro|static\/chunks)\//.test(pathname)) return true;
  const nome = pathname.split("/").pop() || "";
  return nome
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-._]/)
    .some(
      (s) =>
        s.length >= 8 && s.length <= 24 && ((/\d/.test(s) && /[a-z]/i.test(s)) || (/[a-z]/.test(s) && /[A-Z]/.test(s))),
    );
}

function maxAge(cc = "") {
  const m = cc.match(/(?:^|,)\s*max-age=(\d+)/i);
  return m ? Number(m[1]) : null;
}

function cdnDe(h) {
  if (h["cf-cache-status"]) return `cf ${h["cf-cache-status"]}`;
  if (h["x-vercel-cache"]) return `vercel ${h["x-vercel-cache"]}`;
  if (h["x-nf-request-id"]) return "netlify";
  if (h["x-amz-cf-id"]) return `cloudfront ${h["x-cache"] ?? ""}`.trim();
  if (h["x-cache"]) return `x-cache ${h["x-cache"]}`;
  const s = String(h.server || "").toLowerCase();
  if (s.includes("cloudflare")) return "cloudflare";
  if (s.includes("vercel")) return "vercel";
  return s ? `server ${s}` : "-";
}

// ---------------------------------------------------------------- página

let pagina;
try {
  pagina = await pedir(alvo, [], ACCEPT_HTML);
} catch (e) {
  console.error(`Não consegui abrir ${alvo}: ${e.message}`);
  process.exit(1);
}
const html = decodificar(pagina).toString("utf8");
const base = new URL(pagina.url);
const dominio = base.hostname.replace(/^www\./, "");
const ehTerceiro = (u) => {
  const h = new URL(u).hostname;
  return !(h === dominio || h.endsWith(`.${dominio}`));
};
const absoluta = (u) => {
  try {
    const abs = new URL(u.replace(/&amp;/g, "&"), base);
    return /^https?:$/.test(abs.protocol) ? abs.href : null;
  } catch {
    return null;
  }
};

const avisos = [];
const avisar = (itens, texto) => avisos.push({ itens, texto });

// Recursos referenciados no HTML.
const recursos = new Map(); // url -> { origem, dica }
const anotar = (u, origem, dica = "") => {
  const abs = u && absoluta(u);
  if (abs && !recursos.has(abs)) recursos.set(abs, { origem, dica });
};

const scriptsBloqueantes = [];
for (const t of tags(html, "script")) {
  const src = attr(t, "src");
  if (!src) continue;
  anotar(src, "html", "script");
  const abs = absoluta(src);
  const modulo = (attr(t, "type") || "").toLowerCase() === "module";
  if (abs && ehTerceiro(abs) && !modulo && !temAttr(t, "async") && !temAttr(t, "defer")) scriptsBloqueantes.push(abs);
}
const preconnects = [];
for (const t of tags(html, "link")) {
  const rel = (attr(t, "rel") || "").toLowerCase();
  const href = attr(t, "href");
  if (!href) continue;
  if (rel.includes("stylesheet")) anotar(href, "html", "css");
  else if (rel.includes("modulepreload")) anotar(href, "html", "js");
  else if (rel.includes("preload")) anotar(href, "html", `preload ${attr(t, "as") || ""}`.trim());
  else if (rel.includes("preconnect") || rel.includes("dns-prefetch")) preconnects.push(href);
}

const imgs = tags(html, "img");
let semDimensao = 0;
let comLazy = 0;
imgs.forEach((t, i) => {
  anotar(attr(t, "src"), "html", "img");
  for (const c of candidatosSrcset(attr(t, "srcset"))) anotar(c, "html", "img srcset");
  if (!attr(t, "width") || !attr(t, "height")) semDimensao++;
  const lazy = (attr(t, "loading") || "").toLowerCase() === "lazy";
  if (lazy) comLazy++;
  if (i === 0 && lazy) {
    avisar("15", "A primeira <img> do HTML está com loading=\"lazy\". Se ela for o LCP (imagem do topo), tire o lazy e use fetchpriority=\"high\".");
  }
});
for (const t of tags(html, "source")) {
  for (const c of candidatosSrcset(attr(t, "srcset"))) anotar(c, "html", "img srcset");
}
for (const t of tags(html, "video")) {
  const poster = attr(t, "poster");
  if (poster) anotar(poster, "html", "poster");
}
let ogImage = null;
for (const t of tags(html, "meta")) {
  const p = (attr(t, "property") || attr(t, "name") || "").toLowerCase();
  if (p === "og:image" && attr(t, "content")) {
    ogImage = absoluta(attr(t, "content"));
    anotar(attr(t, "content"), "html", "og:image");
  }
}
for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
  for (const u of urlsDoCssUteis(m[1])) anotar(u, "css inline");
}

// Texto visível: se o HTML chega quase vazio, a página é desenhada pelo JS (item 20).
const textoVisivel = html
  .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z#0-9]+;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

// ---------------------------------------------------------------- arquivos

const linhas = [];
const totais = {};
const fontes = [];
const versionadosSemCache = [];
const visitadosCss = new Set();
const fila = [...recursos.keys()];

async function conferir(url) {
  if (/\.(mp4|webm|mov|m4v|mp3|ogg|wav)(\?|$)/i.test(url)) {
    return { url, pulado: "vídeo/áudio não baixado" };
  }
  try {
    const r = await pedir(url);
    return { ...r, url };
  } catch (e) {
    return { url, erro: e.message };
  }
}

const resultados = [];
while (fila.length && resultados.length < LIMITE) {
  const lote = fila.splice(0, Math.min(fila.length, LIMITE - resultados.length));
  const feitos = await emLotes(lote, 6, conferir);
  for (const r of feitos) {
    resultados.push(r);
    if (r.bruto && tipoDe(r.url, r.headers["content-type"]) === "css" && !visitadosCss.has(r.url)) {
      visitadosCss.add(r.url);
      const css = decodificar(r).toString("utf8");
      for (const u of urlsDoCssUteis(css)) {
        try {
          const abs = new URL(u, r.url).href;
          if (!recursos.has(abs)) {
            recursos.set(abs, { origem: "css" });
            fila.push(abs);
          }
        } catch {
          // url() inválida no CSS
        }
      }
    }
  }
}
const naoConferidos = fila.length;

for (const r of resultados) {
  const caminho = (() => {
    const u = new URL(r.url);
    return (u.hostname === base.hostname ? "" : u.hostname) + u.pathname + (u.search ? "?…" : "");
  })();
  if (r.pulado || r.erro) {
    linhas.push(`| - | - | - | - | - | - | ${caminho} (${r.pulado ?? `erro: ${r.erro}`}) |`);
    continue;
  }
  const h = r.headers;
  const ct = String(h["content-type"] || "");
  const tipo = tipoDe(r.url, ct);
  const enc = h["content-encoding"] || "-";
  const cc = h["cache-control"] || "(sem)";
  const bytes = r.bruto.length;
  const terceiro = ehTerceiro(r.url);
  totais[tipo] = (totais[tipo] ?? 0) + bytes;
  linhas.push(
    `| ${tipo}${terceiro ? " (3º)" : ""} | ${r.status} | ${kb(bytes)} | ${enc} | ${cc.slice(0, 48)} | ${cdnDe(h)} | ${caminho.slice(0, 90)} |`,
  );

  // compressão
  const textual = /text\/|javascript|json|xml|svg/.test(ct);
  if (textual && bytes > 1024 && enc === "-") avisar("09", `Sem compressão: ${caminho} (${kb(bytes)}, ${ct.split(";")[0]})`);

  // cache no navegador
  const idade = maxAge(cc);
  if (!terceiro && r.status === 200 && pareceVersionado(r.url) && tipo !== "html") {
    if (idade == null || idade < 2_592_000 || /no-cache|no-store|must-revalidate/.test(cc)) {
      versionadosSemCache.push({ caminho, cc });
    }
  }

  // imagens
  if (tipo === "img") {
    const formato = ct.split(";")[0].replace("image/", "");
    const moderno = /webp|avif|svg|gif|icon|ico/.test(formato);
    const ehOg = r.url === ogImage;
    if (ehOg) {
      if (bytes > 300 * 1024) avisar("02", `Imagem de compartilhamento (og:image) com ${kb(bytes)}: acima de ~300 KB o WhatsApp pode não mostrar a prévia.`);
    } else {
      if (!moderno && bytes > 10 * 1024) avisar("02", `Imagem em ${formato || "formato antigo"}: ${caminho} (${kb(bytes)}). Converter para WebP ou AVIF.`);
      if (bytes > 200 * 1024) avisar("02", `Imagem pesada: ${caminho} (${kb(bytes)}). Confira se está no tamanho em que aparece.`);
    }
  }

  // fontes
  if (tipo === "fonte") fontes.push({ caminho, bytes, terceiro, woff2: /woff2/.test(ct) || /\.woff2(\?|$)/i.test(r.url) });
}

// ---------------------------------------------------------------- avisos gerais

const h = pagina.headers;
if (!h["content-encoding"] && pagina.bruto.length > 1024) avisar("09", "O HTML veio sem compressão.");
const idadeHtml = maxAge(h["cache-control"]);
if (idadeHtml != null && idadeHtml > 600 && !/private|no-store|no-cache/.test(h["cache-control"])) {
  avisar("27", `O HTML tem cache de ${idadeHtml} s no navegador: quem já visitou pode ficar com a versão velha depois do deploy.`);
}
if (textoVisivel.length < 150) {
  avisar("20", `O HTML chega com só ${textoVisivel.length} caracteres de texto: a página é desenhada pelo JavaScript no navegador.`);
}
if (pagina.saltos.length) {
  avisar("19", `O endereço redireciona antes de abrir (${pagina.saltos.join(" → ")} → ${pagina.url}). Cada salto é uma ida e volta a mais: divulgue o endereço final.`);
}
for (const s of scriptsBloqueantes) avisar("21", `Script de terceiro sem async/defer (trava a página): ${s}`);
if (imgs.length && semDimensao) {
  avisar("01, 02", `${semDimensao} de ${imgs.length} <img> sem width e height no HTML. Se o CSS não reserva o espaço (aspect-ratio), a tela pula quando a imagem chega.`);
}
if (imgs.length > 6 && comLazy === 0) avisar("15", `${imgs.length} <img> no HTML e nenhuma com loading="lazy".`);
if (versionadosSemCache.length) {
  const ex = versionadosSemCache[0];
  avisar(
    "27",
    `${versionadosSemCache.length} arquivo(s) com hash no nome sem cache longo (ex.: ${ex.caminho}, cache-control: ${ex.cc}). O ideal é "public, max-age=31536000, immutable".`,
  );
}
if (fontes.length > 4) {
  avisar("29", `${fontes.length} arquivos de fonte no latim: o normal é 2 ou 3 (só os pesos usados, ou uma fonte variável).`);
}
const fontesFora = fontes.filter((f) => f.terceiro);
if (fontesFora.length) {
  const hosts = [...new Set(fontesFora.map((f) => f.caminho.split("/")[0]))].join(", ");
  avisar("29", `${fontesFora.length} fonte(s) vindas de outro domínio (${hosts}). Hospede no próprio site.`);
}
for (const f of fontes) if (!f.woff2) avisar("29", `Fonte fora de WOFF2: ${f.caminho}.`);
const terceiros = [...new Set(resultados.filter((r) => r.headers && ehTerceiro(r.url)).map((r) => new URL(r.url).hostname))];

// ---------------------------------------------------------------- saída

const out = (s = "") => console.log(s);
out(`# Entrega de ${pagina.url}`);
out(
  `HTML: ${pagina.status} · ${kb(pagina.bruto.length)} transferidos (${kb(html.length)} aberto) · ${h["content-encoding"] || "sem compressão"} · cache-control: ${h["cache-control"] || "(sem)"} · CDN: ${cdnDe(h)} · ${Math.round(pagina.ms)} ms daqui`,
);
out(`Texto visível no HTML: ${textoVisivel.length} caracteres · <img>: ${imgs.length} (${comLazy} lazy) · preconnect: ${preconnects.length ? preconnects.join(", ") : "nenhum"}`);
out();
out(`## Arquivos (${resultados.length} conferidos${naoConferidos ? `, ${naoConferidos} ficaram de fora: use --todos` : ""})`);
out("| Tipo | Status | Transferido | Compressão | cache-control | CDN | Arquivo |");
out("|---|---|---|---|---|---|---|");
for (const l of linhas) out(l);
out();
out("## Totais transferidos");
out(
  Object.entries(totais)
    .sort((a, b) => b[1] - a[1])
    .map(([t, b]) => `${t}: ${kb(b)}`)
    .join(" · ") || "-",
);
if (terceiros.length) out(`Domínios de terceiros: ${terceiros.join(", ")}`);
out();
out("## Avisos (com o número do item da skill)");
if (!avisos.length) out("Nenhum aviso. A entrega está em ordem.");
for (const a of avisos) out(`- [${a.itens}] ${a.texto}`);
