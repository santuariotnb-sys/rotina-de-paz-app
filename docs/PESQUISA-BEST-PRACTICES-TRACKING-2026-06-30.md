# Pesquisa — Best Practices de Tracking / Atribuição / CAPI (2025–2026)

> Síntese para o funil **Rotina de Paz** (Quiz Vite → LP → checkout Kirvano → webhook → app TanStack Start/Vercel). Pixel único **863734499693171**. Banco Supabase. Objetivo do dono: gestão 100% real/fiel, dedup, EMQ alto, sem inflar.
>
> Data: 2026-06-30. Todas as afirmações têm fonte (URL) ao lado. Nada inventado.

---

## 1. Deduplicação Pixel ↔ CAPI

**Regra exata (Meta oficial):** a Meta deduplica quando recebe um evento do **Pixel (browser)** e um da **CAPI (servidor)** que tenham:

1. **mesmo `event_name`** (ex.: `Purchase`), **E**
2. **mesmo `event_id`** (string idêntica byte-a-byte emitida pelos dois lados), **E**
3. ambos dentro da **janela de 48 horas**.
   — A Meta mantém a primeira ocorrência e descarta a segunda.
   Fontes: [Meta — Handling Duplicate Pixel and Server Events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/) · [TAGGRS — 48h window](https://taggrs.io/docs/server-side-tracking/facebook/event-deduplication) · [Analyzify](https://analyzify.com/hub/event-deduplication-for-meta-conversions)

**`action_source`:** o dedup browser↔servidor só vale para `action_source = "website"`. Eventos de app (`app`) e de loja física (`physical_store`) usam canais diferentes e **não devem** ser misturados na lógica de dedup web. Compras in-app server-side devem usar `action_source` apropriado (`website` se o checkout é web embutido; `app`/`system_generated` para renovações sem browser).
Fonte: [Meta dedup doc](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/) · [AdAmigo — Pixel vs CAPI mapping](https://www.adamigo.ai/blog/meta-pixel-vs-conversions-api-for-event-mapping)

**O que causa dupla contagem (erros comuns):**
- `event_id` ausente em um dos lados (Pixel manda, servidor não — ou vice-versa).
- `event_id` gerado **independentemente** em cada lado (UUID novo no browser e outro UUID no servidor) → nunca casam.
- `event_name` divergente (ex.: `Purchase` no Pixel vs `purchase`/`CompraConfirmada` no servidor).
- Eventos fora da janela de 48h (webhook que processa muito depois do clique).
- `action_source` errado/inconsistente.
Fontes: [Watsspace — event_id](https://watsspace.com/blog/meta-conversions-api-deduplication-event_id/) · [Medium — Fix Double Counting](https://medium.com/@agrowthagen/event-deduplication-in-meta-ads-fix-double-counting-8d795478b2a1)

**Como GARANTIR dedup quando browser e servidor disparam o mesmo evento:**
- Gere **um** `event_id` por ocorrência (UUID v4 / ULID, opaco e colisão-resistente). Para `Purchase`, use uma chave **determinística e estável** — idealmente o **`order_id` do Kirvano** — para que browser e servidor cheguem ao mesmo valor sem precisar coordenar (e para sobreviver a retries).
- Propague esse mesmo `event_id` do browser para o servidor (data layer, hidden field, querystring assinada, ou — no caso de webhook — derive do `order_id`).
- Meta: taxa de dedup deve ficar **perto de 100%** para eventos que disparam dos dois lados. Se cair muito, há mismatch de `event_id`/`event_name`.
Fontes: [Watsspace](https://watsspace.com/blog/meta-conversions-api-deduplication-event_id/) · [Meta dedup doc](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)

---

## 2. Event Match Quality (EMQ)

EMQ mede **quantos e quão bons** parâmetros de `user_data` você envia, e qual % de eventos a Meta consegue casar com uma conta. Cada parâmetro tem peso por **prioridade** — os de alta prioridade pesam mais; os de baixa somam incrementalmente.
Fontes: [Meta — Dataset Quality API](https://developers.facebook.com/docs/marketing-api/conversions-api/dataset-quality-api/) · [WeltPixel — EMQ guide](https://weltpixel.com/blogs/news/meta-event-match-quality-emq-guide) · [CustomerLabs — score 8+](https://www.customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/)

**Prioridade dos parâmetros (alto → suporte):**

| Tier | Parâmetros | Tratamento |
|---|---|---|
| **Alta prioridade (mais peso)** | `em` (email), `ph` (telefone), `external_id`, `fbc` (click id), `fbp` (browser id) | `em`/`ph`/`external_id` → **SHA-256, normalizados** (lowercase, trim; telefone E.164 só dígitos). `fbp`/`fbc` → **texto puro, NÃO hashear**. |
| **Média** | `fn` (first name), `ln` (last name), `ge`, `db`, `ct` (cidade), `st`, `zip`, `country` | hashear (SHA-256, normalizado). |
| **Suporte (só server-side)** | `client_ip_address`, `client_user_agent`, `fbclid` | **NÃO hashear**. IP/UA só existem com captura no servidor. |

Fontes: [Niblin — diagnose low EMQ](https://niblin.com/blog/meta-capi-event-match-quality) · [PixelFlow — how EMQ is generated](https://pixelflow.so/blog/how-facebook-generates-event-match-quality-scores) · [Watsspace — fbc/fbp](https://watsspace.com/blog/meta-conversions-api-fbc-and-fbp-parameters/)

**Captura correta de fbp / fbc / fbclid:**
- **`fbp`** = cookie first-party `_fbp`, setado pelo Pixel no 1º pageview; formato `fb.1.<timestamp>.<random>`; persiste ~90 dias (rolling). Envie como veio.
- **`fbc`** = derivado do `fbclid` da URL de chegada do anúncio. Formato `fb.1.<timestamp_ms>.<fbclid>`. O Pixel grava o cookie `_fbc` quando há `fbclid`. **Só gere `fbc` quando houver `fbclid`** — não invente artificialmente.
- **`fbclid`**: capture da query string no 1º toque e **persista** (cookie/storage), porque ele se perde cedo em redirects, domínios de tracking e handoff app→web.
Fontes: [Meta — fbp and fbc Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc) · [Meta — ClickID/fbc/fbp](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/fbp-and-fbc) · [DailyIntel — fbp/fbc/fbclid](https://dailyintelservice.com/blog/tracking-and-compliance/fbp-fbc-fbclid-explained)

**Por que captura server-side de IP/UA importa:** `client_ip_address` e `client_user_agent` **não são acessíveis de forma confiável pelo Pixel** — só pelo servidor (cabeçalhos da request). Eles são essenciais para a Meta casar o evento com o usuário e elevam o EMQ. Pegue o IP real (cuidado com proxy: `X-Forwarded-For` / `CF-Connecting-IP`) e o UA do header da request original do usuário, **não** do servidor que chama o Graph.
Fonte: [EasyInsights — EMQ](https://easyinsights.ai/blog/understanding-metas-emq-simplifying-ai-in-advertising/) · [Watsspace fbc/fbp](https://watsspace.com/blog/meta-conversions-api-fbc-and-fbp-parameters/)

**Metas de pontuação:** EMQ vai de 0 a 10. Bom = **6.0+**; ótimo = **8.0+**. Para chegar a 8+, mandar consistentemente `em`+`ph`+`external_id`+`fbp`+`fbc`+`ip`+`ua` no maior % de eventos possível.
Fonte: [CustomerLabs — 8+ em 2026](https://www.customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/)

---

## 3. Propagação de identidade cross-domínio / cross-app

O problema: manter um **identificador estável** (external_id + click-id) do **1º toque** (Quiz `sacra.rotinadepaz.com.br`) até a **compra** (webhook Kirvano), atravessando: subdomínio do Quiz → LP `rotinadepaz.com.br` → checkout de **terceiro (Kirvano)** → webhook.

**Padrões recomendados:**
- **external_id próprio, gerado cedo e persistido:** crie um id de 1ª parte (ex.: `rp_<uuid>`) no 1º toque, grave em **cookie first-party** (e localStorage como backup). Envie em **todo** evento (Pixel e CAPI) como `external_id`. É o cimento que liga sessões anônimas → lead → comprador. (Quiz Sacra já faz isso com prefixo `qs_`; replicar a ideia.)
- **Não perder fbp/fbc no redirect pro checkout:** o `fbclid` se perde cedo em redirects/domínios de tracking. Soluções: (a) capturar `fbclid` no 1º toque e persistir; (b) **decorar o link do checkout** com os parâmetros (`fbclid`/`fbp`/`fbc`/`external_id` em query string) — exige que o CTA seja `<a href>` real, não JS que dispara depois; (c) reconstruir `fbc` server-side a partir do `fbclid` propagado.
- **Cookie first-party em domínio-raiz:** setar cookies em `.rotinadepaz.com.br` (com ponto) faz Quiz (subdomínio) e LP **compartilharem** `_fbp`/`external_id`. Subdomínios diferentes do mesmo eTLD+1 compartilham; **Kirvano é eTLD+1 diferente → cookie NÃO viaja**, por isso a propagação para o checkout precisa ser via **query param** + **server-side stitching** no webhook.
- **Server-side stitching:** quando o webhook do Kirvano chega, ele traz `order_id`, email, telefone. Faça lookup do `external_id`/`fbp`/`fbc` que você guardou (no Supabase, indexado por `external_id` e/ou por email/telefone hash) e **junte** ao evento `Purchase` da CAPI. Sem isso, a compra chega sem fbp/fbc e o EMQ despenca.
Fontes: [Stape — server-side cross-domain (Cookie reStore)](https://stape.io/blog/server-side-cross-domain-tracking-using-cookie-restore-tag) · [Simo Ahava — CAPI via GTM server-side](https://www.simoahava.com/analytics/facebook-conversions-api-gtm-server-side-tagging/) · [DailyIntel — fbclid loss em redirects](https://dailyintelservice.com/blog/tracking-and-compliance/fbp-fbc-fbclid-explained)

---

## 4. Arquitetura de funil multi-superfície fiel

O risco do projeto: **3 coortes disjuntas** — (A) instrumentação por `session_id` de apps distintos (Quiz, LP, app), (B) atribuição por `external_id`/click-id, (C) receita confirmada pelo webhook — sendo costuradas por **`UNION ALL`**, o que **soma maçãs com laranjas** e produz um funil falso (etapas que não pertencem à mesma jornada empilhadas como se fossem).

**Padrões corretos:**
- **Single source of truth = uma tabela de eventos canônica** (server-side event collector), todos os eventos (de qualquer superfície) escritos com a **mesma espinha de identidade** (`external_id` + `session_id` + `event_name` + `event_id` + `ts` + `source`). Nada de tabelas paralelas por app que depois se "unem".
- **Identity resolution / stitching ANTES de montar o funil:** resolva `session_id` → `external_id` → comprador (email/telefone hash do webhook) numa camada de identidade. O funil é construído **sobre `external_id` resolvido**, não sobre `session_id` cru.
- **JOIN por identidade, não UNION de coortes:** o funil verdadeiro é `COUNT(DISTINCT external_id)` por etapa onde cada etapa é um **subconjunto** da anterior (quem viu LP ⊇ quem iniciou checkout ⊇ quem comprou). `UNION ALL` de coortes que não se sobrepõem é **conceitualmente errado** porque conta jornadas distintas como uma.
- **Receita = só o que o webhook confirmou.** Métricas financeiras (receita, ticket, LTV) são **real-only** (webhook/banco). Métricas de mídia (impressões, cliques, EMQ) são **Meta-rotuladas**. Não reconcilie as duas fontes no mesmo número sem deixar a origem explícita — senão você infla.
- **Pixel-PULL ≠ webhook-PUSH:** dados puxados do Events Manager (Meta) e dados empurrados pelo webhook são fontes diferentes; reconcilie-os por `order_id`/`event_id`, não somando.

*(Base conceitual: server-side event collector + identity stitching é o padrão de GTM server-side / data-layer único.)*
Fontes: [Simo Ahava — server-side tagging](https://www.simoahava.com/analytics/facebook-conversions-api-gtm-server-side-tagging/) · [Stape — Extended 2026 Setup](https://stape.io/blog/how-to-set-up-facebook-conversion-api) · [arXiv — Hitchhiker's Guide to FB Web Tracking](https://arxiv.org/pdf/2208.00710)

---

## 5. CAPI server-side patterns (sem vendor lock-in — projeto usa fetch direto ao Graph)

- **Captura de IP/UA no servidor:** pegue do header da request **do usuário** (no Quiz/LP/app), não do servidor que fala com o Graph. Por trás de Cloudflare/Vercel, leia `CF-Connecting-IP` / primeiro IP de `X-Forwarded-For` e o `User-Agent` original. Para o webhook do Kirvano (sem request do browser), o IP/UA precisam ter sido **capturados antes** e guardados (ligados ao `external_id`/`order_id`). *(Furo conhecido do projeto: `tracking_session` escrito só no Quiz e sem `client_ip` — a migração `20260608_tracking_session_client_ip.sql` ataca exatamente isso.)*
- **Retry / idempotência:** chamadas ao Graph podem falhar/repetir. Use **`event_id` determinístico** (derivado do `order_id`) como chave de idempotência — Meta deduplica retries automaticamente porque o `event_id` é o mesmo (mesmo `Purchase` reenviado conta 1x). No seu lado, registre `event_id` processado para não reprocessar.
- **`test_event_code`:** parâmetro para mandar eventos ao **Test Events** do Events Manager sem poluir produção. Use em dev/staging; **remova/condicione por env em produção** (evento com `test_event_code` não entra na otimização real).
- **Dedup de Purchase por `order_id`:** use `order_id` do Kirvano como base do `event_id` de `Purchase`. Isso dá: (1) dedup Pixel↔CAPI, (2) idempotência em retries, (3) proteção contra webhook duplicado do Kirvano.
- **Compras recorrentes / in-app:** cada renovação/cobrança é um **evento distinto** → `event_id` único por cobrança (ex.: `order_id` + `installment_n` / `charge_id`). Mesma chave de idempotência por cobrança. `action_source` coerente (`website` p/ checkout web, `app`/`system_generated` p/ renovação sem browser).
Fontes: [Meta — Server Event Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/) · [DigitalApplied — CAPI 2026](https://www.digitalapplied.com/blog/meta-tiktok-conversions-api-capi-server-side-tracking-2026) · [Zuplo — Idempotency Keys](https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide) · [Cometly — CAPI 2026 guide](https://www.cometly.com/post/facebook-conversion-api-setup)

---

## 6. Referências GitHub + pitfalls

- **`facebook/facebook-nodejs-business-sdk`** — SDK oficial; classes `EventRequest` / `ServerEvent` / `UserData` / `CustomData`. Pitfall documentado: **`event_id` não era propagado** se setado no objeto errado — confirme que `event_id` fica no mesmo nível de `event_name`/`event_time`. [Issue #308](https://github.com/facebook/facebook-nodejs-business-sdk/issues/308)
- **Gist — CAPI Node.js (oficial SDK):** exemplo mínimo de `EventRequest`/`ServerEvent`. [gist remarkablemark](https://gist.github.com/remarkablemark/0de93d964fd0a344b8ead875722d2bcf)
- **`RivercodeAB/facebook-conversion-api`** — wrapper Node.js com helpers de hashing e envio (útil de referência mesmo usando fetch direto). [GitHub](https://github.com/RivercodeAB/facebook-conversion-api)

**Pitfalls que se aplicam ao projeto:**
- `event_id` no nível errado do payload → dedup quebra (Issue #308).
- Hashear `fbp`/`fbc`/`fbclid`/`ip`/`ua` (NÃO devem ser hasheados) → Meta descarta.
- Não normalizar antes de hashear `em`/`ph` → não casam → EMQ baixo.
- `external_id` ausente na maioria dos eventos (furo atual: **0/9 vendas com external_id**) → sem espinha de identidade, atribuição cega.
- Webhook que dispara `Purchase` fora da janela de 48h sem `event_id` estável → dupla contagem / sem dedup.

---

## Apêndice — Furos do projeto vs best practice

| Furo atual | Best practice |
|---|---|
| `tracking_session` escrito só no Quiz, **sem `client_ip`/UA** | Coletar IP/UA server-side em toda superfície e ligar ao `external_id` (migração `20260608` corrige a captura). |
| **0/9 vendas com `external_id`** | external_id de 1ª parte gerado no 1º toque, propagado até a compra, presente em 100% dos eventos. |
| Funil por **`UNION ALL`** de coortes disjuntas | Tabela de eventos canônica + identity stitching + funil por `COUNT(DISTINCT external_id)` (subconjuntos), JOIN por identidade. |
| Pixel client-only sem `event_id`/CAPI casado na LP | `event_id` determinístico (base `order_id`) emitido no browser **e** no webhook; `action_source=website`. |
| Receita potencialmente misturando Meta-PULL e webhook-PUSH | Receita = real-only (webhook); mídia = Meta-rotulada; reconciliar por `order_id`, nunca somar. |
