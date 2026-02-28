// ============================================================
//  BUBBLE POP 2D — 8 Levels, Player Bird + Click
// ============================================================
const C = document.getElementById('c');
const X = C.getContext('2d');
let W, H;
function resize() { W = C.width = innerWidth; H = C.height = innerHeight; }
resize(); addEventListener('resize', resize);

// ---- State ----
let state = 'menu'; // menu|playing|transition|win|gameover
let level = 1, score = 0, lvlScore = 0, lives = 3, elapsed = 0;
let combo = 0, comboTimer = 0, maxCombo = 0;
let speedMul = 1;
let isNight = false, dayPhase = 0, windX = 0, nightAlpha = 0;
let birdConsec = 0;
let activePU = null; // {type, timer}
// REMOVED: let bgScrollX = 0; // parallax auto-scroll offset
let treeGrowth = 0; // trees grow 0→1 across levels

// ---- Input ----
const keys = {};
let mouseX = W / 2, mouseY = H / 2;
let mouseClicked = false;
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);
C.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
C.addEventListener('click', e => { mouseX = e.clientX; mouseY = e.clientY; mouseClicked = true; });
C.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; mouseX = t.clientX; mouseY = t.clientY; mouseClicked = true; }, { passive: false });

// ---- Player bird ----
let player = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, wingT: 0, size: 28, speed: 320, dashTimer: 0, power: 0, trail: [], beakOpen: 0, shakeT: 0, gnatsEaten: 0, shield: 0 };

// ---- Objects ----
let bubbles = [], enemyBirds = [], gnats = [], floatTexts = [], fragments = [];
let fires = [], waterDrops = [], mice = [], steamParts = [], gnatBubs = [], rainDrops = [], worms = [];
let bossBird = null, bossTimer = 0;
let superPower = 0;
let dino = null; // { x, y, vx, hp, t, shaking, shakeT, state }
let fireRound = 1; // level 8: round 1 = ground fires, round 2 = fireballs from sky
let fireballs = []; // { x, y, vx, vy, r, t }
let wingsBurned = 0; // 0=fine, >0 = singed (limits altitude)

// ---- Parallax layers ----
let clouds = [], mountains = [], treesLayer = [];
// Nest system: eggs hatch into chicks, chicks need feeding, shield protects
let nest = {
    x: 0, y: 0, treeIdx: 0,
    eggs: 3,           // start with 3 eggs
    chicks: [],        // [{hungry, fed, hp, t}]
    shield: 0,         // shield HP (0=none, decays over time)
    shieldMax: 200,
    feedRadius: 50,    // how close player must be to feed
    carryingGnat: false, // player picked up a gnat to deliver
    carryingWorm: false  // worm feeds chick more
};

// ---- Timers ----
let tmrBub = 0, tmrBird = 0, tmrGnat = 0, tmrMouse = 0, tmrGnatBub = 0, tmrWorm = 0;
let transitionTimer = 0, transitionText = '', transitionDesc = '';
let lastTime = 0;

// ---- Level features ----
function has(f) {
    const m = { gnats: 2, traps: 2, night: 3, chick1: 4, gold: 4, chick2: 5, chain: 5, boss: 6, storm: 7, fire: 8, dino: 9 };
    return level >= (m[f] || 99);
}

// ---- Audio ----
let actx = null;
function initA() { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
function snd(f, fe, d, t, v) {
    if (!actx) return; const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination); o.type = t || 'sine';
    o.frequency.setValueAtTime(f, actx.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(fe, 20), actx.currentTime + d);
    g.gain.setValueAtTime(v || .1, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + d);
    o.start(); o.stop(actx.currentTime + d);
}

// ============================================================
//  PARALLAX BACKGROUND
// ============================================================
function initParallax() {
    clouds = [];
    for (let i = 0; i < 8; i++) clouds.push({ x: R(0, W), y: R(40, H * 0.3), w: R(80, 200), speed: R(0.2, 0.6), opacity: R(0.5, 0.9) });
    mountains = [];
    // Back range (dark, slow)
    for (let i = 0; i < 7; i++) mountains.push({ x: i * (W / 5) - W * 0.1, w: R(200, 350), h: R(120, 220), color: '#556677', speed: 0.05, layer: 0 });
    // Front range (lighter, faster)
    for (let i = 0; i < 6; i++) mountains.push({ x: i * (W / 4) - W * 0.05, w: R(150, 280), h: R(80, 150), color: '#778899', speed: 0.15, layer: 1 });
    treesLayer = [];
    for (let i = 0; i < 14; i++) treesLayer.push({ x: R(0, W), baseH: R(40, 80), w: R(20, 35), growOff: R(0, 1) });
    // Nest is now on the fixed foreground tree (right side)
    nest.x = W - 145;
    nest.y = H * 0.75 - H * 0.67 * 0.55;
}

function lerpColor(day, night, t) {
    // parse hex to rgb, lerp, return string
    const d = [parseInt(day.slice(1,3),16), parseInt(day.slice(3,5),16), parseInt(day.slice(5,7),16)];
    const n = [parseInt(night.slice(1,3),16), parseInt(night.slice(3,5),16), parseInt(night.slice(5,7),16)];
    const r = Math.round(d[0] + (n[0]-d[0]) * t), g = Math.round(d[1] + (n[1]-d[1]) * t), b = Math.round(d[2] + (n[2]-d[2]) * t);
    return `rgb(${r},${g},${b})`;
}

function drawBackground(dt) {
    const na = nightAlpha; // 0=day, 1=night, smooth

    // Sky gradient (smooth lerp)
    const grad = X.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, lerpColor('#4488cc', '#0a0a2e', na));
    grad.addColorStop(0.4, lerpColor('#87CEEB', '#151540', na));
    grad.addColorStop(0.7, lerpColor('#B0E0FF', '#1a2a4a', na));
    grad.addColorStop(1, lerpColor('#c8e8ff', '#1a2a4a', na));
    X.fillStyle = grad; X.fillRect(0, 0, W, H);

    // Sun fades out, Moon fades in
    if (na < 0.95) {
        // Sun
        X.save(); X.globalAlpha = (1 - na) * 1;
        const sg = X.createRadialGradient(W - 100, 70, 10, W - 100, 70, 55);
        sg.addColorStop(0, 'rgba(255,255,200,1)'); sg.addColorStop(0.5, 'rgba(255,255,100,0.4)'); sg.addColorStop(1, 'rgba(255,200,50,0)');
        X.fillStyle = sg; X.beginPath(); X.arc(W - 100, 70, 55, 0, Math.PI * 2); X.fill();
        X.restore();
    }
    if (na > 0.05) {
        // Moon + stars
        X.save(); X.globalAlpha = na * 0.9;
        X.fillStyle = '#eeeedd';
        X.beginPath(); X.arc(W - 100, 70, 30, 0, Math.PI * 2); X.fill();
        // Stars
        X.globalAlpha = na * 0.3;
        for (let i = 0; i < 50; i++) {
            const sx = (i * 137.5 + 42) % W, sy = (i * 73.7 + 11) % (H * 0.4); // deterministic so they don't flicker
            const twinkle = 0.5 + Math.sin(elapsed * 2 + i) * 0.5;
            X.globalAlpha = na * 0.15 * twinkle;
            X.beginPath(); X.arc(sx, sy, 1.2, 0, Math.PI * 2); X.fill();
        }
        X.restore();
    }
    // Sunset/sunrise glow when na between 0.2-0.6
    if (na > 0.1 && na < 0.7) {
        const glowA = 1 - Math.abs(na - 0.35) / 0.35;
        X.save(); X.globalAlpha = glowA * 0.35;
        const sunsetGrad = X.createLinearGradient(0, H * 0.3, 0, H * 0.7);
        sunsetGrad.addColorStop(0, 'rgba(255,120,50,0)'); sunsetGrad.addColorStop(0.5, 'rgba(255,80,30,0.4)'); sunsetGrad.addColorStop(1, 'rgba(255,40,20,0)');
        X.fillStyle = sunsetGrad; X.fillRect(0, H * 0.2, W, H * 0.5);
        X.restore();
    }

    // Clouds (scroll with bg)
    clouds.forEach(c => {
        c.x += (c.speed + windX * 0.02) * dt * 60;
        if (c.x > W + 100) c.x = -c.w;
        if (c.x < -c.w - 50) c.x = W + 50;
        X.save(); X.globalAlpha = c.opacity * (1 - na * 0.7);
        X.fillStyle = lerpColor('#ffffff', '#334455', na);
        drawCloudShape(c.x, c.y, c.w);
        X.restore();
    });

    // Mountains (back — slow scroll)
    const seaY = H * 0.75;
    mountains.filter(m => m.layer === 0).forEach(m => {
        m.x += (m.speed * windX * 0.01) * dt * 60;
        if (m.x > W + m.w) m.x = -m.w;
        if (m.x < -m.w * 1.5) m.x = W;
        X.fillStyle = lerpColor(m.color, '#223344', na);
        drawMountain(m.x, seaY, m.w, m.h);
    });
    // Mountains (front — faster scroll)
    mountains.filter(m => m.layer === 1).forEach(m => {
        m.x += (m.speed * windX * 0.01) * dt * 60;
        if (m.x > W + m.w) m.x = -m.w;
        if (m.x < -m.w * 1.5) m.x = W;
        X.fillStyle = lerpColor(m.color, '#2a3a4a', na);
        drawMountain(m.x, seaY, m.w, m.h);
    });

    // Tree line (static background trees)
    treesLayer.forEach(t => {
        const growFactor = 1 + treeGrowth * (0.5 + t.growOff * 0.5);
        const h = t.baseH * growFactor;
        X.fillStyle = lerpColor('#2a6a2a', '#0a1a0a', na);
        drawTreeShape(t.x, seaY, t.w, h);
    });

    // ---- BIG FOREGROUND NEST TREE (right side, 2/3 screen height) ----
    const treeShake = (dino && dino.shaking) ? Math.sin(elapsed * 40) * 5 : 0;
    const nestTreeX = W - 90 + treeShake;  // right side (shakes when dino attacks)
    const nestTreeW = 60;              // trunk width
    const nestTreeH = H * 0.67;        // 2/3 of screen
    const nestTreeBase = seaY;
    // Big trunk
    const bigTrunkW = nestTreeW * (0.25 + treeGrowth * 0.1);
    X.fillStyle = lerpColor('#4a2a10', '#2a1a0a', na);
    X.fillRect(nestTreeX - bigTrunkW / 2, nestTreeBase - nestTreeH * 0.5, bigTrunkW, nestTreeH * 0.5);
    // Bark texture
    X.strokeStyle = lerpColor('#3a1a08', '#1a0a04', na);
    X.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const by = nestTreeBase - nestTreeH * 0.5 + i * nestTreeH * 0.06;
        X.beginPath();
        X.moveTo(nestTreeX - bigTrunkW * 0.3, by);
        X.quadraticCurveTo(nestTreeX, by + 5, nestTreeX + bigTrunkW * 0.3, by + 2);
        X.stroke();
    }
    // Branch going left where nest sits
    const branchY = nestTreeBase - nestTreeH * 0.55;
    X.strokeStyle = lerpColor('#4a2a10', '#2a1a0a', na);
    X.lineWidth = bigTrunkW * 0.35;
    X.beginPath();
    X.moveTo(nestTreeX, branchY);
    X.quadraticCurveTo(nestTreeX - 50, branchY - 10, nestTreeX - 80, branchY + 5);
    X.stroke();
    // Big canopy layers
    X.fillStyle = lerpColor('#2a7a2a', '#0a1a0a', na);
    const cLayers = treeGrowth > 0.3 ? 4 : 2;
    for (let l = 0; l < cLayers; l++) {
        const cy = nestTreeBase - nestTreeH * (0.45 + l * 0.14);
        const cw = nestTreeW * (2.2 - l * 0.35);
        const ch = nestTreeH * (0.18 - l * 0.02);
        X.beginPath();
        X.moveTo(nestTreeX - cw * 0.5, cy);
        X.lineTo(nestTreeX, cy - ch);
        X.lineTo(nestTreeX + cw * 0.5, cy);
        X.closePath(); X.fill();
    }
    // Update nest position on the branch
    nest.x = nestTreeX - 55;
    nest.y = branchY - 2;
    drawNest(nest.x, nest.y, 35);

    // Ground strip
    X.fillStyle = lerpColor('#5a9a3a', '#1a2a1a', na);
    X.fillRect(0, seaY, W, 15);
    X.fillStyle = lerpColor('#c8b878', '#1a1a0a', na);
    X.fillRect(0, seaY + 12, W, 5);

    // Sea
    const seaTop = seaY + 15;
    const seaGrad = X.createLinearGradient(0, seaTop, 0, H);
    seaGrad.addColorStop(0, lerpColor('#2299cc', '#0a2a4a', na));
    seaGrad.addColorStop(1, lerpColor('#0a5577', '#051525', na));
    X.fillStyle = seaGrad; X.fillRect(0, seaTop, W, H - seaTop);

    // Sea waves
    X.strokeStyle = na > 0.5 ? `rgba(100,150,200,${0.1 + (1-na)*0.2})` : `rgba(255,255,255,${0.15 + (1-na)*0.15})`;
    X.lineWidth = 1.5;
    for (let row = 0; row < 4; row++) {
        X.beginPath();
        const wy = seaTop + 15 + row * 25;
        for (let x = 0; x < W; x += 5) {
            const y = wy + Math.sin((x + elapsed * 80 + row * 50) * 0.02) * 4;
            x === 0 ? X.moveTo(x, y) : X.lineTo(x, y);
        }
        X.stroke();
    }
}

function drawCloudShape(x, y, w) {
    X.beginPath();
    X.ellipse(x + w * 0.5, y, w * 0.4, w * 0.18, 0, 0, Math.PI * 2); X.fill();
    X.beginPath();
    X.ellipse(x + w * 0.25, y + w * 0.05, w * 0.28, w * 0.15, 0, 0, Math.PI * 2); X.fill();
    X.beginPath();
    X.ellipse(x + w * 0.72, y + w * 0.03, w * 0.25, w * 0.14, 0, 0, Math.PI * 2); X.fill();
}

function drawMountain(x, baseY, w, h) {
    X.beginPath();
    X.moveTo(x, baseY); X.lineTo(x + w * 0.5, baseY - h); X.lineTo(x + w, baseY);
    X.closePath(); X.fill();
    // Snow cap
    if (h > 140) {
        X.save(); X.fillStyle = isNight ? '#aabbcc' : '#eef';
        X.beginPath(); X.moveTo(x + w * 0.4, baseY - h * 0.7);
        X.lineTo(x + w * 0.5, baseY - h); X.lineTo(x + w * 0.6, baseY - h * 0.7); X.closePath(); X.fill();
        X.restore();
    }
}

function drawTreeShape(x, baseY, w, h) {
    // Trunk (gets thicker with growth)
    const tw = w * (0.15 + treeGrowth * 0.08);
    X.save();
    X.fillStyle = lerpColor('#5a3a1a', '#2a1a0a', nightAlpha);
    X.fillRect(x + w * 0.5 - tw / 2, baseY - h * 0.35, tw, h * 0.35);
    X.restore();
    // Canopy layers (fuller with growth)
    const layers = treeGrowth > 0.5 ? 3 : treeGrowth > 0.2 ? 2 : 1;
    for (let l = 0; l < layers; l++) {
        const ly = baseY - h * (0.3 + l * 0.25);
        const lw = w * (1.1 - l * 0.2);
        const lh = h * (0.35 - l * 0.05);
        X.beginPath();
        X.moveTo(x + w * 0.5 - lw * 0.5, ly);
        X.lineTo(x + w * 0.5, ly - lh);
        X.lineTo(x + w * 0.5 + lw * 0.5, ly);
        X.closePath(); X.fill();
    }
}

