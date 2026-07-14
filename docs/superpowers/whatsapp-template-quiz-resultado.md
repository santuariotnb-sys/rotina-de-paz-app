# Template WhatsApp: quiz_resultado

Cole isto no **WhatsApp Manager -> Modelos de mensagem -> Criar modelo**.
As variaveis `{{1}}` e `{{2}}` sao preenchidas em runtime pelo Claude
(`src/lib/whatsapp/whatsapp-copy.server.ts`).

## Configuracao

- **Nome:** `quiz_resultado`
- **Categoria:** Utility (entrega o resultado que a pessoa pediu; aprova mais facil
  e e mais barato que Marketing). A Meta pode reclassificar pra Marketing se julgar
  promocional — ambos funcionam, so muda o preco por conversa.
- **Idioma:** Portugues (BR) -> `pt_BR`

## Corpo (Body)

```
Oi {{1}}, tudo bem? 🙏

Seu resultado da Rotina de Paz ficou pronto. {{2}}

Toque no botao abaixo para ver o seu plano completo.
```

## Valores de exemplo (exigidos na submissao)

- `{{1}}` = `Ana`
- `{{2}}` = `Voce nao esta sozinha — Deus quer devolver a sua paz.`

## Botao (recomendado, aumenta conversao)

- Tipo: **Visitar site** (URL estatica)
- Texto do botao: `Ver meu resultado`
- URL: a pagina de resultado/oferta (ex.: `https://rotinadepaz.com.br/sacra/...`)

## Regras da Meta que este template ja respeita

- Nao comeca nem termina com variavel. OK
- Variaveis nao ficam coladas (sempre com texto entre elas). OK
- Sem CAPS excessivo, sem conteudo enganoso. OK

## Mapeamento com o codigo

| Variavel | Schema (`whatsapp-copy.server.ts`) | Conteudo |
|---|---|---|
| `{{1}}` | `nome` | so o primeiro nome da lead |
| `{{2}}` | `frase_arquetipo` | frase-eco personalizada (1 linha, tom NeuroFe) |

> Ajuste no plano: `{{1}}` passa a ser **so o nome** (nao "saudacao"). O texto fixo
> "Oi ... tudo bem?" ja vem no template. O Claude gera so o nome limpo + a frase.

## Depois de submeter

- Status fica "Em analise" (minutos a ~24h). So depois de **Aprovado** o envio funciona.
- Quando aprovar, confirme o **nome exato** e o **idioma** batem com
  `WHATSAPP_TEMPLATE_RESULT=quiz_resultado` e `WHATSAPP_LANG=pt_BR`.
