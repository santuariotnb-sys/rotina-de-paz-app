# Pesquisa: Meta Pixel + CAPI — Como Funciona em 2026

> Compilado em 2026-05-29. Baseado em docs oficiais Meta + guides atualizados.

---

## 1. POR QUE PIXEL + CAPI JUNTOS (NAO E OPCIONAL)

**Cookies de terceiros morreram.** Chrome completou o phaseout em 2025, juntando Safari e Firefox. Pixel sozinho perde 20-30% dos eventos por:
- iOS ATT (App Tracking Transparency)
- Ad blockers
- Consent banners
- Navegacao privada

**CAPI recupera 15-40% das conversoes perdidas.** Meta agora considera CAPI requisito basico, nao diferencial.

**Impacto medido:**
- +20% conversoes para Purchase com CAPI
- CPA reduz 15-25%
- ROAS melhora 10-25%
- Algoritmo leva 30-60 dias para otimizar com dados novos

---

## 2. COMO O ALGORITMO DA META USA SEUS DADOS

### Event Match Quality (EMQ) — Score 1 a 10

EMQ mede quao bem a Meta consegue associar seus eventos a usuarios reais do Facebook.

| EMQ Score | Classificacao | CPA Impact |
|-----------|--------------|------------|
| < 4       | Poor         | Algoritmo quase cego |
| 4-5.9     | OK (pixel-only tipico) | Baseline |
| 6-7.9     | Good         | -10-15% CPA |
| 8-10      | Great (CAPI bem feito) | -15-25% CPA |

**Caso real:** EMQ de 8.6 → 9.3 resultou em CPA -18%, match rate +24%, ROAS +22%.

### O que aumenta EMQ

Cada parametro hasheado adicional melhora o score:

| Parametro | Impacto | Quando voce tem |
|-----------|---------|-----------------|
| email (hashed) | ALTO | Quiz capture, checkout |
| phone (hashed) | ALTO | Checkout |
| fbp cookie | MEDIO | Automatico no pixel |
| fbc cookie | MEDIO | Click em anuncio |
| client_ip_address | MEDIO | Server-side (CAPI) |
| client_user_agent | MEDIO | Server-side (CAPI) |
| external_id | MEDIO | Seu lead_id/user_id |
| first_name (hashed) | BAIXO | Quiz capture |
| country | BAIXO | Padrao BR |

**Regra:** Envie tudo que voce tem. Quanto mais parametros, melhor o match.

---

## 3. COMO FUNCIONA A DEDUPLICACAO

Pixel (browser) e CAPI (server) enviam o MESMO evento. Meta precisa contar so 1 vez.

```
Browser (Pixel):  fbq('track', 'Purchase', {value: 47, currency: 'BRL'}, {eventID: 'txn_abc123'})
Server (CAPI):    event_name: 'Purchase', event_id: 'txn_abc123', value: 47, currency: 'BRL'
```

**Mecanismo:** Meta usa `event_id` + `event_name` + `pixel_id` para identificar duplicatas.
- Janela de deduplicacao: **48 horas** — eventos com mesmo event_id dentro de 48h sao deduplicados
- Fora da janela: contados como eventos separados

**Regra critica:** `eventID` (pixel) e `event_id` (CAPI) devem ser IDENTICOS.
- Mesmo case (case-sensitive)
- Mesmo formato (string)
- Sem espacos extras
- Sem diferenca de precisao (ex: "1678901234" vs "1678901234.567" FALHA)

**Falhas comuns de deduplicacao:**
- Gerar event_id com logica diferente no client vs server
- Usar timestamp como event_id mas com precisao diferente (ms vs s)
- Eventos com mesmo nome mas event_ids diferentes = contados separadamente

Se nao bater → evento duplicado → metricas infladas → algoritmo confuso.

**Pattern correto para o projeto:**
```javascript
// Gerar event_id NO CLIENT, passar pro server
const eventId = `purchase_${transactionId}`;

// Client (Pixel)
fbq('track', 'Purchase', {...}, { eventID: eventId });

// Server (CAPI) — recebe o MESMO eventId
serverEvent.setEventId(eventId);
```

---

## 4. EVENTOS PARA O FUNIL QUIZ → COMPRA

### Mapeamento para Rotina de Paz