function drawNest(x, y, w) {
    X.save();

    // Shield dome (green, semi-transparent)
    if (nest.shield > 0) {
        const sa = Math.min(nest.shield / nest.shieldMax, 1);
        X.save();
        X.globalAlpha = sa * 0.25 + Math.sin(elapsed * 3) * 0.05;
        const sg = X.createRadialGradient(x, y - 10, 5, x, y - 10, w * 1.2);
        sg.addColorStop(0, 'rgba(50,255,50,0.1)'); sg.addColorStop(0.7, 'rgba(50,255,50,0.15)'); sg.addColorStop(1, 'rgba(50,255,50,0)');
        X.fillStyle = sg;
        X.beginPath(); X.arc(x, y - 10, w * 1.2, 0, Math.PI * 2); X.fill();
        // Shield ring
        X.strokeStyle = `rgba(50,255,100,${sa * 0.5})`;
        X.lineWidth = 2;
        X.beginPath(); X.arc(x, y - 10, w * 1.1, 0, Math.PI * 2); X.stroke();
        X.restore();
    }

    // Nest base (brown woven bowl)
    X.fillStyle = lerpColor('#8B6914', '#4a3508', nightAlpha);
    X.beginPath();
    X.ellipse(x, y, w * 0.6, w * 0.22, 0, 0, Math.PI * 2);
    X.fill();
    // Straw rim
    X.strokeStyle = lerpColor('#a07828', '#604818', nightAlpha);
    X.lineWidth = 1.5;
    X.beginPath(); X.ellipse(x, y - 2, w * 0.6, w * 0.12, 0, Math.PI, Math.PI * 2); X.stroke();
    // Straw texture
    X.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
        X.beginPath();
        X.moveTo(x - w * 0.45 + i * w * 0.2, y - 1);
        X.quadraticCurveTo(x - w * 0.2 + i * w * 0.15, y - w * 0.12, x + w * 0.1 + i * w * 0.08, y + 1);
        X.stroke();
    }

    // Eggs (remaining ones)
    const eggPositions = [[-6, -4], [0, -5], [6, -3]];
    for (let i = 0; i < nest.eggs; i++) {
        const ep = eggPositions[i];
        X.fillStyle = '#f5f0e0';
        X.strokeStyle = '#d8d0c0';
        X.lineWidth = 0.5;
        X.beginPath(); X.ellipse(x + ep[0], y + ep[1], 3.5, 5, ep[0] * 0.03, 0, Math.PI * 2);
        X.fill(); X.stroke();
        // Speckles
        X.fillStyle = '#c8b8a0';
        X.beginPath(); X.arc(x + ep[0] - 1, y + ep[1] - 1, 0.8, 0, Math.PI * 2); X.fill();
        X.beginPath(); X.arc(x + ep[0] + 1.5, y + ep[1] + 1, 0.6, 0, Math.PI * 2); X.fill();
    }

    // Chicks
    nest.chicks.forEach((ch, ci) => {
        ch.t += 0.016;
        const grown = ch.grown || false;
        const sz = grown ? 1.6 : 1; // grown chicks are 60% bigger
        const cx = x + (ci === 0 ? -10 * sz : ci === 1 ? 10 * sz : 0);
        const cy = y - 8 * sz;
        const sleeping = isNight;
        const bob = sleeping ? 0 : Math.sin(ch.t * 3 + ci) * 1.5;

        // Body (fluffy yellow, bigger if grown)
        X.fillStyle = grown ? '#eebb33' : '#ffdd44';
        X.beginPath(); X.arc(cx, cy + bob, 5 * sz, 0, Math.PI * 2); X.fill();
        // Head
        X.fillStyle = grown ? '#ddcc44' : '#ffee66';
        X.beginPath(); X.arc(cx + (ci === 0 ? -2 : 2) * sz, cy - 4 * sz + bob, 3.5 * sz, 0, Math.PI * 2); X.fill();
        // Grown chick wing feathers
        if (grown) {
            X.fillStyle = '#ccaa22';
            X.save(); X.translate(cx, cy + bob);
            X.rotate(Math.sin(ch.t * 2 + ci) * 0.15);
            X.beginPath(); X.ellipse(ci === 0 ? -5 : 5, -1, 6, 3, ci === 0 ? -0.3 : 0.3, 0, Math.PI * 2); X.fill();
            X.restore();
        }

        if (sleeping) {
            // Sleeping — closed eyes, zzz
            X.strokeStyle = '#333';
            X.lineWidth = 1;
            const ex = cx + (ci === 0 ? -3 : 3) * sz;
            X.beginPath(); X.moveTo(ex - 1.5 * sz, cy - 4.5 * sz); X.lineTo(ex + 1.5 * sz, cy - 4.5 * sz); X.stroke();
            X.font = `${8 * sz}px Arial`; X.fillStyle = '#aaddff'; X.globalAlpha = 0.6 + Math.sin(ch.t * 2) * 0.3;
            X.fillText('z', cx + (ci === 0 ? -10 : 10) * sz, cy - 10 * sz + Math.sin(ch.t) * 3);
            X.globalAlpha = 1;
        } else {
            // Awake — eyes
            X.fillStyle = '#111';
            const ex = cx + (ci === 0 ? -3.5 : 3.5) * sz;
            X.beginPath(); X.arc(ex, cy - 4.5 * sz + bob, 1 * sz, 0, Math.PI * 2); X.fill();
            // Beak (bigger for grown)
            X.fillStyle = '#ff8800';
            const bdir = ci === 0 ? -1 : 1;
            X.beginPath(); X.moveTo(cx + bdir * 4 * sz, cy - 4 * sz + bob);
            X.lineTo(cx + bdir * 7 * sz, cy - 3.5 * sz + bob + (ch.hungry > 3 ? Math.sin(ch.t * 10) * 1.5 * sz : 0));
            X.lineTo(cx + bdir * 4 * sz, cy - 2.5 * sz + bob); X.closePath(); X.fill();
            // Hungry indicator — open beak, chirping
            if (ch.hungry > 3 && !sleeping) {
                X.font = `${9 * sz}px Arial`; X.fillStyle = '#ff6600';
                X.textAlign = 'center';
                X.fillText('!', cx, cy - 14 * sz + bob);
            }
        }

        // HP indicator (tiny hearts)
        for (let h = 0; h < ch.hp; h++) {
            X.fillStyle = '#ff4466';
            X.font = `${6 * sz}px Arial`;
            X.fillText('♥', cx - 4 * sz + h * 5 * sz, cy + 9 * sz);
        }
    });

    X.restore();
}

