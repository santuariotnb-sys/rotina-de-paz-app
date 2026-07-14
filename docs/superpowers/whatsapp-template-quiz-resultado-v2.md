# Template WhatsApp `quiz_resultado_v2` — header imagem + botão oferta

Substitui o `quiz_resultado` (só texto). Adiciona **imagem no topo** + **botão que abre a oferta**.
A frase por arquétipo continua vindo do código ([whatsapp-copy.server.ts](../../src/lib/whatsapp/whatsapp-copy.server.ts)).

## Como criar no WhatsApp Manager
Business Manager → WhatsApp Manager → **Modelos de mensagem** → **Criar modelo**.

| Campo | Valor |
|---|---|
| **Nome** | `quiz_resultado_v2` |
| **Categoria** | Marketing |
| **Idioma** | Português (BR) — `pt_BR` |

### Cabeçalho (Header)
- Tipo: **Mídia → Imagem**
- Suba uma imagem de amostra (a definitiva é enviada em cada disparo pelo código).
- Proporção recomendada: **1.91:1** (ex: 1200×628) ou quadrada 1:1.

### Corpo (Body) — cole exatamente
```
Oi, {{1}} 🌿

{{2}}

Eu preparei um plano simples, de poucos minutos por dia, pra te ajudar a voltar a sentir a presença de Deus na rotina. Toca no botão abaixo pra ver o seu.
```
- Exemplos de variável na aprovação: `{{1}}` = `Maria`, `{{2}}` = `O amanhã já tem dono. Hoje, Deus quer te dar a sua paz.`

### Rodapé (Footer) — opcional
```
Rotina de Paz
```

### Botões
- Tipo: **Chamada para ação → Visitar site**
- Texto do botão: `Ver meu plano`
- Tipo de URL: **Estática**
- URL: `https://pay.kirvano.com/0b6125dc-2775-401d-8abc-90676c29031c`
  (mesma da oferta principal — `VITE_KIRVANO_URL`)

> URL **estática** = não precisa de código no envio e aprova mais fácil. Se um dia quiser
> UTM por lead, muda pra dinâmica e a gente adiciona o component `button` no `sendTemplate`.

## Depois de APROVADO — 2 env vars no Vercel (rotina-de-paz-app)
| Var | Valor |
|---|---|
| `WHATSAPP_TEMPLATE_RESULT` | `quiz_resultado_v2` |
| `WHATSAPP_RESULT_IMAGE_URL` | link público da imagem do header (ex: `https://rotina-de-paz-app.vercel.app/wa/resultado.jpg`) |

- A imagem precisa ser **URL pública** (não exige login). Pode ser um arquivo em `public/` do app
  (fica em `https://rotina-de-paz-app.vercel.app/...`) ou no Storage do Supabase (bucket público).
- `WHATSAPP_RESULT_IMAGE_URL` **vazia/ausente** = envia sem imagem (fallback seguro, template só-texto).

## Imagem por arquétipo (evolução futura, opcional)
Hoje: **1 imagem fixa** pra todos (simples). Pra imagem diferente por arquétipo, trocar
`HEADER_IMAGE_URL` (constante única) por um mapa arquétipo→URL no dispatch e passar por lead.
