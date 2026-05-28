// =====================================================================
// CONTEÚDO DO QUIZ — Rotina de Paz (conteúdo oficial)
// =====================================================================

export type Archetype = "vigilante" | "sobrecarga" | "culposa" | "antecipatoria";

export type QuizOption = {
  value: string;
  label: string;
  scores?: Partial<Record<Archetype, number>>;
  risk?: boolean;
};

export type QuizQuestion = {
  key: string;
  prompt: string;
  options: QuizOption[];
  meta?: "situation" | "desire";
  /** Texto opcional dito pela guia ANTES da pergunta. */
  transition?: string;
  /** Se presente, sobrescreve a transição com base em uma resposta anterior. */
  transitionFrom?: { questionKey: string; map: Record<string, string> };
};

export const QUESTIONS: QuizQuestion[] = [
  {
    key: "situacao",
    meta: "situation",
    transition:
      "Para que o diagnóstico seja preciso para a sua vida, preciso entender o seu contexto primeiro.",
    prompt: "Qual situação descreve melhor a sua vida hoje?",
    options: [
      { value: "casada-filhos-pequenos", label: "Sou casada e tenho filhos pequenos (0-12 anos)" },
      { value: "casada-filhos-grandes", label: "Sou casada e tenho filhos grandes (adolescentes/adultos)" },
      { value: "casada-sem-filhos", label: "Sou casada, sem filhos (ou tentando)" },
      { value: "mae-solo", label: "Sou mãe solo — sustento minha casa sozinha" },
      { value: "solteira", label: "Sou solteira, sem filhos" },
    ],
  },
  {
    key: "risco",
    prompt: "Nas últimas 2 semanas, o que melhor descreve como você tem se sentido?",
    transitionFrom: {
      questionKey: "situacao",
      map: {
        "casada-filhos-pequenos":
          "Quem cuida de filho pequeno raramente tem tempo pra escutar a si mesma. Você reservou esses 3 minutos. Use eles com honestidade.",
        "casada-filhos-grandes":
          "Mãe de filho grande raramente reclama. A gente aprende que reclamar é fraqueza. Aqui não tem ninguém pra te julgar.",
        "casada-sem-filhos":
          "Existe um tipo de ansiedade que aparece quando por fora 'está tudo certo'. Justamente por isso, ninguém suspeita.",
        "mae-solo":
          "Sustentar uma casa sozinha já é peso suficiente. Algumas perguntas vão ser difíceis. Mas você é a única que pode responder por você.",
        solteira:
          "Ansiedade não tem cara nem idade. Mulher solteira sofre em silêncio porque ninguém pergunta. Aqui alguém está perguntando.",
      },
    },
    options: [
      { value: "funcionando", label: "Cansada, ansiosa, mas funcionando" },
      { value: "dificil", label: "Tenho tido dias muito difíceis, mas consigo continuar" },
      { value: "sombrios", label: "Pensamentos sombrios têm aparecido com frequência", risk: true },
      { value: "crise", label: "Estou em crise. Não estou bem.", risk: true },
    ],
  },
  {
    key: "sintoma",
    transition:
      "Obrigada por ser honesta. Vou seguir. Agora vamos olhar para o corpo — porque ansiedade não mora só na cabeça.",
    prompt: "Qual desses sintomas físicos você mais reconhece em você?",
    options: [
      { value: "madrugada", label: "Acordo entre 3h e 5h da manhã e não consigo voltar a dormir", scores: { vigilante: 3 } },
      { value: "tensao", label: "Sinto cansaço crônico, tensão em ombros/pescoço/mandíbula", scores: { sobrecarga: 3 } },
      { value: "estomago", label: "Estômago travado, intestino reagindo, sintomas físicos que ninguém entende", scores: { culposa: 3, vigilante: 1 } },
      { value: "peito", label: "Peito apertado, respiração curta, sensação de que algo ruim vai acontecer", scores: { antecipatoria: 3 } },
      { value: "todos", label: "Tudo isso, em momentos diferentes", scores: { vigilante: 1, sobrecarga: 1, culposa: 1, antecipatoria: 1 } },
    ],
  },
  {
    key: "comportamento",
    transitionFrom: {
      questionKey: "sintoma",
      map: {
        madrugada:
          "Acordar de madrugada não é insônia comum. É um sinal específico que vou te explicar daqui a pouco.",
        tensao: "Tensão crônica é o corpo gritando o que a boca não diz. Vamos chegar lá.",
        estomago:
          "Quando o estômago reage, é o sistema nervoso falando uma língua que poucos médicos sabem traduzir.",
        peito: "Peito apertado tem nome técnico — e tem caminho de saída.",
        todos:
          "Quando o corpo manifesta tudo, geralmente é porque um padrão dominante está disparando os outros.",
      },
    },
    prompt: "Quando a ansiedade aparece, qual desses comportamentos é mais seu?",
    options: [
      { value: "checagem", label: "Fico checando: trava da porta, gás, e-mail, mensagem do filho. Não consigo desligar.", scores: { vigilante: 3 } },
      { value: "aceitar-mais", label: "Aceito mais uma tarefa. Mais um cuidado. Não consigo dizer não.", scores: { sobrecarga: 3 } },
      { value: "oracao", label: "Oro pedindo perdão. Releio versículos. Tento confiar mais. E não passa.", scores: { culposa: 3 } },
      { value: "cenarios", label: "Imagino cenários ruins. Crio diálogos difíceis na cabeça antes de acontecer.", scores: { antecipatoria: 3 } },
    ],
  },
  {
    key: "frase",
    transition:
      "Agora a pergunta mais difícil. Leia cada frase devagar e marque a que mais aperta por dentro.",
    prompt: "Qual dessas frases mais aperta você por dentro?",
    options: [
      { value: "soltar", label: "“Se eu soltar isso, algo ruim vai acontecer.”", scores: { vigilante: 4 } },
      { value: "nao-parar", label: "“Eu não posso parar. Tem gente dependendo de mim.”", scores: { sobrecarga: 4 } },
      { value: "insuficiente", label: "“Eu nunca sou suficiente — pra ninguém. Nem pra Deus.”", scores: { culposa: 4 } },
      { value: "pior", label: "“E se acontecer o pior?”", scores: { antecipatoria: 4 } },
    ],
  },
  {
    key: "espiritual",
    transition:
      "Você está sendo corajosa. Falta pouco. Agora a parte que ninguém pergunta numa consulta médica.",
    prompt: "Como está sua vida com Deus hoje?",
    options: [
      { value: "mente-nao-desliga", label: "Tento orar mas minha mente não desliga. Não consigo focar.", scores: { vigilante: 2 } },
      { value: "sirvo-muito", label: "Sirvo bastante. Mas não sinto Deus como antes.", scores: { sobrecarga: 2 } },
      { value: "perdao-constante", label: "Oro pedindo perdão o tempo todo. Sinto que não sou digna.", scores: { culposa: 3 } },
      { value: "medo-abandono", label: "Tenho medo de que Deus me abandone ou algo grave aconteça.", scores: { antecipatoria: 2, culposa: 1 } },
    ],
  },
  {
    key: "desejo",
    meta: "desire",
    transition: "Última pergunta. Essa eu preciso que você responda com o coração.",
    prompt: "Se você pudesse mudar UMA coisa hoje, qual seria?",
    options: [
      { value: "dormir", label: "Dormir uma noite inteira sem acordar de madrugada." },
      { value: "descansar", label: "Conseguir parar e descansar sem sentir culpa." },
      { value: "orar", label: "Conseguir orar e sentir Deus de novo." },
      { value: "parar-pior", label: "Parar de imaginar o pior o tempo todo." },
    ],
  },
];

