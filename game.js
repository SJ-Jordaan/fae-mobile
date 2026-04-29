// Slot — fake-3D tunnel runner. Elemental theme, weighty slam, varied wall types.

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
const CORE_R = 1.55;            // size of a CORE wall's central shape gate
const SPIN_START_Z = 25;        // SPIN walls only rotate inside this z (visible range)

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

// Wrecking-ball star: 8-point spiked shape used while the powerup is active.
function makeStar(points = 8, inner = 0.55) {
  const arr = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : inner;
    arr.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return arr;
}
const WRECKING_VERTS = resamplePerimeter(makeStar(8, 0.5), MORPH_N);
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
function sideAngle(side) {
  if (side === 'top') return -Math.PI / 2;
  if (side === 'right') return 0;
  if (side === 'bottom') return Math.PI / 2;
  return Math.PI;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

// --- State ---
let player, walls, particles, speed, score, combo, gameOver, lastSpawn, animTime;
let cameraDistance, shakeT, crashSlowT, flashColor, flashT, comboPopT;
let lives, invulnT, wreckingT, powerupSlowT, powerupNoticeT, powerupNoticeType;
// Music state lives here so reset() can reach it before the audio section
// is declared; the audio section assigns the rest.
let musicNextBeat = 0;
let beatIndex = 0;
let musicEnabled = true;
// Persisted across runs.
let bestCombo = 0;
try { bestCombo = parseInt(localStorage.getItem('fae:bestCombo') || '0', 10) || 0; } catch (e) {}
function saveBest() {
  try { localStorage.setItem('fae:bestCombo', String(bestCombo)); } catch (e) {}
}

function reset() {
  player = {
    side: 'top', shape: 'triangle',
    x: 0, y: -ANCHOR, vx: 0, vy: 0,
    verts: copyVerts(SHAPE_MORPH.triangle),
  };
  walls = [];
  particles = [];
  speed = 10;
  score = 0;
  combo = 0;
  lives = 3;
  invulnT = 0;
  wreckingT = 0;
  powerupSlowT = 0;
  powerupNoticeT = 0;
  powerupNoticeType = null;
  gameOver = false;
  lastSpawn = 999;
  animTime = 0;
  shakeT = 0;
  crashSlowT = 0;
  flashColor = null;
  flashT = 0;
  comboPopT = 0;
  cameraDistance = 0;
  musicNextBeat = 0;
  beatIndex = 0;
}
reset();

// --- Wall types ---
// Distribution depends on score so each type is introduced once the player has
// enough wall passes to have learned the previous one.
function chooseWallType() {
  if (score < 5) return 'static';
  // Locked-pickup walls: gated to avoid stealing every fifth wall and dulling
  // the core loop. Roughly 1 in 9.
  if (Math.random() < 0.11) return 'locked';
  const r = Math.random();
  if (score >= 22) {
    if (r < 0.18) return 'spin';
    if (r < 0.36) return 'twin';
    if (r < 0.50) return 'core';
    return 'static';
  }
  if (score >= 14) {
    if (r < 0.20) return 'spin';
    if (r < 0.38) return 'twin';
    return 'static';
  }
  if (r < 0.20) return 'spin';
  return 'static';
}

// Powerup definitions — tuned for rarity (rare = high threshold).
const POWERUPS = {
  bonus:     { weight: 50, threshold: 3,  color: '#ffd060' },
  wrecking:  { weight: 25, threshold: 5,  color: '#ff7040' },
  slowmo:    { weight: 18, threshold: 7,  color: '#7ab8e0' },
  extralife: { weight: 7,  threshold: 12, color: '#ff5060' },
};
function pickPowerup() {
  const total = Object.values(POWERUPS).reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const [type, def] of Object.entries(POWERUPS)) {
    if ((r -= def.weight) < 0) return type;
  }
  return 'bonus';
}

function spawnWall() {
  const type = chooseWallType();
  const base = {
    type,
    absPos: cameraDistance + WALL_Z_START,
    z: WALL_Z_START,
    resolved: false,
  };
  if (type === 'static') {
    walls.push({ ...base, side: pick(SIDES), shape: pick(SHAPES) });
  } else if (type === 'spin') {
    // Pre-compute the total angular sweep that will land exactly on the
    // chosen cardinal at impact. Sweep is 1.2π–2.6π so the rotation always
    // covers more than a half-turn within the visible spin range.
    const endSide = pick(SIDES);
    const direction = Math.random() < 0.5 ? 1 : -1;
    const totalSweep = (Math.PI * (1.2 + Math.random() * 1.4)) * direction;
    const endAngleVal = sideAngle(endSide);
    walls.push({
      ...base,
      endSide,
      shape: pick(SHAPES),
      totalSweep,
      startAngle: endAngleVal - totalSweep,
    });
  } else if (type === 'twin') {
    // Always pair opposite sides — adjacent-side holes visually overlap.
    const axis = Math.random() < 0.5 ? ['top', 'bottom'] : ['left', 'right'];
    const [s1, s2] = Math.random() < 0.5 ? axis : [axis[1], axis[0]];
    const sh = pick(SHAPES);
    const useSameShape = Math.random() < 0.65;
    const sh2 = useSameShape ? sh : pick(SHAPES.filter((s) => s !== sh));
    walls.push({
      ...base,
      holes: [{ side: s1, shape: sh }, { side: s2, shape: sh2 }],
    });
  } else if (type === 'core') {
    walls.push({ ...base, shape: pick(SHAPES) });
  } else if (type === 'locked') {
    const powerup = pickPowerup();
    walls.push({
      ...base,
      shape: pick(SHAPES),
      powerup,
      threshold: POWERUPS[powerup].threshold,
    });
  }
}

