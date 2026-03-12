// ══════════════════════════════════════
//  QUESTIONS DATABASE
// ══════════════════════════════════════
const DB = {
  geral: [
    { q: "ATENÇÃO, PLATEIA! Qual campeão Goron brilha em Breath of the Wild?", ft: "",
      opts: ["YUNOBO", "URBOSA", "DARUK", "GORON'S PRIDE"], a: 2 },

    { q: "ESPETÁCULO DO TEMPO! Em TOTK, qual habilidade faz objetos voltarem no tempo?", ft: "",
      opts: ["TIME-SHIFT RITE", "RECALL", "ASCEND", "ULTRAHAND"], a: 1 },

    { q: "NÚMERO MUSICAL DAS ARMAS! Quem usa a reluzente arma exibida acima?", ft: "./sprt/characters/Great Eagle Bow.png",
      opts: ["Rito", "TEBA", "REVALI", "PARAGLIDER"], a: 2 },

    { q: "SEGUNDO ATO, DARLING! Quem empunha a arma mostrada acima?", ft: "./sprt/characters/Lightscale_Trident.png",
      opts: ["ZORA TRIDENTE", "MIPHA", "LIGHTSCALE PRONG", "SIDON"], a: 1 },

    { q: "DESAFIO DE ESTILO! Adivinhe o personagem em cena.", ft: "./sprt/characters/Fukurou.png",
      opts: ["OWL-EMISSARY", "FUKURO", "FUKUROU", "FUKU-ISA"], a: 2 },

    { q: "RODADA GLAMOUROSA! Quem é este personagem magnífico?", ft: "./sprt/characters/Hachinosu.png",
      opts: ["SKY ISLANDER", "HACHIN BAY", "BLACK BAY", "HACHINOSU"], a: 3 },

    { q: "MEU QUERIDO PÚBLICO, IDENTIFIQUE ESTA ESTRELA!", ft: "./sprt/characters/Hathy.png",
      opts: ["HATTY ", "HATHY JR", "HEALTH", "HATHY"], a: 3 },

    { q: "LUZES NO PALCO! Diga: quem é este personagem?", ft: "./sprt/characters/Lassoo.png",
      opts: ["CAPTAIN LASS", "L'ASSO", "LASSOO", "LASSO"], a: 2 },

    { q: "SEM ERROS NO SHOW! Adivinhe o personagem da imagem.", ft: "./sprt/characters/Seam.png",
      opts: ["SEAMER", "SEEM", "SEAM-ELF", "SEAM"], a: 3 },

    { q: "CLÍMAX DA APRESENTAÇÃO! Quem aparece nesta foto?", ft: "./sprt/characters/Spider Miles.webp",
      opts: ["SPIDER SMILES", "SPIDER MILES", "TROPICAL FACTORY", "MINK STRIKER"], a: 1 },

    { q: "BRILHE COMO UMA ESTRELA: quem é este personagem?", ft: "./sprt/characters/Swatchling.png",
      opts: ["SWATCH", "SWATCHLING", "SWATCHEN", "SWATCH-TRAIN"], a: 1 },

    { q: "NÃO PISQUE, DARLING! Adivinhe o personagem agora.", ft: "./sprt/characters/Sweet.png",
      opts: ["SWEETER", "SWEETBERRY", "SWEET", "SWEET-TOOTH"], a: 2 },

    { q: "O PALCO É SEU! Quem é o personagem em destaque?", ft: "./sprt/characters/Tasque.png",
      opts: ["TASKER", "TASQUEDUCH", "TASQUE", "TASQ"], a: 2 },

    { q: "GRANDE FINAL SE APROXIMANDO! Quem está na imagem?", ft: "./sprt/characters/Terry.png",
      opts: ["TERRIUS", "JERRY", "TERRY", "JENNY"], a: 2 },

    { q: "ÚLTIMA CENA, ESTRELA! Adivinhe o personagem final.", ft: "./sprt/characters/Wadatsumi.png",
      opts: ["JINBE", "WADATSUMI", "WADATSU-MARU", "WADATSUM"], a: 1 }
  ]
};

function shuffleArray(array) {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function shuffleQuiz(DB) {
  const newDB = JSON.parse(JSON.stringify(DB));

  newDB.geral.forEach(q => {
    const correct = q.opts[q.a];

    const shuffled = shuffleArray(q.opts);

    q.opts = shuffled;
    q.a = shuffled.indexOf(correct);
  });

  return newDB;
}

const SHUFFLED_DB = shuffleQuiz(DB);

const GAME_SCORE_CONFIG = {
  geral: {
    maxScore: (DB.geral?.length || 0) * 150,
    enabled: true
  },
  kart: {
    maxScore: 1000,
    enabled: true
  },
  musica: {
    maxScore: 3000,
    enabled: true
  },
  secreto: {
    maxScore: 1000,
    enabled: false
  }
};

const SCORE_STORAGE_KEY = 'birthday_minigame_scores_v1';
const HOOKSHOT_CHECKPOINT_STORAGE_KEY = 'birthday_hookshot_checkpoint_v1';
const HOOKSHOT_CHECKPOINT_INTERVAL = 3;
const SECRET_UNLOCK_THRESHOLD = 5800;

  const SPECIAL_CATEGORY_ROUTES = {};
  
  const KEYS = ['A','B','C','D'];
  const TIME_LIMIT = 15;
  const MAX_LIVES  = 3;
  
  // ══════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════
  let state = {};
  
  function newState(cat) {
      const safeCat = SHUFFLED_DB[cat] ? cat : 'geral';
      const qs = shuffleArray([...SHUFFLED_DB[safeCat]]);
    return {
        cat: safeCat, qs,
      idx: 0,
      score: 0,
      lives: MAX_LIVES,
      correct: 0,
      wrong: 0,
      streak: 0,
      maxStreak: 0,
      totalTime: 0,
      answered: false,
      timer: null,
      timeLeft: TIME_LIMIT,
      timeStart: 0,
    };
  }
  
  
  
  // ══════════════════════════════════════
  //  SCREEN MANAGEMENT
  // ══════════════════════════════════════
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    if (id === 'start-screen') {
      renderGlobalScore();
      renderBestScoresByGame();
    }
  }
  
// ══════════════════════════════════════
//  START / NARRATOR
// ══════════════════════════════════════
let selectedCat = 'geral';
let kartMounted = false;
let hookshotMounted = false;
let secretMounted = false;

const NARRATOR_DIALOGUES = [
  "Achou que fugiria de mim vagabundo",

  "Mal sabia você o que estaria sendo guardado",

  "Seguinte, não vou esconder o que temos aqui",
  "Mas saiba que tem algo especial.\n" +  
  "Algo ÚNICO!",
  "Você vai passar por uma série de jogos inspirados\n" +
  "em coisas que você gosta e conhece.",
  "Pase por todos e descubra o segredo 😱"
];

// Diálogos do narrador para instruções do jogo "Descubra o Personagem"
const NARRATOR_GAME_DIALOGUES = [
  "OH YES, QUERIDAS ESTRELAS!",
  "SEJAM MUITO BEM-VINDOS AO ESPETÁCULO MAIS GLAMOUROSO DA NOITE!",
  "POR FAVOR...\nUMA SALVA DE PALMAS ENSURDECEDORA PARA NOSSO PARTICIPANTE!",
  "HOJE, ELE IRÁ ENFRENTAR...",
  "O JOGO MAIS DRAMÁTICO, MAIS PERIGOSO E MAIS ELEGANTE DA TELEVISÃO!",
  "AS REGRAS SÃO SIMPLES, DARLING.",
  "LEIA AS PERGUNTAS.",
  "ESCOLHA A RESPOSTA CERTA.",
  "E, DE PREFERÊNCIA...",
  "NÃO MORRA.",
  "ERRAR UMA PERGUNTA PODE SER EMBARAÇOSO.",
  "ERRAR DUAS PODE SER TRÁGICO.",
  "MAS ERRAR TRÊS...",
  "OH, DARLING.",
  "SERIA UM DESASTRE PARA A AUDIÊNCIA!",
  "AGORA ENTÃO...",
  "PREPARE-SE PARA BRILHAR SOB OS HOLOFOTES!",
  "LUZES!",
  "CÂMERA!",
  "DRAMA!",
  "BOA SORTE!"
];