export const ENCOURAGEMENTS = [
  "Você está sendo corajosa. Continua.",
  "Falta pouco — você está perto.",
  "Estou com você. Respira fundo.",
];

export const CONFIRMATIONS = ["Compreendi 🤍", "Anotado 🤍", "Entendi 🤍", "Recebi 🤍"];

export type ArchetypeChapter = {
  num: string;
  title: string;
  period: string;
  description: string;
};

export type ArchetypeData = {
  id: Archetype;
  name: string;
  subtitle: string;
  tagline: string;
  /** HTML rico — renderizado via dangerouslySetInnerHTML. */
  mechanismHtml: string;
  /** HTML rico do bloco "desarme" (verdade + versículo). */
  desarmeHtml: string;
  /** HTML rico explicando o método. */
  metodoHtml: string;
  esperar: string;
  naoEsperar: string;
  bridges: Record<string, string>;
  chapters: ArchetypeChapter[];
};

export const ARCHETYPES: Record<Archetype, ArchetypeData> = {
  vigilante: {
    id: "vigilante",
    name: "VIGILANTE",
    subtitle: "O padrão da Mente Que Não Desliga.",
    tagline: "O método guiado para a Mente Que Não Desliga.",
    chapters: [
      {
        num: "06",
        title: "Descanso na Soberania",
        period: "Capítulo da manhã",
        description:
          "Trabalha o “soltar” antes do dia começar. Ensina seu corpo, pela respiração e pela Palavra, que o mundo está sustentado mesmo quando você não está segurando.",
      },
      {
        num: "06",
        title: "Poder da Entrega Total",
        period: "Capítulo da noite",
        description:
          "Trabalha o desligamento do guarda interno antes do sono. Ensina o sistema nervoso a aceitar repouso como obediência, não como abandono.",
      },
    ],
    mechanismHtml:
      "<p>Você acorda às 3h porque, por anos, seu corpo aprendeu que <strong>se desligar, algo escapa</strong>. É cortisol transbordando uma xícara já cheia.</p><blockquote>“Você não dorme mal porque o barulho te acorda. Não dorme porque, por anos, seu corpo aprendeu que se você desligar — algo escapa.”</blockquote>",
    desarmeHtml:
      "<div class=\"verdade-card\"><p class=\"eyebrow\">A verdade que você precisa ouvir</p><h3>Isso não é falta de fé. <em>É um corpo em alerta.</em></h3><p>É um padrão fisiológico que pode ser instalado em qualquer pessoa, depois de anos vivendo em vigilância. E pode ser desinstalado também — com o método certo, na ordem certa.</p><div class=\"versiculo\"><span>SALMOS 121</span><em>“Aquele que te guarda não dormirá nem cochilará.”</em></div><p class=\"closing\"><em>O Guarda já está acordado.<br>Você está acordada de graça.</em></p></div>",
    metodoHtml:
      "Dois capítulos do método foram feitos especificamente para a Ansiedade Vigilante: <strong>Capítulo 6 da manhã — Descanso na Soberania</strong> e <strong>Capítulo 6 da noite — Poder da Entrega Total</strong>. Em 7 dias, com 14 sessões (manhã e noite), seu corpo recebe 14 sinais consecutivos de que pode soltar.",
    esperar:
      "Começar a dormir mais profundo, acordar menos vezes de madrugada, sentir o corpo mais leve.",
    naoEsperar:
      "Cura imediata se a hipervigilância vem de trauma profundo. Trauma demanda terapia direcionada. Esse método é o começo do caminho, não o fim.",
    bridges: {
      "casada-filhos-pequenos":
        "Mãe de filho pequeno acordando às 3h não é insônia. É um corpo que aprendeu: se eu dormir, alguém chora e eu não ouço.",
      "casada-filhos-grandes":
        "Filho já cresceu — e o corpo continua vigiando. Um padrão antigo que ninguém te avisou que ficaria.",
      "casada-sem-filhos":
        "Você não dorme mal porque sua vida está mal. Dorme mal porque seu corpo aprendeu a vigiar.",
      "mae-solo":
        "Sustentar a casa sozinha ensina o corpo a nunca desligar. Se você soltar, o que segura tudo?",
      solteira:
        "Você dorme mal mesmo sem ninguém dependendo de você. Porque o padrão antigo continua agindo.",
    },
  },
  sobrecarga: {
    id: "sobrecarga",
    name: "SOBRECARGA",
    subtitle: "O padrão da Que Carrega Todos.",
    tagline: "O método guiado para a Que Carrega Todos.",
    chapters: [
      {
        num: "05",
        title: "Saúde Emocional e Poda dos Pensamentos",
        period: "Capítulo da manhã",
        description:
          "Trabalha o “permitir parar” antes do dia inteiro pesar nas suas costas. Ensina seu corpo a entender que descanso não é abandono.",
      },
      {
        num: "05",
        title: "Ritmo do Descanso Confiante",
        period: "Capítulo da noite",
        description:
          "Trabalha o encerramento do dia sem culpa. Ensina o sistema nervoso a aceitar pausa como direito, não como pecado.",
      },
    ],
    mechanismHtml:
      "<p>Você é a que segura tudo — e quando alguém pergunta, sorri e diz “tudo bem”. Mas o cansaço está num lugar que dormir não alcança: ombro, pescoço, mandíbula. E parar te dá uma culpa estranha.</p><blockquote>“Você se perdeu sendo a pessoa que segura todo mundo. E agora, ninguém segura você — nem você mesma.”</blockquote>",
    desarmeHtml:
      "<div class=\"verdade-card\"><p class=\"eyebrow\">A verdade que você precisa ouvir</p><h3>Isso não é fraqueza. <em>É exaustão acumulada.</em></h3><p>Anos de você sendo “a forte”, “a prestativa”. Ninguém te avisou que <strong>descansar também é fé</strong>. Tentar dar conta sozinha é uma forma silenciosa de não confiar que Deus continua agindo enquanto você dorme.</p><div class=\"versiculo\"><span>MATEUS 11</span><em>“Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.”</em></div><p class=\"closing\"><em>O convite é específico pra você.<br>Não é pra se esforçar mais — é pra parar.</em></p></div>",
    metodoHtml:
      "Dois capítulos do método foram feitos especificamente para a Ansiedade da Sobrecarga: <strong>Capítulo 5 da manhã — Saúde Emocional e Poda dos Pensamentos</strong> e <strong>Capítulo 5 da noite — Ritmo do Descanso Confiante</strong>. Sessões curtas que ensinam seu corpo a entender que descanso não é abandono.",
    esperar:
      "Conseguir sentar sem fazer nada por 15 minutos sem disparar culpa. Sentir o ombro descer pela primeira vez em anos.",
    naoEsperar:
      "Que o método resolva a sobrecarga externa real. Se você cuida de pais idosos sozinha, se o marido não divide, se o trabalho é abusivo — essas conversas precisam acontecer fora daqui.",
    bridges: {
      "casada-filhos-pequenos":
        "Mãe de filho pequeno sustenta duas casas ao mesmo tempo: a sua e a do filho. Você é a forte porque não tem opção.",
      "casada-filhos-grandes":
        "Filho cresceu — só mudou o tipo de cuidado. O corpo segue respondendo como se ainda houvesse criança chorando.",
      "casada-sem-filhos":
        "Você cuida do marido, da casa, da sua mãe, da família toda. Não tem filho — tem todo mundo.",
      "mae-solo":
        "Mãe solo é a definição de Sobrecarga: a primeira que acorda, a última que dorme. Não existe almoço sem você.",
      solteira:
        "Solteira da família vira a 'que está disponível porque não tem filhos'. E ninguém vê quanto isso custa.",
    },
  },
  culposa: {
    id: "culposa",
    name: "CULPOSA",
    subtitle: "O padrão da Que Não Se Perdoa.",
    tagline: "O método guiado para a Que Não Se Perdoa.",
    chapters: [
      {
        num: "02",
        title: "Perdão e Reconciliação",
        period: "Capítulo da manhã",
        description:
          "Trabalha o perdão de si antes do dia começar a te julgar. Ensina seu corpo que graça é instalação, não recompensa.",
      },
      {
        num: "02",
        title: "Perdão e Purificação Neural",
        period: "Capítulo da noite",
        description:
          "Trabalha a liberação da autocondenação antes do sono. Ensina o sistema límbico a parar de te punir o tempo todo.",
      },
    ],
    mechanismHtml:
      "<p>Você ora, lê, tenta confiar — e acorda com o peito apertado. E aí vem a parte mais cruel: <strong>você se culpa por estar sentindo</strong>, como se cristã de verdade não tremesse.</p><blockquote>“Essa voz que te diz 'cristã de verdade não sente isso' não é a voz do Espírito Santo. É a voz da insuficiência.”</blockquote>",
    desarmeHtml:
      "<div class=\"verdade-card\"><p class=\"eyebrow\">A verdade que você precisa ouvir</p><h3>A condenação que você sente <em>não vem do Pai.</em></h3><p>A ansiedade não é fé fraca — é um corpo em alerta crônico. Você poderia ter a fé de Abraão e seu cortisol ainda subiria às 3h da manhã. Cortisol não responde a fé consciente. Responde a treino corporal.</p><div class=\"versiculo\"><span>ROMANOS 8</span><em>“Já não há condenação para os que estão em Cristo Jesus.”</em></div><p class=\"closing\"><em>Já não há.<br>A condenação que você sente vem de uma régua que confundiu sofrimento com santidade.</em></p></div>",
    metodoHtml:
      "Dois capítulos do método foram feitos especificamente para a Ansiedade Culposa: <strong>Capítulo 2 da manhã — Perdão e Reconciliação</strong> e <strong>Capítulo 2 da noite — Perdão e Purificação Neural</strong>. Em 7 dias, com 14 sessões, você vai começar a sentir no corpo o que a Palavra já te garantiu há 2000 anos.",
    esperar:
      "Começar a orar sem ficar revisando se “orou direito”. Sentir paz sem se culpar por estar sentindo paz.",
    naoEsperar:
      "Apagar de uma vez anos de cobrança religiosa internalizada. Esse trabalho continua — em terapia, em direção espiritual saudável. O método é o primeiro empurrão.",
    bridges: {
      "casada-filhos-pequenos":
        "Mãe cristã de filho pequeno carrega culpa dobrada: por cansar, por gritar, por querer 5 minutos sozinha — e culpa por ter culpa.",
      "casada-filhos-grandes":
        "Você revisa cada decisão antiga: 'e se tivesse feito diferente?' 'e se tivesse orado mais?' Culpa por escolhas que já não dá pra mudar.",
      "casada-sem-filhos":
        "Cristã casada sem filhos carrega uma culpa que ninguém nomeia: a da ausência. Por não ter, por ter desejado, por não ter desejado.",
      "mae-solo":
        "Mãe solo cristã carrega três culpas: a do divórcio, a de não ser 'família completa' e a de ser forte demais.",
      solteira:
        "Cristã solteira na igreja carrega a culpa silenciosa de não ter cumprido o 'destino esperado' — e de se perguntar, sozinha, se Deus se esqueceu.",
    },
  },
  antecipatoria: {
    id: "antecipatoria",
    name: "ANTECIPATÓRIA",
    subtitle: "O padrão da Que Antecipa o Pior.",
    tagline: "O método guiado para a Que Antecipa o Pior.",
    chapters: [
      {
        num: "01",
        title: "Despertar da Coragem",
        period: "Capítulo da manhã",
        description:
          "Trabalha o desligamento do “e se” antes do dia começar. Ensina seu corpo, pela respiração e ancoragem na Palavra, que o amanhã é território de Deus.",
      },
      {
        num: "01",
        title: "Fim do Alarme de Medo",
        period: "Capítulo da noite",
        description:
          "Trabalha o silenciamento da projeção catastrófica antes do sono. Ensina o sistema nervoso a aceitar que o futuro pode chegar sem ser vigiado por você.",
      },
    ],
    mechanismHtml:
      "<p>Antes de levantar, sua mente já correu o dia inteiro. Cada dor vira doença, cada atraso vira tragédia, cada silêncio vira separação. E <strong>nada disso acontece</strong> — mas seu corpo já gastou toda a energia.</p><blockquote>“O futuro te preocupa antes mesmo de chegar. E quando chega — raramente é o que você temia.”</blockquote>",
    desarmeHtml:
      "<div class=\"verdade-card\"><p class=\"eyebrow\">A verdade que você precisa ouvir</p><h3>Isso não é frescura. <em>É um padrão neural.</em></h3><p>Em algum momento, seu cérebro aprendeu: <em>“se eu não antecipar o pior, ele me pega de surpresa.”</em> E continuou prevendo, mesmo quando o perigo já passou. Cerca de <strong>85% das coisas que ansiosos preveem nunca acontecem</strong>.</p><div class=\"versiculo\"><span>JEREMIAS 29</span><em>“Eu sei os planos que tenho para vocês — planos de paz, e não de mal.”</em></div><p class=\"closing\"><em>O plano já existe.<br>Você está vivendo num futuro que ainda não foi escrito por Deus.</em></p></div>",
    metodoHtml:
      "Dois capítulos do método foram feitos especificamente para a Ansiedade Antecipatória: <strong>Capítulo 1 da manhã — Despertar da Coragem</strong> e <strong>Capítulo 1 da noite — Fim do Alarme de Medo</strong>. Em 7 dias, seu cérebro vai começar a receber sinais novos: “o futuro está nas mãos de quem já esteve nele.”",
    esperar:
      "Começar a perceber que consegue viver o presente sem rodar 5 cenários catastróficos em paralelo. Mente mais quieta, futuro mais leve.",
    naoEsperar:
      "Que substitua psiquiatria em casos de pânico severo. Se você tem várias crises por semana, o caminho saudável é fazer esse método em paralelo a acompanhamento profissional — não em vez de.",
    bridges: {
      "casada-filhos-pequenos":
        "Você vê doença em cada espirro, sequestro em cada atraso, ameaça em cada estranho. E a culpa por imaginar pesa tanto quanto o medo.",
      "casada-filhos-grandes":
        "Agora você antecipa o que já não depende de você — escolhas, casamentos, caminhos. Mas o corpo segue respondendo como se dependesse.",
      "casada-sem-filhos":
        "Sua mente antecipa o abstrato — perda do emprego, doença grave, separação. E ninguém vê o objeto do medo pra te validar.",
      "mae-solo":
        "Mãe solo antecipa o pior porque sabe: se algo der errado, só tem uma pessoa pra resolver — você.",
      solteira:
        "Você antecipa envelhecer sozinha, adoecer sem ninguém. E essa antecipação envenena o presente que ainda poderia viver.",
    },
  },
};

