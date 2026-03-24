/* ═══════════════════════════════════════════════════════════════
   Snake — Polyglot Edition
   ═══════════════════════════════════════════════════════════════
   Architecture:
     State machine  → MENU | PLAYING | PAUSED | DEAD
     Fixed timestep → logic ticks at configurable rate
     rAF render     → draws every frame with interpolation
     Typed arrays   → zero GC in hot path
     Occupancy grid → O(1) collision detection
   ═══════════════════════════════════════════════════════════════ */

(() => {
'use strict';

// ── DOM ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });

const dom = {
    overlay:    $('overlay'),
    menu:       $('menu'),
    death:      $('death'),
    pause:      $('pause'),
    score:      $('score'),
    best:       $('high-score'),
    level:      $('level'),
    length:     $('length'),
    dScore:     $('d-score'),
    dLevel:     $('d-level'),
    dLength:    $('d-length'),
    newBest:    $('new-best'),
    puInd:      $('powerup-indicator'),
    puIcon:     $('powerup-icon'),
    puTimer:    $('powerup-timer'),
};

// ── Constants ───────────────────────────────────────────────────
const W    = 600;
const H    = 600;
const CELL = 20;
const COLS = W / CELL;
const ROWS = H / CELL;
const MAX_SNAKE = COLS * ROWS;

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, DEAD: 3 };

const TICK_MS  = { 1: 125, 2: 85, 3: 55 };
const PU_TYPES = { SPEED: 0, SHIELD: 1, MULTI: 2 };

const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 500, 700, 1000];
const OBSTACLES_PER_LEVEL = [0, 0, 2, 4, 6, 8, 10, 12];

const COLOR = {
    bg:       '#09090b',
    grid:     '#0e0e13',
    wall:     '#1e1e2a',
    head:     '#22c55e',
    body:     '#16a34a',
    bodyMid:  '#15803d',
    tail:     '#166534',
    food:     '#ef4444',
    foodGlow: 'rgba(239,68,68,0.15)',
    obstacle: '#27272a',
    obsBord:  '#3f3f46',
    shield:   '#06b6d4',
    shieldBg: 'rgba(6,182,212,0.08)',
    speed:    '#f59e0b',
    multi:    '#a855f7',
};

// ── Pre-bake grid ───────────────────────────────────────────────
const gridImg = document.createElement('canvas');
gridImg.width = W;
gridImg.height = H;
const gctx = gridImg.getContext('2d');
gctx.fillStyle = COLOR.bg;
gctx.fillRect(0, 0, W, H);
gctx.fillStyle = COLOR.grid;
for (let x = 0; x <= COLS; x++)
    for (let y = 0; y <= ROWS; y++)
        gctx.fillRect(x * CELL, y * CELL, 1, 1);

// ── Pre-bake vignette ───────────────────────────────────────────
const vigImg = document.createElement('canvas');
vigImg.width = W;
vigImg.height = H;
const vctx = vigImg.getContext('2d');
const vg = vctx.createRadialGradient(W/2, H/2, W*0.28, W/2, H/2, W*0.72);
vg.addColorStop(0, 'transparent');
vg.addColorStop(1, 'rgba(9,9,11,0.45)');
vctx.fillStyle = vg;
vctx.fillRect(0, 0, W, H);

// ── State ───────────────────────────────────────────────────────
let state = STATE.MENU;
let mode = 'arcade';
let speed = 2;
let bestScore = parseInt(localStorage.getItem('snake-best') || '0', 10);
dom.best.textContent = bestScore;

// Snake (parallel typed arrays)
const snkX = new Int16Array(MAX_SNAKE);
const snkY = new Int16Array(MAX_SNAKE);
const prvX = new Int16Array(MAX_SNAKE);
const prvY = new Int16Array(MAX_SNAKE);
let snkLen = 0;
let dirX = 0, dirY = 0, nxtDX = 0, nxtDY = 0;

// Occupancy grid
const occ = new Uint8Array(COLS * ROWS);
function occI(x, y) { return y * COLS + x; }

// Game state
let score, level, tickAccum, lastFrame;
let foodX, foodY;
let shakeFrames;
let deathTimer;