| Etapa do Funil | Evento Meta | Onde Disparar | Tipo |
|----------------|-------------|---------------|------|
| Carregou quiz | PageView | Automatico no layout | Pixel |
| Iniciou quiz (clicou comecar) | ViewContent | QuizApp hero → start | Pixel |
| Completou quiz | CompleteRegistration | QuizApp loading → result | Pixel |
| Capturou email | Lead | QuizApp email capture | Pixel + CAPI |
| Viu oferta/bridge | ViewContent (content_name: 'offer') | QuizApp bridge/offer | Pixel |
| Clicou checkout | InitiateCheckout | Redirect Kirvano | Pixel |
| Comprou | Purchase | Pagina /obrigado | Pixel + CAPI |
| Upsell aceito | Purchase (content_name: 'upsell') | Pagina pos-upsell | Pixel + CAPI |

### Micro-conversoes (opcional mas recomendado)

Enviar eventos em cada step do quiz da mais dados pro algoritmo durante fase de aprendizado:
- QuizStep1, QuizStep2... como custom events
- Util nos primeiros 30-60 dias de campanha
- Depois que o algoritmo estabiliza, pode manter so os standard events

---

## 5. IMPLEMENTACAO TECNICA — NEXT.JS / VINXI

### Pixel (Client-Side)

```typescript
// Snippet base do pixel — vai no layout global
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'SEU_PIXEL_ID');
fbq('track', 'PageView');
```

**Disparar eventos standard:**
```typescript
// Lead (quiz email capture)
fbq('track', 'Lead', {
  content_name: 'quiz_rotina_de_paz',
  content_category: 'ansiedade'
}, { eventID: 'lead_' + leadId });

// InitiateCheckout
fbq('track', 'InitiateCheckout', {
  value: 47.00,
  currency: 'BRL',
  content_ids: ['rotina-de-paz'],
  content_type: 'product'
}, { eventID: 'checkout_' + leadId });

// Purchase (na pagina /obrigado)
fbq('track', 'Purchase', {
  value: 47.00,
  currency: 'BRL',
  content_ids: ['rotina-de-paz'],
  content_type: 'product'
}, { eventID: 'purchase_' + transactionId });
```

### CAPI (Server-Side) — Node.js SDK

```typescript
// facebook-nodejs-business-sdk
import bizSdk from 'facebook-nodejs-business-sdk';
const { EventRequest, ServerEvent, UserData, CustomData } = bizSdk;

const userData = new UserData()
  .setEmail('hash_do_email')      // SHA256
  .setClientIpAddress(ip)          // NAO hashear
  .setClientUserAgent(userAgent)   // NAO hashear
  .setFbp(fbpCookie)              // NAO hashear
  .setFbc(fbcCookie)              // NAO hashear
  .setCountry('br');              // hashear

const customData = new CustomData()
  .setValue(47.00)
  .setCurrency('brl')
  .setContentType('product')
  .setOrderId(transactionId);

const event = new ServerEvent()
  .setEventName('Purchase')
  .setEventTime(Math.floor(Date.now() / 1000))
  .setUserData(userData)
  .setCustomData(customData)
  .setEventSourceUrl('https://rotinadepaz.com.br/obrigado')
  .setEventId('purchase_' + transactionId)  // MESMO eventID do pixel
  .setActionSource('website');

const request = new EventRequest(accessToken, pixelId)
  .setEvents([event]);

await request.execute();
```

### Onde disparar CAPI no projeto

| Evento | Endpoint Server | Trigger |
|--------|----------------|---------|
| Lead | API route `/api/meta/lead` | Quiz email capture |
| Purchase | Webhook Kirvano handler | SALE_APPROVED |
| Purchase (upsell) | Webhook Kirvano handler | SALE_APPROVED (offer_id upsell) |

---

## 6. ENV VARS NECESSARIAS

```env
NEXT_PUBLIC_META_PIXEL_ID=        # ID do pixel (publico, vai pro browser)
META_ACCESS_TOKEN=                # Token CAPI (SECRETO, so server)
META_PIXEL_ID=                    # Mesmo ID do pixel (server-side)
META_TEST_EVENT_CODE=             # Para testar sem afetar producao (temporario)
```

---

## 7. CHECKLIST PRE-IMPLEMENTACAO

- [ ] Criar pixel no Meta Events Manager (se nao existe)
- [ ] Gerar access token com permissao `ads_management` e `pages_read_engagement`
- [ ] Verificar dominio rotinadepaz.com.br no Business Manager
- [ ] Configurar eventos prioritarios (iOS 14+): Purchase > Lead > ViewContent
- [ ] Preparar TEST_EVENT_CODE para validacao
- [ ] Primeiros 72h apos deploy: monitorar Events Manager para volume + EMQ + deduplicacao

---

## 8. PARAMETROS DETALHADOS — REFERENCIA OFICIAL

### Server Event (obrigatorios)

