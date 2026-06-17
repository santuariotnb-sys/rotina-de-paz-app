# Templates de e-mail Auth — Supabase Dashboard

> Colar em **Supabase Dashboard → Authentication → Emails → Templates**.
> **NUNCA** usar `supabase config push` — colar manualmente.
> Manter `{{ .ConfirmationURL }}` intacto (Supabase preenche).

## 1) Confirm signup

**Subject:** `Confirme seu acesso · Rotina de Paz`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
  <tr>
    <td align="center">
      <table width="100%" style="max-width:480px;background:#FAF9F6;border-radius:20px;padding:40px 32px;text-align:center;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C9A876;">Rotina de Paz</p>
          <h1 style="margin:0 0 16px;font-size:26px;color:#443A52;font-weight:600;">Seja bem-vinda 🕊️</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#6B6175;font-family:Helvetica,Arial,sans-serif;">
            Falta só um passo pra entrar no <strong>Círculo da Paz</strong>.
            Toque no botão abaixo pra confirmar seu e-mail e começar sua jornada.
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#E8C9A0,#C9A876);color:#2C1F0B;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;">
            Confirmar meu acesso
          </a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
            Se o botão não funcionar, copie e cole este link no navegador:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#C9A876;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:20px 0 0;font-size:12px;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
            Não foi você? Pode ignorar este e-mail com tranquilidade.
          </p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#B3AAB8;font-family:Helvetica,Arial,sans-serif;">Rotina de Paz · rotinadepaz.com.br</p>
    </td>
  </tr>
</table>
```

## 2) Reset Password

**Subject:** `Criar uma nova senha · Rotina de Paz`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
  <tr>
    <td align="center">
      <table width="100%" style="max-width:480px;background:#FAF9F6;border-radius:20px;padding:40px 32px;text-align:center;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C9A876;">Rotina de Paz</p>
          <h1 style="margin:0 0 16px;font-size:26px;color:#443A52;font-weight:600;">Criar nova senha</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#6B6175;font-family:Helvetica,Arial,sans-serif;">
            Você pediu pra criar uma nova senha de acesso.
            Toque no botão abaixo — leva menos de um minuto.
          </p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#E8C9A0,#C9A876);color:#2C1F0B;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;">
            Criar minha nova senha
          </a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
            Se o botão não funcionar, copie e cole este link no navegador:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#C9A876;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:20px 0 0;font-size:12px;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
            Não pediu isso? Ignore este e-mail — sua senha atual continua a mesma.
          </p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#B3AAB8;font-family:Helvetica,Arial,sans-serif;">Rotina de Paz · rotinadepaz.com.br</p>
    </td>
  </tr>
</table>
```

## Checklist pré-produção

- [ ] Plugar SMTP próprio (Resend: `smtp.resend.com:465`, user `resend`, senha = `RESEND_API_KEY`, sender `ola@rotinadepaz.com.br`)
- [ ] Colar os 2 templates acima no Dashboard
- [ ] Adicionar URL de produção na lista de Redirect URLs (Auth → URL Configuration)
- [ ] Testar envio real (reset + confirm) com o SMTP configurado
