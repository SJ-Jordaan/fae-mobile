// Slot — fake-3D tunnel runner. Elemental theme, weighty slam, and Boost Run mini-game.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// --- World constants ---
const FOCAL = 600;
const ANCHOR = 0.85;
const PLAYER_Z = 4;
const WALL_Z_START = 50;
const WALL_HALF = 1.7;
const HOLE_R = 0.7;
const PLAYER_R = 0.5;
const MORPH_N = 180;

// --- Boost Run ---
const BOOST_INTERVAL = 10;
const BOOST_DURATION = 6.5;
const PREBOOST_DURATION = 1.2;
const POSTBOOST_DURATION = 1.0;
const PICKUP_INTERVAL = 0.45;
const BOOST_SPEED_MULT = 1.5;

// --- Elemental palette ---
const SHAPES = ['triangle', 'square', 'pentagon', 'circle'];
const SHAPE_ELEMENT = { triangle: 'fire', square: 'earth', pentagon: 'air', circle: 'water' };
const ELEMENTS = {
  fire:  { primary: '#ff6b3a', accent: '#ffd980', glow: 'rgba(255,130,60,0.95)', flash: 'rgba(255,120,60,1)' },
  earth: { primary: '#a87248', accent: '#deb380', glow: 'rgba(220,170,100,0.9)',  flash: 'rgba(220,170,100,1)' },
  air:   { primary: '#dee2eb', accent: '#ffffff', glow: 'rgba(225,235,250,0.95)', flash: 'rgba(225,235,250,1)' },
  water: { primary: '#3a9fc8', accent: '#a3e6f5', glow: 'rgba(110,200,230,0.9)',  flash: 'rgba(120,200,230,1)' },
};
const SHAPE_FREQ = { triangle: 261.63, square: 329.63, pentagon: 392.0, circle: 523.25 };

// Stone tunnel colors.
const TUNNEL_NEAR = '#3d2920';
const TUNNEL_FAR = '#070506';
const SKY_COLOR = '#0a0608';

