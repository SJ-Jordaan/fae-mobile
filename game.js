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
let cameraDistance, shakeT, slowMoT, flashColor, flashT, comboPopT;

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
  gameOver = false;
  lastSpawn = 999;
  animTime = 0;
  shakeT = 0;
  slowMoT = 0;
  flashColor = null;
  flashT = 0;
  comboPopT = 0;
  cameraDistance = 0;
}
reset();

// --- Wall types ---
// Distribution depends on score so each type is introduced once the player has
// enough wall passes to have learned the previous one.
function chooseWallType() {
  if (score < 5) return 'static';
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
  }
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

// --- Player ---
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

  const center = project(px, py, PLAYER_Z);
  const lean = clamp(player.vx * 0.05, -0.28, 0.28);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(lean);
  ctx.translate(-center.x, -center.y);

  polyPath(back);
  ctx.shadowColor = elem.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `${elem.accent}55`;
  ctx.lineWidth = 1;
  const stride = Math.max(1, Math.floor(MORPH_N / 24));
  for (let i = 0; i < MORPH_N; i += stride) {
    ctx.beginPath();
    ctx.moveTo(front[i].x, front[i].y);
    ctx.lineTo(back[i].x, back[i].y);
    ctx.stroke();
  }

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

// --- HUD ---
function drawHUD() {
  ctx.fillStyle = '#cfb6a0';
  ctx.font = '18px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 16, 26);
  ctx.fillText(`SPEED  ${speed.toFixed(1)}`, 16, 48);

  if (combo > 1) {
    const pop = 1 + comboPopT * 0.25;
    ctx.save();
    ctx.translate(16, 74);
    ctx.scale(pop, pop);
    ctx.fillStyle = '#ffb060';
    ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.fillText(`COMBO  x${combo}`, 0, 0);
    ctx.restore();
  }

  const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
  ctx.textAlign = 'right';
  ctx.fillStyle = elem.accent;
  ctx.font = '18px ui-monospace, monospace';
  ctx.fillText(SHAPE_ELEMENT[player.shape].toUpperCase(), W - 16, 26);

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
  if (wall.type === 'core') return wall.shape === player.shape; // side irrelevant
  return false;
}

let lastTime = performance.now();
function loop(now) {
  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (slowMoT > 0) slowMoT = Math.max(0, slowMoT - rawDt / 0.5);
  const dt = rawDt * (1 - slowMoT * 0.7);
  animTime += dt;

  // Spring-damper slide.
  const [tx, ty] = sideOffset(player.side);
  const k = 260, c = 2 * Math.sqrt(k) * 0.7;
  player.vx += (-k * (player.x - tx) - c * player.vx) * dt;
  player.vy += (-k * (player.y - ty) - c * player.vy) * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Vertex morph.
  const targetVerts = SHAPE_MORPH[player.shape];
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
    speed += dt * 0.08;

    lastSpawn += dt;
    const interval = Math.max(0.7, 2.0 - speed * 0.03);
    if (lastSpawn > interval) {
      spawnWall();
      lastSpawn = 0;
    }

    for (const w of walls) {
      const prevZ = w.z;
      w.z = w.absPos - cameraDistance;
      if (!w.resolved && prevZ > PLAYER_Z && w.z <= PLAYER_Z) {
        w.resolved = true;
        const playerScreen = project(player.x, player.y, PLAYER_Z);
        if (wallMatches(w)) {
          combo++;
          score += combo;
          comboPopT = 1;
          playPass();
          const elem = ELEMENTS[SHAPE_ELEMENT[player.shape]];
          emitBurst(playerScreen.x, playerScreen.y, elem.primary, 16, 280);
          flashColor = elem.flash;
          flashT = 1;
          shakeT = Math.max(shakeT, 0.35);
          cameraDistance += 1.2;
        } else {
          gameOver = true;
          combo = 0;
          const wallShape = w.type === 'twin' ? w.holes[0].shape : w.shape;
          const wallElem = ELEMENTS[SHAPE_ELEMENT[wallShape]];
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
  tone({ freq: 130, freq2: 90, type: 'sine', volume: 0.18, duration: 0.18 });
}
function playCrash() {
  tone({ freq: 240, freq2: 50, type: 'sawtooth', volume: 0.28, duration: 0.6 });
  tone({ freq: 70, freq2: 35, type: 'sine', volume: 0.25, duration: 0.7 });
  tone({ freq: 110, type: 'square', volume: 0.13, duration: 0.5, delay: 0.05 });
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
