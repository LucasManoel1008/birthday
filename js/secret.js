
window.SecretGame = (() => {

  // ── Core ───────────────────────────────────────────────────────────────
  let canvas, ctx;
  let animFrameId = null;
  let currentScene = null;
  let onPhaseEnd = null;
  let onSceneChangeCb = null;
  let lastTimestamp = 0;

  let W = 768, H = 432;  

  function syncCanvasSize() {
    const wrap = canvas.parentElement;
    const ww = wrap.clientWidth  || window.innerWidth;
    const wh = wrap.clientHeight || window.innerHeight;
    const aspect = 16 / 9;
    let cw = ww, ch = Math.round(ww / aspect);
    if (ch > wh) { ch = wh; cw = Math.round(ch * aspect); }
    if (Math.abs(canvas.width - cw) > 4 || Math.abs(canvas.height - ch) > 4) {
      canvas.width  = cw;
      canvas.height = ch;
    }
    W = canvas.width;
    H = canvas.height;
  }

  // ── Estado persistente entre cenas ─────────────────────────────────────
  const run = {
    fragments:    [false, false, false, false], // progresso interno
    savedPlayerY: null,                         // posição ao entrar num desafio
  };

  // ── Input ───────────────────────────────────────────────────────────────
  const keys = {}, justPressed = {};

  function clearKeys() {
    for (const k in keys)        delete keys[k];
    for (const k in justPressed) delete justPressed[k];
  }

  function onKeyDown(e) {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
      e.preventDefault();
  }
  function onKeyUp(e) { keys[e.code] = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // ── Áudio compartilhado (Web Audio API) ────────────────────────────────
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }
  function playTone({ freq = 440, type = 'square', vol = 0.08, dur = 0.06, decay = 0.05 } = {}) {
    try {
      const ac = getAudioCtx(), osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur + decay);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + dur + decay);
    } catch {}
  }
  function sfxStep() { playTone({ freq: 110 + Math.random()*40, type:'sawtooth', vol:0.04, dur:0.03, decay:0.04 }); }
  function sfxDialogueBleep(ci) { playTone({ freq:[220,247,262,294,330,349][ci%6], type:'square', vol:0.05, dur:0.025, decay:0.02 }); }
  function sfxNpcEncounter() {
    playTone({ freq:330, type:'sine', vol:0.12, dur:0.12, decay:0.15 });
    setTimeout(() => playTone({ freq:220, type:'sine', vol:0.10, dur:0.15, decay:0.2 }), 160);
  }
  function sfxTransition() {
    try {
      const ac = getAudioCtx(), osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.4);
      gain.gain.setValueAtTime(0.10, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.45);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.5);
    } catch {}
  }
  function sfxFragmentGet() {
    [523,659,784].forEach((f,i) => setTimeout(() => playTone({ freq:f, type:'square', vol:0.09, dur:0.09, decay:0.12 }), i*100));
  }

  // ── API pública ─────────────────────────────────────────────────────────
  function mount({ canvas: c, onEnd, onSceneChange }) {
    canvas = c;
    ctx    = canvas.getContext('2d');
    onPhaseEnd      = onEnd         || (() => {});
    onSceneChangeCb = onSceneChange || (() => {});
    syncCanvasSize();
    canvas.addEventListener('click', handleDebugClick);
    window.addEventListener('resize', () => {
      syncCanvasSize();
      if (currentScene?.name === 'corridor' && typeof currentScene.onResize === 'function') {
        currentScene.onResize();
      }
    });
  }

  function startCampaign() {
    cancelAnimationFrame(animFrameId);
    run.fragments    = [false, false, false, false];
    run.savedPlayerY = null;
    switchScene('glitchIntro');
    lastTimestamp = performance.now();
    requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
    if (currentScene?.cleanup) currentScene.cleanup();
    currentScene = null;
    clearKeys();
  }

  function getProgress() {
    return {
      scene:     currentScene?.name ?? 'none',
      fragments: run.fragments.filter(Boolean).length,
    };
  }

  // ── Modo Debug ──────────────────────────────────────────────────────────
  let debugMode = false;

  const DEBUG_SCENES = [
    { key: '1', name: 'glitchIntro', label: 'Intro Glitch',     frags: [] },
    { key: '2', name: 'corridor',    label: 'Corredor',          frags: [] },
    { key: '3', name: 'puzzle',      label: 'Puzzle — Gargalo',  frags: [] },
    { key: '4', name: 'dodge',       label: 'Arena de Esquiva',  frags: [] },
    { key: '5', name: 'shooter',     label: 'Arena de Tiro',      frags: [0,1] },
    { key: '6', name: 'platform',    label: 'Plataforma',        frags: [0,1,2] },
    { key: '7', name: 'memoryPath',  label: 'Caminho Memórias',  frags: [0,1,2,3] },
  ];

  // Abre/fecha o debug: tecla ` (backtick) ou clique no canto inferior esquerdo do canvas
  window.addEventListener('keydown', e => {
    if (e.code === 'Backquote' || e.code === 'F2') {
      debugMode = !debugMode;
      e.preventDefault();
      return;
    }
    if (!debugMode || !animFrameId) return;
    const entry = DEBUG_SCENES.find(s => s.key === e.key);
    if (entry) {
      if (entry.frags.length) entry.frags.forEach(i => { run.fragments[i] = true; });
      switchScene(entry.name);
      e.preventDefault();
    }
  });

  // Clique no canto inferior esquerdo (40×40 px) abre o debug sem teclado
  function handleDebugClick(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Normaliza para coordenadas do canvas
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = cx * scaleX;
    const canvasY = cy * scaleY;
    if (canvasX < 50 && canvasY > canvas.height - 50) {
      debugMode = !debugMode;
      return;
    }
    if (!debugMode || !animFrameId) return;
    // Clique em item do painel
    const PAD = 10, LH = 17, W2 = 230;
    const ox = canvas.width - W2 - 8, oy = 8;
    if (canvasX >= ox && canvasX <= ox + W2) {
      DEBUG_SCENES.forEach((s, i) => {
        const itemY = oy + PAD + 22 + i * LH;
        if (canvasY >= itemY - 12 && canvasY <= itemY + 4) {
          if (s.frags.length) s.frags.forEach(idx => { run.fragments[idx] = true; });
          switchScene(s.name);
        }
      });
    }
  }

  function drawDebugOverlay(ctx) {
    // Indicador de canto (sempre visível quando a fase secreta está rodando)
    if (animFrameId) {
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.abs(Math.sin(Date.now() * 0.002)) * 0.15;
      ctx.fillStyle = '#ff44ff';
      ctx.fillRect(0, H - 14, 14, 14);
      ctx.restore();
    }

    if (!debugMode) return;

    const PAD = 10, LH = 18, W2 = 230;
    const H2 = DEBUG_SCENES.length * LH + PAD * 2 + 32;
    const ox = W - W2 - 8, oy = 8;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#080808';
    ctx.fillRect(ox, oy, W2, H2);
    ctx.strokeStyle = '#ff44ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, W2, H2);

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff44ff';
    ctx.font = 'bold 7px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('[ DEBUG ]', ox + PAD, oy + PAD + 7);

    ctx.fillStyle = '#444';
    ctx.font = '5px "Press Start 2P", monospace';
    ctx.fillText('` ou canto ▐ para fechar', ox + PAD, oy + PAD + 20);

    DEBUG_SCENES.forEach((s, i) => {
      const active = currentScene?.name === s.name;
      const iy = oy + PAD + 32 + i * LH;
      // Highlight de fundo na cena ativa
      if (active) {
        ctx.fillStyle = '#1a001a';
        ctx.fillRect(ox + 4, iy - 11, W2 - 8, LH - 2);
      }
      ctx.fillStyle = active ? '#ff44ff' : '#888';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillText(
        `[${s.key}] ${s.label}${active ? ' ◀' : s.frags.length ? ' +frags' : ''}`,
        ox + PAD, iy
      );
    });
    ctx.restore();
  }

  // ── Gerenciador de cenas ────────────────────────────────────────────────
  const SCENE_BUILDERS = {
    glitchIntro,
    corridor,
    puzzle:     puzzleScene,
    dodge:      dodgeScene,
    shooter:    shooterScene,
    platform:   platformScene,
    memoryPath: memoryPathScene,
  };

  function switchScene(name, opts = {}) {
    if (currentScene?.cleanup) currentScene.cleanup();
    const build = SCENE_BUILDERS[name];
    if (!build) { console.warn('SecretGame: cena desconhecida', name); return; }
    currentScene = build();
    currentScene.name = name;
    currentScene.start(opts);
    if (onSceneChangeCb) onSceneChangeCb(name);
  }

  function loop(ts) {
    animFrameId = requestAnimationFrame(loop);
    syncCanvasSize();
    const dt = Math.min((ts - lastTimestamp) / 1000, 0.05);
    lastTimestamp = ts;
    if (currentScene) {
      currentScene.update(dt);
      currentScene.render(ctx);
    }
    drawDebugOverlay(ctx);
    for (const k in justPressed) delete justPressed[k];
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CENA 1 — GLITCH INTRO
  // ════════════════════════════════════════════════════════════════════════
  function glitchIntro() {
    const MSGS = ['LOADING SECRET MEMORY...', 'DATA CORRUPTED', 'RESTORING...'];
    let phase = 'black', pt = 0;
    let mi = 0, ci = 0, tacc = 0;
    let gacc = 0, glines = [], cc = 0;
    let glitchSoundNode = null;

    // ── Sons do glitch (Web Audio) ──────────────────────────────────────
    function playGlitchNoise() {
      try {
        const ac     = new (window.AudioContext || window.webkitAudioContext)();
        const buf    = ac.createBuffer(1, ac.sampleRate * 3.8, ac.sampleRate);
        const data   = buf.getChannelData(0);

        // Ruído branco com "bursts" de estática nos momentos de glitch visual
        for (let i = 0; i < data.length; i++) {
          const t = i / ac.sampleRate;
          // Silêncio no início (fase black + typing)
          const typeEnd  = 1.0 + MSGS.join('').length * 0.038;
          const glitchStart = typeEnd;
          if (t < 1.0) {
            data[i] = 0;
          } else if (t < glitchStart) {
            // Typing: bip suave a cada ~0.38s (por mensagem)
            data[i] = (Math.random() * 2 - 1) * 0.015;
          } else {
            // Glitch: estática crescente + pulsos
            const progress = (t - glitchStart) / 3.0;
            const burst    = Math.sin(t * 44) > 0.92 ? 1 : 0; // pulsos periódicos
            const base     = (Math.random() * 2 - 1) * 0.06 * Math.min(1, progress * 1.5);
            const noise    = base + burst * (Math.random() * 2 - 1) * 0.18;
            // Fade out nos últimos 0.4s
            const fade     = t > 3.4 ? Math.max(0, 1 - (t - 3.4) / 0.4) : 1;
            data[i] = noise * fade;
          }
        }

        const src  = ac.createBufferSource();
        const gain = ac.createGain();
        // Distorção leve com WaveShaper
        const wave = ac.createWaveShaper();
        wave.curve = (function() {
          const n = 256, curve = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = (Math.PI + 80) * x / (Math.PI + 80 * Math.abs(x));
          }
          return curve;
        })();
        wave.oversample = '2x';

        src.buffer = buf;
        src.connect(wave);
        wave.connect(gain);
        gain.connect(ac.destination);
        gain.gain.setValueAtTime(0.55, ac.currentTime);

        src.start(ac.currentTime);
        glitchSoundNode = { src, ac };
      } catch {}
    }

    function stopGlitchSound() {
      if (glitchSoundNode) {
        try { glitchSoundNode.src.stop(); } catch {}
        try { glitchSoundNode.ac.close(); } catch {}
        glitchSoundNode = null;
      }
    }

    function gen() {
      glines = Array.from({ length: 4 + Math.floor(Math.random() * 7) }, () => ({
        y: Math.random() * H, h: 1 + Math.random() * 5,
        off: (Math.random() - 0.5) * 50, a: 0.25 + Math.random() * 0.65,
        c: Math.random() > 0.6 ? '#f0f' : Math.random() > 0.5 ? '#0ff' : '#fff',
      }));
    }

    function start() {
      phase = 'black'; pt = 0; mi = 0; ci = 0; tacc = 0;
      stopGlitchSound();
      playGlitchNoise();
    }

    function cleanup() { stopGlitchSound(); }

    function update(dt) {
      cc += dt * 90; pt += dt;
      if (phase === 'black') { if (pt >= 1) { phase = 'typing'; pt = 0; } return; }
      if (phase === 'typing') {
        tacc += dt;
        while (tacc >= 0.038) {
          tacc -= 0.038; ci++;
          if (ci > MSGS[mi].length) { ci = 0; mi++; if (mi >= MSGS.length) { phase = 'glitch'; pt = 0; gen(); return; } }
        }
        return;
      }
      if (phase === 'glitch') {
        gacc += dt; if (gacc >= 0.07) { gacc = 0; gen(); }
        if (pt >= 3.6) { phase = 'done'; stopGlitchSound(); switchScene('corridor'); }
      }
    }

    function render(ctx) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (phase === 'black') return;
      const gl = phase === 'glitch';
      ctx.textAlign = 'left';
      for (let i = 0; i < mi && i < MSGS.length; i++) {
        ctx.fillStyle = gl ? `hsl(${(cc + i * 40) % 360},100%,65%)` : '#888';
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText(MSGS[i], 50 + (gl ? (Math.random() - 0.5) * 3 : 0), 160 + i * 48);
      }
      if (mi < MSGS.length) {
        ctx.fillStyle = '#fff'; ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText(MSGS[mi].slice(0, ci) + (Math.floor(pt * 4) % 2 ? '\u2588' : ' '), 50, 160 + mi * 48);
      }
      if (gl) {
        glines.forEach(l => { ctx.save(); ctx.globalAlpha = l.a; ctx.fillStyle = l.c; ctx.fillRect(l.off, l.y, W, l.h); ctx.restore(); });
        if (Math.random() > 0.88) { ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = ['#f0f','#0ff','#fff'][Math.floor(Math.random()*3)]; ctx.fillRect(0,0,W,H); ctx.restore(); }
        const bw = (pt / 3.6) * (W - 100);
        ctx.save(); ctx.globalAlpha = 0.7 + Math.sin(pt * 15) * 0.3;
        ctx.fillStyle = '#fff'; ctx.fillRect(50, H - 60, bw, 6);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.strokeRect(50, H - 60, W - 100, 6);
        ctx.restore();
        ctx.fillStyle = '#555'; ctx.font = '8px "Press Start 2P", monospace'; ctx.fillText('RESTORING DATA', 50, H - 30);
      }
    }

    return { start, update, render, cleanup };
  }

  // ════════════════════════════════════════════════════════════════════════
  function corridor() {

    // ── Geometria do mundo ──────────────────────────────────────────────
    const WORLD_H  = 2600;
    const COR_W    = 172;                        // largura do corredor
    const COR_L    = (W - COR_W) / 2;           // borda esquerda: 298
    const COR_R    = COR_L + COR_W;             // borda direita:  470
    const DOOR_Y   = 75;                         // porta no topo (worldY)

    // ── NPCs — 4 checkpoints ────────────────────────────────────────────
    const NPCS = [
      {
        worldY: 2100, scene: 'puzzle',
        dialogues: [
  '...',
  'Você foi mesmo dedicado para chegar até aqui...',
  'Espero que tenha se divertido.',
  'A ideia era criar algo legal que te divertisse em seu aniversário.',          
  'Se ja não estiver cansado...',
  'Prossiga pelas últimas salas não vistas e pegue seu prêmio',

  '...',
  'Mas antes...',
  'Este é um espaço entre as salas.',
  'Entre o que foi planejado...',
  'E o que acabou acontecendo.',

  'Algumas coisas acabam caindo aqui.',
  'Códigos esquecidos.',
  'Ideias abandonadas.',
  'Personagens que não deveriam falar.',

  'Eu sou uma dessas coisas.',

  '...',
  'Não se preocupe.',
  'Nada aqui vai te impedir de continuar.',

  'Na verdade...',
  'Você está indo exatamente para onde deveria.',

  'Continue pelas salas à frente.',
  'Ainda existem coisas que você não viu.',

  'E eu estarei observando.'
]
      },
      {
        worldY: 1580, scene: 'dodge',
        dialogues: [
  '...',
  'Então você passou.',
  'Interessante.',
  'fácil, não foi?',
  'Mas também era para ser.',
  'Ainda há mais pela frente.',
  'O próximo desafio é... diferente.',
  'Mais rápido.',
  'Menos previsível.',
  'Rezam as lendas que o criador precisou nerfar três vezes para deixá-lo justo.',
  'Ou o que ele considera justo',
  'Mesmo assim...',
  'Alguns ainda falham.',
  'Vamos ver o que acontece com você.',
  'Boa sorte, jogador.'
]
      },
      {
        worldY: 1060, scene: 'shooter',
        dialogues: [
  '...',
  'Eu sabia que conseguiria.',
  'De alguma forma...',
  'Você sempre consegue.',
  'Curioso.',
  'O planejamento deste lugar não foi dos melhores.',
  'Na verdade...',
  'É seguro dizer que foi feito de última hora.',
  'Um espaço improvisado.',
  'Onde as ideias não precisavam fazer muito sentido.',
  'Elas apenas... existiam.',
  'Você chegou a se perguntar...',
  'O que o primeiro jogo tinha a ver com o resto?',
  '...',
  'Se você pensou nisso...',
  'Então funcionou.',
  'A ideia era exatamente essa.',
  'Confusão.',
  'Mistura.',
  'Surpresas.',
  'O próximo desafio...',
  'É um dos favoritos do criador.',
  'Você deve ser mais rápido que aqueles cuja cor remete aos mares...',
  "E ter paciência com aqueles que ainda precisam amadurecer...",
  "Fez sentido?",
  'Vamos ver o que você acha.',
  'Divirta-se.'
]
      },
      {
        worldY: 540, scene: 'platform',
        dialogues: [
  '...',
  'Quase lá.',
  'Mais uma porta.',
  'Depois disso...',
  'Você terá conquistado o jogo.',
  'Não direi muito desta vez.',
  'É melhor guardar suas forças.',
  'O que vem a seguir exige atenção.',
  'Reflexos.',
  'E talvez um pouco de sorte.',
  '...',
  'Aquele robô barulhento provavelmente chamaria isso de...',
  '"AÇÃO".',
  'Eu prefiro observar.',
  'Boa sorte, jogador.'
]
      },
    ];

    // ── Estado do corredor ──────────────────────────────────────────────
    const P_W = 16, P_H = 24;
    let playerY, playerX;
    let facing = 'up'; // 'up'|'down'|'left'|'right'
    let walkT = 0, stepAcc = 0;
    const SPEED = 100;

    // Flags por NPC (sincronizadas com run.fragments)
    const cpDone = [false, false, false, false];

    // FSM: 'fadeIn' | 'walking' | 'dialogue' | 'fadeOut'
    let mode = 'fadeIn';
    let fadeAlpha = 1;
    let fadePend  = null;   // { scene, opts }

    // Diálogo
    let dlgIdx   = -1;   // qual NPC
    let dlgLine  = 0;
    let dlgChar  = 0;
    let dlgAcc   = 0;
    let dlgDone  = false;
    const DLG_SPD = 0.042;

    let glowT = 0;
    let camY  = 0;

    // Torches decorativas (posições fixas)
    const TORCHES = Array.from({ length: Math.floor(WORLD_H / 220) }, (_, i) => ({
      y: 80 + i * 220,
      side: i % 2 === 0 ? 'left' : 'right',
    }));

    // ── Helpers ─────────────────────────────────────────────────────────
    function updateCam() {
      camY = Math.max(0, Math.min(WORLD_H - H, playerY - H * 0.58));
    }

    function getBlockY() {
      // Retorna o worldY do primeiro NPC incompleto que o jogador está tentando ultrapassar
      for (let i = 0; i < NPCS.length; i++) {
        if (!cpDone[i]) return NPCS[i].worldY; // jogador não pode ir acima disso
      }
      return null; // todos completos → porta liberada
    }

    // ── Lifecycle ────────────────────────────────────────────────────────
    function start(opts = {}) {
      glowT = 0;

      // Sincroniza flags com estado global
      cpDone.forEach((_, i) => { cpDone[i] = run.fragments[i]; });

      if (typeof opts.returnFrom === 'string') {
        playerY = run.savedPlayerY ?? WORLD_H - 150;
        playerX = run.savedPlayerX ?? W / 2 - P_W / 2;
      } else {
        playerY = WORLD_H - 150;
        playerX = W / 2 - P_W / 2;
      }

      updateCam();
      fadeAlpha = 1;
      mode = 'fadeIn';
    }

    // ── Update ───────────────────────────────────────────────────────────
    function update(dt) {
      glowT += dt;

      // ─ Fade in ─
      if (mode === 'fadeIn') {
        fadeAlpha -= dt * 2.2;
        if (fadeAlpha <= 0) { fadeAlpha = 0; mode = 'walking'; }
        return;
      }

      // ─ Fade out ─
      if (mode === 'fadeOut') {
        fadeAlpha = Math.min(1, fadeAlpha + dt * 2.8);
        if (fadeAlpha >= 1 && fadePend) {
          const p = fadePend; fadePend = null;
          switchScene(p.scene, p.opts);
        }
        return;
      }

      // ─ Diálogo ─
      if (mode === 'dialogue') {
        updateDialogue(dt);
        return;
      }

      // ─ Walking ─
      walkT += dt;
      let dy = 0, dx = 0;
      if (keys['ArrowUp']    || keys['KeyW']) { dy = -1; facing = 'up';    }
      if (keys['ArrowDown']  || keys['KeyS']) { dy =  1; facing = 'down';  }
      if (keys['ArrowLeft']  || keys['KeyA']) { dx = -1; facing = 'left';  }
      if (keys['ArrowRight'] || keys['KeyD']) { dx =  1; facing = 'right'; }

      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

      const isMoving = dx !== 0 || dy !== 0;

      if (dy !== 0) {
        let ny = playerY + dy * SPEED * dt;
        const block = getBlockY();
        if (block !== null) ny = Math.max(ny, block + P_H + 10);
        if (!run.fragments.every(Boolean)) ny = Math.max(ny, DOOR_Y + 80);
        ny = Math.max(DOOR_Y + P_H, Math.min(WORLD_H - 50, ny));
        playerY = ny;
      }

      if (dx !== 0) {
        const nx = Math.max(COR_L + 4, Math.min(COR_R - P_W - 4, playerX + dx * SPEED * dt));
        playerX = nx;
      }

      // Som de passos
      if (isMoving) {
        stepAcc += dt;
        if (stepAcc >= 0.28) { stepAcc = 0; sfxStep(); }
      } else {
        stepAcc = 0;
      }

      updateCam();
      checkTriggers();
    }

    function updateDialogue(dt) {
      const lines = NPCS[dlgIdx].dialogues;
      if (!dlgDone) {
        dlgAcc += dt;
        dlgChar = Math.min(Math.floor(dlgAcc / DLG_SPD), lines[dlgLine].length);
        if (dlgChar >= lines[dlgLine].length) dlgDone = true;
      }

      if (justPressed['Space'] || justPressed['Enter'] || justPressed['KeyZ']) {
        if (!dlgDone) {
          dlgChar = lines[dlgLine].length;
          dlgDone = true;
        } else {
          dlgLine++;
          if (dlgLine >= lines.length) {
            run.savedPlayerY = playerY;
            run.savedPlayerX = playerX;
            sfxTransition();
            fadePend = { scene: NPCS[dlgIdx].scene, opts: { checkpointId: dlgIdx } };
            mode = 'fadeOut';
            fadeAlpha = 0;
          } else {
            dlgAcc = 0; dlgChar = 0; dlgDone = false;
          }
        }
      }

      // Bleep por caractere digitado
      const prevChar = dlgChar;
      if (!dlgDone) {
        dlgAcc += dt;
        const newChar = Math.min(Math.floor(dlgAcc / DLG_SPD), lines[dlgLine].length);
        if (newChar > prevChar && lines[dlgLine][newChar - 1] !== ' ') sfxDialogueBleep(newChar);
        dlgChar = newChar;
        if (dlgChar >= lines[dlgLine].length) dlgDone = true;
      }

    }

    function checkTriggers() {
      for (let i = 0; i < NPCS.length; i++) {
        if (cpDone[i]) continue;
        const dist = playerY - NPCS[i].worldY;
        // Jogador se aproximou do NPC por baixo (worldY do player levemente maior)
        if (dist >= 0 && dist < 55) {
          startDialogue(i);
          return;
        }
      }

      // Porta final
      if (run.fragments.every(Boolean) && playerY - DOOR_Y < 70 && playerY - DOOR_Y >= 0) {
        run.savedPlayerY = playerY;
        fadePend = { scene: 'memoryPath', opts: {} };
        mode = 'fadeOut';
        fadeAlpha = 0;
      }
    }

    function startDialogue(i) {
      mode = 'dialogue';
      dlgIdx = i; dlgLine = 0; dlgChar = 0; dlgAcc = 0; dlgDone = false;
      sfxNpcEncounter();
    }

    // ── Render ───────────────────────────────────────────────────────────
    function render(ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(0, -camY);

      drawCorridorBg(ctx);
      drawTorches(ctx);
      NPCS.forEach((npc, i) => { if (!cpDone[i]) drawNPC(ctx, npc.worldY, glowT); });
      drawDoor(ctx);
      drawPlayer(ctx);

      ctx.restore();

      drawHUD(ctx);
      if (mode === 'dialogue') drawDialogue(ctx);

      // Fades
      if (fadeAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, fadeAlpha);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    // ── Desenho do corredor ──────────────────────────────────────────────
    function drawCorridorBg(ctx) {
      // Paredes laterais
      for (let side = 0; side < 2; side++) {
        const wx = side === 0 ? 0 : COR_R;
        const ww = side === 0 ? COR_L : W - COR_R;

        ctx.fillStyle = '#0e0e0e';
        ctx.fillRect(wx, 0, ww, WORLD_H);

        // Padrão de tijolos
        const BW = 36, BH = 18;
        for (let row = 0; row < Math.ceil(WORLD_H / BH); row++) {
          const off = (row % 2) * (BW / 2);
          for (let col = -1; col < Math.ceil(ww / BW) + 1; col++) {
            const bx = wx + col * BW + off;
            const by = row * BH;
            ctx.fillStyle = '#141414';
            ctx.fillRect(bx + 2, by + 2, BW - 4, BH - 4);
            ctx.strokeStyle = '#0a0a0a';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(bx, by, BW, BH);
          }
        }

        // Borda do corredor
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        const bx = side === 0 ? COR_L : COR_R;
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, WORLD_H); ctx.stroke();
      }

      // Piso do corredor
      const TS = 36;
      for (let row = 0; row < Math.ceil(WORLD_H / TS); row++) {
        for (let col = 0; col < Math.ceil(COR_W / TS); col++) {
          const tx = COR_L + col * TS, ty = row * TS;
          ctx.fillStyle = '#070707';
          ctx.fillRect(tx, ty, TS, TS);
          ctx.strokeStyle = '#0d0d0d';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(tx, ty, TS, TS);
        }
      }

      // Linha central pontilhada (guia de caminho)
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 14]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, WORLD_H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawTorches(ctx) {
      TORCHES.forEach(torch => {
        const tx = torch.side === 'left' ? COR_L + 14 : COR_R - 14;
        const ty = torch.y;
        const flicker = 0.5 + Math.abs(Math.sin(glowT * 7 + tx)) * 0.5;

        // Suporte da tocha
        ctx.fillStyle = '#333';
        ctx.fillRect(tx - 3, ty - 6, 6, 12);

        // Chama
        const colors = ['#ff8800', '#ffaa00', '#ffcc44'];
        colors.forEach((c, i) => {
          ctx.save();
          ctx.globalAlpha = (0.4 + flicker * 0.6) * (1 - i * 0.25);
          ctx.fillStyle = c;
          const fw = 8 - i * 2, fh = 10 - i * 2;
          ctx.fillRect(tx - fw / 2 + (Math.random() - 0.5) * 1.5, ty - 14 - i * 4, fw, fh);
          ctx.restore();
        });

        // Halo de luz no piso
        ctx.save();
        const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, 55);
        grad.addColorStop(0, `rgba(255,140,0,${0.06 * flicker})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(tx - 55, ty - 55, 110, 110);
        ctx.restore();
      });
    }

    function drawNPC(ctx, worldY, t) {
      const nx = W / 2, ny = worldY;
      const hover = Math.sin(t * 1.8) * 3;

      // Sombra no chão
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(t * 1.8) * 0.1;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(nx, ny + 28, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const oy = ny + hover - 30; // origem da figura

      // ── Sprite estilo Gaster ──────────────────────────────────────────

      // Manto (corpo inferior)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(nx - 8, oy + 18, 16, 22);
      // Borda do manto
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(nx - 8, oy + 18, 16, 22);

      // Torso
      ctx.fillStyle = '#222';
      ctx.fillRect(nx - 6, oy + 8, 12, 12);

      // Braços
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(nx - 12, oy + 10, 6, 14); // esquerdo
      ctx.fillRect(nx + 6,  oy + 10, 6, 14); // direito

      // Mãos
      ctx.fillStyle = '#ddd';
      ctx.fillRect(nx - 12, oy + 22, 5, 5);
      ctx.fillRect(nx + 7,  oy + 22, 5, 5);

      // Pescoço
      ctx.fillStyle = '#ccc';
      ctx.fillRect(nx - 3, oy + 5, 6, 5);

      // Cabeça (crânio)
      ctx.fillStyle = '#eee';
      ctx.fillRect(nx - 8, oy - 8, 16, 15);

      // Olhos ocos (estilo Gaster — quadrados escuros com pupila branca no centro)
      const eyeFlicker = Math.sin(t * 4) > 0.7 ? 0 : 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(nx - 7, oy - 5, 5, 6); // olho esq
      ctx.fillRect(nx + 2,  oy - 5, 5, 6); // olho dir

      if (eyeFlicker) {
        // Brilho nos olhos
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(t * 3) * 0.25;
        ctx.fillStyle = '#fff';
        ctx.fillRect(nx - 6, oy - 4, 2, 2);
        ctx.fillRect(nx + 3, oy - 4, 2, 2);
        ctx.restore();
      }

      // Fissuras no rosto (traço característico)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nx - 4, oy - 8);
      ctx.lineTo(nx - 3, oy - 3);
      ctx.stroke();

      // Aura / brilho misterioso ao redor
      ctx.save();
      const aura = 0.03 + Math.abs(Math.sin(t * 2)) * 0.05;
      const grad = ctx.createRadialGradient(nx, oy, 0, nx, oy, 38);
      grad.addColorStop(0, `rgba(255,255,255,${aura})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(nx - 38, oy - 38, 76, 76);
      ctx.restore();

      // Label "???" acima
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.abs(Math.sin(t * 1.5)) * 0.3;
      ctx.fillStyle = '#aaa';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('W.D. [REDACTED]', nx, oy - 18);
      ctx.restore();
    }

    function drawDoor(ctx) {
      const cx = W / 2;
      const allDone = run.fragments.every(Boolean);
      const glow = 0.4 + Math.sin(glowT * 2.5) * 0.35;

      // Batentes da porta
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 22, DOOR_Y - 8, 44, 58);

      // Porta
      ctx.fillStyle = allDone ? '#111' : '#0a0a0a';
      ctx.fillRect(cx - 18, DOOR_Y - 4, 36, 52);

      // Moldura
      ctx.strokeStyle = allDone ? '#fff' : '#333';
      ctx.lineWidth = allDone ? 2 : 1;
      ctx.strokeRect(cx - 18, DOOR_Y - 4, 36, 52);

      if (allDone) {
        // Brilho pulsante
        ctx.save();
        ctx.globalAlpha = glow * 0.18;
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 18, DOOR_Y - 4, 36, 52);
        ctx.restore();

        // Símbolo central
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u2606', cx, DOOR_Y + 28);
        ctx.restore();

        // Halo
        ctx.save();
        const hg = ctx.createRadialGradient(cx, DOOR_Y + 24, 0, cx, DOOR_Y + 24, 60);
        hg.addColorStop(0, `rgba(255,255,255,${0.08 * glow})`);
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(cx - 60, DOOR_Y - 40, 120, 120);
        ctx.restore();
      } else {
        // Cadeado
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(cx - 5, DOOR_Y + 18, 10, 9);
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, DOOR_Y + 18, 5, Math.PI, 0);
        ctx.stroke();
      }
    }

    function drawPlayer(ctx) {
      const x = playerX;
      const y = playerY;
      const isMoving = keys['ArrowUp']   || keys['ArrowDown']  ||
                       keys['ArrowLeft'] || keys['ArrowRight'] ||
                       keys['KeyW']      || keys['KeyS']        ||
                       keys['KeyA']      || keys['KeyD'];
      const leg = isMoving ? Math.sin(walkT * 8) * 2.5 : 0;
      const hairSwing = isMoving ? Math.sin(walkT * 8) * 1.5 : 0;

      // Sombra
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + P_W / 2, y + P_H + 2, P_W / 2 - 1, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fff';

      // ── Cabelo longo (desenhado ANTES do corpo para ficar atrás) ──────
      // Mecha lateral esquerda longa
      ctx.fillRect(x + 3,  y,      3, 10);       // lateral esq
      ctx.fillRect(x + 2,  y + 6,  3, 8);        // cai pela lateral
      ctx.fillRect(x + 1,  y + 10, 3, 7 + hairSwing); // ponta esq

      // Mecha lateral direita longa
      ctx.fillRect(x + 12, y,      3, 10);
      ctx.fillRect(x + 13, y + 6,  3, 8);
      ctx.fillRect(x + 14, y + 10, 3, 7 - hairSwing); // ponta dir

      // Cabelo atrás (cascata nas costas)
      ctx.fillRect(x + 4,  y - 1,  10, 3);       // topo da cabeça
      ctx.fillRect(x + 5,  y + 8,  7,  14 + hairSwing * 0.5); // cascata central
      ctx.fillRect(x + 4,  y + 12, 3,  10);      // lateral esq da cascata
      ctx.fillRect(x + 11, y + 12, 3,  10);      // lateral dir da cascata

      // ── Corpo ──────────────────────────────────────────────────────────
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(x + 5,  y + 1,  8, 8);        // cabeça
      ctx.fillRect(x + 6,  y + 9,  6, 7);        // torso
      ctx.fillRect(x + 5,  y + 16 + leg, 4, 4);  // perna esq
      ctx.fillRect(x + 9,  y + 16 - leg, 4, 4);  // perna dir

      // Franja (parte frontal do cabelo)
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 5, y,     8, 3);           // topo
      ctx.fillRect(x + 5, y + 1, 3, 4);           // franja esq

      // ── Olhos baseados em facing ──────────────────────────────────────
      ctx.fillStyle = '#000';
      if (facing === 'up') {
        // costas — sem olhos, só cabelo
      } else if (facing === 'down') {
        ctx.fillRect(x + 6,  y + 3, 2, 2);
        ctx.fillRect(x + 10, y + 3, 2, 2);
      } else if (facing === 'left') {
        ctx.fillRect(x + 6, y + 3, 2, 2);
      } else if (facing === 'right') {
        ctx.fillRect(x + 10, y + 3, 2, 2);
      }
    }

    // ── HUD lateral ──────────────────────────────────────────────────────
    function drawHUD(ctx) {
      const count = run.fragments.filter(Boolean).length;
      const total = run.fragments.length;

      // Margem esquerda — barra de progresso vertical
      const barH  = H - 60, barX = 18, barY = 30;
      const fillH = (count / total) * barH;

      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, 10, barH);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, 10, barH);

      if (fillH > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#fff';
        ctx.fillRect(barX, barY + barH - fillH, 10, fillH);
        ctx.restore();
      }

      // Ícone no topo da barra
      ctx.fillStyle = '#333';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('\u2605', barX + 5, barY - 8);

      // Contagem
      ctx.fillStyle = '#333';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${count}/${total}`, barX + 5, barY + barH + 16);

      // Margem direita — controles
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const rx = W - 22;
      ctx.fillText('WASD / \u2191\u2193\u2190\u2192', rx, H / 2 - 8);
      ctx.fillText('MOVER',  rx, H / 2 + 4);
      ctx.fillText('SPACE',  rx, H / 2 + 22);
      ctx.fillText('ACAO',   rx, H / 2 + 34);
    }

    // ── Caixa de diálogo ─────────────────────────────────────────────────
    function drawDialogue(ctx) {
      if (dlgIdx < 0) return;
      const lines = NPCS[dlgIdx].dialogues;
      const text   = lines[dlgLine]?.slice(0, dlgChar) ?? '';
      const cursor = dlgDone && (Math.floor(glowT * 3) % 2 === 0) ? ' \u25bc' : '';

      const FONT_SIZE = 11;
      const LINE_H    = FONT_SIZE + 6;
      const PAD       = 14;
      const bw        = Math.min(560, W - 32);
      const maxTxtW   = bw - PAD * 2;

      // Word-wrap helper
      ctx.font = `${FONT_SIZE}px "Press Start 2P", monospace`;
      function wrapText(str) {
        const words = str.split(' ');
        const wrapped = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? cur + ' ' + w : w;
          if (ctx.measureText(test).width > maxTxtW && cur) {
            wrapped.push(cur);
            cur = w;
          } else {
            cur = test;
          }
        }
        if (cur) wrapped.push(cur);
        return wrapped.length ? wrapped : [''];
      }

      const displayFull = text + cursor;
      const wrappedLines = wrapText(displayFull);
      const numTextLines = wrappedLines.length;

      // Box height: label row + text rows + hint row
      const bh = PAD + LINE_H + numTextLines * LINE_H + PAD + LINE_H;
      const bx = (W - bw) / 2;
      const by = H - bh - 12;

      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      // NPC label
      ctx.fillStyle = '#555';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('W.D. [REDACTED]', bx + PAD, by + PAD + 7);

      // Texto (word-wrapped)
      ctx.fillStyle = '#ddd';
      ctx.font = `${FONT_SIZE}px "Press Start 2P", monospace`;
      const textStartY = by + PAD + LINE_H + FONT_SIZE;
      for (let i = 0; i < wrappedLines.length; i++) {
        ctx.fillText(wrappedLines[i], bx + PAD, textStartY + i * LINE_H);
      }

      // Hint
      const hintY = by + bh - 8;
      ctx.font = '6px "Press Start 2P", monospace';
      if (dlgDone && dlgLine < lines.length - 1) {
        ctx.fillStyle = '#444';
        ctx.textAlign = 'right';
        ctx.fillText('ESPACO »', bx + bw - PAD, hintY);
      } else if (dlgDone) {
        ctx.fillStyle = '#444';
        ctx.textAlign = 'right';
        ctx.fillText('ESPACO: INICIAR', bx + bw - PAD, hintY);
      }

      // Indicador de linha
      ctx.fillStyle = '#333';
      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${dlgLine + 1}/${lines.length}`, bx + PAD, hintY);
    }

    function onResize() { updateCam(); }

    return { start, update, render, onResize };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUZZLE DA RELÍQUIA — "O Gargalo"
  //
  //  Mapa 11×10. Três blocos (★ ▲ ◆) precisam chegar aos altares em (1,1),
  //  (5,1) e (9,1). A fileira 4 é um GARGALO — só as colunas 3 e 7 passam.
  //
  //  Armadilha: empurrar ▲ para norte a partir de c5 trava-o abaixo do
  //  gargalo para sempre. Ele deve ser deslocado para c3 ou c7 primeiro.
  //  ★ e ◆ precisam do mesmo corredor — a ordem importa.
  //
  //  Solução (não mostrada ao jogador):
  //   ★(3,7) → N6 → (3,1) → O2 → (1,1) ✓
  //   ◆(7,7) → N6 → (7,1) → L2 → (9,1) ✓
  //   ▲(5,7) → O2 → (3,7) → N6 → (3,1) → L2 → (5,1) ✓
  // ════════════════════════════════════════════════════════════════════════
  function puzzleScene() {
    const COLS = 11, ROWS = 10;
    let T = 36; // recalculated each render
    function calcT()  { return Math.floor(Math.min(W / COLS, H / ROWS) * 0.92); }
    function calcOX() { return Math.floor((W - COLS * T) / 2); }
    function calcOY() { return Math.floor((H - ROWS * T) / 2); }

    const MAP = [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,0,1,1,1,0,1,1,1],  // GARGALO — só c3 e c7
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ];

    const ALTARS = [
      { col:1, row:1, sym:'★', blockId:'star'    },
      { col:5, row:1, sym:'▲', blockId:'tri'     },
      { col:9, row:1, sym:'◆', blockId:'diamond' },
    ];

    const BLOCKS_INIT = [
      { col:3, row:7, id:'star',    sym:'★' },
      { col:5, row:7, id:'tri',     sym:'▲' },
      { col:7, row:7, id:'diamond', sym:'◆' },
    ];

    const PLAYER_INIT = { col:5, row:8 };

    // ── Estado ───────────────────────────────────────────────────────────
    let altars, blocks, player;
    let phase = 'playing'; // playing|error|win|collect|done
    let phaseTimer = 0, glowT = 0, fadeIn = 1, exitFade = 0;
    let shakeX = 0, errorMsg = '';
    let moves = 0;

    // ── Sons ─────────────────────────────────────────────────────────────
    function sfxPush()    { playTone({ freq:200, type:'square',   vol:0.07, dur:0.04, decay:0.05 }); }
    function sfxBump()    { playTone({ freq:80,  type:'sawtooth', vol:0.05, dur:0.03, decay:0.04 }); }
    function sfxTrap()    {
      playTone({ freq:100, type:'sawtooth', vol:0.12, dur:0.12, decay:0.10 });
      setTimeout(() => playTone({ freq:70, type:'sawtooth', vol:0.09, dur:0.18, decay:0.12 }), 150);
    }
    function sfxAltarOn() {
      playTone({ freq:523, type:'sine', vol:0.10, dur:0.08, decay:0.14 });
      setTimeout(() => playTone({ freq:659, type:'sine', vol:0.08, dur:0.10, decay:0.14 }), 100);
    }
    function sfxWin() {
      [330,415,523,659,784,988].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.10, dur:0.10, decay:0.15 }), i*100)
      );
    }

    // ── Reset ─────────────────────────────────────────────────────────────
    function resetPuzzle() {
      altars  = ALTARS.map(a => ({ ...a, active:false }));
      blocks  = BLOCKS_INIT.map(b => ({ ...b }));
      player  = { ...PLAYER_INIT };
      moves   = 0;
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    function tileAt(c, r) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 1;
      return MAP[r][c];
    }
    function blockAt(c, r) { return blocks.find(b => b.col===c && b.row===r) ?? null; }

    // Verifica se ▲ ficou preso (abaixo do gargalo e em coluna bloqueada)
    function isTrapped(blk) {
      if (blk.id !== 'tri') return false;
      // Preso se está abaixo do gargalo (r>4) em coluna não-gargalo,
      // com parede de gargalo bloqueando ao norte E paredes leste/oeste
      if (blk.row <= 4) return false;
      // Coluna bloqueada no gargalo (não é c3 nem c7)
      if (blk.col === 3 || blk.col === 7) return false;
      // Pode ele ainda se mover para c3 ou c7?
      // Verifica se há caminho livre pela linha
      let canReach = false;
      for (const tc of [3, 7]) {
        const minC = Math.min(blk.col, tc), maxC = Math.max(blk.col, tc);
        let clear = true;
        for (let c = minC+1; c < maxC; c++) {
          if (tileAt(c, blk.row) === 1 || blockAt(c, blk.row)) { clear=false; break; }
        }
        if (clear) { canReach = true; break; }
      }
      return !canReach;
    }

    function movePlayer(dc, dr) {
      // Move puro sem checar fase — usado no collect também
      const nx = player.col + dc, ny = player.row + dr;
      if (tileAt(nx, ny) === 1) { sfxBump(); return; }
      const blk = blockAt(nx, ny);
      if (blk) {
        const tx = blk.col + dc, ty = blk.row + dr;
        if (tileAt(tx, ty) === 1 || blockAt(tx, ty)) { sfxBump(); return; }
        blk.col = tx; blk.row = ty;
        moves++;
        sfxPush();
        if (isTrapped(blk)) {
          errorMsg = 'CAMINHO BLOQUEADO — RESET';
          phase = 'error'; phaseTimer = 0; shakeX = 0;
          sfxTrap();
          return;
        }
        checkAltars();
      }
      player.col = nx; player.row = ny;
    }

    function tryMove(dc, dr) {
      if (phase !== 'playing') return;
      movePlayer(dc, dr);
    }

    function checkAltars() {
      let anyNew = false;
      altars.forEach(alt => {
        const on = blocks.find(b => b.col===alt.col && b.row===alt.row && b.id===alt.blockId);
        const was = alt.active;
        alt.active = !!on;
        if (alt.active && !was) { sfxAltarOn(); anyNew = true; }
      });
      if (altars.every(a => a.active)) { sfxWin(); phase='win'; phaseTimer=0; }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function start() {
      resetPuzzle();
      phase='playing'; phaseTimer=0; glowT=0; fadeIn=1; exitFade=0; shakeX=0;
    }

    function update(dt) {
      glowT += dt; phaseTimer += dt;
      fadeIn = Math.max(0, fadeIn - dt*2.5);

      if (phase==='error') {
        shakeX = Math.sin(phaseTimer*55)*5*Math.max(0,1-phaseTimer/0.5);
        if (phaseTimer >= 1.4) { resetPuzzle(); phase='playing'; shakeX=0; errorMsg=''; }
        return;
      }
      if (phase==='win') {
        if (phaseTimer >= 2.0) { phase='collect'; phaseTimer=0; }
        return;
      }
      if (phase==='collect') {
        if (justPressed['ArrowUp']   ||justPressed['KeyW']) movePlayer( 0,-1);
        if (justPressed['ArrowDown'] ||justPressed['KeyS']) movePlayer( 0, 1);
        if (justPressed['ArrowLeft'] ||justPressed['KeyA']) movePlayer(-1, 0);
        if (justPressed['ArrowRight']||justPressed['KeyD']) movePlayer( 1, 0);
        if ((justPressed['Space']||justPressed['KeyZ']) &&
            player.col===5 && player.row===6) {
          phase='done'; phaseTimer=0; sfxFragmentGet();
        }
        return;
      }
      if (phase==='done') {
        exitFade = Math.min(1, phaseTimer*2.2);
        if (phaseTimer >= 1.6) {
          run.fragments[0] = true;
          switchScene('corridor', { returnFrom:'puzzle' });
        }
        return;
      }

      if (justPressed['ArrowUp']   ||justPressed['KeyW']) tryMove( 0,-1);
      if (justPressed['ArrowDown'] ||justPressed['KeyS']) tryMove( 0, 1);
      if (justPressed['ArrowLeft'] ||justPressed['KeyA']) tryMove(-1, 0);
      if (justPressed['ArrowRight']||justPressed['KeyD']) tryMove( 1, 0);
      if (justPressed['KeyR']) { resetPuzzle(); errorMsg=''; }
    }

    // ── Render ────────────────────────────────────────────────────────────
    function render(ctx) {
      T = calcT();
      const OX = calcOX(), OY = calcOY();
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      ctx.save();
      ctx.translate(OX+shakeX, OY);

      for (let r=0;r<ROWS;r++)
        for (let c=0;c<COLS;c++) drawTile(ctx,c,r);

      altars.forEach(a => drawAltar(ctx,a));

      // Gargalo visual (linhas nas bordas dos corredores)
      drawBottleneckHint(ctx);

      if (phase==='collect'||phase==='done') drawChest(ctx, 5, 6);

      blocks.forEach(b => drawBlock(ctx,b));
      drawPuzzlePlayer(ctx);

      ctx.restore();
      drawUI(ctx);

      const fv = Math.max(fadeIn, exitFade);
      if (fv>0) {
        ctx.save(); ctx.globalAlpha=fv;
        ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
        ctx.restore();
      }
    }

    function drawTile(ctx,c,r) {
      const x=c*T, y=r*T;
      if (MAP[r][c]===1) {
        ctx.fillStyle='#0e0e0e'; ctx.fillRect(x,y,T,T);
        ctx.fillStyle='#151515';
        const e=r%2===0;
        ctx.fillRect(x+(e?2:T/2+1), y+2,       T/2-3, T/2-4);
        ctx.fillRect(x+(e?T/2+1:2), y+T/2+2,   T/2-3, T/2-4);
        ctx.strokeStyle='#0a0a0a'; ctx.lineWidth=0.5;
        ctx.strokeRect(x+.5,y+.5,T-1,T-1);
      } else {
        // Destaque sutil nas células do gargalo
        const isGapCell = (r===4 && (c===3||c===7));
        ctx.fillStyle = isGapCell
          ? ((glowT*2|0)%2===0?'#0f0f12':'#0d0d10')
          : ((r+c)%2===0?'#090909':'#060606');
        ctx.fillRect(x,y,T,T);
        ctx.strokeStyle = isGapCell ? '#181820' : '#0c0c0c';
        ctx.lineWidth=0.5; ctx.strokeRect(x,y,T,T);
      }
    }

    function drawBottleneckHint(ctx) {
      // Barra sutil na linha do gargalo
      const gy = 4*T;
      ctx.save();
      ctx.globalAlpha=0.12+Math.sin(glowT*1.5)*0.06;
      ctx.strokeStyle='#4444ff'; ctx.lineWidth=1;
      ctx.setLineDash([3,6]);
      ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(COLS*T,gy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,gy+T); ctx.lineTo(COLS*T,gy+T); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    function drawAltar(ctx,alt) {
      const x=alt.col*T, y=alt.row*T;
      const pulse=0.3+Math.abs(Math.sin(glowT*2.5+alt.col))*0.45;
      ctx.save();
      ctx.globalAlpha=alt.active?1.0:pulse*0.6;
      ctx.strokeStyle=alt.active?'#fff':'#3a3a3a';
      ctx.lineWidth=alt.active?Math.max(1,Math.round(T*0.055)):1;
      ctx.beginPath(); ctx.arc(x+T/2,y+T/2,T*0.36,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=alt.active?'#fff':'#2e2e2e';
      ctx.font=`${Math.round(T*(alt.active?0.38:0.30))}px sans-serif`;
      ctx.textAlign='center';
      ctx.fillText(alt.sym, x+T/2, y+T/2+Math.round(T*0.14));
      if (alt.active) {
        ctx.globalAlpha=0.12+Math.sin(glowT*5)*0.10;
        ctx.fillStyle='#fff';
        ctx.beginPath(); ctx.arc(x+T/2,y+T/2,T*0.46,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    function drawBlock(ctx,blk) {
      const pad = Math.max(2, Math.round(T * 0.08));
      const x=blk.col*T+pad, y=blk.row*T+pad, sz=T-pad*2;
      const onCorrect=altars.some(a=>a.col===blk.col&&a.row===blk.row&&a.blockId===blk.id);
      const trapped=isTrapped(blk);
      ctx.fillStyle=trapped?'#1a0808':onCorrect?'#101a08':'#141420';
      ctx.fillRect(x,y,sz,sz);
      ctx.strokeStyle=trapped?'#ff3333':onCorrect?'#88cc44':'#666';
      ctx.lineWidth=Math.max(1, Math.round(T*0.055));
      ctx.strokeRect(x,y,sz,sz);
      ctx.fillStyle=trapped?'#ff6666':onCorrect?'#aaee66':'#aaa';
      ctx.font=`${Math.round(T*0.40)}px sans-serif`; ctx.textAlign='center';
      ctx.fillText(blk.sym, x+sz/2, y+sz/2+Math.round(T*0.14));
    }

    function drawChest(ctx,c,r) {
      const pad=Math.max(2,Math.round(T*0.11));
      const x=c*T+pad, y=r*T+pad, sz=T-pad*2;
      const p=0.5+Math.sin(glowT*5)*0.45;
      ctx.save(); ctx.globalAlpha=p;
      ctx.fillStyle='#1a1500'; ctx.fillRect(x,y,sz,sz);
      ctx.strokeStyle='#ddaa00'; ctx.lineWidth=Math.max(1,Math.round(T*0.055)); ctx.strokeRect(x,y,sz,sz);
      ctx.fillStyle='#ffdd33';
      ctx.font=`${Math.round(T*0.40)}px sans-serif`; ctx.textAlign='center';
      ctx.fillText('✦',x+sz/2,y+sz/2+Math.round(T*0.14)); ctx.restore();
      ctx.save();
      ctx.globalAlpha=0.5+Math.sin(glowT*4)*0.4;
      ctx.fillStyle='#ddaa00';
      ctx.font=`${Math.max(5,Math.round(T*0.14))}px "Press Start 2P",monospace`; ctx.textAlign='center';
      ctx.fillText('[ESPACO]',c*T+T/2,r*T-Math.round(T*0.06)); ctx.restore();
    }

    function drawPuzzlePlayer(ctx) {
      const x = player.col*T, y = player.row*T;
      const cx = x + T/2;
      // Ocupa ~62% da largura e ~80% da altura do tile
      const pw  = Math.round(T * 0.62);
      const ph  = Math.round(T * 0.80);
      const hx  = cx - pw/2;
      const hy  = y + Math.round(T * 0.08);

      const hw  = Math.max(3, Math.round(pw * 0.54));
      const hhh = Math.max(3, Math.round(ph * 0.32));
      const tw  = Math.max(3, Math.round(pw * 0.44));
      const th  = Math.max(3, Math.round(ph * 0.26));
      const lw  = Math.max(2, Math.round(pw * 0.30));
      const lh  = Math.max(2, Math.round(ph * 0.22));
      const headX = cx - hw/2;
      const headY = hy;
      const torsoX = cx - tw/2;
      const torsoY = headY + hhh;
      const legY   = torsoY + th;
      const eyeSz  = Math.max(1, Math.round(hw * 0.18));

      ctx.fillStyle = '#fff';
      // Cabelo
      ctx.fillRect(headX - eyeSz,     headY - Math.round(ph*0.07), hw + eyeSz*2,  Math.round(ph*0.12));
      ctx.fillRect(headX - eyeSz*2,   headY,                        eyeSz*2, hhh * 0.8);
      ctx.fillRect(headX + hw,        headY,                        eyeSz*2, hhh * 0.8);
      // Cabeça
      ctx.fillRect(headX, headY, hw, hhh);
      // Torso
      ctx.fillRect(torsoX, torsoY, tw, th);
      // Pernas
      ctx.fillRect(cx - lw - 1, legY, lw, lh);
      ctx.fillRect(cx + 1,      legY, lw, lh);
      // Olhos
      ctx.fillStyle = '#000';
      ctx.fillRect(headX + Math.round(hw*0.18), headY + Math.round(hhh*0.38), eyeSz, eyeSz);
      ctx.fillRect(headX + Math.round(hw*0.62), headY + Math.round(hhh*0.38), eyeSz, eyeSz);
    }

    function drawUI(ctx) {
      const activeCount=altars.filter(a=>a.active).length;

      ctx.fillStyle='#1e1e1e'; ctx.font='7px "Press Start 2P",monospace';
      ctx.textAlign='center';
      ctx.fillText('O GARGALO', W/2, 9);

      // Altares — margem esq
      ctx.textAlign='left'; ctx.font='5px "Press Start 2P",monospace';
      altars.forEach((a,i)=>{
        ctx.fillStyle=a.active?'#fff':'#252525';
        ctx.fillText(`${a.sym}  ${a.active?'[OK]':'[  ]'}`, 8, H/2-18+i*16);
      });

      // Dica do gargalo — margem esq embaixo
      ctx.fillStyle='#1a1a2a'; ctx.font='5px "Press Start 2P",monospace';
      ctx.fillText('SÓ 2 PASSAGENS', 8, H-18);
      ctx.fillText('NAS COLUNAS 3 E 7', 8, H-8);

      // Contador + controls — margem dir
      ctx.textAlign='right'; ctx.fillStyle='#181818';
      ctx.fillText(`MOVS: ${moves}`,  W-8, H-28);
      ctx.fillText('WASD: MOVER', W-8, H-18);
      ctx.fillText('R: RESETAR',  W-8, H-8);

      // Mensagem erro
      if (phase==='error') {
        const a=Math.min(1,phaseTimer<0.1?phaseTimer/0.1:Math.max(0,(1.4-phaseTimer)*2));
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.90)'; ctx.fillRect(W/2-165,H/2-22,330,44);
        ctx.strokeStyle='#440000'; ctx.lineWidth=2; ctx.strokeRect(W/2-165,H/2-22,330,44);
        ctx.fillStyle='#ff4444'; ctx.font='7px "Press Start 2P",monospace';
        ctx.textAlign='center'; ctx.fillText(errorMsg||'BLOQUEIO — RESETANDO', W/2, H/2+5);
        ctx.restore();
      }

      // Mensagem vitória
      if (phase==='win') {
        const a=Math.min(1,phaseTimer*2);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.90)'; ctx.fillRect(W/2-160,H/2-28,320,52);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(W/2-160,H/2-28,320,52);
        ctx.fillStyle='#fff'; ctx.font='9px "Press Start 2P",monospace';
        ctx.textAlign='center'; ctx.fillText('✦ SELOS ALINHADOS! ✦', W/2, H/2-4);
        ctx.fillStyle='#666'; ctx.font='6px "Press Start 2P",monospace';
        ctx.fillText('Vá ao centro — linha 6', W/2, H/2+16);
        ctx.restore();
      }

      if (phase==='collect') {
        const onCenter=player.col===5&&player.row===6;
        ctx.save();
        ctx.globalAlpha=onCenter?1:0.4+Math.sin(glowT*4)*0.35;
        ctx.fillStyle='#ddaa00'; ctx.font='6px "Press Start 2P",monospace';
        ctx.textAlign='center';
        ctx.fillText(onCenter?'[ESPACO] COLETAR':'CENTRO DA SALA (col 5, lin 6)', W/2, H-8);
        ctx.restore();
      }
    }

    return { start, update, render };
  }


  // ════════════════════════════════════════════════════════════════════════
  //  PIERCING BLOOD — Jogo de mira
  //  Atire nos alvos antes que escapem. 5 níveis progressivos.
  //  Mouse: mirar | Clique: atirar
  // ════════════════════════════════════════════════════════════════════════
  function shooterScene() {

    // ── Constantes ────────────────────────────────────────────────────────
    const MAX_LEVEL    = 5;
    const BASE_REQ     = 8;          // acertos nível 1; +4 por nível
    const MAX_ALIVE    = 8;          // máx inimigos simultâneos
    const SPAWN_DELAY  = 1;        // segundos entre spawns
    const ENEMY_PROJ_LIFE = 10;     // vida base dos tiros inimigos (mais alcance)
    const ENEMY_PROJ_CULL_MARGIN = 80; // margem fora da tela para descarte

    // Tipos:
    //  'blue'  → atira após timer; player pode eliminar a qualquer momento
    //  'green' → alterna SHIELD ↔ VULNERABLE; só pode ser eliminado no branco
    //            se atirar enquanto shielded, ele contra-ataca

    // Timers por nível  [azul_shoot, verde_cycle_shielded, verde_cycle_vuln]
    const LEVEL_TIMERS = [
      [3.5, 2.8, 1.4],   
      [3.0, 2.4, 1.2],
      [2.5, 2.0, 1.0],
      [2.0, 1.6, 0.9],
      [1.6, 1.3, 0.8],   
    ];

    // ── Estado ────────────────────────────────────────────────────────────
    let level, hits, reqHits, hp;
    let targets, projectiles, particles, enemyProjs;
    let mouseX, mouseY;
    let glowT, fadeIn, exitFade, shakeAmt;
    let phase, phaseTimer, spawnTimer, spawnRunning;

    // ── Helpers de layout ─────────────────────────────────────────────────
    function aL() { return W * 0.08; }
    function aR() { return W * 0.92; }
    function aT() { return H * 0.10; }
    function aB() { return H * 0.62; }
    function origX() { return W / 2; }
    function origY() { return H - 35; }

    // ── Listeners ─────────────────────────────────────────────────────────
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      mouseX = (e.clientX - r.left) * (canvas.width  / r.width);
      mouseY = (e.clientY - r.top)  * (canvas.height / r.height);
    }
    function onClick(e) {
      if (e.button !== 0 || phase !== 'playing') return;
      playerShoot();
    }

    // ── Áudio ─────────────────────────────────────────────────────────────
    function sfxPlayerShoot() {
      try {
        const ac = getAudioCtx(), osc = ac.createOscillator(), g = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.14);
        osc.start(); osc.stop(ac.currentTime + 0.14);
      } catch(_) {}
    }
    function sfxHitEnemy() {
      playTone({ freq:440, type:'square', vol:0.09, dur:0.06, decay:0.08 });
      setTimeout(() => playTone({ freq:660, type:'square', vol:0.07, dur:0.06, decay:0.08 }), 60);
    }
    function sfxShield() { playTone({ freq:220, type:'square', vol:0.07, dur:0.05, decay:0.06 }); }
    function sfxEnemyFire() {
      playTone({ freq:800, type:'sawtooth', vol:0.10, dur:0.05, decay:0.08 });
    }
    function sfxPlayerHit() {
      playTone({ freq:180, type:'sawtooth', vol:0.15, dur:0.10, decay:0.14 });
      setTimeout(() => playTone({ freq:120, type:'sawtooth', vol:0.08, dur:0.10, decay:0.10 }), 80);
    }
    function sfxMiss() { playTone({ freq:100, type:'sawtooth', vol:0.04, dur:0.04, decay:0.05 }); }
    function sfxLevelUp() {
      [330,415,523,659].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.10, dur:0.08, decay:0.10 }), i*80));
    }
    function sfxWinFx() {
      [330,415,523,659,784,988].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.10, dur:0.10, decay:0.15 }), i*90));
    }
    function sfxWarning() {
      playTone({ freq:880, type:'square', vol:0.06, dur:0.03, decay:0.04 });
    }

    // ── Spawn ─────────────────────────────────────────────────────────────
    function lvTim() { return LEVEL_TIMERS[Math.min(level-1, LEVEL_TIMERS.length-1)]; }

    function spawnEnemy() {
      if (!spawnRunning) return;
      const alive = targets.filter(t => t.alive).length;
      if (alive >= MAX_ALIVE) return;

      // nível 1 só azul, depois mistura; mais verde no final
      const greenChance = 0.2 + (level - 1) * 0.15;
      const type = Math.random() < greenChance ? 'green' : 'blue';
      const [blueSh, greenShield, greenVuln] = lvTim();

      const margin = 50;
      const x = aL() + margin + Math.random() * (aR() - aL() - margin * 2 - 34);
      const y = aT() + Math.random() * (aB() - aT() - 60);

      const t = {
        x, y, w: 30, h: 50,
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: 0.5 + Math.random() * 0.5 + (level - 1) * 0.22,
        alive: true,
        deathT: 0,
        type,
      };

      if (type === 'blue') {
        t.shootTimer  = blueSh + Math.random() * 0.5;
        t.shootTimerMax = t.shootTimer;
        t.warnFlash   = 0;
      } else {
        // green: começa shielded
        t.state       = 'shielded';        // 'shielded' | 'vulnerable'
        t.stateTimer  = greenShield;
        t.stateTimerMax = greenShield;
        t.shieldDur   = greenShield;
        t.vulnDur     = greenVuln;
        t.flashPhase  = 0;                 // para piscar ao ficar vuln
        t.retalTimer  = 0;                 // contador após contra-ataque
      }

      targets.push(t);
      spawnTimer = 0;
    }

    // ── Projétil do player ────────────────────────────────────────────────
    function playerShoot() {
      sfxPlayerShoot();
      shakeAmt = 4;
      const spd = 0.10 + (level - 1) * 0.012;
      projectiles.push({
        x: origX(), y: origY(),
        tx: mouseX, ty: mouseY,
        t: 0, speed: spd, spent: false,
      });
    }

    // ── Projétil do inimigo ────────────────────────────────────────────────
    function enemyFire(t) {
      sfxEnemyFire();
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const angle = Math.atan2(origY() - cy, origX() - cx);
      enemyProjs.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * 320,
        vy: Math.sin(angle) * 320,
        life: ENEMY_PROJ_LIFE,
      });
    }

    // ── Partículas ────────────────────────────────────────────────────────
    function spawnBlood(x, y) {
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 7;
        particles.push({ x, y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 1.5, life: 1 });
      }
    }

    // ── Reset ─────────────────────────────────────────────────────────────
    function resetLevel() {
      targets = []; projectiles = []; particles = []; enemyProjs = [];
      spawnTimer = SPAWN_DELAY * 0.3;  // primeiro spawn rápido
      spawnRunning = true;
      reqHits = BASE_REQ + (level - 1) * 4;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function start() {
      level = 1; hits = 0; hp = 3;
      glowT = 0; fadeIn = 1; exitFade = 0; shakeAmt = 0;
      phase = 'playing'; phaseTimer = 0;
      mouseX = W / 2; mouseY = H * 0.4;
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mousedown', onClick);
      canvas.style.cursor = 'none';
      resetLevel();
    }

    function stop() {
      spawnRunning = false;
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onClick);
      canvas.style.cursor = '';
    }

    // ── Update ────────────────────────────────────────────────────────────
    function update(dt) {
      glowT   += dt;
      fadeIn   = Math.max(0, fadeIn   - dt * 2.5);
      shakeAmt = Math.max(0, shakeAmt - dt * 22);

      if (phase === 'dead') {
        phaseTimer += dt;
        exitFade = Math.min(1, phaseTimer * 1.8);
        if (phaseTimer >= 2.2) { stop(); switchScene('corridor', { returnFrom: 'shooter' }); }
        return;
      }
      if (phase === 'levelup') {
        phaseTimer += dt;
        if (phaseTimer >= 2.2) {
          level++; hits = 0;
          resetLevel();
          phase = 'playing'; phaseTimer = 0;
        }
        return;
      }
      if (phase === 'win') {
        phaseTimer += dt;
        if (phaseTimer > 1.2) exitFade = Math.min(1, (phaseTimer - 1.2) * 2);
        if (phaseTimer >= 3.4) {
          stop(); run.fragments[2] = true; sfxFragmentGet();
          switchScene('corridor', { returnFrom: 'shooter' });
        }
        return;
      }
      if (phase !== 'playing') return;

      // ── Spawn ──────────────────────────────────────────────────────────
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_DELAY) spawnEnemy();

      // ── Atualiza inimigos ──────────────────────────────────────────────
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (!t.alive) {
          t.deathT += dt * 3;
          if (t.deathT >= 1) targets.splice(i, 1);
          continue;
        }

        // Movimento lateral
        t.x += t.dir * t.speed;
        if (t.x < aL() + 10 || t.x > aR() - t.w - 10) t.dir *= -1;

        if (t.type === 'blue') {
          t.shootTimer -= dt;
          t.warnFlash = t.warnFlash > 0 ? t.warnFlash - dt * 8 : 0;

          // Warning flash quando falta menos de 1s
          if (t.shootTimer <= 1.0 && Math.floor(t.shootTimer * 6) % 2 === 0) {
            if (t.warnFlash <= 0) { t.warnFlash = 1; sfxWarning(); }
          }

          if (t.shootTimer <= 0) {
            enemyFire(t);
            t.alive = false; t.deathT = 0;  // sai de cena após atirar
          }

        } else { // green
          t.stateTimer -= dt;
          t.flashPhase += dt * 12;

          if (t.stateTimer <= 0) {
            if (t.state === 'shielded') {
              t.state = 'vulnerable';
              t.stateTimer = t.vulnDur;
              t.stateTimerMax = t.vulnDur;
            } else {
              t.state = 'shielded';
              t.stateTimer = t.shieldDur;
              t.stateTimerMax = t.shieldDur;
            }
          }
        }
      }

      // ── Projéteis do player ────────────────────────────────────────────
      // FIX: checar posição atual do alvo a cada frame, não só no destino
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.t += p.speed;
        const ct = Math.min(p.t, 1);
        const cx = p.x + (p.tx - p.x) * ct;
        const cy = p.y + (p.ty - p.y) * ct;

        if (!p.spent) {
          for (let j = targets.length - 1; j >= 0; j--) {
            const t = targets[j];
            if (!t.alive) continue;
            // FIX hitbox: cobre cabeça (t.y-14) até base do corpo (t.y+30)
            if (cx >= t.x && cx <= t.x + t.w && cy >= t.y - 14 && cy <= t.y + 30) {
              resolveTargetHit(p, t, cx, cy);
              break;
            }
          }
        }

        if (p.t >= 1 || p.spent) {
          if (!p.spent) sfxMiss();
          projectiles.splice(i, 1);
        }
      }

      // ── Projéteis dos inimigos ─────────────────────────────────────────
      // FIX: usar rect hitbox para o player (cobre área das mãos)
      // Mãos desenhadas em (origX±50, origY-20); hitbox cobre essa área
      const phbX = origX() - 44, phbY = origY() - 58;
      const phbW = 88, phbH = 58;
      for (let i = enemyProjs.length - 1; i >= 0; i--) {
        const ep = enemyProjs[i];
        // Subdivisão do passo para não atravessar hitbox em fps baixo
        const steps = 3;
        let hit = false;
        for (let s = 0; s < steps && !hit; s++) {
          ep.x += ep.vx * dt / steps;
          ep.y += ep.vy * dt / steps;
          if (ep.x >= phbX && ep.x <= phbX + phbW &&
              ep.y >= phbY && ep.y <= phbY + phbH) {
            enemyProjs.splice(i, 1);
            takeDamage();
            hit = true;
          }
        }
        if (hit) continue;
        ep.life -= dt;
        if (
          ep.life <= 0 ||
          ep.x < -ENEMY_PROJ_CULL_MARGIN || ep.x > W + ENEMY_PROJ_CULL_MARGIN ||
          ep.y < -ENEMY_PROJ_CULL_MARGIN || ep.y > H + ENEMY_PROJ_CULL_MARGIN
        ) {
          enemyProjs.splice(i, 1);
        }
      }

      // ── Partículas ─────────────────────────────────────────────────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.35;
        p.life -= dt * 1.6;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    // FIX: resolveTargetHit recebe posição atual do bullet (calculada no loop)
    function resolveTargetHit(proj, t, cx, cy) {
      if (t.type === 'blue') {
        t.alive = false; t.deathT = 0;
        spawnBlood(cx, cy); sfxHitEnemy();
        proj.spent = true;
        registerHit();
      } else { // green
        if (t.state === 'vulnerable') {
          t.alive = false; t.deathT = 0;
          spawnBlood(cx, cy); sfxHitEnemy();
          proj.spent = true;
          registerHit();
        } else {
          // Escudado: contra-ataca, projétil gasto sem acertar
          sfxShield();
          enemyFire(t);
          proj.spent = true; // consome o tiro (refletido)
        }
      }
    }


    function registerHit() {
      hits++;
      if (hits >= reqHits) {
        spawnRunning = false;
        if (level >= MAX_LEVEL) { sfxWinFx(); phase = 'win'; phaseTimer = 0; stop(); }
        else                    { sfxLevelUp(); phase = 'levelup'; phaseTimer = 0; }
      }
    }

    function takeDamage() {
      hp--;
      shakeAmt = 10;
      sfxPlayerHit();
      if (hp <= 0) { phase = 'dead'; phaseTimer = 0; stop(); }
    }

    // ── Render ────────────────────────────────────────────────────────────
    function render(ctx) {
      ctx.save();
      const sx = shakeAmt * (Math.random()*2-1) * 0.5;
      const sy = shakeAmt * (Math.random()*2-1) * 0.3;
      ctx.translate(sx, sy);

      ctx.fillStyle = '#000'; ctx.fillRect(-10,-10,W+20,H+20);
      drawBG(ctx);

      // Partículas de sangue
      for (const p of particles) {
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(p.x-2, p.y-2, 4, 4);
        ctx.restore();
      }

      // Projéteis dos inimigos
      for (const ep of enemyProjs) {
        ctx.save(); ctx.globalAlpha = Math.min(1, ep.life + 0.3);
        // Rastro
        ctx.strokeStyle = 'rgba(255,200,0,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ep.x, ep.y);
        ctx.lineTo(ep.x - ep.vx * 0.04, ep.y - ep.vy * 0.04); ctx.stroke();
        // Bola
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(ep.x, ep.y, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ep.x, ep.y, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Inimigos
      for (const t of targets) {
        ctx.save();
        if (!t.alive) ctx.globalAlpha = Math.max(0, 1 - t.deathT);
        drawEnemy(ctx, t);
        ctx.restore();
      }

      // Projéteis do player
      for (const p of projectiles) {
        const cx = p.x + (p.tx - p.x) * p.t;
        const cy = p.y + (p.ty - p.y) * p.t;
        ctx.save();
        ctx.globalAlpha = 0.4 * (1 - p.t);
        ctx.strokeStyle = '#cc0000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.restore();
        const r = 6 * (1 - p.t * 0.5);
        ctx.fillStyle = '#ff2222';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI*2); ctx.fill();
      }

      drawHands(ctx);
      drawCrosshair(ctx);
      ctx.restore();

      drawHUD(ctx);
      drawOverlay(ctx);

      const fv = Math.max(fadeIn, exitFade);
      if (fv > 0) {
        ctx.save(); ctx.globalAlpha = fv;
        ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
        ctx.restore();
      }
    }

    function drawBG(ctx) {
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0,0,W,H*0.72);
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0,H*0.72,W,H*0.28);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,H*0.72,W,2);
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
      [[0,0,W*0.28,H*0.40],[W,0,W*0.72,H*0.40],
       [0,H,W*0.28,H*0.65],[W,H,W*0.72,H*0.65]].forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      ctx.fillStyle = '#161616'; ctx.fillRect(W*0.28,H*0.06,W*0.44,H*0.40);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth=2;
      ctx.strokeRect(W*0.28,H*0.06,W*0.44,H*0.40);
      ctx.strokeStyle='#222'; ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(W*0.50,H*0.06); ctx.lineTo(W*0.50,H*0.46);
      ctx.moveTo(W*0.28,H*0.26); ctx.lineTo(W*0.72,H*0.26);
      ctx.stroke();
    }

    function drawEnemy(ctx, t) {
      const cx = t.x + t.w / 2;

      // ── Determina cor base ─────────────────────────────────────────────
      let bodyCol, glowCol;
      if (t.type === 'blue') {
        const warn = t.shootTimer < 1.0;
        const flash = warn && Math.floor(glowT * 8) % 2 === 0;
        bodyCol  = flash ? '#ffffff' : '#4488ff';
        glowCol  = '#2255cc';
      } else {
        if (t.state === 'vulnerable') {
          // Pulsa entre verde-claro e branco
          const pulse = 0.5 + 0.5 * Math.sin(t.flashPhase);
          const r = Math.round(100 + pulse * 155);
          const g = 255;
          const b = Math.round(100 + pulse * 155);
          bodyCol = `rgb(${r},${g},${b})`;
          glowCol = '#44ff44';
        } else {
          bodyCol = '#22aa22';
          glowCol = '#115511';
        }
      }

      // ── Glow ──────────────────────────────────────────────────────────
      ctx.save(); ctx.globalAlpha = 0.18;
      ctx.fillStyle = glowCol;
      ctx.beginPath(); ctx.ellipse(cx, t.y+t.h*0.5, t.w*0.85, t.h*0.65, 0, 0, Math.PI*2);
      ctx.fill(); ctx.restore();

      // ── Corpo pixel-art ────────────────────────────────────────────────
      // Cabeça
      ctx.fillStyle = bodyCol;
      ctx.fillRect(t.x+9, t.y-14, 12, 11);
      // Marca facial (linha preta horizontal)
      ctx.fillStyle = '#000';
      ctx.fillRect(t.x+7, t.y-9, 16, 3);
      // Tronco
      ctx.fillStyle = bodyCol;
      ctx.fillRect(t.x+4, t.y, 22, 30);
      // Braços
      ctx.fillRect(t.x,    t.y+2, 5, 16);
      ctx.fillRect(t.x+25, t.y+2, 5, 16);
      // Listras do colete
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t.x+4,  t.y+11, 22, 2);
      ctx.fillRect(t.x+4,  t.y+22, 22, 2);

      // ── Timer acima da cabeça ─────────────────────────────────────────
      const headTop = t.y - 14;

      if (t.type === 'blue') {
        // Barra de timer horizontal (vai diminuindo enquanto timer cai)
        const barW = 34, barH = 5;
        const bx = t.x - 2, by = headTop - 14;
        const fill = Math.max(0, t.shootTimer / t.shootTimerMax);
        // Fundo
        ctx.fillStyle = '#111'; ctx.fillRect(bx, by, barW, barH);
        // Fill — vermelho quando urgente, azul quando ok
        const barColor = fill < 0.3 ? '#ff2222' : '#4488ff';
        ctx.fillStyle = barColor;
        ctx.fillRect(bx, by, barW * fill, barH);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);
        // Número de segundos
        const secs = Math.ceil(t.shootTimer);
        ctx.fillStyle = fill < 0.3 ? '#ff4444' : '#88aaff';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(secs + 's', cx, by - 2);

      } else {
        // Verde: barra do estado atual
        const barW = 34, barH = 5;
        const bx = t.x - 2, by = headTop - 14;
        const fill = Math.max(0, t.stateTimer / t.stateTimerMax);

        ctx.fillStyle = '#111'; ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = t.state === 'vulnerable' ? '#88ff88' : '#116611';
        ctx.fillRect(bx, by, barW * fill, barH);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);

        const secs = Math.ceil(t.stateTimer);
        ctx.fillStyle = t.state === 'vulnerable' ? '#aaffaa' : '#338833';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        if (t.state === 'vulnerable') {
          ctx.fillText('✓ ' + secs + 's', cx, by - 2);
        } else {
          ctx.fillText(secs + 's', cx, by - 2);
        }
      }
    }

    function drawHands(ctx) {
      const bx = origX(), by = origY();
      const sk = shakeAmt * (Math.random()*2-1) * 0.4;

      function hand(cx, side) {
        ctx.save();
        ctx.translate(cx + sk, by);
        if (side === 'right') ctx.scale(-1,1);
        ctx.fillStyle = '#111'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(40,110); ctx.lineTo(10,-5);
        ctx.lineTo(75,-5); ctx.lineTo(120,110);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8c8c8';
        ctx.beginPath(); ctx.roundRect(2,-38,44,56,5); ctx.fill(); ctx.stroke();
        for (let i=0;i<4;i++) {
          ctx.beginPath(); ctx.roundRect(8+i*9,-62,7,28,3); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#000'; ctx.fillRect(-4,-28,52,8);
        ctx.restore();
      }

      hand(bx - 50, 'left');
      hand(bx + 50, 'right');
    }

    function drawCrosshair(ctx) {
      const mx=mouseX, my=mouseY;
      const pulse = 0.7 + Math.sin(glowT*8)*0.3;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ff2222'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx-20,my); ctx.lineTo(mx-7,my);
      ctx.moveTo(mx+7, my); ctx.lineTo(mx+20,my);
      ctx.moveTo(mx,my-20); ctx.lineTo(mx,my-7);
      ctx.moveTo(mx,my+7);  ctx.lineTo(mx,my+20);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,34,34,0.55)';
      ctx.beginPath(); ctx.arc(mx,my,8,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    function drawHUD(ctx) {
      // Vidas
      ctx.textAlign = 'left'; ctx.font = '8px "Press Start 2P",monospace';
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < hp ? '#ff4444' : '#222';
        ctx.fillText('♥', 12 + i*22, 22);
      }

      // Progresso
      ctx.fillStyle = '#cc0000'; ctx.font = '7px "Press Start 2P",monospace';
      ctx.fillText(`${hits} / ${reqHits}`, 12, 38);
      const bw=140, bh=5, bx=12, by=44;
      const fill = Math.min(1, hits/reqHits);
      ctx.fillStyle='#1a0000'; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle='#880000'; ctx.fillRect(bx,by,bw*fill,bh);
      ctx.strokeStyle='#2a0000'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);

      // Nível
      ctx.textAlign='right'; ctx.fillStyle='#333';
      ctx.font='7px "Press Start 2P",monospace';
      ctx.fillText(`NIV ${level}/${MAX_LEVEL}`, W-12, 22);

      // Legenda tipos
      ctx.font = '5px "Press Start 2P",monospace';
      ctx.fillStyle='#4488ff'; ctx.fillText('■ ATIRADOR: atire a qualquer hora', W-12, H-22);
      ctx.fillStyle='#44cc44'; ctx.fillText('■ ESCUDO: aguarde ficar branco (✓)', W-12, H-10);
    }

    function drawOverlay(ctx) {
      if (phase==='levelup') {
        const a = Math.min(1, phaseTimer*3.5);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fillRect(W/2-200,H/2-36,400,66);
        ctx.strokeStyle='#cc0000'; ctx.lineWidth=2;
        ctx.strokeRect(W/2-200,H/2-36,400,66);
        ctx.fillStyle='#ff2222'; ctx.font='11px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('TÉCNICA REFINADA!', W/2, H/2-8);
        ctx.fillStyle='#660000'; ctx.font='7px "Press Start 2P",monospace';
        ctx.fillText(`NÍVEL ${level+1} / ${MAX_LEVEL}`, W/2, H/2+18);
        ctx.restore();
      }
      if (phase==='dead') {
        const a = Math.min(1, phaseTimer*3);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(40,0,0,0.90)'; ctx.fillRect(W/2-180,H/2-36,360,66);
        ctx.strokeStyle='#ff2222'; ctx.lineWidth=2; ctx.strokeRect(W/2-180,H/2-36,360,66);
        ctx.fillStyle='#ff4444'; ctx.font='10px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('VOCÊ FOI ATINGIDA', W/2, H/2-8);
        ctx.fillStyle='#662222'; ctx.font='6px "Press Start 2P",monospace';
        ctx.fillText('Voltando ao corredor...', W/2, H/2+18);
        ctx.restore();
      }
      if (phase==='win') {
        const a = Math.min(1, phaseTimer*2.2);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.90)'; ctx.fillRect(W/2-200,H/2-36,400,66);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(W/2-200,H/2-36,400,66);
        ctx.fillStyle='#fff'; ctx.font='10px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('\u2736 DOMÍNIO COMPLETO! \u2736', W/2, H/2-8);
        ctx.fillStyle='#555'; ctx.font='6px "Press Start 2P",monospace';
        ctx.fillText('Retornando ao corredor...', W/2, H/2+18);
        ctx.restore();
      }
    }

    return { start, update, render };
  }





  // ════════════════════════════════════════════════════════════════════════
  //  ARENA DE ESQUIVA
  //  Ação em tempo real. Movimento contínuo com WASD/setas.
  //  3 ondas de projéteis com padrões diferentes. 3 vidas.
  //  Sobreviva as 3 ondas para completar o desafio.
  // ════════════════════════════════════════════════════════════════════════
  function dodgeScene() {

    const MARGIN   = 40;
    const P_SPEED  = 210;
    const P_R      = 10;
    const PROJ_R   = 5;
    const MAX_HP   = 3;
    const IFRAMES  = 0.85;
    const WAVE_DUR = [10, 14, 17, 18];
    const TOTAL_WAVES = 4;

    const soulImg = new Image();
    soulImg.src = './sprt/characters/soul.png';

    let px, py, hp, iTimer, projs;
    let wave, waveTimer, spawnAcc;
    let glowT, fadeIn, exitFade;
    let phase, phaseTimer;
    let shakeX, shakeY;
    let spiralAngle = 0;

    function sfxShoot()  { playTone({ freq:440, type:'square',  vol:0.05, dur:0.02, decay:0.03 }); }
    function sfxHit()    {
      playTone({ freq:180, type:'sawtooth', vol:0.15, dur:0.08, decay:0.12 });
      setTimeout(() => playTone({ freq:120, type:'sawtooth', vol:0.10, dur:0.10, decay:0.10 }), 90);
    }
    function sfxDead()   {
      [220,196,165,140].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'sawtooth', vol:0.12, dur:0.14, decay:0.12 }), i*120));
    }
    function sfxClear()  {
      [523,659,784].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.09, dur:0.09, decay:0.12 }), i*100));
    }
    function sfxWin2() {
      [330,415,523,659,784,988].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.10, dur:0.10, decay:0.15 }), i*100));
    }
    function sfxCountdown() { playTone({ freq:660, type:'square', vol:0.08, dur:0.06, decay:0.05 }); }

    function arenaL()  { return MARGIN; }
    function arenaR()  { return W - MARGIN; }
    function arenaT()  { return MARGIN + 30; }
    function arenaB()  { return H - MARGIN - 20; }
    function arenaCX() { return (arenaL() + arenaR()) / 2; }
    function arenaCY() { return (arenaT() + arenaB()) / 2; }

    function spawnFromEdge(speedMult) {
      const side = Math.random() * 4 | 0;
      let x, y;
      const spd = (160 + Math.random() * 110) * speedMult;
      if (side===0){x=arenaL()+Math.random()*(arenaR()-arenaL());y=arenaT();}
      else if(side===1){x=arenaR();y=arenaT()+Math.random()*(arenaB()-arenaT());}
      else if(side===2){x=arenaL()+Math.random()*(arenaR()-arenaL());y=arenaB();}
      else{x=arenaL();y=arenaT()+Math.random()*(arenaB()-arenaT());}
      const a=Math.atan2(arenaCY()-y, arenaCX()-x)+(Math.random()-0.5)*0.8;
      projs.push({x, y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, type:'normal', r:PROJ_R});
    }

    function spawnWave1(tick) {
      if (tick%12===0) {
        const y=arenaT()+Math.random()*(arenaB()-arenaT());
        const dir=Math.random()>0.5?1:-1;
        const sx=dir>0?arenaL():arenaR();
        for(let i=0;i<7;i++)
          projs.push({x:sx, y:y+(i-3)*18, vx:185*dir, vy:0, type:'sweep', r:PROJ_R});
        sfxShoot();
      }
      if (tick%18===9) spawnFromEdge(1.1);
    }

    function spawnWave2(tick) {
      if (tick%5===0) {
        spiralAngle+=0.55;
        const spd=200;
        for(let k=0;k<4;k++){
          const a=spiralAngle+k*(Math.PI*2/4);
          projs.push({x:arenaCX(),y:arenaCY(),vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,type:'spiral',r:PROJ_R-1});
        }
        sfxShoot();
      }
      if (tick%28===14) {
        [[arenaL(),arenaT()],[arenaR(),arenaT()],[arenaL(),arenaB()],[arenaR(),arenaB()]].forEach(([cx2,cy2])=>{
          const a=Math.atan2(arenaCY()-cy2,arenaCX()-cx2);
          projs.push({x:cx2,y:cy2,vx:Math.cos(a)*220,vy:Math.sin(a)*220,type:'corner',r:PROJ_R});
        });
        sfxShoot();
      }
    }

    function spawnWave3(tick) {
      if (tick%9===0) {
        const side=Math.random()*4|0;
        let sx,sy;
        if(side===0){sx=arenaL()+Math.random()*(arenaR()-arenaL());sy=arenaT();}
        else if(side===1){sx=arenaR();sy=arenaT()+Math.random()*(arenaB()-arenaT());}
        else if(side===2){sx=arenaL()+Math.random()*(arenaR()-arenaL());sy=arenaB();}
        else{sx=arenaL();sy=arenaT()+Math.random()*(arenaB()-arenaT());}
        const a=Math.atan2(py-sy,px-sx);
        projs.push({x:sx,y:sy,vx:Math.cos(a)*260,vy:Math.sin(a)*260,type:'tracking',r:PROJ_R+1});
        sfxShoot();
      }
      if (tick%7===3) {
        const x=arenaL()+Math.random()*(arenaR()-arenaL());
        projs.push({x,y:arenaT(),vx:(Math.random()-0.5)*50,vy:270,type:'rain',r:PROJ_R-1});
      }
    }

    function spawnWave4(tick) {
      // Sweeps
      if (tick%14===0) {
        const y=arenaT()+Math.random()*(arenaB()-arenaT());
        const dir=Math.random()>0.5?1:-1;
        const sx=dir>0?arenaL():arenaR();
        for(let i=0;i<5;i++)
          projs.push({x:sx, y:y+(i-2)*20, vx:170*dir, vy:0, type:'sweep', r:PROJ_R});
        sfxShoot();
      }
      // 5-arm spiral
      if (tick%7===0) {
        spiralAngle+=0.42;
        for(let k=0;k<3;k++){
          const a=spiralAngle+k*(Math.PI*2/3);
          projs.push({x:arenaCX(),y:arenaCY(),vx:Math.cos(a)*170,vy:Math.sin(a)*170,type:'spiral',r:PROJ_R-1});
        }
        sfxShoot();
      }
      // Radial burst
      if (tick%240===0) {
        for(let k=0;k<6;k++){
          const a=k*(Math.PI*2/6);
          projs.push({x:arenaCX(),y:arenaCY(),vx:Math.cos(a)*185,vy:Math.sin(a)*185,type:'corner',r:PROJ_R});
        }
        sfxShoot();
      }
    }

    const SPAWN_FNS=[spawnWave1,spawnWave2,spawnWave3,spawnWave4];

    function resetPlayerPosition() {
      px=arenaCX();
      py=arenaB()-P_R-26;
    }

    function resetState() {
      resetPlayerPosition();
      hp=MAX_HP; iTimer=0;
      projs=[]; wave=0; waveTimer=0; spawnAcc=0;
      spiralAngle=0; shakeX=0; shakeY=0;
    }

    function start() {
      resetState();
      glowT=0; fadeIn=1; exitFade=0;
      phase='countdown'; phaseTimer=3.0;
      sfxCountdown();
    }

    function update(dt) {
      glowT+=dt; fadeIn=Math.max(0,fadeIn-dt*2.5);
      shakeX*=0.82; shakeY*=0.82;
      if(Math.abs(shakeX)<0.3)shakeX=0;
      if(Math.abs(shakeY)<0.3)shakeY=0;

      if (phase==='countdown') {
        const prev=phaseTimer;
        phaseTimer-=dt;
        if(prev>2&&phaseTimer<=2)sfxCountdown();
        if(prev>1&&phaseTimer<=1)sfxCountdown();
        if(phaseTimer<=0){phase='playing';phaseTimer=0;}
        return;
      }
      if (phase==='waveClear') {
        phaseTimer+=dt;
        if(phaseTimer>=2.2){
          wave++;
          if(wave>=TOTAL_WAVES){sfxWin2();phase='win';phaseTimer=0;}
          else{projs=[];waveTimer=0;spawnAcc=0;resetPlayerPosition();phase='countdown';phaseTimer=3.0;sfxCountdown();}
        }
        return;
      }
      if (phase==='dead') {
        phaseTimer+=dt;
        exitFade=Math.min(1,phaseTimer*1.5);
        if(phaseTimer>=2.0) switchScene('corridor',{returnFrom:'dodge'});
        return;
      }
      if (phase==='win') {
        phaseTimer+=dt;
        if(phaseTimer>1.5) exitFade=Math.min(1,(phaseTimer-1.5)*2);
        if(phaseTimer>=3.2){run.fragments[1]=true;sfxFragmentGet();switchScene('corridor',{returnFrom:'dodge'});}
        return;
      }
      if (phase!=='playing'&&phase!=='hit') return;
      if (phase==='hit'){phaseTimer+=dt;if(phaseTimer>=0.4){phase='playing';phaseTimer=0;}}

      // Movimento
      let dx=0,dy=0;
      if(keys['ArrowLeft']||keys['KeyA'])dx-=1;
      if(keys['ArrowRight']||keys['KeyD'])dx+=1;
      if(keys['ArrowUp']||keys['KeyW'])dy-=1;
      if(keys['ArrowDown']||keys['KeyS'])dy+=1;
      if(dx&&dy){dx*=0.707;dy*=0.707;}
      px=Math.max(arenaL()+P_R,Math.min(arenaR()-P_R,px+dx*P_SPEED*dt));
      py=Math.max(arenaT()+P_R,Math.min(arenaB()-P_R,py+dy*P_SPEED*dt));

      // Spawn
      waveTimer+=dt;
      spawnAcc+=dt*60;
      const ticks=Math.floor(spawnAcc);
      spawnAcc-=ticks;
      const base=Math.floor(waveTimer*60);
      for(let i=0;i<ticks;i++) SPAWN_FNS[wave](base-ticks+i);

      if(waveTimer>=WAVE_DUR[wave]){sfxClear();phase='waveClear';phaseTimer=0;return;}

      // Move e limpa projéteis
      projs.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;});
      projs=projs.filter(p=>p.x>arenaL()-60&&p.x<arenaR()+60&&p.y>arenaT()-60&&p.y<arenaB()+60);

      // Colisão
      if(iTimer>0){iTimer-=dt;return;}
      for(const p of projs){
        const dx2=p.x-px,dy2=p.y-py;
        if(dx2*dx2+dy2*dy2<(P_R+p.r-2)**2){
          hp--; iTimer=IFRAMES; sfxHit(); shakeX=8; shakeY=6;
          projs=projs.filter(q=>q!==p);
          if(hp<=0){sfxDead();phase='dead';phaseTimer=0;}
          else{phase='hit';phaseTimer=0;}
          break;
        }
      }
    }

    function render(ctx) {
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      ctx.save();
      ctx.translate(shakeX*(Math.random()*2-1)*0.5, shakeY*(Math.random()*2-1)*0.5);
      drawArena(ctx);
      projs.forEach(p=>drawProj(ctx,p));
      drawArenaPlayer(ctx);
      ctx.restore();
      drawDodgeHUD(ctx);
      drawDodgeOverlay(ctx);
      const fv=Math.max(fadeIn,exitFade);
      if(fv>0){ctx.save();ctx.globalAlpha=fv;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();}
    }

    function drawArena(ctx) {
      ctx.fillStyle='#030308';
      ctx.fillRect(arenaL(),arenaT(),arenaR()-arenaL(),arenaB()-arenaT());
      ctx.strokeStyle='#0a0a14'; ctx.lineWidth=1;
      for(let x=arenaL();x<=arenaR();x+=40){ctx.beginPath();ctx.moveTo(x,arenaT());ctx.lineTo(x,arenaB());ctx.stroke();}
      for(let y=arenaT();y<=arenaB();y+=40){ctx.beginPath();ctx.moveTo(arenaL(),y);ctx.lineTo(arenaR(),y);ctx.stroke();}
      const pulse=0.5+Math.sin(glowT*2)*0.3;
      ctx.save(); ctx.globalAlpha=pulse*0.7;
      ctx.strokeStyle=wave===0?'#336':wave===1?'#363':wave===2?'#633':'#a62';
      ctx.lineWidth=3;
      ctx.strokeRect(arenaL(),arenaT(),arenaR()-arenaL(),arenaB()-arenaT());
      ctx.restore();
      ctx.save();
      const vg=ctx.createRadialGradient(arenaCX(),arenaCY(),Math.min(arenaR()-arenaL(),arenaB()-arenaT())*0.2,arenaCX(),arenaCY(),Math.max(arenaR()-arenaL(),arenaB()-arenaT())*0.7);
      vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.55)');
      ctx.fillStyle=vg; ctx.fillRect(arenaL(),arenaT(),arenaR()-arenaL(),arenaB()-arenaT());
      ctx.restore();
    }

    function drawProj(ctx,p) {
      const cols={normal:['#88aaff','#4466cc'],sweep:['#ffaa44','#cc6600'],spiral:['#ff44aa','#cc0066'],corner:['#44ffaa','#00cc66'],tracking:['#ff4444','#cc0000'],rain:['#aaddff','#5588bb']};
      const [bright]=(cols[p.type]||cols.normal);
      ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle=bright;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2); ctx.fill(); ctx.restore();
      ctx.fillStyle=bright; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.35,0,Math.PI*2); ctx.fill();
    }

    function drawArenaPlayer(ctx) {
      if(iTimer>0&&Math.floor(iTimer*10)%2===0) return;
      ctx.save(); ctx.globalAlpha=0.30+Math.sin(glowT*4)*0.12;
      ctx.fillStyle='#ff4488'; ctx.beginPath(); ctx.arc(px,py,P_R*2.4,0,Math.PI*2); ctx.fill(); ctx.restore();
      const sz=P_R*2;
      if(soulImg.complete&&soulImg.naturalWidth>0){
        ctx.drawImage(soulImg,px-sz,py-sz,sz*2,sz*2);
      } else {
        ctx.fillStyle='#ff4488'; ctx.beginPath(); ctx.arc(px,py,P_R,0,Math.PI*2); ctx.fill();
      }
    }

    function drawDodgeHUD(ctx) {
      for(let i=0;i<MAX_HP;i++){
        ctx.fillStyle=i<hp?'#ff4444':'#222';
        ctx.font='8px "Press Start 2P",monospace'; ctx.textAlign='left';
        ctx.fillText('♥',arenaL()+i*22,arenaT()-10);
      }
      ctx.textAlign='center'; ctx.fillStyle='#2a2a2a';
      ctx.font='6px "Press Start 2P",monospace';
      ctx.fillText(`ONDA ${wave+1} / ${TOTAL_WAVES}`,W/2,arenaT()-10);
      if(phase==='playing'||phase==='hit'){
        const rem=Math.max(0,WAVE_DUR[wave]-waveTimer);
        const bw=(arenaR()-arenaL())*(rem/WAVE_DUR[wave]);
        ctx.fillStyle='#111'; ctx.fillRect(arenaL(),arenaT()-5,arenaR()-arenaL(),3);
        ctx.fillStyle=wave===0?'#2244aa':wave===1?'#226622':wave===2?'#aa2222':'#cc4411';
        ctx.fillRect(arenaL(),arenaT()-5,bw,3);
      }
      ctx.textAlign='right'; ctx.fillStyle='#1a1a1a';
      ctx.font='5px "Press Start 2P",monospace';
      ctx.fillText('WASD / SETAS: MOVER',arenaR(),arenaT()-10);
    }

    function drawDodgeOverlay(ctx) {
      if(phase==='countdown'){
        const n=Math.ceil(phaseTimer);
        const frac=phaseTimer%1;
        ctx.save(); ctx.globalAlpha=Math.min(1,frac*4);
        ctx.fillStyle='#fff'; ctx.textAlign='center';
        ctx.font=`${70+(1-frac)*30}px "Press Start 2P",monospace`;
        ctx.fillText(n>0?String(n):'GO!',W/2,H/2+24); ctx.restore();
      }
      if(phase==='waveClear'){
        const a=Math.min(1,phaseTimer*3);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.80)'; ctx.fillRect(W/2-150,H/2-28,300,50);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(W/2-150,H/2-28,300,50);
        ctx.fillStyle='#fff'; ctx.font='10px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText(`ONDA ${wave+1} COMPLETA!`,W/2,H/2+4); ctx.restore();
      }
      if(phase==='win'){
        const a=Math.min(1,phaseTimer*2);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(W/2-170,H/2-36,340,68);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(W/2-170,H/2-36,340,68);
        ctx.fillStyle='#fff'; ctx.font='10px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('\u2736 ARENA SUPERADA! \u2736',W/2,H/2-6);
        ctx.fillStyle='#666'; ctx.font='6px "Press Start 2P",monospace';
        ctx.fillText('Retornando ao corredor...',W/2,H/2+18); ctx.restore();
      }
      if(phase==='dead'){
        const a=Math.min(1,phaseTimer*2.5);
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='rgba(40,0,0,0.88)'; ctx.fillRect(W/2-150,H/2-30,300,56);
        ctx.strokeStyle='#ff2222'; ctx.lineWidth=2; ctx.strokeRect(W/2-150,H/2-30,300,56);
        ctx.fillStyle='#ff4444'; ctx.font='10px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('ELIMINADA',W/2,H/2-4);
        ctx.fillStyle='#662222'; ctx.font='6px "Press Start 2P",monospace';
        ctx.fillText('Voltando ao corredor...',W/2,H/2+20); ctx.restore();
      }
    }

    return { start, update, render };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PLATAFORMA DA JORNADA — side-scrolling platformer
  //  Chegue à porta no topo da torre saltando entre plataformas.
  //  WASD/setas para mover, Espaço/W/cima para pular (coyote time).
  //  Cair no vazio reinicia do início da sala atual.
  // ════════════════════════════════════════════════════════════════════════
  function platformScene() {

    // ── Layout fixo ───────────────────────────────────────────────────────
    // Corredor vertical estreito. Player anda nas 4 direções e empurra a caixa.
    // O botão fica no topo. Ao posar a caixa no botão, a porta abre.
    const COLS   = 7;
    const ROWS   = 14;
    function T()   { return Math.floor(Math.min(W / COLS, H / ROWS)); }
    function OX()  { return Math.floor((W - COLS * T()) / 2); }
    function OY()  { return Math.floor((H - ROWS * T()) / 2); }

    // Mapa: corredor aberto. Player empurra caixa para o botão no topo.
    // Sem divisórias — o desafio é a quebra de expectativa (simples de propósito).
    //   col: 0 1 2 3 4 5 6
    const MAP = [
      [1,1,1,1,1,1,1],  // r0  teto
      [1,0,0,0,0,0,1],  // r1  ← botão em col3
      [1,0,0,0,0,0,1],  // r2
      [1,0,0,0,0,0,1],  // r3
      [1,0,0,0,0,0,1],  // r4
      [1,0,0,0,0,0,1],  // r5
      [1,0,0,0,0,0,1],  // r6
      [1,0,0,0,0,0,1],  // r7
      [1,0,0,0,0,0,1],  // r8
      [1,0,0,0,0,0,1],  // r9
      [1,0,0,0,0,0,1],  // r10 ← caixa spawn
      [1,0,0,0,0,0,1],  // r11
      [1,0,0,0,0,0,1],  // r12 ← player spawn
      [1,1,1,1,1,1,1],  // r13 chão
    ];

    const BTN_COL = 3, BTN_ROW = 1;
    const BOX_INIT = { col: 3, row: 10 };
    const PLR_INIT = { col: 3, row: 12 };

    // ── Estado ────────────────────────────────────────────────────────────
    let playerCol, playerRow, boxCol, boxRow;
    let btnPressed, doorOpen;
    let glowT, fadeIn, exitFade;
    let phase, phaseTimer;   // 'playing'|'win'|'done'
    let pressedCooldown;     // evita duplo input

    // ── Áudio ─────────────────────────────────────────────────────────────
    function sfxStep()   { playTone({ freq:120, type:'square', vol:0.04, dur:0.02, decay:0.03 }); }
    function sfxPush()   { playTone({ freq:160, type:'square', vol:0.06, dur:0.04, decay:0.05 }); }
    function sfxBtn()    {
      playTone({ freq:440, type:'square', vol:0.10, dur:0.06, decay:0.08 });
      setTimeout(() => playTone({ freq:660, type:'square', vol:0.08, dur:0.08, decay:0.10 }), 70);
    }
    function sfxDoor()   {
      [220,330,440,550].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.09, dur:0.08, decay:0.10 }), i*60));
    }
    function sfxWin()    {
      [330,415,523,659,784].forEach((f,i) =>
        setTimeout(() => playTone({ freq:f, type:'square', vol:0.10, dur:0.10, decay:0.14 }), i*90));
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    function isWall(col, row) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
      return MAP[row][col] === 1;
    }

    function resetState() {
      playerCol = PLR_INIT.col; playerRow = PLR_INIT.row;
      boxCol    = BOX_INIT.col; boxRow    = BOX_INIT.row;
      btnPressed = false; doorOpen = false;
      pressedCooldown = 0;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    function start() {
      resetState();
      glowT = 0; fadeIn = 1; exitFade = 0;
      phase = 'playing'; phaseTimer = 0;
    }

    function update(dt) {
      glowT += dt; fadeIn = Math.max(0, fadeIn - dt * 2.5);
      pressedCooldown = Math.max(0, pressedCooldown - dt);

      if (phase === 'win') {
        phaseTimer += dt;
        if (phaseTimer > 1.0) exitFade = Math.min(1, (phaseTimer - 1.0) * 2);
        if (phaseTimer >= 3.0) {
          run.fragments[3] = true; sfxFragmentGet();
          switchScene('corridor', { returnFrom: 'platform' });
        }
        return;
      }
      if (phase !== 'playing') return;

      // Input — um passo por pressão
      if (pressedCooldown > 0) return;

      let dc = 0, dr = 0;
      if (justPressed['ArrowUp']    || justPressed['KeyW']) dr = -1;
      if (justPressed['ArrowDown']  || justPressed['KeyS']) dr =  1;
      if (justPressed['ArrowLeft']  || justPressed['KeyA']) dc = -1;
      if (justPressed['ArrowRight'] || justPressed['KeyD']) dc =  1;
      if (dc === 0 && dr === 0) return;

      const nc = playerCol + dc;
      const nr = playerRow + dr;

      if (isWall(nc, nr)) return; // bateu na parede

      // Checa se há caixa na próxima posição
      if (nc === boxCol && nr === boxRow) {
        const bc2 = boxCol + dc;
        const br2 = boxRow + dr;
        if (isWall(bc2, br2)) return; // caixa não pode ir (parede)
        // Move caixa
        boxCol = bc2; boxRow = br2;
        sfxPush();

        // Checa botão
        const wasPressed = btnPressed;
        btnPressed = (boxCol === BTN_COL && boxRow === BTN_ROW);
        if (btnPressed && !wasPressed) {
          sfxBtn();
          setTimeout(() => { doorOpen = true; sfxDoor(); }, 400);
        } else if (!btnPressed && wasPressed) {
          doorOpen = false;
        }
      }

      // Move player
      playerCol = nc; playerRow = nr;
      sfxStep();

      pressedCooldown = 0.10; // pequeno cooldown anti-repeat

      // Chegou na porta (linha 1, qualquer col interna)
      if (doorOpen && playerRow === 1 && playerCol >= 1 && playerCol <= 5) {
        sfxWin(); phase = 'win'; phaseTimer = 0;
      }
    }

    // ── Render ────────────────────────────────────────────────────────────
    function render(ctx) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      drawLevel(ctx);
      drawBox(ctx);
      drawPlayer(ctx);
      drawHUD(ctx);
      drawWinOverlay(ctx);

      const fv = Math.max(fadeIn, exitFade);
      if (fv > 0) {
        ctx.save(); ctx.globalAlpha = fv;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    function tx2px(col) { return OX() + col * T(); }
    function ty2px(row) { return OY() + row * T(); }

    function drawLevel(ctx) {
      const t = T();

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const px = tx2px(c), py = ty2px(r);
          if (MAP[r][c] === 1) {
            // Parede
            ctx.fillStyle = '#111';
            ctx.fillRect(px, py, t, t);
            ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
          } else {
            // Chão
            ctx.fillStyle = '#080808';
            ctx.fillRect(px, py, t, t);
          }
        }
      }

      // Botão
      const bpx = tx2px(BTN_COL), bpy = ty2px(BTN_ROW);
      const bx = bpx + t * 0.2, bw = t * 0.6, bh = t * 0.18;
      const by2 = bpy + t - bh - 2;
      ctx.fillStyle = btnPressed ? '#44cc44' : '#996600';
      ctx.fillRect(bx, by2, bw, bh);
      ctx.strokeStyle = btnPressed ? '#88ff88' : '#ffaa00';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by2, bw, bh);

      // Porta (topo do corredor, linha 0 col 3)
      const dpx = tx2px(BTN_COL), dpy = ty2px(0);
      if (doorOpen) {
        // Porta aberta — vão brilhante
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(glowT * 4) * 0.3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dpx + 2, dpy + 2, t - 4, t - 4);
        ctx.restore();
      } else {
        // Porta fechada
        ctx.fillStyle = '#1a1200';
        ctx.fillRect(dpx + 2, dpy + 2, t - 4, t - 4);
        ctx.strokeStyle = '#554400'; ctx.lineWidth = 1;
        ctx.strokeRect(dpx + 2, dpy + 2, t - 4, t - 4);
        // Cadeado
        if (!btnPressed) {
          ctx.fillStyle = '#332200';
          ctx.font = `${Math.max(8, t * 0.4)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('🔒', dpx + t / 2, dpy + t * 0.65);
        }
      }

      // Hint de seta sobre o botão (pisca)
      if (!btnPressed && Math.floor(glowT * 2) % 2 === 0) {
        ctx.fillStyle = '#443300';
        ctx.font = `${Math.max(7, t * 0.35)}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('▣', tx2px(BTN_COL) + t / 2, ty2px(BTN_ROW) + t / 2 + 3);
      }
    }

    function drawBox(ctx) {
      const t = T();
      const px = tx2px(boxCol), py = ty2px(boxRow);
      const pad = Math.max(2, t * 0.08);

      // Sombra
      ctx.save(); ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(px + pad + 2, py + pad + 3, t - pad*2, t - pad*2);
      ctx.restore();

      // Corpo da caixa
      ctx.fillStyle = '#442200';
      ctx.fillRect(px + pad, py + pad, t - pad*2, t - pad*2);
      ctx.strokeStyle = '#cc6600'; ctx.lineWidth = 2;
      ctx.strokeRect(px + pad, py + pad, t - pad*2, t - pad*2);

      // Cruz interna
      ctx.strokeStyle = '#663300'; ctx.lineWidth = 1;
      const cx2 = px + t/2, cy2 = py + t/2;
      ctx.beginPath();
      ctx.moveTo(px+pad, cy2); ctx.lineTo(px+t-pad, cy2);
      ctx.moveTo(cx2, py+pad); ctx.lineTo(cx2, py+t-pad);
      ctx.stroke();
    }

    function drawPlayer(ctx) {
      const t = T();
      const px = tx2px(playerCol), py = ty2px(playerRow);
      const cx = px + t / 2;
      const pw = t * 0.50, ph = t * 0.75;
      const pLeft = cx - pw/2, pTop = py + (t - ph) / 2;

      // Corpo
      ctx.fillStyle = '#fff';
      // Cabeça
      ctx.fillRect(cx - pw*0.38, pTop, pw*0.76, ph*0.28);
      // Cabelo longo
      ctx.fillRect(cx - pw*0.45, pTop, pw*0.90, ph*0.18);
      ctx.fillRect(cx - pw*0.48, pTop + ph*0.06, pw*0.14, ph*0.55);
      ctx.fillRect(cx + pw*0.34, pTop + ph*0.06, pw*0.14, ph*0.55);
      // Olhos
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - pw*0.22, pTop + ph*0.10, pw*0.12, ph*0.10);
      ctx.fillRect(cx + pw*0.10, pTop + ph*0.10, pw*0.12, ph*0.10);
      // Tronco
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - pw*0.34, pTop + ph*0.30, pw*0.68, ph*0.38);
      // Pernas
      ctx.fillRect(cx - pw*0.30, pTop + ph*0.68, pw*0.24, ph*0.30);
      ctx.fillRect(cx + pw*0.06, pTop + ph*0.68, pw*0.24, ph*0.30);
    }

    function drawHUD(ctx) {
      ctx.textAlign = 'center';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText('WASD: MOVER  |  EMPURRE A CAIXA NO BOTÃO', W/2, H - 8);

      if (btnPressed && !doorOpen) {
        ctx.fillStyle = '#665500';
        ctx.fillText('PORTA ABRINDO...', W/2, 18);
      }
      if (doorOpen) {
        const pulse = 0.5 + Math.abs(Math.sin(glowT * 4)) * 0.5;
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fff';
        ctx.fillText('PORTA ABERTA — SUBA!', W/2, 18);
        ctx.restore();
      }
    }

    function drawWinOverlay(ctx) {
      if (phase !== 'win') return;
      const a = Math.min(1, phaseTimer * 2.5);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.fillRect(W/2-180, H/2-32, 360, 60);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(W/2-180, H/2-32, 360, 60);
      ctx.fillStyle = '#fff'; ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u2736 FRAGMENTO OBTIDO! \u2736', W/2, H/2-4);
      ctx.fillStyle = '#555'; ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillText('Retornando ao corredor...', W/2, H/2+20);
      ctx.restore();
    }

    return { start, update, render };
  }


  // ════════════════════════════════════════════════════════════════════════
  function memoryPathScene() {

    const WORLD_H = 2200;
    const COR_W   = 176;
    const COR_L   = (W - COR_W) / 2;
    const COR_R   = COR_L + COR_W;
    const P_W = 16, P_H = 24;
    const SPEED = 96;
    const DLG_SPD = 0.04;
    const EXPLODE_GIF_SRC = './sprt/explodi.gif';
    const EXPLODE_SFX_SRC = './sons/explodi.mp3';
    const LETTER_POS = { x: () => W / 2 - 9, y: () => FINAL_FIGURE.worldY + 52, w: 18, h: 14 };

    const MEMORY_FRAME_DEFS = [
      { worldY: 1920, side: 'left',  label: 'MEMORIA 01', src: '../sprt/fotos/foto1.jpeg' },
      { worldY: 1770, side: 'right', label: 'MEMORIA 02', src: '../sprt/fotos/foto2' },
      { worldY: 1600, side: 'left',  label: 'MEMORIA 03', src: '../sprt/fotos/foto3' },
      { worldY: 1430, side: 'right', label: 'MEMORIA 04', src: '../sprt/fotos/foto4' },
      { worldY: 1260, side: 'left',  label: 'MEMORIA 05', src: '../sprt/fotos/foto5' },
      { worldY: 1090, side: 'right', label: 'MEMORIA 06', src: '../sprt/fotos/foto6' },
      { worldY: 920,  side: 'left',  label: 'MEMORIA 07', src: '../sprt/fotos/foto7' },
      { worldY: 750,  side: 'right', label: 'MEMORIA 08', src: '../sprt/fotos/foto8' },
    ];

    const FINAL_FIGURE = {
      worldY: 280,
      label: 'Lucas',
      name: 'Lucas',
      spriteSrc: '',
    };

    const FINAL_DIALOGUE = [
      'HE HE...',
      'OLA!',
      'ENTÃOOOO, ESPERO QUE TENHA SE DIVERTIDO',
      'ACHO QUE ESSE PROJETO EXPLICA O MOTIVO QUE SUMI POR UM TEMPO HE HE',
      'EU QUERIA FAZER ALGO  LEGAL PARA UM AMIGO INCRÍVEL',
      'BOM, PEGUE A CARTA AGORA.',
      'AH, E EU VOU ME EXPLODIR AGORA, VIU?'
    ];

    const OPENED_LETTER_LINES = [
      'Para o meu Melhor Amigo,',
      'Sinto que não sei como seria meu ano',
      'Se não tivesse conhecido alguém tão fantastico como você.',
      'Muuito Obrigado pelos momentos de risada e apoio.',
      'Queria ter trabalhado mais nisso, mas espero',
      'que tenha gostado.',
      "",
      "Feliz Aniversário Guilherme!",
      "Espero que continuemos sendo amigos para sempre",
      'Com carinho,',
      'Lucas',
      "",
      "PS: Aquele robô disse que tem algo na sua Steam (?)"
    ];

    let memoryFrames = [];
    let figureImg = null;
    let explodeImg = null;
    let explodeSfx = null;
    let exploded = false;
    let letterCollected = false;
    let endedToMenu = false;
    let playerX, playerY;
    let facing = 'up';
    let walkT = 0, stepAcc = 0;
    let camY = 0, glowT = 0;
    let fadeIn = 1, exitFade = 0;
    let phase = 'walking';
    let phaseTimer = 0;
    let dlgLine = 0, dlgChar = 0, dlgAcc = 0, dlgDone = false;

    function buildAssetCandidates(src) {
      if (!src) return [];

      const trimmed = src.trim();
      if (!trimmed) return [];

      const variants = new Set();
      const bases = [trimmed];

      if (trimmed.startsWith('../sprt/')) bases.push(`./${trimmed.slice(3)}`);
      if (trimmed.startsWith('sprt/')) bases.push(`./${trimmed}`);
      if (trimmed.startsWith('/sprt/')) bases.push(`.${trimmed}`);

      for (const base of bases) {
        variants.add(base);
        if (!/\.[a-z0-9]+$/i.test(base)) {
          ['.png', '.jpg', '.jpeg', '.webp', '.gif'].forEach(ext => variants.add(`${base}${ext}`));
        }
      }

      return [...variants];
    }

    function loadImageWithFallback(src) {
      const candidates = buildAssetCandidates(src);
      if (!candidates.length) return null;

      const img = new Image();
      let idx = 0;

      const tryNext = () => {
        if (idx >= candidates.length) return;
        img.src = candidates[idx++];
      };

      img.onerror = tryNext;
      tryNext();
      return img;
    }

    function playExplosionSfxFast() {
      // Usa uma nova instancia para evitar estado preso de playback entre tentativas.
      explodeSfx = new Audio(EXPLODE_SFX_SRC);
      try {
        explodeSfx.pause();
        explodeSfx.currentTime = 0;
        explodeSfx.volume = 1;
        explodeSfx.loop = false;
        explodeSfx.preload = 'auto';
        explodeSfx.muted = false;

        // Velocidade menor para maior compatibilidade entre navegadores.
        const rates = [1.75, 1.5, 1.25, 1.0];
        let applied = false;
        for (const rate of rates) {
          try {
            explodeSfx.playbackRate = rate;
            applied = true;
            break;
          } catch {}
        }
        if (!applied) explodeSfx.playbackRate = 1.25;

        if ('preservesPitch' in explodeSfx) explodeSfx.preservesPitch = false;
        if ('mozPreservesPitch' in explodeSfx) explodeSfx.mozPreservesPitch = false;
        if ('webkitPreservesPitch' in explodeSfx) explodeSfx.webkitPreservesPitch = false;

        const p = explodeSfx.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Fallback sintetico para garantir feedback mesmo com bloqueio do arquivo.
            playTone({ freq: 130, type: 'sawtooth', vol: 0.16, dur: 0.18, decay: 0.16 });
            setTimeout(() => playTone({ freq: 90, type: 'sawtooth', vol: 0.13, dur: 0.16, decay: 0.14 }), 70);
            setTimeout(() => playTone({ freq: 60, type: 'sawtooth', vol: 0.10, dur: 0.14, decay: 0.12 }), 130);
          });
        }
      } catch {
        playTone({ freq: 130, type: 'sawtooth', vol: 0.16, dur: 0.18, decay: 0.16 });
        setTimeout(() => playTone({ freq: 90, type: 'sawtooth', vol: 0.13, dur: 0.16, decay: 0.14 }), 70);
        setTimeout(() => playTone({ freq: 60, type: 'sawtooth', vol: 0.10, dur: 0.14, decay: 0.12 }), 130);
      }
    }

    function finishToMenu() {
      if (endedToMenu) return;
      endedToMenu = true;
      try {
        window.location.reload();
      } catch {
        // Fallback de seguranca caso reload seja bloqueado.
        try { onPhaseEnd({ finalScore: 1000 }); } catch {}
      }
    }

    function triggerExplosion() {
      if (exploded) return;
      exploded = true;
      phase = 'explode';
      phaseTimer = 0;
      playExplosionSfxFast();
    }

    function prepareAssets() {
      memoryFrames = MEMORY_FRAME_DEFS.map(frame => {
        const next = { ...frame, image: null };
        if (next.src) {
          next.image = loadImageWithFallback(next.src);
        }
        return next;
      });

      figureImg = null;
      if (FINAL_FIGURE.spriteSrc) {
        figureImg = loadImageWithFallback(FINAL_FIGURE.spriteSrc);
      }

      explodeImg = loadImageWithFallback(EXPLODE_GIF_SRC);
    }

    function updateCam() {
      camY = Math.max(0, Math.min(WORLD_H - H, playerY - H * 0.58));
    }

    function resetDialogue() {
      dlgLine = 0;
      dlgChar = 0;
      dlgAcc = 0;
      dlgDone = false;
    }

    function beginDialogue() {
      phase = 'dialogue';
      phaseTimer = 0;
      resetDialogue();
    }

    function start() {
      prepareAssets();
      exploded = false;
      letterCollected = false;
      endedToMenu = false;
      if (explodeSfx) {
        try { explodeSfx.pause(); explodeSfx.currentTime = 0; } catch {}
      }
      playerX = W / 2 - P_W / 2;
      playerY = WORLD_H - 150;
      facing = 'up';
      walkT = 0;
      stepAcc = 0;
      camY = 0;
      glowT = 0;
      fadeIn = 1;
      exitFade = 0;
      phase = 'walking';
      phaseTimer = 0;
      resetDialogue();
      updateCam();
    }

    function updateDialogue(dt) {
      const line = FINAL_DIALOGUE[dlgLine] ?? '';
      if (!dlgDone) {
        const prevChar = dlgChar;
        dlgAcc += dt;
        dlgChar = Math.min(Math.floor(dlgAcc / DLG_SPD), line.length);
        if (dlgChar > prevChar && line[dlgChar - 1] !== ' ') sfxDialogueBleep(dlgChar);
        if (dlgChar >= line.length) dlgDone = true;
      }

      if (justPressed['Space'] || justPressed['Enter'] || justPressed['KeyZ']) {
        if (!dlgDone) {
          dlgChar = line.length;
          dlgDone = true;
          return;
        }
        dlgLine++;
        if (dlgLine >= FINAL_DIALOGUE.length) {
          triggerExplosion();
          return;
        }
        dlgAcc = 0;
        dlgChar = 0;
        dlgDone = false;
      }
    }

    function update(dt) {
      glowT += dt;
      walkT += dt;
      phaseTimer += dt;
      fadeIn = Math.max(0, fadeIn - dt * 2.5);

      if (phase === 'encounter') {
        if (phaseTimer >= 0.55) beginDialogue();
        return;
      }

      if (phase === 'dialogue') {
        updateDialogue(dt);
        return;
      }

      if (phase === 'explode') {
        if (phaseTimer >= 1.15) {
          phase = 'collectLetter';
          phaseTimer = 0;
        }
        return;
      }

      if (phase === 'ending') {
        if (phaseTimer > 0.2) exitFade = Math.min(1, (phaseTimer - 0.2) * 1.8);
        if (phaseTimer >= 1.0 || justPressed['Space'] || justPressed['Enter'] || justPressed['KeyZ']) {
          finishToMenu();
        }
        return;
      }

      if (phase === 'letterOpen') {
        if (phaseTimer >= 0.2 && (justPressed['Space'] || justPressed['Enter'] || justPressed['KeyZ'])) {
          phase = 'ending';
          phaseTimer = 0;
          sfxTransition();
        }
        return;
      }

      let dx = 0, dy = 0;
      if (keys['ArrowUp'] || keys['KeyW']) { dy = -1; facing = 'up'; }
      if (keys['ArrowDown'] || keys['KeyS']) { dy = 1; facing = 'down'; }
      if (keys['ArrowLeft'] || keys['KeyA']) { dx = -1; facing = 'left'; }
      if (keys['ArrowRight'] || keys['KeyD']) { dx = 1; facing = 'right'; }
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        stepAcc += dt;
        if (stepAcc >= 0.28) { stepAcc = 0; sfxStep(); }
      } else {
        stepAcc = 0;
      }

      playerY = Math.max(FINAL_FIGURE.worldY + P_H + 20, Math.min(WORLD_H - 48, playerY + dy * SPEED * dt));
      playerX = Math.max(COR_L + 6, Math.min(COR_R - P_W - 6, playerX + dx * SPEED * dt));
      updateCam();

      if (phase === 'collectLetter' && !letterCollected) {
        const lx = LETTER_POS.x();
        const ly = LETTER_POS.y();
        const closeEnough = Math.abs((playerX + P_W / 2) - (lx + LETTER_POS.w / 2)) < 28 &&
                Math.abs((playerY + P_H / 2) - (ly + LETTER_POS.h / 2)) < 28;
        if (closeEnough && (justPressed['Space'] || justPressed['Enter'] || justPressed['KeyZ'])) {
          letterCollected = true;
          phase = 'letterOpen';
          phaseTimer = 0;
          sfxFragmentGet();
        }
      }

      const distToFigure = playerY - FINAL_FIGURE.worldY;
      if (!exploded && distToFigure >= 0 && distToFigure < 58) {
        playerY = FINAL_FIGURE.worldY + P_H + 18;
        playerX = W / 2 - P_W / 2;
        facing = 'up';
        updateCam();
        phase = 'encounter';
        phaseTimer = 0;
        sfxNpcEncounter();
      }
    }

    function render(ctx) {
      ctx.fillStyle = '#020204';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(0, -camY);
      drawBackground(ctx);
      drawMemoryFrames(ctx);
      drawFinalFigure(ctx);
      drawLetter(ctx);
      drawPlayer(ctx);
      ctx.restore();

      drawHUD(ctx);
      if (phase === 'dialogue') drawDialogue(ctx);
      if (phase === 'letterOpen') drawOpenedLetterOverlay(ctx);

      const fv = Math.max(fadeIn, exitFade);
      if (fv > 0) {
        ctx.save();
        ctx.globalAlpha = fv;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    function drawBackground(ctx) {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, WORLD_H);

      const wallGradL = ctx.createLinearGradient(0, 0, COR_L, 0);
      wallGradL.addColorStop(0, '#040406');
      wallGradL.addColorStop(1, '#101019');
      ctx.fillStyle = wallGradL;
      ctx.fillRect(0, 0, COR_L, WORLD_H);

      const wallGradR = ctx.createLinearGradient(COR_R, 0, W, 0);
      wallGradR.addColorStop(0, '#101019');
      wallGradR.addColorStop(1, '#040406');
      ctx.fillStyle = wallGradR;
      ctx.fillRect(COR_R, 0, W - COR_R, WORLD_H);

      const hallGrad = ctx.createLinearGradient(COR_L, 0, COR_R, 0);
      hallGrad.addColorStop(0, '#0b0b12');
      hallGrad.addColorStop(0.5, '#13131d');
      hallGrad.addColorStop(1, '#0b0b12');
      ctx.fillStyle = hallGrad;
      ctx.fillRect(COR_L, 0, COR_W, WORLD_H);

      ctx.strokeStyle = '#24243a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(COR_L, 0); ctx.lineTo(COR_L, WORLD_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(COR_R, 0); ctx.lineTo(COR_R, WORLD_H); ctx.stroke();

      for (let y = 0; y < WORLD_H; y += 42) {
        ctx.fillStyle = (Math.floor(y / 42) % 2 === 0) ? '#0e0e15' : '#0a0a11';
        ctx.fillRect(COR_L, y, COR_W, 42);
        ctx.strokeStyle = '#11111a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(COR_L, y, COR_W, 42);
      }

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#bbaaff';
      ctx.setLineDash([8, 16]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, WORLD_H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (let y = 120; y < WORLD_H; y += 210) {
        const pulse = 0.08 + Math.abs(Math.sin(glowT * 2 + y * 0.01)) * 0.05;
        ctx.save();
        ctx.globalAlpha = pulse;
        const glow = ctx.createRadialGradient(W / 2, y, 0, W / 2, y, 120);
        glow.addColorStop(0, '#ffffff');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(W / 2 - 120, y - 120, 240, 240);
        ctx.restore();
      }
    }

    function drawMemoryFrames(ctx) {
      const fw = 210, fh = 230;
      memoryFrames.forEach(frame => {
        const fx = frame.side === 'left' ? COR_L - fw : COR_R;
        const fy = frame.worldY - fh / 2;
        const pulse = 0.45 + Math.abs(Math.sin(glowT * 1.8 + frame.worldY * 0.01)) * 0.18;

        ctx.save();
        ctx.globalAlpha = pulse * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fx - 6, fy - 6, fw + 12, fh + 12);
        ctx.restore();

        ctx.fillStyle = '#0e0d12';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.strokeStyle = '#6f6488';
        ctx.lineWidth = 2;
        ctx.strokeRect(fx, fy, fw, fh);

        ctx.fillStyle = '#161521';
        ctx.fillRect(fx + 6, fy + 6, fw - 12, fh - 20);

        if (frame.image && frame.image.complete && frame.image.naturalWidth > 0) {
          ctx.drawImage(frame.image, fx + 6, fy + 6, fw - 12, fh - 20);
        } else {
          ctx.strokeStyle = '#2f2b3d';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(fx + 12, fy + 12); ctx.lineTo(fx + fw - 12, fy + fh - 26); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(fx + fw - 12, fy + 12); ctx.lineTo(fx + 12, fy + fh - 26); ctx.stroke();
          ctx.fillStyle = '#7c7294';
          ctx.font = '5px "Press Start 2P", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('[ FOTO ]', fx + fw / 2, fy + fh / 2 + 2);
        }

        ctx.fillStyle = '#8479a2';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(frame.label, fx + fw / 2, fy + fh - 6);
      });
    }

    function drawFinalFigure(ctx) {
      const nx = W / 2;
      const ny = FINAL_FIGURE.worldY;
      const hover = Math.sin(glowT * 1.7) * 2.5;
      const oy = ny + hover - 42;

      if (exploded) {
        const exW = 118, exH = 118;
        if (explodeImg && explodeImg.complete && explodeImg.naturalWidth > 0) {
          ctx.drawImage(explodeImg, nx - exW / 2, oy - 20, exW, exH);
        } else {
          ctx.save();
          ctx.globalAlpha = 0.82;
          const blast = ctx.createRadialGradient(nx, oy + 28, 2, nx, oy + 28, 58);
          blast.addColorStop(0, '#fff0a8');
          blast.addColorStop(0.45, '#ff9933');
          blast.addColorStop(1, 'rgba(255,80,0,0)');
          ctx.fillStyle = blast;
          ctx.fillRect(nx - 62, oy - 32, 124, 124);
          ctx.restore();
        }
        return;
      }

      ctx.save();
      ctx.globalAlpha = 0.18 + Math.abs(Math.sin(glowT * 1.9)) * 0.12;
      const aura = ctx.createRadialGradient(nx, oy + 28, 0, nx, oy + 28, 58);
      aura.addColorStop(0, '#ffffff');
      aura.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(nx - 58, oy - 30, 116, 116);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(nx, ny + 24, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (figureImg && figureImg.complete && figureImg.naturalWidth > 0) {
        ctx.drawImage(figureImg, nx - 24, oy - 4, 48, 64);
      } else {
        ctx.fillStyle = '#e7e3f2';
        ctx.fillRect(nx - 8, oy, 16, 16);
        ctx.fillStyle = '#1c1a24';
        ctx.fillRect(nx - 11, oy + 16, 22, 30);
        ctx.fillStyle = '#2a2636';
        ctx.fillRect(nx - 14, oy + 18, 6, 16);
        ctx.fillRect(nx + 8, oy + 18, 6, 16);
        ctx.fillStyle = '#d8d2ea';
        ctx.fillRect(nx - 4, oy + 7, 3, 3);
        ctx.fillRect(nx + 1, oy + 7, 3, 3);

        ctx.fillStyle = '#8f86a8';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(FINAL_FIGURE.label, nx, oy - 10);
      }
    }

    function drawLetter(ctx) {
      if (!exploded || letterCollected) return;

      const lx = LETTER_POS.x();
      const ly = LETTER_POS.y();
      const pulse = 0.55 + Math.abs(Math.sin(glowT * 4.2)) * 0.35;

      ctx.save();
      ctx.globalAlpha = 0.22 + pulse * 0.28;
      ctx.fillStyle = '#fff4bb';
      ctx.fillRect(lx - 8, ly - 8, LETTER_POS.w + 16, LETTER_POS.h + 16);
      ctx.restore();

      ctx.fillStyle = '#f8efcf';
      ctx.fillRect(lx, ly, LETTER_POS.w, LETTER_POS.h);
      ctx.strokeStyle = '#7a6f52';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, ly, LETTER_POS.w, LETTER_POS.h);

      ctx.strokeStyle = '#9a8b65';
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + LETTER_POS.w / 2, ly + LETTER_POS.h / 2);
      ctx.lineTo(lx + LETTER_POS.w, ly);
      ctx.stroke();
    }

    function drawPlayer(ctx) {
      const x = playerX;
      const y = playerY;
      const moving = keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'] ||
                     keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
      const leg = moving ? Math.sin(walkT * 8) * 2.5 : 0;
      const hairSwing = moving ? Math.sin(walkT * 8) * 1.5 : 0;

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + P_W / 2, y + P_H + 2, P_W / 2 - 1, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 3,  y,      3, 10);
      ctx.fillRect(x + 2,  y + 6,  3, 8);
      ctx.fillRect(x + 1,  y + 10, 3, 7 + hairSwing);
      ctx.fillRect(x + 12, y,      3, 10);
      ctx.fillRect(x + 13, y + 6,  3, 8);
      ctx.fillRect(x + 14, y + 10, 3, 7 - hairSwing);
      ctx.fillRect(x + 4,  y - 1,  10, 3);
      ctx.fillRect(x + 5,  y + 8,  7, 14 + hairSwing * 0.5);
      ctx.fillRect(x + 4,  y + 12, 3, 10);
      ctx.fillRect(x + 11, y + 12, 3, 10);

      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(x + 5, y + 1, 8, 8);
      ctx.fillRect(x + 6, y + 9, 6, 7);
      ctx.fillRect(x + 5, y + 16 + leg, 4, 4);
      ctx.fillRect(x + 9, y + 16 - leg, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 5, y, 8, 3);
      ctx.fillRect(x + 5, y + 1, 3, 4);

      ctx.fillStyle = '#000';
      if (facing === 'down') {
        ctx.fillRect(x + 6, y + 3, 2, 2);
        ctx.fillRect(x + 10, y + 3, 2, 2);
      } else if (facing === 'left') {
        ctx.fillRect(x + 6, y + 3, 2, 2);
      } else if (facing === 'right') {
        ctx.fillRect(x + 10, y + 3, 2, 2);
      }
    }

    function drawHUD(ctx) {
      ctx.fillStyle = '#c7c0da';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CAMINHO DAS MEMORIAS', W / 2, 12);

      if (phase === 'walking') {
        ctx.fillStyle = '#4f4962';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('WASD / SETAS: CAMINHAR', W - 8, H - 10);
      }

      if (phase === 'collectLetter' && !letterCollected) {
        ctx.fillStyle = '#fff0a8';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PEGUE A CARTA E APERTE ESPACO', W / 2, H - 10);
      }

      if (phase === 'letterOpen') {
        ctx.fillStyle = '#ddd2ae';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LEIA A CARTA • ESPACO PARA CONTINUAR', W / 2, H - 10);
      }

      ctx.fillStyle = '#3f3a52';
      ctx.font = '5px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('PREENCHA os campos `src` em MEMORY_FRAME_DEFS e FINAL_FIGURE', 8, H - 10);
    }

    function drawOpenedLetterOverlay(ctx) {
      const paperW = Math.min(620, W - 70);
      const paperH = Math.min(360, H - 70);
      const px = (W - paperW) / 2;
      const py = (H - paperH) / 2;

      ctx.save();
      ctx.globalAlpha = 0.68;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.fillStyle = '#f3e7c8';
      ctx.fillRect(px, py, paperW, paperH);
      ctx.strokeStyle = '#9c8a62';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, paperW, paperH);

      ctx.fillStyle = 'rgba(130,110,70,0.10)';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(px + 28, py + 42 + i * 42, paperW - 56, 1);
      }

      ctx.fillStyle = '#4a3c25';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CARTA', W / 2, py + 22);

      const textX = px + 34;
      const textTop = py + 58;
      const textMaxW = paperW - 68;
      const textMaxH = paperH - 84;

      // Quebra de linha por largura para evitar corte horizontal.
      function wrapLines(lines) {
        const wrapped = [];
        for (const rawLine of lines) {
          const line = String(rawLine ?? '');
          if (!line.trim()) {
            wrapped.push('');
            continue;
          }

          const words = line.split(/\s+/).filter(Boolean);
          let current = '';
          for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= textMaxW) {
              current = candidate;
            } else {
              if (current) wrapped.push(current);
              current = word;
            }
          }
          wrapped.push(current);
        }
        return wrapped;
      }

      let finalLines = [];
      let fontPx = 7;
      let lineH = 20;

      // Ajusta automaticamente a fonte para caber verticalmente no papel.
      for (const size of [7, 6, 5, 4]) {
        ctx.font = `${size}px "Press Start 2P", monospace`;
        const wrapped = wrapLines(OPENED_LETTER_LINES);
        const lh = Math.max(10, Math.round(size * 2.2));
        if (wrapped.length * lh <= textMaxH || size === 4) {
          finalLines = wrapped;
          fontPx = size;
          lineH = lh;
          break;
        }
      }

      ctx.fillStyle = '#3a301f';
      ctx.font = `${fontPx}px "Press Start 2P", monospace`;
      ctx.textAlign = 'left';
      finalLines.forEach((line, i) => {
        const y = textTop + i * lineH;
        if (y <= py + paperH - 22) ctx.fillText(line, textX, y);
      });
    }

    function drawDialogue(ctx) {
      const text = (FINAL_DIALOGUE[dlgLine] ?? '').slice(0, dlgChar);
      const cursor = dlgDone && (Math.floor(glowT * 3) % 2 === 0) ? ' ▼' : '';
      const bw = 520, bh = 72, bx = (W - bw) / 2, by = H - bh - 12;

      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#4f4666';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#7c7294';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(FINAL_FIGURE.name, bx + 14, by + 14);

      ctx.fillStyle = '#ddd7ea';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(text + cursor, bx + 14, by + 38);

      ctx.fillStyle = '#57506f';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      if (dlgDone && dlgLine < FINAL_DIALOGUE.length - 1) ctx.fillText('ESPACO »', bx + bw - 14, by + bh - 10);
      else if (dlgDone) ctx.fillText('ESPACO: ENCERRAR', bx + bw - 14, by + bh - 10);
    }

    return { start, update, render };
  }


  // ════════════════════════════════════════════════════════════════════════
  function challengeScene(fragmentId, title, sceneName) {
    let t = 0, done = false, doneTimer = 0, fadeIn = 1;

    function start() { t = 0; done = false; doneTimer = 0; fadeIn = 1; }

    function update(dt) {
      t += dt;
      fadeIn = Math.max(0, fadeIn - dt * 2.5);

      if (done) {
        doneTimer += dt;
        if (doneTimer >= 1.8) {
          if (fragmentId < 4) {
            run.fragments[fragmentId] = true;
            sfxFragmentGet();
            switchScene('corridor', { returnFrom: sceneName });
          } else {
            onPhaseEnd({ finalScore: 1000 });
          }
        }
      } else if (justPressed['Space']) {
        done = true;
      }
    }

    function render(ctx) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, W - 16, H - 16);

      ctx.textAlign = 'center';

      // Título
      ctx.fillStyle = '#fff';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillText(title, W / 2, H / 2 - 64);

      // Indicador de progresso
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillText(
        fragmentId < 4 ? `DESAFIO ${fragmentId + 1} DE 4` : 'ETAPA FINAL',
        W / 2, H / 2 - 40
      );

      if (done) {
        const flash = 0.4 + Math.abs(Math.sin(t * 9)) * 0.6;
        ctx.save(); ctx.globalAlpha = flash;
        ctx.fillStyle = '#fff'; ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText('\u2736 CONCLUIDO! \u2736', W / 2, H / 2 - 8);
        ctx.restore();
        ctx.fillStyle = '#333'; ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText('Retornando ao corredor...', W / 2, H / 2 + 20);
      } else {
        ctx.fillStyle = '#222'; ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText('[ DESAFIO EM IMPLEMENTACAO ]', W / 2, H / 2 - 8);
        ctx.fillStyle = '#333';
        ctx.fillText('ESPACO \u2192 simular conclusao', W / 2, H / 2 + 18);

        if (Math.floor(t * 2) % 2 === 0) {
          ctx.fillStyle = '#666'; ctx.font = '10px "Press Start 2P", monospace';
          ctx.fillText('[ ESPACO ]', W / 2, H / 2 + 48);
        }
      }

      if (fadeIn > 0) {
        ctx.save(); ctx.globalAlpha = fadeIn;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    }

    return { start, update, render };
  }

  // ── Export ─────────────────────────────────────────────────────────────
  return { mount, startCampaign, stop, getProgress };

})();
