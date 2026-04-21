const canvas   = document.getElementById('c');
const ctx      = canvas.getContext('2d');
const scoreEl  = document.getElementById('scoreEl');
const bestEl   = document.getElementById('bestEl');
const btn      = document.getElementById('btn');
const diffSel  = document.getElementById('diff');
const lvlBadge = document.getElementById('lvlBadge');

const LVLNAMES = { easy: 'FACILE', medium: 'MOYEN', hard: 'DIFFICILE' };
const N        = 20;
const SZ       = canvas.width / N;
const SPEEDS   = { easy: 185, medium: 110, hard: 62 };

const C = {
  bg        : '#0C0F16',
  gridLine  : 'rgba(255,255,255,0.025)',
  head      : '#00E8A2',
  body1     : '#1DB88A',
  body2     : '#1D9E75',
  body3     : '#0F6E56',
  food      : '#FF5074',
  foodShine : 'rgba(255,255,255,0.45)',
  overlay   : 'rgba(10,13,20,0.88)',
  txtMain   : '#FFFFFF',
  txtSub    : 'rgba(255,255,255,0.45)'
};

let snake, dir, nextDir, food;
let score, highScore = 0;
let running = false, paused = false;
let animId, lastTime, elapsed;
let audioCtx, currentTs = 0;

function getAC() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(f1, f2, dur, type = 'sine', vol = 0.22) {
  try {
    const ac = getAC();
    const o  = ac.createOscillator();
    const g  = ac.createGain();
    o.type   = type;
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.setValueAtTime(f1, ac.currentTime);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start();
    o.stop(ac.currentTime + dur + 0.05);
  } catch(e) {}
}

const eatSound   = () => beep(440, 880, 0.10, 'sine',     0.20);
const dieSound   = () => beep(280,  60, 0.45, 'sawtooth', 0.25);
const startSound = () => beep(330, 660, 0.15, 'sine',     0.15);

function rndFood() {
  let p;
  do {
    p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
  } while (snake.some(s => s.x === p.x && s.y === p.y));
  return p;
}

function init() {
  snake   = [{ x:10, y:10 }, { x:9, y:10 }, { x:8, y:10 }];
  dir     = { x:1, y:0 };
  nextDir = { x:1, y:0 };
  score   = 0;
  scoreEl.textContent = '0';
  food     = rndFood();
  lastTime = null;
  elapsed  = 0;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);     ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x + r, y + h);     ctx.arcTo(x, y+h,   x, y+h-r,   r);
  ctx.lineTo(x, y + r);         ctx.arcTo(x, y,     x+r, y,      r);
  ctx.closePath();
}

function drawBg() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth   = 0.5;
  for (let i = 0; i <= N; i++) {
    ctx.beginPath(); ctx.moveTo(i*SZ, 0);   ctx.lineTo(i*SZ, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*SZ);   ctx.lineTo(canvas.width, i*SZ);  ctx.stroke();
  }
}

function segColor(i, len) {
  if (i === 0) return C.head;
  const t = i / len;
  if (t < 0.2) return C.body1;
  if (t < 0.5) return C.body2;
  return C.body3;
}

function drawSnake() {
  snake.forEach((seg, i) => {
    ctx.fillStyle = segColor(i, snake.length);
    const p = i === 0 ? 1.5 : 2.5;
    const r = i === 0 ? 4   : 3;
    roundRect(seg.x*SZ + p, seg.y*SZ + p, SZ - p*2, SZ - p*2, r);
    ctx.fill();
    if (i === 0) {
      const cx   = seg.x*SZ + SZ/2;
      const cy   = seg.y*SZ + SZ/2;
      const offX = dir.x === 0 ? 3 : 0;
      const offY = dir.y === 0 ? 3 : 0;
      const ex1  = cx + dir.y*offX - dir.x*(offX > 0 ? 0 : 3);
      const ey1  = cy + dir.x*offY - dir.y*(offY > 0 ? 0 : 3);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(ex1, ey1, 1.8, 0, Math.PI*2);
      ctx.fill();
    }
  });
}