// ============================================================
//  DRAW: PLAYER BIRD (blue hero bird)
// ============================================================
function drawPlayerBird() {
    const p = player;
    const s = p.size;
    p.wingT += 0.3;

    // Trail
    X.save();
    p.trail.forEach((t, i) => {
        X.globalAlpha = t.life * 0.3;
        X.fillStyle = '#44aaff';
        X.beginPath(); X.arc(t.x, t.y, 4, 0, Math.PI * 2); X.fill();
    });
    X.restore();

    X.save();
    X.translate(p.x, p.y);
    const dir = p.vx > 1 ? 1 : p.vx < -1 ? -1 : (p.angle > 0 ? 1 : -1);
    X.scale(dir, 1);

    // Glow
    X.save(); X.globalAlpha = 0.15;
    X.fillStyle = '#44aaff';
    X.beginPath(); X.arc(0, 0, s * 1.5, 0, Math.PI * 2); X.fill();
    X.restore();

    // Body (bright blue)
    X.fillStyle = '#3388ee';
    X.beginPath(); X.ellipse(0, 0, s * 0.7, s * 0.5, 0, 0, Math.PI * 2); X.fill();
    X.strokeStyle = '#2266bb'; X.lineWidth = 1.5; X.stroke();

    // Wing
    const wingAngle = Math.sin(p.wingT * 0.8) * 0.6;
    X.save(); X.rotate(wingAngle);
    X.fillStyle = '#2277dd';
    X.beginPath(); X.ellipse(-s * 0.1, -s * 0.3, s * 0.5, s * 0.2, -0.3, 0, Math.PI * 2); X.fill();
    X.restore();

    // Head
    X.fillStyle = '#44aaff';
    X.beginPath(); X.arc(s * 0.4, -s * 0.15, s * 0.3, 0, Math.PI * 2); X.fill();

    // Eye (big, cute)
    X.fillStyle = '#fff';
    X.beginPath(); X.arc(s * 0.5, -s * 0.25, s * 0.15, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#111';
    X.beginPath(); X.arc(s * 0.55, -s * 0.25, s * 0.08, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#fff';
    X.beginPath(); X.arc(s * 0.57, -s * 0.28, s * 0.03, 0, Math.PI * 2); X.fill();

    // Beak (orange, animated open/close)
    const bo = p.beakOpen; // 0=closed, 1=wide open
    X.fillStyle = '#ff9900';
    // Upper beak
    X.beginPath(); X.moveTo(s * 0.65, -s * 0.15);
    X.lineTo(s * 1.1, -s * 0.05 - bo * s * 0.15);
    X.lineTo(s * 0.65, -s * 0.02 - bo * s * 0.04); X.closePath(); X.fill();
    // Lower beak
    X.fillStyle = '#dd7700';
    X.beginPath(); X.moveTo(s * 0.65, -s * 0.02 + bo * s * 0.04);
    X.lineTo(s * 1.05, -s * 0.02 + bo * s * 0.18);
    X.lineTo(s * 0.65, s * 0.05 + bo * s * 0.06); X.closePath(); X.fill();
    // Tongue when open
    if (bo > 0.5) {
        X.fillStyle = '#ff5566';
        X.beginPath(); X.ellipse(s * 0.8, -s * 0.01 + bo * s * 0.04, s * 0.08, s * 0.03, 0, 0, Math.PI * 2); X.fill();
    }

    // Crown (golden)
    X.fillStyle = '#ffd700';
    for (let i = 0; i < 3; i++) {
        X.beginPath();
        const cx = s * 0.3 + i * s * 0.12;
        X.moveTo(cx - 4, -s * 0.4); X.lineTo(cx, -s * 0.6); X.lineTo(cx + 4, -s * 0.4); X.closePath(); X.fill();
    }

    // Tail
    X.fillStyle = '#2266bb';
    X.beginPath(); X.moveTo(-s * 0.6, 0); X.lineTo(-s * 1, -s * 0.2); X.lineTo(-s * 0.9, s * 0.1); X.closePath(); X.fill();

    X.restore();

    // "YOU" label above
    X.save();
    X.fillStyle = '#44aaff';
    X.font = 'bold 14px Arial';
    X.textAlign = 'center';
    X.globalAlpha = 0.6 + Math.sin(elapsed * 3) * 0.3;
    X.fillText('▼ YOU', p.x, p.y - s - 10);
    X.restore();

    // Carrying gnat/worm indicator
    if (nest.carryingGnat) {
        X.save();
        if (nest.carryingWorm) {
            // Worm in beak
            X.fillStyle = '#cc7766';
            const wx = p.x + (p.vx > 0 ? s * 0.9 : -s * 0.9);
            for (let i = 0; i < 3; i++) {
                X.beginPath(); X.arc(wx + i * 3, p.y - 2 + Math.sin(elapsed * 8 + i) * 1, 2.5, 0, Math.PI * 2); X.fill();
            }
        } else {
            // Gnat in beak
            X.fillStyle = '#3a3a20';
            X.beginPath(); X.arc(p.x + (p.vx > 0 ? s * 0.9 : -s * 0.9), p.y - 2, 3, 0, Math.PI * 2); X.fill();
            X.fillStyle = 'rgba(200,220,255,0.5)';
            X.beginPath(); X.ellipse(p.x + (p.vx > 0 ? s * 0.7 : -s * 0.7), p.y - 6, 5, 2, 0, 0, Math.PI * 2); X.fill();
        }
        // Arrow pointing to nest
        X.strokeStyle = '#ffee44'; X.lineWidth = 1.5; X.globalAlpha = 0.5 + Math.sin(elapsed * 5) * 0.3;
        const nx = nest.x - p.x, ny = nest.y - p.y, nd = Math.hypot(nx, ny) || 1;
        X.beginPath(); X.moveTo(p.x + nx / nd * 30, p.y + ny / nd * 30);
        X.lineTo(p.x + nx / nd * 50, p.y + ny / nd * 50); X.stroke();
        X.restore();
    }

    // Player shield dome (blue)
    if (p.shield > 0) {
        X.save();
        const sa = Math.min(p.shield / 200, 1);
        X.globalAlpha = sa * 0.2 + Math.sin(elapsed * 4) * 0.05;
        X.strokeStyle = `rgba(80,160,255,${sa * 0.6})`;
        X.lineWidth = 2;
        X.beginPath(); X.arc(p.x, p.y, s * 1.8, 0, Math.PI * 2); X.stroke();
        X.fillStyle = `rgba(80,160,255,${sa * 0.08})`;
        X.fill();
        X.restore();
    }
}

// ============================================================
//  DRAW: ENEMY BIRDS (red/dark, different breed)
// ============================================================
function drawEnemyBird(b) {
    const s = b.size * (1 + (b.power - 1) * 0.1);
    X.save();
    X.translate(b.x, b.y);
    X.scale(b.vx > 0 ? 1 : -1, 1);

    // Body (dark red/maroon — clearly enemy)
    X.fillStyle = b.color;
    X.beginPath(); X.ellipse(0, 0, s * 0.6, s * 0.45, 0, 0, Math.PI * 2); X.fill();
    X.strokeStyle = '#4a0000'; X.lineWidth = 1; X.stroke();

    // Wing
    const wA = Math.sin(b.wingT) * 0.5;
    X.save(); X.rotate(wA);
    X.fillStyle = b.darkColor;
    X.beginPath(); X.ellipse(-s * 0.1, -s * 0.25, s * 0.45, s * 0.18, -0.3, 0, Math.PI * 2); X.fill();
    X.restore();

    // Head
    X.fillStyle = b.color;
    X.beginPath(); X.arc(s * 0.35, -s * 0.1, s * 0.25, 0, Math.PI * 2); X.fill();

    // Angry eyes (red, slanted)
    X.fillStyle = '#ff0';
    X.beginPath(); X.arc(s * 0.42, -s * 0.2, s * 0.1, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#a00';
    X.beginPath(); X.arc(s * 0.45, -s * 0.2, s * 0.05, 0, Math.PI * 2); X.fill();
    // Angry eyebrow
    X.strokeStyle = '#400'; X.lineWidth = 2;
    X.beginPath(); X.moveTo(s * 0.3, -s * 0.32); X.lineTo(s * 0.55, -s * 0.28); X.stroke();

    // Beak (sharp, dark)
    X.fillStyle = '#884400';
    X.beginPath(); X.moveTo(s * 0.55, -s * 0.1); X.lineTo(s * 0.95, 0); X.lineTo(s * 0.55, s * 0.08); X.closePath(); X.fill();

    // Spiky tail
    X.fillStyle = b.darkColor;
    X.beginPath(); X.moveTo(-s * 0.5, 0); X.lineTo(-s * 0.9, -s * 0.25);
    X.lineTo(-s * 0.7, 0); X.lineTo(-s * 0.95, s * 0.15); X.lineTo(-s * 0.5, s * 0.05); X.closePath(); X.fill();

    // Sleeping (night)
    if (b.sleeping) {
        X.font = `${s * 0.5}px Arial`; X.fillStyle = '#fff'; X.globalAlpha = 0.7;
        X.fillText('💤', s * 0.3, -s * 0.4);
    }

    X.restore();
}

// ============================================================
//  DRAW: BUBBLES
// ============================================================
function drawBubble(b) {
    if (b.pop) {
        X.save(); X.globalAlpha = 1 - b.pT;
        X.beginPath(); X.arc(b.x, b.y, b.r * (1 + b.pT * 0.5), 0, Math.PI * 2);
        X.strokeStyle = 'rgba(255,255,255,0.5)'; X.lineWidth = 1; X.stroke();
        X.restore(); return;
    }
    X.save();
    const grad = X.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
    if (b.isGold) {
        grad.addColorStop(0, 'rgba(255,255,150,0.6)'); grad.addColorStop(0.5, 'rgba(255,215,0,0.35)'); grad.addColorStop(1, 'rgba(200,150,0,0.1)');
    } else if (b.isTrap) {
        grad.addColorStop(0, 'rgba(80,80,80,0.5)'); grad.addColorStop(0.5, 'rgba(30,30,30,0.4)'); grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    } else if (b.isGreen) {
        grad.addColorStop(0, 'rgba(150,255,150,0.6)'); grad.addColorStop(0.5, 'rgba(50,200,50,0.4)'); grad.addColorStop(1, 'rgba(0,150,0,0.15)');
    } else if (b.isBlue) {
        grad.addColorStop(0, 'rgba(150,200,255,0.6)'); grad.addColorStop(0.5, 'rgba(50,120,255,0.4)'); grad.addColorStop(1, 'rgba(0,80,200,0.15)');
    } else {
        const glow = isNight ? 0.5 : 0.15;
        grad.addColorStop(0, `rgba(255,255,255,0.4)`); grad.addColorStop(0.5, `hsla(${b.hue},60%,${isNight ? 60 : 80}%,0.3)`); grad.addColorStop(1, `hsla(${b.hue},40%,60%,${glow})`);
    }
    X.fillStyle = grad;
    X.beginPath(); X.arc(b.x, b.y, b.r, 0, Math.PI * 2); X.fill();
    // Shield icon inside green/blue bubbles
    if (b.isGreen) { X.fillStyle = 'rgba(0,200,0,0.5)'; X.font = `${b.r * 0.8}px Arial`; X.textAlign = 'center'; X.fillText('🛡', b.x, b.y + b.r * 0.3); }
    if (b.isBlue) { X.fillStyle = 'rgba(50,120,255,0.5)'; X.font = `${b.r * 0.8}px Arial`; X.textAlign = 'center'; X.fillText('🛡', b.x, b.y + b.r * 0.3); }
    // Rim
    X.strokeStyle = b.isTrap ? 'rgba(100,0,100,0.3)' : b.isGold ? 'rgba(255,215,0,0.5)' : b.isGreen ? 'rgba(0,200,0,0.5)' : b.isBlue ? 'rgba(50,120,255,0.5)' : 'rgba(255,255,255,0.3)';
    X.lineWidth = 1.5; X.stroke();
    // Highlight
    X.fillStyle = 'rgba(255,255,255,0.7)';
    X.beginPath(); X.ellipse(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.15, b.r * 0.1, -0.5, 0, Math.PI * 2); X.fill();
    X.restore();
}

// ============================================================
//  DRAW: GNATS (detailed buzzing insects)
// ============================================================
function drawGnat(g) {
    X.save();
    X.translate(g.x, g.y);
    const buzz = Math.sin(g.t * 35) * 0.4; // fast wing buzz
    const bob = Math.sin(g.t * 6) * 2; // gentle bobbing
    X.translate(0, bob);

    // Glow aura (yellow-green energy)
    X.globalAlpha = 0.15 + Math.sin(g.t * 8) * 0.08;
    const glow = X.createRadialGradient(0, 0, 0, 0, 0, 14);
    glow.addColorStop(0, 'rgba(200,255,50,0.5)'); glow.addColorStop(1, 'rgba(200,255,50,0)');
    X.fillStyle = glow;
    X.beginPath(); X.arc(0, 0, 14, 0, Math.PI * 2); X.fill();
    X.globalAlpha = 1;

    // Wings (transparent, fluttering fast)
    X.save();
    X.globalAlpha = 0.35 + Math.abs(buzz) * 0.3;
    X.fillStyle = 'rgba(200,220,255,0.7)';
    X.strokeStyle = 'rgba(150,180,220,0.5)';
    X.lineWidth = 0.5;
    // Left wing
    X.save(); X.rotate(-0.3 + buzz);
    X.beginPath(); X.ellipse(-5, -4, 8, 4, -0.5, 0, Math.PI * 2); X.fill(); X.stroke();
    X.restore();
    // Right wing
    X.save(); X.rotate(0.3 - buzz);
    X.beginPath(); X.ellipse(5, -4, 8, 4, 0.5, 0, Math.PI * 2); X.fill(); X.stroke();
    X.restore();
    X.restore();

    // Body (3-segment insect)
    // Abdomen (back)
    X.fillStyle = '#3a3a20';
    X.beginPath(); X.ellipse(-2, 2, 4, 3, 0.2, 0, Math.PI * 2); X.fill();
    // Thorax (middle)
    X.fillStyle = '#2a2a15';
    X.beginPath(); X.ellipse(1, 0, 3.5, 2.8, 0, 0, Math.PI * 2); X.fill();
    // Head
    X.fillStyle = '#222';
    X.beginPath(); X.arc(5, -1, 2.5, 0, Math.PI * 2); X.fill();

    // Eyes (red, compound)
    X.fillStyle = '#ff3300';
    X.beginPath(); X.arc(6.5, -2, 1.2, 0, Math.PI * 2); X.fill();
    X.beginPath(); X.arc(6.5, 0, 1, 0, Math.PI * 2); X.fill();

    // Antennae
    X.strokeStyle = '#555';
    X.lineWidth = 0.7;
    X.beginPath(); X.moveTo(6, -3); X.quadraticCurveTo(9, -8 + Math.sin(g.t * 12) * 2, 11, -6); X.stroke();
    X.beginPath(); X.moveTo(7, -2); X.quadraticCurveTo(11, -7 + Math.cos(g.t * 12) * 2, 13, -4); X.stroke();

    // Legs (3 pairs, thin)
    X.strokeStyle = '#444';
    X.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
        const lx = -2 + i * 2.5, jig = Math.sin(g.t * 15 + i * 2) * 1.5;
        X.beginPath(); X.moveTo(lx, 2); X.lineTo(lx - 3, 6 + jig); X.stroke();
        X.beginPath(); X.moveTo(lx, 2); X.lineTo(lx + 3, 6 - jig); X.stroke();
    }

    X.restore();
}

// ============================================================
//  GAME LOGIC
// ============================================================
function startGame() {
    if (!actx) initA();
    state = 'playing'; level = 1; score = 0; lvlScore = 0; lives = 3; elapsed = 0;
    combo = 0; comboTimer = 0; maxCombo = 0; speedMul = 1; isNight = false; dayPhase = 0; windX = 0;
    birdConsec = 0; activePU = null; bossBird = null; bossTimer = 0; superPower = 0; treeGrowth = 0; nightAlpha = 0;
    player.x = W / 2; player.y = H * 0.4; player.vx = 0; player.vy = 0; player.trail = []; player.power = 0; player.beakOpen = 0; player.shakeT = 0; player.gnatsEaten = 0; player.size = 28; player.shield = 0;
    bubbles = []; enemyBirds = []; gnats = []; floatTexts = []; fragments = [];
    fires = []; waterDrops = []; mice = []; steamParts = []; gnatBubs = []; worms = []; fireballs = [];
    tmrBub = 0; tmrBird = 0; tmrGnat = 0; tmrWorm = 0;
    dino = null; fireRound = 1; wingsBurned = 0;
    nest.eggs = 3; nest.chicks = []; nest.shield = 0; nest.carryingGnat = false; nest.carryingWorm = false;
    initParallax();
    addFloatText('🫧 Level 1: Pop the Bubbles!', W / 2, H / 2, '#fff', 2, 'big');
    // Start jingle
    snd(440, 660, .1, 'sine', .06); setTimeout(()=>snd(550, 880, .1, 'sine', .06), 80); setTimeout(()=>snd(660, 990, .15, 'sine', .08), 160);
}

function nextLevel() {
    level++; lvlScore = 0;
    if (level > 9) { doWin(); return; }
    const titles = { 2: '🪰 Lv.2: Gnats + Traps', 3: '🌙 Lv.3: Night Cycle', 4: '🐣 Lv.4: A Chick Hatches!', 5: '🐣🐣 Lv.5: Second Chick!', 6: '🦅 Lv.6: BOSS', 7: '⛈️ Lv.7: Storm', 8: '🔥 Lv.8: Fire!', 9: '🦖 FINALE: Dinosaur Attack!' };
    state = 'transition'; transitionTimer = 99; transitionText = titles[level] || ''; // waits for click
    // Level up fanfare
    snd(523, 784, .15, 'sine', .08); setTimeout(() => snd(659, 988, .15, 'sine', .08), 100); setTimeout(() => snd(784, 1175, .2, 'sine', .1), 200);
    // Hatch chicks
    if (level === 4 && nest.chicks.length < 1) {
        nest.eggs--; nest.chicks.push({ hungry: 0, fed: 0, hp: 3, t: 0 });
        setTimeout(() => addFloatText('🐣 Chick hatched! Feed it gnats!', W / 2, H / 2 + 50, '#ffee44', 3, 'big'), 2600);
    }
    if (level === 5 && nest.chicks.length < 2) {
        nest.eggs--; nest.chicks.push({ hungry: 0, fed: 0, hp: 3, t: 0 });
        setTimeout(() => addFloatText('🐣 Another chick! Protect them!', W / 2, H / 2 + 50, '#ffee44', 3, 'big'), 2600);
    }
    // Level 8: setup fire (fires spawn when player clicks to continue)
    if (level === 8) {
        enemyBirds = []; gnats = []; bubbles = [];
        if (bossBird) { bossBird = null; }
        spawnAllFires();
    }
    // Level 9: dino attack — chicks grow, worms appear, no mouse clicking
    if (level === 9) {
        fires = []; waterDrops = []; mice = []; gnatBubs = [];
        // Chicks grow up (bigger, hungrier)
        nest.chicks.forEach(ch => { ch.grown = true; ch.hungry = 0; ch.hp = Math.max(ch.hp, 3); });
        // Third egg hatches too
        if (nest.eggs > 0 && nest.chicks.length < 3) {
            nest.eggs--; nest.chicks.push({ hungry: 0, fed: 0, hp: 3, t: 0, grown: true });
        }
        dino = null; // will spawn after a delay
    }
}

function doWin() { state = 'win'; saveLB(); snd(523,1047,.2,'sine',.08); setTimeout(()=>snd(659,1318,.2,'sine',.08),100); setTimeout(()=>snd(784,1568,.3,'sine',.1),200); setTimeout(()=>snd(1047,2093,.4,'sine',.12),350); }
function doGameOver() { state = 'gameover'; saveLB(); snd(400,100,.4,'sawtooth',.1); setTimeout(()=>snd(300,80,.4,'sawtooth',.08),200); setTimeout(()=>snd(200,60,.5,'sawtooth',.1),400); }

// ---- Leaderboard ----
const LBK = 'bp2d_lb';
function getLB() { try { return JSON.parse(localStorage.getItem(LBK)) || []; } catch { return []; } }
function saveLB() {
    const lb = getLB(); lb.push({ score, combo: maxCombo, level, date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) });
    lb.sort((a, b) => b.score - a.score); if (lb.length > 10) lb.length = 10; localStorage.setItem(LBK, JSON.stringify(lb));
}

// ============================================================
//  SPAWN FUNCTIONS
// ============================================================
function spawnBubble() {
    const r = R(18, 42);
    const roll = Math.random();
    const isGold = has('gold') && roll < 0.06;
    const isTrap = has('traps') && !isGold && roll < 0.12;
    // Green shield bubble (for nest) — from level 4 when chicks exist
    const isGreen = !isGold && !isTrap && has('chick1') && nest.chicks.length > 0 && roll > 0.92;
    // Blue shield bubble (for player) — from level 4
    const isBlue = !isGold && !isTrap && !isGreen && has('chick1') && roll > 0.88 && roll <= 0.92;
    const seaY = H * 0.75 + 15;
    bubbles.push({
        x: R(r, W - r), y: seaY + r + 10, r, hue: isGreen ? 140 : isBlue ? 210 : R(0, 360),
        speedY: R(0.8, 1.8), wobbleAmp: R(0.3, 1.5), wobbleSpd: R(1.5, 3), wobbleOff: R(0, 6.28),
        t: 0, pop: false, pT: 0, isGold, isTrap, isGreen, isBlue,
    });
}

const ENEMY_BREEDS = [
    { color: '#aa2222', darkColor: '#661111', name: 'red' },
    { color: '#8B0000', darkColor: '#4a0000', name: 'maroon' },
    { color: '#663399', darkColor: '#331166', name: 'purple' },
    { color: '#2e4a1a', darkColor: '#1a2a0a', name: 'dark-green' },
    { color: '#554400', darkColor: '#332200', name: 'brown' },
];

function spawnEnemyBird() {
    const breed = ENEMY_BREEDS[Math.floor(Math.random() * ENEMY_BREEDS.length)];
    const side = Math.random() > 0.5 ? 1 : -1;
    enemyBirds.push({
        x: side > 0 ? -40 : W + 40, y: R(50, H * 0.6),
        vx: -side * R(1.5, 3.5), vy: R(-0.5, 0.5), size: R(18, 26),
        color: breed.color, darkColor: breed.darkColor,
        wingT: R(0, 6), flapSpd: R(6, 12), t: 0, stateT: 0,
        state: 'wander', target: -1, power: 1, sleeping: false,
    });
}

function spawnGnat() {
    gnats.push({ x: R(20, W - 20), y: R(40, H * 0.6), vx: R(-1, 1), vy: R(-0.5, 0.5), t: R(0, 100), life: 12 });
}

// Level 8
function spawnAllFires() {
    fires = [];
    for (let i = 0; i < 8; i++) {
        fires.push({ x: R(60, W - 60), y: H * 0.6 + R(-40, 40), hp: 100, dead: false, t: R(0, 10) });
    }
}

function addFloatText(text, x, y, color, dur, cls) {
    floatTexts.push({ text, x, y, color, life: dur || 1.2, maxLife: dur || 1.2, cls: cls || '' });
}

// ============================================================
//  UPDATE: LEVELS 1-7
// ============================================================
function updateBubbleLevels(dt) {
    elapsed += dt;
    speedMul = 1 + elapsed * 0.01;
    const slowF = (activePU && activePU.type === 'slow') ? 0.4 : 1;

    // Combo timer
    if (combo > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; } }
    // Powerup timer
    if (activePU) { activePU.timer -= dt; if (activePU.timer <= 0) activePU = null; }

    // Night cycle (lvl 3+) — smooth transition, longer night
    if (has('night')) {
        const cycleDur = 70; // full cycle seconds (was 55)
        dayPhase = (elapsed % cycleDur) / cycleDur;
        // Night zone: 0.55-0.88 (33% of cycle = ~23s night vs ~8s before)
        const was = isNight;
        isNight = dayPhase > 0.55 && dayPhase < 0.88;
        if (isNight && !was) addFloatText('🌙 NIGHTFALL...', W / 2, H / 2, '#aaddff', 2, 'big');
        if (!isNight && was) { addFloatText('☀️ Dawn!', W / 2, H / 2, '#ffdd44', 2, 'big'); snd(400, 800, .3, 'sine', .04); }
        // Smooth nightAlpha: ramp up/down over 5% of cycle (~3.5s)
        const ramp = 0.05;
        if (dayPhase < 0.55) nightAlpha = Math.max(nightAlpha - dt * 1.2, 0);
        else if (dayPhase < 0.55 + ramp) nightAlpha = Math.min((dayPhase - 0.55) / ramp, 1);
        else if (dayPhase < 0.88 - ramp) nightAlpha = 1;
        else if (dayPhase < 0.88) nightAlpha = Math.max(1 - (dayPhase - (0.88 - ramp)) / ramp, 0);
        else nightAlpha = Math.max(nightAlpha - dt * 1.2, 0);
    } else { nightAlpha = 0; }
    // Storm (lvl 7+) — wind + rain + lightning
    if (has('storm')) {
        windX = Math.sin(elapsed * 0.3) * 3 + Math.sin(elapsed * 0.7) * 2;
        if (Math.random() < 0.0008) { addFloatText('⚡', R(100, W - 100), R(50, 200), '#fff', 0.5, 'big'); snd(100, 30, 0.4, 'sawtooth', 0.15); }
        // Spawn rain
        for (let r = 0; r < 3; r++) rainDrops.push({ x: R(-20, W + 20), y: -5, vy: R(12, 20), len: R(8, 18) });
    } else { windX = 0; rainDrops = []; }
    // Update rain
    for (let i = rainDrops.length - 1; i >= 0; i--) {
        rainDrops[i].x += windX * 2; rainDrops[i].y += rainDrops[i].vy;
        if (rainDrops[i].y > H) rainDrops.splice(i, 1);
    }
    if (rainDrops.length > 200) rainDrops.splice(0, rainDrops.length - 200);

    // REMOVED: background auto-scroll (bgScrollX removed)

    // Tree growth: gradually from 0 (lvl 1) to 1 (lvl 7+)
    treeGrowth = Math.min((level - 1) / 6, 1);

    // Spawns
    tmrBub += dt; if (tmrBub > 0.7 / Math.min(speedMul, 3)) { tmrBub = 0; spawnBubble(); }
    tmrBird += dt; if (tmrBird > 3.5 && enemyBirds.length < Math.min(3 + level, 8)) { tmrBird = 0; spawnEnemyBird(); }
    if (has('gnats')) { tmrGnat += dt; if (tmrGnat > 2 && gnats.length < 12) { tmrGnat = 0; spawnGnat(); } }
    if (has('boss')) { bossTimer += dt; if (!bossBird && bossTimer > 20) { bossTimer = 0; spawnBoss2D(); } }

    // ---- PLAYER BIRD ----
    const spd = player.speed * dt;
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= spd * 0.15;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += spd * 0.15;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= spd * 0.15;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += spd * 0.15;

    player.vx *= 0.92; player.vy *= 0.92;
    player.x += player.vx; player.y += player.vy;
    player.x = Math.max(30, Math.min(W - 30, player.x));
    player.y = Math.max(30, Math.min(H * 0.75, player.y));

    // Trail
    if (Math.abs(player.vx) > 0.5 || Math.abs(player.vy) > 0.5) {
        player.trail.push({ x: player.x, y: player.y, life: 0.4 });
    }
    for (let i = player.trail.length - 1; i >= 0; i--) { player.trail[i].life -= dt; if (player.trail[i].life <= 0) player.trail.splice(i, 1); }

    // Beak position (needed for proximity checks)
    const frozen = (activePU && activePU.type === 'freeze') || isNight;
    const beakX = player.x + (player.vx > 0 ? player.size * 0.8 : -player.size * 0.8);
    const beakY = player.y;

    // Beak open logic: open when near gnat or bubble
    let wantBeakOpen = false;
    if (has('gnats')) {
        for (const g of gnats) { if (dist(player.x, player.y, g.x, g.y) < 55) { wantBeakOpen = true; break; } }
    }
    if (!wantBeakOpen) {
        for (const b of bubbles) { if (!b.pop && dist(beakX, beakY, b.x, b.y) < b.r + 20) { wantBeakOpen = true; break; } }
    }
    // Smooth beak animation
    if (wantBeakOpen) player.beakOpen = Math.min(player.beakOpen + dt * 8, 1);
    else player.beakOpen = Math.max(player.beakOpen - dt * 5, 0);

    // Player bird eats gnats — or picks up to carry to chicks
    if (has('gnats')) {
        const hungryChick = nest.chicks.find(ch => ch.hungry > 2);
        for (let i = gnats.length - 1; i >= 0; i--) {
            if (dist(player.x, player.y, gnats[i].x, gnats[i].y) < 30) {
                player.beakOpen = 1;
                snd(1200, 600, .08, 'sine', .06);
                gnats.splice(i, 1);

                if (hungryChick && !nest.carryingGnat) {
                    // Pick up gnat to carry to nest
                    nest.carryingGnat = true;
                    addFloatText('🪰 Carry to nest!', player.x, player.y - 30, '#ffee44', 1);
                } else {
                    // Normal eat — power up
                    player.power += 0.5; player.speed = Math.min(player.speed + 10, 500);
                    player.gnatsEaten++;
                    addFloatText('⚡+power', player.x, player.y - 20, '#ffee00', 0.8);
                    snd(1500, 900, .06, 'triangle', .04);
                    // Bird grows if all lives + enough gnats eaten
                    if (lives >= 3 && player.gnatsEaten >= 5) {
                        const newSize = Math.min(28 + Math.floor(player.gnatsEaten / 5) * 4, 50);
                        if (newSize > player.size) {
                            player.size = newSize;
                            addFloatText('🐦 GROW!', player.x, player.y - 40, '#44ffaa', 1.2, 'big');
                            snd(400, 800, .2, 'sine', .06);
                        }
                    }
                }
            }
        }
    }
    // Shrink back if lost a life
    if (lives < 3 && player.size > 28) {
        player.size = Math.max(player.size - dt * 10, 28);
    }

    // Screen shake decay
    if (player.shakeT > 0) player.shakeT -= dt;

    // Player bird pops bubbles (beak contact)
    for (let i = 0; i < bubbles.length; i++) {
        if (bubbles[i].pop) continue;
        if (dist(beakX, beakY, bubbles[i].x, bubbles[i].y) < bubbles[i].r + 8) {
            player.beakOpen = 1; // snap beak open on pop
            popBubble2D(i, false);
        }
    }

    // REMOVED: Mouse click pops bubbles (arrows-only mode)
    // if (mouseClicked) {
    //     mouseClicked = false;
    //     for (let i = 0; i < bubbles.length; i++) {
    //         if (bubbles[i].pop) continue;
    //         if (dist(mouseX, mouseY, bubbles[i].x, bubbles[i].y) < bubbles[i].r + 5) {
    //             popBubble2D(i, false); break;
    //         }
    //     }
    // }
    if (mouseClicked) mouseClicked = false;

    // ---- UPDATE BUBBLES ----
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        if (b.pop) { b.pT += dt * 3; if (b.pT >= 1) { bubbles.splice(i, 1); } continue; }
        b.y -= b.speedY * speedMul * slowF * dt * 60;
        b.x += Math.sin(b.t * b.wobbleSpd + b.wobbleOff) * b.wobbleAmp + windX * 0.5 * dt * 60;
        // REMOVED: Magnet power-up (removed from game)
        // if (activePU && activePU.type === 'magnet') {
        //     const dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy);
        //     if (d > 10) { b.x += dx / d * 2; b.y += dy / d * 2; }
        // }
        if (b.y < -b.r * 2 || b.x < -50 || b.x > W + 50) bubbles.splice(i, 1);
    }

    // ---- UPDATE GNATS ----
    for (let i = gnats.length - 1; i >= 0; i--) {
        const g = gnats[i]; g.t += dt; g.life -= dt;
        g.vx += (Math.random() - 0.5) * 8 * dt; g.vy += (Math.random() - 0.5) * 6 * dt;
        const len = Math.hypot(g.vx, g.vy); if (len > 2) { g.vx *= 2 / len; g.vy *= 2 / len; }
        g.x += g.vx * dt * 60; g.y += g.vy * dt * 60;
        if (g.x < 10 || g.x > W - 10) g.vx *= -1;
        if (g.y < 30 || g.y > H * 0.7) g.vy *= -1;
        if (g.life <= 0) gnats.splice(i, 1);
    }

    // ---- UPDATE ENEMY BIRDS ----
    for (let i = enemyBirds.length - 1; i >= 0; i--) {
        const b = enemyBirds[i]; b.t += dt; b.stateT += dt;
        b.wingT += b.flapSpd * dt;
        b.sleeping = frozen;

        if (frozen) { b.y += Math.sin(b.t * 0.5) * 0.3; continue; }

        // Eat gnats
        if (has('gnats')) {
            for (let gi = gnats.length - 1; gi >= 0; gi--) {
                if (dist(b.x, b.y, gnats[gi].x, gnats[gi].y) < b.size) {
                    b.power += 0.3; b.flapSpd = Math.min(b.flapSpd + 0.5, 18);
                    gnats.splice(gi, 1); addFloatText('⚡', b.x, b.y - 20, '#ff4400', 0.6);
                }
            }
        }

        // Collision with player bird = penalty + knockback
        const collDist = (b.size + player.size) * 0.6;
        if (dist(b.x, b.y, player.x, player.y) < collDist && b.state !== 'scared') {
            // Shield absorbs hit
            if (player.shield > 0) {
                player.shield -= 30;
                addFloatText('🛡 Blocked!', player.x, player.y - 30, '#44aaff', 0.8);
                snd(800, 400, .1, 'sine', .06);
            } else {
                // Penalty
                const penalty = 5 + level;
                score = Math.max(0, score - penalty); lvlScore = Math.max(0, lvlScore - penalty);
                combo = 0;
                addFloatText(`-${penalty}💥`, player.x, player.y - 30, '#ff4444', 1, 'neg');
                snd(250, 100, .25, 'sawtooth', .1);
            }
            // Knockback both
            const dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy) || 1;
            player.vx += (dx / d) * 8; player.vy += (dy / d) * 6;
            b.state = 'scared'; b.stateT = 0;
            b.vx = (b.x - player.x) > 0 ? R(4, 7) : R(-7, -4);
            b.vy = R(-3, -1);
            // Screen shake effect
            player.shakeT = 0.3;
        } else if (dist(b.x, b.y, player.x, player.y) < 60 && b.state !== 'scared') {
            // Just scare them away without collision
            b.state = 'scared'; b.stateT = 0;
            b.vx = (b.x - player.x) > 0 ? R(3, 6) : R(-6, -3);
            b.vy = R(-3, -1);
        }

        switch (b.state) {
            case 'wander':
                b.vx += (Math.random() - 0.5) * 2 * dt * 60; b.vy += (Math.random() - 0.5) * dt * 60;
                b.vx = clamp(b.vx, -3 - b.power * 0.3, 3 + b.power * 0.3);
                b.vy = clamp(b.vy, -1.5, 1.5);
                b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
                if (b.y < 40) b.vy += 2 * dt * 60; if (b.y > H * 0.65) b.vy -= 2 * dt * 60;
                if (b.x < -40 || b.x > W + 40) { b.vx *= -1; b.x = clamp(b.x, -39, W + 39); }
                if (b.stateT > 2 + Math.random() * 3) {
                    const valid = bubbles.map((bb, idx) => (!bb.pop && !bb.isTrap) ? idx : -1).filter(idx => idx >= 0);
                    if (valid.length) { b.target = valid[Math.floor(Math.random() * valid.length)]; b.state = 'approach'; b.stateT = 0; }
                }
                break;
            case 'approach': {
                const tgt = bubbles[b.target];
                if (!tgt || tgt.pop) { b.state = 'wander'; b.stateT = 0; break; }
                const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy);
                const spd = 3 + b.power;
                b.vx += (dx / d) * spd * dt * 60 * 0.1; b.vy += (dy / d) * spd * dt * 60 * 0.1;
                b.vx = clamp(b.vx, -spd, spd); b.vy = clamp(b.vy, -spd, spd);
                b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
                if (d < b.size + 5) { popBubble2D(b.target, true); b.state = 'celebrate'; b.stateT = 0; }
                if (b.stateT > 8) { b.state = 'wander'; b.stateT = 0; }
                break;
            }
            case 'celebrate':
                b.y -= 1.5 * dt * 60;
                if (b.stateT > 0.6) { b.state = 'wander'; b.stateT = 0; }
                break;
            case 'scared':
                b.x += b.vx * dt * 60; b.y += b.vy * dt * 60; b.vy += 3 * dt;
                if (b.stateT > 1.5) { b.state = 'wander'; b.stateT = 0; }
                break;
        }

        if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) enemyBirds.splice(i, 1);
    }

    // Boss
    if (bossBird) updateBoss2D(dt);

    // ---- NEST / CHICKS UPDATE ----
    updateNest(dt);

    // Level check
    if (lvlScore >= 100) nextLevel();
}