const NARRATOR_KART_DIALOGUES = [
  "OI...",
  "EU NÃO ENTENDO MUITO DE CORRIDAS.",
  "MAS... ACHO QUE POSSO TE AJUDAR UM POUCO.",
  "NO COMEÇO É SIMPLES.",
  "É SÓ SEGUIR EM FRENTE E APERTAR ESPAÇO.",
  "SEM PRESSA.",
  "SÓ MANTÉM O RITMO.",
  "NO FINAL DA CORRIDA...",
  "VOCÊ VAI PRECISAR ALTERNAR ENTRE 'A' E 'D'.",
  "ESQUERDA... DIREITA...",
  "ESQUERDA... DIREITA...",
  "VAI PARECER UM POUCO CAÓTICO.",
  "MAS VOCÊ CONSEGUE.",
  "VENÇA AS TRÊS CORRIDAS.",
  "UMA DE CADA VEZ.",
  "QUANDO ESTIVER PRONTO...",
  "RESPIRA FUNDO.",
  "E VAI.",
  "PS: SEI QUE NÃO TEM NADA COMIGO ESSA PROVA, MAS O LUCAS FICOU SEM IDEIAS"
];

const NARRATOR_HOOKSHOT_DIALOGUES_ZELDA = [
  "SAUDAÇÕES, HERÓI.",
  "SINTO UMA GRANDE CORAGEM EM SEU CORAÇÃO.",
  "LOGO ADIANTE EXISTE UMA MASMORRA ANTIGA.",
  "SUAS SALAS ESTÃO CHEIAS DE ARMADILHAS... E CRIATURAS SOMBRIAS.",
  "DIZEM QUE UMA PRINCESA ESTÁ PRESA LÁ DENTRO.",
  "SEU DESTINO PARECE SER ENCONTRÁ-LA.",
  "MAS APRESSE-SE...",
  "OS MONSTROS DAQUELE LUGAR ESTÃO PERDENDO A PACIÊNCIA.",
  "E NÃO CREIO QUE ELA CONSIGA ESPERAR POR MUITO MAIS TEMPO.",
  "EU?",
  "NÃO... NÃO SERÁ A MIM QUE VOCÊ SALVARÁ.",
  "A PRINCESA QUE AGUARDA POR VOCÊ...",
  "É OUTRA.",
  "SERA A PRINCESA MTT"
];

const NARRATOR_HOOKSHOT_DIALOGUES_MTT = [
  "AI MEU DEUS! O QUE SERÁ DE MIM!",
  "UM HERÓI FINALMENTE CHEGOU!",
  "OH! QUE MONSTROS IMPIEDOSOS HABITAM ESTE LUGAR TERRÍVEL!",
  "EU ESTAVA AQUI... SOFRENDO... ESPERANDO SER RESGATADO...",
  "MAS TAMBÉM... SENDO ABSOLUTAMENTE FABULOSO!",
  "VENHA, HERÓI!",
  "DERROTE TODOS OS MONSTROS DESTA MASMORRA!",
  "MOSTRE SUA CORAGEM!",
  "MOSTRE SEU ESTILO!",
  "E ACIMA DE TUDO...",
  "MOSTRE SEU BRILHO!",
  "OH YES!",
  "O ESPETÁCULO VAI COMEÇAR!"
];

const INTRO_SEEN_KEY = 'birthday_intro_seen_v1';

function buildInitialScoreState() {
  const games = {};

  Object.keys(GAME_SCORE_CONFIG).forEach(gameId => {
    games[gameId] = {
      bestScore: 0,
      maxScore: GAME_SCORE_CONFIG[gameId].maxScore,
      updatedAt: null
    };
  });

  return {
    version: 1,
    games
  };
}

function clampScore(gameId, score) {
  const maxScore = GAME_SCORE_CONFIG[gameId]?.maxScore ?? 0;
  return Math.max(0, Math.min(maxScore, Math.floor(score)));
}

function getScoreState() {
  const fallback = buildInitialScoreState();

  try {
    const raw = localStorage.getItem(SCORE_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;

    const merged = buildInitialScoreState();
    const parsedGames = parsed.games && typeof parsed.games === 'object' ? parsed.games : {};

    Object.keys(merged.games).forEach(gameId => {
      const incoming = parsedGames[gameId] || {};
      const incomingBest = Number.isFinite(incoming.bestScore) ? incoming.bestScore : 0;

      merged.games[gameId].bestScore = clampScore(gameId, incomingBest);
      merged.games[gameId].updatedAt = typeof incoming.updatedAt === 'string' ? incoming.updatedAt : null;
    });

    return merged;
  } catch {
    return fallback;
  }
}

function saveScoreState(scoreState) {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scoreState));
  } catch {}
}

function clearHookshotCheckpoint() {
  try {
    localStorage.removeItem(HOOKSHOT_CHECKPOINT_STORAGE_KEY);
  } catch {}
}

function buildHookshotCheckpoint(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const roomCount = Number.isFinite(payload.totalLevels) ? Math.floor(payload.totalLevels) : 6;
  const roomIndex = Number.isFinite(payload.roomIndex) ? Math.floor(payload.roomIndex) : NaN;
  if (!Number.isFinite(roomIndex) || roomIndex < 0 || roomIndex >= roomCount) return null;

  const lives = Number.isFinite(payload.lives) ? Math.floor(payload.lives) : NaN;
  if (!Number.isFinite(lives) || lives < 1 || lives > 3) return null;

  const sourceDeaths = Array.isArray(payload.roomDeaths) ? payload.roomDeaths : [];
  const sourceTimes = Array.isArray(payload.roomClearTimes) ? payload.roomClearTimes : [];
  const sourceCleared = Array.isArray(payload.roomCleared) ? payload.roomCleared : [];

  const roomDeaths = Array(roomCount).fill(0).map((_, i) => {
    const value = sourceDeaths[i];
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
  });

  const roomClearTimes = Array(roomCount).fill(0).map((_, i) => {
    const value = sourceTimes[i];
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
  });

  const roomCleared = Array(roomCount).fill(false).map((_, i) => Boolean(sourceCleared[i]));

  for (let i = 0; i < roomIndex; i++) {
    roomCleared[i] = true;
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    roomIndex,
    totalLevels: roomCount,
    lives,
    totalRunTime: Number.isFinite(payload.totalRunTime) ? Math.max(0, payload.totalRunTime) : 0,
    roomDeaths,
    roomClearTimes,
    roomCleared
  };
}