// --- Shape generation ---
function regularNgon(n, rotation = -Math.PI / 2) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2;
    arr.push([Math.cos(a), Math.sin(a)]);
  }
  return arr;
}
function smoothCircle(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    arr.push([Math.cos(a), Math.sin(a)]);
  }
  return arr;
}
function resamplePerimeter(verts, n) {
  const N = verts.length;
  const segLen = [];
  let total = 0;
  for (let i = 0; i < N; i++) {
    const a = verts[i], b = verts[(i + 1) % N];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(len);
    total += len;
  }
  const step = total / n;
  const out = [];
  let segIdx = 0, segStart = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (segIdx < N && target > segStart + segLen[segIdx]) {
      segStart += segLen[segIdx];
      segIdx++;
    }
    if (segIdx >= N) segIdx = N - 1;
    const t = (target - segStart) / segLen[segIdx];
    const a = verts[segIdx], b = verts[(segIdx + 1) % N];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
function copyVerts(verts) { return verts.map((v) => [v[0], v[1]]); }

const SHAPE_MORPH = {
  triangle: resamplePerimeter(regularNgon(3), MORPH_N),
  square: resamplePerimeter(regularNgon(4), MORPH_N),
  pentagon: resamplePerimeter(regularNgon(5), MORPH_N),
  circle: smoothCircle(MORPH_N),
};
const SHAPE_RENDER = {
  triangle: regularNgon(3),
  square: regularNgon(4),
  pentagon: regularNgon(5),
  circle: smoothCircle(48),
};

const SIDES = ['top', 'bottom', 'left', 'right'];
function sideOffset(side) {
  if (side === 'top') return [0, -ANCHOR];
  if (side === 'bottom') return [0, ANCHOR];
  if (side === 'left') return [-ANCHOR, 0];
  return [ANCHOR, 0];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// --- State ---
let player, walls, pickups, particles, speed, score, gameOver, lastSpawn, animTime;
let cameraDistance, phase, phaseT, wallsSinceLastBoost, pendingBoost, pickupSpawnTimer;
let shakeT, slowMoT, flashColor, flashT;

function reset() {
  player = {
    side: 'top', shape: 'triangle',
    x: 0, y: -ANCHOR, vx: 0, vy: 0,
    verts: copyVerts(SHAPE_MORPH.triangle),
  };
  walls = [];
  pickups = [];
  particles = [];
  speed = 10;
  score = 0;
  gameOver = false;
  lastSpawn = 999;
  animTime = 0;
  shakeT = 0;
  slowMoT = 0;
  flashColor = null;
  flashT = 0;
  cameraDistance = 0;
  phase = 'play';
  phaseT = 0;
  wallsSinceLastBoost = 0;
  pendingBoost = false;
  pickupSpawnTimer = 0;
}
reset();

function spawnWall() {
  walls.push({
    absPos: cameraDistance + WALL_Z_START,
    z: WALL_Z_START,
    side: SIDES[(Math.random() * 4) | 0],
    shape: SHAPES[(Math.random() * SHAPES.length) | 0],
    resolved: false,
  });
}
function spawnPickup() {
  pickups.push({
    absPos: cameraDistance + WALL_Z_START,
    z: WALL_Z_START,
    side: SIDES[(Math.random() * 4) | 0],
    shape: SHAPES[(Math.random() * SHAPES.length) | 0],
    resolved: false,
  });
}

function emitBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.7);
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 1,
      duration: 0.45 + Math.random() * 0.45,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

// --- Rollercoaster motion ---
function speedFactor() {
  return Math.min(1, Math.max(0, (speed - 8) / 14));
}
function trackSway(absPos, z) {
  const factor = Math.max(0, z / WALL_Z_START);
  const amp = 18 + 28 * speedFactor();
  return [
    (Math.sin(absPos * 0.062) + Math.sin(absPos * 0.137 + 2.1)) * amp * factor,
    (Math.sin(absPos * 0.091 + 1) + Math.sin(absPos * 0.073 + 3.5)) * amp * 0.7 * factor,
  ];
}
function currentCameraRoll() {
  const amp = 0.04 + 0.13 * speedFactor();
  return (Math.sin(cameraDistance * 0.04) + Math.sin(cameraDistance * 0.027 + 1) * 0.6) * amp;
}

function project(x, y, z) {
  return { x: (x * FOCAL) / z + W / 2, y: (y * FOCAL) / z + H / 2 };
}
function polyPath(verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
}
function applySway(pts, sway) {
  return pts.map((p) => ({ x: p.x + sway[0], y: p.y + sway[1] }));
}

// --- Tunnel: 4 filled stone walls + transverse joint lines ---
function drawTunnelFace(face) {
  const zN = PLAYER_Z;
  const zF = WALL_Z_START;
  const swayN = trackSway(cameraDistance + zN, zN);
  const swayF = trackSway(cameraDistance + zF, zF);

  let n1, n2, f1, f2;
  if (face === 'top') {
    n1 = project(-WALL_HALF, -WALL_HALF, zN); n2 = project(+WALL_HALF, -WALL_HALF, zN);
    f1 = project(-WALL_HALF, -WALL_HALF, zF); f2 = project(+WALL_HALF, -WALL_HALF, zF);
  } else if (face === 'bottom') {
    n1 = project(-WALL_HALF, +WALL_HALF, zN); n2 = project(+WALL_HALF, +WALL_HALF, zN);
    f1 = project(-WALL_HALF, +WALL_HALF, zF); f2 = project(+WALL_HALF, +WALL_HALF, zF);
  } else if (face === 'left') {
    n1 = project(-WALL_HALF, -WALL_HALF, zN); n2 = project(-WALL_HALF, +WALL_HALF, zN);
    f1 = project(-WALL_HALF, -WALL_HALF, zF); f2 = project(-WALL_HALF, +WALL_HALF, zF);
  } else {
    n1 = project(+WALL_HALF, -WALL_HALF, zN); n2 = project(+WALL_HALF, +WALL_HALF, zN);
    f1 = project(+WALL_HALF, -WALL_HALF, zF); f2 = project(+WALL_HALF, +WALL_HALF, zF);
  }
  n1 = { x: n1.x + swayN[0], y: n1.y + swayN[1] };
  n2 = { x: n2.x + swayN[0], y: n2.y + swayN[1] };
  f1 = { x: f1.x + swayF[0], y: f1.y + swayF[1] };
  f2 = { x: f2.x + swayF[0], y: f2.y + swayF[1] };

  const nearMid = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
  const farMid = { x: (f1.x + f2.x) / 2, y: (f1.y + f2.y) / 2 };
  const grad = ctx.createLinearGradient(nearMid.x, nearMid.y, farMid.x, farMid.y);
  grad.addColorStop(0, TUNNEL_NEAR);
  grad.addColorStop(1, TUNNEL_FAR);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(n1.x, n1.y);
  ctx.lineTo(n2.x, n2.y);
  ctx.lineTo(f2.x, f2.y);
  ctx.lineTo(f1.x, f1.y);
  ctx.closePath();
  ctx.fill();
}

function drawTunnelJoints() {
  const phaseDist = cameraDistance % 3;
  for (let i = 0; i < 18; i++) {
    const z = phaseDist + i * 3 + PLAYER_Z;
    if (z >= WALL_Z_START || z < PLAYER_Z + 0.2) continue;
    const fade = Math.max(0, 1 - z / WALL_Z_START);
    const sway = trackSway(cameraDistance + z, z);
    const tl = project(-WALL_HALF, -WALL_HALF, z);
    const tr = project(+WALL_HALF, -WALL_HALF, z);
    const br = project(+WALL_HALF, +WALL_HALF, z);
    const bl = project(-WALL_HALF, +WALL_HALF, z);
    [tl, tr, br, bl].forEach((p) => { p.x += sway[0]; p.y += sway[1]; });

    ctx.strokeStyle = `rgba(140, 110, 85, ${0.32 * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
  }
}

const STREAK_SEEDS = Array.from({ length: 14 }, (_, i) => ((i * 977 + 311) % 1000) / 1000);
function drawStreaks() {
  const cx = W / 2, cy = H / 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < STREAK_SEEDS.length; i++) {
    const seed = STREAK_SEEDS[i];
    const angle = seed * Math.PI * 2;
    const tOffset = (cameraDistance * 0.02 + seed) % 1;
    const r0 = lerp(80, 600, tOffset);
    const r1 = r0 + 30 + speed * 1.0;
    ctx.strokeStyle = `rgba(220, 200, 170, ${(1 - tOffset) * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
    ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.stroke();
  }
}

function drawWall(wall) {
  const z = wall.z;
  if (z < 0.5) return;
  const fade = Math.min(1, z / WALL_Z_START);
  const sway = trackSway(wall.absPos, z);
  const elem = ELEMENTS[SHAPE_ELEMENT[wall.shape]];

  const wv = applySway([
    project(-WALL_HALF, -WALL_HALF, z),
    project(WALL_HALF, -WALL_HALF, z),
    project(WALL_HALF, WALL_HALF, z),
    project(-WALL_HALF, WALL_HALF, z),
  ], sway);

  const [hx, hy] = sideOffset(wall.side);
  const holeVerts = applySway(
    SHAPE_RENDER[wall.shape].map(([vx, vy]) =>
      project(hx + vx * HOLE_R, hy + vy * HOLE_R, z)
    ),
    sway
  );

  // Wall fill with hole cut out (even-odd).
  ctx.beginPath();
  ctx.moveTo(wv[0].x, wv[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(wv[i].x, wv[i].y);
  ctx.closePath();
  ctx.moveTo(holeVerts[0].x, holeVerts[0].y);
  for (let i = 1; i < holeVerts.length; i++) ctx.lineTo(holeVerts[i].x, holeVerts[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(45, 30, 20, ${0.7 + 0.3 * (1 - fade)})`;
  ctx.fill('evenodd');

  // Wall edges.
  polyPath(wv);
  ctx.strokeStyle = `rgba(140, 110, 85, ${1 - fade * 0.45})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hole outline glows in the element color.
  ctx.shadowColor = elem.glow;
  ctx.shadowBlur = 14;
  polyPath(holeVerts);
  ctx.strokeStyle = elem.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPickup(p) {
  const z = p.z;
  if (z < 0.5) return;
  const fade = Math.min(1, z / WALL_Z_START);
  const sway = trackSway(p.absPos, z);
  const [hx, hy] = sideOffset(p.side);
  const r = 0.42;
  const elem = ELEMENTS[SHAPE_ELEMENT[p.shape]];
  const verts = applySway(
    SHAPE_RENDER[p.shape].map(([vx, vy]) =>
      project(hx + vx * r, hy + vy * r, z)
    ),
    sway
  );

  ctx.shadowColor = elem.glow;
  ctx.shadowBlur = 20;
  polyPath(verts);
  ctx.fillStyle = elem.primary;
  ctx.globalAlpha = 0.55 + 0.4 * (1 - fade);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = elem.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawPlayer() {
  const verts = player.verts;
  const px = player.x, py = player.y;
  const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
  const tilt = Math.sin(animTime * 1.6) * 0.22;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const projVert = (vx, vy, dz) => {
    const wx = px + vx * PLAYER_R * cosT;
    const wy = py + vy * PLAYER_R;
    const wz = PLAYER_Z + vx * PLAYER_R * sinT + dz;
    return project(wx, wy, wz);
  };
  const front = verts.map(([vx, vy]) => projVert(vx, vy, 0));
  const back = verts.map(([vx, vy]) => projVert(vx, vy, 0.45));

  // Apply Z-axis lean (banking into slides) around player's screen center.
  const center = project(px, py, PLAYER_Z);
  const lean = clamp(player.vx * 0.05, -0.28, 0.28);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(lean);
  ctx.translate(-center.x, -center.y);

  // Back-face (extruded shadow).
  polyPath(back);
  ctx.shadowColor = elem.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Sparse extrusion edges.
  ctx.strokeStyle = `${elem.accent}55`;
  ctx.lineWidth = 1;
  const stride = Math.max(1, Math.floor(MORPH_N / 24));
  for (let i = 0; i < MORPH_N; i += stride) {
    ctx.beginPath();
    ctx.moveTo(front[i].x, front[i].y);
    ctx.lineTo(back[i].x, back[i].y);
    ctx.stroke();
  }

  // Front face — element color.
  polyPath(front);
  ctx.fillStyle = elem.primary;
  ctx.fill();
  ctx.strokeStyle = elem.accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.3 + p.life * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.fillStyle = '#cfb6a0';
  ctx.font = '18px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 16, 26);
  ctx.fillText(`SPEED  ${speed.toFixed(1)}`, 16, 48);

  const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
  ctx.textAlign = 'right';
  ctx.fillStyle = elem.accent;
  ctx.fillText(SHAPE_ELEMENT[player.shape].toUpperCase(), W - 16, 26);

  if (phase === 'preboost') {
    const t = phaseT / PREBOOST_DURATION;
    ctx.textAlign = 'center';
    ctx.font = `bold ${36 + t * 14}px ui-monospace, monospace`;
    ctx.fillStyle = `rgba(255, 220, 150, ${t})`;
    ctx.fillText('GET READY', W / 2, H / 2 - 10);
  } else if (phase === 'boost') {
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px ui-monospace, monospace';
    const remaining = Math.max(0, BOOST_DURATION - phaseT);
    const pulse = 0.7 + 0.3 * Math.sin(animTime * 8);
    ctx.fillStyle = `rgba(255, 220, 150, ${pulse})`;
    ctx.fillText('BOOST', W / 2, 30);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#a89070';
    ctx.fillText(`${remaining.toFixed(1)}s`, W / 2, 50);
  } else if (phase === 'postboost') {
    const t = 1 - phaseT / POSTBOOST_DURATION;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.fillStyle = `rgba(255, 220, 150, ${Math.max(0, t) * 0.85})`;
    ctx.fillText('+ BONUS', W / 2, H / 2);
  }

  if (gameOver) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px ui-monospace, monospace';
    ctx.fillStyle = '#ff7050';
    ctx.fillText('CRASH', W / 2, H / 2 - 10);
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#a89070';
    ctx.fillText(`final score ${score}`, W / 2, H / 2 + 16);
    ctx.fillText('press any key / tap to restart', W / 2, H / 2 + 36);
  }
}

let lastTime = performance.now();
function loop(now) {
  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  // Slow-mo on crash dilates simulation time, not wall-clock time.
  if (slowMoT > 0) slowMoT = Math.max(0, slowMoT - rawDt / 0.5);
  const dt = rawDt * (1 - slowMoT * 0.7);
  animTime += dt;

  // Spring-damper slide for "weighty" feel.
  const [tx, ty] = sideOffset(player.side);
  const k = 260, c = 2 * Math.sqrt(k) * 0.7;
  player.vx += (-k * (player.x - tx) - c * player.vx) * dt;
  player.vy += (-k * (player.y - ty) - c * player.vy) * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Vertex morph (still exponential — 180-vertex spring would be wasteful).
  const targetVerts = SHAPE_MORPH[player.shape];
  const km = 1 - Math.exp(-dt / 0.08);
  for (let i = 0; i < MORPH_N; i++) {
    player.verts[i][0] += (targetVerts[i][0] - player.verts[i][0]) * km;
    player.verts[i][1] += (targetVerts[i][1] - player.verts[i][1]) * km;
  }

  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt / 0.55);
  if (flashT > 0) flashT = Math.max(0, flashT - dt / 0.22);

  // Particle physics.
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt / p.duration;
  }
  particles = particles.filter((p) => p.life > 0);

  const effSpeed = phase === 'boost' ? speed * BOOST_SPEED_MULT : speed;

  if (!gameOver) {
    cameraDistance += effSpeed * dt;
    phaseT += dt;

    if (phase === 'play') speed += dt * 0.22;

    if (phase === 'play' && !pendingBoost) {
      lastSpawn += dt;
      const interval = Math.max(0.7, 2.0 - speed * 0.03);
      if (lastSpawn > interval) {
        spawnWall();
        lastSpawn = 0;
      }
    }

    for (const w of walls) {
      const prevZ = w.z;
      w.z = w.absPos - cameraDistance;
      if (!w.resolved && prevZ > PLAYER_Z && w.z <= PLAYER_Z) {
        w.resolved = true;
        const playerScreen = project(player.x, player.y, PLAYER_Z);
        if (w.side === player.side && w.shape === player.shape) {
          score++;
          wallsSinceLastBoost++;
          playPass();
          // Slam: pass-through burst + flash + small kick.
          const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
          emitBurst(playerScreen.x, playerScreen.y, elem.primary, 16, 280);
          flashColor = elem.flash;
          flashT = 1;
          shakeT = Math.max(shakeT, 0.35);
          cameraDistance += 1.2;
          if (wallsSinceLastBoost >= BOOST_INTERVAL) pendingBoost = true;
        } else {
          gameOver = true;
          // Slam: heavy crash burst + flash + shake + slow-mo.
          const wallElem = ELEMENTS[SHAPE_ELEMENT[w.shape]];
          emitBurst(playerScreen.x, playerScreen.y, '#ff5040', 36, 420);
          emitBurst(playerScreen.x, playerScreen.y, wallElem.primary, 18, 320);
          flashColor = 'rgba(255, 70, 50, 1)';
          flashT = 1;
          shakeT = 1;
          slowMoT = 1;
          playCrash();
        }
      }
    }
    walls = walls.filter((w) => w.z > PLAYER_Z * 0.95);

    if (phase === 'boost' && phaseT < BOOST_DURATION - 1.5) {
      pickupSpawnTimer += dt;
      if (pickupSpawnTimer > PICKUP_INTERVAL) {
        spawnPickup();
        pickupSpawnTimer = 0;
      }
    }
    for (const p of pickups) {
      const prevZ = p.z;
      p.z = p.absPos - cameraDistance;
      if (!p.resolved && prevZ > PLAYER_Z && p.z <= PLAYER_Z) {
        p.resolved = true;
        if (p.side === player.side && p.shape === player.shape) {
          score += 2;
          playPickup();
          const elem = ELEMENTS[SHAPE_ELEMENT[p.shape]];
          const playerScreen = project(player.x, player.y, PLAYER_Z);
          emitBurst(playerScreen.x, playerScreen.y, elem.primary, 10, 220);
          flashColor = elem.flash;
          flashT = Math.max(flashT, 0.6);
        }
      }
    }
    pickups = pickups.filter((p) => p.z > PLAYER_Z * 0.95);

    if (phase === 'play' && pendingBoost && walls.length === 0) {
      phase = 'preboost'; phaseT = 0; pendingBoost = false;
      playBoostStart();
    } else if (phase === 'preboost' && phaseT >= PREBOOST_DURATION) {
      phase = 'boost'; phaseT = 0;
      pickupSpawnTimer = PICKUP_INTERVAL;
    } else if (phase === 'boost' && phaseT >= BOOST_DURATION) {
      phase = 'postboost'; phaseT = 0;
      playBoostEnd();
    } else if (phase === 'postboost' && phaseT >= POSTBOOST_DURATION && pickups.length === 0) {
      phase = 'play'; phaseT = 0;
      wallsSinceLastBoost = 0;
      lastSpawn = 999;
    }
  }

  // --- Render ---
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, W, H);

  if (phase === 'preboost' || phase === 'boost' || phase === 'postboost') {
    let intensity = 1;
    if (phase === 'preboost') intensity = phaseT / PREBOOST_DURATION;
    else if (phase === 'postboost') intensity = 1 - phaseT / POSTBOOST_DURATION;
    ctx.fillStyle = `rgba(80, 50, 30, ${0.18 * Math.max(0, intensity)})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  const roll = currentCameraRoll();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(roll);
  ctx.translate(-W / 2, -H / 2);

  if (shakeT > 0) {
    const mag = shakeT * 22;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  drawTunnelFace('top');
  drawTunnelFace('bottom');
  drawTunnelFace('left');
  drawTunnelFace('right');
  drawTunnelJoints();
  drawStreaks();

  walls.sort((a, b) => b.z - a.z);
  for (const w of walls) drawWall(w);
  pickups.sort((a, b) => b.z - a.z);
  for (const p of pickups) drawPickup(p);
  if (!gameOver) drawPlayer();
  drawParticles();

  ctx.restore();

  // Slam flash overlay (over scene, under HUD).
  if (flashT > 0 && flashColor) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = flashT * 0.35;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawHUD();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Audio ---
let audio = null;
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
}
function tone({ freq, type = 'sine', volume = 0.2, duration = 0.2, freq2 = null, delay = 0 }) {
  ensureAudio();
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freq2 != null) osc.frequency.exponentialRampToValueAtTime(freq2, t + duration);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + duration);
}
function playSlide() { tone({ freq: 200, type: 'triangle', volume: 0.07, duration: 0.08 }); }
function playCycle() { tone({ freq: SHAPE_FREQ[player.shape], type: 'sine', volume: 0.13, duration: 0.16 }); }
function playPass() {
  tone({ freq: 660, freq2: 990, type: 'sine', volume: 0.18, duration: 0.22 });
  tone({ freq: 130, freq2: 90, type: 'sine', volume: 0.18, duration: 0.18 });   // bass thump for slam
}
function playCrash() {
  tone({ freq: 240, freq2: 50, type: 'sawtooth', volume: 0.28, duration: 0.6 });
  tone({ freq: 70, freq2: 35, type: 'sine', volume: 0.25, duration: 0.7 });     // sub bass
  tone({ freq: 110, type: 'square', volume: 0.13, duration: 0.5, delay: 0.05 });
}
function playPickup() {
  tone({ freq: 523, type: 'sine', volume: 0.15, duration: 0.1 });
  tone({ freq: 660, type: 'sine', volume: 0.13, duration: 0.12, delay: 0.05 });
  tone({ freq: 880, type: 'sine', volume: 0.11, duration: 0.18, delay: 0.1 });
}
function playBoostStart() {
  [261, 329, 392, 523].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', volume: 0.16, duration: 0.18, delay: i * 0.07 })
  );
}
function playBoostEnd() {
  [523, 392, 329, 261].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', volume: 0.13, duration: 0.16, delay: i * 0.05 })
  );
}

// --- Input ---
function setSide(side) {
  if (gameOver || player.side === side) return;
  player.side = side;
  playSlide();
}
function cycleShape() {
  if (gameOver) return;
  player.shape = SHAPES[(SHAPES.indexOf(player.shape) + 1) % SHAPES.length];
  playCycle();
}

window.addEventListener('keydown', (e) => {
  ensureAudio();
  if (gameOver) { reset(); e.preventDefault(); return; }
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': setSide('top'); e.preventDefault(); break;
    case 'ArrowDown': case 's': case 'S': setSide('bottom'); e.preventDefault(); break;
    case 'ArrowLeft': case 'a': case 'A': setSide('left'); e.preventDefault(); break;
    case 'ArrowRight': case 'd': case 'D': setSide('right'); e.preventDefault(); break;
    case ' ': cycleShape(); e.preventDefault(); break;
  }
});

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  ensureAudio();
  e.preventDefault();
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  if (gameOver) { reset(); return; }
  const SWIPE = 28;
  if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) { cycleShape(); return; }
  if (Math.abs(dx) > Math.abs(dy)) setSide(dx > 0 ? 'right' : 'left');
  else setSide(dy > 0 ? 'bottom' : 'top');
}, { passive: false });

canvas.addEventListener('click', () => {
  ensureAudio();
  if (gameOver) { reset(); return; }
  cycleShape();
});
