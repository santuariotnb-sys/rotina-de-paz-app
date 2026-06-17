# Templates de e-mail Auth — Supabase Dashboard (PT, didático)

> **Onde colar:** Supabase Dashboard → projeto `cemjibbauvvyfaxilrvm` → **Authentication → Emails → Templates**.
> Cada template tem um campo **Subject (assunto)** e um campo **Message (corpo HTML)**. Cole o assunto no primeiro, o HTML no segundo. **Salvar.**
> **🔴 NUNCA** `supabase config push` — colar manualmente no Dashboard.
> **Manter `{{ .ConfirmationURL }}` intacto** (o Supabase troca pelo link real). Não apagar essa variável.
> **Pré-requisito pro email NÃO vir de `supabase.io` em inglês:** ligar o SMTP do Resend (ver fim do arquivo). Sem isso, o template PT funciona mas o remetente continua `noreply@mail.app.supabase.io` + rate-limit baixo.

---

## 1) Confirm signup  (confirmação de e-mail)

**Subject:**
```
Confirme seu e-mail para entrar · Rotina de Paz
```

**Message (HTML):**
```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
  <tr><td align="center">
    <table width="100%" style="max-width:480px;background:#FAF9F6;border-radius:20px;padding:40px 32px;text-align:center;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C9A876;">Rotina de Paz</p>
        <h1 style="margin:0 0 16px;font-size:26px;color:#443A52;font-weight:600;">Falta só 1 passo 🕊️</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#5B5266;font-family:Helvetica,Arial,sans-serif;">
          Que alegria ter você aqui! Você criou sua conta no <strong>Círculo da Paz</strong>.<br><br>
          Para entrar, só falta confirmar que este e-mail é seu. <strong>Toque no botão dourado abaixo</strong> — leva 10 segundos e é totalmente seguro.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#E8C9A0,#C9A876);color:#2C1F0B;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:16px;padding:16px 36px;border-radius:999px;">
          ✓ Confirmar e entrar
        </a>
        <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#7A7186;font-family:Helvetica,Arial,sans-serif;">
          Assim que tocar, sua conta estará pronta e você já pode começar sua jornada de paz.
        </p>
        <hr style="border:none;border-top:1px solid #EDE6DC;margin:28px 0;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
          O botão não funcionou? Copie e cole este endereço no seu navegador:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#C9A876;word-break:break-all;">{{ .ConfirmationURL }}</a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
          Não foi você que criou esta conta? Pode ignorar este e-mail com tranquilidade.
        </p>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#B3AAB8;font-family:Helvetica,Arial,sans-serif;">Rotina de Paz · rotinadepaz.com.br · Precisa de ajuda? Responda este e-mail.</p>
  </td></tr>
</table>
```

---

## 2) Reset Password  (criar nova senha)

**Subject:**
```
Criar uma nova senha · Rotina de Paz
```

**Message (HTML):**
```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
  <tr><td align="center">
    <table width="100%" style="max-width:480px;background:#FAF9F6;border-radius:20px;padding:40px 32px;text-align:center;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C9A876;">Rotina de Paz</p>
        <h1 style="margin:0 0 16px;font-size:26px;color:#443A52;font-weight:600;">Vamos criar sua nova senha 🔑</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#5B5266;font-family:Helvetica,Arial,sans-serif;">
          Você pediu para criar uma nova senha de acesso ao <strong>Círculo da Paz</strong>.<br><br>
          É simples: <strong>toque no botão dourado abaixo</strong> e escolha a senha que quiser. Leva menos de 1 minuto.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#E8C9A0,#C9A876);color:#2C1F0B;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:16px;padding:16px 36px;border-radius:999px;">
          🔑 Criar minha nova senha
        </a>
        <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#7A7186;font-family:Helvetica,Arial,sans-serif;">
          Depois de criar, é só entrar com a senha nova. Pronto, simples assim.
        </p>
        <hr style="border:none;border-top:1px solid #EDE6DC;margin:28px 0;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
          O botão não funcionou? Copie e cole este endereço no seu navegador:<br>
          <a href="{{ .ConfirmationURL }}" style="color:#C9A876;word-break:break-all;">{{ .ConfirmationURL }}</a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#9A8FA8;font-family:Helvetica,Arial,sans-serif;">
          Não pediu isso? Ignore este e-mail — sua senha atual continua a mesma e sua conta está segura.
        </p>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#B3AAB8;font-family:Helvetica,Arial,sans-serif;">Rotina de Paz · rotinadepaz.com.br · Precisa de ajuda? Responda este e-mail.</p>
  </td></tr>
</table>
```

---

## Checklist no Dashboard (passo a passo)

1. **Authentication → Emails → Templates** → aba **"Confirm signup"** → colar o Subject + o HTML acima → **Save**.
2. Mesma tela → aba **"Reset Password"** (ou "Recovery") → colar o Subject + HTML → **Save**.
3. **Trocar o remetente (mata o `supabase.io` em inglês + rate-limit):** Authentication → **SMTP Settings** → **Enable Custom SMTP**:
   - Host: `smtp.resend.com` · Port: `465` · User: `resend` · Password: a `RESEND_API_KEY`
   - Sender email: `noreply@rotinadepaz.com.br` (ou `ola@`) · Sender name: `Rotina de Paz`
4. **Auth → URL Configuration** (CRÍTICO — é aqui que o link do email quebra se errado):
   - **Site URL:** `https://rotina-de-paz-app.vercel.app`
   - **Redirect URLs** → adicionar: `https://rotina-de-paz-app.vercel.app/**` (o `/**` cobre `/app` e `/reset-password`, que é o que o código usa: `login.tsx:128,192`).
   - *(Se um dia migrar pra domínio próprio do app, adicionar a nova URL aqui também.)*
5. **Testar (real, ponta a ponta):**
   - **Confirmação:** criar conta com e-mail de teste → tela "📧 Quase lá!" → o email chega **em PT, da Rotina de Paz** (NÃO "powered by Supabase") → clicar "Confirmar e entrar" → cai logado no `/app`.
   - **Reset:** "Esqueci a senha" com e-mail existente → email PT/marca → "Criar minha nova senha" → cai em `/reset-password` → define senha (2 campos) → entra com a nova.
   - **Spam:** conferir que caiu na caixa de entrada (com Resend + domínio verificado, deve ir pra inbox).

> ⚠️ Sem o passo 3 (SMTP Resend), os passos 1-2 deixam o **conteúdo** em PT, mas o email ainda **sai de `noreply@mail.app.supabase.io`** com rate-limit baixo. Pra ficar profissional (remetente da marca + entrega confiável), o passo 3 é essencial.