function drawFood(ts) {
  const pulse = 0.85 + 0.15 * Math.sin((ts || 0) / 300);
  const cx = food.x*SZ + SZ/2;
  const cy = food.y*SZ + SZ/2;
  const r  = (SZ/2 - 3) * pulse;
  ctx.fillStyle = C.food;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = C.foodShine;
  ctx.beginPath(); ctx.arc(cx - r*0.28, cy - r*0.28, r*0.28, 0, Math.PI*2); ctx.fill();
}

function drawOverlay(title, sub) {
  ctx.fillStyle = C.overlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.txtMain;
  ctx.font      = '500 22px "Courier New", monospace';
  ctx.fillText(title, canvas.width/2, canvas.height/2 - 14);
  if (sub) {
    ctx.fillStyle = C.txtSub;
    ctx.font      = '13px "Courier New", monospace';
    ctx.fillText(sub, canvas.width/2, canvas.height/2 + 18);
  }
}

function step(ts) {
  currentTs = ts;
  if (!running || paused) return;
  if (!lastTime) lastTime = ts;
  elapsed += ts - lastTime;
  lastTime  = ts;
  const sp = SPEEDS[diffSel.value];
  if (elapsed >= sp) { elapsed -= sp; update(); }
  drawBg();
  drawFood(ts);
  drawSnake();
  animId = requestAnimationFrame(step);
}

function update() {
  dir     = nextDir;
  const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (h.x < 0 || h.x >= N || h.y < 0 || h.y >= N)   { gameOver(); return; }
  if (snake.some(s => s.x === h.x && s.y === h.y))    { gameOver(); return; }
  snake.unshift(h);
  if (h.x === food.x && h.y === food.y) {
    score += 10;
    scoreEl.textContent = score;
    if (score > highScore) { highScore = score; bestEl.textContent = highScore; }
    food = rndFood();
    eatSound();
  } else {
    snake.pop();
  }
}

function gameOver() {
  running = false;
  cancelAnimationFrame(animId);
  dieSound();
  setTimeout(() => {
    drawBg(); drawFood(currentTs); drawSnake();
    drawOverlay('GAME OVER', `Score : ${score}   Meilleur : ${highScore}`);
    btn.textContent  = 'Rejouer';
    diffSel.disabled = false;
  }, 50);
}

function toggle() {
  if (running) {
    paused = !paused;
    if (!paused) {
      lastTime = null;
      animId   = requestAnimationFrame(step);
      drawBg(); drawFood(currentTs); drawSnake();
    } else {
      drawBg(); drawFood(currentTs); drawSnake();
      drawOverlay('PAUSE', 'Espace ou bouton pour reprendre');
    }
    btn.textContent = paused ? 'Reprendre' : 'Pause';
  } else {
    lvlBadge.textContent = LVLNAMES[diffSel.value];
    diffSel.disabled     = true;
    init();
    running = true;
    paused  = false;
    btn.textContent = 'Pause';
    startSound();
    animId = requestAnimationFrame(step);
  }
}

document.addEventListener('keydown', e => {
  const MAP = {
    ArrowUp    : { x:0, y:-1 }, ArrowDown  : { x:0, y:1 },
    ArrowLeft  : { x:-1, y:0 }, ArrowRight : { x:1, y:0 },
    w: { x:0, y:-1 }, s: { x:0, y:1 },
    a: { x:-1, y:0 }, d: { x:1, y:0 }
  };
  if (e.key === ' ') { e.preventDefault(); toggle(); return; }
  const nd = MAP[e.key];
  if (!nd) return;
  e.preventDefault();
  if (!running) return;
  if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd;
});

diffSel.addEventListener('change', () => {
  lvlBadge.textContent = LVLNAMES[diffSel.value];
});

btn.addEventListener('click', toggle);

drawBg();
drawOverlay('SNAKE', 'Clique sur Jouer pour démarrer');