export const DESIRE_CTA: Record<string, string> = {
  dormir: "Quero dormir uma noite inteira",
  descansar: "Quero descansar sem culpa",
  orar: "Quero sentir Deus de novo",
  "parar-pior": "Quero parar de imaginar o pior",
};

/** Frase em primeira pessoa, do jeito que a usuária escreveria — usada na ponte e na oferta. */
export const DESIRE_QUOTE: Record<string, string> = {
  dormir: "dormir uma noite inteira sem acordar de madrugada.",
  descansar: "conseguir parar e descansar sem sentir culpa.",
  orar: "conseguir orar e sentir que Deus me ouve novamente.",
  "parar-pior": "parar de imaginar o pior o tempo todo.",
};

export function computeArchetype(
  answers: Record<string, string>,
): { scores: Record<Archetype, number>; archetype: Archetype } {
  const scores: Record<Archetype, number> = {
    vigilante: 0,
    sobrecarga: 0,
    culposa: 0,
    antecipatoria: 0,
  };
  for (const q of QUESTIONS) {
    const val = answers[q.key];
    if (!val) continue;
    const opt = q.options.find((o) => o.value === val);
    if (!opt?.scores) continue;
    for (const [k, v] of Object.entries(opt.scores)) {
      scores[k as Archetype] += v ?? 0;
    }
  }
  // Tie-break determinístico: ordem de prioridade fixa em caso de empate.
  const priority: Archetype[] = ["vigilante", "sobrecarga", "culposa", "antecipatoria"];
  const archetype = priority.reduce((best, k) =>
    scores[k] > scores[best] ? k : best,
  priority[0]);
  return { scores, archetype };
}

