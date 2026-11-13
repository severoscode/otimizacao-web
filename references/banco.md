# Banco de dados

Num app com Supabase ou Postgres, quase sempre é aqui que está a maior lentidão. Itens 08,
17, 24 e 25, mais a RLS lenta no Supabase.

Regra desta camada: **você propõe, a pessoa roda.** Mostre o SQL e espere. `EXPLAIN ANALYZE`
executa de verdade a consulta: use só com `SELECT` (num `UPDATE` ou `DELETE`, ele altera os
dados).

## Sumário

- [08 Consultas N+1](#08)
- [17 Índices para as consultas comuns](#17)
- [RLS lenta no Supabase](#rls)
- [24 Só as colunas usadas](#24)
- [25 Pool de conexões](#25)
- [Achar as consultas mais caras](#caras)

---

<a id="08"></a>
## 08 · Corrigir as consultas N+1 (TOP)

**O que é.** Busca 20 posts e depois faz 1 consulta por post para pegar o autor: 21
consultas onde 1 resolvia. Código escrito por IA cai muito nisso, e também componente de
linha de lista que busca o próprio dado.

**Vale:** sempre.

**Como conferir.**
- DevTools → Network → filtro `rest/v1` → abra a tela de lista. Uma requisição por item da
  lista é N+1.
- No código: consulta dentro de `for`, `map` ou `forEach`; `Promise.all(itens.map(buscar))`
  (é N+1 em paralelo, continua N consultas); componente de linha com `useQuery` próprio.
- Python: log de SQL do ORM (`echo=True` no SQLAlchemy) mostrando a mesma consulta repetida.

**Como corrigir.**
- **supabase-js, relação embutida no select** (precisa da chave estrangeira):

  ```ts
  const { data } = await supabase
    .from("posts")
    .select("id, titulo, criado_em, autor:profiles(nome, avatar_url)")
    .order("criado_em", { ascending: false })
    .range(0, 19);
  ```

- **Lista de ids:** uma consulta com `.in("id", ids)` e junte no código.
- **SQL:** `JOIN`. Agregação complexa (totais por cliente, por exemplo): uma função do
  Postgres chamada com `supabase.rpc()`.
- **ORMs:** SQLAlchemy `selectinload()` ou `joinedload()`; Django `select_related()` e
  `prefetch_related()`; Prisma `include`; Drizzle `with`.
- **React:** busque no pai (ou no loader) com a relação embutida e passe para as linhas.

**Cuidado.** Na relação embutida, peça só as colunas usadas também do outro lado
(`autor:profiles(nome)`, não `profiles(*)`).

---

<a id="17"></a>
## 17 · Índices para as consultas mais comuns (TOP)

**O que é.** O índice é o sumário da tabela: em vez de ler linha por linha, o banco vai
direto. O Postgres cria índice sozinho só na chave primária e em `unique`; **não** cria nas
chaves estrangeiras (`user_id`, `cliente_id`, `org_id`).

**Vale:** coluna usada em filtro (`where`, `.eq`, `.in`), ordenação (`order by`, `.order`),
`JOIN` e política de RLS, em tabela que cresce (milhares de linhas para cima). **Não vale:**
tabela de poucas centenas de linhas (ler tudo é rápido), nem índice "por garantia": cada um
deixa as gravações um pouco mais lentas e ocupa espaço.

**Como conferir.**
- No SQL Editor do Supabase, com a consulta real:

  ```sql
  explain analyze
  select id, nome, status from leads
  where org_id = '...' and status = 'novo'
  order by criado_em desc
  limit 20;
  ```

  `Seq Scan` numa tabela grande, com muitas linhas descartadas pelo filtro, indica índice
  faltando. Depois do índice deve aparecer `Index Scan` ou `Bitmap Index Scan`, e o
  "Execution Time" cai.
- **Supabase:** Database → Query Performance (as consultas que mais custam), Advisors →
  Performance (aponta chave estrangeira sem índice, entre outras coisas) e o Index Advisor
  (`select * from index_advisor('select ... sua consulta ...');`).
- No código: liste os `.eq`, `.in`, `.order`, `.ilike` das tabelas que mais crescem.

**Como corrigir.**

```sql
-- chave estrangeira
create index if not exists pedidos_cliente_id_idx on public.pedidos (cliente_id);

-- filtro + ordenação: primeiro as colunas de igualdade, depois a de ordem/intervalo
create index if not exists leads_org_status_criado_idx
  on public.leads (org_id, status, criado_em desc);

-- índice parcial: só as linhas que a tela consulta
create index if not exists tarefas_abertas_idx on public.tarefas (responsavel_id) where concluida = false;

-- busca por trecho de texto (ilike '%termo%')
create extension if not exists pg_trgm with schema extensions; -- fora do public (Advisors do Supabase)
create index if not exists clientes_nome_trgm_idx on public.clientes using gin (nome gin_trgm_ops);
```

Em tabela grande em produção, use `create index concurrently` para não travar as
gravações. Ele não roda dentro de transação: se a ferramenta de migração embrulha o arquivo
numa transação, rode esse comando à parte.

**Cuidado.** `ilike '%termo%'` não usa índice comum; precisa do trigram. Índice que nunca é
usado só custa: `select indexrelname, idx_scan from pg_stat_user_indexes order by idx_scan;`
mostra os parados (confira por um tempo antes de apagar).

---

<a id="rls"></a>
## RLS lenta no Supabase

Política de RLS roda em cada linha que a consulta toca. Escrita do jeito ingênuo, ela
multiplica o custo da consulta. Os ajustes que mais rendem:

- **Envolva as funções em `select`:** `(select auth.uid()) = user_id` em vez de
  `auth.uid() = user_id`. Assim o Postgres calcula uma vez por consulta, não uma vez por
  linha.
- **Índice nas colunas da política** (`user_id`, `org_id`): item 17.
- **Filtre também na consulta**, além da política: `.eq("org_id", orgId)`. O planejador usa
  o índice com o filtro explícito.
- **Evite JOIN dentro da política.** Prefira `org_id in (select org_id from membros where
  user_id = (select auth.uid()))`, ou uma função `security definer` que devolve os ids
  permitidos.
- **Diga o papel:** `to authenticated` na política, para ela nem rodar para `anon`.

Mais detalhe na skill `supabase-postgres-best-practices`, se instalada.

---

<a id="24"></a>
## 24 · Pedir só as colunas que você precisa (TOP)

**O que é.** Trocar `select('*')` pela lista do que a tela usa. Coluna de texto longo, JSON,
embedding ou imagem em base64 numa listagem pesa à toa: no banco, na rede e no navegador.

**Vale:** sempre, principalmente em lista. **Não vale:** tabela de três colunas.

**Como conferir.**
- DevTools → Network → requisição da lista → coluna Size, antes e depois.
- No código: `select('*')`, `select("*")`, `.select()` sem argumento (é o mesmo que `*`) e
  `select *` em SQL.

**Como corrigir.**
- Liste as colunas que a tela usa: `.select("id, nome, status, criado_em")`.
- O que só aparece no detalhe (descrição longa, JSON de configuração, anexos) sai da
  listagem e é buscado quando abre o detalhe.
- Os tipos gerados do Supabase acompanham a string do `select`; rode o `tsc` depois para ver
  o que quebrou.
- SQLAlchemy: `load_only()` ou `defer()`; Django: `only()` ou `values()`.

**Cuidado.** Imagem em base64 dentro de coluna é o pior caso: mova para o Storage e guarde
só o caminho.

---

<a id="25"></a>
## 25 · Pool de conexões

**O que é.** Reaproveitar conexões abertas com o banco em vez de abrir uma nova a cada
requisição. Abrir conexão com o Postgres custa caro, e o banco aceita um número limitado
delas: em serverless, sem pool, as conexões acabam no pico.

**Vale:** servidor que conecta direto no Postgres (`pg`, `postgres`, Prisma, Drizzle,
SQLAlchemy, psycopg), principalmente em serverless (Vercel, Workers) ou com várias
instâncias. **Não vale:** quem só usa o supabase-js, que fala por HTTP com a API do Supabase
(o pool já está do lado de lá).

**Como conferir.**
- Veja a string de conexão no `.env`. Porta `6543` é o modo transaction: no pooler
  compartilhado (`*.pooler.supabase.com:6543`) ou no dedicado (`db.<ref>.supabase.co:6543`,
  planos pagos). Porta `5432` é o modo session do pooler ou a conexão direta
  (`db.<ref>.supabase.co:5432`).
- Erros "too many connections" ou "remaining connection slots are reserved" nos logs são o
  sinal.

**Como corrigir.**
- **Serverless (Vercel, funções) com Supabase:** a string do pooler em modo transaction
  (porta 6543). No pooler compartilhado (`pooler.supabase.com`) desligue os prepared
  statements: no `postgres` (postgres.js), `prepare: false`; no Prisma, siga o guia dele
  para o pooler (parâmetro `pgbouncer=true`). No pooler dedicado eles funcionam.
- **Cloudflare Workers:** Hyperdrive. Ele mantém o pool perto do banco e pode guardar
  consultas de leitura. Configure o binding no `wrangler.jsonc` e conecte com
  `env.HYPERDRIVE.connectionString`; siga o guia do Hyperdrive para Supabase sobre qual
  string de conexão usar.
- **Servidor que fica de pé (VPS, FastAPI, Express):** um pool por processo, criado na
  subida e reaproveitado (`new Pool()` do `pg`, `create_engine(pool_size=5, max_overflow=10)`
  do SQLAlchemy, `asyncpg.create_pool`). Instâncias × tamanho do pool tem de caber no
  limite de conexões do banco.

**Cuidado.** Criar o pool dentro da requisição é o mesmo que não ter pool (erro comum). No
modo transaction não funcionam `SET` de sessão, tabelas temporárias, `LISTEN/NOTIFY` nem
travas consultivas de sessão.

---

<a id="caras"></a>
## Achar as consultas mais caras

Quando não se sabe por onde começar, pergunte ao próprio banco (no Supabase, a extensão
`pg_stat_statements` já vem ligada):

```sql
select
  calls as vezes,
  round(total_exec_time::numeric) as total_ms,
  round(mean_exec_time::numeric, 1) as media_ms,
  rows as linhas,
  left(query, 120) as consulta
from pg_stat_statements
order by total_exec_time desc
limit 15;
```

A que tem o maior `total_ms` é a que mais pesa no somatório (pode ser uma rápida chamada
milhares de vezes, sinal de N+1). A de maior `media_ms` é a mais lenta por chamada. Para
cada uma: `EXPLAIN ANALYZE`, índice (17), colunas (24), N+1 (08).
