(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlaySubEl = document.getElementById('overlay-sub');
  const comboEl = document.getElementById('combo');
  const hintEl = document.getElementById('hint');

  const BLOCK_H = 28;
  const PERFECT_THRESHOLD = 4;
  const COMBO_FOR_GROW = 3;
  const GROW_AMOUNT = 12;
  const BEST_KEY = 'fae-stack-best';

  let W = 0, H = 0, dpr = 1;
  let stack = [];
  let active = null;
  let falling = [];
  let particles = [];
  let score = 0;
  let combo = 0;
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  let cameraY = 0;
  let targetCameraY = 0;
  let state = 'idle';
  let flashUntil = 0;
  let shakeUntil = 0;
  let shakeMag = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function baseY() { return H - Math.max(80, H * 0.12); }
  function blockY(index) { return baseY() - (index + 1) * BLOCK_H; }

  function hue(i) { return (210 + i * 9) % 360; }
  function blockColor(i) { return `hsl(${hue(i)}, 72%, 62%)`; }

  function startInitialStack() {
    const initialW = Math.min(260, W * 0.62);
    stack = [{ x: (W - initialW) / 2, w: initialW, color: blockColor(0) }];
  }

  function spawnActive() {
    const top = stack[stack.length - 1];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const idx = stack.length;
    const speed = Math.min(2.4 + idx * 0.07, 8.5);
    active = {
      x: dir > 0 ? -top.w : W,
      w: top.w,
      dir,
      speed,
      color: blockColor(idx),
    };
  }

  function reset() {
    score = 0;
    combo = 0;
    cameraY = 0;
    targetCameraY = 0;
    falling = [];
    particles = [];
    startInitialStack();
    spawnActive();
    state = 'playing';
    updateScore();
    hideOverlay();
    hideCombo();
    hintEl.classList.add('hide');
  }

  function updateScore() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function showOverlay(title, sub) {
    overlayTitleEl.textContent = title;
    overlaySubEl.textContent = sub;
    overlayEl.classList.add('show');
  }
  function hideOverlay() { overlayEl.classList.remove('show'); }

  function showCombo(text) {
    comboEl.textContent = text;
    comboEl.classList.add('show');
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(hideCombo, 900);
  }
  function hideCombo() { comboEl.classList.remove('show'); }

  function flash() { flashUntil = performance.now() + 220; }
  function shake(mag, dur) {
    shakeMag = Math.max(shakeMag, mag);
    shakeUntil = Math.max(shakeUntil, performance.now() + dur);
  }

  function spawnParticles(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function drop() {
    if (state !== 'playing') return;
    const top = stack[stack.length - 1];
    const a = active;
    const overlapL = Math.max(top.x, a.x);
    const overlapR = Math.min(top.x + top.w, a.x + a.w);
    const overlap = overlapR - overlapL;

    if (overlap <= 0) {
      falling.push({
        x: a.x, y: blockY(stack.length), w: a.w, h: BLOCK_H,
        vy: 0, vx: a.dir * 1.5, rot: 0, vr: a.dir * 0.04,
        color: a.color,
      });
      gameOver();
      return;
    }

    const offset = a.x - top.x;
    const perfect = Math.abs(offset) < PERFECT_THRESHOLD;
    let newX, newW;

    if (perfect) {
      combo++;
      newX = top.x;
      newW = top.w;
      // streak grows the block back a bit
      if (combo >= COMBO_FOR_GROW) {
        const grow = Math.min(GROW_AMOUNT, Math.max(0, (W * 0.7) - newW));
        if (grow > 0) {
          newX = newX - grow / 2;
          newW = newW + grow;
        }
        showCombo(`perfect ×${combo}`);
      } else {
        showCombo('perfect');
      }
      flash();
      shake(4, 180);
      spawnParticles(newX + newW / 2, blockY(stack.length) + BLOCK_H / 2, a.color, 22);
      beep(560 + score * 12, 0.18, 'triangle');
      beep(840 + score * 14, 0.12, 'sine', 0.06);
      haptic([0, 25, 25, 25]);
    } else {
      combo = 0;
      newX = overlapL;
      newW = overlap;
      // chop falling pieces
      if (a.x < top.x) {
        falling.push({
          x: a.x, y: blockY(stack.length), w: top.x - a.x, h: BLOCK_H,
          vy: 0, vx: -1.2, rot: 0, vr: -0.04,
          color: a.color,
        });
      }
      if (a.x + a.w > top.x + top.w) {
        falling.push({
          x: top.x + top.w, y: blockY(stack.length),
          w: (a.x + a.w) - (top.x + top.w), h: BLOCK_H,
          vy: 0, vx: 1.2, rot: 0, vr: 0.04,
          color: a.color,
        });
      }
      shake(2, 90);
      beep(360 + score * 6, 0.08, 'square');
      haptic(18);
    }

    stack.push({ x: newX, w: newW, color: a.color });
    score++;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    updateScore();
    spawnActive();
  }

  function gameOver() {
    state = 'gameover';
    combo = 0;
    haptic([0, 60, 50, 100]);
    beep(160, 0.35, 'sawtooth');
    beep(110, 0.5, 'square', 0.1);
    shake(10, 380);
    setTimeout(() => {
      showOverlay('game over', `score ${score}\nbest ${best}\n\ntap to play again`);
    }, 350);
  }

  function step() {
    if (state === 'playing') {
      active.x += active.dir * active.speed;
      if (active.x + active.w < 0) active.dir = 1;
      else if (active.x > W) active.dir = -1;
    }

    for (const f of falling) {
      f.vy += 0.55;
      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.vr;
    }
    falling = falling.filter(f => f.y < cameraY + H + 200);

    for (const p of particles) {
      p.vy += 0.25;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
    }
    particles = particles.filter(p => p.life > 0);

    // camera follows the top of the tower
    const stackTopWorld = blockY(stack.length - 1);
    const targetTopOnScreen = H * 0.45;
    const desired = stackTopWorld - targetTopOnScreen;
    targetCameraY = Math.min(0, desired);
    cameraY += (targetCameraY - cameraY) * 0.12;
  }

  function drawBlock(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + h - 4, w, 4);
  }

  function draw() {
    // background gradient that shifts with score
    const h0 = (210 + score * 9) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${h0}, 55%, 14%)`);
    g.addColorStop(1, `hsl(${(h0 + 50) % 360}, 65%, 5%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle stars
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 137) % W);
      const sy = ((i * 211 + Math.floor(cameraY * 0.2)) % H + H) % H;
      ctx.fillRect(sx, sy, 2, 2);
    }

    // shake offset
    let sx = 0, sy = 0;
    if (performance.now() < shakeUntil) {
      const t = (shakeUntil - performance.now()) / 380;
      sx = (Math.random() - 0.5) * shakeMag * t;
      sy = (Math.random() - 0.5) * shakeMag * t;
    } else {
      shakeMag = 0;
    }

    ctx.save();
    ctx.translate(sx, sy - cameraY);

    // ground glow
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, baseY() + BLOCK_H, W, 6);

    // stack
    for (let i = 0; i < stack.length; i++) {
      const b = stack[i];
      drawBlock(b.x, blockY(i), b.w, BLOCK_H, b.color);
    }

    // active
    if (state === 'playing' && active) {
      drawBlock(active.x, blockY(stack.length), active.w, BLOCK_H, active.color);
    }

    // falling chunks
    for (const f of falling) {
      ctx.save();
      ctx.translate(f.x + f.w / 2, f.y + f.h / 2);
      ctx.rotate(f.rot);
      drawBlock(-f.w / 2, -f.h / 2, f.w, f.h, f.color);
      ctx.restore();
    }

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // flash overlay
    if (performance.now() < flashUntil) {
      const a = (flashUntil - performance.now()) / 220;
      ctx.fillStyle = `rgba(255,255,255,${0.22 * a})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  // audio
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type = 'sine', delay = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function haptic(p) {
    if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) {}
  }

  function onTap(e) {
    if (e.cancelable) e.preventDefault();
    ensureAudio();
    if (state === 'idle' || state === 'gameover') {
      reset();
    } else {
      drop();
    }
  }

  window.addEventListener('pointerdown', onTap, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      ensureAudio();
      if (state === 'idle' || state === 'gameover') reset();
      else drop();
    }
  });
  window.addEventListener('resize', () => {
    resize();
    if (state === 'idle') startInitialStack();
  });

  // boot
  resize();
  startInitialStack();
  updateScore();
  showOverlay('stack', 'tap to start');
  loop();
})();