| Parametro | Tipo | Obrigatorio | Descricao |
|-----------|------|-------------|-----------|
| event_name | string | SIM | Nome do evento standard ou custom |
| event_time | int | SIM | Unix timestamp em SEGUNDOS (Date.now()/1000) |
| event_id | string | SIM (para dedup) | ID unico compartilhado com pixel |
| action_source | string | SIM | "website", "app", "phone_call", "physical_store", "offline" |
| event_source_url | string | Recomendado | URL onde o evento ocorreu |
| opt_out | boolean | NAO | Se true, evento nao usado para otimizacao |

### User Data — O QUE HASHEAR E O QUE NAO

| Parametro | SDK Method | Hashear (SHA256)? | Pontos EMQ |
|-----------|-----------|-------------------|------------|
| email | setEmail() | SIM | 3-4 pts |
| phone | setPhone() | SIM | 2-3 pts |
| first_name | setFirstName() | SIM | 1 pt |
| last_name | setLastName() | SIM | 1 pt |
| city | setCity() | SIM | 0.5 pt |
| state | setState() | SIM | 0.5 pt |
| zip | setZip() | SIM | 0.5 pt |
| country | setCountry() | SIM | 0.5 pt |
| external_id | setExternalId() | SIM | 1 pt |
| client_ip_address | setClientIpAddress() | **NAO** (texto limpo) | 0.5 pt |
| client_user_agent | setClientUserAgent() | **NAO** (texto limpo) | 0.5 pt |
| fbp | setFbp() | **NAO** (texto limpo) | 2 pts |
| fbc | setFbc() | **NAO** (texto limpo) | 1-2 pts |

**SDK hasheia automaticamente** quando voce passa texto limpo em setEmail(), setPhone() etc.
Apenas IP, user agent, fbp e fbc vao em texto limpo.

### Cookies fbp e fbc — formato

```
fbp: "fb.1.1558571054389.1098115397"
     fb.[subdomain_index].[creation_time].[random_number]

fbc: "fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"  
     fb.[subdomain_index].[creation_time].[fbclid_value]
```

- fbp: criado automaticamente pelo pixel, persiste como cookie `_fbp`
- fbc: criado quando usuario clica num anuncio (parametro fbclid na URL), cookie `_fbc`
- **Capturar no server:** ler cookies `_fbp` e `_fbc` do request headers

### Custom Data (por evento)

| Parametro | Tipo | Obrigatorio | Eventos |
|-----------|------|-------------|---------|
| value | float | SIM (Purchase) | Purchase, Lead, InitiateCheckout |
| currency | string | SIM (Purchase) | Purchase, Lead, InitiateCheckout |
| content_ids | string[] | Recomendado | ViewContent, Purchase |
| content_type | string | Recomendado | "product" ou "product_group" |
| content_name | string | Opcional | Todos |
| content_category | string | Opcional | Todos |
| order_id | string | Recomendado | Purchase |
| num_items | int | Opcional | InitiateCheckout |
| status | string | Opcional | CompleteRegistration, Lead |

---

## 9. ADVANCED MATCHING NO PIXEL (Client-Side)

Alem do CAPI, o pixel tambem pode enviar user data para melhorar match:

```javascript
// Opcao 1: No init (recomendado — roda em todas as paginas)
fbq('init', 'PIXEL_ID', {
  em: 'email@exemplo.com',   // hasheia automaticamente
  fn: 'guilherme',            // hasheia automaticamente
  ln: 'henrique',
  country: 'br',
  external_id: 'lead_abc123'
});

// Opcao 2: Automatic Advanced Matching
// Habilitado no Events Manager → Settings → Advanced Matching → ON
// Pixel detecta automaticamente campos de formulario (email, phone, name)
```

**Para o quiz:** Quando captura email/nome, re-inicializar pixel com esses dados:
```javascript
// Apos captura no quiz
fbq('init', 'PIXEL_ID', { em: userEmail, fn: userName });
fbq('track', 'Lead', {...}, { eventID: leadEventId });
```

---

## 10. FASE DE APRENDIZADO DO ALGORITMO

| Fase | Duracao | O que acontece |
|------|---------|----------------|
| Setup | 0-72h | Verificar volume, EMQ, deduplicacao no Events Manager |
| Learning | 7-21 dias | Algoritmo precisa de **50 conversoes por ad set** |
| Optimized | 30-60 dias | CAPI data totalmente integrado nas otimizacoes |

**Regras durante aprendizado:**
- NAO mexer nos ad sets (budget, audience, creative) durante learning
- 50 conversoes/semana por ad set = minimo para sair do learning
- Se nao atinge 50/semana: consolidar ad sets ou usar evento mais alto no funil (Lead em vez de Purchase)