function popBubble2D(idx, byBird) {
    const b = bubbles[idx]; if (!b || b.pop) return; b.pop = true; b.pT = 0;
    // Fragments
    for (let i = 0; i < 6; i++) fragments.push({ x: b.x, y: b.y, vx: R(-4, 4), vy: R(-5, 1), r: R(2, 4), life: 0.6, color: b.isGold ? '#ffd700' : `hsl(${b.hue},60%,70%)` });

    if (!byBird) {
        if (b.isTrap) { score = Math.max(0, score - 10); lvlScore = Math.max(0, lvlScore - 10); combo = 0; snd(300, 80, .3, 'square', .1); addFloatText('-10!', b.x, b.y, '#ff2222', 1, 'neg'); birdConsec = 0; return; }
        // Green bubble = nest shield
        if (b.isGreen) { nest.shield = Math.min(nest.shield + 100, nest.shieldMax); addFloatText('🛡 Nest Shield!', b.x, b.y - 20, '#44ff88', 1.5, 'big'); snd(500, 900, .15, 'sine', .08); score += 3; lvlScore += 3; return; }
        // Blue bubble = player shield
        if (b.isBlue) { player.shield = Math.min(player.shield + 100, 200); addFloatText('🛡 Bird Shield!', b.x, b.y - 20, '#44aaff', 1.5, 'big'); snd(600, 1000, .15, 'sine', .08); score += 3; lvlScore += 3; return; }
        birdConsec = 0; combo++; comboTimer = 2; if (combo > maxCombo) maxCombo = combo;
        const mul = combo >= 10 ? 5 : combo >= 7 ? 4 : combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
        const pts = (b.r < 28 ? 5 : 3) * mul; score += pts; lvlScore += pts;
        snd(800 + Math.random() * 400, 200, .15, 'sine', .12); if (mul > 1) snd(600, 1400, .18, 'triangle', .08);
        addFloatText(mul > 1 ? `+${pts}(x${mul})` : `+${pts}`, b.x, b.y - 20, mul >= 3 ? '#ffd700' : '#44ff88', 1, mul >= 3 ? 'big' : '');
        if (b.isGold) activatePU2D(b.x, b.y);
        if (has('chain') && mul >= 4) chainReact2D(b.x, b.y, idx);
    } else {
        birdConsec++; combo = 0; snd(1800, 600, .1, 'sawtooth', .04);
        addFloatText('💥', b.x, b.y, '#ff8844', 0.8);
        if (birdConsec >= 5) { birdConsec = 0; lives--; snd(400, 100, .5, 'sawtooth', .12); addFloatText('💔', W / 2, H / 2, '#ff0000', 1.5, 'big'); if (lives <= 0) doGameOver(); }
    }
}