// Obstacles
const obsX = new Int16Array(64);
const obsY = new Int16Array(64);
let obsCount = 0;

// Power-ups (field item)
let puFieldActive, puFieldX, puFieldY, puFieldType, puFieldTimer;
let puSpawnCooldown;

// Active power-up effect
let puActive, puType, puDuration;
let hasShield;

// Input ring buffer
const INP_CAP = 4;
const inpX = new Int8Array(INP_CAP);
const inpY = new Int8Array(INP_CAP);
let inpH = 0, inpT = 0, inpN = 0;

function inpPush(x, y) {
    if (inpN >= INP_CAP) return;
    const li = (inpT - 1 + INP_CAP) % INP_CAP;
    const lx = inpN > 0 ? inpX[li] : dirX;
    const ly = inpN > 0 ? inpY[li] : dirY;
    if ((x === lx && y === ly) || (x === -lx && y === -ly)) return;
    inpX[inpT] = x; inpY[inpT] = y;
    inpT = (inpT + 1) % INP_CAP;
    inpN++;
}

function inpPop() {
    if (inpN === 0) return;
    const x = inpX[inpH], y = inpY[inpH];
    inpH = (inpH + 1) % INP_CAP;
    inpN--;
    if (x !== -dirX || y !== -dirY) { nxtDX = x; nxtDY = y; }
}

// ── Particle Pool ───────────────────────────────────────────────
const P = 80;
const pOn = new Uint8Array(P);
const pX = new Float32Array(P);
const pY = new Float32Array(P);
const pVX = new Float32Array(P);
const pVY = new Float32Array(P);
const pLife = new Float32Array(P);
const pMax = new Float32Array(P);
const pR = new Float32Array(P);
const pCol = new Uint8Array(P); // index into palette

const PAL = [COLOR.head, COLOR.food, '#ffffff', COLOR.speed, COLOR.shield, COLOR.multi];

function emitParticles(cx, cy, n, col, spread) {
    let s = 0;
    for (let i = 0; i < P && s < n; i++) {
        if (pOn[i]) continue;
        pOn[i] = 1;
        pX[i] = cx; pY[i] = cy;
        const a = Math.random() * 6.283;
        const v = 0.4 + Math.random() * spread;
        pVX[i] = Math.cos(a) * v;
        pVY[i] = Math.sin(a) * v;
        pLife[i] = pMax[i] = 15 + (Math.random() * 15) | 0;
        pR[i] = 1 + Math.random() * 2;
        pCol[i] = col;
        s++;
    }
}

function tickParticles() {
    for (let i = 0; i < P; i++) {
        if (!pOn[i]) continue;
        pX[i] += pVX[i]; pY[i] += pVY[i];
        pVX[i] *= 0.94; pVY[i] *= 0.94;
        if (--pLife[i] <= 0) pOn[i] = 0;
    }
}

