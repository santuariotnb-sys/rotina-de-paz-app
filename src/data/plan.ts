// =====================================================================
// PLANO DE 7 DIAS — App da Aluna (Parte 2)
// 14 sessões (manhã + noite) por arquétipo
// =====================================================================
import type { Archetype } from "./quiz";

export type PlanSession = {
  /** "morning" | "night" */
  time: "morning" | "night";
  /** Título curto da sessão */
  title: string;
  /** Duração estimada em minutos */
  duration: number;
  /** Foco da prática (1 frase) */
  focus: string;
  /** Versículo-âncora */
  verse: { ref: string; text: string };
  /** Passos da prática guiada */
  steps: string[];
  /** Frase de selamento ao final */
  seal: string;
};

export type PlanDay = {
  day: number;
  /** Tema do dia */
  theme: string;
  /** Subtítulo curto */
  subtitle: string;
  morning: PlanSession;
  night: PlanSession;
};

/** Estrutura comum dos 7 dias — o conteúdo muda por arquétipo. */
const DAY_THEMES: Array<{ theme: string; subtitle: string }> = [
  { theme: "Reconhecer o padrão", subtitle: "Hoje você só observa. Não conserta." },
  { theme: "Respirar e ancorar", subtitle: "O corpo precisa de um sinal novo." },
  { theme: "A verdade em voz alta", subtitle: "O que você fala, o corpo escuta." },
  { theme: "Soltar o que não é seu", subtitle: "Entregar não é abandonar." },
  { theme: "Reencontro com Deus", subtitle: "Sem performance. Só presença." },
  { theme: "Integração", subtitle: "O novo padrão começa a ficar." },
  { theme: "Selo da paz", subtitle: "Você não é mais a mesma." },
];

/** Conteúdo específico por arquétipo, dia a dia (manhã + noite). */
type ArchetypeContent = {
  morningFocus: string[];   // 7 itens (um por dia)
  morningVerse: Array<{ ref: string; text: string }>;
  morningSteps: string[][]; // 7 listas
  nightFocus: string[];
  nightVerse: Array<{ ref: string; text: string }>;
  nightSteps: string[][];
  seal: string;
};