---

## 11. ERROS COMUNS A EVITAR

1. **eventID diferente entre pixel e CAPI** → duplicacao, metricas infladas
2. **Nao enviar fbp/fbc cookies no CAPI** → EMQ cai 2-3 pontos
3. **Hashear IP e user agent** → Meta precisa deles em texto limpo
4. **Nao hashear email/phone** → dados pessoais em texto limpo violam politica
5. **Disparar Purchase no pixel sem pagina /obrigado propria** → depende do Kirvano, perde controle
6. **Nao priorizar eventos no iOS 14+ config** → Purchase DEVE ser evento #1
7. **event_time em milissegundos** → Date.now() retorna ms, Meta espera SEGUNDOS (dividir por 1000)
8. **Nao verificar dominio no Business Manager** → atribuicao iOS quebrada
9. **Rotacionar access token** → trocar a cada 90 dias, nunca commitar no git
10. **Mexer nos ad sets durante learning phase** → reseta os 50 conversoes necessarias

---

## 12. SERVER-SIDE PROXY — CONTORNANDO BLOQUEIOS iOS/SAFARI

### O problema

| Bloqueio | Impacto | Afeta |
|----------|---------|-------|
| Safari ITP | Cookies JS limitados a 7 dias, fbclid cookies a 24h | Todos os browsers iOS (Chrome, Firefox, Edge usam WebKit) |
| Ad blockers | 40%+ das sessoes bloqueiam pixel client-side | Desktop + mobile |
| iOS ATT | "Ask App Not to Track" bloqueia IDFA e tracking cross-app | Apps iOS |

**CAPI sozinho ja resolve a maioria** — eventos vao server→Meta, sem passar pelo browser.
Mas os COOKIES (_fbp, _fbc) ainda dependem do browser para serem criados.

### Arquitetura: Passagem pelo servidor (proxy first-party)

```
Visitante → rotinadepaz.com.br (Vercel)
  ↓
  GET /api/fbevt → cria cookie _fbevt via Set-Cookie header (server-side)
  ↓                 ↑ Cookie server-side = nao limitado pelo ITP 7 dias
  Pixel carrega → cria _fbp, _fbc (JS cookies — limitados a 7 dias no Safari)
  ↓
  Evento acontece (Lead, Purchase...)
  ↓
  ├─ Browser: fbq('track', 'Lead', {...}, {eventID})  ← pode ser bloqueado
  │
  └─ Browser: POST /api/capi {event_name, event_id, email...}
       ↓
       Route Handler (server-side):
       ├─ Le cookies: _fbp, _fbc, _fbevt do request
       ├─ Le IP: x-forwarded-for header
       ├─ Le User Agent: user-agent header
       ├─ Hasheia PII (email, phone, name)
       └─ POST → graph.facebook.com/v22.0/{pixel_id}/events
                 ↑ server→server = NUNCA bloqueado
```

### Por que funciona

1. **POST /api/capi vai pro SEU dominio** — ad blockers filtram por dominio (facebook.com, connect.facebook.net), nao pelo seu
2. **Route Handler roda no server** — nao depende de JS no browser
3. **Cookies Set-Cookie** (server-side) tem vida de ate 400 dias no Safari, vs 7 dias para JS cookies
4. **IP e User Agent** sao capturados do request, nao do browser — sempre disponiveis

### Implementacao Next.js/Vinxi — Route Handler CAPI