function drawParticles() {
    for (let i = 0; i < P; i++) {
        if (!pOn[i]) continue;
        const a = pLife[i] / pMax[i];
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = PAL[pCol[i]];
        ctx.beginPath();
        ctx.arc(pX[i], pY[i], pR[i] * a, 0, 6.283);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ── Init ────────────────────────────────────────────────────────
function init() {
    const cx = COLS >> 1, cy = ROWS >> 1;
    snkLen = 3;
    snkX[0] = cx;   snkY[0] = cy;
    snkX[1] = cx-1;  snkY[1] = cy;
    snkX[2] = cx-2;  snkY[2] = cy;
    for (let i = 0; i < snkLen; i++) { prvX[i] = snkX[i]; prvY[i] = snkY[i]; }

    dirX = 1; dirY = 0; nxtDX = 1; nxtDY = 0;
    score = 0; level = 1;
    shakeFrames = 0; deathTimer = 0;
    tickAccum = 0;

    // Power-ups
    puFieldActive = false; puSpawnCooldown = 300;
    puActive = false; puDuration = 0; hasShield = false;
    dom.puInd.classList.add('hidden');
    dom.puInd.className = 'hud-powerup hidden';

    // Clear typed state
    pOn.fill(0);
    occ.fill(0);
    inpH = inpT = inpN = 0;

    // Mark snake occupied
    for (let i = 0; i < snkLen; i++) occ[occI(snkX[i], snkY[i])] = 1;

    // Obstacles
    obsCount = 0;

    placeFood();
    updateHUD();
}

function placeFood() {
    const total = COLS * ROWS;
    let empty = total - snkLen - obsCount;
    if (empty <= 0) return;
    let pick = (Math.random() * empty) | 0;
    for (let i = 0; i < total; i++) {
        const x = i % COLS, y = (i / COLS) | 0;
        if (occ[i] || isObstacle(x, y)) continue;
        if (puFieldActive && x === puFieldX && y === puFieldY) continue;
        if (pick === 0) { foodX = x; foodY = y; return; }
        pick--;
    }
}

function isObstacle(x, y) {
    for (let i = 0; i < obsCount; i++) {
        if (obsX[i] === x && obsY[i] === y) return true;
    }
    return false;
}

function spawnObstacles(count) {
    let toAdd = count - obsCount;
    if (toAdd <= 0) return;
    while (toAdd > 0) {
        const x = (Math.random() * COLS) | 0;
        const y = (Math.random() * ROWS) | 0;
        // Don't place near center (spawn area), on snake, food, or existing obstacles
        if (Math.abs(x - COLS/2) < 4 && Math.abs(y - ROWS/2) < 4) continue;
        if (occ[occI(x, y)]) continue;
        if (x === foodX && y === foodY) continue;
        if (isObstacle(x, y)) continue;
        obsX[obsCount] = x;
        obsY[obsCount] = y;
        obsCount++;
        toAdd--;
    }
}

// ── Power-up Logic ──────────────────────────────────────────────
function trySpawnPowerup() {
    if (mode !== 'arcade' || puFieldActive) return;
    if (--puSpawnCooldown > 0) return;

    puFieldType = (Math.random() * 3) | 0;
    let tries = 50;
    while (tries-- > 0) {
        const x = (Math.random() * COLS) | 0;
        const y = (Math.random() * ROWS) | 0;
        if (occ[occI(x, y)] || isObstacle(x, y)) continue;
        if (x === foodX && y === foodY) continue;
        puFieldX = x; puFieldY = y;
        puFieldActive = true;
        puFieldTimer = 250; // ticks until despawn
        return;
    }
}

function collectPowerup() {
    puFieldActive = false;
    puSpawnCooldown = 200 + (Math.random() * 150) | 0;

    puActive = true;
    puType = puFieldType;
    puDuration = 200;
    hasShield = puType === PU_TYPES.SHIELD;

    // UI indicator
    const cls = ['pu-speed', 'pu-shield', 'pu-multi'][puType];
    const icons = ['\u26A1', '\u25C6', '\u00D7'];
    const labels = ['SPEED', 'SHIELD', 'MULTI'];
    dom.puInd.className = 'hud-powerup ' + cls;
    dom.puInd.classList.remove('hidden');
    dom.puIcon.textContent = icons[puType];
    dom.puTimer.textContent = labels[puType];

    // Particles
    const cx = puFieldX * CELL + CELL/2;
    const cy = puFieldY * CELL + CELL/2;
    emitParticles(cx, cy, 10, 3 + puType, 2.5);
}

function tickPowerup() {
    if (!puActive) return;
    if (--puDuration <= 0) {
        puActive = false;
        hasShield = false;
        dom.puInd.classList.add('hidden');
    } else {
        // Flash indicator when running out
        const secs = Math.ceil(puDuration / (1000 / TICK_MS[speed]));
        dom.puTimer.textContent = secs + 's';
        if (puDuration < 60) {
            dom.puInd.style.opacity = puDuration % 10 < 5 ? '0.4' : '1';
        } else {
            dom.puInd.style.opacity = '1';
        }
    }
    if (puFieldActive && --puFieldTimer <= 0) {
        puFieldActive = false;
        puSpawnCooldown = 150;
    }
}

// ── Game Tick ────────────────────────────────────────────────────
function gameTick() {
    inpPop();
    dirX = nxtDX; dirY = nxtDY;

    // Store previous positions
    for (let i = 0; i < snkLen; i++) { prvX[i] = snkX[i]; prvY[i] = snkY[i]; }

    let hx = snkX[0] + dirX;
    let hy = snkY[0] + dirY;

    // Wall handling
    if (hx < 0 || hx >= COLS || hy < 0 || hy >= ROWS) {
        if (mode === 'arcade') {
            // Wrap
            hx = (hx + COLS) % COLS;
            hy = (hy + ROWS) % ROWS;
        } else {
            return die();
        }
    }

    // Obstacle collision
    if (isObstacle(hx, hy)) {
        if (hasShield) {
            hasShield = false;
            puActive = false;
            puDuration = 0;
            dom.puInd.classList.add('hidden');
            emitParticles(hx * CELL + CELL/2, hy * CELL + CELL/2, 12, 4, 3);
            // Remove the obstacle
            for (let i = 0; i < obsCount; i++) {
                if (obsX[i] === hx && obsY[i] === hy) {
                    obsX[i] = obsX[obsCount-1];
                    obsY[i] = obsY[obsCount-1];
                    obsCount--;
                    break;
                }
            }
        } else {
            return die();
        }
    }

    // Self collision
    if (occ[occI(hx, hy)]) {
        if (hasShield) {
            hasShield = false;
            puActive = false;
            puDuration = 0;
            dom.puInd.classList.add('hidden');
            emitParticles(hx * CELL + CELL/2, hy * CELL + CELL/2, 12, 4, 3);
        } else {
            return die();
        }
    }

    const ate = (hx === foodX && hy === foodY);
    const atePU = puFieldActive && hx === puFieldX && hy === puFieldY;

    if (!ate) {
        occ[occI(snkX[snkLen-1], snkY[snkLen-1])] = 0;
        for (let i = snkLen - 1; i > 0; i--) {
            snkX[i] = snkX[i-1]; snkY[i] = snkY[i-1];
        }
    } else {
        for (let i = snkLen; i > 0; i--) {
            snkX[i] = snkX[i-1]; snkY[i] = snkY[i-1];
        }
        snkLen++;

        let pts = 10 * speed;
        if (puActive && puType === PU_TYPES.MULTI) pts *= 3;
        score += pts;

        emitParticles(foodX * CELL + CELL/2, foodY * CELL + CELL/2, 8, 1, 2.5);
        placeFood();
        checkLevel();
    }

    snkX[0] = hx; snkY[0] = hy;
    occ[occI(hx, hy)] = 1;

    if (atePU) collectPowerup();

    trySpawnPowerup();
    tickPowerup();
    updateHUD();
}

function checkLevel() {
    let newLevel = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (score >= LEVEL_THRESHOLDS[i]) { newLevel = i + 1; break; }
    }
    if (newLevel > level) {
        level = newLevel;
        if (mode === 'arcade' && level - 1 < OBSTACLES_PER_LEVEL.length) {
            spawnObstacles(OBSTACLES_PER_LEVEL[level - 1]);
        }
    }
}

function die() {
    state = STATE.DEAD;
    shakeFrames = 16;

    const cx = snkX[0] * CELL + CELL/2;
    const cy = snkY[0] * CELL + CELL/2;
    emitParticles(cx, cy, 20, 1, 4);
    emitParticles(cx, cy, 10, 2, 2);

    const isNew = score > bestScore;
    if (isNew) {
        bestScore = score;
        localStorage.setItem('snake-best', String(bestScore));
        dom.best.textContent = bestScore;
    }

    deathTimer = 50;
    window._isNewBest = isNew;
}

function showDeathPanel() {
    dom.dScore.textContent = score;
    dom.dLevel.textContent = level;
    dom.dLength.textContent = snkLen;
    dom.newBest.classList.toggle('hidden', !window._isNewBest);
    showPanel('death');
}

function updateHUD() {
    dom.score.textContent = score;
    dom.level.textContent = level;
    dom.length.textContent = snkLen;
}

// ── Drawing ─────────────────────────────────────────────────────
function draw(interp) {
    let sx = 0, sy = 0;
    if (shakeFrames > 0) {
        sx = ((Math.random() - 0.5) * shakeFrames * 1.2) | 0;
        sy = ((Math.random() - 0.5) * shakeFrames * 1.2) | 0;
        shakeFrames--;
    }

    ctx.save();
    ctx.translate(sx, sy);

    ctx.drawImage(gridImg, 0, 0);

    // Obstacles
    for (let i = 0; i < obsCount; i++) {
        const ox = obsX[i] * CELL;
        const oy = obsY[i] * CELL;
        ctx.fillStyle = COLOR.obstacle;
        ctx.fillRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = COLOR.obsBord;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ox + 1.5, oy + 1.5, CELL - 3, CELL - 3);
    }

    // Wrap indicators (subtle lines at edges for arcade mode)
    if (mode === 'arcade') {
        ctx.strokeStyle = 'rgba(34,197,94,0.06)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);
    }

    // Food
    const now = performance.now();
    const pulse = 1 + Math.sin(now * 0.004) * 0.08;
    const fx = foodX * CELL + CELL/2;
    const fy = foodY * CELL + CELL/2;

    ctx.fillStyle = COLOR.foodGlow;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 1.2 * pulse, 0, 6.283);
    ctx.fill();

    ctx.fillStyle = COLOR.food;
    ctx.beginPath();
    ctx.arc(fx, fy, (CELL/2 - 3) * pulse, 0, 6.283);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(fx - 1.5, fy - 2, 2, 0, 6.283);
    ctx.fill();

    // Power-up on field
    if (puFieldActive) {
        const px = puFieldX * CELL + CELL/2;
        const py = puFieldY * CELL + CELL/2;
        const puPulse = 1 + Math.sin(now * 0.006) * 0.12;
        const colors = [COLOR.speed, COLOR.shield, COLOR.multi];
        const c = colors[puFieldType];

        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(px, py, CELL * 1.3 * puPulse, 0, 6.283);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = c;
        ctx.beginPath();

        if (puFieldType === PU_TYPES.SPEED) {
            // Lightning bolt shape
            const s = (CELL/2 - 3) * puPulse;
            ctx.moveTo(px - s*0.3, py - s);
            ctx.lineTo(px + s*0.5, py - s*0.1);
            ctx.lineTo(px, py + s*0.1);
            ctx.lineTo(px + s*0.3, py + s);
            ctx.lineTo(px - s*0.5, py + s*0.1);
            ctx.lineTo(px, py - s*0.1);
        } else if (puFieldType === PU_TYPES.SHIELD) {
            // Diamond
            const s = (CELL/2 - 2) * puPulse;
            ctx.moveTo(px, py - s);
            ctx.lineTo(px + s*0.7, py);
            ctx.lineTo(px, py + s);
            ctx.lineTo(px - s*0.7, py);
        } else {
            // Star (multiplier)
            const s = (CELL/2 - 3) * puPulse;
            for (let j = 0; j < 5; j++) {
                const a1 = (j * 72 - 90) * Math.PI / 180;
                const a2 = ((j * 72) + 36 - 90) * Math.PI / 180;
                ctx.lineTo(px + Math.cos(a1) * s, py + Math.sin(a1) * s);
                ctx.lineTo(px + Math.cos(a2) * s * 0.45, py + Math.sin(a2) * s * 0.45);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    // Snake
    const t = (state === STATE.PLAYING) ? Math.min(interp, 1) : 1;

    for (let i = snkLen - 1; i >= 0; i--) {
        let sx2, sy2;
        if (state === STATE.PLAYING) {
            // Handle wrap interpolation
            let dx = snkX[i] - prvX[i];
            let dy = snkY[i] - prvY[i];
            if (mode === 'arcade') {
                if (dx > COLS/2) dx -= COLS;
                else if (dx < -COLS/2) dx += COLS;
                if (dy > ROWS/2) dy -= ROWS;
                else if (dy < -ROWS/2) dy += ROWS;
            }
            sx2 = (prvX[i] + dx * t) * CELL + CELL/2;
            sy2 = (prvY[i] + dy * t) * CELL + CELL/2;
        } else {
            sx2 = snkX[i] * CELL + CELL/2;
            sy2 = snkY[i] * CELL + CELL/2;
        }

        const frac = i / snkLen;
        const r = CELL/2 - 1 - frac * 2.5;

        if (i === 0) {
            ctx.fillStyle = hasShield ? COLOR.shield : COLOR.head;
        } else if (frac < 0.3) {
            ctx.fillStyle = COLOR.body;
        } else if (frac < 0.65) {
            ctx.fillStyle = COLOR.bodyMid;
        } else {
            ctx.fillStyle = COLOR.tail;
        }

        // Rounded rect segment
        const h2 = r;
        ctx.beginPath();
        ctx.moveTo(sx2 - h2 + 3, sy2 - h2);
        ctx.arcTo(sx2 + h2, sy2 - h2, sx2 + h2, sy2 + h2, 3);
        ctx.arcTo(sx2 + h2, sy2 + h2, sx2 - h2, sy2 + h2, 3);
        ctx.arcTo(sx2 - h2, sy2 + h2, sx2 - h2, sy2 - h2, 3);
        ctx.arcTo(sx2 - h2, sy2 - h2, sx2 + h2, sy2 - h2, 3);
        ctx.fill();

        // Head details
        if (i === 0) {
            ctx.fillStyle = COLOR.bg;
            const ex1 = sx2 + dirX*4 + dirY*3.5;
            const ey1 = sy2 + dirY*4 + dirX*3.5;
            const ex2 = sx2 + dirX*4 - dirY*3.5;
            const ey2 = sy2 + dirY*4 - dirX*3.5;
            ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, 6.283); ctx.fill();
            ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, 6.283); ctx.fill();
        }
    }

    // Shield glow around head
    if (hasShield && snkLen > 0) {
        const hpx = (state === STATE.PLAYING)
            ? (prvX[0] + (snkX[0]-prvX[0]) * t) * CELL + CELL/2
            : snkX[0] * CELL + CELL/2;
        const hpy = (state === STATE.PLAYING)
            ? (prvY[0] + (snkY[0]-prvY[0]) * t) * CELL + CELL/2
            : snkY[0] * CELL + CELL/2;
        ctx.save();
        ctx.strokeStyle = COLOR.shield;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + Math.sin(now * 0.008) * 0.2;
        ctx.beginPath();
        ctx.arc(hpx, hpy, CELL/2 + 3, 0, 6.283);
        ctx.stroke();
        ctx.restore();
    }

    drawParticles();
    ctx.drawImage(vigImg, 0, 0);
    ctx.restore();
}

