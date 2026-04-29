const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const trainBtn = document.getElementById('trainBtn');
const stepBtn = document.getElementById('stepBtn');
const clearBtn = document.getElementById('clearBtn');
const cSlider = document.getElementById('cSlider');
const cValueEl = document.getElementById('cValue');
const messageEl = document.getElementById('message');
const classABtn = document.getElementById('classABtn');
const classBBtn = document.getElementById('classBBtn');

const PADDING = { left: 44, right: 24, top: 24, bottom: 44 };
const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 10;
const plotWidth = canvas.width - PADDING.left - PADDING.right;
const plotHeight = canvas.height - PADDING.top - PADDING.bottom;

const CLASS_COLORS = {
  '+1': { dot: '#60a5fa', fill: 'rgba(96,165,250,0.12)' },
  '-1': { dot: '#f87171', fill: 'rgba(248,113,113,0.12)' }
};

let points = [];  // { x, y, label: +1 or -1 }
let currentClass = 1;
let w = [0, 0];
let b = 0;
let trained = false;
let animId = null;
let epoch = 0;

// learning
const LR = 0.005;
const MAX_EPOCHS = 800;

function getC() {
  return Math.pow(10, parseFloat(cSlider.value));
}

// --- sample data generators ---
function sampleLinear() {
  const pts = [];
  for (let i = 0; i < 18; i++) {
    pts.push({ x: 1.5 + Math.random() * 3, y: 1.5 + Math.random() * 3 + Math.random() * 2, label: 1 });
  }
  for (let i = 0; i < 18; i++) {
    pts.push({ x: 5.5 + Math.random() * 3, y: 5 + Math.random() * 3 + Math.random() * 2, label: -1 });
  }
  return pts;
}

function sampleOverlap() {
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const x = 2 + Math.random() * 4;
    const y = 2 + Math.random() * 4;
    pts.push({ x, y, label: 1 });
  }
  for (let i = 0; i < 20; i++) {
    const x = 4 + Math.random() * 4;
    const y = 4 + Math.random() * 4;
    pts.push({ x, y, label: -1 });
  }
  return pts;
}

// --- coordinate transforms ---
function dataToPixel(x, y) {
  return {
    x: PADDING.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotWidth,
    y: canvas.height - PADDING.bottom - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * plotHeight
  };
}
function pixelToData(px, py) {
  return {
    x: X_MIN + ((px - PADDING.left) / plotWidth) * (X_MAX - X_MIN),
    y: Y_MAX - ((py - PADDING.top) / plotHeight) * (Y_MAX - Y_MIN)
  };
}

// --- drawing ---
function drawGrid() {
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
  for (let x = X_MIN; x <= X_MAX; x++) {
    const { x: px } = dataToPixel(x, Y_MIN);
    ctx.beginPath(); ctx.moveTo(px, PADDING.top); ctx.lineTo(px, canvas.height - PADDING.bottom); ctx.stroke();
  }
  for (let y = Y_MIN; y <= Y_MAX; y++) {
    const { y: py } = dataToPixel(X_MIN, y);
    ctx.beginPath(); ctx.moveTo(PADDING.left, py); ctx.lineTo(canvas.width - PADDING.right, py); ctx.stroke();
  }
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING.left, PADDING.top);
  ctx.lineTo(PADDING.left, canvas.height - PADDING.bottom);
  ctx.lineTo(canvas.width - PADDING.right, canvas.height - PADDING.bottom);
  ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  for (let x = 0; x <= X_MAX; x += 2) {
    const { x: px } = dataToPixel(x, Y_MIN);
    ctx.fillText(String(x), px, canvas.height - PADDING.bottom + 16);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = 0; y <= Y_MAX; y += 2) {
    const { y: py } = dataToPixel(X_MIN, y);
    ctx.fillText(String(y), PADDING.left - 8, py);
  }
}

function drawDecisionRegions() {
  if (!trained) return;
  const res = 80;
  const img = ctx.createImageData(res, res);
  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      const dx = X_MIN + (px / res) * (X_MAX - X_MIN);
      const dy = Y_MAX - (py / res) * (Y_MAX - Y_MIN);
      const f = w[0] * dx + w[1] * dy + b;
      const idx = (py * res + px) * 4;
      if (f >= 0) {
        img.data[idx] = 96; img.data[idx + 1] = 165; img.data[idx + 2] = 250;
      } else {
        img.data[idx] = 248; img.data[idx + 1] = 113; img.data[idx + 2] = 113;
      }
      img.data[idx + 3] = 18;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = res; tmp.height = res;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, res, res, PADDING.left, PADDING.top, plotWidth, plotHeight);
}

