#!/usr/bin/env node
// medir-pagina.mjs: resume a performance de uma página em poucas linhas.
//
// Uso:
//   node medir-pagina.mjs https://site.com.br            PageSpeed Insights, celular
//   node medir-pagina.mjs https://site.com.br --desktop  PageSpeed Insights, computador
//   node medir-pagina.mjs lh.json                        relatório do Lighthouse salvo
//
// Com URL pública, chama a API do PageSpeed Insights (Google). Ela devolve o
// laboratório (Lighthouse) e, quando o site tem tráfego, o campo (usuários reais
// do Chrome, CrUX). A cota sem chave é dividida com todo mundo e acaba cedo: o
// caminho garantido é rodar o Lighthouse na máquina e passar o JSON.
//
//   npx lighthouse http://localhost:4173 --only-categories=performance --locale=pt-BR \
//     --output=json --output-path=lh.json --chrome-flags="--headless=new" --quiet
//
// Sem Chrome instalado: aponte CHROME_PATH para o Edge ou para o Chromium do Playwright.
// Chave da API do PSI (opcional, gratuita no Google Cloud): variável PSI_API_KEY.
// Sem dependências: precisa só do Node 18 ou mais novo.

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const alvo = args.find((a) => !a.startsWith("--"));
const desktop = args.includes("--desktop");

if (!alvo) {
  console.error("Uso: node medir-pagina.mjs <url | relatorio.json> [--desktop]");
  process.exit(1);
}

// ---------------------------------------------------------------- entrada

// Devolve { lhr, campo } ou null (depois de explicar o erro). Sem process.exit()
// no meio: no Windows ele pode derrubar o Node enquanto o fetch fecha o socket.
async function carregar() {
  if (/^https?:\/\//i.test(alvo)) {
    const host = new URL(alvo).hostname;
    const local =
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host);
    if (local) {
      console.error("O PageSpeed Insights não alcança endereço local. Rode o Lighthouse na máquina:");
      console.error(`  ${COMANDO_LIGHTHOUSE.replace("<url>", alvo)}`);
      console.error("  node medir-pagina.mjs lh.json");
      return null;
    }

    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", alvo);
    api.searchParams.set("strategy", desktop ? "desktop" : "mobile");
    api.searchParams.set("category", "performance");
    api.searchParams.set("locale", "pt-BR");
    if (process.env.PSI_API_KEY) api.searchParams.set("key", process.env.PSI_API_KEY);

    console.error(`Rodando o PageSpeed Insights (${desktop ? "computador" : "celular"}). Leva uns 30 s...`);
    let resp;
    try {
      resp = await fetch(api, { signal: AbortSignal.timeout(150_000) });
    } catch (e) {
      console.error(`Falhou ao chamar o PageSpeed Insights: ${e.message}`);
      return null;
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.lighthouseResult) {
      console.error(`PageSpeed Insights respondeu ${resp.status}: ${json.error?.message ?? "sem detalhes"}`);
      if (resp.status === 429) {
        console.error("A cota sem chave acabou (ela é dividida com todo mundo). Defina PSI_API_KEY ou rode local:");
        console.error(`  ${COMANDO_LIGHTHOUSE.replace("<url>", alvo)}`);
      }
      return null;
    }
    return {
      lhr: json.lighthouseResult,
      campo: { pagina: json.loadingExperience, origem: json.originLoadingExperience },
    };
  }

  let json;
  try {
    json = JSON.parse(await readFile(alvo, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`Não achei o arquivo "${alvo}". Para medir uma URL, comece com https://`);
    } else {
      console.error(`Não consegui ler "${alvo}" como relatório do Lighthouse: ${e.message}`);
    }
    return null;
  }
  return {
    lhr: json.lighthouseResult ?? json,
    campo: json.loadingExperience
      ? { pagina: json.loadingExperience, origem: json.originLoadingExperience }
      : null,
  };
}

const COMANDO_LIGHTHOUSE =
  'npx lighthouse <url> --only-categories=performance --locale=pt-BR --output=json --output-path=lh.json --chrome-flags="--headless=new" --quiet';

