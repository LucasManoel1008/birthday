(function () {
  const DEBUG_MODE = /(^|[?&])(hookshotDebug|hsDebug)=1(&|$)/.test(window.location.search);

  const S = 3;
  const VW = 256;
  const VH = 144;
  const PW = 8;
  const PH = 12;

  const C = { BK: '#000000', W0: '#ffffff', W1: '#cccccc', W2: '#888888', W3: '#444444', W4: '#1a1a1a' };

  let AC = null;
  function auInit() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  }
  function beep(f, d, t = 'square', v = 0.14, f2 = null, delay = 0) {
    if (!AC) return;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.connect(g);
    g.connect(AC.destination);
    o.type = t;
    const now = AC.currentTime + delay;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.linearRampToValueAtTime(f2, now + d);
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + d);
    o.start(now);
    o.stop(now + d);
  }
  const SFX = {
    jump: () => { auInit(); beep(220, 0.06, 'square', 0.13, 440); },
    hook: () => { auInit(); beep(880, 0.03, 'square', 0.09, 1600); },
    attach: () => { auInit(); beep(330, 0.05, 'square', 0.17, 180); },
    rel: () => { auInit(); beep(180, 0.04, 'square', 0.07); },
    death: () => { auInit(); [160, 130, 100, 70].forEach((f, i) => beep(f, 0.1, 'sawtooth', 0.24, null, i * 0.1)); },
    win: () => { auInit(); [330, 440, 550, 660, 880].forEach((f, i) => beep(f, 0.07, 'square', 0.15, null, i * 0.06)); },
    shoot: () => { auInit(); beep(550, 0.04, 'square', 0.08, 250); },
    bounce: () => { auInit(); beep(140, 0.05, 'square', 0.1, 300); }
  };

  const ROOMS = [
    { title: 'SALA 1 - O ABISMO', hint: 'APONTE MOUSE NUM ANEL + CLIQUE = GANCHO!',
      plat: [{ x: 0, y: 0, w: 256, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 248, y: 0, w: 8, h: 144 },
             { x: 8, y: 116, w: 54, h: 28 }, { x: 108, y: 102, w: 24, h: 10 }, { x: 192, y: 116, w: 56, h: 28 }],
      spikes: [{ x: 62, y: 136, w: 46, h: 8 }, { x: 132, y: 136, w: 60, h: 8 }],
      anchors: [{ x: 130, y: 44 }], exit: { x: 200, y: 96, w: 22, h: 20 }, start: { x: 14, y: 103 }, enemies: [] },

    { title: 'SALA 2 - ESCADARIA', hint: 'USE DOIS GANCHOS SEGUIDOS PARA SUBIR!',
      plat: [{ x: 0, y: 0, w: 256, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 248, y: 0, w: 8, h: 144 },
             { x: 8, y: 128, w: 48, h: 16 }, { x: 64, y: 112, w: 24, h: 8 }, { x: 104, y: 96, w: 24, h: 8 },
             { x: 148, y: 80, w: 24, h: 8 }, { x: 196, y: 64, w: 52, h: 80 }],
      spikes: [{ x: 56, y: 136, w: 8, h: 8 }, { x: 88, y: 136, w: 16, h: 8 }, { x: 128, y: 136, w: 20, h: 8 },
               { x: 172, y: 136, w: 24, h: 8 }, { x: 8, y: 8, w: 80, h: 12, ceil: 1 }, { x: 140, y: 8, w: 108, h: 12, ceil: 1 }],
      anchors: [{ x: 80, y: 46 }, { x: 168, y: 38 }], exit: { x: 204, y: 44, w: 22, h: 18 }, start: { x: 12, y: 115 },
      enemies: [{ type: 'walker', x: 38, y: 115, minX: 10, maxX: 48, speed: 56 },
                { type: 'walker', x: 216, y: 52, minX: 196, maxX: 238, speed: 62 },
                { type: 'bat', x: 130, y: 62, amp: 20, spd: 52, phase: 0 }] },

    { title: 'SALA 3 - CHUVA DE BALAS', hint: 'ESQUIVE PROJETEIS ENQUANTO BALANCA!',
      plat: [{ x: 0, y: 0, w: 256, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 248, y: 0, w: 8, h: 144 },
             { x: 8, y: 124, w: 44, h: 20 }, { x: 76, y: 108, w: 28, h: 8 }, { x: 152, y: 108, w: 28, h: 8 },
             { x: 212, y: 124, w: 36, h: 20 }, { x: 112, y: 88, w: 32, h: 8 }],
      spikes: [{ x: 52, y: 136, w: 24, h: 8 }, { x: 104, y: 136, w: 48, h: 8 }, { x: 180, y: 136, w: 32, h: 8 },
               { x: 8, y: 8, w: 100, h: 10, ceil: 1 }, { x: 148, y: 8, w: 100, h: 10, ceil: 1 }],
      anchors: [{ x: 100, y: 44 }, { x: 156, y: 44 }, { x: 128, y: 74 }], exit: { x: 218, y: 104, w: 22, h: 18 }, start: { x: 12, y: 111 },
      enemies: [{ type: 'cannon', x: 8, y: 100, angle: 18, interval: 1.4, timer: 0.7 },
                { type: 'cannon', x: 248, y: 100, angle: 162, interval: 1.6, timer: 0.2 },
                { type: 'walker', x: 162, y: 96, minX: 152, maxX: 172, speed: 52 },
                { type: 'bat', x: 62, y: 72, amp: 24, spd: 56, phase: 1.0 },
                { type: 'bat', x: 192, y: 58, amp: 18, spd: 66, phase: 2.5 }] },

        { title: 'SALA 4 - CAVERNA DA CAVEIRA', hint: 'O CHAO E MORTE - USE O GANCHO!',
      plat: [{ x: 0, y: 0, w: 256, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 248, y: 0, w: 8, h: 144 },
            { x: 8, y: 132, w: 14, h: 12 }, { x: 234, y: 132, w: 14, h: 12 }, { x: 100, y: 116, w: 56, h: 8 },
             { x: 56, y: 88, w: 32, h: 8 }, { x: 168, y: 88, w: 32, h: 8 }, { x: 108, y: 60, w: 40, h: 8 }],
          spikes: [{ x: 22, y: 136, w: 78, h: 8 }, { x: 156, y: 136, w: 78, h: 8 }, { x: 88, y: 136, w: 68, h: 8 },
         { x: 8, y: 8, w: 240, h: 12, ceil: 1 }],
          anchors: [{ x: 52, y: 66 }, { x: 84, y: 44 }, { x: 128, y: 36 }, { x: 172, y: 44 }], exit: { x: 116, y: 40, w: 24, h: 18 }, start: { x: 10, y: 119 },
      enemies: [{ type: 'skull', x: 104, y: 100, vx: 55, vy: -80 },
                { type: 'skull', x: 148, y: 100, vx: -60, vy: -90 },
                { type: 'walker', x: 120, y: 48, minX: 108, maxX: 140, speed: 66 },
                { type: 'bat', x: 52, y: 72, amp: 22, spd: 60, phase: 0.5 }] },

    { title: 'SALA 5 - CATEDRAL DO CAOS', hint: 'MAXIMO CAOS - PLANEJE CADA BALANCA!',
      plat: [{ x: 0, y: 0, w: 256, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 248, y: 0, w: 8, h: 144 },
             { x: 8, y: 128, w: 28, h: 16 }, { x: 220, y: 128, w: 28, h: 16 }, { x: 44, y: 108, w: 36, h: 8 },
             { x: 176, y: 108, w: 36, h: 8 }, { x: 108, y: 88, w: 40, h: 8 }, { x: 60, y: 64, w: 24, h: 8 },
             { x: 172, y: 64, w: 24, h: 8 }, { x: 112, y: 44, w: 32, h: 8 }],
      spikes: [{ x: 36, y: 136, w: 20, h: 8 }, { x: 76, y: 136, w: 104, h: 8 }, { x: 200, y: 136, w: 20, h: 8 },
               { x: 8, y: 8, w: 80, h: 12, ceil: 1 }, { x: 168, y: 8, w: 80, h: 12, ceil: 1 }],
      anchors: [{ x: 80, y: 36 }, { x: 128, y: 26 }, { x: 176, y: 36 }, { x: 84, y: 82 }, { x: 172, y: 82 }],
      exit: { x: 120, y: 24, w: 16, h: 18 }, start: { x: 10, y: 115 },
      enemies: [{ type: 'skull', x: 62, y: 52, vx: 65, vy: -70 },
                { type: 'skull', x: 196, y: 52, vx: -65, vy: -75 },
                { type: 'cannon', x: 8, y: 80, angle: 10, interval: 1.0, timer: 0.3 },
                { type: 'cannon', x: 248, y: 80, angle: 170, interval: 1.0, timer: 0.8 },
                { type: 'bat', x: 100, y: 55, amp: 10, spd: 72, phase: 0 },
                { type: 'bat', x: 160, y: 55, amp: 10, spd: 66, phase: 1.8 }] },

        { title: 'SALA 6 - REI DEMONIO', hint: 'CHAO E TETO DE MORTE - AVANCE SO COM O GANCHO!',
          roomW: 512,
          plat: [{ x: 0, y: 0, w: 512, h: 8 }, { x: 0, y: 0, w: 8, h: 144 }, { x: 504, y: 0, w: 8, h: 144 },
            { x: 8, y: 116, w: 28, h: 28 },
            { x: 480, y: 88, w: 24, h: 56 }],
          spikes: [{ x: 36, y: 128, w: 444, h: 16 },
            { x: 8, y: 8, w: 496, h: 14, ceil: 1 }],
          anchors: [{ x: 75, y: 36 }, { x: 158, y: 30 }, { x: 240, y: 38 },
                    { x: 322, y: 32 }, { x: 402, y: 36 }, { x: 462, y: 34 }],
          hint2: 'ESTILINGUE: SEGURE GANCHO + ANDE + SOLTE!',
          exit: { x: 483, y: 70, w: 18, h: 18 }, start: { x: 12, y: 104 },
          enemies: [{ type: 'bat', x: 110, y: 72, amp: 16, spd: 58, phase: 0 },
            { type: 'bat', x: 270, y: 68, amp: 18, spd: 62, phase: 1.5 },
            { type: 'bat', x: 390, y: 74, amp: 14, spd: 56, phase: 0.8 },
            { type: 'cannon', x: 8, y: 68, angle: 0, interval: 1.6, timer: 0.4 },
            { type: 'cannon', x: 504, y: 68, angle: 180, interval: 1.6, timer: 1.1 }] }
  ];

  const GRV = 310;
  const JMPV = -168;
  const HOOK_JUMPV = -132;
  const MVACC = 130;
  const AIRCTR = 55;
  const FRIC = 0.68;
  const HSPD = 270;
  const MROPE = 104;
  const SNAPR = 13;
  const BSPD = 132;

  let canvas = null;
  let ctx = null;
  let flashEl = null;
  let onLevelEnd = null;
  let onCampaignWon = null;

  let mounted = false;
  let running = false;
  let rafId = null;
  let lastT = 0;

  let ri = 0;
  let lives = 3;
  let gs = 'playing';
  let camX = 0;
  let deathT = 0;
  let time = 0;
  let hintT = 6;
  let hintT2 = 0;
  let shakeT = 0;
  let shakeAmp = 0;
  let invTimer = 0;
  let totalRunTime = 0;
  let levelResultSent = false;
  let roomStartTime = 0;
  let roomDeaths = [];
  let roomClearTimes = [];
  let roomCleared = [];

  let particles = [];
  let floatTexts = [];
  let bullets = [];
  let enemies = [];
  let player = null;
  let hook = null;

  const keys = {};
  const mouse = { vx: 128, vy: 72 };

  let keyDownHandler = null;
  let keyUpHandler = null;
  let moveHandler = null;
  let clickHandler = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeNumberArray(source, length, fallback = 0) {
    const out = Array(length).fill(fallback);
    if (!Array.isArray(source)) return out;

    for (let i = 0; i < length; i++) {
      const raw = source[i];
      if (!Number.isFinite(raw)) continue;
      out[i] = raw;
    }

    return out;
  }

  function normalizeBoolArray(source, length) {
    const out = Array(length).fill(false);
    if (!Array.isArray(source)) return out;

    for (let i = 0; i < length; i++) {
      out[i] = Boolean(source[i]);
    }

    return out;
  }

  function restoreCampaignSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    const roomCount = ROOMS.length;
    const roomIndexRaw = Number(snapshot.roomIndex);
    if (!Number.isFinite(roomIndexRaw)) return false;

    const roomIndex = clamp(Math.floor(roomIndexRaw), 0, roomCount - 1);
    const rawLives = Number(snapshot.lives);
    const safeLives = Number.isFinite(rawLives) ? clamp(Math.floor(rawLives), 1, 5) : 3;
    const rawRunTime = Number(snapshot.totalRunTime);
    const safeRunTime = Number.isFinite(rawRunTime) ? Math.max(0, rawRunTime) : 0;

    const nextRoomDeaths = normalizeNumberArray(snapshot.roomDeaths, roomCount, 0)
      .map(v => Math.max(0, Math.floor(v)));
    const nextRoomClearTimes = normalizeNumberArray(snapshot.roomClearTimes, roomCount, 0)
      .map(v => Math.max(0, v));
    const nextRoomCleared = normalizeBoolArray(snapshot.roomCleared, roomCount);

    // Ao retomar na sala N+1, as salas anteriores devem estar marcadas como concluidas.
    for (let i = 0; i < roomIndex; i++) {
      nextRoomCleared[i] = true;
    }

    ri = roomIndex;
    lives = safeLives;
    totalRunTime = safeRunTime;
    roomDeaths = nextRoomDeaths;
    roomClearTimes = nextRoomClearTimes;
    roomCleared = nextRoomCleared;
    return true;
  }

  function finalizeRoomIfNeeded(roomIndex) {
    if (roomIndex < 0 || roomIndex >= ROOMS.length) return;
    if (roomCleared[roomIndex]) return;

    roomCleared[roomIndex] = true;
    roomClearTimes[roomIndex] = Math.max(0, totalRunTime - roomStartTime);
  }

  function computeScore(complete) {
    let score = 0;
    const roomsToCount = complete ? ROOMS.length : roomCleared.filter(Boolean).length;

    for (let i = 0; i < roomsToCount; i++) {
      if (!roomCleared[i]) continue;

      const deaths = roomDeaths[i] || 0;
      const clearSec = roomClearTimes[i] || 0;

      // 350 por sala concluida (max 2100 em 6 salas).
      score += 350;

      // Bonus de sobrevivencia por sala: 80 sem mortes, reduz 30 por morte.
      score += Math.max(0, 80 - deaths * 30);

      // Bonus de velocidade por sala: ate 70, reduz 2 pontos por segundo.
      score += Math.max(0, 70 - Math.floor(clearSec * 2));
    }

    return clamp(Math.floor(score), 0, 3000);
  }

  function sendLevelResult({ canAdvance = false, campaignEnded = false, wonCampaign = false } = {}) {
    if (!onLevelEnd || levelResultSent) return;
    levelResultSent = true;

    const partialScore = computeScore(false);
    const finalScore = campaignEnded ? computeScore(wonCampaign) : partialScore;

    onLevelEnd({
      level: ri + 1,
      totalLevels: ROOMS.length,
      canAdvance,
      campaignEnded,
      wonCampaign,
      partialScore,
      finalScore
    });
  }

  function vr(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect((x | 0) * S, (y | 0) * S, (w | 0) * S, (h | 0) * S);
  }

  function vp(x, y, c) {
    ctx.fillStyle = c;
    ctx.fillRect((x | 0) * S, (y | 0) * S, S, S);
  }

  function vtxt(str, vx, vy, c, sz, align = 'center') {
    ctx.fillStyle = c;
    ctx.font = `${sz * S}px 'Press Start 2P', monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(str, (vx | 0) * S, (vy | 0) * S);
  }

  function ovlp(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function flash(color, seconds) {
    if (!flashEl) return;
    flashEl.style.background = color;
    flashEl.style.opacity = '0.55';
    setTimeout(() => {
      if (flashEl) flashEl.style.opacity = '0';
    }, Math.floor(seconds * 1000));
  }

  function spawnBurst(x, y, n, cols, spd = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * 0.4 + Math.random() * spd;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.4 + Math.random() * 0.4,
        max: 0.8,
        c: cols[i % cols.length],
        sz: 1 + Math.random() * 2
      });
    }
  }

  function spawnFloat(x, y, txt, c) {
    floatTexts.push({ x, y, txt, c, life: 1.2, vy: -18 });
  }

  function shake(a, d) {
    shakeAmp = a;
    shakeT = d;
  }

  function initRoom(idx) {
    const r = ROOMS[idx];
    camX = 0;
    player = { x: r.start.x, y: r.start.y, vx: 0, vy: 0, onG: false, face: 1, wf: 0, wt: 0 };
    hook = { state: 'idle', x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, rope: 0 };
    enemies = r.enemies.map(e => ({
      ...e,
      active: true,
      t: (e.type === 'cannon' && e.timer != null) ? e.timer : 0,
      dir: 1,
      bx: e.x,
      by: e.y
    }));
    bullets = [];
    particles = [];
    floatTexts = [];
    hintT = 6;
    hintT2 = r.hint2 ? 8 : 0;
    invTimer = 2.5;
    levelResultSent = false;
    roomStartTime = totalRunTime;
  }

  function doJump() {
    player.vy = JMPV;
    SFX.jump();
  }

  function jumpOffHook() {
    // Permite salto durante o balanço e libera o gancho no mesmo comando.
    if (hook.state !== 'attached') return;
    relHook();
    player.vy = HOOK_JUMPV;
    SFX.jump();
  }

  function relHook() {
    hook.state = 'idle';
    SFX.rel();
  }

  function fireHook() {
    if (hook.state === 'attached') {
      relHook();
      return;
    }

    const cx = player.x + PW / 2;
    const cy = player.y + PH / 2;
    const dx = (mouse.vx + camX) - cx;
    const dy = mouse.vy - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    hook.state = 'flying';
    hook.x = cx;
    hook.y = cy;
    hook.vx = (dx / len) * HSPD;
    hook.vy = (dy / len) * HSPD;
    SFX.hook();
  }

  function advRoom() {
    if ((ri + 1) % 2 === 0 && lives < 3) {
      lives += 1;
      spawnFloat(player.x + PW / 2, player.y - 6, '+VIDA!', C.W0);
    }

    ri += 1;

    if (ri === ROOMS.length - 1) {
      const bonus = 5 - lives;
      if (bonus > 0) {
        lives = 5;
        spawnFloat(player.x + PW / 2, player.y - 6, `+${bonus} VIDAS!`, C.W0);
      }
    }
    if (ri >= ROOMS.length) {
      gs = 'complete';
      sendLevelResult({ campaignEnded: true, wonCampaign: true });
      return;
    }

    gs = 'playing';
    initRoom(ri);
  }

  function debugAdvanceRoom() {
    if (!DEBUG_MODE) return;

    if (gs === 'roomwin') {
      advRoom();
      return;
    }

    if (gs !== 'playing') return;

    finalizeRoomIfNeeded(ri);
    if (ri >= ROOMS.length - 1) {
      gs = 'complete';
      sendLevelResult({ campaignEnded: true, wonCampaign: true });
    } else {
      gs = 'roomwin';
      sendLevelResult({ canAdvance: true, campaignEnded: false, wonCampaign: false });
    }
  }

  function resolvePlayer(plats) {
    player.onG = false;

    for (const p of plats) {
      if (!ovlp(player.x, player.y, PW, PH, p.x, p.y, p.w, p.h)) continue;

      const ol = (player.x + PW) - p.x;
      const or_ = (p.x + p.w) - player.x;
      const ot = (player.y + PH) - p.y;
      const ob = (p.y + p.h) - player.y;
      const mh = Math.min(ol, or_);
      const mv = Math.min(ot, ob);

      if (mv <= mh) {
        if (ot < ob) {
          player.y = p.y - PH;
          if (player.vy > 0) player.vy = 0;
          player.onG = true;
        } else {
          player.y = p.y + p.h;
          if (player.vy < 0) player.vy = 0;
        }
      } else if (ol < or_) {
        player.x = p.x - PW;
        if (player.vx > 0) player.vx = 0;
      } else {
        player.x = p.x + p.w;
        if (player.vx < 0) player.vx = 0;
      }
    }
  }

  function killPlayer() {
    if (gs !== 'playing') return;

    SFX.death();
    shake(3, 0.35);
    flash('#ffffff', 0.1);
    spawnBurst(player.x + PW / 2, player.y + PH / 2, 18, [C.W0, C.W1, C.W2], 110);
    spawnFloat(player.x + PW / 2, player.y - 2, 'X_X', C.W0);

    roomDeaths[ri] = (roomDeaths[ri] || 0) + 1;
    lives -= 1;
    gs = 'dead';
    deathT = lives <= 0 ? 2.5 : 1.3;
  }

  function drawPlayer() {
    if (gs === 'dead') return;
    if (invTimer > 0 && Math.floor(invTimer * 10) % 2 === 0) return;

    const x = player.x | 0;
    const y = player.y | 0;
    const f = player.face;

    ctx.save();
    if (f < 0) {
      ctx.translate((x + PW / 2) * S * 2, 0);
      ctx.scale(-1, 1);
    }

    vr(x, y + 10, 3, 2, C.W3);
    vr(x + 5, y + 10, 3, 2, C.W3);

    const wl = player.onG ? (Math.sin(player.wf) * 2) | 0 : 0;
    vr(x + 1, y + 7, 2, 4 + wl, C.W3);
    vr(x + 5, y + 7, 2, 4 - wl, C.W3);

    vr(x, y + 4, PW, 6, C.W1);
    vr(x, y + 4, 1, 6, C.W3);
    vr(x + 7, y + 4, 1, 6, C.W3);
    vr(x + 2, y + 8, 4, 1, C.W3);

    if (hook.state !== 'idle') {
      const aa = Math.atan2(mouse.vy - (y + PH / 2), (mouse.vx + camX) - (x + PW / 2));
      vr(x + (f > 0 ? 6 : 0), y + 5, 2, 2, C.W1);
      vr(x + (f > 0 ? 6 : 0) + ((Math.cos(aa) * 2) | 0), y + 5 + ((Math.sin(aa) * 2) | 0), 2, 2, C.W2);
    } else {
      vr(x - 1, y + 5, 2, 3, C.W1);
      vr(x + 7, y + 5, 2, 3, C.W1);
    }

    vr(x + 1, y + 1, 6, 4, C.W1);
    vr(x + 1, y + 1, 1, 4, C.W3);
    vr(x + 6, y + 1, 1, 4, C.W3);
    vp(x + (f > 0 ? 5 : 2), y + 2, C.BK);
    vp(x + (f > 0 ? 5 : 2), y + 3, C.W3);

    vr(x - 1, y + 1, PW + 2, 1, C.BK);
    vr(x + 2, y - 3, 4, 4, C.W3);
    vr(x + 2, y - 3, 4, 1, C.W2);
    vp(x + (f > 0 ? 5 : 2), y - 4, C.W0);
    vp(x + (f > 0 ? 5 : 2), y - 3, C.W0);

    ctx.restore();
  }

  function drawGoblin(e) {
    const x = e.x | 0;
    const y = e.y | 0;
    ctx.save();
    if (e.dir < 0) {
      ctx.translate((x + PW / 2) * S * 2, 0);
      ctx.scale(-1, 1);
    }

    const wl = (Math.sin(e.t * 9) * 2) | 0;
    vr(x + 1, y + 8, 2, 4 + wl, C.W3);
    vr(x + 5, y + 8, 2, 4 - wl, C.W3);
    vr(x, y + 4, PW, 5, C.W3);
    vr(x + 2, y + 4, 4, 2, C.W1);
    vr(x + 2, y + 7, 4, 1, C.W1);
    vr(x - 1, y + 4, 2, 3, C.W3);
    vr(x + 7, y + 4, 2, 3, C.W3);
    vr(x + 8, y + 3, 2, 4, C.W2);
    vr(x + 8, y + 3, 2, 2, C.W0);
    vr(x + 1, y, 6, 4, C.W3);
    vr(x + 2, y, 4, 1, C.W2);
    vp(x + 2, y - 2, C.W0);
    vp(x + 2, y - 1, C.W0);
    vp(x + 5, y - 2, C.W0);
    vp(x + 5, y - 1, C.W0);
    vp(x + 2, y + 1, C.W0);
    vp(x + 2, y + 2, C.W0);
    vp(x + 5, y + 1, C.W0);
    vp(x + 5, y + 2, C.W0);
    vr(x + 2, y + 3, 4, 1, C.W0);
    ctx.restore();
  }

  function drawBat(e) {
    const x = e.x | 0;
    const y = e.y | 0;
    const fl2 = Math.sin(time * 14 + e.phase) > 0;
    vr(x + 2, y + 2, 4, 4, C.W3);
    vr(x + 3, y + 2, 2, 2, C.W2);
    if (fl2) {
      vr(x - 3, y, 5, 3, C.W3);
      vr(x + 6, y, 5, 3, C.W3);
    } else {
      vr(x - 3, y + 4, 5, 2, C.W3);
      vr(x + 6, y + 4, 5, 2, C.W3);
    }
    vp(x + 2, y + 3, C.W0);
    vp(x + 5, y + 3, C.W0);
    vp(x + 3, y + 6, C.W0);
    vp(x + 4, y + 6, C.W0);
  }

  function drawSkull(e) {
    const x = e.x | 0;
    const y = e.y | 0;
    vr(x + 1, y, 4, 6, C.W0);
    vr(x, y + 2, 6, 4, C.W0);
    vr(x + 1, y + 5, 4, 2, C.W2);
    vr(x + 1, y + 2, 2, 2, C.BK);
    vr(x + 3, y + 2, 2, 2, C.BK);
    vp(x + 2, y + 4, C.BK);
    vp(x + 3, y + 4, C.BK);
    vr(x + 1, y + 6, 1, 1, C.W3);
    vr(x + 3, y + 6, 1, 1, C.W3);
    vp(x + 2, y + 1, C.W3);
  }

  function drawCannon(e) {
    const bx = (e.x <= 8 ? e.x : e.x - 8) | 0;
    const by = (e.y - 5) | 0;
    vr(bx, by, 9, 9, C.W3);
    vr(bx + 1, by + 1, 7, 7, C.W2);
    vr(bx + 2, by + 2, 5, 5, C.W1);
    vp(bx + 1, by + 1, C.W3);
    vp(bx + 7, by + 1, C.W3);
    vp(bx + 1, by + 7, C.W3);
    vp(bx + 7, by + 7, C.W3);

    const a = e.angle * (Math.PI / 180);
    const cx = e.x | 0;
    const cy = e.y | 0;
    for (let i = 2; i <= 11; i++) {
      vp(cx + ((Math.cos(a) * i) | 0), cy + ((Math.sin(a) * i) | 0), i < 6 ? C.W3 : C.W2);
      vp(cx + ((Math.cos(a) * i) | 0) + 1, cy + ((Math.sin(a) * i) | 0), C.W3);
    }

    if (e.t < 0.07) {
      vr(cx + ((Math.cos(a) * 11) | 0) - 1, cy + ((Math.sin(a) * 11) | 0) - 1, 3, 3, C.W0);
    }
  }

  function drawBullet(b) {
    vr((b.x | 0) - 1, (b.y | 0) - 1, 3, 3, C.W0);
  }

  function drawAnchor(a, att) {
    const x = a.x | 0;
    const y = a.y | 0;
    const blink = Math.floor(time * 6 + a.x * 0.07) % 2 === 0;
    const col = att ? C.W0 : (blink ? C.W0 : C.W2);

    [[0, -5], [0, 5], [-5, 0], [5, 0], [-4, -3], [4, -3], [-4, 3], [4, 3], [-3, -4], [3, -4], [-3, 4], [3, 4]].forEach(([ox, oy]) => {
      vp(x + ox, y + oy, col);
    });

    [[0, -3], [0, 3], [-3, 0], [3, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(([ox, oy]) => {
      vp(x + ox, y + oy, att ? C.W1 : C.W3);
    });

    vr(x - 1, y - 1, 2, 2, att ? C.W0 : C.W1);
    vp(x, y, C.BK);
    if (blink) {
      vp(x - 6, y, C.W3);
      vp(x + 6, y, C.W3);
      vp(x, y - 6, C.W3);
      vp(x, y + 6, C.W3);
    }
  }

  function drawExit(e) {
    const blink = Math.floor(time * 3) % 2 === 0;
    vr(e.x - 1, e.y - 1, e.w + 2, e.h + 2, C.W2);
    for (let dy = 0; dy < e.h; dy++) {
      for (let dx = 0; dx < e.w; dx++) {
        const chk = (dx + dy) % 2 === 0;
        vp(e.x + dx, e.y + dy, blink ? (chk ? C.W0 : C.W3) : (chk ? C.W3 : C.W4));
      }
    }

    vr(e.x, e.y, e.w, 1, C.W0);
    vr(e.x, e.y + e.h - 1, e.w, 1, C.W0);
    vr(e.x, e.y, 1, e.h, C.W0);
    vr(e.x + e.w - 1, e.y, 1, e.h, C.W0);
    const cx = (e.x + e.w / 2) | 0;
    const cy = (e.y + e.h / 2) | 0;
    vp(cx, cy - 2, C.W0);
    vp(cx, cy + 2, C.W0);
    vp(cx - 2, cy, C.W0);
    vp(cx + 2, cy, C.W0);
  }

  function drawRoom(r) {
    vr(camX, 0, VW, VH, C.BK);

    for (const p of r.plat) {
      vr(p.x, p.y, p.w, p.h, C.W3);
      for (let ty = p.y; ty < p.y + p.h; ty += 4) {
        const off = (((ty - p.y) / 4) % 2) * 4;
        for (let tx = p.x + off; tx < p.x + p.w; tx += 8) vr(tx, ty, 1, 4, C.W4);
        vr(p.x, ty, p.w, 1, C.W4);
      }
      vr(p.x, p.y, p.w, 1, C.W1);
      vr(p.x, p.y + p.h - 1, p.w, 1, C.W4);
      vr(p.x + p.w - 1, p.y, 1, p.h, C.W4);
    }

    for (const s of r.spikes) {
      vr(s.x, s.y, s.w, s.h, C.W4);
      const sw = 4;
      const cnt = Math.floor(s.w / sw);
      for (let i = 0; i < cnt; i++) {
        const sx = s.x + i * sw;
        if (!s.ceil) {
          vr(sx + 1, s.y, 2, 1, C.W0);
          vr(sx, s.y + 1, sw, 1, C.W0);
          if (s.h > 2) vr(sx, s.y + 2, sw, s.h - 2, C.W0);
          vr(sx + 1, s.y + 1, 2, 1, C.W2);
          if (s.h > 3) vr(sx + 1, s.y + 2, sw - 2, s.h - 3, C.W2);
        } else {
          if (s.h > 2) vr(sx, s.y, sw, s.h - 2, C.W0);
          vr(sx, s.y + s.h - 2, sw, 1, C.W0);
          vr(sx + 1, s.y + s.h - 1, 2, 1, C.W0);
          if (s.h > 3) vr(sx + 1, s.y, sw - 2, s.h - 3, C.W2);
          vr(sx + 1, s.y + s.h - 2, 2, 1, C.W2);
        }
      }
    }

    for (const a of r.anchors) {
      drawAnchor(a, hook.state === 'attached' && hook.ax === a.x && hook.ay === a.y);
    }

    drawExit(r.exit);
  }

  function drawHookRope() {
    if (hook.state === 'idle') return;

    const px = player.x + PW / 2;
    const py = player.y + PH / 2;
    const tx = hook.state === 'attached' ? hook.ax : hook.x;
    const ty = hook.state === 'attached' ? hook.ay : hook.y;

    const segs = 14;
    const sag = hook.state === 'attached' ? 7 : 0;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const rx = (px + (tx - px) * t0) | 0;
      const ry = (py + (ty - py) * t0 + Math.sin(t0 * Math.PI) * sag) | 0;
      const rx2 = (px + (tx - px) * t1) | 0;
      const ry2 = (py + (ty - py) * t1 + Math.sin(t1 * Math.PI) * sag) | 0;

      ctx.strokeStyle = i % 2 === 0 ? C.W0 : C.W3;
      ctx.lineWidth = S;
      ctx.beginPath();
      ctx.moveTo((rx + 0.5) * S, (ry + 0.5) * S);
      ctx.lineTo((rx2 + 0.5) * S, (ry2 + 0.5) * S);
      ctx.stroke();
    }

    if (hook.state === 'flying') {
      vr((hook.x | 0) - 1, (hook.y | 0) - 1, 3, 3, C.W0);
    }
  }

  function drawAim(r) {
    if (hook.state !== 'idle') return;

    const px = player.x + PW / 2;
    const py = player.y + PH / 2;
    const aim = Math.atan2(mouse.vy - py, (mouse.vx + camX) - px);
    let best = null;
    let bestD = 99999;
    for (const a of r.anchors) {
      const d = Math.hypot(a.x - px, a.y - py);
      if (d > MROPE + 12) continue;
      const ag = Math.atan2(a.y - py, a.x - px);
      let diff = Math.abs(aim - ag);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < 0.55 && d < bestD) {
        bestD = d;
        best = a;
      }
    }

    const dx = Math.cos(aim);
    const dy = Math.sin(aim);

    for (let d = 6; d < MROPE; d += 8) {
      if (d % 16 < 8) vp((px + dx * d) | 0, (py + dy * d) | 0, 'rgba(255,255,255,0.2)');
    }

    if (best) {
      const pk = Math.floor(time * 8) % 2 === 0;
      [[0, -8], [0, 8], [-8, 0], [8, 0], [6, 6], [-6, 6], [6, -6], [-6, -6]].forEach(([ox, oy]) => {
        vp((best.x | 0) + ox, (best.y | 0) + oy, pk ? C.W0 : C.W2);
      });
    }
  }

  function drawHUD(r) {
    vr(0, 0, VW, 9, C.BK);
    vr(0, 8, VW, 1, C.W3);
    vtxt(r.title, 128, 1, C.W0, 4, 'center');

    const maxH = Math.max(3, lives);
    const startHx = VW - 8 - maxH * 7;
    for (let i = 0; i < maxH; i++) {
      vr(startHx + i * 7, 1, 5, 5, i < lives ? C.W0 : C.W3);
    }

    vtxt(`${ri + 1}/${ROOMS.length}`, 3, 1, C.W2, 4, 'left');

    if (DEBUG_MODE) {
      vtxt('DBG:N=AVANCAR', 128, 10, C.W2, 3, 'center');
    }
  }

  function drawHint(r) {
    if (hintT > 0) {
      const a = Math.min(1, hintT);
      ctx.globalAlpha = a * a;
      vr(0, VH - 9, VW, 9, C.BK);
      vtxt(r.hint, 128, VH - 8, C.W2, 3, 'center');
      ctx.globalAlpha = 1;
    } else if (r.hint2 && hintT2 > 0) {
      const a = Math.min(1, hintT2);
      ctx.globalAlpha = a * a;
      vr(0, VH - 9, VW, 9, C.BK);
      vtxt(r.hint2, 128, VH - 8, C.W2, 3, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      vr((p.x | 0) - 1, (p.y | 0) - 1, 2, 2, p.c);
    }

    ctx.globalAlpha = 1;

    for (const f of floatTexts) {
      ctx.globalAlpha = Math.max(0, f.life);
      vtxt(f.txt, f.x | 0, f.y | 0, f.c, 4, 'center');
    }

    ctx.globalAlpha = 1;
  }

  function drawDeadOverlay() {
    vr(0, 0, VW, VH, 'rgba(0,0,0,0.75)');
    vtxt('VOCE MORREU', 128, 62, C.W1, 5, 'center');
    vtxt(`VIDAS: ${Math.max(0, lives)}`, 128, 78, C.W2, 4, 'center');
  }

  function drawRoomWin() {
    vr(0, 0, VW, VH, 'rgba(0,0,0,0.8)');
    for (let i = 0; i < VW; i += 8) {
      const b = Math.floor(time * 6) % 2;
      vr(i + (b * 4), 0, 4, 2, i % 16 === 0 ? C.W0 : C.W2);
      vr(i + ((1 - b) * 4), VH - 2, 4, 2, i % 16 === 0 ? C.W0 : C.W2);
    }
    vtxt('SALA COMPLETA!', 128, 44, C.W0, 6, 'center');
    vtxt(`SALA ${ri + 1} OK`, 128, 62, C.W1, 4, 'center');
    if (Math.floor(time * 3) % 2 === 0) {
      vtxt('ENTER/CLICK -> PROXIMA', 128, 82, C.W0, 4, 'center');
    }
  }

  function drawGameOver() {
    vr(0, 0, VW, VH, C.BK);
    for (let i = 0; i < 60; i++) {
      const nx = (i * 113 + ((time * 50) | 0)) % VW;
      const ny = (i * 79 + ((time * 40) | 0)) % VH;
      vp(nx, ny, C.W3);
    }
    vtxt('GAME OVER', 128, 40, C.W0, 8, 'center');
    vtxt(`SALAS: ${ri}`, 128, 70, C.W2, 4, 'center');
    if (Math.floor(time * 3) % 2 === 0) {
      vtxt('ENTER/CLICK PARA REINICIAR', 128, 88, C.W1, 3, 'center');
    }
  }

  function drawComplete() {
    vr(0, 0, VW, VH, C.BK);
    for (let i = 0; i < 40; i++) {
      const bx = (i * 71 + ((time * 30) | 0)) % VW;
      const by = (i * 53 + ((time * 18) | 0)) % VH;
      vr(bx, by, 2, 1, C.W2);
    }
    vtxt('PARABENS!', 128, 28, C.W0, 7, 'center');
    vtxt('CAMPANHA COMPLETA', 128, 42, C.W1, 5, 'center');
    vtxt('6 NIVEIS VENCIDOS', 128, 70, C.W2, 4, 'center');
    if (Math.floor(time * 3) % 2 === 0) {
      vtxt(onCampaignWon ? 'CLICK/ENTER: MENU' : 'CLICK/ENTER: NOVAMENTE', 128, 96, C.W2, 3, 'center');
    }
  }

  function update(dt) {
    time += dt;
    totalRunTime += dt;

    if (hintT > 0) hintT -= dt;
    if (hintT <= 0 && hintT2 > 0) hintT2 -= dt;
    if (shakeT > 0) {
      shakeT -= dt;
      if (shakeT < 0) shakeT = 0;
    }
    if (invTimer > 0) invTimer -= dt;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) floatTexts.splice(i, 1);
    }

    if (gs === 'dead') {
      deathT -= dt;
      if (deathT <= 0) {
        if (lives <= 0) {
          gs = 'gameover';
          sendLevelResult({ campaignEnded: true, wonCampaign: false });
        } else {
          gs = 'playing';
          initRoom(ri);
        }
      }
      return;
    }

    if (gs !== 'playing') return;

    const r = ROOMS[ri];
    const roomW = r.roomW || VW;
    let ix = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) ix = -1;
    if (keys['ArrowRight'] || keys['KeyD']) ix = 1;
    if (ix !== 0) player.face = ix;

    if (hook.state === 'attached') {
      player.vy += GRV * dt;
      player.vx += ix * AIRCTR * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      const cx = player.x + PW / 2;
      const cy = player.y + PH / 2;
      const rdx = cx - hook.ax;
      const rdy = cy - hook.ay;
      const dist = Math.hypot(rdx, rdy);

      if (dist > hook.rope) {
        const nx = rdx / dist;
        const ny = rdy / dist;
        player.x = hook.ax + nx * hook.rope - PW / 2;
        player.y = hook.ay + ny * hook.rope - PH / 2;

        const rv = player.vx * nx + player.vy * ny;
        if (rv > 0) {
          player.vx -= rv * nx;
          player.vy -= rv * ny;
        }
      }

      resolvePlayer(r.plat);
    } else {
      if (player.onG) {
        player.vx += ix * MVACC * dt * 8;
        player.vx *= Math.pow(FRIC, dt * 60);
      } else {
        player.vx += ix * AIRCTR * dt;
      }

      player.vx = clamp(player.vx, -320, 320);
      player.vy = Math.min(player.vy + GRV * dt, 450);
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      player.x = clamp(player.x, 8, roomW - 8 - PW);
      camX = Math.max(0, Math.min((player.x + PW / 2) - VW / 2, roomW - VW));
      if (player.y < 8) {
        player.y = 8;
        if (player.vy < 0) player.vy = 0;
      }

      resolvePlayer(r.plat);
    }

    if (player.onG && Math.abs(player.vx) > 10) {
      player.wt += dt;
      if (player.wt > 0.1) {
        player.wt = 0;
        player.wf += 0.5;
      }
    }

    if (hook.state === 'flying') {
      hook.x += hook.vx * dt;
      hook.y += hook.vy * dt;

      if (Math.hypot(hook.x - (player.x + PW / 2), hook.y - (player.y + PH / 2)) > MROPE) {
        hook.state = 'idle';
      }

      if (hook.state === 'flying') {
        for (const p of r.plat) {
          if (hook.x > p.x && hook.x < p.x + p.w && hook.y > p.y && hook.y < p.y + p.h) {
            hook.state = 'idle';
            break;
          }
        }
      }

      if (hook.state === 'flying') {
        for (const a of r.anchors) {
          if (Math.hypot(hook.x - a.x, hook.y - a.y) < SNAPR) {
            hook.state = 'attached';
            hook.ax = a.x;
            hook.ay = a.y;
            hook.rope = Math.hypot(player.x + PW / 2 - a.x, player.y + PH / 2 - a.y);
            spawnBurst(a.x, a.y, 8, [C.W0, C.W1, C.W2], 70);
            SFX.attach();
            break;
          }
        }
      }
    }

    for (const e of enemies) {
      if (!e.active) continue;
      e.t += dt;
      const inv = invTimer > 0;

      if (e.type === 'walker') {
        e.x += e.dir * e.speed * dt;
        if (e.x <= e.minX) {
          e.x = e.minX;
          e.dir = 1;
        }
        if (e.x + PW >= e.maxX) {
          e.x = e.maxX - PW;
          e.dir = -1;
        }
        if (!inv && ovlp(e.x, e.y, PW, PH, player.x, player.y, PW, PH)) killPlayer();
      }

      if (e.type === 'bat') {
        if (!e.bdir) e.bdir = 1;
        e.bx += e.bdir * e.spd * dt;
        if (e.bx < 10 || e.bx > roomW - 18) {
          e.bdir *= -1;
          e.bx = clamp(e.bx, 10, roomW - 18);
        }

        e.bx += Math.sign(player.x - e.bx) * e.spd * 0.18 * dt;
        e.x = e.bx;
        e.y = e.by + Math.sin(time * 3 + e.phase) * e.amp;
        if (!inv && ovlp(e.x, e.y, 8, 7, player.x, player.y, PW, PH)) killPlayer();
      }

      if (e.type === 'cannon') {
        if (e.t >= e.interval) {
          e.t = 0;
          const a = e.angle * (Math.PI / 180);
          bullets.push({
            x: e.x + Math.cos(a) * 11,
            y: e.y + Math.sin(a) * 11,
            vx: Math.cos(a) * BSPD,
            vy: Math.sin(a) * BSPD,
            life: 3
          });
          SFX.shoot();
          spawnBurst(e.x + Math.cos(a) * 11, e.y + Math.sin(a) * 11, 5, [C.W0, C.W1], 60);
        }
      }

      if (e.type === 'skull') {
        e.vy += GRV * dt;
        e.vy = Math.min(e.vy, 260);
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        if (e.x < 8 || e.x > roomW - 14) {
          e.vx *= -1;
          e.x = clamp(e.x, 8, roomW - 14);
          SFX.bounce();
        }

        if (e.y < 20) {
          e.vy = Math.abs(e.vy) * 0.5;
          e.y = 20;
        }

        if (e.y > VH - 7) {
          e.vy = -Math.min(Math.abs(e.vy) * 0.7, 150);
          if (Math.abs(e.vy) < 150) e.vy = -150;
          e.y = VH - 7;
        }

        let bounced = false;
        for (const p of r.plat) {
          if (!bounced && e.vy > 0 && ovlp(e.x, e.y, 6, 7, p.x, p.y, p.w, p.h)) {
            e.vy = -Math.min(Math.abs(e.vy) * 0.7, 160);
            if (Math.abs(e.vy) < 150) e.vy = -150;
            e.y = p.y - 7;
            e.vx += (Math.random() - 0.5) * 24;
            bounced = true;
            SFX.bounce();
            spawnBurst(e.x, e.y, 4, [C.W0, C.W2], 50);
          }
        }

        if (e.y > VH + 20) {
          e.vy = -150;
          e.y = VH - 20;
        }

        e.vx += (player.x - e.x) * 0.08 * dt;
        e.vx = clamp(e.vx, -100, 100);

        if (!inv && ovlp(e.x, e.y, 6, 7, player.x, player.y, PW, PH)) killPlayer();
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      let hit = false;
      for (const p of r.plat) {
        if (b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) {
          hit = true;
          break;
        }
      }

      if (hit || b.life <= 0 || b.x < 0 || b.x > roomW || b.y < 0 || b.y > VH) {
        if (hit) spawnBurst(b.x, b.y, 4, [C.W0, C.W1], 40);
        bullets.splice(i, 1);
        continue;
      }

      if (invTimer <= 0 && ovlp(b.x - 2, b.y - 2, 4, 4, player.x, player.y, PW, PH)) killPlayer();
    }

    if (player.y > VH + 20) killPlayer();

    if (invTimer <= 0) {
      for (const s of r.spikes) {
        if (ovlp(player.x, player.y, PW, PH, s.x, s.y, s.w, s.h)) {
          killPlayer();
          break;
        }
      }
    }

    const ex = r.exit;
    if (ovlp(player.x, player.y, PW, PH, ex.x, ex.y, ex.w, ex.h)) {
      finalizeRoomIfNeeded(ri);
      SFX.win();
      shake(2, 0.4);
      flash('#ffffff', 0.08);
      spawnBurst(ex.x + ex.w / 2, ex.y + ex.h / 2, 28, [C.W0, C.W1, C.W2], 140);
      spawnFloat(player.x + PW / 2, player.y - 4, 'OK!', C.W0);

      if (ri >= ROOMS.length - 1) {
        gs = 'complete';
        sendLevelResult({ campaignEnded: true, wonCampaign: true });
      } else {
        gs = 'roomwin';
        sendLevelResult({ canAdvance: true, campaignEnded: false, wonCampaign: false });
      }
    }
  }

  function draw() {
    if (gs === 'gameover') {
      drawGameOver();
      return;
    }

    if (gs === 'complete') {
      drawComplete();
      return;
    }

    const r = ROOMS[ri];

    ctx.save();
    if (camX !== 0) ctx.translate(-(camX | 0) * S, 0);
    drawRoom(r);
    drawAim(r);

    for (const e of enemies) {
      if (!e.active) continue;
      if (e.type === 'walker') drawGoblin(e);
      if (e.type === 'bat') drawBat(e);
      if (e.type === 'cannon') drawCannon(e);
      if (e.type === 'skull') drawSkull(e);
    }

    for (const b of bullets) drawBullet(b);

    drawHookRope();
    drawPlayer();
    drawParticles();
    ctx.restore();

    if (hook.state === 'idle') {
      vp((mouse.vx | 0) - 4, mouse.vy | 0, C.W1);
      vp((mouse.vx | 0) + 4, mouse.vy | 0, C.W1);
      vp(mouse.vx | 0, (mouse.vy | 0) - 4, C.W1);
      vp(mouse.vx | 0, (mouse.vy | 0) + 4, C.W1);
    }

    drawHUD(r);
    drawHint(r);

    if (gs === 'dead') drawDeadOverlay();
    if (gs === 'roomwin') drawRoomWin();
  }

  function loop(ts) {
    if (!running) return;

    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    update(dt);

    ctx.save();
    if (shakeT > 0) {
      ctx.translate((((Math.random() - 0.5) * shakeAmp * 2) | 0) * S, (((Math.random() - 0.5) * shakeAmp * 2) | 0) * S);
    }
    draw();
    ctx.restore();

    rafId = requestAnimationFrame(loop);
  }

  function registerInputs() {
    keyDownHandler = e => {
      if (!running) return;
      if (keys[e.code]) return;
      keys[e.code] = true;

      if (DEBUG_MODE && e.code === 'KeyN') {
        e.preventDefault();
        debugAdvanceRoom();
        return;
      }

      if (gs === 'roomwin' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        advRoom();
        return;
      }

      if (gs === 'gameover' && e.code === 'Enter') {
        e.preventDefault();
        api.startCampaign();
        return;
      }

      if (gs === 'complete' && e.code === 'Enter') {
        e.preventDefault();
        if (onCampaignWon) { onCampaignWon(); } else { api.startCampaign(); }
        return;
      }

      if (gs !== 'playing') return;

      if (e.code === 'KeyR') {
        initRoom(ri);
        return;
      }

      if (e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        if (hook.state === 'attached') jumpOffHook();
        else if (player.onG) doJump();
        return;
      }

      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (hook.state === 'attached') {
          jumpOffHook();
          return;
        }

        if (player.onG) {
          doJump();
        }
      }
    };

    keyUpHandler = e => {
      keys[e.code] = false;
    };

    moveHandler = e => {
      if (!running) return;
      const r = canvas.getBoundingClientRect();
      mouse.vx = (e.clientX - r.left) * (VW / r.width);
      mouse.vy = (e.clientY - r.top) * (VH / r.height);
    };

    clickHandler = e => {
      if (!running) return;

      const r = canvas.getBoundingClientRect();
      mouse.vx = (e.clientX - r.left) * (VW / r.width);
      mouse.vy = (e.clientY - r.top) * (VH / r.height);

      if (gs === 'roomwin') {
        advRoom();
        return;
      }

      if (gs === 'gameover') {
        api.startCampaign();
        return;
      }
      if (gs === 'complete') {
        if (onCampaignWon) { onCampaignWon(); } else { api.startCampaign(); }
        return;
      }

      if (gs !== 'playing') return;
      fireHook();
    };

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);
    canvas.addEventListener('mousemove', moveHandler);
    canvas.addEventListener('click', clickHandler);
  }

  function unregisterInputs() {
    if (keyDownHandler) document.removeEventListener('keydown', keyDownHandler);
    if (keyUpHandler) document.removeEventListener('keyup', keyUpHandler);
    if (moveHandler && canvas) canvas.removeEventListener('mousemove', moveHandler);
    if (clickHandler && canvas) canvas.removeEventListener('click', clickHandler);

    keyDownHandler = null;
    keyUpHandler = null;
    moveHandler = null;
    clickHandler = null;
  }

  const api = {
    mount(options) {
      canvas = options.canvas;
      flashEl = options.flashEl || null;
      onLevelEnd = options.onLevelEnd || null;
      onCampaignWon = options.onCampaignWon || null;
      if (!canvas) throw new Error('HookshotGame: canvas ausente');

      ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      mounted = true;
      return api;
    },

    startCampaign(options = {}) {
      if (!mounted) return;

      ri = 0;
      lives = 3;
      gs = 'playing';
      deathT = 0;
      time = 0;
      totalRunTime = 0;
      roomStartTime = 0;
      hintT = 6;
      shakeT = 0;
      shakeAmp = 0;
      invTimer = 0;
      levelResultSent = false;
      roomDeaths = Array(ROOMS.length).fill(0);
      roomClearTimes = Array(ROOMS.length).fill(0);
      roomCleared = Array(ROOMS.length).fill(false);

      const snapshot = options && typeof options === 'object' ? options.fromCheckpoint : null;
      if (snapshot) {
        restoreCampaignSnapshot(snapshot);
      }

      initRoom(ri);

      unregisterInputs();
      registerInputs();

      if (!running) {
        running = true;
        lastT = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    },

    nextLevel() {
      if (!mounted || !running) return;
      if (gs !== 'roomwin') return;
      advRoom();
    },

    restartCampaign() {
      api.startCampaign();
    },

    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      unregisterInputs();
    },

    destroy() {
      api.stop();
      mounted = false;
      canvas = null;
      ctx = null;
      flashEl = null;
      onLevelEnd = null;
    },

    getProgress() {
      return {
        level: ri + 1,
        totalLevels: ROOMS.length,
        lives,
        state: gs,
        partialScore: computeScore(false),
        campaignSnapshot: {
          roomIndex: ri,
          totalLevels: ROOMS.length,
          lives,
          totalRunTime,
          roomDeaths: roomDeaths.slice(),
          roomClearTimes: roomClearTimes.slice(),
          roomCleared: roomCleared.slice()
        },
        debug: DEBUG_MODE
      };
    }
  };

  window.HookshotGame = api;
})();