```typescript
// app/api/capi/route.ts (ou equivalente em Vinxi)
import crypto from 'crypto'

function sha256(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex')
}

export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') ?? ''
  
  // Filtrar bots
  if (/bot|crawl|spider|slurp|googlebot/i.test(ua)) {
    return Response.json({ ok: false })
  }

  const body = await req.json()
  const { event_name, event_id, page_url, custom_data,
          email, phone, first_name, last_name } = body

  // Ler cookies do request (browser envia automaticamente para mesmo dominio)
  const cookieHeader = req.headers.get('cookie') ?? ''
  const getCookie = (name: string) => {
    const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`))
    return match?.[1]
  }

  const fbp = getCookie('_fbp')
  const fbc = getCookie('_fbc')
  const fbevt = getCookie('_fbevt')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? ''

  const user_data: Record<string, unknown> = {
    client_ip_address: ip,          // texto limpo
    client_user_agent: ua,          // texto limpo
    ...(fbp && { fbp }),            // texto limpo
    ...(fbc && { fbc }),            // texto limpo
    ...(fbevt && { external_id: [sha256(fbevt)] }),
    ...(email && { em: [sha256(email.toLowerCase().trim())] }),
    ...(phone && { ph: [sha256(phone.replace(/[^0-9+]/g, ''))] }),
    ...(first_name && { fn: [sha256(first_name.toLowerCase().trim())] }),
    ...(last_name && { ln: [sha256(last_name.toLowerCase().trim())] }),
  }

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url: page_url,
      action_source: 'website',
      user_data,
      ...(custom_data && { custom_data }),
    }],
    ...(process.env.META_TEST_EVENT_CODE && {
      test_event_code: process.env.META_TEST_EVENT_CODE
    }),
  }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )

  const result = await res.json()
  return Response.json({ ok: true, events_received: result.events_received })
}
```

### Cookie first-party via Set-Cookie (contorna ITP)

```typescript
// app/api/fbevt/route.ts
import crypto from 'crypto'

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  if (cookieHeader.includes('_fbevt=')) {
    return Response.json({ ok: true })
  }

  const token = crypto.randomBytes(16).toString('hex')

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `_fbevt=${token}; Path=/; Max-Age=31536000; Secure; SameSite=Strict`,
      //                                      ^^^^^^^^^ 1 ano
      // Set-Cookie header = server-side cookie = NAO limitado pelo Safari ITP
    },
  })
}
```

### Client-side: enviar eventos via proxy

```typescript
// lib/tracking.ts (client)
export async function sendCapi(params: {
  event_name: string
  event_id: string
  custom_data?: Record<string, unknown>
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
}) {
  // POST para SEU dominio — nao bloqueado por ad blockers
  await fetch('/api/capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      page_url: window.location.href,
    }),
  })
}

// Uso no quiz:
const eventId = `lead_${leadId}`
fbq('track', 'Lead', { content_name: 'quiz' }, { eventID: eventId })
sendCapi({ event_name: 'Lead', event_id: eventId, email: userEmail })
```

### Geolocation — como ajuda no tracking

O IP do visitante (capturado via `x-forwarded-for`) fornece:
- **Pais/estado/cidade** → Meta usa para match quando nao tem email/phone
- **Timezone** → ajuda a validar se o evento e legítimo
- **ISP** → fingerprinting passivo para match cross-device

No CAPI, o `client_ip_address` contribui ~0.5 pts de EMQ. Nao e o parametro mais forte, mas combinado com user_agent, fbp/fbc, email, cria um perfil robusto que o algoritmo consegue matchear mesmo quando:
- Usuario recusou ATT no iOS
- Cookies expiraram (Safari ITP)
- Ad blocker bloqueou o pixel

**Voce NAO precisa de geolocalizacao explicita (GPS/navigator.geolocation).** O IP ja fornece geo suficiente para a Meta.

---

## Sources

- [Meta Pixel Reference — Developers](https://developers.facebook.com/docs/meta-pixel/reference)
- [Conversions API — Meta Developers](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [Deduplicacao Pixel + CAPI — Meta](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)
- [Server-Side Tracking Next.js — Milan Pavlak](https://milanpavlak.sk/blog/server-side-tracking-nextjs-meta-capi-sgtm)
- [Server-Side Cookies vs Safari ITP — Seresa](https://seresa.io/blog/data-loss/server-side-cookie-setting-why-your-server-can-set-cookies-safari-cannot-kill)
- [iOS Tracking Challenges 2026 — Redclawey](https://redclawey.com/en/blog/ios-tracking-challenges-2026/)
- [Safari ITP — Stape](https://stape.io/blog/safari-itp)
- [Meta Pixel + CAPI Setup Guide 2026](https://blog.funnelfox.com/meta-pixel-and-conversions-api/)
- [Facebook CAPI vs Pixel Guide 2026](https://www.cometly.com/post/facebook-conversion-api-vs-pixel)
- [Event Match Quality — How to Score 8+](https://www.customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/)
- [Meta CAPI Setup Guide — Ingest Labs](https://ingestlabs.com/blogs/meta-capi-setup-complete-implementation-guide-for-facebook-conversion-api-2026/)
- [Facebook Pixel Advanced Events 2026](https://adbid.me/blog/facebook-pixel-advanced-events-guide-2026)
- [facebook-nodejs-business-sdk — GitHub](https://github.com/facebook/facebook-nodejs-business-sdk)
- [EMQ Improvement Guide — Madgicx](https://madgicx.com/blog/event-match-quality)
- [Meta Ads Tracking Best Practices 2026](https://marketinglens.com/meta-ads/meta-ads-tracking-and-measurement-best-practices-2026/)