const dados = await carregar();
if (dados) imprimir(dados.lhr, dados.campo);
else process.exitCode = 1;

function imprimir(lhr, campo) {
  const A = lhr.audits ?? {};
  const perf = lhr.categories?.performance;
  const out = (s = "") => console.log(s);

  // ---------------------------------------------------------------- formatação

  const virgula = (n, casas) => n.toFixed(casas).replace(".", ",");
  const fmtMs = (v) => (v >= 1000 ? `${virgula(v / 1000, 1)} s` : `${Math.round(v)} ms`);
  const fmtKB = (b) => (b >= 1024 * 1024 ? `${virgula(b / 1024 / 1024, 1)} MB` : `${Math.round(b / 1024)} KB`);
  const nota = (score) => (score == null ? "-" : score >= 0.9 ? "bom" : score >= 0.5 ? "melhorar" : "ruim");
  const corta = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "");

  // Auditoria do Lighthouse → itens do checklist da skill (references/*.md).
  // Os ids mudam entre versões (o Lighthouse 12/13 trocou várias auditorias por
  // "insights"), por isso a busca é por pedaço do id. A ordem importa: o mais
  // específico vem antes.
  const MAPA = [
    [/lcp-discovery|prioritize-lcp|preload-lcp|lcp-lazy/, "15, 20"],
    [/lcp-breakdown|largest-contentful-paint-element/, "02, 15, 19, 20"],
    [/cls-culprits|layout-shift|unsized/, "01, 02, 29"],
    [/font/, "29"],
    [/image|offscreen|responsive-images/, "02, 15"],
    [/render-blocking/, "21, 22, 29"],
    [/unused-javascript|duplicated-javascript|legacy-javascript|unminified-javascript/, "11, 22"],
    [/unused-css|unminified-css/, "22"],
    [/third-part/, "21"],
    [/cache-insight|uses-long-cache-ttl/, "27"],
    [/text-compression/, "09"],
    [/document-latency|server-response-time|redirects/, "09, 19, 20"],
    [/modern-http|uses-http2/, "06, 09"],
    [/network-dependency-tree|critical-request-chains|preconnect/, "16, 21, 29"],
    [/dom-size/, "23"],
    [/bootup-time|mainthread|long-tasks|forced-reflow|inp-breakdown|interaction/, "22, 26"],
    [/total-byte-weight|network-requests/, "02, 11, 22"],
  ];
  const itensDe = (id) => MAPA.find(([re]) => re.test(id))?.[1] ?? "?";

  // ---------------------------------------------------------------- cabeçalho

  const url = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl;
  const aparelho = lhr.configSettings?.formFactor === "desktop" ? "computador" : "celular";
  out(`# ${url}`);
  out(
    `Lighthouse ${lhr.lighthouseVersion} · ${aparelho} · ${new Date(lhr.fetchTime).toLocaleString("pt-BR")}`,
  );
  if (lhr.runtimeError?.message) out(`ERRO na medição: ${lhr.runtimeError.message}`);
  for (const aviso of lhr.runWarnings ?? []) out(`Aviso: ${corta(aviso, 220)}`);
  out();

  // ---------------------------------------------------------------- campo (CrUX)

  const ROTULOS = {
    LARGEST_CONTENTFUL_PAINT_MS: ["LCP", fmtMs, "2,5 s"],
    INTERACTION_TO_NEXT_PAINT: ["INP", fmtMs, "200 ms"],
    CUMULATIVE_LAYOUT_SHIFT_SCORE: ["CLS", (v) => virgula(v / 100, 2), "0,1"],
    FIRST_CONTENTFUL_PAINT_MS: ["FCP", fmtMs, "1,8 s"],
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: ["TTFB", fmtMs, "0,8 s"],
  };
  const CATEGORIA = { FAST: "bom", AVERAGE: "melhorar", SLOW: "ruim" };

  function imprimirCampo(exp, titulo) {
    out(`## Campo: usuários reais (CrUX, p75 dos últimos 28 dias, ${titulo})`);
    out("| Métrica | p75 | Situação | Meta |");
    out("|---|---|---|---|");
    for (const [chave, [nome, fmt, meta]] of Object.entries(ROTULOS)) {
      const m = exp.metrics?.[chave];
      if (!m) continue;
      out(`| ${nome} | ${fmt(m.percentile)} | ${CATEGORIA[m.category] ?? m.category} | ≤ ${meta} |`);
    }
    out();
  }

  if (ehLeitura(campo?.pagina) && !campo.pagina.origin_fallback) {
    imprimirCampo(campo.pagina, "desta página");
  } else if (ehLeitura(campo?.origem)) {
    imprimirCampo(campo.origem, "do site inteiro; a página sozinha não tem tráfego suficiente");
  } else if (campo) {
    out("## Campo: sem dados de usuários reais (pouco tráfego no Chrome). Use só o laboratório.");
    out();
  }

  function ehLeitura(exp) {
    return Boolean(exp?.metrics && Object.keys(exp.metrics).length);
  }

  // ---------------------------------------------------------------- laboratório

  out(
    `## Laboratório (Lighthouse, ${aparelho}${aparelho === "celular" ? ", rede e CPU simuladas lentas" : ""})`,
  );
  out(`Nota de performance: ${perf?.score == null ? "?" : Math.round(perf.score * 100)}/100`);
  out();
  out("| Métrica | Valor | Situação | Meta |");
  out("|---|---|---|---|");
  const METRICAS = [
    ["first-contentful-paint", "FCP (primeiro conteúdo)", "1,8 s"],
    ["largest-contentful-paint", "LCP (conteúdo principal)", "2,5 s"],
    ["total-blocking-time", "TBT (bloqueio; aponta INP)", "200 ms"],
    ["cumulative-layout-shift", "CLS (tela pulando)", "0,1"],
    ["speed-index", "Speed Index", "3,4 s"],
  ];
  for (const [id, nome, meta] of METRICAS) {
    const au = A[id];
    if (!au) continue;
    out(`| ${nome} | ${au.displayValue ?? "?"} | ${nota(au.score)} | ≤ ${meta} |`);
  }
  out();

  // Elemento do LCP e as fases (TTFB, atraso de carga, carga, atraso de render).
  function* percorrer(obj) {
    if (!obj || typeof obj !== "object") return;
    yield obj;
    for (const v of Object.values(obj)) if (v && typeof v === "object") yield* percorrer(v);
  }
  let noLcp = null;
  const fases = [];
  for (const id of ["largest-contentful-paint-element", "lcp-breakdown-insight", "lcp-discovery-insight"]) {
    for (const o of percorrer(A[id]?.details)) {
      if (!noLcp && o.type === "node" && (o.snippet || o.nodeLabel)) noLcp = o;
      const fase = o.phase ?? o.subpart;
      const tempo = o.timing ?? o.duration;
      if (typeof fase === "string" && typeof tempo === "number" && !fases.some((f) => f.fase === fase)) {
        fases.push({ fase, nome: o.label ?? fase, tempo });
      }
    }
  }
  if (noLcp) {
    out(`Elemento do LCP: ${corta(noLcp.nodeLabel, 80)}`);
    if (noLcp.snippet) out(`  ${corta(noLcp.snippet, 200)}`);
    if (fases.length) out(`  Fases: ${fases.map((f) => `${f.nome} ${fmtMs(f.tempo)}`).join(" · ")}`);
    out();
  }

  // ---------------------------------------------------------------- o que corrigir

  const ids = new Set(METRICAS.map(([id]) => id).concat(["interactive", "max-potential-fid"]));
  const achados = [];
  for (const ref of perf?.auditRefs ?? []) {
    const au = A[ref.id];
    if (!au || ids.has(ref.id) || ref.group === "metrics") continue;
    if (["notApplicable", "manual", "error"].includes(au.scoreDisplayMode)) continue;
    if (au.score == null || au.score >= 0.9) continue;
    const s = au.metricSavings ?? {};
    const ms = Math.max((s.LCP ?? 0) + (s.FCP ?? 0) + (s.TBT ?? 0) + (s.INP ?? 0), au.details?.overallSavingsMs ?? 0);
    achados.push({ id: ref.id, au, ms, cls: s.CLS ?? 0, bytes: au.details?.overallSavingsBytes ?? 0 });
  }
  achados.sort((a, b) => b.ms - a.ms || b.cls - a.cls || b.bytes - a.bytes);

  function urlDoItem(it) {
    const u = it.url ?? it.source?.url ?? it.request?.url;
    if (typeof u === "string") return u;
    if (typeof it.entity === "string") return it.entity;
    if (it.entity?.text) return it.entity.text;
    if (it.node?.nodeLabel) return `elemento: ${it.node.nodeLabel}`;
    return null;
  }
  function detalheDoItem(it) {
    const partes = [];
    if (typeof it.totalBytes === "number") partes.push(fmtKB(it.totalBytes));
    if (typeof it.transferSize === "number" && it.totalBytes == null) partes.push(fmtKB(it.transferSize));
    if (typeof it.wastedBytes === "number" && it.wastedBytes > 0) partes.push(`sobra ${fmtKB(it.wastedBytes)}`);
    if (typeof it.wastedMs === "number" && it.wastedMs > 0) partes.push(`${fmtMs(it.wastedMs)} a ganhar`);
    if (typeof it.blockingTime === "number" && it.blockingTime > 0) partes.push(`bloqueia ${fmtMs(it.blockingTime)}`);
    if (typeof it.mainThreadTime === "number" && it.mainThreadTime > 0) partes.push(`CPU ${fmtMs(it.mainThreadTime)}`);
    return partes.join(", ");
  }

  out("## O que o Lighthouse aponta (maior ganho primeiro)");
  if (!achados.length) out("Nada reprovado. Confira o campo e o celular de verdade (item 31).");
  for (const { id, au, ms, cls, bytes } of achados) {
    const ganho = [];
    if (ms > 0) ganho.push(`~${fmtMs(ms)}`);
    if (cls > 0) ganho.push(`CLS ${virgula(cls, 2)}`);
    if (bytes > 0) ganho.push(fmtKB(bytes));
    const extra = [au.displayValue, ganho.length ? `ganho estimado ${ganho.join(", ")}` : ""]
      .filter(Boolean)
      .join(" · ");
    out(`- [itens ${itensDe(id)}] ${au.title}${extra ? ` (${extra})` : ""}  \`${id}\``);
    const itens = au.details?.items ?? [];
    let mostrados = 0;
    for (const it of itens) {
      const u = urlDoItem(it);
      if (!u) continue;
      const d = detalheDoItem(it);
      out(`    ${corta(u, 110)}${d ? `  (${d})` : ""}`);
      if (++mostrados === 3) break;
    }
  }
  out();

  // ---------------------------------------------------------------- diagnóstico geral

  const DIAG = [
    ["total-byte-weight", "Peso total"],
    ["dom-size", "Tamanho do DOM"],
    ["dom-size-insight", "Tamanho do DOM"],
    ["bootup-time", "Tempo de execução do JS"],
    ["mainthread-work-breakdown", "Trabalho na thread principal"],
    ["third-party-summary", "Terceiros"],
    ["third-parties-insight", "Terceiros"],
  ];
  const diag = DIAG.filter(([id]) => A[id]?.displayValue);
  if (diag.length) {
    out("## Diagnóstico geral");
    const vistos = new Set();
    for (const [id, nome] of diag) {
      if (vistos.has(nome)) continue;
      vistos.add(nome);
      out(`- ${nome}: ${A[id].displayValue}`);
    }
    out();
  }

  const resumo = A["resource-summary"]?.details?.items;
  if (Array.isArray(resumo) && resumo.length) {
    out("## Peso por tipo (transferido)");
    for (const r of resumo) {
      if (!r.requestCount) continue;
      out(`- ${r.label ?? r.resourceType}: ${r.requestCount} arquivos, ${fmtKB(r.transferSize ?? 0)}`);
    }
    out();
  }

  out("Lighthouse varia de uma rodada para outra: para comparar antes e depois, rode 3 vezes e use a mediana.");
}