function chainReact2D(px, py, src) {
    snd(1000, 2000, .12, 'sine', .07); let n = 0;
    for (let i = 0; i < bubbles.length; i++) {
        if (i === src || bubbles[i].pop || bubbles[i].isTrap) continue;
        if (dist(px, py, bubbles[i].x, bubbles[i].y) < 80) {
            bubbles[i].pop = true; bubbles[i].pT = 0; const p = bubbles[i].r < 28 ? 3 : 2; score += p; lvlScore += p; n++;
            addFloatText('+' + p, bubbles[i].x, bubbles[i].y, '#ff88ff', 0.7);
        }
    }
    if (n) addFloatText('⛓️x' + n, px, py - 30, '#ff44ff', 1.2, 'big');
}

// ============================================================
//  NEST UPDATE — feeding, shield decay, enemy attacks
// ============================================================
function updateNest(dt) {
    if (nest.chicks.length === 0) return;

    // Shield decays over time
    if (nest.shield > 0) nest.shield -= dt * 8;
    if (nest.shield < 0) nest.shield = 0;

    // Player shield decays
    if (player.shield > 0) player.shield -= dt * 5;
    if (player.shield < 0) player.shield = 0;

    // Chicks get hungry over time (not at night — they sleep)
    // Grown chicks (level 9+) get hungry faster
    nest.chicks.forEach(ch => {
        if (!isNight) ch.hungry += dt * (ch.grown ? 1.2 : 0.6);
        // Starving penalty: hungry > 8 → lose points over time
        if (ch.hungry > 8) {
            const penalty = Math.floor(dt * 3);
            if (penalty > 0) {
                score = Math.max(0, score - penalty);
                lvlScore = Math.max(0, lvlScore - penalty);
            }
            // Show warning once when crossing threshold
            if (ch.hungry > 8 && ch.hungry - dt * (ch.grown ? 1.2 : 0.6) <= 8) {
                addFloatText('⚠️ Chick starving! -pts', nest.x, nest.y - 40, '#ff6600', 1.5, 'neg');
                snd(400, 200, .15, 'sawtooth', .06);
            }
        }
        // Starvation death: hungry > 15 → chick dies
        if (ch.hungry > 15) {
            ch.hp = 0;
            const penalty = 20;
            score = Math.max(0, score - penalty);
            lvlScore = Math.max(0, lvlScore - penalty);
            addFloatText(`-${penalty} 💀 Starved!`, nest.x, nest.y - 40, '#ff0000', 2, 'big');
            snd(200, 60, .4, 'sawtooth', .1);
            lives--;
            if (lives <= 0) doGameOver();
        }
    });

    // Player carrying gnat/worm → deliver to nest
    if (nest.carryingGnat && dist(player.x, player.y, nest.x, nest.y) < nest.feedRadius) {
        const isWorm = nest.carryingWorm;
        nest.carryingGnat = false; nest.carryingWorm = false;
        // Feed the hungriest chick
        let hungriest = null;
        nest.chicks.forEach(ch => { if (!hungriest || ch.hungry > hungriest.hungry) hungriest = ch; });
        if (hungriest) {
            hungriest.hungry = 0;
            hungriest.fed++;
            const pts = isWorm ? 15 : 8;
            score += pts; lvlScore += pts;
            addFloatText(`+${pts} ${isWorm ? '🪱' : '🐣'} Fed!`, nest.x, nest.y - 30, '#ffee44', 1.2, 'big');
            snd(900, 1400, .12, 'sine', .06);
            // Worm also heals chick +1 HP
            if (isWorm && hungriest.hp < 3) { hungriest.hp++; addFloatText('+♥', nest.x, nest.y - 50, '#ff4466', 0.8); }
        }
    }

    // Enemy birds attack unshielded chicks (random chance during 'wander')
    if (nest.shield <= 0 && !isNight) {
        for (const eb of enemyBirds) {
            if (eb.state === 'wander' && Math.random() < 0.001 && dist(eb.x, eb.y, nest.x, nest.y) < 200) {
                // Dive at nest
                eb.state = 'approach'; eb.stateT = 0;
                eb.target = -99; // special: targeting nest
            }
            // If close to nest and no shield — peck chick
            if (eb.target === -99 && dist(eb.x, eb.y, nest.x, nest.y) < 30) {
                const victim = nest.chicks[Math.floor(Math.random() * nest.chicks.length)];
                if (victim && victim.hp > 0) {
                    victim.hp--;
                    addFloatText('💥 Chick hit!', nest.x, nest.y - 25, '#ff4444', 1, 'neg');
                    snd(350, 150, .2, 'sawtooth', .08);
                    player.shakeT = 0.2;
                    if (victim.hp <= 0) {
                        const penalty = 20;
                        score = Math.max(0, score - penalty);
                        lvlScore = Math.max(0, lvlScore - penalty);
                        addFloatText(`-${penalty} 💀 Chick lost!`, nest.x, nest.y - 40, '#ff0000', 2, 'big');
                        snd(200, 60, .5, 'sawtooth', .1);
                        lives--;
                        if (lives <= 0) doGameOver();
                    }
                }
                eb.state = 'scared'; eb.stateT = 0;
                eb.vx = R(-5, 5); eb.vy = R(-4, -2);
                eb.target = -1;
            }
        }
    }
    // Remove dead chicks
    nest.chicks = nest.chicks.filter(ch => ch.hp > 0);
}

function activatePU2D(x, y) {
    const types = ['freeze', 'bomb', 'slow'];
    // REMOVED: 'magnet' from power-ups (not obvious without mouse)
    const t = types[Math.floor(Math.random() * types.length)];
    snd(500, 1100, .15, 'sine', .08);
    if (t === 'freeze') { activePU = { type: 'freeze', timer: 5 }; addFloatText('❄️ FREEZE!', x, y, '#88ddff', 1.5, 'big'); }
    else if (t === 'bomb') { addFloatText('💣 BOOM!', x, y, '#ff4444', 1.5, 'big'); bubbles.forEach((b, i) => { if (!b.pop && !b.isTrap) { score += b.r < 28 ? 5 : 3; lvlScore += b.r < 28 ? 5 : 3; b.pop = true; b.pT = 0; } }); }
    else { activePU = { type: 'slow', timer: 5 }; addFloatText('🐌 SLOW-MO!', x, y, '#aaddff', 1.5, 'big'); }
}

function spawnBoss2D() {
    bossBird = { x: -60, y: H * 0.3, hp: 3, t: 0, size: 50, popsLeft: 3, state: 'enter' };
    addFloatText('🦅 BOSS!', W / 2, H / 2, '#ff4444', 2, 'big'); snd(200, 80, .4, 'sawtooth', .15);
}
function updateBoss2D(dt) {
    const bb = bossBird; bb.t += dt;
    if (bb.state === 'enter') { bb.x += 200 * dt; if (bb.x > W * 0.3) bb.state = 'hunt'; }
    else if (bb.state === 'hunt') {
        bb.x = W * 0.5 + Math.sin(bb.t * 0.7) * W * 0.35;
        bb.y = H * 0.25 + Math.sin(bb.t * 1.2) * 80;
        // Pop nearby bubbles
        for (let i = 0; i < bubbles.length; i++) { if (!bubbles[i].pop && dist(bb.x, bb.y, bubbles[i].x, bubbles[i].y) < 60) { popBubble2D(i, true); bb.popsLeft--; if (bb.popsLeft <= 0) { bossBird = null; addFloatText('🦅 flew away...', W / 2, H * 0.3, '#aaa', 1.5); return; } } }
        if (bb.t > 15) { bossBird = null; return; }
    }
    // REMOVED: Click on boss (arrows-only mode — ram boss with player bird instead)
    // if (mouseClicked && dist(mouseX, mouseY, bb.x, bb.y) < bb.size) {
    //     bb.hp--; snd(200, 80, .2, 'sawtooth', .1); addFloatText('💥-' + (3 - bb.hp) + '/3', bb.x, bb.y - 30, '#ff4444', 1);
    //     if (bb.hp <= 0) { score += 25; lvlScore += 25; addFloatText('+25 BOSS!', bb.x, bb.y, '#44ff88', 1.5, 'big'); bossBird = null; }
    //     mouseClicked = false;
    // }
    if (mouseClicked) mouseClicked = false;
    // Player bird hit boss
    if (dist(player.x, player.y, bb.x, bb.y) < bb.size + player.size) {
        bb.hp--; snd(200, 80, .2, 'sawtooth', .1);
        if (bb.hp <= 0) { score += 25; lvlScore += 25; addFloatText('+25 BOSS!', bb.x, bb.y, '#44ff88', 1.5, 'big'); bossBird = null; }
    }
}
function drawBoss2D() {
    if (!bossBird) return;
    const bb = bossBird, s = bb.size;
    X.save(); X.translate(bb.x, bb.y);
    X.fillStyle = '#880000'; X.beginPath(); X.ellipse(0, 0, s, s * 0.7, 0, 0, Math.PI * 2); X.fill();
    X.strokeStyle = '#440000'; X.lineWidth = 3; X.stroke();
    X.fillStyle = '#aa0000'; X.beginPath(); X.arc(s * 0.5, -s * 0.2, s * 0.4, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#ff0'; X.beginPath(); X.arc(s * 0.6, -s * 0.3, 8, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#ff6600'; X.beginPath(); X.moveTo(s * 0.8, -s * 0.2); X.lineTo(s * 1.4, -s * 0.05); X.lineTo(s * 0.8, s * 0.1); X.closePath(); X.fill();
    // HP bar
    X.fillStyle = 'rgba(0,0,0,0.5)'; X.fillRect(-30, -s - 15, 60, 8);
    X.fillStyle = '#ff4444'; X.fillRect(-30, -s - 15, 60 * (bb.hp / 3), 8);
    X.restore();
}

// ============================================================
//  LEVEL 8: FIRE
// ============================================================
function updateLvl8(dt) {
    elapsed += dt;

    // Spawn bubbles (water-filled) — rising from below
    tmrBub += dt; if (tmrBub > 0.5) { tmrBub = 0; spawnBubble(); }

    // Player bird pops bubbles (beak contact) → water pours out
    const beakDir = player.vx >= 0 ? 1 : -1;
    const bkX = player.x + beakDir * player.size * 0.6;
    const bkY = player.y - 2;
    for (let i = 0; i < bubbles.length; i++) {
        if (bubbles[i].pop) continue;
        if (dist(bkX, bkY, bubbles[i].x, bubbles[i].y) < bubbles[i].r + 8) {
            player.beakOpen = 1;
            pourWaterFromBubble(bubbles[i]);
            bubbles[i].pop = true; bubbles[i].pT = 0;
            for (let j = 0; j < 4; j++) fragments.push({ x: bubbles[i].x, y: bubbles[i].y, vx: R(-3, 3), vy: R(-4, 1), r: R(2, 4), life: 0.5, color: '#4488ff' });
            score += 3; lvlScore += 3;
        }
    }
    // REMOVED: Mouse click pops bubbles → water pours out (arrows-only mode)
    // if (mouseClicked) {
    //     mouseClicked = false;
    //     for (let i = 0; i < bubbles.length; i++) {
    //         if (bubbles[i].pop) continue;
    //         if (dist(mouseX, mouseY, bubbles[i].x, bubbles[i].y) < bubbles[i].r + 5) {
    //             pourWaterFromBubble(bubbles[i]);
    //             bubbles[i].pop = true; bubbles[i].pT = 0;
    //             for (let j = 0; j < 4; j++) fragments.push({ x: bubbles[i].x, y: bubbles[i].y, vx: R(-3, 3), vy: R(-4, 1), r: R(2, 4), life: 0.5, color: '#4488ff' });
    //             score += 3; lvlScore += 3;
    //             snd(800 + Math.random() * 400, 200, .15, 'sine', .1);
    //             break;
    //         }
    //     }
    if (mouseClicked) mouseClicked = false;

    // Update bubbles (rise up, wobble)
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        if (b.pop) { b.pT += dt * 3; if (b.pT >= 1) { bubbles.splice(i, 1); } continue; }
        b.y -= b.speedY * dt * 60;
        b.x += Math.sin(b.t * b.wobbleSpd + b.wobbleOff) * b.wobbleAmp;
        if (b.y < -b.r * 2) bubbles.splice(i, 1);
    }

    // Water drops — fall down, hit fires
    for (let i = waterDrops.length - 1; i >= 0; i--) {
        const w = waterDrops[i]; w.x += w.vx * dt * 60; w.y += w.vy * dt * 60; w.vy += 5 * dt * 60; w.life -= dt;
        for (const f of fires) { if (f.dead) continue; if (dist(w.x, w.y, f.x, f.y) < 40) { f.hp -= (superPower > 0 ? 12 : 5); w.life = 0; snd(200, 80, .05, 'sine', .02); if (f.hp <= 0) { f.dead = true; score += 15; addFloatText('+15 🔥', f.x, f.y, '#44ffaa', 1.2, 'big'); snd(300, 600, .15, 'sine', .06); } } }
        if (w.life <= 0 || w.y > H) waterDrops.splice(i, 1);
    }
    if (waterDrops.length > 150) waterDrops.splice(0, waterDrops.length - 150);

    // Fires
    for (const f of fires) { f.t += dt; }
    // Mice (bonus)
    tmrMouse += dt; if (tmrMouse > 3 && mice.length < 3) { tmrMouse = 0; spawnMouse2D(); }

    // Round check
    if (fireRound === 1 && fires.length > 0 && fires.every(f => f.dead)) {
        // Round 1 complete → start Round 2!
        fireRound = 2;
        fires = []; fireballs = []; wingsBurned = 0;
        addFloatText('🔥 ROUND 2: Firestorm!', W / 2, H / 2, '#ff4444', 3, 'big');
        addFloatText('Dodge fireballs! Pop bubbles to extinguish!', W / 2, H / 2 + 45, '#ffcc44', 3);
        snd(200, 100, .3, 'sawtooth', .1);
        // Spawn new ground fires that fireballs can feed
        for (let i = 0; i < 4; i++) {
            fires.push({ x: R(60, W - 60), y: H * 0.65 + R(-20, 20), hp: 60, dead: false, t: R(0, 10) });
        }
    }

    // Round 2: fireballs rain from sky
    if (fireRound === 2) {
        // Spawn fireballs from sky
        if (Math.random() < 0.025) {
            fireballs.push({
                x: R(30, W - 30), y: -20,
                vx: R(-1, 1), vy: R(2, 4),
                r: R(8, 16), t: 0
            });
        }

        // Update fireballs
        for (let i = fireballs.length - 1; i >= 0; i--) {
            const fb = fireballs[i];
            fb.t += dt; fb.x += fb.vx * dt * 60; fb.y += fb.vy * dt * 60; fb.vy += 1.5 * dt * 60;

            // Fireball hits ground → new fire or feeds existing
            if (fb.y > H * 0.65) {
                let fedFire = false;
                for (const f of fires) {
                    if (!f.dead && dist(fb.x, fb.y, f.x, f.y) < 60) {
                        f.hp = Math.min(f.hp + 30, 150); // fire grows!
                        addFloatText('🔥+', f.x, f.y - 30, '#ff6600', 0.6);
                        fedFire = true; break;
                    }
                }
                if (!fedFire) {
                    // New fire on ground
                    fires.push({ x: fb.x, y: H * 0.65 + R(-10, 10), hp: 50, dead: false, t: R(0, 10) });
                }
                snd(150, 60, .1, 'sawtooth', .04);
                fireballs.splice(i, 1);
                continue;
            }

            // Fireball hits player → burn wings!
            if (dist(fb.x, fb.y, player.x, player.y) < fb.r + player.size * 0.6) {
                wingsBurned = Math.min(wingsBurned + 1, 3);
                player.shakeT = 0.3;
                addFloatText('🔥 Wings singed!', player.x, player.y - 40, '#ff4444', 1, 'neg');
                snd(300, 100, .2, 'sawtooth', .08);
                score = Math.max(0, score - 5); lvlScore = Math.max(0, lvlScore - 5);
                fireballs.splice(i, 1);
                continue;
            }

            // Fireball hit by water drops → extinguished in air!
            let hit = false;
            for (let wi = waterDrops.length - 1; wi >= 0; wi--) {
                if (dist(waterDrops[wi].x, waterDrops[wi].y, fb.x, fb.y) < fb.r + 6) {
                    waterDrops.splice(wi, 1);
                    hit = true; break;
                }
            }
            if (hit) {
                score += 5; lvlScore += 5;
                addFloatText('+5 💧', fb.x, fb.y, '#44aaff', 0.8);
                fireballs.splice(i, 1);
                continue;
            }

            if (fb.x < -30 || fb.x > W + 30) fireballs.splice(i, 1);
        }
        if (fireballs.length > 20) fireballs.splice(0, fireballs.length - 20);

        // Water drops extinguish burned wings
        for (let i = waterDrops.length - 1; i >= 0; i--) {
            if (wingsBurned > 0 && dist(waterDrops[i].x, waterDrops[i].y, player.x, player.y) < player.size * 1.5) {
                wingsBurned = Math.max(0, wingsBurned - 1);
                waterDrops.splice(i, 1);
                addFloatText('💧 Wings cooled!', player.x, player.y - 40, '#44aaff', 1);
                snd(800, 1200, .1, 'sine', .04);
            }
        }

        // Win round 2: all fires out + survived 30s
        if (fires.every(f => f.dead) && elapsed > 30) {
            // Check no active fireballs
            if (fireballs.length === 0 || fires.every(f => f.dead)) doWin();
        }
        // Also cap fires — too many = game over threat
        if (fires.filter(f => !f.dead).length > 12) {
            addFloatText('🔥🔥🔥 TOO MUCH FIRE!', W / 2, H / 2, '#ff0000', 2, 'big');
            lives--; snd(200, 60, .4, 'sawtooth', .1);
            if (lives <= 0) doGameOver();
            // Kill some fires to give player a chance
            let killed = 0;
            for (const f of fires) { if (!f.dead && killed < 4) { f.dead = true; killed++; } }
        }
    }

    // Beak decay
    player.beakOpen = Math.max(player.beakOpen - dt * 5, 0);

    // Player movement — altitude limited by burned wings
    const maxAlt = wingsBurned >= 3 ? H * 0.55 : wingsBurned >= 2 ? H * 0.35 : wingsBurned >= 1 ? H * 0.2 : 30;
    const spd = player.speed * dt;
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= spd * 0.15;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += spd * 0.15;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= spd * 0.15;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += spd * 0.15;
    player.vx *= 0.92; player.vy *= 0.92;
    player.x += player.vx; player.y += player.vy;
    player.x = clamp(player.x, 30, W - 30);
    player.y = clamp(player.y, maxAlt, H - 30);
    // Push player down if above burned limit
    if (player.y < maxAlt) player.y += (maxAlt - player.y) * 0.1;
}