// ── Panel Management ────────────────────────────────────────────
function showPanel(id) {
    dom.menu.classList.add('hidden');
    dom.death.classList.add('hidden');
    dom.pause.classList.add('hidden');
    $(id).classList.remove('hidden');
    dom.overlay.style.opacity = '1';
    dom.overlay.style.pointerEvents = 'auto';
}

function hideOverlay() {
    dom.overlay.style.opacity = '0';
    dom.overlay.style.pointerEvents = 'none';
}

// ── Main Loop ───────────────────────────────────────────────────
function loop(now) {
    requestAnimationFrame(loop);

    if (state === STATE.MENU) {
        draw(1);
        return;
    }

    if (state === STATE.PAUSED) {
        tickParticles();
        draw(1);
        return;
    }

    if (state === STATE.DEAD) {
        tickParticles();
        draw(1);
        if (deathTimer > 0 && --deathTimer === 0) showDeathPanel();
        return;
    }

    // STATE.PLAYING
    if (!lastFrame) lastFrame = now;
    const dt = now - lastFrame;
    lastFrame = now;
    tickAccum += dt;

    const step = TICK_MS[speed] * (puActive && puType === PU_TYPES.SPEED ? 0.65 : 1);

    if (tickAccum > step * 4) tickAccum = step;

    while (tickAccum >= step) {
        for (let i = 0; i < snkLen; i++) { prvX[i] = snkX[i]; prvY[i] = snkY[i]; }
        gameTick();
        tickAccum -= step;
        if (state !== STATE.PLAYING) break;
    }

    const interp = state === STATE.PLAYING ? tickAccum / step : 1;
    tickParticles();
    draw(interp);
}

