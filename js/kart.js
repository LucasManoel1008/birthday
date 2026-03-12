(function () {
  const DEBUG_MODE = /(^|[?&])kartDebug=1(&|$)/.test(window.location.search);

  const LEVELS = [
    { name: 'NIVEL 1', rDist: 4000, cSpd: 2.9, boost: 3.3, control: 'space', assist: 0.2 },
    { name: 'NIVEL 2', rDist: 6500, cSpd: 3.5, boost: 3.7, control: 'space', assist: 0.1 },
    {
      name: 'NIVEL 3',
      rDist: 7000,
      cSpd: 3.3,
      boost: 2.35,
      control: 'ad',
      assist: 0.13,
      pedalDelay: 85,
      cadenceMinGap: 0,
      cadenceMaxGap: 320,
      fatigueDrag: 0.22
    }
  ];

  const REF_X = 150;
  const DSCALE = 0.19;
  const MSPD = 16;
  const DECAY = 0.937;
  const RT = 90;
  const RH = 260;
  const LH = RH / 2;
  const S = 3;
  const W = 720;
  const H = 440;

  let canvas = null;
  let ctx = null;
  let onLevelEnd = null;

  let animationId = null;
  let mounted = false;
  let running = false;

  let currentLevelIndex = 0;
  let campaignWins = 0;
  let campaignEnded = false;
  let canAdvance = false;

  let gs = 'cd';
  let pl = null;
  let cp = null;
  let pts = [];
  let rOff = 0;
  let shX = 0;
  let shY = 0;
  let cVal = 3;
  let cMs = null;
  let win = '';
  let levelResultSent = false;
  let spaceDown = false;
  let lastPedalKey = '';
  let lastPedalTs = -Infinity;
  let nextPedalAllowedTs = -Infinity;
  let adPressed = { A: false, D: false };

  let enemySpriteImg1 = null;
  let enemySpriteImg2 = null;
  let enemySpritesLoaded = false;
  let enemySpriteAnimStartTime = 0;

  let keyDownHandler = null;
  let keyUpHandler = null;
  let pointerHandler = null;
  let resizeHandler = null;
  let audioCtx = null;
  let activeOscillators = new Set();
  let scheduledSfxTimeouts = [];
  let countdownCueValue = null;
  let fatigueWarningAt = -Infinity;

  function ensureAudioReady() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    } catch {
      return null;
    }
  }

  function cleanupOscillator(oscillator, gainNode) {
    activeOscillators.delete(oscillator);
    try { oscillator.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
  }

  function playTone({ freq = 440, type = 'square', vol = 0.08, dur = 0.08, decay = 0.04, freq2 = null, delay = 0 } = {}) {
    const ac = ensureAudioReady();
    if (!ac) return;

    const oscillator = ac.createOscillator();
    const gainNode = ac.createGain();
    const startAt = ac.currentTime + delay;

    oscillator.connect(gainNode);
    gainNode.connect(ac.destination);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, startAt);
    if (freq2 !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), startAt + dur);
    }

    gainNode.gain.setValueAtTime(vol, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + dur + decay);

    activeOscillators.add(oscillator);
    oscillator.onended = () => cleanupOscillator(oscillator, gainNode);
    oscillator.start(startAt);
    oscillator.stop(startAt + dur + decay);
  }

  function scheduleSfx(callback, delayMs) {
    const timeoutId = window.setTimeout(() => {
      scheduledSfxTimeouts = scheduledSfxTimeouts.filter(id => id !== timeoutId);
      callback();
    }, delayMs);

    scheduledSfxTimeouts.push(timeoutId);
  }

  function stopAllSfx() {
    scheduledSfxTimeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
    scheduledSfxTimeouts = [];

    activeOscillators.forEach(oscillator => {
      try { oscillator.stop(); } catch {}
    });
    activeOscillators.clear();
  }

  const SFX = {
    countdown(value) {
      const freqMap = { 3: 430, 2: 520, 1: 640 };
      const freq = freqMap[value] || 430;
      playTone({ freq, freq2: freq * 0.92, vol: 0.085, dur: 0.07, decay: 0.04 });
    },

    raceStart() {
      [720, 920, 1180].forEach((freq, index) => {
        playTone({ freq, type: 'square', vol: 0.09, dur: 0.06, decay: 0.05, delay: index * 0.05 });
      });
    },

    boost(source, levelIndex) {
      const isPedal = source === 'pedal';
      const base = isPedal ? 210 : 170;
      const offset = levelIndex * 22;

      playTone({
        freq: base + offset,
        freq2: 420 + offset,
        type: isPedal ? 'sawtooth' : 'square',
        vol: 0.07,
        dur: 0.05,
        decay: 0.05
      });
      playTone({
        freq: 120 + offset,
        freq2: 80 + offset,
        type: 'triangle',
        vol: 0.035,
        dur: 0.045,
        decay: 0.04,
        delay: 0.01
      });
    },

    fatigueWarning() {
      playTone({ freq: 150, freq2: 102, type: 'sawtooth', vol: 0.05, dur: 0.08, decay: 0.05 });
    },

    victory() {
      [523, 659, 784, 1046].forEach((freq, index) => {
        playTone({ freq, type: 'square', vol: 0.09, dur: 0.09, decay: 0.08, delay: index * 0.09 });
      });
    },

    defeat() {
      [280, 220, 165].forEach((freq, index) => {
        playTone({ freq, freq2: Math.max(70, freq - 40), type: 'sawtooth', vol: 0.08, dur: 0.12, decay: 0.08, delay: index * 0.08 });
      });
    }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lY(lane) {
    return RT + (lane - 1) * LH + LH * 0.5 - 18;
  }

  function fill(color) {
    ctx.fillStyle = color;
  }

  function rect(x, y, w, h) {
    ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const parent = canvas.parentElement;
    const mw = Math.max(360, parent.clientWidth - 4);
    const ratio = W / H;
    let w = mw;
    let h = mw / ratio;

    // Em desktop priorizamos largura do container para evitar travar em ~400x245.
    // Em telas menores, ainda respeitamos a altura disponivel para caber no viewport.
    if (window.innerWidth <= 900) {
      const mh = Math.max(240, window.innerHeight - 180);
      if (h > mh) {
        h = mh;
        w = h * ratio;
      }
    }

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function addPt(x, y, vx, vy, life) {
    pts.push({
      x,
      y,
      vx,
      vy,
      life,
      dec: 0.055 + Math.random() * 0.04,
      sz: 2 + Math.random() * 5
    });
  }

  function tickPts() {
    pts = pts.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.dec;
      if (p.life <= 0) return false;
      ctx.fillStyle = `rgba(180,180,180,${p.life.toFixed(2)})`;
      ctx.fillRect(p.x | 0, p.y | 0, p.sz | 0, p.sz | 0);
      return true;
    });
  }

  function doBoost(source, pedalKey, atTime) {
    if (gs !== 'race') return;
    const level = LEVELS[currentLevelIndex];

    if (level.control === 'ad') {
      if (source !== 'pedal') return;
      if (pedalKey !== 'A' && pedalKey !== 'D') return;
      if (pedalKey === lastPedalKey) return;

      const nowMs = typeof atTime === 'number' ? atTime : performance.now();
      if (nowMs < nextPedalAllowedTs) return;

      if (Number.isFinite(lastPedalTs)) {
        const gap = nowMs - lastPedalTs;
        // Limite maximo nao bloqueia boost: ele so aciona perda de velocidade em update().
        // Isso evita travar permanentemente apos perder o ritmo por alguns instantes.
        if (gap < level.cadenceMinGap) return;
      }

      lastPedalTs = nowMs;
      nextPedalAllowedTs = nowMs + (level.pedalDelay || 0);
      lastPedalKey = pedalKey;
    } else {
      if (source === 'pedal') return;
    }

    pl.spd = clamp(pl.spd + level.boost, 0, MSPD);
    pl.bnc = 6;
    SFX.boost(source, currentLevelIndex);

    for (let i = 0; i < 6; i++) {
      addPt(
        REF_X - 5,
        lY(1) + 24,
        -Math.random() * 4 - 1,
        (Math.random() - 0.5) * 2.5,
        0.95
      );
    }
  }

  function debugAdvanceLevel() {
    if (!DEBUG_MODE) return;
    if (campaignEnded) return;

    if (gs === 'done' && canAdvance) {
      api.nextLevel();
      return;
    }

    if (gs !== 'done') {
      win = 'pl';
      gs = 'done';
      sendLevelResult();
    }
  }

  function registerInputs() {
    if (!canvas) return;

    keyDownHandler = e => {
      if (!running) return;
      if (e.repeat) return;

      if (DEBUG_MODE && e.code === 'KeyN') {
        e.preventDefault();
        debugAdvanceLevel();
        return;
      }

      const level = LEVELS[currentLevelIndex];

      if (e.code === 'Space') {
        e.preventDefault();
        if (level.control === 'space' && !spaceDown) {
          spaceDown = true;
          doBoost('space');
        }
      }

      if (level.control === 'ad' && (e.code === 'KeyA' || e.code === 'KeyD')) {
        const pedal = e.code === 'KeyA' ? 'A' : 'D';

        // Ignora repeticao da mesma tecla pressionada sem keyup.
        if (adPressed[pedal]) return;

        adPressed[pedal] = true;

        // Se A e D foram pressionadas juntas, nao processa o segundo disparo.
        if (adPressed.A && adPressed.D) return;

        doBoost('pedal', pedal, performance.now());
      }
    };

    keyUpHandler = e => {
      if (e.code === 'Space') {
        spaceDown = false;
      }

      if (e.code === 'KeyA') adPressed.A = false;
      if (e.code === 'KeyD') adPressed.D = false;
    };

    pointerHandler = e => {
      if (!running) return;
      e.preventDefault();

      const level = LEVELS[currentLevelIndex];
      if (level.control === 'space') {
        doBoost('tap');
      }
    };

    resizeHandler = () => resizeCanvas();

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);
    canvas.addEventListener('pointerdown', pointerHandler);
    window.addEventListener('resize', resizeHandler);
  }

  function unregisterInputs() {
    if (keyDownHandler) document.removeEventListener('keydown', keyDownHandler);
    if (keyUpHandler) document.removeEventListener('keyup', keyUpHandler);
    if (canvas && pointerHandler) canvas.removeEventListener('pointerdown', pointerHandler);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);

    keyDownHandler = null;
    keyUpHandler = null;
    pointerHandler = null;
    resizeHandler = null;
    spaceDown = false;
    lastPedalKey = '';
    lastPedalTs = -Infinity;
    nextPedalAllowedTs = -Infinity;
    adPressed = { A: false, D: false };
  }

  function drawScenery() {
    for (let i = 0; i < 7; i++) {
      const x = (((i * 140) - rOff * 0.35) % (W + 140)) - 70 | 0;
      fill('#1e1e1e'); rect(x, RT - 34, 5, 32);
      fill('#888'); rect(x - 5, RT - 38, 16, 6);
      fill('#fff'); rect(x - 3, RT - 36, 3, 3);
      fill('#222'); rect(x + 60, RT + RH + 2, 6, 18);
      fill('#2d2d2d'); rect(x + 54, RT + RH - 5, 18, 10);
      fill('#363636'); rect(x + 57, RT + RH - 15, 12, 12);
      fill('#3d3d3d'); rect(x + 60, RT + RH - 23, 6, 10);
    }
  }

  function drawRoad(level) {
    fill('#0d0d0d'); rect(0, RT - 36, W, 36); rect(0, RT + RH, W, H - (RT + RH));
    fill('#111'); rect(0, RT, W, RH);
    fill('#fff'); rect(0, RT, W, 4); rect(0, RT + RH - 4, W, 4);
    fill('#3a3a3a'); rect(0, RT + LH - 2, W, 4);

    const d1 = RT + LH * 0.5;
    const d2 = RT + LH + LH * 0.5;
    for (let i = -1; i < 12; i++) {
      const x = i * 90 - (rOff % 90);
      fill('#252525');
      rect(x, d1 - 2, 50, 4);
      rect(x, d2 - 2, 50, 4);
    }

    const fx = REF_X + (level.rDist - pl.d) * DSCALE;
    if (fx < W + 20 && fx > -20) {
      for (let row = 0; row < RH / 10; row++) {
        for (let col = 0; col < 2; col++) {
          fill((row + col) % 2 === 0 ? '#fff' : '#000');
          rect(fx + col * 8, RT + row * 10, 8, 10);
        }
      }
    }

    drawScenery();
  }

  function drawKart(x, y, isPlayer) {
    const b = isPlayer ? '#fff' : '#bbb';
    const dk = '#000';
    const gr = '#585858';
    const wh = '#1c1c1c';

    ctx.fillStyle = 'rgba(255,255,255,0.05)'; rect(x + S * 2, y + S * 10 + 2, S * 18, S * 2);
    fill('#3a3a3a'); rect(x - S * 2, y + S * 4, S * 2, S * 2);
    fill(b); rect(x - S, y + S * 2, S * 2, S * 5);
    fill(b); rect(x, y + S * 3, S * 19, S * 5);
    fill(gr); rect(x + S, y + S * 5, S * 17, S);
    fill(b); rect(x + S * 19, y + S * 3, S * 3, S * 5);
    fill(b); rect(x + S * 5, y, S * 9, S * 4);
    fill(dk); rect(x + S * 11, y + S, S * 3, S * 3);
    fill(gr); rect(x + S * 6, y + S, S * 3, S * 3);
    fill('#3a3a3a'); rect(x + S * 5, y, S * 9, S);
    fill(dk); rect(x + S * 12, y + S * 6, S * 6, S * 2);
    fill(wh); rect(x + S * 13, y + S * 7, S * 4, S * 3);
    fill(b); rect(x + S * 14, y + S * 9, S * 2, S * 2);
    fill(dk); rect(x + S, y + S * 6, S * 6, S * 2);
    fill(wh); rect(x + S * 2, y + S * 7, S * 4, S * 3);
    fill(b); rect(x + S * 3, y + S * 9, S * 2, S * 2);

    ctx.fillStyle = dk;
    ctx.font = `bold ${S * 3}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isPlayer ? '1' : '2', x + S * 8 + 2, y + S * 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawEnemySprite(x, y, now) {
    if (!enemySpritesLoaded || !enemySpriteImg1 || !enemySpriteImg2) {
      drawKart(x, y, false);
      return;
    }

    const elapsedMs = now - enemySpriteAnimStartTime;
    const frameIndex = Math.floor(elapsedMs / 140) % 2;
    const spriteImg = frameIndex === 0 ? enemySpriteImg1 : enemySpriteImg2;

    ctx.drawImage(spriteImg, x, y);
  }

  function drawBar(level) {
    const bx = 50;
    const by = 12;
    const bw = W - 100;
    const bh = 20;

    fill('#111'); rect(bx, by, bw, bh);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    

    const cpuX = bx + Math.min(cp.d / level.rDist, 1) * bw;
    const plX = bx + Math.min(pl.d / level.rDist, 1) * bw;

    fill('#666'); rect(cpuX - 4, by - 4, 8, bh + 8);
    fill('#fff'); rect(plX - 5, by - 5, 10, bh + 10);
  }

  function drawHUD(level, now) {
    const gx = 14;
    const gy = H - 74;
    const gw = 130;
    const gh = 60;

    fill('#000'); rect(gx, gy, gw, gh);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, gh);

    const pct = pl.spd / MSPD;
    const bw2 = gw - 20;

    fill('#fff');
    rect(gx + 10, gy + 20, bw2 * pct, 12);

    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(pct * 200)} KM/H`, gx + gw / 2, gy + 50);

    const pos = pl.d >= cp.d ? '1ST' : '2ND';
    const px2 = W - 94;
    const py2 = H - 74;

    fill('#000'); rect(px2, py2, 80, 60);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(px2, py2, 80, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText(pos, px2 + 40, py2 + 46);

    ctx.font = '7px monospace';
    ctx.fillText(`NIVEL ${currentLevelIndex + 1} / ${LEVELS.length}`, W / 2, 18);
    const hint = level.control === 'ad'
      ? '[A] e [D] ALTERNADOS EM RITMO'
      : '[SPACE] / TAP - ACELERAR';
    ctx.fillText(hint, W / 2, H - 6);

    if (level.control === 'ad') {
      drawPedalIndicator(level, now);
    }

    if (DEBUG_MODE) {
      ctx.fillText('[DEBUG] N = AVANCAR NIVEL', W / 2, 30);
    }
  }

  function drawPedalIndicator(level, now) {
    const panelW = 236;
    const panelH = 52;
    const panelX = (W - panelW) / 2;
    const panelY = 32;

    const hasPedalHistory = Number.isFinite(lastPedalTs);
    const expectedKey = hasPedalHistory && lastPedalKey === 'A' ? 'D' : 'A';
    const readyNow = now >= nextPedalAllowedTs;
    const tooLate = hasPedalHistory && (now - lastPedalTs) > level.cadenceMaxGap;
    const blink = Math.floor(now / 140) % 2 === 0;
    const cooldownMs = Math.max(0, nextPedalAllowedTs - now);

    fill('rgba(0,0,0,0.78)');
    rect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    const keyBoxW = 44;
    const keyBoxH = 24;
    const aBoxX = panelX + 22;
    const dBoxX = panelX + panelW - keyBoxW - 22;
    const boxY = panelY + 18;

    const aActive = expectedKey === 'A';
    const dActive = expectedKey === 'D';
    const activeColor = readyNow && blink ? '#ffffff' : '#bdbdbd';
    const idleColor = '#3f3f3f';

    fill(aActive ? activeColor : idleColor);
    rect(aBoxX, boxY, keyBoxW, keyBoxH);
    fill(dActive ? activeColor : idleColor);
    rect(dBoxX, boxY, keyBoxW, keyBoxH);

    ctx.fillStyle = aActive ? '#000' : '#bdbdbd';
    ctx.font = "13px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('A', aBoxX + keyBoxW / 2, boxY + 17);

    ctx.fillStyle = dActive ? '#000' : '#bdbdbd';
    ctx.fillText('D', dBoxX + keyBoxW / 2, boxY + 17);

    ctx.fillStyle = tooLate ? '#ff7a7a' : (readyNow ? '#ffffff' : '#9a9a9a');
    ctx.font = "7px 'Press Start 2P', monospace";
    const centerY = panelY + 33;
    if (tooLate) {
      ctx.fillText('RITMO!', W / 2, centerY);
    } else if (readyNow) {
      ctx.fillText(`AGORA: ${expectedKey}`, W / 2, centerY);
    } else {
      ctx.fillText('PREPARE...', W / 2, centerY);
    }

    if (cooldownMs > 0) {
      const coolW = 80;
      const coolH = 4;
      const coolX = W / 2 - coolW / 2;
      const coolY = panelY + 43;
      const ratio = clamp(1 - cooldownMs / Math.max(1, level.pedalDelay || 1), 0, 1);
      fill('#252525');
      rect(coolX, coolY, coolW, coolH);
      fill('#ffffff');
      rect(coolX, coolY, coolW * ratio, coolH);
    }
  }

  function drawCountdown(now) {
    fill('rgba(0,0,0,0.55)'); rect(0, 0, W, H);
    const lbl = cVal > 0 ? String(cVal) : 'GO!';
    const pulse = cVal > 0 ? 1 + 0.12 * Math.sin((now / 110) * Math.PI) : 1.12;

    ctx.font = `${(50 * pulse) | 0}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fill('#2a2a2a'); ctx.fillText(lbl, W / 2 + 5, H / 2 + 5);
    fill('#fff'); ctx.fillText(lbl, W / 2, H / 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawDone() {
    fill('rgba(0,0,0,0.8)'); rect(0, 0, W, H);

    const isPlayerWin = win === 'pl';
    const bw = 480;
    const bh = 220;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;

    fill('#000'); rect(bx, by, bw, bh);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `18px 'Press Start 2P', monospace`;
    ctx.fillText(isPlayerWin ? 'VITORIA!' : 'DERROTA...', W / 2, by + 64);

    ctx.font = `8px 'Press Start 2P', monospace`;
    if (isPlayerWin && currentLevelIndex < LEVELS.length - 1) {
      ctx.fillText('PRONTO PARA O PROXIMO NIVEL', W / 2, by + 108);
    } else if (isPlayerWin) {
      ctx.fillText('CAMPANHA COMPLETA', W / 2, by + 108);
    } else {
      ctx.fillText('TENTE NOVAMENTE', W / 2, by + 108);
    }

    ctx.textBaseline = 'alphabetic';
  }

  function sendLevelResult() {
    if (levelResultSent || !onLevelEnd) return;
    levelResultSent = true;

    const wonLevel = win === 'pl';
    if (wonLevel) {
      SFX.victory();
    } else {
      SFX.defeat();
    }

    if (wonLevel) {
      campaignWins += 1;
      canAdvance = currentLevelIndex < LEVELS.length - 1;
      campaignEnded = !canAdvance;
    } else {
      canAdvance = false;
      campaignEnded = true;
    }

    const wonCampaign = campaignEnded && campaignWins === LEVELS.length;

    onLevelEnd({
      level: currentLevelIndex + 1,
      totalLevels: LEVELS.length,
      wonLevel,
      canAdvance,
      campaignEnded,
      wonCampaign,
      finalScore: wonCampaign ? 1000 : 0
    });
  }

  function update(now) {
    const level = LEVELS[currentLevelIndex];

    if (gs === 'cd') {
      if (cVal > 0 && countdownCueValue !== cVal) {
        SFX.countdown(cVal);
        countdownCueValue = cVal;
      }

      if (!cMs) cMs = now;
      if (cVal > 0 && now - cMs >= 900) {
        cMs = now;
        cVal -= 1;
      } else if (cVal === 0 && now - cMs >= 700) {
        gs = 'race';
        SFX.raceStart();
      }
      return;
    }

    if (gs !== 'race') return;

    pl.spd *= DECAY;
    if (level.assist > 0) {
      pl.spd = clamp(pl.spd + level.assist, 0, MSPD);
    }

    if (level.control === 'ad' && Number.isFinite(lastPedalTs)) {
      const idleMs = now - lastPedalTs;
      if (idleMs > level.cadenceMaxGap) {
        const lateFactor = clamp((idleMs - level.cadenceMaxGap) / 280, 0, 1.5);
        pl.spd = clamp(pl.spd - level.fatigueDrag * lateFactor, 0, MSPD);

        if (now >= fatigueWarningAt) {
          SFX.fatigueWarning();
          fatigueWarningAt = now + 420;
        }
      }
    }

    pl.d += pl.spd;
    pl.bnc = Math.max(0, pl.bnc - 0.65);

    const tgt = level.cSpd + Math.sin(now / 900) * 1.8 + Math.cos(now / 340) * 0.6;
    cp.spd += (tgt - cp.spd) * 0.04;
    cp.d += cp.spd;

    const csx = REF_X + (cp.d - pl.d) * DSCALE;
    if (Math.random() > 0.65) {
      addPt(csx - 4, lY(2) + 24, -Math.random() * 2 - 0.4, (Math.random() - 0.5) * 0.8, 0.4);
    }

    rOff += pl.spd * 0.72;
    if (pl.spd > 11) {
      shX = (Math.random() - 0.5) * 2.5;
      shY = (Math.random() - 0.5) * 1.5;
    } else {
      shX *= 0.7;
      shY *= 0.7;
    }

    if (pl.d >= level.rDist || cp.d >= level.rDist) {
      win = pl.d >= level.rDist ? 'pl' : 'cp';
      gs = 'done';
      sendLevelResult();
    }
  }

  function draw(now) {
    const level = LEVELS[currentLevelIndex];

    ctx.save();
    if (gs === 'race') ctx.translate(shX | 0, shY | 0);

    fill('#000'); rect(0, 0, W, H);
    drawBar(level);
    drawRoad(level);

    const csx2 = REF_X + (cp.d - pl.d) * DSCALE;
    drawEnemySprite(csx2 - 33, lY(2), now);
    drawKart(REF_X - 33, (lY(1) - pl.bnc) | 0, true);

    tickPts();
    ctx.restore();

    if (gs === 'race' || gs === 'done') drawHUD(level, now);
    if (gs === 'cd') drawCountdown(now);
    if (gs === 'done') drawDone();
  }

  function loop(now) {
    if (!running) return;
    update(now);
    draw(now);
    animationId = requestAnimationFrame(loop);
  }

  function resetLevel(levelIndex) {
    stopAllSfx();
    currentLevelIndex = clamp(levelIndex, 0, LEVELS.length - 1);
    gs = 'cd';
    cVal = 3;
    cMs = null;
    win = '';
    levelResultSent = false;
    countdownCueValue = null;
    fatigueWarningAt = -Infinity;
    lastPedalKey = '';
    lastPedalTs = -Infinity;
    nextPedalAllowedTs = -Infinity;
    adPressed = { A: false, D: false };
    pl = { d: 0, spd: 0, bnc: 0 };
    cp = { d: 0, spd: LEVELS[currentLevelIndex].cSpd };
    pts = [];
    rOff = 0;
    shX = 0;
    shY = 0;
    enemySpriteAnimStartTime = performance.now();
  }

  function startLoop() {
    if (running) return;
    running = true;
    animationId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    running = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  const api = {
    mount(options) {
      canvas = options.canvas;
      onLevelEnd = options.onLevelEnd;
      if (!canvas) throw new Error('KartGame: canvas ausente');

      ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      resizeCanvas();

      enemySpriteImg1 = new Image();
      enemySpriteImg2 = new Image();
      enemySpritesLoaded = false;

      let loadedCount = 0;
      const markLoaded = () => {
        loadedCount += 1;
        if (loadedCount === 2) {
          enemySpritesLoaded = true;
        }
      };

      const markError = () => {
        enemySpritesLoaded = false;
      };

      enemySpriteImg1.onload = markLoaded;
      enemySpriteImg2.onload = markLoaded;
      enemySpriteImg1.onerror = markError;
      enemySpriteImg2.onerror = markError;

      enemySpriteImg1.src = './sprt/characters/cachorro1.png';
      enemySpriteImg2.src = './sprt/characters/cachorro2.png';
      enemySpriteAnimStartTime = performance.now();

      mounted = true;
      return api;
    },

    startCampaign() {
      if (!mounted) return;
      ensureAudioReady();
      campaignWins = 0;
      campaignEnded = false;
      canAdvance = false;
      resetLevel(0);
      unregisterInputs();
      registerInputs();
      startLoop();
    },

    nextLevel() {
      if (!mounted || !canAdvance) return;
      ensureAudioReady();
      resetLevel(currentLevelIndex + 1);
      unregisterInputs();
      registerInputs();
      startLoop();
    },

    restartCampaign() {
      api.startCampaign();
    },

    stop() {
      stopLoop();
      unregisterInputs();
      stopAllSfx();
    },

    destroy() {
      api.stop();
      mounted = false;
      canvas = null;
      ctx = null;
      onLevelEnd = null;
      enemySpriteImg1 = null;
      enemySpriteImg2 = null;
      enemySpritesLoaded = false;
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      audioCtx = null;
    },

    getProgress() {
      return {
        level: currentLevelIndex + 1,
        totalLevels: LEVELS.length,
        campaignWins,
        campaignEnded,
        canAdvance,
        gs,
        win,
        debug: DEBUG_MODE
      };
    }
  };

  window.KartGame = api;
})();