const CONTENT: Record<Archetype, ArchetypeContent> = {
  vigilante: {
    seal: "O Guarda não dorme. Eu posso.",
    morningFocus: [
      "Perceber o ponto exato onde o corpo vigia.",
      "Ensinar o corpo a soltar antes do dia pedir.",
      "Dizer em voz alta: 'não é meu trabalho segurar tudo'.",
      "Entregar uma preocupação concreta antes das 9h.",
      "Orar sem checar nada por 5 minutos.",
      "Notar que o dia começou sem você antecipar.",
      "Selar a semana: a vigilância já não manda em mim.",
    ],
    morningVerse: [
      { ref: "Salmos 4:8", text: "Em paz me deito e logo pego no sono, pois só tu, Senhor, me fazes viver em segurança." },
      { ref: "Salmos 121:4", text: "Aquele que te guarda não dormirá nem cochilará." },
      { ref: "Isaías 26:3", text: "Tu guardarás em perfeita paz aquele cuja mente está firme em ti." },
      { ref: "1 Pedro 5:7", text: "Lancem sobre ele toda a sua ansiedade, porque ele tem cuidado de vocês." },
      { ref: "Salmos 46:10", text: "Aquietem-se e saibam que eu sou Deus." },
      { ref: "Filipenses 4:6-7", text: "Não andem ansiosos por coisa alguma… e a paz de Deus guardará o coração e a mente." },
      { ref: "Salmos 23:1", text: "O Senhor é o meu pastor; nada me faltará." },
    ],
    morningSteps: [
      ["Sente e feche os olhos por 1 minuto.", "Pergunte: onde meu corpo está vigiando agora?", "Coloque a mão nesse lugar (peito, ombro, mandíbula).", "Respire 4 segundos inspirando, 6 expirando — 5x."],
      ["Inspire por 4s, segure 4s, expire por 6s — 8 ciclos.", "Diga: 'Eu não preciso segurar o mundo para que ele continue.'", "Leia o versículo em voz alta, devagar."],
      ["De pé, fale alto: 'Hoje eu não sou o guarda.'", "Repita 3 vezes, mais alto a cada vez.", "Leia o versículo como quem recebe ordem."],
      ["Escreva 1 preocupação concreta num papel.", "Dobre o papel. Coloque longe da vista.", "Diga: 'Entreguei. Hoje é dia Dele.'"],
      ["Sente sem celular por 5 minutos.", "Não peça nada. Só fique.", "Termine com: 'Aqui estou. Faça o que quiser.'"],
      ["Caminhe 5 min em silêncio.", "A cada passo, expire mais longo que inspirou.", "Note: o dia começou sem você antecipar."],
      ["Releia o versículo da 1ª manhã.", "Compare: como você estava no Dia 1 vs hoje?", "Escreva uma frase só: 'Eu posso descansar.'"],
    ],
    nightFocus: [
      "Mapear onde o corpo ainda está em alerta.",
      "Desativar o guarda interno antes de deitar.",
      "Soltar 3 coisas que você carregou hoje.",
      "Confiar a noite a Quem não dorme.",
      "Dormir sem revisar o dia.",
      "Reconhecer o sono mais profundo.",
      "Selar: 'minha noite pertence a Deus'.",
    ],
    nightVerse: [
      { ref: "Provérbios 3:24", text: "Quando te deitares, não terás medo; sim, tu te deitarás, e o teu sono será suave." },
      { ref: "Salmos 127:2", text: "Aos seus amados ele concede o sono." },
      { ref: "Mateus 11:28", text: "Venham a mim todos os que estão cansados… e eu lhes darei descanso." },
      { ref: "Salmos 3:5", text: "Eu me deito e durmo; acordo, porque o Senhor me sustenta." },
      { ref: "Salmos 91:1", text: "Aquele que habita no abrigo do Altíssimo descansará à sombra do Todo-poderoso." },
      { ref: "Jeremias 31:25", text: "Restaurarei o exausto e saciarei o abatido." },
      { ref: "João 14:27", text: "Deixo-lhes a paz, a minha paz lhes dou." },
    ],
    nightSteps: [
      ["Deite-se. Escaneie o corpo de cima a baixo.", "Marque mentalmente cada tensão.", "Expire por 8s em cada uma."],
      ["Mão direita no peito. Inspire 4s, expire 8s — 10x.", "Diga: 'O guarda pode descansar.'", "Repita até soltar os ombros."],
      ["Liste 3 coisas que carregou hoje.", "Diga: 'Não levo nenhuma pra cama.'", "Apague a luz logo após."],
      ["Leia o versículo deitada.", "Confie a noite em voz baixa: 'Tu velas. Eu durmo.'"],
      ["Sem celular nos últimos 30 min.", "Respiração 4-6 até cair no sono.", "Não tente revisar o dia."],
      ["Se acordar na madrugada: respire 4-8, não pegue o celular.", "Diga: 'Estou guardada.'", "Volte ao sono sem analisar."],
      ["Releia todos os 7 versículos da noite.", "Escolha o que mais te marcou.", "Durma com ele na boca."],
    ],
  },

  sobrecarga: {
    seal: "Descansar é fé. Eu obedeço.",
    morningFocus: [
      "Notar o peso antes de aceitar mais um.",
      "Dizer um 'não' pequeno hoje.",
      "Soltar o ombro 3 vezes ao longo da manhã.",
      "Pedir ajuda para uma coisa concreta.",
      "Servir sem se esquecer.",
      "Sentar 15 min sem fazer nada.",
      "Selar: 'eu também sou cuidada'.",
    ],
    morningVerse: [
      { ref: "Mateus 11:28-30", text: "Venham a mim… meu jugo é suave e meu fardo é leve." },
      { ref: "Êxodo 18:18", text: "Você ficará exausto, você e este povo… você não pode fazer isto sozinho." },
      { ref: "Salmos 55:22", text: "Entregue suas preocupações ao Senhor, e ele o susterá." },
      { ref: "Eclesiastes 4:9", text: "É melhor ter companhia do que estar sozinho." },
      { ref: "Gálatas 6:2", text: "Levem os fardos uns dos outros." },
      { ref: "Marcos 6:31", text: "Venham comigo a um lugar deserto, para descansarem um pouco." },
      { ref: "Isaías 40:31", text: "Os que esperam no Senhor renovam as suas forças." },
    ],
    morningSteps: [
      ["Antes de levantar, pergunte: 'o que pesa em mim agora?'", "Nomeie. Não conserte.", "Respire 4-6 por 2 min."],
      ["Escolha 1 pedido que você vai recusar hoje.", "Ensaie a frase em voz alta.", "Leia o versículo antes de sair de casa."],
      ["A cada 2 horas, solte os ombros.", "Inspire 4s, expire 6s.", "Diga: 'não é minha responsabilidade segurar tudo'."],
      ["Escreva 1 tarefa concreta que você vai delegar/pedir ajuda.", "Faça o pedido até as 12h.", "Aceite a resposta — qualquer que seja."],
      ["Sirva uma pessoa hoje — incluindo você.", "O que VOCÊ precisa? Faça por você primeiro.", "Sem culpa."],
      ["Marque 15 min no relógio.", "Sente. Não pegue celular, livro, nada.", "Apenas exista."],
      ["Olhe a semana: o que mudou no seu corpo?", "Escreva: 'eu também sou cuidada por…'.", "Complete com 3 nomes — incluindo Deus."],
    ],
    nightFocus: [
      "Marcar o fim do expediente do cuidar.",
      "Encerrar o dia sem revisar pendências.",
      "Soltar a tensão do ombro e mandíbula.",
      "Dormir sem se sentir culpada de dormir.",
      "Receber descanso como presente.",
      "Notar o ritmo do corpo voltando.",
      "Selar a semana com uma oração curta.",
    ],
    nightVerse: [
      { ref: "Salmos 116:7", text: "Volte ao seu descanso, ó minha alma, pois o Senhor tem sido bom para você." },
      { ref: "Salmos 62:1", text: "Somente em Deus a minha alma descansa." },
      { ref: "Êxodo 33:14", text: "A minha presença irá com você, e eu lhe darei descanso." },
      { ref: "Salmos 4:8", text: "Em paz me deito e logo pego no sono." },
      { ref: "Hebreus 4:9-10", text: "Resta, portanto, um descanso sabático para o povo de Deus." },
      { ref: "Mateus 11:29", text: "Aprendam de mim… e encontrarão descanso para suas almas." },
      { ref: "Salmos 23:2", text: "Em verdes pastagens me faz repousar." },
    ],
    nightSteps: [
      ["Anote o que ficou pendente. Feche o caderno.", "Diga: 'o expediente acabou.'", "Não reabra."],
      ["Banho morno por 5 min — sem pensar em nada.", "Sinta a água nos ombros.", "Leia o versículo antes de deitar."],
      ["Deitada, contraia ombros por 5s e solte.", "Repita 5x. Depois mandíbula. Depois mãos.", "Termine respirando 4-8."],
      ["Diga em voz alta: 'eu mereço dormir.'", "Repita 3x até o corpo acreditar.", "Apague a luz."],
      ["Antes de dormir, agradeça 3 coisas pequenas.", "Não peça nada. Só agradeça.", "Durma com gratidão na boca."],
      ["Note: você acordou menos cansada essa semana?", "Escreva 1 linha sobre isso.", "Durma cedo hoje."],
      ["Oração curta: 'Senhor, eu parei. Obrigada.'", "Releia o versículo da 1ª noite.", "Durma como quem obedece."],
    ],
  },

  culposa: {
    seal: "Já não há condenação. Eu posso descansar.",
    morningFocus: [
      "Perceber a voz que te acusa logo cedo.",
      "Trocar a voz acusadora pela voz da graça.",
      "Orar sem revisar se 'orou direito'.",
      "Receber perdão antes de pedir.",
      "Notar quando a culpa volta — e não obedecer.",
      "Servir por amor, não por dívida.",
      "Selar: 'eu sou amada antes de fazer nada'.",
    ],
    morningVerse: [
      { ref: "Romanos 8:1", text: "Portanto, agora já não há condenação para os que estão em Cristo Jesus." },
      { ref: "Salmos 103:12", text: "Como o Oriente está longe do Ocidente, assim ele afasta de nós as nossas transgressões." },
      { ref: "1 João 1:9", text: "Se confessarmos os nossos pecados, ele é fiel e justo para nos perdoar." },
      { ref: "Isaías 1:18", text: "Ainda que os seus pecados sejam vermelhos como escarlate, eles se tornarão brancos como a neve." },
      { ref: "Salmos 51:10", text: "Cria em mim um coração puro, ó Deus, e renova dentro de mim um espírito estável." },
      { ref: "Efésios 2:8-9", text: "Pela graça vocês são salvos, mediante a fé… não por obras." },
      { ref: "Sofonias 3:17", text: "O Senhor… se regozijará em você com cânticos." },
    ],
    morningSteps: [
      ["Ao acordar, escute: qual a primeira voz que fala em você?", "Anote a frase exata.", "Diga: 'isso não vem do Pai.'"],
      ["Leia Romanos 8:1 em voz alta.", "Substitua 'os que' por 'eu'.", "Repita 3x: 'já não há condenação para mim.'"],
      ["Ore por 3 min sem julgar a oração.", "Se a mente desviar, volte sem culpa.", "Termine com: 'foi suficiente.'"],
      ["Antes de pedir qualquer coisa, receba.", "Diga: 'eu já fui perdoada.'", "Só depois ore pelos outros."],
      ["Quando a culpa aparecer, pergunte: 'isso é convicção ou condenação?'", "Convicção é específica e leve. Condenação é vaga e pesada.", "Se for condenação, não obedeça."],
      ["Faça 1 coisa pelos outros — por amor, não por dívida.", "Se sentir culpa, pare. Reposicione.", "Recomece pelo amor."],
      ["Releia a 1ª manhã.", "Escreva: 'eu sou amada antes de fazer nada.'", "Cole onde você possa ver."],
    ],
    nightFocus: [
      "Soltar a régua do dia.",
      "Receber graça antes de dormir.",
      "Não revisar erros antes do sono.",
      "Dormir como filha, não como devedora.",
      "Aceitar que descansar não é abandonar Deus.",
      "Sentir o sono como presente.",
      "Selar a semana sem culpa.",
    ],
    nightVerse: [
      { ref: "Salmos 130:3-4", text: "Se tu, Senhor, registrasses os pecados, quem escaparia? Mas contigo está o perdão." },
      { ref: "Lamentações 3:22-23", text: "As misericórdias do Senhor… se renovam cada manhã." },
      { ref: "2 Coríntios 12:9", text: "A minha graça é suficiente para você." },
      { ref: "Romanos 5:8", text: "Cristo morreu por nós quando ainda éramos pecadores." },
      { ref: "Salmos 32:1", text: "Como é feliz aquele que tem suas transgressões perdoadas." },
      { ref: "Hebreus 10:17", text: "Dos seus pecados… nunca mais me lembrarei." },
      { ref: "Salmos 139:14", text: "Eu te louvo porque me fizeste de modo especial e admirável." },
    ],
    nightSteps: [
      ["Liste 3 coisas que você se cobrou hoje.", "Diga: 'eu solto a régua.'", "Rasgue ou apague."],
      ["Mão no coração. Inspire graça. Expire culpa.", "Faça por 3 minutos.", "Leia o versículo."],
      ["Se for revisar erros: pare.", "Diga: 'amanhã. Não agora.'", "Respire 4-8 até dormir."],
      ["Antes de deitar: 'eu sou filha, não devedora.'", "Repita até o peito relaxar.", "Apague a luz."],
      ["Ore curtíssimo: 'Pai, descansar é confiar.'", "Não acrescente nada.", "Durma."],
      ["Note: você se cobrou menos essa semana?", "Escreva 1 frase de gratidão por si mesma.", "Durma com ela."],
      ["Releia Romanos 8:1 deitada.", "Diga: 'eu encerrei a semana sem dívida.'", "Durma como filha amada."],
    ],
  },

  antecipatoria: {
    seal: "O futuro pertence a Deus. Eu vivo hoje.",
    morningFocus: [
      "Notar quando a mente correu o dia antes de você.",
      "Voltar para o presente pela respiração.",
      "Trocar o 'e se' por 'mesmo que'.",
      "Confiar 1 'futuro' específico a Deus.",
      "Viver uma manhã sem rodar cenários.",
      "Notar: o que você temeu, não veio.",
      "Selar: 'amanhã é território de Deus'.",
    ],
    morningVerse: [
      { ref: "Jeremias 29:11", text: "Eu sei os planos que tenho para vocês — planos de paz, e não de mal." },
      { ref: "Mateus 6:34", text: "Portanto, não se preocupem com o amanhã, pois o amanhã se preocupará consigo mesmo." },
      { ref: "Isaías 41:10", text: "Não tema, pois estou com você; não fique assustado, pois eu sou o seu Deus." },
      { ref: "Salmos 56:3", text: "Quando estou com medo, em ti confio." },
      { ref: "2 Timóteo 1:7", text: "Pois Deus não nos deu espírito de covardia, mas de poder, de amor e de equilíbrio." },
      { ref: "Provérbios 3:5-6", text: "Confie no Senhor de todo o coração e não se apoie no seu próprio entendimento." },
      { ref: "Salmos 31:15", text: "Os meus dias estão nas tuas mãos." },
    ],
    morningSteps: [
      ["Ao acordar, perceba: sua mente já correu o dia?", "Volte ao corpo: 5 coisas que você vê, 4 que ouve, 3 que sente.", "Respire 4-6 por 1 min."],
      ["Inspire 4s, expire 6s — 10 ciclos.", "A cada expiração: 'eu estou aqui'.", "Leia o versículo."],
      ["Pegue 1 'e se' que está te corroendo.", "Reescreva como 'mesmo que… Deus está'.", "Repita em voz alta 3x."],
      ["Escreva 1 futuro específico que te apavora.", "Coloque a mão sobre o papel.", "Ore: 'Senhor, este aqui é Teu.'"],
      ["Faça a 1ª hora do dia sem prever nada.", "Foco em 1 coisa de cada vez.", "Se a mente fugir, volte sem brigar."],
      ["Liste 5 coisas que você temeu nas últimas semanas.", "Quantas aconteceram?", "Sublinhe a verdade que isso revela."],
      ["Releia Jeremias 29:11.", "Escreva: 'amanhã é território de Deus.'", "Comece o dia com essa frase."],
    ],
    nightFocus: [
      "Mapear o cenário catastrófico do dia.",
      "Desligar a projeção antes do sono.",
      "Entregar o amanhã antes de deitar.",
      "Dormir sem ensaiar conversas.",
      "Receber a noite como descanso, não trincheira.",
      "Notar o sono mais leve.",
      "Selar a semana sem ensaiar o amanhã.",
    ],
    nightVerse: [
      { ref: "Salmos 4:8", text: "Em paz me deito e logo pego no sono." },
      { ref: "Filipenses 4:6-7", text: "Não andem ansiosos por coisa alguma… e a paz de Deus guardará o coração." },
      { ref: "Salmos 91:5", text: "Você não terá medo do pavor da noite, nem da flecha que voa de dia." },
      { ref: "1 Pedro 5:7", text: "Lancem sobre ele toda a sua ansiedade." },
      { ref: "João 14:1", text: "Não se perturbe o coração de vocês. Creiam em Deus, creiam também em mim." },
      { ref: "Salmos 27:1", text: "O Senhor é a minha luz e a minha salvação; de quem terei medo?" },
      { ref: "Isaías 26:3", text: "Tu guardarás em perfeita paz aquele cuja mente está firme em ti." },
    ],
    nightSteps: [
      ["Anote o pior cenário que te assombrou hoje.", "Pergunte: aconteceu?", "Risque o papel."],
      ["Deitada, inspire 4s, segure 4s, expire 8s — 10x.", "Diga: 'o amanhã não cabe aqui agora.'", "Leia o versículo."],
      ["Antes de dormir, entregue uma preocupação concreta.", "Diga: 'Tu cuidas enquanto eu durmo.'", "Solte os ombros."],
      ["Se começar a ensaiar uma conversa: pare.", "Diga: 'amanhã é amanhã.'", "Respire 4-8 até dormir."],
      ["Imagine a noite como abrigo, não como trincheira.", "Mão no peito, respiração lenta.", "Receba."],
      ["Note: o sono está mais leve essa semana?", "Sem checar, durma agradecendo.", "Sem ensaios."],
      ["Releia Mateus 6:34.", "Diga: 'a semana acabou. O amanhã pertence a Deus.'", "Durma em paz."],
    ],
  },
};

export function getPlan(archetype: Archetype): PlanDay[] {
  const c = CONTENT[archetype];
  return DAY_THEMES.map((d, i) => ({
    day: i + 1,
    theme: d.theme,
    subtitle: d.subtitle,
    morning: {
      time: "morning",
      title: `Dia ${i + 1} · Manhã`,
      duration: 7,
      focus: c.morningFocus[i],
      verse: c.morningVerse[i],
      steps: c.morningSteps[i],
      seal: c.seal,
    },
    night: {
      time: "night",
      title: `Dia ${i + 1} · Noite`,
      duration: 7,
      focus: c.nightFocus[i],
      verse: c.nightVerse[i],
      steps: c.nightSteps[i],
      seal: c.seal,
    },
  }));
}