// ── Input ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        if (state === STATE.PLAYING) {
            state = STATE.PAUSED;
            showPanel('pause');
        } else if (state === STATE.PAUSED) {
            state = STATE.PLAYING;
            hideOverlay();
            lastFrame = performance.now();
            tickAccum = 0;
        }
        return;
    }

    if (state !== STATE.PLAYING) return;
    switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); inpPush(0,-1); break;
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); inpPush(0, 1); break;
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); inpPush(-1,0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); inpPush(1, 0); break;
    }
});

// Touch controls
document.querySelectorAll('.t-btn').forEach(btn => {
    const fn = e => {
        e.preventDefault();
        if (state !== STATE.PLAYING) return;
        const d = btn.dataset.dir;
        if (d === 'up')    inpPush(0,-1);
        if (d === 'down')  inpPush(0, 1);
        if (d === 'left')  inpPush(-1,0);
        if (d === 'right') inpPush(1, 0);
    };
    btn.addEventListener('touchstart', fn, { passive: false });
    btn.addEventListener('mousedown', fn);
});

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        mode = btn.dataset.mode;
    });
});

// Speed buttons
document.querySelectorAll('.spd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        speed = parseInt(btn.dataset.spd, 10);
    });
});

// Play
function startGame() {
    init();
    hideOverlay();
    state = STATE.PLAYING;
    lastFrame = null;
    tickAccum = 0;
}

