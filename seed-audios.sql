-- =====================================================================
-- SEED DOS 14 ÁUDIOS — Rotina de Paz (Volume 1 = manhã/despertar · Volume 2 = noite/aquietar)
-- SEGURO E IDEMPOTENTE: pode rodar várias vezes. Não cria tabela, não deleta nada.
-- Atualiza o que já existe (mesmo day+kind) e insere o que falta.
-- A tabela audio_tracks JÁ EXISTE — este script só popula.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  pid uuid;
  n_before int;
  n_after int;
BEGIN
  -- 1) Localiza o produto-método (não hardcoded)
  SELECT id INTO pid
  FROM products
  WHERE kind = 'method' AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'Nenhum produto kind=method active encontrado. Abortado (nada foi alterado).';
  END IF;

  SELECT count(*) INTO n_before FROM audio_tracks WHERE product_id = pid;
  RAISE NOTICE 'Produto-método: % | audio_tracks antes: %', pid, n_before;

  -- 2) Tabela temporária com os 14 (some sozinha no COMMIT)
  CREATE TEMP TABLE _seed (
    day int, kind text, title text, subtitle text, audio_url text, dur int, ord int
  ) ON COMMIT DROP;

  INSERT INTO _seed (day, kind, title, subtitle, audio_url, dur, ord) VALUES
  -- ☀️ VOLUME 1 — DESPERTAR (manhã)
  (1,'despertar','O Despertar da Coragem',        'Atravessar o medo com Deus na frente', 'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-1.mp3', 657, 1),
  (2,'despertar','O Perdão que Liberta',          'Trocar a régua pela graça',            'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-2.mp3', 562, 2),
  (3,'despertar','A Blindagem da Identidade',     'Você não é cópia de ninguém',          'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-3.mp3', 536, 3),
  (4,'despertar','Reconciliação com a História',  'Abrir as mãos pro que passou',         'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-4.mp3', 529, 4),
  (5,'despertar','O Descanso de Quem Carrega',    'Você também merece colo',              'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-5.mp3', 528, 5),
  (6,'despertar','O Descanso na Soberania',       'O Guarda não dorme',                   'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-6.mp3', 500, 6),
  (7,'despertar','A Fé Reacendida',               'A graça se renova a cada manhã',       'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/despertar/dia-7.mp3', 552, 7),
  -- 🌙 VOLUME 2 — AQUIETAR (noite)
  (1,'aquietar','O Fim do Alarme de Medo',        'Entregar o amanhã e dormir',           'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-1.mp3',  520, 1),
  (2,'aquietar','O Perdão que Liberta o Sono',    'Lançar o peso no mar',                 'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-2.mp3',  461, 2),
  (3,'aquietar','O Descanso da Aprovação',        'Fechar o arquivo dos outros',          'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-3.mp3',  437, 3),
  (4,'aquietar','Silenciando o Passado',          'Guardar a gaveta da madrugada',        'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-4.mp3',  437, 4),
  (5,'aquietar','O Ritmo do Descanso',            'Dormir é presente, não recompensa',    'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-5.mp3',  464, 5),
  (6,'aquietar','O Poder da Entrega Total',       'Passar o plantão pra Quem não dorme',  'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-6.mp3',  471, 6),
  (7,'aquietar','A Selagem da Confiança',         'A paz que guarda você',                'https://cdnrotinadepaz.b-cdn.net/rotina-de-paz/aquietar/dia-7.mp3',  531, 7);

  -- 3) Atualiza os que já existem (mesmo produto + day + kind)
  UPDATE audio_tracks a
  SET title = s.title,
      subtitle = s.subtitle,
      audio_url = s.audio_url,
      duration_seconds = s.dur,
      sort_order = s.ord,
      updated_at = now()
  FROM _seed s
  WHERE a.product_id = pid AND a.day = s.day AND a.kind = s.kind;

  -- 4) Insere os que faltam
  INSERT INTO audio_tracks (product_id, day, kind, title, subtitle, audio_url, duration_seconds, sort_order, is_free_preview)
  SELECT pid, s.day, s.kind, s.title, s.subtitle, s.audio_url, s.dur, s.ord, false
  FROM _seed s
  WHERE NOT EXISTS (
    SELECT 1 FROM audio_tracks a
    WHERE a.product_id = pid AND a.day = s.day AND a.kind = s.kind
  );

  SELECT count(*) INTO n_after FROM audio_tracks WHERE product_id = pid;
  RAISE NOTICE 'audio_tracks depois: % (esperado >= 14)', n_after;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICAÇÃO (rode depois — read-only, confere o resultado)
-- =====================================================================
SELECT t.day, t.kind, t.title, t.duration_seconds, t.audio_url
FROM audio_tracks t
JOIN products p ON p.id = t.product_id
WHERE p.kind = 'method' AND p.status = 'active'
ORDER BY t.kind, t.day;