// ---- Consistency checks (dev only) ----
if (import.meta.env?.DEV) {
  // 1) Apenas a Q2 ("risco") pode ter opções marcadas como risk
  QUESTIONS.forEach((q, i) => {
    const hasRisk = q.options.some((o) => o.risk);
    if (hasRisk && q.key !== "risco") {
      console.warn(`[quiz] risk flag fora da Q2 (índice ${i}, key=${q.key})`);
    }
  });
  // 2) Q2 deve existir e ser a segunda pergunta
  if (QUESTIONS[1]?.key !== "risco") {
    console.warn("[quiz] esperada Q2 com key='risco'");
  }
  // 3) Todas as opções não-risk devem ter scores definidos (exceto Q1 contexto e Q7 desejo)
  const noScoreKeys = new Set(["situacao", "desejo"]);
  QUESTIONS.forEach((q) => {
    if (noScoreKeys.has(q.key) || q.key === "risco") return;
    q.options.forEach((o) => {
      if (!o.risk && (!o.scores || Object.keys(o.scores).length === 0)) {
        console.warn(`[quiz] opção sem scores: ${q.key}/${o.value}`);
      }
    });
  });
}

/** Retorna a fala da guia ANTES da pergunta, considerando respostas anteriores. */
export function getTransition(qIndex: number, answers: Record<string, string>): string | null {
  const q = QUESTIONS[qIndex];
  if (!q) return null;
  if (q.transitionFrom) {
    const ans = answers[q.transitionFrom.questionKey];
    if (ans && q.transitionFrom.map[ans]) return q.transitionFrom.map[ans];
  }
  return q.transition ?? null;
}