$('play-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', () => {
    dom.death.classList.add('hidden');
    dom.menu.classList.remove('hidden');
    startGame();
});

// ── Swipe gestures on canvas ────────────────────────────────────
let touchStartX = 0, touchStartY = 0;
const SWIPE_THRESHOLD = 20;

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (state === STATE.PAUSED) {
        state = STATE.PLAYING;
        hideOverlay();
        lastFrame = performance.now();
        tickAccum = 0;
        return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

    if (absDx > absDy) {
        inpPush(dx > 0 ? 1 : -1, 0);
    } else {
        inpPush(0, dy > 0 ? 1 : -1);
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });

// ── Boot ────────────────────────────────────────────────────────
init();
showPanel('menu');
draw(1);
requestAnimationFrame(loop);

// ── Hero canvas particle animation ──────────────────────────────
(function heroAnim() {
    const hc = document.getElementById('hero-bg');
    if (!hc) return;
    const hctx = hc.getContext('2d');
    const W = hc.width, H = hc.height;

    const DOTS = Array.from({ length: 28 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        a: 0.15 + Math.random() * 0.35,
    }));

    function tick() {
        hctx.clearRect(0, 0, W, H);
        for (const d of DOTS) {
            d.x += d.vx; d.y += d.vy;
            if (d.x < 0) d.x = W;
            if (d.x > W) d.x = 0;
            if (d.y < 0) d.y = H;
            if (d.y > H) d.y = 0;
            hctx.beginPath();
            hctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            hctx.fillStyle = `rgba(34,197,94,${d.a})`;
            hctx.fill();
        }
        // draw faint grid lines
        hctx.strokeStyle = 'rgba(34,197,94,0.04)';
        hctx.lineWidth = 1;
        for (let x = 0; x < W; x += 20) {
            hctx.beginPath(); hctx.moveTo(x, 0); hctx.lineTo(x, H); hctx.stroke();
        }
        for (let y = 0; y < H; y += 20) {
            hctx.beginPath(); hctx.moveTo(0, y); hctx.lineTo(W, y); hctx.stroke();
        }
        requestAnimationFrame(tick);
    }
    tick();
})();

// ── Show best score on menu if set ──────────────────────────────
(function showMenuBest() {
    const best = parseInt(localStorage.getItem('snake-best') || '0', 10);
    const wrap = document.getElementById('hero-best-wrap');
    const val  = document.getElementById('hero-best');
    if (wrap && val && best > 0) {
        val.textContent = best;
        wrap.style.display = 'flex';
    }
})();

// ── Service worker ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    }).then(() => {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }).then(() => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

})();