function loadHookshotCheckpoint() {
  try {
    const raw = localStorage.getItem(HOOKSHOT_CHECKPOINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalized = buildHookshotCheckpoint(parsed);
    if (!normalized) {
      clearHookshotCheckpoint();
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function saveHookshotCheckpointFromProgress(progress, completedLevel) {
  if (!progress || typeof progress !== 'object') return;
  if (!Number.isFinite(completedLevel) || completedLevel <= 0) return;

  const snapshot = progress.campaignSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return;

  const roomCount = Number.isFinite(snapshot.totalLevels) ? Math.floor(snapshot.totalLevels) : progress.totalLevels;
  if (!Number.isFinite(roomCount) || roomCount <= 0) return;

  const nextRoomIndex = Math.min(Math.floor(completedLevel), roomCount - 1);
  if (nextRoomIndex <= 0 || nextRoomIndex >= roomCount) return;

  const payload = buildHookshotCheckpoint({
    roomIndex: nextRoomIndex,
    totalLevels: roomCount,
    lives: snapshot.lives,
    totalRunTime: snapshot.totalRunTime,
    roomDeaths: snapshot.roomDeaths,
    roomClearTimes: snapshot.roomClearTimes,
    roomCleared: snapshot.roomCleared
  });

  if (!payload) return;

  try {
    localStorage.setItem(HOOKSHOT_CHECKPOINT_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

function saveBestScore(gameId, rawScore) {
  if (!GAME_SCORE_CONFIG[gameId]) return 0;

  const scoreState = getScoreState();
  const nextScore = clampScore(gameId, rawScore);

  if (!scoreState.games[gameId]) {
    scoreState.games[gameId] = {
      bestScore: 0,
      maxScore: GAME_SCORE_CONFIG[gameId].maxScore,
      updatedAt: null
    };
  }

  const currentBest = scoreState.games[gameId].bestScore || 0;
  if (nextScore > currentBest) {
    scoreState.games[gameId].bestScore = nextScore;
    scoreState.games[gameId].updatedAt = new Date().toISOString();
    saveScoreState(scoreState);
    return nextScore;
  }

  return currentBest;
}

function getGlobalBestScore() {
  const scoreState = getScoreState();
  return Object.keys(scoreState.games).reduce((sum, gameId) => {
    return sum + (scoreState.games[gameId].bestScore || 0);
  }, 0);
}

function renderGlobalScore() {
  const totalEl = document.getElementById('global-score-total');
  const total = getGlobalBestScore();
  if (totalEl) totalEl.textContent = String(total).padStart(6, '0');

  // Mantem o indicador de desbloqueio da fase secreta sempre atualizado.
  setupCategoryAvailability();
}

function renderBestScoresByGame() {
  const scoreState = getScoreState();

  Object.keys(GAME_SCORE_CONFIG).forEach(gameId => {
    const bestEl = document.getElementById(`best-score-${gameId}`);
    if (!bestEl) return;

    const bestScore = scoreState.games[gameId]?.bestScore || 0;
    bestEl.textContent = String(bestScore).padStart(6, '0');
  });
}

// Áudios
const narratorAudio = new Audio('sons/fala_narrador.mp3');
narratorAudio.loop = false;

// Áudio específico do narrador de instruções do jogo
const narratorGameAudio = new Audio('sons/fala_narrador2.mp3');
narratorGameAudio.loop = false;

const narratorKartAudio = new Audio('sons/madeline.mp3');
narratorKartAudio.loop = false;

const narratorHookshotZeldaAudio = new Audio('sons/princesa_falando.mp3');
narratorHookshotZeldaAudio.loop = false;
narratorHookshotZeldaAudio.preload = 'auto';

const narratorHookshotLandingSfx = new Audio('sons/dano.mp3');
narratorHookshotLandingSfx.loop = false;
narratorHookshotLandingSfx.preload = 'auto';

const narratorHookshotOhYesAudio = new Audio('sons/Mettaton Oh yes !!! - Alexis (Alexis) (youtube).mp3');
narratorHookshotOhYesAudio.loop = false;
narratorHookshotOhYesAudio.preload = 'auto';

const applauseAudio = new Audio('sons/palmas.mp3');
applauseAudio.loop = false;

const suspenseAudio = new Audio('sons/som_suspense.mp3');
suspenseAudio.loop = false;

const menuMusic = new Audio('sons/Boring ahhh, Generic music - Hiachi.mp3 (youtube).mp3');
menuMusic.loop = true;

const quizMusic = new Audio('sons/quiz.mp3');
quizMusic.loop = true;

const kartMusic = new Audio('sons/kart.mp3');
kartMusic.loop = true;
kartMusic.volume = 0.1;

const correctSfx = new Audio('sons/acerto.mp3');
correctSfx.loop = false;
correctSfx.preload = 'auto';

const wrongSfx = new Audio('sons/dano.mp3');
wrongSfx.loop = false;
wrongSfx.preload = 'auto';

let answerSfxTimeout = null;
let activeAnswerSfx = null;

let narratorTimer = null;
let narratorIndex = 0;
let narratorDialogueIndex = 0;
let narratorFinishedCurrent = false;

let narratorGameTimer = null;
let narratorGameIndex = 0;
let narratorGameDialogueIndex = 0;
let narratorGameFinishedCurrent = false;
let narratorGameSpecialTimeout = null;
let narratorGameSpecialPending = false;
let narratorGameSpecialInProgress = false;

let narratorKartTimer = null;
let narratorKartIndex = 0;
let narratorKartDialogueIndex = 0;
let narratorKartFinishedCurrent = false;

let narratorHookshotTimer = null;
let narratorHookshotIndex = 0;
let narratorHookshotDialogueIndex = 0;
let narratorHookshotFinishedCurrent = false;
let narratorHookshotPhase = 'zelda';
let narratorHookshotTransitioning = false;
let narratorHookshotDropTimeout = null;
let narratorHookshotMttRevealed = false;
let narratorHookshotFinaleTimeout = null;
let narratorHookshotFinaleActive = false;
let narratorFadeInterval = null;

const HOOKSHOT_MTT_REVEAL_DIALOGUE_INDEX = 12;

const KART_SPRITE_BLOCK_PATTERN = [2, 3];

function getKartNarratorSpriteByDialogueIndex(index) {
  let remaining = index;
  let patternIdx = 0;
  let useSecondSprite = false;

  while (remaining >= KART_SPRITE_BLOCK_PATTERN[patternIdx]) {
    remaining -= KART_SPRITE_BLOCK_PATTERN[patternIdx];
    useSecondSprite = !useSecondSprite;
    patternIdx = (patternIdx + 1) % KART_SPRITE_BLOCK_PATTERN.length;
  }

  return useSecondSprite ? './sprt/madeline2.png' : './sprt/madeline1.png';
}

function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroAsSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {}
}

function resetNarratorVisual() {
  const narrator = document.getElementById('narrator-img');
  if (!narrator) return;

  narrator.src = './sprt/tenma_falando1.png';
  narrator.style.width = '250px';
}

function startIntroSequence() {
  stopMenuMusic();
  narratorDialogueIndex = 0;
  narratorFinishedCurrent = false;
  resetNarratorVisual();
  show('narrator-screen');
  startNarratorTyping();
}

function resetGameNarratorVisual() {
  clearTimeout(narratorGameSpecialTimeout);
  narratorGameSpecialTimeout = null;
  narratorGameSpecialPending = false;
  narratorGameSpecialInProgress = false;

  const narratorGameImg = document.getElementById('narrator-game-img');
  if (narratorGameImg) {
    narratorGameImg.src = './sprt/mtt_falando.gif';
    narratorGameImg.style.width = '250px';
  }

  const narratorGameBox = document.querySelector('#narrator-game-screen .narrator-box');
  if (narratorGameBox) {
    narratorGameBox.style.display = '';
  }

  stopApplauseAudio();
}

function updateKartNarratorVisual() {
  const narratorKartImg = document.getElementById('narrator-kart-img');
  if (!narratorKartImg) return;

  narratorKartImg.src = getKartNarratorSpriteByDialogueIndex(narratorKartDialogueIndex);

  narratorKartImg.style.width = '290px';
}

function resetKartNarratorVisual() {
  clearInterval(narratorKartTimer);
  narratorKartTimer = null;
  narratorKartIndex = 0;
  narratorKartDialogueIndex = 0;
  narratorKartFinishedCurrent = false;

  const narratorKartText = document.getElementById('narrator-kart-text');
  if (narratorKartText) {
    narratorKartText.innerHTML = '';
  }

  updateKartNarratorVisual();
}

function clearHookshotNarratorTimers() {
  clearInterval(narratorHookshotTimer);
  narratorHookshotTimer = null;

  clearTimeout(narratorHookshotDropTimeout);
  narratorHookshotDropTimeout = null;

  clearTimeout(narratorHookshotFinaleTimeout);
  narratorHookshotFinaleTimeout = null;
}

function setHookshotNarratorSpeaker(phase = null) {
  const zeldaImg = document.getElementById('narrator-hookshot-zelda-img');
  const mttImg = document.getElementById('narrator-hookshot-mtt-img');

  if (zeldaImg) zeldaImg.classList.remove('speaking');
  if (mttImg) mttImg.classList.remove('speaking');

  if (phase === 'zelda' && zeldaImg) {
    zeldaImg.classList.add('speaking');
  }

  if (phase === 'mtt' && mttImg) {
    mttImg.classList.add('speaking');
  }
}

function resetHookshotNarratorVisual() {
  clearHookshotNarratorTimers();

  narratorHookshotIndex = 0;
  narratorHookshotDialogueIndex = 0;
  narratorHookshotFinishedCurrent = false;
  narratorHookshotPhase = 'zelda';
  narratorHookshotTransitioning = false;
  narratorHookshotMttRevealed = false;
  narratorHookshotFinaleActive = false;

  const textEl = document.getElementById('narrator-hookshot-text');
  if (textEl) {
    textEl.innerHTML = '';
  }

  const zeldaImg = document.getElementById('narrator-hookshot-zelda-img');
  if (zeldaImg) {
    zeldaImg.classList.remove('step-aside');
  }

  const mttImg = document.getElementById('narrator-hookshot-mtt-img');
  if (mttImg) {
    mttImg.classList.remove('drop-in');
  }

  const hookshotNarratorScreen = document.getElementById('narrator-hookshot-screen');
  if (hookshotNarratorScreen) {
    hookshotNarratorScreen.classList.remove('finale-active');
  }

  setHookshotNarratorSpeaker(null);

  narratorHookshotZeldaAudio.pause();
  narratorHookshotZeldaAudio.currentTime = 0;

  narratorHookshotOhYesAudio.pause();
  narratorHookshotOhYesAudio.currentTime = 0;
}

function startHookshotNarratorTyping() {
  const el = document.getElementById('narrator-hookshot-text');
  if (!el) return;

  const lines = narratorHookshotPhase === 'zelda'
    ? NARRATOR_HOOKSHOT_DIALOGUES_ZELDA
    : NARRATOR_HOOKSHOT_DIALOGUES_MTT;
  const text = lines[narratorHookshotDialogueIndex] || '';

  clearHookshotNarratorTimers();
  narratorHookshotIndex = 0;
  narratorHookshotFinishedCurrent = false;
  el.innerHTML = '';

  pauseNarratorAudio();
  setHookshotNarratorSpeaker(narratorHookshotPhase);

  if (narratorHookshotPhase === 'mtt') {
    narratorGameAudio.currentTime = 0;
    narratorGameAudio.play().catch(() => {});
  } else {
    narratorHookshotZeldaAudio.currentTime = 0;
    narratorHookshotZeldaAudio.play().catch(() => {});
  }

  narratorHookshotTimer = setInterval(() => {
    narratorHookshotIndex++;
    const slice = text.slice(0, narratorHookshotIndex);
    el.innerHTML = slice.replace(/\n/g, '<br>');

    if (narratorHookshotIndex >= text.length) {
      clearInterval(narratorHookshotTimer);
      narratorHookshotTimer = null;
      narratorHookshotFinishedCurrent = true;
      fadeOutNarratorAudio(500);
    }
  }, 35);
}

function startHookshotNarratorSequence() {
  stopMenuMusic();
  show('narrator-hookshot-screen');
  resetHookshotNarratorVisual();
  startHookshotNarratorTyping();
}

function playHookshotLandingSfx() {
  const sfx = narratorHookshotLandingSfx.cloneNode();
  const startAt = 0.75;
  const endAt = 1.5;
  const durationMs = (endAt - startAt) * 1000;

  sfx.currentTime = startAt;
  sfx.play().catch(() => {});

  setTimeout(() => {
    sfx.pause();
    sfx.currentTime = 0;
  }, durationMs);
}

function transitionToHookshotMttNarrator(onRevealComplete) {
  if (narratorHookshotTransitioning) return;

  narratorHookshotTransitioning = true;
  narratorHookshotFinishedCurrent = false;
  setHookshotNarratorSpeaker(null);

  const zeldaImg = document.getElementById('narrator-hookshot-zelda-img');
  if (zeldaImg) {
    zeldaImg.classList.add('step-aside');
  }

  const mttImg = document.getElementById('narrator-hookshot-mtt-img');
  if (mttImg) {
    mttImg.classList.remove('drop-in');
    void mttImg.offsetWidth;
    mttImg.classList.add('drop-in');
  }

  clearTimeout(narratorHookshotDropTimeout);
  narratorHookshotDropTimeout = setTimeout(() => {
    narratorHookshotDropTimeout = null;
    narratorHookshotTransitioning = false;
    narratorHookshotMttRevealed = true;
    playHookshotLandingSfx();

    if (typeof onRevealComplete === 'function') {
      onRevealComplete();
    }
  }, 1200);
}

function triggerGameNarratorSpecialScene() {
  if (!narratorGameSpecialPending || narratorGameSpecialInProgress) return;

  narratorGameSpecialPending = false;
  narratorGameSpecialInProgress = true;
  narratorGameFinishedCurrent = false;

  const narratorGameImg = document.getElementById('narrator-game-img');
  const narratorGameBox = document.querySelector('#narrator-game-screen .narrator-box');

  if (narratorGameImg) {
    narratorGameImg.src = './sprt/mtt_clapping.gif';
  }

  if (narratorGameBox) {
    narratorGameBox.style.display = 'none';
  }

  stopApplauseAudio();
  applauseAudio.loop = true;
  applauseAudio.currentTime = 0;
  applauseAudio.play().catch(() => {});

  narratorGameSpecialTimeout = setTimeout(() => {
    narratorGameSpecialTimeout = null;

    stopApplauseAudio();

    if (narratorGameImg) {
      narratorGameImg.src = './sprt/mtt_falando.gif';
      narratorGameImg.style.width = '250px';
    }

    if (narratorGameBox) {
      narratorGameBox.style.display = '';
    }

    narratorGameSpecialInProgress = false;

    if (narratorGameDialogueIndex < NARRATOR_GAME_DIALOGUES.length - 1) {
      narratorGameDialogueIndex++;
      startGameNarratorTyping();
    } else {
      narratorGameFinishedCurrent = true;
    }
  }, 6000);
}

function stopApplauseAudio() {
  applauseAudio.pause();
  applauseAudio.currentTime = 0;
  applauseAudio.loop = false;
  applauseAudio.onended = null;
}

function resetNarratorVolumes() {
  narratorAudio.volume = 1;
  narratorGameAudio.volume = 1;
  narratorKartAudio.volume = 1;
  narratorHookshotZeldaAudio.volume = 1;
  narratorHookshotOhYesAudio.volume = 1;
}

function cancelNarratorFade() {
  if (narratorFadeInterval) {
    clearInterval(narratorFadeInterval);
    narratorFadeInterval = null;
  }
  resetNarratorVolumes();
}

function pauseNarratorAudio() {
  cancelNarratorFade();
  narratorAudio.pause();
  narratorGameAudio.pause();
  narratorKartAudio.pause();
  narratorHookshotZeldaAudio.pause();
  narratorHookshotOhYesAudio.pause();
}

function fadeOutNarratorAudio(duration = 500) {
  cancelNarratorFade();
  const startTime = Date.now();
  const startVolume = 1;

  narratorFadeInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const volume = startVolume * (1 - progress);
    
    narratorAudio.volume = volume;
    narratorGameAudio.volume = volume;
    narratorKartAudio.volume = volume;
    narratorHookshotZeldaAudio.volume = volume;
    narratorHookshotOhYesAudio.volume = volume;

    if (progress >= 1) {
      clearInterval(narratorFadeInterval);
      narratorFadeInterval = null;
      pauseNarratorAudio();
    }
  }, 16);
}

function stopNarratorAudio() {
  cancelNarratorFade();
  document.querySelectorAll('.narrator-avatar').forEach(avatar => {
    avatar.classList.remove('shaking');
  });

  setHookshotNarratorSpeaker(null);

  narratorAudio.pause();
  narratorAudio.currentTime = 0;

  narratorGameAudio.pause();
  narratorGameAudio.currentTime = 0;

  narratorKartAudio.pause();
  narratorKartAudio.currentTime = 0;

  narratorHookshotZeldaAudio.pause();
  narratorHookshotZeldaAudio.currentTime = 0;

  narratorHookshotOhYesAudio.pause();
  narratorHookshotOhYesAudio.currentTime = 0;
}

function runHookshotMttFinaleAndStartGame() {
  if (narratorHookshotFinaleActive) return;

  narratorHookshotFinaleActive = true;
  setHookshotNarratorSpeaker(null);
  stopNarratorAudio();

  const hookshotNarratorScreen = document.getElementById('narrator-hookshot-screen');
  if (hookshotNarratorScreen) {
    hookshotNarratorScreen.classList.add('finale-active');
  }

  const finish = () => {
    if (!narratorHookshotFinaleActive) return;
    narratorHookshotFinaleActive = false;
    resetHookshotNarratorVisual();
    startHookshotCampaign();
  };

  narratorHookshotOhYesAudio.currentTime = 0;
  narratorHookshotOhYesAudio.onended = () => {
    narratorHookshotOhYesAudio.onended = null;
    finish();
  };

  narratorHookshotOhYesAudio.play().catch(() => {
    narratorHookshotFinaleTimeout = setTimeout(() => {
      narratorHookshotFinaleTimeout = null;
      finish();
    }, 2000);
  });
}

function stopMenuMusic() {
  menuMusic.pause();
  menuMusic.currentTime = 0;
}

function playMenuMusic() {
  menuMusic.currentTime = 0;
  menuMusic.play().catch(() => {});
}

function stopQuizMusic() {
  quizMusic.pause();
  quizMusic.currentTime = 0;
}

function stopKartMusic() {
  kartMusic.pause();
  kartMusic.currentTime = 0;
}

function playKartMusic() {
  stopMenuMusic();
  stopQuizMusic();
  kartMusic.currentTime = 0;
  kartMusic.play().catch(() => {});
}

function playQuizMusic() {
  stopMenuMusic();
  quizMusic.currentTime = 0;
  quizMusic.play().catch(() => {});
}

function playAnswerSfxForOneSecond(audio, clip = {}) {
  clearTimeout(answerSfxTimeout);

  if (activeAnswerSfx) {
    activeAnswerSfx.pause();
    activeAnswerSfx.currentTime = 0;
    activeAnswerSfx = null;
  }

  const startAt = clip.startAt ?? 0;
  const endAt = clip.endAt ?? (startAt + 1);
  const durationMs = Math.max(50, (endAt - startAt) * 1000);

  const sfx = audio.cloneNode();
  sfx.currentTime = startAt;
  activeAnswerSfx = sfx;
  sfx.play().catch(() => {});

  answerSfxTimeout = setTimeout(() => {
    if (activeAnswerSfx === sfx) {
      sfx.pause();
      sfx.currentTime = 0;
      activeAnswerSfx = null;
    }
  }, durationMs);
}

function startNarratorTyping() {
  const el = document.getElementById('narrator-text');
  if (!el) return;

  const text = NARRATOR_DIALOGUES[narratorDialogueIndex] || '';

  // Reinicia estado de texto e áudio
  clearInterval(narratorTimer);
  narratorIndex = 0;
  narratorFinishedCurrent = false;
  el.innerHTML = '';

  pauseNarratorAudio();
  narratorAudio.currentTime = 0;

  const avatar = document.querySelector('.narrator-avatar');
  if (avatar) avatar.classList.add('shaking');

  narratorAudio.play().catch(() => {});

  narratorTimer = setInterval(() => {
    narratorIndex++;
    const slice = text.slice(0, narratorIndex);
    el.innerHTML = slice.replace(/\n/g, '<br>');

    if (narratorIndex >= text.length) {
      clearInterval(narratorTimer);
      narratorFinishedCurrent = true;
      fadeOutNarratorAudio(500);
    }
  }, 35); // velocidade do texto (ms por caractere)
}

function startGameNarratorTyping() {
  const el = document.getElementById('narrator-game-text');
  if (!el) return;

  const text = NARRATOR_GAME_DIALOGUES[narratorGameDialogueIndex] || '';

  clearInterval(narratorGameTimer);
  clearTimeout(narratorGameSpecialTimeout);
  narratorGameSpecialTimeout = null;
  narratorGameSpecialPending = false;
  narratorGameSpecialInProgress = false;
  narratorGameIndex = 0;
  narratorGameFinishedCurrent = false;
  el.innerHTML = '';

  stopApplauseAudio();
  pauseNarratorAudio();
  narratorGameAudio.currentTime = 0;

  const avatar = document.querySelector('#narrator-game-screen .narrator-avatar');
  if (avatar) avatar.classList.add('shaking');

  narratorGameAudio.play().catch(() => {});

  narratorGameTimer = setInterval(() => {
    narratorGameIndex++;
    const slice = text.slice(0, narratorGameIndex);
    el.innerHTML = slice.replace(/\n/g, '<br>');

    if (narratorGameIndex >= text.length) {
      clearInterval(narratorGameTimer);
      fadeOutNarratorAudio(500);

      if (narratorGameDialogueIndex !== 2) {
        narratorGameFinishedCurrent = true;
        return;
      }

      narratorGameSpecialPending = true;
      narratorGameFinishedCurrent = true;
    }
  }, 35);
}

function startKartNarratorTyping() {
  const el = document.getElementById('narrator-kart-text');
  if (!el) return;

  const text = NARRATOR_KART_DIALOGUES[narratorKartDialogueIndex] || '';

  clearInterval(narratorKartTimer);
  narratorKartIndex = 0;
  narratorKartFinishedCurrent = false;
  el.innerHTML = '';

  pauseNarratorAudio();
  narratorKartAudio.currentTime = 0;
  updateKartNarratorVisual();

  const avatar = document.querySelector('#narrator-kart-screen .narrator-avatar');
  if (avatar) avatar.classList.add('shaking');

  narratorKartAudio.play().catch(() => {});

  narratorKartTimer = setInterval(() => {
    narratorKartIndex++;
    const slice = text.slice(0, narratorKartIndex);
    el.innerHTML = slice.replace(/\n/g, '<br>');

    if (narratorKartIndex >= text.length) {
      clearInterval(narratorKartTimer);
      narratorKartTimer = null;
      narratorKartFinishedCurrent = true;
      fadeOutNarratorAudio(500);
    }
  }, 35);
}

function isQuizCategory(cat) {
  return Boolean(DB[cat]);
}

function hasCategoryRoute(cat) {
  return Boolean(SPECIAL_CATEGORY_ROUTES[cat]);
}

function isSecretUnlocked() {
  return getGlobalBestScore() >= SECRET_UNLOCK_THRESHOLD;
}

function isAvailableCategory(cat) {
  if (cat === 'secreto') return isSecretUnlocked();
  return isQuizCategory(cat) || cat === 'kart' || cat === 'hookshot' || hasCategoryRoute(cat);
}

function setHookshotActionButtons({ showNext, showRestart }) {
  const nextBtn = document.getElementById('hookshot-next-btn');
  const restartBtn = document.getElementById('hookshot-restart-btn');
  if (nextBtn) nextBtn.style.display = showNext ? '' : 'none';
  if (restartBtn) restartBtn.style.display = showRestart ? '' : 'none';
}

function setHookshotUi(room, totalRooms, statusText, hintText) {
  const roomEl = document.getElementById('hookshot-room-label');
  const statusEl = document.getElementById('hookshot-status-text');
  const hintEl = document.getElementById('hookshot-action-hint');

  if (roomEl) roomEl.textContent = `SALA ${room} / ${totalRooms}`;
  if (statusEl) statusEl.textContent = statusText;
  if (hintEl) hintEl.textContent = hintText;
}

function ensureHookshotMounted() {
  if (hookshotMounted) return true;
  if (!window.HookshotGame) return false;

  const canvas = document.getElementById('hookshot-canvas');
  const flashEl = document.getElementById('hookshot-flash');
  if (!canvas) return false;

  window.HookshotGame.mount({
    canvas,
    flashEl,
    onCampaignWon: () => {
      if (window.HookshotGame) window.HookshotGame.stop();
      show('start-screen');
      playMenuMusic();
    },
    onLevelEnd: result => {
      if (result.canAdvance) {
        if (result.level % HOOKSHOT_CHECKPOINT_INTERVAL === 0 && result.level < result.totalLevels) {
          const progress = window.HookshotGame ? window.HookshotGame.getProgress() : null;
          saveHookshotCheckpointFromProgress(progress, result.level);
        }

        setHookshotUi(
          result.level,
          result.totalLevels,
          'SALA CONCLUIDA! AVANCE',
          `PONTOS PARCIAIS: ${String(result.partialScore).padStart(4, '0')}`
        );
        setHookshotActionButtons({ showNext: true, showRestart: true });
        return;
      }

      if (result.campaignEnded) {
        clearHookshotCheckpoint();
        saveBestScore('musica', result.finalScore);
        renderGlobalScore();
        renderBestScoresByGame();

        setHookshotUi(
          result.level,
          result.totalLevels,
          result.wonCampaign ? 'CAMPANHA COMPLETA' : 'CAMPANHA ENCERRADA',
          `SCORE FINAL: ${String(result.finalScore).padStart(4, '0')} / 3000`
        );
        setHookshotActionButtons({ showNext: false, showRestart: true });
      }
    }
  });

  hookshotMounted = true;
  return true;
}

function startHookshotCampaign(options = {}) {
  if (!ensureHookshotMounted()) return;

  const forceNewRun = Boolean(options.forceNewRun);
  const checkpoint = forceNewRun ? null : loadHookshotCheckpoint();
  const startRoom = checkpoint ? checkpoint.roomIndex + 1 : 1;
  const startHint = checkpoint
    ? `CHECKPOINT SALA ${startRoom} | MOUSE: MIRAR | CLIQUE: GANCHO | WASD: MOVER`
    : 'MOUSE: MIRAR | CLIQUE: GANCHO | WASD: MOVER';

  resetHookshotNarratorVisual();
  stopMenuMusic();
  stopQuizMusic();
  show('hookshot-screen');
  setHookshotUi(startRoom, 6, 'ESCAPE DAS SALAS', startHint);
  setHookshotActionButtons({ showNext: false, showRestart: false });
  if (checkpoint) {
    window.HookshotGame.startCampaign({ fromCheckpoint: checkpoint });
    return;
  }

  window.HookshotGame.startCampaign();
}

function setKartActionButtons({ showNext, showRestart }) {
  const nextBtn = document.getElementById('kart-next-btn');
  const restartBtn = document.getElementById('kart-restart-btn');
  if (nextBtn) nextBtn.style.display = showNext ? '' : 'none';
  if (restartBtn) restartBtn.style.display = showRestart ? '' : 'none';
}

function setKartUi(level, totalLevels, statusText, hintText) {
  const levelEl = document.getElementById('kart-level-label');
  const statusEl = document.getElementById('kart-status-text');
  const hintEl = document.getElementById('kart-action-hint');

  if (levelEl) levelEl.textContent = `NIVEL ${level} / ${totalLevels}`;
  if (statusEl) statusEl.textContent = statusText;
  if (hintEl) hintEl.textContent = hintText;
}

function getKartHintByLevel(level) {
  if (level >= 3) return 'A e D alternados para acelerar';
  return 'SPACE ou TOQUE para acelerar';
}

function ensureKartMounted() {
  if (kartMounted) return true;
  if (!window.KartGame) return false;

  const canvas = document.getElementById('kart-canvas');
  if (!canvas) return false;

  window.KartGame.mount({
    canvas,
    onLevelEnd: result => {
      if (result.canAdvance) {
        setKartUi(
          result.level,
          result.totalLevels,
          'VITORIA! AVANCE AO PROXIMO NIVEL',
          'Clique em PROXIMO NIVEL para continuar'
        );
        setKartActionButtons({ showNext: true, showRestart: true });
        return;
      }

      if (result.campaignEnded) {
        saveBestScore('kart', result.finalScore);
        renderGlobalScore();
        renderBestScoresByGame();
        stopKartMusic();

        setKartUi(
          result.level,
          result.totalLevels,
          result.wonCampaign ? 'CAMPANHA COMPLETA! 1000 PONTOS' : 'CAMPANHA ENCERRADA',
          result.wonCampaign ? 'Parabens! Voce venceu os 3 niveis' : 'Voce precisa vencer os 3 niveis para marcar 1000'
        );
        setKartActionButtons({ showNext: false, showRestart: true });
      }
    }
  });

  kartMounted = true;
  return true;
}

function startKartCampaign() {
  if (!ensureKartMounted()) return;

  playKartMusic();
  show('kart-screen');
  setKartUi(1, 3, 'CORRIDA INICIADA', getKartHintByLevel(1));
  setKartActionButtons({ showNext: false, showRestart: false });
  window.KartGame.startCampaign();
}

function ensureSecretMounted() {
  if (secretMounted) return true;
  if (!window.SecretGame) return false;

  const canvas = document.getElementById('secret-canvas');
  if (!canvas) return false;

  window.SecretGame.mount({
    canvas,
    onEnd: result => {
      saveBestScore('secreto', result?.finalScore ?? 0);
      renderGlobalScore();
      renderBestScoresByGame();
    },
    onSceneChange: (sceneName) => {
      const hints = {
        glitchIntro: ['FASE SECRETA',    'INICIALIZANDO...',         'Aguarde...'],
        corridor:    ['FASE SECRETA',    'CORREDOR DAS MEMORIAS',    'WASD: MOVER | ESPACO: ACAO'],
        puzzle:      ['DESAFIO 1 / 4',   'PUZZLE DA RELIQUIA',       'WASD: MOVER | R: RESETAR'],
        dodge:       ['DESAFIO 2 / 4',   'ARENA DE ESQUIVA',         'SETAS: MOVER'],
        shooter:     ['DESAFIO 3 / 4',   'ARENA DE TIRO',            'MOUSE: MIRAR | CLIQUE: ATIRAR'],
        platform:    ['DESAFIO 4 / 4',   'PLATAFORMA DA JORNADA',    'SETAS: MOVER | ESPACO: PULAR'],
        memoryPath:  ['FASE FINAL',      'CAMINHO DAS MEMORIAS',     'SETAS: CAMINHAR'],
      };
      const h = hints[sceneName] ?? ['FASE SECRETA', '...', '...'];
      setSecretUi(h[0], h[1], h[2]);
    },
  });

  secretMounted = true;
  return true;
}

function setSecretUi(phaseLabel, statusText, hintText) {
  const phaseEl  = document.getElementById('secret-phase-label');
  const statusEl = document.getElementById('secret-status-text');
  const hintEl   = document.getElementById('secret-action-hint');
  if (phaseEl)  phaseEl.textContent  = phaseLabel;
  if (statusEl) statusEl.textContent = statusText;
  if (hintEl)   hintEl.textContent   = hintText;
}

function startSecretCampaign() {
  if (!ensureSecretMounted()) return;

  stopMenuMusic();
  stopQuizMusic();
  show('secret-screen');
  setSecretUi('FASE SECRETA', 'MEMÓRIAS CORROMPIDAS', 'Aguarde...');
  window.SecretGame.startCampaign();
}

function setupCategoryAvailability() {
  const totalScore = getGlobalBestScore();
  const secretUnlocked = totalScore >= SECRET_UNLOCK_THRESHOLD;
  const progressScore = Math.min(totalScore, SECRET_UNLOCK_THRESHOLD);
  const remaining = Math.max(0, SECRET_UNLOCK_THRESHOLD - totalScore);

  document.querySelectorAll('#category-list li').forEach(li => {
    const cat = li.dataset.cat;

    if (cat === 'secreto') {
      if (secretUnlocked) {
        li.classList.remove('unavailable');
        li.removeAttribute('aria-disabled');
        li.title = 'Fase secreta desbloqueada';
        li.innerHTML = '☆ FASE SECRETA <span class="tag">SECRET</span>';
      } else {
        li.classList.add('unavailable');
        li.setAttribute('aria-disabled', 'true');
        li.title = `Faltam ${remaining} pontos para desbloquear`;
        li.innerHTML = `☆ FASE SECRETA <span class="tag">${progressScore}/${SECRET_UNLOCK_THRESHOLD}</span>`;
      }
      return;
    }

    if (!isAvailableCategory(cat)) {
      li.classList.add('unavailable');
      li.setAttribute('aria-disabled', 'true');
      li.title = 'Categoria ainda não disponível';
    }
  });
}

setupCategoryAvailability();
renderGlobalScore();
renderBestScoresByGame();

function initializeEntryFlow() {
  if (hasSeenIntro()) {
    show('start-screen');
    playMenuMusic();
    return;
  }

  show('instructions-screen');
}

initializeEntryFlow();
  
  document.querySelectorAll('#category-list li').forEach(li => {
    li.addEventListener('click', () => {
      if (li.classList.contains('unavailable')) return;
      document.querySelectorAll('#category-list li').forEach(l => l.classList.remove('selected'));
      li.classList.add('selected');
      selectedCat = li.dataset.cat;
    });
  });

document.getElementById('start-btn').addEventListener('click', () => {
  if (selectedCat === 'kart') {
    stopMenuMusic();
    show('narrator-kart-screen');
    resetKartNarratorVisual();
    startKartNarratorTyping();
    return;
  }

  if (selectedCat === 'hookshot') {
    startHookshotNarratorSequence();
    return;
  }

  if (selectedCat === 'secreto') {
    if (!isSecretUnlocked()) return;
    startSecretCampaign();
    return;
  }

  const route = SPECIAL_CATEGORY_ROUTES[selectedCat];
  if (route) {
    window.location.href = route;
    return;
  }

  // Normaliza a categoria efetiva do quiz
  const effectiveCat = isQuizCategory(selectedCat) ? selectedCat : 'geral';

  // Para o modo "Descubra o personagem" (geral), mostra o narrador de instruções do jogo
  if (effectiveCat === 'geral') {
    stopMenuMusic();
    show('narrator-game-screen');
    resetGameNarratorVisual();
    narratorGameDialogueIndex = 0;
    startGameNarratorTyping();
    return;
  }

  state = newState(effectiveCat);
  playQuizMusic();
  show('quiz-screen');
  loadQuestion();
});

document.getElementById('kart-next-btn').addEventListener('click', () => {
  if (!window.KartGame) return;

  const progress = window.KartGame.getProgress();
  const nextLevel = Math.min(progress.level + 1, progress.totalLevels);
  setKartUi(nextLevel, progress.totalLevels, 'CORRIDA INICIADA', getKartHintByLevel(nextLevel));
  setKartActionButtons({ showNext: false, showRestart: false });
  window.KartGame.nextLevel();
});

document.getElementById('kart-restart-btn').addEventListener('click', () => {
  startKartCampaign();
});

document.getElementById('kart-menu-btn').addEventListener('click', () => {
  if (window.KartGame) {
    window.KartGame.stop();
  }
  stopKartMusic();
  show('start-screen');
  playMenuMusic();
});

document.getElementById('hookshot-next-btn').addEventListener('click', () => {
  if (!window.HookshotGame) return;

  const progress = window.HookshotGame.getProgress();
  const nextRoom = Math.min(progress.level + 1, progress.totalLevels);
  setHookshotUi(nextRoom, progress.totalLevels, 'SALA EM ANDAMENTO', 'Use o gancho para cruzar os obstaculos');
  setHookshotActionButtons({ showNext: false, showRestart: false });
  window.HookshotGame.nextLevel();
});

document.getElementById('hookshot-restart-btn').addEventListener('click', () => {
  clearHookshotCheckpoint();
  startHookshotCampaign({ forceNewRun: true });
});

document.getElementById('hookshot-menu-btn').addEventListener('click', () => {
  if (window.HookshotGame) {
    window.HookshotGame.stop();
  }
  show('start-screen');
  playMenuMusic();
});

document.getElementById('secret-menu-btn').addEventListener('click', () => {
  if (window.SecretGame) {
    window.SecretGame.stop();
  }
  show('start-screen');
  playMenuMusic();
});

// Tela inicial -> Narrador
document.getElementById('game-btn').addEventListener('click', () => {
  if (hasSeenIntro()) {
    show('start-screen');
    playMenuMusic();
    return;
  }

  startIntroSequence();
});

document.getElementById('replay-intro-btn').addEventListener('click', () => {
  startIntroSequence();
});

// Narrador de instruções do jogo -> Quiz "Descubra o personagem"
document.getElementById('narrator-skip-btn').addEventListener('click', () => {
  stopNarratorAudio();
  stopMenuMusic();
  show('transition-screen');
  markIntroAsSeen();
  suspenseAudio.currentTime = 0;
  suspenseAudio.onended = () => { show('start-screen'); playMenuMusic(); };
  suspenseAudio.play().catch(() => { show('start-screen'); playMenuMusic(); });
});

document.getElementById('narrator-game-skip-btn').addEventListener('click', () => {
  stopNarratorAudio();
  state = newState('geral');
  playQuizMusic();
  show('quiz-screen');
  loadQuestion();
});

document.getElementById('narrator-kart-skip-btn').addEventListener('click', () => {
  stopNarratorAudio();
  resetKartNarratorVisual();
  startKartCampaign();
});

document.getElementById('narrator-hookshot-skip-btn').addEventListener('click', () => {
  if (narratorHookshotFinaleActive) return;
  stopNarratorAudio();
  resetHookshotNarratorVisual();
  startHookshotCampaign();
});

document.getElementById('narrator-game-continue-btn').addEventListener('click', () => {
  if (!narratorGameFinishedCurrent) return;

  if (narratorGameDialogueIndex === 2 && narratorGameSpecialPending) {
    triggerGameNarratorSpecialScene();
    return;
  }

  if (narratorGameDialogueIndex < NARRATOR_GAME_DIALOGUES.length - 1) {
    narratorGameDialogueIndex++;
    startGameNarratorTyping();
    return;
  }

  state = newState('geral');
  playQuizMusic();
  show('quiz-screen');
  loadQuestion();
});

document.getElementById('narrator-kart-continue-btn').addEventListener('click', () => {
  if (!narratorKartFinishedCurrent) return;

  if (narratorKartDialogueIndex < NARRATOR_KART_DIALOGUES.length - 1) {
    narratorKartDialogueIndex++;
    startKartNarratorTyping();
    return;
  }

  resetKartNarratorVisual();
  startKartCampaign();
});

document.getElementById('narrator-hookshot-continue-btn').addEventListener('click', () => {
  if (!narratorHookshotFinishedCurrent || narratorHookshotTransitioning || narratorHookshotFinaleActive) return;

  if (narratorHookshotPhase === 'zelda') {
    if (
      narratorHookshotDialogueIndex === HOOKSHOT_MTT_REVEAL_DIALOGUE_INDEX &&
      !narratorHookshotMttRevealed
    ) {
      transitionToHookshotMttNarrator(() => {
        if (narratorHookshotPhase !== 'zelda') return;

        if (narratorHookshotDialogueIndex < NARRATOR_HOOKSHOT_DIALOGUES_ZELDA.length - 1) {
          narratorHookshotDialogueIndex++;
          startHookshotNarratorTyping();
          return;
        }

        narratorHookshotPhase = 'mtt';
        narratorHookshotDialogueIndex = 0;
        startHookshotNarratorTyping();
      });
      return;
    }

    if (narratorHookshotDialogueIndex < NARRATOR_HOOKSHOT_DIALOGUES_ZELDA.length - 1) {
      narratorHookshotDialogueIndex++;
      startHookshotNarratorTyping();
      return;
    }

    narratorHookshotPhase = 'mtt';
    narratorHookshotDialogueIndex = 0;
    startHookshotNarratorTyping();
    return;
  }

  if (narratorHookshotDialogueIndex < NARRATOR_HOOKSHOT_DIALOGUES_MTT.length - 1) {
    narratorHookshotDialogueIndex++;
    startHookshotNarratorTyping();
    return;
  }

  runHookshotMttFinaleAndStartGame();
});

// Narrador -> Transição / Tela de categorias
document.getElementById('narrator-continue-btn').addEventListener('click', () => {
    var narrator = document.getElementById('narrator-img')
  // Se o texto atual ainda não terminou de ser exibido, não faz nada
  if (!narratorFinishedCurrent) return;


  if (narratorDialogueIndex < NARRATOR_DIALOGUES.length - 1) {
    narratorDialogueIndex++;
    switch (narratorDialogueIndex) {
        case 2:
          narrator.src = "./sprt/tenma_terno.gif";
          narrator.style.width = "400px";
          break;
      
        case 4:
          narrator.src = "./sprt/tenma_falando2.png";
          break;
      
        case 5:
          narrator.src = "./sprt/tenma_falando1.png";
          narrator.width = 250;
          break;
      
        default:
          // nada a fazer
          break;
      }
    startNarratorTyping();
    return;
  }

  // Último diálogo: tela preta + suspense, depois menu
  stopNarratorAudio();
  stopMenuMusic();
  show('transition-screen');
  markIntroAsSeen();

  suspenseAudio.currentTime = 0;
  suspenseAudio.onended = () => {
    show('start-screen');
    playMenuMusic();
  };
  suspenseAudio.play().catch(() => {});
});
  
  
  // ══════════════════════════════════════
  //  QUIZ LOGIC
  // ══════════════════════════════════════
  function loadQuestion() {
    const q = state.qs[state.idx];
    state.answered = false;
    state.timeStart = Date.now();
  
    // HUD
    renderLives();
    document.getElementById('q-counter').textContent = `Q ${state.idx + 1}/${state.qs.length}`;
    document.getElementById('score-display').textContent = state.score;
  
    // Progress
    const pct = (state.idx / state.qs.length) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
  
    // Question
    document.getElementById('question-text').textContent = q.q;
    const questionImage = document.getElementById('question-image');
    if (questionImage) {
      if (q.ft) {
        questionImage.onerror = () => {
          questionImage.style.display = 'none';
        };
        questionImage.src = q.ft;
        questionImage.style.display = 'block';
      } else {
        questionImage.onerror = null;
        questionImage.removeAttribute('src');
        questionImage.style.display = 'none';
      }
    }
  
    // Options
    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    q.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt-btn';
      btn.dataset.key = KEYS[i];
      btn.dataset.idx = i;
      btn.textContent = opt;
      btn.addEventListener('click', () => answer(i));
      grid.appendChild(btn);
    });
  
    // Feedback
    const fb = document.getElementById('feedback');
    fb.textContent = '';
    fb.className = '';
  
    // Timer
    startTimer();
  }
  
  function startTimer() {
    clearInterval(state.timer);
    state.timeLeft = TIME_LIMIT;
    updateTimerBar();
  
    state.timer = setInterval(() => {
      state.timeLeft--;
      updateTimerBar();
      if (state.timeLeft <= 0) {
        clearInterval(state.timer);
        if (!state.answered) timeOut();
      }
    }, 1000);
  }
  
  function updateTimerBar() {
    document.getElementById('timer-bar').style.width  = (state.timeLeft / TIME_LIMIT * 100) + '%';
    document.getElementById('timer-val').textContent  = state.timeLeft;
  }

  function splitImagePath(imagePath) {
    const slashIdx = Math.max(imagePath.lastIndexOf('/'), imagePath.lastIndexOf('\\'));
    const dir = slashIdx >= 0 ? imagePath.slice(0, slashIdx + 1) : '';
    const file = slashIdx >= 0 ? imagePath.slice(slashIdx + 1) : imagePath;
    const dotIdx = file.lastIndexOf('.');

    if (dotIdx <= 0) {
      return { dir, name: file, ext: '' };
    }

    return {
      dir,
      name: file.slice(0, dotIdx),
      ext: file.slice(dotIdx)
    };
  }

  function buildCompleteImageCandidates(imagePath) {
    if (!imagePath) return [];

    const parts = splitImagePath(imagePath);
    const nameVariants = [parts.name, parts.name.replace(/ +/g, '_')];
    const extVariants = [parts.ext, '.webp', '.png', '.jpg', '.jpeg'];
    const seen = new Set();
    const candidates = [];

    nameVariants.forEach(nameVariant => {
      extVariants.forEach(extVariant => {
        if (!extVariant) return;
        const candidate = `${parts.dir}${nameVariant}_completo${extVariant}`;
        if (!seen.has(candidate)) {
          seen.add(candidate);
          candidates.push(candidate);
        }
      });
    });

    return candidates;
  }

  function showCompleteImageForQuestion(question) {
    const questionImage = document.getElementById('question-image');
    if (!questionImage || !question?.ft) return;

    const candidates = buildCompleteImageCandidates(question.ft);
    if (!candidates.length) return;

    let idx = 0;

    const tryNext = () => {
      if (idx >= candidates.length) {
        questionImage.onerror = null;
        questionImage.src = question.ft;
        questionImage.style.display = 'block';
        return;
      }

      const src = candidates[idx++];
      questionImage.onerror = tryNext;
      questionImage.src = src;
      questionImage.style.display = 'block';
    };

    tryNext();
  }
  
  function answer(idx) {
    if (state.answered) return;
    state.answered = true;
    clearInterval(state.timer);
  
    const elapsed = (Date.now() - state.timeStart) / 1000;
    state.totalTime += elapsed;
  
    const q   = state.qs[state.idx];
    const btns = document.querySelectorAll('.opt-btn');
    const fb   = document.getElementById('feedback');
  
    btns.forEach(b => b.disabled = true);
  
    if (idx === q.a) {
      btns[idx].classList.add('correct');
      playAnswerSfxForOneSecond(correctSfx);
      const bonus = Math.ceil(state.timeLeft / TIME_LIMIT * 50);
      const pts = 100 + bonus;
      state.score   += pts;
      state.correct++;
      state.streak++;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
      fb.textContent = `✔ CORRETO! +${pts} PTS`;
      fb.className   = 'ok';
    } else {
      btns[idx].classList.add('wrong');
      btns[q.a].classList.add('correct');
      playAnswerSfxForOneSecond(wrongSfx, { startAt: 0.5, endAt: 2 });
      state.lives--;
      state.wrong++;
      state.streak = 0;
      fb.textContent = '✘ ERRADO!';
      fb.className   = 'err';
    }
  
    document.getElementById('score-display').textContent = state.score;
    renderLives();
    showCompleteImageForQuestion(q);
    setTimeout(next, 1400);
  }
  
  function timeOut() {
    state.answered = true;
    state.lives--;
    state.wrong++;
    state.streak = 0;
  
    const q    = state.qs[state.idx];
    const btns = document.querySelectorAll('.opt-btn');
    btns.forEach(b => b.disabled = true);
    btns[q.a].classList.add('correct');
    playAnswerSfxForOneSecond(wrongSfx, { startAt: 0.5, endAt: 2 });
  
    const fb = document.getElementById('feedback');
    fb.textContent = '⏱ TEMPO ESGOTADO!';
    fb.className   = 'err';
  
    renderLives();
    showCompleteImageForQuestion(q);
    setTimeout(next, 1400);
  }
  
  function next() {
    state.idx++;
    if (state.lives <= 0 || state.idx >= state.qs.length) {
      endGame();
    } else {
      loadQuestion();
    }
  }
  
  function renderLives() {
    const el = document.getElementById('lives-display');
    el.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      const h = document.createElement('span');
      h.textContent = i < state.lives ? '♥' : '♡';
      h.style.color  = i < state.lives ? 'var(--white)' : 'var(--gray3)';
      el.appendChild(h);
    }
  }
  
  // ══════════════════════════════════════
  //  END GAME
  // ══════════════════════════════════════
  function endGame() {
    clearInterval(state.timer);
    stopQuizMusic();
    show('result-screen');

    saveBestScore(state.cat, state.score);
  
    const win  = state.lives > 0;
    const avgT = state.totalTime / (state.correct + state.wrong) || 0;
    const pct  = state.correct / state.qs.length;
  
    document.getElementById('result-title').textContent = win ? '★ VITÓRIA! ★' : 'GAME OVER';
    document.getElementById('result-score').textContent = String(state.score).padStart(6,'0');
    document.getElementById('r-correct').textContent = state.correct;
    document.getElementById('r-wrong').textContent   = state.wrong;
    document.getElementById('r-time').textContent    = avgT.toFixed(1) + 's';
    document.getElementById('r-streak').textContent  = state.maxStreak;
  
    const ranks = ['F','D','C','B','A','S'];
    const ri    = Math.min(Math.floor(pct * ranks.length), ranks.length - 1);
    document.getElementById('result-rank').textContent = `RANK: ${ranks[ri]}`;
  }
  
  document.getElementById('restart-btn').addEventListener('click', () => {
    state = newState(state.cat);
    playQuizMusic();
    show('quiz-screen');
    loadQuestion();
  });
  
  document.getElementById('menu-btn').addEventListener('click', () => {
    stopQuizMusic();
    show('start-screen');
    playMenuMusic();
  }); 