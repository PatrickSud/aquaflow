/* model.js — definições de parâmetros, produtos, espécies, tarefas e o perfil inicial. */

/* ---------------- parâmetros de água ----------------
   crit: true = parâmetro crítico de segurança (bloqueia povoamento)
   faixa padrão pensada para aquário plantado comunitário de água doce. */
export const PARAMS = [
  { k: 'nh3',  n: 'Amônia (NH₃)',  u: 'ppm', dec: 3, crit: true,  min: 0,    max: 0,    lim: [0, 10],   step: 0.01, core: true,
    zones: [{ to: 0,     s: 'ok' }, { to: 0.25, s: 'bad' }, { to: 99, s: 'bad' }] },
  { k: 'no2',  n: 'Nitrito (NO₂)', u: 'ppm', dec: 3, crit: true,  min: 0,    max: 0,    lim: [0, 10],   step: 0.01, core: true,
    zones: [{ to: 0,     s: 'ok' }, { to: 0.25, s: 'bad' }, { to: 99, s: 'bad' }] },
  { k: 'no3',  n: 'Nitrato (NO₃)', u: 'ppm', dec: 1, crit: false, min: 0,    max: 20,   lim: [0, 200],  step: 1, core: true,
    zones: [{ to: 20,    s: 'ok' }, { to: 40,   s: 'warn' }, { to: 999, s: 'bad' }] },
  { k: 'ph',   n: 'pH',            u: '',    dec: 2, crit: false, min: 6.8,  max: 7.6,  lim: [4, 10],   step: 0.1, core: true,
    zones: [{ to: 6.4, s: 'bad' }, { to: 6.8, s: 'warn' }, { to: 7.6, s: 'ok' }, { to: 8.2, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'temp', n: 'Temperatura',   u: '°C',  dec: 1, crit: false, min: 25,   max: 26,   lim: [10, 40],  step: 0.1, core: true,
    zones: [{ to: 22, s: 'bad' }, { to: 24, s: 'warn' }, { to: 27, s: 'ok' }, { to: 29, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'cl',   n: 'Cloro',         u: 'ppm', dec: 2, crit: true,  min: 0,    max: 0,    lim: [0, 5],    step: 0.01,
    zones: [{ to: 0, s: 'ok' }, { to: 0.1, s: 'warn' }, { to: 99, s: 'bad' }] },
  { k: 'gh',   n: 'GH (dureza geral)',      u: '°dGH', dec: 1, crit: false, min: 4, max: 12, lim: [0, 40], step: 1,
    zones: [{ to: 2, s: 'warn' }, { to: 4, s: 'warn' }, { to: 12, s: 'ok' }, { to: 20, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'kh',   n: 'KH (dureza carbonática)', u: '°dKH', dec: 1, crit: false, min: 3, max: 8, lim: [0, 30], step: 1,
    zones: [{ to: 2, s: 'bad' }, { to: 3, s: 'warn' }, { to: 8, s: 'ok' }, { to: 14, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'o2',   n: 'Oxigênio dissolvido',    u: 'mg/L', dec: 1, crit: false, min: 6, max: 9, lim: [0, 20], step: 0.1,
    zones: [{ to: 4, s: 'bad' }, { to: 6, s: 'warn' }, { to: 12, s: 'ok' }, { to: 99, s: 'warn' }], lower: true },
  { k: 'co2',  n: 'CO₂',           u: 'ppm', dec: 1, crit: false, min: 10, max: 25, lim: [0, 80], step: 1,
    zones: [{ to: 5, s: 'warn' }, { to: 10, s: 'warn' }, { to: 30, s: 'ok' }, { to: 40, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'po4',  n: 'Fosfato (PO₄)', u: 'ppm', dec: 2, crit: false, min: 0.1, max: 1.5, lim: [0, 20], step: 0.05,
    zones: [{ to: 0.05, s: 'warn' }, { to: 2, s: 'ok' }, { to: 5, s: 'warn' }, { to: 99, s: 'bad' }], lower: true },
  { k: 'fe',   n: 'Ferro (Fe)',    u: 'ppm', dec: 2, crit: false, min: 0.05, max: 0.5, lim: [0, 5], step: 0.01,
    zones: [{ to: 0.02, s: 'warn' }, { to: 0.6, s: 'ok' }, { to: 99, s: 'warn' }], lower: true },
  { k: 'ca',   n: 'Cálcio (Ca²⁺)', u: 'ppm', dec: 0, crit: false, min: 20, max: 80, lim: [0, 600], step: 5,
    zones: [{ to: 10, s: 'warn' }, { to: 120, s: 'ok' }, { to: 99999, s: 'warn' }], lower: true }
];

export const P = Object.fromEntries(PARAMS.map((p) => [p.k, p]));
export const CORE = PARAMS.filter((p) => p.core).map((p) => p.k);

/* ---------------- produtos ---------------- */
export const PRODUCTS = [
  { id: 'prime', name: 'Seachem Prime', cat: 'condicionador',
    doseMlPerL: 1 / 40,           // rótulo: 5 mL / 200 L
    label: '5 mL para 200 L de água nova',
    basis: 'newWater',
    maxMult: 5,
    notes: 'Neutraliza cloro/cloramina e destoxifica amônia temporariamente. Em emergência o rótulo admite até 5× a dose no volume total — confirme sempre no seu frasco.',
    conflicts: ['cloronev'] },
  { id: 'stability', name: 'Seachem Stability', cat: 'bactéria',
    doseMlPerL: 5 / 80,           // manutenção: 5 mL / 80 L
    firstDoseMlPerL: 5 / 40,      // 1º dia: 5 mL / 40 L
    label: '1º dia 5 mL/40 L; depois 5 mL/80 L por 7 dias',
    basis: 'total',
    notes: 'Aplicar preferencialmente sobre as mídias biológicas do filtro. Não substitui as mídias.' },
  { id: 'cloronev', name: 'Cloronev', cat: 'condicionador',
    label: 'ver rótulo', basis: 'newWater',
    notes: 'Manter apenas como reserva de emergência.',
    conflicts: ['prime'], warn: 'Nunca usar junto com o Prime na mesma água.' },
  { id: 'transnev', name: 'Transnev', cat: 'medicamento',
    label: 'ver rótulo', basis: 'total',
    notes: 'Somente em aquário hospitalar, com indicação clara.',
    blockIf: ['cycling', 'community'],
    warn: 'Não usar durante a ciclagem nem preventivamente no comunitário.' },
  { id: 'fert', name: 'Fertilizante líquido', cat: 'fertilizante', label: 'ver rótulo', basis: 'total', notes: '' },
  { id: 'other', name: 'Outro produto', cat: 'outro', label: '—', basis: 'total', notes: '' }
];

export const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/* ---------------- fauna: biblioteca de referência ----------------
   bio = carga bioló­gica relativa por indivíduo (peixe médio de 5 cm ≈ 1.0)
   zona = onde vive; grupo = mínimo de cardume; camarao/planta = risco  */
export const SPECIES = [
  { id: 'cory',    n: 'Corydora (albina/aeneus)', sci: 'Corydoras aeneus', adult: 6.5, zona: 'fundo', bio: 1.0, grupo: 6, temp: [22, 26], ph: [6.0, 7.8], camarao: 'medio', planta: 'baixo', betta: 'ok',
    obs: 'Fundo, pacífica, precisa de grupo e substrato liso. Ração que afunde, de preferência à noite.' },
  { id: 'neon',    n: 'Neon-tetra', sci: 'Paracheirodon innesi', adult: 3.5, zona: 'meia-água', bio: 0.5, grupo: 8, temp: [22, 26], ph: [5.5, 7.5], camarao: 'medio', planta: 'baixo', betta: 'atencao',
    obs: 'Cardume grande reduz estresse. Cor viva pode atrair investida do Betta em espaço apertado.' },
  { id: 'betta',   n: 'Betta macho', sci: 'Betta splendens', adult: 6.5, zona: 'superfície', bio: 1.2, grupo: 1, temp: [24, 28], ph: [6.0, 7.5], camarao: 'alto', planta: 'baixo', betta: 'self',
    obs: 'Fluxo brando, tampa fechada, sem rebarbas. Último a entrar no comunitário.' },
  { id: 'neritina', n: 'Neritina', sci: 'Neritina natalensis', adult: 2.5, zona: 'vidros', bio: 0.3, grupo: 1, temp: [22, 28], ph: [7.0, 8.2], camarao: 'baixo', planta: 'baixo', betta: 'ok',
    obs: 'Come biofilme e algas. Só em aquário maduro, com alimento natural disponível.' },
  { id: 'redcherry', n: 'Camarão Red Cherry', sci: 'Neocaridina davidi', adult: 2.5, zona: 'fundo', bio: 0.15, grupo: 6, temp: [20, 27], ph: [6.5, 7.8], camarao: 'self', planta: 'baixo', betta: 'risco',
    obs: 'Filhotes são presa fácil. Precisa de muitos esconderijos e musgo.' },
  { id: 'otocinclus', n: 'Otocinclus', sci: 'Otocinclus sp.', adult: 4, zona: 'vidros', bio: 0.5, grupo: 4, temp: [22, 26], ph: [6.0, 7.5], camarao: 'baixo', planta: 'baixo', betta: 'ok',
    obs: 'Sensível: só em aquário maduro com algas/biofilme e alimentação suplementar.' },
  { id: 'platy',   n: 'Platy', sci: 'Xiphophorus maculatus', adult: 5, zona: 'meia-água', bio: 0.9, grupo: 3, temp: [22, 27], ph: [7.0, 8.2], camarao: 'medio', planta: 'baixo', betta: 'atencao', obs: 'Reproduz muito; a carga cresce sozinha.' },
  { id: 'guppy',   n: 'Guppy', sci: 'Poecilia reticulata', adult: 4, zona: 'superfície', bio: 0.7, grupo: 3, temp: [22, 28], ph: [7.0, 8.2], camarao: 'medio', planta: 'baixo', betta: 'risco', obs: 'Cauda colorida costuma provocar o Betta.' },
  { id: 'rasbora', n: 'Rasbora-arlequim', sci: 'Trigonostigma heteromorpha', adult: 4, zona: 'meia-água', bio: 0.6, grupo: 8, temp: [23, 27], ph: [6.0, 7.5], camarao: 'baixo', planta: 'baixo', betta: 'ok', obs: 'Boa companhia para Betta: discreta e de cardume.' },
  { id: 'kuhli',   n: 'Botia-palhaço/Kuhli', sci: 'Pangio kuhlii', adult: 8, zona: 'fundo', bio: 0.8, grupo: 4, temp: [24, 28], ph: [6.0, 7.5], camarao: 'medio', planta: 'baixo', betta: 'ok', obs: 'Precisa de substrato macio e esconderijos.' },
  { id: 'outro',   n: 'Outra espécie', sci: '', adult: 5, zona: 'meia-água', bio: 1.0, grupo: 1, temp: [22, 28], ph: [6.0, 8.0], camarao: 'medio', planta: 'medio', betta: 'atencao', obs: '' }
];

export const SPEC = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/* ---------------- plantas ---------------- */
export const PLANT_STATES = [
  { v: 'adapt', n: 'Em adaptação', s: 'warn' },
  { v: 'ok', n: 'Saudável / crescendo', s: 'ok' },
  { v: 'melt', n: 'Melt (derretendo)', s: 'warn' },
  { v: 'poda', n: 'Precisa de poda', s: 'warn' },
  { v: 'ruim', n: 'Deteriorando', s: 'bad' }
];

/* ---------------- tarefas padrão ----------------
   action : liga a tarefa a um registro do app ('test' | 'dose' | 'tpa' | 'feed').
            Tocando na tarefa, abre o registro certo; e ela se marca sozinha
            quando o registro correspondente entra no dia.
   params : para action 'test', quais parâmetros aquele teste precisa conter.
   prod   : para action 'dose', qual produto.
   fase   : 'ciclagem' aparece só enquanto o ciclo não foi confirmado;
            'povoado' aparece só quando existe fauna.
   how    : orientação de COMO fazer, mostrada ao tocar em "Como fazer". */
export const TASK_TPL = [
  { t: 'Verificar temperatura', freq: 'diaria', action: 'test', params: ['temp'],
    how: 'Leia o termômetro no lado oposto ao filtro. Anote o valor mesmo que pareça igual ao de ontem — a série histórica é o que revela oscilação.' },
  { t: 'Observar comportamento dos peixes', freq: 'diaria', fase: 'povoado',
    how: 'Procure: peixe parado no fundo, nadadeiras fechadas, isolamento, raspar no substrato, perseguição. Qualquer um desses vale uma ocorrência no diário.' },
  { t: 'Observar respiração / boca na superfície', freq: 'diaria', fase: 'povoado',
    how: 'Boca na superfície ou guélguela acelerada indica falta de oxigênio ou amônia/nitrito. Teste amônia e nitrito no mesmo dia.' },
  { t: 'Verificar funcionamento do filtro', freq: 'diaria',
    how: 'Confira se a cascata mantém o mesmo volume de sempre. Queda de fluxo = pré-filtro saturado. Para o Betta, o fluxo deve estar brando.' },
  { t: 'Verificar vazamentos', freq: 'diaria',
    how: 'Passe a mão na base do vidro e nas mangueiras. Umidade onde estava seco merece atenção imediata.' },
  { t: 'Conferir iluminação / temporizador', freq: 'diaria',
    how: 'Confirme que ligou e desligou no horário programado. Fotoperíodo irregular favorece alga.' },
  { t: 'Observar plantas', freq: 'diaria',
    how: 'Folha totalmente necrosada sai; folha amarelando fica. Antes de pensar em nutriente, considere adaptação, melt, dano mecânico e luz.' },
  { t: 'Alimentar peixes', freq: 'diaria', action: 'feed', fase: 'povoado',
    how: 'Ofereça o que desaparece em cerca de 1 minuto. Betta: 3–5 grânulos contados. Corydoras: ração de fundo, de preferência à noite. Sobra vira amônia.' },
  { t: 'Aplicar Stability sobre as mídias do filtro', freq: 'diaria', action: 'dose', prod: 'stability', fase: 'ciclagem',
    how: 'Aplique direto sobre as mídias biológicas, no compartimento do filtro — não na coluna d’água. Registre para o app não sugerir a mesma dose duas vezes.' },

  { t: 'Testar amônia e nitrito', freq: 'cadencia', action: 'test', params: ['nh3', 'no2'],
    how: 'São os dois parâmetros que bloqueiam a entrada de peixe. A frequência acompanha a fase: a cada 1–2 dias na ciclagem, 3–4 dias com fauna nova, semanal quando maduro.' },
  { t: 'Testar nitrato e pH', freq: 'semanal', action: 'test', params: ['no3', 'ph'],
    how: 'O nitrato é o que decide TPA: abaixo de 20 ppm sem motivo para trocar, 20–40 atenção, acima de 40 indicada.' },

  { t: 'Avaliar necessidade de TPA', freq: 'tpa', action: 'tpa',
    how: 'Isto não é "trocar água porque venceu o prazo". O app olha amônia, nitrito, nitrato, pH, temperatura e a fase do ciclo, e diz se a troca se justifica hoje.' },

  { t: 'Remover folhas mortas', freq: 'semanal',
    how: 'Retire só o material realmente morto. Matéria em decomposição dentro do aquário vira amônia e carga para o filtro.' },
  { t: 'Conferir fluxo e tampa', freq: 'semanal',
    how: 'Tampa sempre fechada — Betta salta. Fluxo brando na superfície.' },
  { t: 'Observar crescimento das plantas', freq: 'semanal',
    how: 'Compare com a foto do mês passado. Folha nova saudável é o melhor sinal de que a planta pegou.' },

  { t: 'Revisar equipamentos', freq: 'mensal',
    how: 'Termostato, calha, filtro e temporizador. Verifique aquecimento anormal em plugues e fontes.' },
  { t: 'Conferir mídias filtrantes (sem trocar as biológicas)', freq: 'mensal',
    how: 'Se precisar lavar, lave na ÁGUA DO PRÓPRIO AQUÁRIO, nunca na torneira — cloro mata a colônia. Nunca substitua todo o material biológico de uma vez.' },
  { t: 'Avaliar mangueiras e conexões', freq: 'mensal',
    how: 'Procure ressecamento, folga e acúmulo interno que reduza a vazão.' },
  { t: 'Registrar evolução das plantas (foto)', freq: 'mensal',
    how: 'Mesma distância e mesmo ângulo todo mês. Em três meses a comparação mostra o que nenhuma anotação mostra.' }
];

export const FREQ = {
  diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', unica: 'Única',
  cadencia: 'Conforme a fase', tpa: 'TPA programada'
};

/* ---------------- fábrica de aquário ---------------- */
export function newAquarium(over = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return Object.assign({
    id: null,
    name: 'Meu Aquário',
    type: 'doce',
    setupDate: today,
    color: '#1a7ff0',
    photo: null,
    notes0: '',

    volUtil: 80,
    volBruto: 96,
    dims: { c: 80, l: 30, a: 40 },

    targets: Object.fromEntries(PARAMS.map((p) => [p.k, { min: p.min, max: p.max }])),

    equip: {
      filtro: 'Filtro Hang-On Leecom HI-430 — 350 L/h, fluxo regulável, esponja pré-filtro na sucção',
      midias: 'Placa mecânica de entrada + anéis Boyu Megapore CR-150 (sobra em bolsa de malha no fundo)',
      aquecedor: 'Termostato Roxin 100 W, próximo ao fluxo do filtro',
      luz: 'Calha LED Newpet Full Spectrum RGB (65–87 cm), acima da tampa de vidro',
      tampa: 'Vidro transparente em 4 partes',
      substrato: '≈10 kg de cascalho liso nº 2'
    },
    light: { on: '14:00', off: '20:00', hours: 6, intensity: 'média', notes: '' },

    // TPA programada: o calendário lembra, os parâmetros decidem
    tpaPlan: { on: true, every: 10, pct: 20 },

    cycling: { active: true, start: today, phase: 1, done: false, doneAt: null },

    tests: [],
    dosings: [],
    tpas: [],
    feedings: [],
    livestock: [],
    plants: [],
    tasks: [],
    taskLog: [],
    notes: [],
    events: [],
    chat: [],
    stocking: { plan: [], intervalDays: 8 }
  }, over);
}

export function seedTasks(aq) {
  aq.tasks = TASK_TPL.map((t, i) => ({
    id: 't' + i + Math.random().toString(36).slice(2, 6),
    title: t.t,
    freq: t.freq,
    time: t.freq === 'diaria' ? '09:00' : '',
    on: true,
    action: t.action || null,
    params: t.params || null,
    prod: t.prod || null,
    fase: t.fase || null,
    how: t.how || ''
  }));
  return aq;
}

/** Perfil pronto do aquário descrito no briefing (80 L úteis, plantado comunitário). */
export function seedProfileDoBriefing(aq) {
  aq.name = 'Meu Aquário';
  aq.plants = [
    { id: 'p1', species: 'Vallisneria', qty: 8, cond: 'adapt', loc: 'fundo/laterais', notes: 'Pontas marrons — acompanhar adaptação. Não enterrar a coroa.', createdAt: new Date().toISOString() },
    { id: 'p2', species: 'Echinodorus (Amazonense)', qty: 4, cond: 'adapt', loc: 'meio', notes: 'Em adaptação.', createdAt: new Date().toISOString() },
    { id: 'p3', species: 'Hygrophila corymbosa', qty: 1, cond: 'adapt', loc: 'fundo', notes: 'Trocando folhas.', createdAt: new Date().toISOString() }
  ];
  aq.stocking.plan = [
    { id: 's1', spec: 'cory', qty: 6, done: false },
    { id: 's2', spec: 'neon', qty: 8, done: false },
    { id: 's3', spec: 'betta', qty: 1, done: false },
    { id: 's4', spec: 'neritina', qty: 1, done: false }
  ];
  aq.foods = [
    { id: 'f1', name: 'TetraMin Flocos', target: 'meia-água' },
    { id: 'f2', name: 'Mega Food Betta Bits', target: 'Betta (3–5 grânulos)' },
    { id: 'f3', name: 'Ração densa de fundo', target: 'Corydoras (à noite)' }
  ];
  aq.protocols = { stabilityMl: 6, stabilityDays: 7, filterSwapDay: 35 };
  return aq;
}