// Pour water drops from a popped bubble — drops fall down toward fires
function pourWaterFromBubble(b) {
    const dropCount = Math.ceil(b.r / 4) + 3; // bigger bubble = more water
    for (let i = 0; i < dropCount; i++) {
        waterDrops.push({
            x: b.x + R(-b.r * 0.4, b.r * 0.4),
            y: b.y + R(-b.r * 0.3, b.r * 0.3),
            vx: R(-1.5, 1.5),
            vy: R(1, 4), // falls DOWN
            life: 2.5
        });
    }
    snd(1500, 400, .1, 'sine', .04); // splash sound
}

// REMOVED: shootWater2D — replaced by pourWaterFromBubble
function shootWater2D(tx, ty) {
}
function spawnMouse2D() {
    const s = Math.random() > 0.5 ? 1 : -1;
    mice.push({ x: s > 0 ? -30 : W + 30, y: H * 0.7 + R(-20, 20), spd: -s * R(2, 5), t: R(0, 50) });
}
function spawnGnatBub2D() {
    gnatBubs.push({ x: R(80, W - 80), y: R(H * 0.3, H * 0.6), r: R(20, 35), t: 0 });
}

// ============================================================
//  LEVEL 9: DINO ATTACK — worms, grown chicks, dinosaur
// ============================================================
function spawnWorm() {
    const seaY = H * 0.75;
    worms.push({
        x: R(40, W - 140), // avoid nest tree on right
        y: seaY - R(2, 8),
        vx: R(-0.3, 0.3),
        t: R(0, 100),
        life: 15,
        emerging: 1, // 0=underground, 1=popping out
    });
}

function drawWorm(w) {
    X.save();
    X.translate(w.x, w.y);
    const wiggle = Math.sin(w.t * 4) * 3;
    const emerge = Math.min(w.emerging, 1);
    // Body segments (pink/brown segmented worm)
    X.fillStyle = '#cc7766';
    for (let i = 0; i < 5; i++) {
        const sx = i * 5 - 10 + Math.sin(w.t * 3 + i) * 2;
        const sy = -emerge * (12 + i * 2) + wiggle * (i * 0.3);
        X.beginPath(); X.ellipse(sx, sy, 4, 3, 0, 0, Math.PI * 2); X.fill();
    }
    // Head
    X.fillStyle = '#dd8877';
    const hx = 15 + Math.sin(w.t * 3 + 5) * 2;
    const hy = -emerge * 22 + wiggle;
    X.beginPath(); X.arc(hx, hy, 4, 0, Math.PI * 2); X.fill();
    // Eyes
    X.fillStyle = '#111';
    X.beginPath(); X.arc(hx + 2, hy - 1.5, 1, 0, Math.PI * 2); X.fill();
    // Segment lines
    X.strokeStyle = '#aa5544';
    X.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
        const sx = i * 5 - 8;
        const sy = -emerge * (14 + i * 2);
        X.beginPath(); X.moveTo(sx - 3, sy); X.lineTo(sx + 3, sy); X.stroke();
    }
    // Dirt hole
    X.fillStyle = '#5a4030';
    X.beginPath(); X.ellipse(0, 2, 8, 3, 0, 0, Math.PI * 2); X.fill();
    X.restore();
}

function spawnDino() {
    const side = Math.random() > 0.5 ? 1 : -1;
    dino = {
        x: side > 0 ? -80 : W + 80,
        y: H * 0.75 - 30,
        vx: -side * 1.5,
        hp: 8,
        t: 0,
        shaking: false,
        shakeT: 0,
        state: 'walk', // walk | shake | stunned | flee
        stateT: 0,
        hits: 0, // times player pecked it
    };
}

function drawDino() {
    if (!dino) return;
    const d = dino, s = 40;
    X.save();
    X.translate(d.x, d.y);
    X.scale(d.vx > 0 ? 1 : -1, 1);

    // Shake offset
    const shOff = d.shaking ? Math.sin(d.t * 40) * 3 : 0;

    // Body (dark green, big)
    X.fillStyle = '#3a6a2a';
    X.beginPath(); X.ellipse(0 + shOff, 0, s * 1.2, s * 0.6, 0, 0, Math.PI * 2); X.fill();
    X.strokeStyle = '#2a4a1a'; X.lineWidth = 2; X.stroke();

    // Belly
    X.fillStyle = '#6a9a4a';
    X.beginPath(); X.ellipse(0 + shOff, s * 0.15, s * 0.8, s * 0.35, 0, 0, Math.PI * 2); X.fill();

    // Tail
    X.fillStyle = '#3a6a2a';
    X.beginPath();
    X.moveTo(-s * 1.1 + shOff, 0);
    X.quadraticCurveTo(-s * 1.8 + shOff, -s * 0.3, -s * 2.2 + shOff, s * 0.1);
    X.lineTo(-s * 1.1 + shOff, s * 0.2);
    X.closePath(); X.fill();
    // Tail spikes
    X.fillStyle = '#2a5a1a';
    for (let i = 0; i < 4; i++) {
        const tx = -s * (1.2 + i * 0.25) + shOff, ty = -s * 0.15 - i * 3;
        X.beginPath(); X.moveTo(tx - 4, ty + 4); X.lineTo(tx, ty - 6); X.lineTo(tx + 4, ty + 4); X.closePath(); X.fill();
    }

    // Head
    X.fillStyle = '#3a6a2a';
    X.beginPath(); X.arc(s * 0.9 + shOff, -s * 0.2, s * 0.45, 0, Math.PI * 2); X.fill();
    // Jaw
    X.fillStyle = '#4a7a3a';
    X.beginPath(); X.ellipse(s * 1.1 + shOff, s * 0.05, s * 0.35, s * 0.2, -0.1, 0, Math.PI * 2); X.fill();

    // Eye (angry)
    X.fillStyle = '#ff0';
    X.beginPath(); X.arc(s * 1.0 + shOff, -s * 0.35, 6, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#800';
    X.beginPath(); X.arc(s * 1.02 + shOff, -s * 0.35, 3, 0, Math.PI * 2); X.fill();
    // Angry brow
    X.strokeStyle = '#2a4a1a'; X.lineWidth = 2;
    X.beginPath(); X.moveTo(s * 0.85 + shOff, -s * 0.48); X.lineTo(s * 1.15 + shOff, -s * 0.42); X.stroke();

    // Teeth
    X.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
        const tx = s * 0.85 + i * 8 + shOff, ty = s * 0.05;
        X.beginPath(); X.moveTo(tx, ty); X.lineTo(tx + 2, ty + 5); X.lineTo(tx + 4, ty); X.closePath(); X.fill();
    }

    // Legs (thick, short)
    X.fillStyle = '#2a5a1a';
    X.fillRect(-s * 0.4 + shOff, s * 0.35, 12, 20);
    X.fillRect(s * 0.3 + shOff, s * 0.35, 12, 20);
    // Claws
    X.fillStyle = '#444';
    for (let l = 0; l < 2; l++) {
        const lx = l === 0 ? -s * 0.4 : s * 0.3;
        for (let c = 0; c < 3; c++) {
            X.beginPath(); X.moveTo(lx + c * 4 + shOff, s * 0.55); X.lineTo(lx + c * 4 + 2 + shOff, s * 0.62); X.lineTo(lx + c * 4 + 4 + shOff, s * 0.55); X.closePath(); X.fill();
        }
    }

    // Back spikes
    X.fillStyle = '#2a5a1a';
    for (let i = 0; i < 5; i++) {
        const sx = -s * 0.6 + i * s * 0.35 + shOff, sy = -s * 0.55;
        X.beginPath(); X.moveTo(sx - 5, sy + 8); X.lineTo(sx, sy - 4 - i * 1); X.lineTo(sx + 5, sy + 8); X.closePath(); X.fill();
    }

    // Stunned stars
    if (d.state === 'stunned') {
        X.font = '14px Arial'; X.fillStyle = '#ffee00';
        for (let i = 0; i < 3; i++) {
            const angle = d.t * 3 + i * 2.1;
            X.fillText('⭐', s * 0.9 + Math.cos(angle) * 20, -s * 0.6 + Math.sin(angle) * 10);
        }
    }

    // HP bar
    X.fillStyle = 'rgba(0,0,0,0.5)'; X.fillRect(-30, -s - 10, 60, 6);
    X.fillStyle = d.hp > 4 ? '#66cc44' : d.hp > 2 ? '#ffaa00' : '#ff4444';
    X.fillRect(-30, -s - 10, 60 * (d.hp / 8), 6);

    X.restore();
}