function applyPowerup(type) {
  powerupNoticeT = 1;
  powerupNoticeType = type;
  if (type === 'bonus') {
    score += 20;
  } else if (type === 'wrecking') {
    wreckingT = 4;
  } else if (type === 'slowmo') {
    powerupSlowT = 3;
  } else if (type === 'extralife') {
    lives = Math.min(3, lives + 1);
  }
  playPowerup();
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

// --- Tunnel ---
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

// --- Wall rendering ---
// Returns the (worldX, worldY) of a hole's anchor for the given wall.
function holeAnchor(wall, holeData) {
  if (wall.type === 'static') return sideOffset(wall.side);
  if (wall.type === 'spin') {
    const a = spinAngle(wall);
    return [Math.cos(a) * ANCHOR, Math.sin(a) * ANCHOR];
  }
  if (wall.type === 'twin') return sideOffset(holeData.side);
  return [0, 0];
}

function spinAngle(wall) {
  // Hold at startAngle until the wall enters the visible zone, then ease the
  // rotation into the cardinal. Concentrates the spin where the player can
  // actually see it.
  if (wall.z >= SPIN_START_Z) return wall.startAngle;
  const t = clamp((SPIN_START_Z - wall.z) / (SPIN_START_Z - PLAYER_Z), 0, 1);
  const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out — decelerates into the lock
  return wall.startAngle + eased * wall.totalSweep;
}

function holeShapeProjected(wall, holeData, holeRadius) {
  const z = wall.z;
  const sway = trackSway(wall.absPos, z);
  const [hx, hy] = holeAnchor(wall, holeData);
  const shape = holeData?.shape || wall.shape;
  return applySway(
    SHAPE_RENDER[shape].map(([vx, vy]) =>
      project(hx + vx * holeRadius, hy + vy * holeRadius, z)
    ),
    sway
  );
}

function drawHoleOutline(wall, holeData, holeRadius, dashed = false) {
  const verts = holeShapeProjected(wall, holeData, holeRadius);
  const shape = holeData?.shape || wall.shape;
  const elem = ELEMENTS[SHAPE_ELEMENT[shape]];
  ctx.shadowColor = elem.glow;
  ctx.shadowBlur = 14;
  if (dashed) ctx.setLineDash([4, 5]);
  polyPath(verts);
  ctx.strokeStyle = elem.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

function drawWall(wall) {
  const z = wall.z;
  if (z < 0.5) return;
  const fade = Math.min(1, z / WALL_Z_START);
  const sway = trackSway(wall.absPos, z);

  if (wall.type === 'locked') {
    // Locked walls: shape gate plus a powerup icon hovering above. Visually
    // distinct so the player reads it as a "claim me" wall, not a free pass.
    const elem = ELEMENTS[SHAPE_ELEMENT[wall.shape]];
    const pdef = POWERUPS[wall.powerup];
    const verts = applySway(
      SHAPE_RENDER[wall.shape].map(([vx, vy]) => project(vx * 1.3, vy * 1.3, z)),
      sway
    );
    polyPath(verts);
    ctx.fillStyle = `${pdef.color}1c`;
    ctx.fill();
    ctx.shadowColor = pdef.color;
    ctx.shadowBlur = 18;
    polyPath(verts);
    ctx.strokeStyle = elem.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Powerup icon framed inside the gate. Threshold label sits just below.
    const iconCenter = applySway([project(0, -0.18, z)], sway)[0];
    const labelCenter = applySway([project(0, 0.45, z)], sway)[0];
    const scale = clamp(PLAYER_Z / z, 0.18, 1);
    const iconR = Math.max(16, 70 * scale);
    drawPowerupIcon(wall.powerup, iconCenter.x, iconCenter.y, iconR);

    // Threshold badge.
    const reached = combo >= wall.threshold;
    ctx.font = `bold ${Math.max(16, 32 * scale)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = reached ? '#fff' : pdef.color;
    ctx.shadowColor = reached ? 'rgba(255,255,255,0.8)' : pdef.color;
    ctx.shadowBlur = Math.max(4, 12 * scale);
    ctx.fillText(`x${wall.threshold}`, labelCenter.x, labelCenter.y);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';

    if (!reached) {
      // Small lock arc: tells the player they need more combo to claim it.
      const lr = Math.max(6, 14 * scale);
      const lx = labelCenter.x + Math.max(36, 70 * scale);
      const ly = labelCenter.y;
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.beginPath();
      ctx.arc(lx, ly - lr * 0.25, lr * 0.55, Math.PI, 0);
      ctx.stroke();
      ctx.strokeRect(lx - lr * 0.6, ly - lr * 0.25, lr * 1.2, lr * 0.85);
    }
    return;
  }

  if (wall.type === 'core') {
    // No wall material — just a glowing shape gate at the centre.
    const elem = ELEMENTS[SHAPE_ELEMENT[wall.shape]];
    const verts = applySway(
      SHAPE_RENDER[wall.shape].map(([vx, vy]) => project(vx * CORE_R, vy * CORE_R, z)),
      sway
    );
    // Soft inner fill, low alpha — gives the gate a presence without being a wall.
    polyPath(verts);
    ctx.fillStyle = `${elem.primary}1a`;
    ctx.fill();
    ctx.shadowColor = elem.glow;
    ctx.shadowBlur = 24;
    polyPath(verts);
    ctx.strokeStyle = elem.accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Outer ring of dashed accent so it reads as a "gate," not just a big shape.
    polyPath(applySway(
      SHAPE_RENDER[wall.shape].map(([vx, vy]) => project(vx * (CORE_R + 0.12), vy * (CORE_R + 0.12), z)),
      sway
    ));
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = `${elem.accent}66`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // For static / spin / twin we draw a wall block with hole(s) cut out.
  const wv = applySway([
    project(-WALL_HALF, -WALL_HALF, z),
    project(WALL_HALF, -WALL_HALF, z),
    project(WALL_HALF, WALL_HALF, z),
    project(-WALL_HALF, WALL_HALF, z),
  ], sway);

  // Build hole vertex sets.
  const holes =
    wall.type === 'twin'
      ? wall.holes.map((h) => holeShapeProjected(wall, h, HOLE_R))
      : [holeShapeProjected(wall, null, HOLE_R)];

  // Wall fill with hole(s) cut out (even-odd).
  ctx.beginPath();
  ctx.moveTo(wv[0].x, wv[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(wv[i].x, wv[i].y);
  ctx.closePath();
  for (const verts of holes) {
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
  }
  ctx.fillStyle = `rgba(45, 30, 20, ${0.7 + 0.3 * (1 - fade)})`;
  ctx.fill('evenodd');

  // Wall edges.
  polyPath(wv);
  ctx.strokeStyle = `rgba(140, 110, 85, ${1 - fade * 0.45})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hole outline(s).
  if (wall.type === 'twin') {
    for (const h of wall.holes) drawHoleOutline(wall, h, HOLE_R);
  } else {
    drawHoleOutline(wall, null, HOLE_R);
  }

  // Spinner ghost preview — fades in over the spinning portion.
  if (wall.type === 'spin' && wall.z < SPIN_START_Z) {
    const t = clamp((SPIN_START_Z - wall.z) / (SPIN_START_Z - PLAYER_Z), 0, 1);
    if (t > 0.35) {
      const ghostAlpha = (t - 0.35) / 0.65;
      const elem = ELEMENTS[SHAPE_ELEMENT[wall.shape]];
      const [gx, gy] = sideOffset(wall.endSide);
      const verts = applySway(
        SHAPE_RENDER[wall.shape].map(([vx, vy]) =>
          project(gx + vx * HOLE_R, gy + vy * HOLE_R, z)
        ),
        sway
      );
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = `rgba(255, 220, 150, ${ghostAlpha * 0.55})`;
      ctx.lineWidth = 1.5;
      polyPath(verts);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// --- Powerup icons (shared by HUD and locked walls) ---
function drawPowerupIcon(type, cx, cy, r) {
  ctx.save();
  if (type === 'bonus') {
    // 5-point star
    ctx.shadowColor = '#ffd060';
    ctx.shadowBlur = r * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd060';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff5c0';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (type === 'wrecking') {
    // Spiked sun
    ctx.shadowColor = '#ff7040';
    ctx.shadowBlur = r * 0.7;
    ctx.fillStyle = '#ff7040';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffaa70';
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  } else if (type === 'slowmo') {
    // Hourglass
    ctx.shadowColor = '#7ab8e0';
    ctx.shadowBlur = r * 0.5;
    ctx.fillStyle = '#7ab8e0';
    ctx.strokeStyle = '#bce0f0';
    ctx.lineWidth = 1.2;
    const w = r * 0.7, h = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h); ctx.lineTo(cx + w, cy - h);
    ctx.lineTo(cx, cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + h); ctx.lineTo(cx + w, cy + h);
    ctx.lineTo(cx, cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (type === 'extralife') {
    // Heart
    ctx.shadowColor = '#ff5060';
    ctx.shadowBlur = r * 0.6;
    ctx.fillStyle = '#ff5060';
    ctx.strokeStyle = '#ffa0aa';
    ctx.lineWidth = 1.2;
    const s = r;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.5);
    ctx.bezierCurveTo(cx + s, cy + s * 0.05, cx + s * 0.7, cy - s * 0.7, cx, cy - s * 0.18);
    ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.7, cx - s, cy + s * 0.05, cx, cy + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
}

// --- Player ---
function drawPlayer() {
  const verts = player.verts;
  const px = player.x, py = player.y;
  const wrecking = wreckingT > 0;
  const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
  // Override palette during wrecking ball — bright fire regardless of shape.
  const fillCol = wrecking ? '#ff7030' : elem.primary;
  const strokeCol = wrecking ? '#ffd070' : elem.accent;
  const glowCol = wrecking ? 'rgba(255,140,60,0.95)' : elem.glow;
  const tilt = Math.sin(animTime * 1.6) * 0.22 + (wrecking ? animTime * 6 : 0);
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

  const center = project(px, py, PLAYER_Z);
  const lean = clamp(player.vx * 0.05, -0.28, 0.28);

  ctx.save();
  // Hit-flash: draw the player with reduced opacity during invulnerability.
  if (invulnT > 0) {
    ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(animTime * 30));
  }
  ctx.translate(center.x, center.y);
  ctx.rotate(lean);
  ctx.translate(-center.x, -center.y);

  polyPath(back);
  ctx.shadowColor = glowCol;
  ctx.shadowBlur = wrecking ? 28 : 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `${strokeCol}55`;
  ctx.lineWidth = 1;
  const stride = Math.max(1, Math.floor(MORPH_N / 24));
  for (let i = 0; i < MORPH_N; i += stride) {
    ctx.beginPath();
    ctx.moveTo(front[i].x, front[i].y);
    ctx.lineTo(back[i].x, back[i].y);
    ctx.stroke();
  }

  polyPath(front);
  ctx.fillStyle = fillCol;
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.restore();

  // Wrecking-ball trailing particles, emitted from the live screen position.
  if (wrecking && Math.random() < 0.7) {
    emitBurst(center.x, center.y, '#ff8030', 1, 80);
  }
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

// --- HUD ---
function drawHeart(cx, cy, r, alive) {
  ctx.save();
  if (alive) {
    ctx.shadowColor = 'rgba(255, 80, 100, 0.7)';
    ctx.shadowBlur = r * 0.8;
    ctx.fillStyle = '#ff5060';
    ctx.strokeStyle = '#ffa8b0';
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeStyle = 'rgba(120, 70, 80, 0.55)';
  }
  ctx.lineWidth = 1.6;
  const s = r;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.5);
  ctx.bezierCurveTo(cx + s * 1.05, cy + s * 0.05, cx + s * 0.7, cy - s * 0.7, cx, cy - s * 0.18);
  ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.7, cx - s * 1.05, cy + s * 0.05, cx, cy + s * 0.5);
  ctx.closePath();
  if (alive) ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  // Lives — top-left row of hearts. 3 slots, filled = alive, outlined = lost.
  const heartR = 11;
  const heartGap = 32;
  for (let i = 0; i < 3; i++) {
    drawHeart(22 + i * heartGap, 26, heartR, i < lives);
  }

  // Score — large, top-right.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5e6d0';
  ctx.font = 'bold 38px ui-monospace, monospace';
  ctx.fillText(String(score), W - 18, 40);

  // Best combo — small, under score.
  ctx.fillStyle = '#a89070';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`BEST x${bestCombo}`, W - 18, 56);

  // Live combo pip — only shows when meaningful.
  if (combo > 1) {
    const pop = 1 + comboPopT * 0.35;
    const size = 16 + Math.min(combo * 0.6, 10);
    ctx.save();
    ctx.translate(W - 18, 80);
    ctx.scale(pop, pop);
    ctx.shadowColor = 'rgba(255, 200, 100, 0.7)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffc070';
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`x${combo}`, 0, 0);
    ctx.restore();
  }

  // Active powerup pills — top-centre row.
  const pills = [];
  if (wreckingT > 0) pills.push({ type: 'wrecking', label: `x${wreckingT}` });
  if (powerupSlowT > 0) pills.push({ type: 'slowmo', label: `${powerupSlowT.toFixed(1)}s` });
  if (pills.length) {
    const pillW = 78;
    const pillH = 36;
    const totalW = pills.length * pillW + (pills.length - 1) * 10;
    let cx = W / 2 - totalW / 2;
    for (const p of pills) {
      ctx.save();
      ctx.fillStyle = 'rgba(20, 14, 10, 0.7)';
      ctx.strokeStyle = POWERUPS[p.type].color;
      ctx.lineWidth = 1.5;
      roundRect(cx, 12, pillW, pillH, 10);
      ctx.fill();
      ctx.stroke();
      drawPowerupIcon(p.type, cx + 16, 30, 11);
      ctx.fillStyle = '#f0e0c8';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.label, cx + 32, 35);
      ctx.restore();
      cx += pillW + 10;
    }
  }

  // Powerup grab notice — large flash when one is collected.
  if (powerupNoticeT > 0 && powerupNoticeType) {
    const t = powerupNoticeT;
    ctx.save();
    ctx.globalAlpha = clamp(t * 1.3, 0, 1);
    const cx = W / 2;
    const cy = H / 2 - 60;
    drawPowerupIcon(powerupNoticeType, cx, cy, 28 + (1 - t) * 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labels = {
      bonus: '+20 SCORE',
      wrecking: 'WRECKING BALL',
      slowmo: 'SLOW-MO',
      extralife: '+1 LIFE',
    };
    ctx.fillText(labels[powerupNoticeType] || '', cx, cy + 50);
    ctx.restore();
  }

  if (gameOver) {
    // Translucent panel keeps the over-game readable above the world.
    ctx.fillStyle = 'rgba(10, 6, 8, 0.68)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px ui-monospace, monospace';
    ctx.fillStyle = '#ff8060';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.fillStyle = '#f5e6d0';
    ctx.fillText(String(score), W / 2, H / 2 + 6);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#a89070';
    ctx.fillText(`BEST COMBO x${bestCombo}`, W / 2, H / 2 + 28);
    ctx.fillText('press any key / tap to restart', W / 2, H / 2 + 56);
  }
}

// --- Shape bar (cycle order + direct selection) ---
const BAR_BUTTON = 56;
const BAR_GAP = 12;
const BAR_BOTTOM_OFFSET = 28;
function shapeBarLayout() {
  const total = BAR_BUTTON * SHAPES.length + BAR_GAP * (SHAPES.length - 1);
  const x0 = (W - total) / 2;
  const y0 = H - BAR_BOTTOM_OFFSET - BAR_BUTTON;
  return { x0, y0, total };
}
function hitShapeBar(px, py) {
  const { x0, y0 } = shapeBarLayout();
  if (py < y0 - 6 || py > y0 + BAR_BUTTON + 6) return null;
  for (let i = 0; i < SHAPES.length; i++) {
    const bx = x0 + i * (BAR_BUTTON + BAR_GAP);
    if (px >= bx - 4 && px <= bx + BAR_BUTTON + 4) return SHAPES[i];
  }
  return null;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function drawShapeBar() {
  const { x0, y0 } = shapeBarLayout();
  for (let i = 0; i < SHAPES.length; i++) {
    const shape = SHAPES[i];
    const elem = ELEMENTS[SHAPE_ELEMENT[shape]];
    const x = x0 + i * (BAR_BUTTON + BAR_GAP);
    const isCurrent = shape === player.shape;
    const cx = x + BAR_BUTTON / 2;
    const cy = y0 + BAR_BUTTON / 2;

    if (isCurrent) {
      ctx.shadowColor = elem.glow;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = isCurrent ? `${elem.primary}33` : 'rgba(20, 14, 10, 0.65)';
    roundRect(x, y0, BAR_BUTTON, BAR_BUTTON, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isCurrent ? elem.accent : 'rgba(120, 100, 80, 0.55)';
    ctx.lineWidth = isCurrent ? 2.5 : 1;
    roundRect(x, y0, BAR_BUTTON, BAR_BUTTON, 12);
    ctx.stroke();

    const iconR = 15;
    const iconVerts = SHAPE_RENDER[shape].map(([vx, vy]) => ({
      x: cx + vx * iconR,
      y: cy + vy * iconR,
    }));
    polyPath(iconVerts);
    ctx.fillStyle = isCurrent ? elem.primary : `${elem.primary}99`;
    ctx.fill();
    ctx.strokeStyle = elem.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// --- Match logic per wall type ---
function wallMatches(wall) {
  if (wall.type === 'static') return wall.side === player.side && wall.shape === player.shape;
  if (wall.type === 'spin') return wall.endSide === player.side && wall.shape === player.shape;
  if (wall.type === 'twin')
    return wall.holes.some((h) => h.side === player.side && h.shape === player.shape);
  if (wall.type === 'core') return wall.shape === player.shape;        // side irrelevant
  if (wall.type === 'locked') return wall.shape === player.shape;      // shape-only, like core
  return false;
}

let lastTime = performance.now();
function loop(now) {
  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (crashSlowT > 0) crashSlowT = Math.max(0, crashSlowT - rawDt / 0.5);
  if (powerupSlowT > 0) powerupSlowT = Math.max(0, powerupSlowT - rawDt);
  if (invulnT > 0) invulnT = Math.max(0, invulnT - rawDt);
  if (powerupNoticeT > 0) powerupNoticeT = Math.max(0, powerupNoticeT - rawDt / 1.6);
  const dt = rawDt * (1 - crashSlowT * 0.7) * (powerupSlowT > 0 ? 0.5 : 1);
  animTime += dt;

  // Spring-damper slide.
  const [tx, ty] = sideOffset(player.side);
  const k = 260, c = 2 * Math.sqrt(k) * 0.7;
  player.vx += (-k * (player.x - tx) - c * player.vx) * dt;
  player.vy += (-k * (player.y - ty) - c * player.vy) * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Vertex morph (or star morph during wrecking ball).
  const targetVerts = wreckingT > 0 ? WRECKING_VERTS : SHAPE_MORPH[player.shape];
  const km = 1 - Math.exp(-dt / 0.08);
  for (let i = 0; i < MORPH_N; i++) {
    player.verts[i][0] += (targetVerts[i][0] - player.verts[i][0]) * km;
    player.verts[i][1] += (targetVerts[i][1] - player.verts[i][1]) * km;
  }

  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt / 0.55);
  if (flashT > 0) flashT = Math.max(0, flashT - dt / 0.22);
  if (comboPopT > 0) comboPopT = Math.max(0, comboPopT - dt / 0.6);

  // Particles.
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt / p.duration;
  }
  particles = particles.filter((p) => p.life > 0);

  if (!gameOver) {
    cameraDistance += speed * dt;
    // Base ramp stays at 0.08/sec for the first ~5 walls (preserves the start
    // feel) and then accelerates with score, so the longer you survive the
    // faster speed climbs.
    speed += dt * (0.08 + Math.max(0, score - 5) * 0.005);

    lastSpawn += dt;
    const interval = Math.max(0.7, 2.0 - speed * 0.03);
    if (lastSpawn > interval) {
      spawnWall();
      lastSpawn = 0;
    }

    for (const w of walls) {
      const prevZ = w.z;
      w.z = w.absPos - cameraDistance;
      if (w.resolved || prevZ <= PLAYER_Z || w.z > PLAYER_Z) continue;
      w.resolved = true;
      const playerScreen = project(player.x, player.y, PLAYER_Z);

      // Wrecking Ball: smash everything. Capped combo gain so it doesn't farm.
      if (wreckingT > 0) {
        score += 5;
        combo++;
        if (combo > bestCombo) { bestCombo = combo; saveBest(); }
        wreckingT--;
        playPass();
        emitBurst(playerScreen.x, playerScreen.y, '#ff7040', 22, 380);
        flashColor = 'rgba(255,120,60,1)';
        flashT = 1;
        shakeT = Math.max(shakeT, 0.4);
        cameraDistance += 1.4;
        continue;
      }

      // Invulnerability after a hit: phase through, no scoring or damage.
      if (invulnT > 0) continue;

      const matched = wallMatches(w);
      if (matched) {
        combo++;
        score += combo;
        if (combo > bestCombo) { bestCombo = combo; saveBest(); }
        comboPopT = 1;
        playPass();
        const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
        emitBurst(playerScreen.x, playerScreen.y, elem.primary, 16, 280);
        flashColor = elem.flash;
        flashT = 1;
        shakeT = Math.max(shakeT, 0.35);
        cameraDistance += 1.2;

        // Locked wall: collect powerup if combo cleared the threshold.
        if (w.type === 'locked') {
          if (combo >= w.threshold) {
            applyPowerup(w.powerup);
          } else {
            // Combo too low — lock shatters, no powerup.
            emitBurst(playerScreen.x, playerScreen.y, '#888', 10, 200);
            playLockBreak();
          }
        }
      } else {
        // Wrong wall: lose a life.
        lives--;
        combo = 0;
        invulnT = 1.0;
        const wallShape = w.type === 'twin' ? w.holes[0].shape : w.shape;
        const wallElem = ELEMENTS[SHAPE_ELEMENT[wallShape]];
        emitBurst(playerScreen.x, playerScreen.y, '#ff5040', 36, 420);
        emitBurst(playerScreen.x, playerScreen.y, wallElem.primary, 18, 320);
        flashColor = 'rgba(255, 70, 50, 1)';
        flashT = 1;
        shakeT = 1;
        if (lives <= 0) {
          gameOver = true;
          crashSlowT = 1;
          playCrash();
        } else {
          playHit();
        }
      }
    }
    walls = walls.filter((w) => w.z > PLAYER_Z * 0.95);
  }

  // --- Render ---
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, W, H);

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
  if (!gameOver) drawPlayer();
  drawParticles();

  ctx.restore();

  if (flashT > 0 && flashColor) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = flashT * 0.35;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawHUD();
  drawShapeBar();

  scheduleMusic();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Audio ---
let audio = null;
let masterGain = null, musicGain = null, sfxGain = null;
let noiseBuffer = null;

function ensureAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audio.createGain();
    musicGain = audio.createGain();
    sfxGain = audio.createGain();
    masterGain.gain.value = 0.85;
    musicGain.gain.value = musicEnabled ? 0.55 : 0;
    sfxGain.gain.value = 1.0;
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume();
}

function getNoiseBuffer() {
  if (!noiseBuffer && audio) {
    const len = audio.sampleRate;
    noiseBuffer = audio.createBuffer(1, len, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
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
  osc.connect(gain).connect(sfxGain);
  osc.start(t);
  osc.stop(t + duration);
}

// --- Music synth (driving 4-bar progression that layers in with speed/combo) ---
// 4-bar progression in A minor: i — VII — VI — V (Am G F E). The major V at
// the end (E with a G#) creates Phrygian-dominant tension that pulls back
// to the i, giving the loop forward momentum instead of just sitting on root.
const PROGRESSION = [
  { bass: 55.00, root: 220.00, third: 261.63, fifth: 329.63, color: 'minor' }, // Am: A C E
  { bass: 49.00, root: 196.00, third: 246.94, fifth: 293.66, color: 'major' }, // G:  G B D
  { bass: 43.65, root: 174.61, third: 220.00, fifth: 261.63, color: 'major' }, // F:  F A C
  { bass: 41.20, root: 164.81, third: 207.65, fifth: 246.94, color: 'major' }, // E:  E G# B
];
const PROG_BARS = PROGRESSION.length;
const BEATS_PER_BAR = 4;

function bpm() {
  return 100 + clamp((speed - 10) * 2.5, 0, 55);
}

function scheduleKick(t, vol = 0.5) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(musicGain);
  osc.start(t);
  osc.stop(t + 0.2);
}

function playBassNote(t, freq, duration, vol) {
  const osc = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);
  filter.type = 'lowpass';
  filter.frequency.value = freq < 70 ? 720 : 1500;
  filter.Q.value = 2.5;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(filter).connect(gain).connect(musicGain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}
function scheduleBass(t, beatInBar, chord) {
  const beatLen = 60 / bpm();
  // Root on the beat...
  playBassNote(t, chord.bass, beatLen * 0.7, 0.18);
  // ...with an octave-up bump on the "and" for groove. Skip beat-4-and so
  // the bar breathes before the next chord.
  if (beatInBar !== 3) {
    playBassNote(t + beatLen * 0.5, chord.bass * 2, beatLen * 0.4, 0.10);
  }
}

function scheduleHat(t, vol = 0.08, len = 0.04) {
  const buf = getNoiseBuffer();
  if (!buf) return;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(filter).connect(gain).connect(musicGain);
  src.start(t);
  src.stop(t + len + 0.01);
}
function scheduleOpenHat(t) {
  const buf = getNoiseBuffer();
  if (!buf) return;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  filter.type = 'highpass';
  filter.frequency.value = 6500;
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  src.connect(filter).connect(gain).connect(musicGain);
  src.start(t);
  src.stop(t + 0.3);
}
function scheduleSnare(t) {
  const buf = getNoiseBuffer();
  if (!buf) return;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = 1700;
  filter.Q.value = 0.9;
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  src.connect(filter).connect(gain).connect(musicGain);
  src.start(t);
  src.stop(t + 0.15);
  const osc = audio.createOscillator();
  const oGain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.05);
  oGain.gain.setValueAtTime(0.12, t);
  oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(oGain).connect(musicGain);
  osc.start(t);
  osc.stop(t + 0.1);
}

// Lead: chord arpeggio per bar (root → third → fifth → third). Phrases the
// melody to the harmony so each bar sounds different.
function scheduleLead(t, beatInBar, chord) {
  const arp = [chord.root, chord.third, chord.fifth, chord.third];
  const freq = arp[beatInBar];
  const beatLen = 60 / bpm();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.055, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 0.6);
  osc.connect(gain).connect(musicGain);
  osc.start(t);
  osc.stop(t + beatLen);
}

// Sustained pad chord, one bar long. Two-voice (root + fifth) for harmonic body.
function schedulePad(t, chord, duration) {
  const voices = [chord.root, chord.fifth];
  for (const freq of voices) {
    const osc = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.25);
    gain.gain.setValueAtTime(0.025, t + duration - 0.25);
    gain.gain.linearRampToValueAtTime(0.001, t + duration);
    osc.connect(filter).connect(gain).connect(musicGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}

function scheduleMusic() {
  if (!audio || gameOver) return;
  if (musicNextBeat < audio.currentTime + 0.02) {
    musicNextBeat = audio.currentTime + 0.05;
  }
  const beatLen = 60 / bpm();
  while (musicNextBeat < audio.currentTime + 0.12) {
    const t = musicNextBeat;
    const beatInBar = beatIndex % BEATS_PER_BAR;
    const bar = Math.floor(beatIndex / BEATS_PER_BAR) % PROG_BARS;
    const chord = PROGRESSION[bar];

    scheduleKick(t);
    scheduleBass(t, beatInBar, chord);
    scheduleHat(t + beatLen / 2);

    // Pad starts on each downbeat and holds the bar.
    if (beatInBar === 0) schedulePad(t, chord, beatLen * BEATS_PER_BAR);

    if (speed >= 13) {
      scheduleHat(t + beatLen / 4, 0.05);
      scheduleHat(t + beatLen * 3 / 4, 0.05);
    }
    if (speed >= 18 && (beatInBar === 1 || beatInBar === 3)) {
      scheduleSnare(t);
    }

    // Ghost kick on the "and" of beat 4 every other bar — adds a syncopated
    // lift into the next bar without breaking the four-on-the-floor pulse.
    if (beatInBar === 3 && bar % 2 === 0 && speed >= 12) {
      scheduleKick(t + beatLen * 0.5, 0.22);
    }

    // Open hat on the last "and" of the progression — signals the loop turn.
    if (bar === PROG_BARS - 1 && beatInBar === 3) {
      scheduleOpenHat(t + beatLen * 0.5);
    }

    if (combo >= 8) scheduleLead(t, beatInBar, chord);

    musicNextBeat += beatLen;
    beatIndex++;
  }
}
function playSlide() { tone({ freq: 200, type: 'triangle', volume: 0.07, duration: 0.08 }); }
function playCycle() { tone({ freq: SHAPE_FREQ[player.shape], type: 'sine', volume: 0.13, duration: 0.16 }); }
function playPass() {
  tone({ freq: 660, freq2: 990, type: 'sine', volume: 0.18, duration: 0.22 });
  tone({ freq: 130, freq2: 90, type: 'sine', volume: 0.18, duration: 0.18 });
}
function playCrash() {
  tone({ freq: 240, freq2: 50, type: 'sawtooth', volume: 0.28, duration: 0.6 });
  tone({ freq: 70, freq2: 35, type: 'sine', volume: 0.25, duration: 0.7 });
  tone({ freq: 110, type: 'square', volume: 0.13, duration: 0.5, delay: 0.05 });
}
function playHit() {
  // Lighter hit (life lost but still alive): short dissonant stab.
  tone({ freq: 320, freq2: 160, type: 'sawtooth', volume: 0.2, duration: 0.18 });
  tone({ freq: 120, freq2: 80, type: 'sine', volume: 0.18, duration: 0.2 });
}
function playPowerup() {
  // Bright triumphant arpeggio.
  [392, 523, 660, 880].forEach((f, i) =>
    tone({ freq: f, type: 'triangle', volume: 0.18, duration: 0.22, delay: i * 0.06 })
  );
}
function playLockBreak() {
  // Brief scrape — the lock shatters because you didn't earn it.
  tone({ freq: 280, freq2: 120, type: 'sawtooth', volume: 0.13, duration: 0.18 });
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
function setShape(shape) {
  if (gameOver || player.shape === shape) return;
  player.shape = shape;
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
    case '1': setShape('triangle'); e.preventDefault(); break;
    case '2': setShape('square'); e.preventDefault(); break;
    case '3': setShape('pentagon'); e.preventDefault(); break;
    case '4': setShape('circle'); e.preventDefault(); break;
    case 'm': case 'M':
      musicEnabled = !musicEnabled;
      if (musicGain) musicGain.gain.value = musicEnabled ? 0.55 : 0;
      e.preventDefault();
      break;
  }
});

function canvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

const SWIPE_THRESHOLD = 28;
const TAP_MOVED = 12;
let touchState = null;

canvas.addEventListener('touchstart', (e) => {
  ensureAudio();
  e.preventDefault();
  const t = e.touches[0];
  const pt = canvasPoint(t.clientX, t.clientY);
  const barShape = hitShapeBar(pt.x, pt.y);
  touchState = { startX: t.clientX, startY: t.clientY, barShape, fired: false };
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!touchState || touchState.fired || touchState.barShape) return;
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - touchState.startX;
  const dy = t.clientY - touchState.startY;
  if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
    if (gameOver) {
      reset();
    } else if (Math.abs(dx) > Math.abs(dy)) {
      setSide(dx > 0 ? 'right' : 'left');
    } else {
      setSide(dy > 0 ? 'bottom' : 'top');
    }
    touchState.fired = true;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!touchState) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchState.startX;
  const dy = t.clientY - touchState.startY;
  const moved = Math.hypot(dx, dy) > TAP_MOVED;

  if (gameOver) {
    if (!touchState.fired) reset();
  } else if (touchState.barShape && !moved) {
    setShape(touchState.barShape);
  } else if (!touchState.fired && !moved) {
    cycleShape();
  }
  touchState = null;
}, { passive: false });

canvas.addEventListener('click', (e) => {
  ensureAudio();
  if (gameOver) { reset(); return; }
  const pt = canvasPoint(e.clientX, e.clientY);
  const barShape = hitShapeBar(pt.x, pt.y);
  if (barShape) setShape(barShape);
  else cycleShape();
});
