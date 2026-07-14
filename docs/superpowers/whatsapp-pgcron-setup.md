# Setup pg_cron (Supabase) — dispara o WhatsApp a cada minuto

Substitui o cron da Vercel (Hobby não permite cron sub-diário). O Supabase bate no
endpoint [`/api/cron/whatsapp-dispatch`](../../src/routes/api/cron/whatsapp-dispatch.ts)
1×/min; o endpoint pega a fila `whatsapp_sends` vencida (send_after ≤ agora) e envia.

## Pré-requisito: pegar o CRON_SECRET
Vercel → projeto `rotina-de-paz-app` → **Settings → Environment Variables** → copie o valor de **`CRON_SECRET`**.

## Passo 1 — habilitar extensões
Supabase Dashboard (projeto `cemjibbauvvyfaxilrvm`) → **Database → Extensions** → habilite:
- **`pg_cron`**
- **`pg_net`**

(ou rode no SQL Editor:)
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

## Passo 2 — agendar o job (SQL Editor)
Troque `COLE_O_CRON_SECRET_AQUI` pelo valor real e rode:
```sql
select cron.schedule(
  'whatsapp-dispatch',
  '* * * * *',
  $$
  select net.http_get(
    url     := 'https://rotina-de-paz-app.vercel.app/api/cron/whatsapp-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer COLE_O_CRON_SECRET_AQUI')
  );
  $$
);
```

## Verificar
```sql
-- job agendado?
select jobid, schedule, jobname, active from cron.job where jobname = 'whatsapp-dispatch';

-- últimas execuções (status 'succeeded' = bateu no endpoint)
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'whatsapp-dispatch')
order by start_time desc limit 5;
```

## Gerenciar
```sql
-- pausar
select cron.unschedule('whatsapp-dispatch');
-- trocar o secret: unschedule + schedule de novo com o novo Bearer
```

## Notas
- O `net.http_get` é **assíncrono**: `succeeded` no `job_run_details` = a chamada foi
  disparada, não que o WhatsApp entregou. A entrega real vê-se em `whatsapp_sends.status`.
- O `CRON_SECRET` fica visível em `cron.job.command` (só `postgres`/`service_role` leem).
  Endurecimento opcional: guardar no **Supabase Vault** e ler via `vault.decrypted_secrets`.
- 1×/min = 1440 invocações/dia da function na Vercel — dentro do limite Hobby.