function updateLvl9(dt) {
    elapsed += dt;

    // Spawn worms
    tmrWorm += dt;
    if (tmrWorm > 2.5 && worms.length < 6) { tmrWorm = 0; spawnWorm(); }

    // Spawn gnats (more of them, chicks are hungry)
    tmrGnat += dt;
    if (tmrGnat > 1.5 && gnats.length < 15) { tmrGnat = 0; spawnGnat(); }

    // Spawn enemy birds (fewer in level 9, dino is the main threat)
    tmrBird += dt;
    if (tmrBird > 5 && enemyBirds.length < 3) { tmrBird = 0; spawnEnemyBird(); }

    // Spawn dino after 10s
    if (!dino && elapsed > 10) spawnDino();

    // Combo timer
    if (combo > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }

    // Night cycle
    if (has('night')) {
        const cycleDur = 70;
        dayPhase = (elapsed % cycleDur) / cycleDur;
        const was = isNight;
        isNight = dayPhase > 0.55 && dayPhase < 0.88;
        if (isNight && !was) addFloatText('🌙 NIGHTFALL...', W / 2, H / 2, '#aaddff', 2, 'big');
        if (!isNight && was) addFloatText('☀️ Dawn!', W / 2, H / 2, '#ffdd44', 2, 'big');
        const ramp = 0.05;
        if (dayPhase < 0.55) nightAlpha = Math.max(nightAlpha - dt * 1.2, 0);
        else if (dayPhase < 0.55 + ramp) nightAlpha = Math.min((dayPhase - 0.55) / ramp, 1);
        else if (dayPhase < 0.88 - ramp) nightAlpha = 1;
        else if (dayPhase < 0.88) nightAlpha = Math.max(1 - (dayPhase - (0.88 - ramp)) / ramp, 0);
        else nightAlpha = Math.max(nightAlpha - dt * 1.2, 0);
    }

    treeGrowth = 1; // max growth in level 9

    // Player movement (arrows only — NO mouse popping)
    const spd = player.speed * dt;
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= spd * 0.15;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += spd * 0.15;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= spd * 0.15;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += spd * 0.15;
    player.vx *= 0.92; player.vy *= 0.92;
    player.x += player.vx; player.y += player.vy;
    player.x = Math.max(30, Math.min(W - 30, player.x));
    player.y = Math.max(30, Math.min(H * 0.78, player.y)); // can go to ground level

    // Trail
    if (Math.abs(player.vx) > 0.5 || Math.abs(player.vy) > 0.5)
        player.trail.push({ x: player.x, y: player.y, life: 0.4 });
    for (let i = player.trail.length - 1; i >= 0; i--) { player.trail[i].life -= dt; if (player.trail[i].life <= 0) player.trail.splice(i, 1); }

    // Beak position
    const beakDir = player.vx >= 0 ? 1 : -1;
    const beakX = player.x + beakDir * player.size * 0.8;
    const beakY = player.y;

    // Beak open near food
    let wantBeakOpen = false;
    for (const g of gnats) { if (dist(player.x, player.y, g.x, g.y) < 55) { wantBeakOpen = true; break; } }
    if (!wantBeakOpen) { for (const w of worms) { if (dist(player.x, player.y, w.x, w.y) < 50) { wantBeakOpen = true; break; } } }
    if (wantBeakOpen) player.beakOpen = Math.min(player.beakOpen + dt * 8, 1);
    else player.beakOpen = Math.max(player.beakOpen - dt * 5, 0);

    // Player eats gnats — carry to chicks
    const hungryChick = nest.chicks.find(ch => ch.hungry > 2);
    for (let i = gnats.length - 1; i >= 0; i--) {
        if (dist(player.x, player.y, gnats[i].x, gnats[i].y) < 30) {
            player.beakOpen = 1;
            snd(1200, 600, .08, 'sine', .06);
            gnats.splice(i, 1);
            if (hungryChick && !nest.carryingGnat) {
                nest.carryingGnat = true;
                addFloatText('🪰 Carry to nest!', player.x, player.y - 30, '#ffee44', 1);
            } else {
                player.gnatsEaten++;
                score += 2; lvlScore += 2;
                addFloatText('+2', player.x, player.y - 20, '#ffee00', 0.6);
            }
        }
    }

    // Player eats worms — carry to chicks (worms are worth more)
    for (let i = worms.length - 1; i >= 0; i--) {
        if (dist(beakX, beakY, worms[i].x, worms[i].y) < 25) {
            player.beakOpen = 1;
            snd(900, 500, .1, 'sine', .08);
            worms.splice(i, 1);
            if (hungryChick && !nest.carryingGnat) {
                nest.carryingGnat = true;
                nest.carryingWorm = true; // worms feed more
                addFloatText('🪱 Worm! Carry to nest!', player.x, player.y - 30, '#cc7766', 1.2);
            } else {
                player.gnatsEaten += 2;
                score += 5; lvlScore += 5;
                addFloatText('+5 🪱', player.x, player.y - 20, '#cc7766', 0.8);
            }
        }
    }

    // Update worms
    for (let i = worms.length - 1; i >= 0; i--) {
        const w = worms[i]; w.t += dt; w.life -= dt;
        w.emerging = Math.min(w.emerging + dt * 0.8, 1);
        w.x += w.vx * dt * 60;
        w.vx += (Math.random() - 0.5) * 0.5 * dt;
        if (w.x < 20 || w.x > W - 150) w.vx *= -1;
        if (w.life <= 0) worms.splice(i, 1); // worm goes back underground
    }

    // Update gnats
    for (let i = gnats.length - 1; i >= 0; i--) {
        const g = gnats[i]; g.t += dt; g.life -= dt;
        g.vx += (Math.random() - 0.5) * 8 * dt; g.vy += (Math.random() - 0.5) * 6 * dt;
        const len = Math.hypot(g.vx, g.vy); if (len > 2) { g.vx *= 2 / len; g.vy *= 2 / len; }
        g.x += g.vx * dt * 60; g.y += g.vy * dt * 60;
        if (g.x < 10 || g.x > W - 10) g.vx *= -1;
        if (g.y < 30 || g.y > H * 0.7) g.vy *= -1;
        if (g.life <= 0) gnats.splice(i, 1);
    }

    // Update enemy birds (simplified — just wander and eat gnats)
    for (let i = enemyBirds.length - 1; i >= 0; i--) {
        const b = enemyBirds[i]; b.t += dt; b.stateT += dt;
        b.wingT += b.flapSpd * dt;
        b.sleeping = isNight;
        if (isNight) { b.y += Math.sin(b.t * 0.5) * 0.3; continue; }
        // Eat gnats
        for (let gi = gnats.length - 1; gi >= 0; gi--) {
            if (dist(b.x, b.y, gnats[gi].x, gnats[gi].y) < b.size) {
                gnats.splice(gi, 1);
            }
        }
        b.vx += (Math.random() - 0.5) * 2 * dt * 60; b.vy += (Math.random() - 0.5) * dt * 60;
        b.vx = clamp(b.vx, -3, 3); b.vy = clamp(b.vy, -1.5, 1.5);
        b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
        if (b.y < 40) b.vy += 2 * dt * 60; if (b.y > H * 0.65) b.vy -= 2 * dt * 60;
        // Scare away from player
        if (dist(b.x, b.y, player.x, player.y) < 60) {
            b.vx = (b.x - player.x) > 0 ? R(3, 5) : R(-5, -3);
            b.vy = R(-2, -1);
        }
        if (b.x < -80 || b.x > W + 80) enemyBirds.splice(i, 1);
    }

    // Screen shake decay
    if (player.shakeT > 0) player.shakeT -= dt;

    // ---- DINOSAUR AI ----
    if (dino) {
        dino.t += dt;
        dino.stateT += dt;
        const nestTreeX = W - 90;

        switch (dino.state) {
            case 'walk':
                // Walk toward the nest tree
                dino.x += dino.vx * dt * 60;
                if (Math.abs(dino.x - nestTreeX) < 50) {
                    dino.state = 'shake'; dino.stateT = 0;
                    dino.shaking = true; dino.shakeT = 0;
                    snd(100, 50, .5, 'sawtooth', .12);
                    addFloatText('🦖 SHAKE!', dino.x, dino.y - 60, '#ff4444', 1.5, 'big');
                }
                break;
            case 'shake':
                // Shake the tree! Chicks might fall
                dino.shakeT += dt;
                // Tree shakes visually (handled in draw)
                if (dino.shakeT > 0.5 && dino.shakeT < 0.6) {
                    // Damage chicks if no shield
                    if (nest.shield <= 0) {
                        nest.chicks.forEach(ch => {
                            ch.hp--;
                            if (ch.hp <= 0) {
                                const penalty = 25;
                                score = Math.max(0, score - penalty);
                                lvlScore = Math.max(0, lvlScore - penalty);
                                addFloatText(`-${penalty} 💀 Chick fell!`, nest.x, nest.y - 30, '#ff0000', 2, 'big');
                                snd(200, 60, .4, 'sawtooth', .1);
                                lives--;
                                if (lives <= 0) doGameOver();
                            }
                        });
                        player.shakeT = 0.5;
                        addFloatText('⚠️ Peck the dino!', W / 2, H / 2, '#ffaa00', 2, 'big');
                    } else {
                        nest.shield -= 80;
                        addFloatText('🛡 Shield!', nest.x, nest.y - 30, '#44ff88', 1);
                    }
                }
                if (dino.shakeT > 2) {
                    dino.shaking = false;
                    dino.state = 'walk';
                    dino.stateT = 0;
                    // Walk away then come back
                    dino.vx = dino.x > W / 2 ? -2 : 2;
                }
                break;
            case 'stunned':
                // Stunned — can't move
                if (dino.stateT > 2) {
                    dino.state = 'walk'; dino.stateT = 0;
                    dino.vx = dino.x > W / 2 ? 1.5 : -1.5;
                    // Walk toward tree again
                    const toTree = nestTreeX - dino.x;
                    dino.vx = toTree > 0 ? R(1, 2) : R(-2, -1);
                }
                break;
            case 'flee':
                dino.x += dino.vx * dt * 60 * 2;
                if (dino.x < -100 || dino.x > W + 100) {
                    dino = null;
                    score += 30; lvlScore += 30;
                    addFloatText('+30 🦖 Dino defeated!', W / 2, H / 2, '#44ff88', 2, 'big');
                    snd(600, 1200, .2, 'sine', .08);
                }
                break;
        }

        // Player pecks dinosaur (beak contact)
        if (dino && dino.state !== 'stunned' && dino.state !== 'flee') {
            if (dist(beakX, beakY, dino.x, dino.y) < 50) {
                player.beakOpen = 1;
                dino.hp--;
                dino.hits++;
                dino.state = 'stunned'; dino.stateT = 0;
                dino.shaking = false;
                score += 5; lvlScore += 5;
                addFloatText('+5 💥', dino.x, dino.y - 50, '#ff8844', 1);
                snd(350, 150, .15, 'sawtooth', .08);
                // Knockback player
                player.vx += (player.x - dino.x) > 0 ? 5 : -5;
                player.vy -= 3;
                if (dino.hp <= 0) {
                    dino.state = 'flee'; dino.stateT = 0;
                    dino.vx = dino.x > W / 2 ? 4 : -4;
                    addFloatText('🦖 Fleeing!', dino.x, dino.y - 40, '#44ffaa', 1.5, 'big');
                    snd(400, 800, .2, 'sine', .08);
                }
            }
        }

        // Remove dead chicks
        nest.chicks = nest.chicks.filter(ch => ch.hp > 0);
    }

    // Nest update (feeding, hunger, shield)
    updateNest(dt);

    // Consume mouse click (no bubble popping in level 9)
    if (mouseClicked) mouseClicked = false;

    // Win: survived + dino defeated (dino goes null after flee)
    if (!dino && elapsed > 12 && lvlScore >= 50) nextLevel();
}

// ============================================================
//  HUD & OVERLAYS
// ============================================================
function drawHUD() {
    // Score
    X.save();
    X.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(12, 10, 190, 42, 10); X.fill();
    X.fillStyle = '#fff'; X.font = 'bold 22px Arial'; X.textAlign = 'left';
    X.fillText(`Score: ${score}`, 24, 38);

    // Lives
    X.font = '20px Arial';
    X.fillText('❤️'.repeat(Math.max(lives, 0)) + '🖤'.repeat(Math.max(3 - lives, 0)), 210, 38);

    // Combo
    const mul = combo >= 10 ? 5 : combo >= 7 ? 4 : combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
    if (mul > 1) {
        X.fillStyle = `hsla(${Math.min(combo * 10, 60)},100%,50%,0.6)`;
        roundRect(370, 10, 100, 42, 10); X.fill();
        X.fillStyle = '#fff'; X.font = 'bold 20px Arial';
        X.fillText(`COMBO x${mul}`, 380, 38);
    }

    // Level + progress
    X.fillStyle = 'rgba(0,0,0,0.4)';
    const lvlText = level === 9 ? 'FINALE' : `Level ${level}`;
    const tw = X.measureText(lvlText).width;
    roundRect(W - tw - 40, 10, tw + 30, 42, 10); X.fill();
    X.fillStyle = level >= 8 ? '#fca' : '#adf'; X.font = 'bold 18px Arial'; X.textAlign = 'right';
    X.fillText(lvlText, W - 20, 37);

    // Progress bar
    X.fillStyle = 'rgba(0,0,0,0.3)'; X.fillRect(12, 58, 180, 7);
    const pct = level === 9 ? (dino ? Math.min(1 - dino.hp / 8, 0.95) : Math.min(lvlScore / 50, 1))
        : level === 8 ? (1 - fires.filter(f => !f.dead).length / Math.max(fires.length, 1))
        : Math.min(lvlScore / 100, 1);
    X.fillStyle = level >= 8 ? '#f84' : '#7df'; X.fillRect(12, 58, 180 * pct, 7);

    // Powerup
    if (activePU) {
        X.fillStyle = 'rgba(255,215,0,0.3)';
        const pText = { freeze: '❄️ Freeze', slow: '🐌 Slow-Mo' }[activePU.type] || '';
        if (pText) {
            const pw = X.measureText(pText).width;
            roundRect(W / 2 - pw / 2 - 15, H - 45, pw + 30, 35, 10); X.fill();
            X.fillStyle = '#ffd700'; X.font = 'bold 18px Arial'; X.textAlign = 'center';
            X.fillText(pText + ` (${Math.ceil(activePU.timer)}s)`, W / 2, H - 22);
        }
    }

    // Speed / info
    X.fillStyle = 'rgba(255,200,100,0.5)'; X.font = '11px Arial'; X.textAlign = 'left';
    const info = [];
    if (speedMul > 1.05) info.push(`Speed +${Math.round((speedMul - 1) * 100)}%`);
    if (isNight) info.push('🌙 Night');
    if (has('storm') && Math.abs(windX) > 1) info.push('💨 Storm');
    if (superPower > 0) info.push('⚡' + superPower);
    X.fillText(info.join(' | '), 14, 82);

    X.textAlign = 'left';
    X.restore();
}

function drawFloatTexts(dt) {
    for (let i = floatTexts.length - 1; i >= 0; i--) {
        const f = floatTexts[i]; f.life -= dt;
        const t = 1 - f.life / f.maxLife;
        X.save();
        X.globalAlpha = 1 - t;
        X.fillStyle = f.color;
        X.font = f.cls === 'big' ? 'bold 36px Arial' : f.cls === 'neg' ? 'bold 28px Arial' : 'bold 22px Arial';
        X.textAlign = 'center';
        X.fillText(f.text, f.x, f.y - t * 50);
        X.restore();
        if (f.life <= 0) floatTexts.splice(i, 1);
    }
}

function drawFragments(dt) {
    for (let i = fragments.length - 1; i >= 0; i--) {
        const f = fragments[i]; f.x += f.vx * dt * 60; f.y += f.vy * dt * 60; f.vy += 5 * dt * 60; f.life -= dt * 1.5;
        X.save(); X.globalAlpha = f.life; X.fillStyle = f.color;
        X.beginPath(); X.arc(f.x, f.y, f.r, 0, Math.PI * 2); X.fill(); X.restore();
        if (f.life <= 0) fragments.splice(i, 1);
    }
}

function drawMenu() {
    drawBackground(0.016);
    // Decorative bubbles
    tmrBub += 0.016; if (tmrBub > 1 && bubbles.length < 8) { tmrBub = 0; spawnBubble(); }
    bubbles.forEach(b => { b.t += 0.016; b.y -= b.speedY * 0.016 * 60; b.x += Math.sin(b.t * b.wobbleSpd) * b.wobbleAmp; drawBubble(b); });
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < -50) bubbles.splice(i, 1);

    X.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(W / 2 - 220, H / 2 - 180, 440, 360, 20); X.fill();
    X.fillStyle = '#fff'; X.font = 'bold 42px Arial'; X.textAlign = 'center';
    X.fillText('🫧 Bubble Pop!', W / 2, H / 2 - 120);
    X.font = '18px Arial'; X.fillStyle = '#ccc';
    X.fillText('⬆️⬇️⬅️➡️ — fly the bird', W / 2, H / 2 - 75);
    X.fillText('🖱️ Click — pop bubbles', W / 2, H / 2 - 50);
    X.fillText('Bird pops with its beak too!', W / 2, H / 2 - 25);
    X.font = '13px Arial'; X.fillStyle = '#999';
    X.fillText('9 Levels | Combo | Powerup | Boss | Dino', W / 2, H / 2 + 5);

    // Leaderboard
    const lb = getLB();
    if (lb.length) {
        X.font = 'bold 16px Arial'; X.fillStyle = '#adf'; X.fillText('🏆 Leaderboard:', W / 2, H / 2 + 35);
        X.font = '14px Arial';
        lb.slice(0, 5).forEach((e, i) => {
            X.fillStyle = i === 0 ? '#ffd700' : i === 1 ? '#ccc' : '#aa8855';
            X.fillText(`${i + 1}. ${e.score} pts (x${e.combo || 1})`, W / 2, H / 2 + 55 + i * 20);
        });
    }

    // Start button
    X.fillStyle = '#4CAF50';
    roundRect(W / 2 - 80, H / 2 + 130, 160, 45, 12); X.fill();
    X.fillStyle = '#fff'; X.font = 'bold 22px Arial'; X.fillText('PLAY', W / 2, H / 2 + 158);

    // Click or key handler for menu
    if (mouseClicked) {
        mouseClicked = false;
        if (mouseX > W / 2 - 80 && mouseX < W / 2 + 80 && mouseY > H / 2 + 130 && mouseY < H / 2 + 175) startGame();
    }
    if (keys['Space'] || keys['Enter']) { keys['Space'] = false; keys['Enter'] = false; startGame(); }
}