function lineY(x) {
  // w[0]*x + w[1]*y + b = 0 => y = -(w[0]*x + b) / w[1]
  if (Math.abs(w[1]) < 1e-12) return null;
  return -(w[0] * x + b) / w[1];
}

function marginLineY(x, offset) {
  // w[0]*x + w[1]*y + b = offset => y = (offset - w[0]*x - b) / w[1]
  if (Math.abs(w[1]) < 1e-12) return null;
  return (offset - w[0] * x - b) / w[1];
}

function clipAndDrawLine(yFn, color, dash) {
  // find two intersection points with the plot boundary
  const pts = [];
  for (const x of [X_MIN, X_MAX]) {
    const y = yFn(x);
    if (y !== null && y >= Y_MIN && y <= Y_MAX) pts.push({ x, y });
  }
  // check horizontal boundaries
  if (Math.abs(w[1]) > 1e-12) {
    for (const y of [Y_MIN, Y_MAX]) {
      const x = (w[1] === 0) ? null : -(w[1] * y + b) / w[0];
      // generalize for margin lines too — recalculate
    }
  }

  // simpler: sample two extreme x values
  const x1 = X_MIN, x2 = X_MAX;
  const y1 = yFn(x1), y2 = yFn(x2);
  if (y1 === null || y2 === null) return;

  const p1 = dataToPixel(x1, y1);
  const p2 = dataToPixel(x2, y2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
  ctx.clip();

  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBoundary() {
  if (!trained) return;
  // decision boundary: w·x + b = 0
  clipAndDrawLine(x => lineY(x), '#e2e8f0', []);
  // margin +1
  clipAndDrawLine(x => marginLineY(x, 1), 'rgba(96,165,250,0.35)', [4, 4]);
  // margin -1
  clipAndDrawLine(x => marginLineY(x, -1), 'rgba(248,113,113,0.35)', [4, 4]);
}

function drawPoints() {
  points.forEach(p => {
    const { x: px, y: py } = dataToPixel(p.x, p.y);
    const col = p.label === 1 ? CLASS_COLORS['+1'] : CLASS_COLORS['-1'];

    // highlight support vectors
    if (trained) {
      const margin = p.label * (w[0] * p.x + w[1] * p.y + b);
      if (margin <= 1.01) {
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.strokeStyle = col.dot; ctx.lineWidth = 1; ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = col.dot; ctx.fill();

    // label indicator
    if (p.label === 1) {
      ctx.strokeStyle = col.dot; ctx.lineWidth = 1;
      const s = 2.5;
      ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px, py + s); ctx.stroke();
    } else {
      ctx.strokeStyle = col.dot; ctx.lineWidth = 1;
      const s = 3;
      ctx.beginPath(); ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s); ctx.stroke();
    }
  });
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawDecisionRegions();
  drawGrid();
  drawBoundary();
  drawPoints();
}

// --- SVM gradient descent ---
function normalize(pts) {
  // feature scaling for stable training
  let mx = 0, my = 0;
  pts.forEach(p => { mx += p.x; my += p.y; });
  mx /= pts.length; my /= pts.length;
  let sx = 0, sy = 0;
  pts.forEach(p => { sx += (p.x - mx) ** 2; sy += (p.y - my) ** 2; });
  sx = Math.sqrt(sx / pts.length) || 1;
  sy = Math.sqrt(sy / pts.length) || 1;
  return { mx, my, sx, sy };
}

function trainStep(C, lr) {
  const n = points.length;
  // sub-gradient of hinge loss SVM
  let dw0 = w[0], dw1 = w[1], db = 0;
  points.forEach(p => {
    const margin = p.label * (w[0] * p.x + w[1] * p.y + b);
    if (margin < 1) {
      dw0 -= C * p.label * p.x;
      dw1 -= C * p.label * p.y;
      db  -= C * p.label;
    }
  });
  w[0] -= lr * dw0 / n;
  w[1] -= lr * dw1 / n;
  b    -= lr * db / n;
}

function hingeLoss(C) {
  let loss = 0.5 * (w[0] ** 2 + w[1] ** 2);
  points.forEach(p => {
    const margin = p.label * (w[0] * p.x + w[1] * p.y + b);
    if (margin < 1) loss += C * (1 - margin);
  });
  return loss / points.length;
}

function doStep() {
  if (points.length < 2 || !points.some(p => p.label === 1) || !points.some(p => p.label === -1)) {
    messageEl.textContent = 'need both classes';
    return;
  }
  const C = getC();
  if (!trained) {
    // scale-aware init
    const stats = normalize(points);
    w = [0.01 / stats.sx, 0.01 / stats.sy];
    b = 0;
    epoch = 0;
    trained = true;
  }
  // do a batch of steps for visible progress
  for (let i = 0; i < 20; i++) {
    trainStep(C, LR);
    epoch++;
  }
  const loss = hingeLoss(C);
  messageEl.textContent = `epoch ${epoch}  loss: ${loss.toFixed(3)}`;
  redraw();
}

function runAnimation() {
  if (points.length < 2 || !points.some(p => p.label === 1) || !points.some(p => p.label === -1)) {
    messageEl.textContent = 'need both classes';
    return;
  }
  if (animId) { clearTimeout(animId); animId = null; }

  const C = getC();
  // reinitialize
  const stats = normalize(points);
  w = [0.01 / stats.sx, 0.01 / stats.sy];
  b = 0;
  epoch = 0;
  trained = true;
  trainBtn.disabled = true;

  let prevLoss = Infinity;
  function tick() {
    for (let i = 0; i < 20; i++) {
      trainStep(C, LR);
      epoch++;
    }
    const loss = hingeLoss(C);
    messageEl.textContent = `epoch ${epoch}  loss: ${loss.toFixed(3)}`;
    redraw();
    if (epoch >= MAX_EPOCHS || Math.abs(prevLoss - loss) < 1e-7) {
      messageEl.textContent = `converged at epoch ${epoch}  loss: ${loss.toFixed(3)}`;
      trainBtn.disabled = false;
      animId = null;
      return;
    }
    prevLoss = loss;
    animId = setTimeout(tick, 30);
  }
  tick();
}

function clear() {
  if (animId) { clearTimeout(animId); animId = null; }
  trainBtn.disabled = false;
  points = []; w = [0, 0]; b = 0; trained = false; epoch = 0;
  messageEl.textContent = '';
  redraw();
}

// --- events ---
canvas.addEventListener('click', (e) => {
  if (animId) return;
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  if (px < PADDING.left || px > canvas.width - PADDING.right || py < PADDING.top || py > canvas.height - PADDING.bottom) return;
  const d = pixelToData(px, py);
  points.push({ x: d.x, y: d.y, label: currentClass });
  trained = false; w = [0, 0]; b = 0; epoch = 0;
  redraw();
});

classABtn.addEventListener('click', () => {
  currentClass = 1;
  classABtn.classList.add('active');
  classBBtn.classList.remove('active');
});

classBBtn.addEventListener('click', () => {
  currentClass = -1;
  classBBtn.classList.add('active');
  classABtn.classList.remove('active');
});

cSlider.addEventListener('input', () => {
  const C = getC();
  cValueEl.textContent = C >= 1 ? C.toFixed(1) : C.toFixed(2);
  // retrain on slider change
  if (trained) {
    trained = false; w = [0, 0]; b = 0; epoch = 0;
    redraw();
  }
});

document.getElementById('sampleLinear').addEventListener('click', () => {
  if (animId) { clearTimeout(animId); animId = null; }
  trainBtn.disabled = false;
  points = sampleLinear(); trained = false; w = [0, 0]; b = 0; epoch = 0;
  messageEl.textContent = `${points.length} points`;
  redraw();
});

document.getElementById('sampleOverlap').addEventListener('click', () => {
  if (animId) { clearTimeout(animId); animId = null; }
  trainBtn.disabled = false;
  points = sampleOverlap(); trained = false; w = [0, 0]; b = 0; epoch = 0;
  messageEl.textContent = `${points.length} points`;
  redraw();
});

stepBtn.addEventListener('click', () => {
  if (animId) return;
  doStep();
});

trainBtn.addEventListener('click', runAnimation);
clearBtn.addEventListener('click', clear);

// init C display
cValueEl.textContent = getC().toFixed(1);
redraw();