function drawTransition(dt) {
    transitionTimer -= dt;
    X.fillStyle = 'rgba(0,0,0,0.75)'; X.fillRect(0, 0, W, H);
    X.save(); X.textAlign = 'center';

    // Title
    X.fillStyle = '#fff'; X.font = 'bold 42px Arial';
    X.fillText(transitionText, W / 2, H / 2 - 50);

    // Tip for the level
    const tips = {
        2: 'Gnats give power! Avoid dark trap bubbles.',
        3: 'At night enemies sleep — but so do chicks.',
        4: 'A chick hatched! Catch gnats & bring to nest. Pop green 🛡 for nest shield!',
        5: 'Two chicks now! Blue 🛡 bubbles shield YOU. Protect the nest!',
        6: 'BOSS incoming! Click it 3x or ram it to defeat.',
        7: 'Storm winds push bubbles. Stay focused!',
        8: 'Pop bubbles to pour water on the fires! Put them all out!',
        9: 'Chicks are grown! Catch worms & gnats to feed them. Peck the dinosaur to protect the nest! Arrows only — no mouse!',
    };
    if (tips[level]) {
        X.fillStyle = '#ccc'; X.font = '18px Arial';
        X.fillText(tips[level], W / 2, H / 2 + 5);
    }

    // Stats
    X.fillStyle = '#aaa'; X.font = '15px Arial';
    X.fillText(`Score: ${score} | Lives: ${lives} | Combo: x${maxCombo}`, W / 2, H / 2 + 40);

    // "Click to continue" — blink
    X.fillStyle = '#4CAF50'; X.globalAlpha = 0.6 + Math.sin(elapsed * 4) * 0.3;
    X.font = 'bold 22px Arial';
    X.fillText('[ Press Space to continue ]', W / 2, H / 2 + 90);

    X.restore();

    // Click or key to continue
    if (mouseClicked || keys['Space'] || keys['Enter']) {
        mouseClicked = false;
        state = 'playing';
    }
}

function drawEndScreen(title) {
    drawBackground(0.016);
    X.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(W / 2 - 200, H / 2 - 140, 400, 300, 20); X.fill();
    X.fillStyle = '#fff'; X.font = 'bold 40px Arial'; X.textAlign = 'center';
    X.fillText(title, W / 2, H / 2 - 80);
    X.font = '22px Arial'; X.fillStyle = '#fda';
    X.fillText(`Score: ${score} | Combo: x${maxCombo} | Lv: ${level}`, W / 2, H / 2 - 35);
    const lb = getLB();
    if (lb.length) {
        X.font = '14px Arial';
        lb.slice(0, 5).forEach((e, i) => { X.fillStyle = i === 0 ? '#ffd700' : '#ccc'; X.fillText(`${i + 1}. ${e.score}`, W / 2, H / 2 + i * 20); });
    }
    X.fillStyle = '#4CAF50'; roundRect(W / 2 - 80, H / 2 + 110, 160, 45, 12); X.fill();
    X.fillStyle = '#fff'; X.font = 'bold 20px Arial'; X.fillText('RETRY', W / 2, H / 2 + 138);
    if (mouseClicked) { mouseClicked = false; if (mouseX > W / 2 - 80 && mouseX < W / 2 + 80 && mouseY > H / 2 + 110 && mouseY < H / 2 + 155) startGame(); }
    if (keys['Space'] || keys['Enter']) { keys['Space'] = false; keys['Enter'] = false; startGame(); }
}

function roundRect(x, y, w, h, r) { X.beginPath(); X.moveTo(x + r, y); X.lineTo(x + w - r, y); X.arcTo(x + w, y, x + w, y + r, r); X.lineTo(x + w, y + h - r); X.arcTo(x + w, y + h, x + w - r, y + h, r); X.lineTo(x + r, y + h); X.arcTo(x, y + h, x, y + h - r, r); X.lineTo(x, y + r); X.arcTo(x, y, x + r, y, r); X.closePath(); }

// ============================================================
//  LEVEL 8 DRAWING
// ============================================================
function drawLvl8() {
    // Dark bg
    const grad = X.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a0a00'); grad.addColorStop(0.5, '#331500'); grad.addColorStop(1, '#442200');
    X.fillStyle = grad; X.fillRect(0, 0, W, H);
    // Ground
    X.fillStyle = '#3a2a1a'; X.fillRect(0, H * 0.75, W, H * 0.25);

    // Fires
    for (const f of fires) {
        if (f.dead) continue;
        const maxHp = fireRound === 2 ? 150 : 100;
        const I = Math.min(f.hp / 100, 1.5); // can go above 1 for supercharged fires
        const flames = I > 1 ? 8 : 5; // more flames for bigger fire
        for (let j = 0; j < flames; j++) {
            const fx = f.x + Math.sin(f.t * 5 + j * 1.3) * 15 * I;
            const fy = f.y - Math.abs(Math.sin(f.t * 4 + j)) * 40 * I;
            const fR = 15 * Math.min(I, 1.2);
            const grad2 = X.createRadialGradient(fx, fy, 0, fx, fy, fR);
            grad2.addColorStop(0, `rgba(255,255,100,${Math.min(0.8 * I, 1)})`); grad2.addColorStop(0.5, `rgba(255,100,0,${Math.min(0.5 * I, 0.8)})`); grad2.addColorStop(1, 'rgba(255,50,0,0)');
            X.fillStyle = grad2; X.beginPath(); X.arc(fx, fy, fR, 0, Math.PI * 2); X.fill();
        }
        X.fillStyle = 'rgba(0,0,0,0.5)'; X.fillRect(f.x - 25, f.y - 50, 50, 5);
        const barPct = Math.min(f.hp / maxHp, 1);
        X.fillStyle = I > 1 ? '#ff2222' : I > 0.5 ? '#ff8844' : '#ff4444';
        X.fillRect(f.x - 25, f.y - 50, 50 * barPct, 5);
    }

    // Bubbles (water-filled, rising)
    bubbles.forEach(b => drawBubble(b));

    // Water drops (pouring down from popped bubbles)
    waterDrops.forEach(w => {
        X.fillStyle = '#4488ff';
        X.globalAlpha = Math.min(w.life, 1);
        X.beginPath(); X.arc(w.x, w.y, 3.5, 0, Math.PI * 2); X.fill();
        // Water drop tail
        X.beginPath(); X.moveTo(w.x - 1.5, w.y); X.lineTo(w.x, w.y - 6); X.lineTo(w.x + 1.5, w.y); X.closePath(); X.fill();
        X.globalAlpha = 1;
    });

    // Mice
    mice.forEach(m => {
        X.save(); X.translate(m.x, m.y); X.scale(m.spd > 0 ? 1 : -1, 1);
        X.fillStyle = '#888'; X.beginPath(); X.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); X.fill();
        X.fillStyle = '#aaa'; X.beginPath(); X.arc(10, -3, 7, 0, Math.PI * 2); X.fill();
        X.fillStyle = '#f99'; X.beginPath(); X.arc(16, -2, 3, 0, Math.PI * 2); X.fill();
        X.fillStyle = '#faa'; X.beginPath(); X.arc(8, -9, 5, 0, Math.PI * 2); X.fill();
        X.strokeStyle = '#b98'; X.lineWidth = 1.5; X.beginPath(); X.moveTo(-12, 0); X.quadraticCurveTo(-20, -8, -25, -3); X.stroke();
        X.restore();
    });

    // Gnat bubbles
    gnatBubs.forEach(gb => {
        X.save(); X.globalAlpha = 0.5 + Math.sin(gb.t * 3) * 0.2;
        X.strokeStyle = '#44ff88'; X.lineWidth = 2;
        X.beginPath(); X.arc(gb.x, gb.y, gb.r, 0, Math.PI * 2); X.stroke();
        X.fillStyle = '#222'; X.beginPath(); X.arc(gb.x, gb.y, 4, 0, Math.PI * 2); X.fill();
        X.restore();
    });

    // Fireballs (round 2)
    fireballs.forEach(fb => {
        X.save();
        const I = 0.7 + Math.sin(fb.t * 15) * 0.3;
        // Fireball glow
        const fbg = X.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r * 1.5);
        fbg.addColorStop(0, `rgba(255,255,100,${I})`);
        fbg.addColorStop(0.4, `rgba(255,120,0,${I * 0.7})`);
        fbg.addColorStop(1, 'rgba(255,50,0,0)');
        X.fillStyle = fbg;
        X.beginPath(); X.arc(fb.x, fb.y, fb.r * 1.5, 0, Math.PI * 2); X.fill();
        // Core
        X.fillStyle = '#ffee44';
        X.beginPath(); X.arc(fb.x, fb.y, fb.r * 0.5, 0, Math.PI * 2); X.fill();
        // Trail
        X.globalAlpha = 0.3;
        X.fillStyle = '#ff6600';
        for (let t = 1; t <= 3; t++) {
            X.beginPath(); X.arc(fb.x - fb.vx * t * 3, fb.y - fb.vy * t * 2, fb.r * (0.4 - t * 0.08), 0, Math.PI * 2); X.fill();
        }
        X.restore();
    });

    drawPlayerBird();

    // Wing burn indicator
    if (wingsBurned > 0) {
        X.save(); X.textAlign = 'center'; X.font = 'bold 13px Arial';
        X.fillStyle = wingsBurned >= 3 ? '#ff2222' : wingsBurned >= 2 ? '#ff6600' : '#ffaa00';
        X.fillText('🔥'.repeat(wingsBurned) + ' Wings burned!', player.x, player.y + player.size + 15);
        // Altitude limit line
        const maxAlt = wingsBurned >= 3 ? H * 0.55 : wingsBurned >= 2 ? H * 0.35 : H * 0.2;
        X.strokeStyle = `rgba(255,100,0,${0.2 + Math.sin(elapsed * 3) * 0.1})`;
        X.lineWidth = 1; X.setLineDash([8, 8]);
        X.beginPath(); X.moveTo(0, maxAlt); X.lineTo(W, maxAlt); X.stroke();
        X.setLineDash([]);
        X.restore();
    }

    // Round indicator
    if (fireRound === 2) {
        X.save(); X.font = 'bold 16px Arial'; X.textAlign = 'right';
        X.fillStyle = '#ff8844';
        X.fillText('ROUND 2 — Firestorm', W - 15, 80);
        X.restore();
    }

    if (superPower > 0) { X.fillStyle = '#44ff88'; X.font = 'bold 14px Arial'; X.textAlign = 'center'; X.fillText(`⚡ Superpower: ${superPower}`, player.x, player.y - 45); }
}

// ============================================================
//  MAIN LOOP
// ============================================================
function gameLoop(ts) {
    requestAnimationFrame(gameLoop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    X.clearRect(0, 0, W, H);

    if (state === 'menu') { drawMenu(); return; }
    if (state === 'win') { drawEndScreen('🎉 Victory!'); return; }
    if (state === 'gameover') { drawEndScreen('💀 Game Over'); return; }

    if (state === 'transition') {
        if (level === 8) { const g = X.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0a00'); g.addColorStop(1, '#442200'); X.fillStyle = g; X.fillRect(0, 0, W, H); }
        else drawBackground(dt);
        drawTransition(dt); return;
    }

    // Screen shake
    if (player.shakeT > 0) {
        const shakeAmt = player.shakeT * 8;
        X.save();
        X.translate(R(-shakeAmt, shakeAmt), R(-shakeAmt, shakeAmt));
    }

    // Playing
    if (level < 8) {
        drawBackground(dt);
        updateBubbleLevels(dt);
        gnats.forEach(g => drawGnat(g));
        bubbles.forEach(b => drawBubble(b));
        enemyBirds.forEach(b => drawEnemyBird(b));
        drawBoss2D();
        drawPlayerBird();
    } else if (level === 8) {
        updateLvl8(dt);
        drawLvl8();
    } else if (level === 9) {
        updateLvl9(dt);
        // Draw level 9 scene
        drawBackground(dt);
        worms.forEach(w => drawWorm(w));
        gnats.forEach(g => drawGnat(g));
        enemyBirds.forEach(b => drawEnemyBird(b));
        drawDino();
        drawPlayerBird();
    }

    // Rain (storm level)
    if (rainDrops.length > 0) {
        X.save(); X.strokeStyle = 'rgba(180,200,255,0.3)'; X.lineWidth = 1;
        rainDrops.forEach(r => {
            X.beginPath(); X.moveTo(r.x, r.y); X.lineTo(r.x + windX * 0.8, r.y + r.len); X.stroke();
        });
        X.restore();
    }

    drawFragments(dt);
    drawFloatTexts(dt);

    if (player.shakeT > 0) X.restore();

    drawHUD();

    // Ambient sounds (bird chirps, wind, waves)
    ambientSounds(dt);

    mouseClicked = false;
}

// ============================================================
//  AMBIENT SOUNDS
// ============================================================
let ambTmr = { chirp: 0, wave: 0, wind: 0, buzz: 0, chick: 0 };

function ambientSounds(dt) {
    if (!actx || state !== 'playing') return;

    // Bird chirps (random, pleasant)
    ambTmr.chirp -= dt;
    if (ambTmr.chirp <= 0) {
        ambTmr.chirp = R(2, 6);
        const f = R(1800, 3200);
        snd(f, f * 0.6, R(0.05, 0.12), 'sine', 0.02);
        // Sometimes double chirp
        if (Math.random() < 0.4) setTimeout(() => snd(f * 1.1, f * 0.7, 0.08, 'sine', 0.015), 120);
    }

    // Ocean waves (low rumble)
    ambTmr.wave -= dt;
    if (ambTmr.wave <= 0) {
        ambTmr.wave = R(4, 8);
        snd(80, 40, 1.5, 'sine', 0.01);
    }

    // Wind (during storm)
    if (has('storm') && Math.abs(windX) > 1.5) {
        ambTmr.wind -= dt;
        if (ambTmr.wind <= 0) {
            ambTmr.wind = R(0.5, 2);
            snd(120 + Math.abs(windX) * 30, 60, 0.4, 'sawtooth', 0.008);
        }
    }

    // Gnat buzzing (when gnats exist nearby player)
    if (has('gnats') && gnats.length > 0) {
        ambTmr.buzz -= dt;
        if (ambTmr.buzz <= 0) {
            const nearby = gnats.some(g => dist(player.x, player.y, g.x, g.y) < 120);
            if (nearby) {
                ambTmr.buzz = R(0.8, 2);
                snd(R(200, 400), R(150, 350), 0.06, 'sawtooth', 0.008);
            }
        }
    }

    // Night crickets
    if (nightAlpha > 0.5) {
        ambTmr.chirp -= dt * 0.5; // more frequent at night
        if (Math.random() < 0.002) snd(R(3500, 5000), R(3000, 4500), 0.04, 'square', 0.005);
    }

    // Wing flap sound when player moves fast
    if (Math.abs(player.vx) > 3 || Math.abs(player.vy) > 3) {
        if (Math.random() < 0.03) snd(R(300, 500), R(200, 350), 0.04, 'triangle', 0.01);
    }

    // Chick chirping (daytime only, when chicks exist)
    if (nest.chicks.length > 0 && nightAlpha < 0.3) {
        ambTmr.chick -= dt;
        if (ambTmr.chick <= 0) {
            ambTmr.chick = R(1.5, 4);
            // High-pitched peeping
            const f = R(3000, 4500);
            snd(f, f * 0.8, 0.06, 'sine', 0.02);
            // Hungry chicks chirp more urgently (double/triple peep)
            const hungryChick = nest.chicks.some(c => c.hungry > 3);
            if (hungryChick) {
                ambTmr.chick = R(0.6, 1.5); // more frequent when hungry
                setTimeout(() => snd(f * 1.15, f * 0.9, 0.05, 'sine', 0.025), 80);
                if (Math.random() < 0.5) setTimeout(() => snd(f * 1.25, f * 0.85, 0.04, 'sine', 0.02), 160);
            }
        }
    }
}

// ============================================================
//  UTILS
// ============================================================
function R(a, b) { return Math.random() * (b - a) + a; }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// ============================================================
//  START
// ============================================================
initParallax();
requestAnimationFrame(gameLoop);
