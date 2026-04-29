const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const messageEl = document.getElementById('message');
const var1El = document.getElementById('var1');
const var2El = document.getElementById('var2');
const explainedEl = document.getElementById('explained');

const PADDING = { left: 44, right: 24, top: 24, bottom: 44 };
const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 10;
const plotWidth = canvas.width - PADDING.left - PADDING.right;
const plotHeight = canvas.height - PADDING.top - PADDING.bottom;

const PC1_COLOR = '#60a5fa';
const PC2_COLOR = '#4ade80';
const PROJ_COLOR = 'rgba(96,165,250,0.18)';
const DOT_COLOR = '#888';
const MEAN_COLOR = '#fff';

let points = [];  // { x, y }
let showPC = true;
let showProj = true;

// --- sample data generators ---
function sampleCorrelated() {
  const pts = [];
  const cx = 5, cy = 5;
  for (let i = 0; i < 40; i++) {
    const t = (Math.random() - 0.5) * 5;
    const noise = (Math.random() - 0.5) * 1.2;
    pts.push({ x: cx + t * 0.8 + noise * 0.3, y: cy + t * 0.6 + noise * 0.9 });
  }
  return pts;
}

function sampleCircle() {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.random() * 1.5;
    pts.push({ x: 5 + Math.cos(a) * r, y: 5 + Math.sin(a) * r });
  }
  return pts;
}

function sampleAnisotropic() {
  const pts = [];
  const angle = Math.PI / 6;  // 30 degrees
  for (let i = 0; i < 40; i++) {
    // generate along a stretched axis
    const u = (Math.random() - 0.5) * 6;  // major axis
    const v = (Math.random() - 0.5) * 0.8; // minor axis
    const x = 5 + u * Math.cos(angle) - v * Math.sin(angle);
    const y = 5 + u * Math.sin(angle) + v * Math.cos(angle);
    pts.push({ x, y });
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

// --- PCA math ---
function computePCA() {
  const n = points.length;
  if (n < 2) return null;

  // mean
  let mx = 0, my = 0;
  points.forEach(p => { mx += p.x; my += p.y; });
  mx /= n; my /= n;

  // covariance matrix [[cxx, cxy], [cxy, cyy]]
  let cxx = 0, cxy = 0, cyy = 0;
  points.forEach(p => {
    const dx = p.x - mx, dy = p.y - my;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  });
  cxx /= (n - 1); cxy /= (n - 1); cyy /= (n - 1);

  // eigenvalues of 2x2 symmetric matrix via quadratic formula
  // λ² - (cxx+cyy)λ + (cxx*cyy - cxy²) = 0
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const lambda1 = trace / 2 + disc;  // larger
  const lambda2 = trace / 2 - disc;  // smaller

  // eigenvectors
  function eigenvector(lambda) {
    // (cxx - λ)v1 + cxy*v2 = 0
    let vx, vy;
    if (Math.abs(cxy) > 1e-12) {
      vx = cxy;
      vy = lambda - cxx;
    } else {
      // diagonal matrix
      if (cxx >= cyy) {
        vx = (lambda === lambda1) ? 1 : 0;
        vy = (lambda === lambda1) ? 0 : 1;
      } else {
        vx = (lambda === lambda1) ? 0 : 1;
        vy = (lambda === lambda1) ? 1 : 0;
      }
    }
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  const ev1 = eigenvector(lambda1);
  const ev2 = eigenvector(lambda2);

  return { mean: { x: mx, y: my }, eigenvalues: [lambda1, lambda2], eigenvectors: [ev1, ev2] };
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

function drawProjections(pca) {
  if (!showProj || !pca) return;
  const ev = pca.eigenvectors[0];
  const m = pca.mean;

  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
  ctx.clip();

  points.forEach(p => {
    // project onto PC1 line through mean
    const dx = p.x - m.x, dy = p.y - m.y;
    const t = dx * ev.x + dy * ev.y;
    const projX = m.x + t * ev.x;
    const projY = m.y + t * ev.y;

    const pp = dataToPixel(p.x, p.y);
    const pr = dataToPixel(projX, projY);

    // projection line
    ctx.strokeStyle = PROJ_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    ctx.setLineDash([]);

    // projected point
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = PC1_COLOR; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
  });

  ctx.restore();
}

function drawEigenvectors(pca) {
  if (!showPC || !pca) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
  ctx.clip();

  const m = pca.mean;
  const colors = [PC1_COLOR, PC2_COLOR];
  const labels = ['PC1', 'PC2'];

  pca.eigenvectors.forEach((ev, i) => {
    const scale = Math.sqrt(pca.eigenvalues[i]) * 2;
    const x1 = m.x - ev.x * scale * 1.5;
    const y1 = m.y - ev.y * scale * 1.5;
    const x2 = m.x + ev.x * scale * 1.5;
    const y2 = m.y + ev.y * scale * 1.5;

    const p1 = dataToPixel(x1, y1);
    const p2 = dataToPixel(x2, y2);

    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 2;
    ctx.globalAlpha = i === 0 ? 0.8 : 0.5;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

    // arrowhead on positive end
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const aLen = 8;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - aLen * Math.cos(angle - 0.35), p2.y - aLen * Math.sin(angle - 0.35));
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - aLen * Math.cos(angle + 0.35), p2.y - aLen * Math.sin(angle + 0.35));
    ctx.stroke();

    // label
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = colors[i];
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(labels[i], p2.x + 6, p2.y - 4);

    ctx.globalAlpha = 1;
  });

  ctx.restore();
}

function drawMean(pca) {
  if (!pca) return;
  const { x: px, y: py } = dataToPixel(pca.mean.x, pca.mean.y);

  // outer ring
  ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.strokeStyle = MEAN_COLOR; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  // cross
  const s = 4;
  ctx.strokeStyle = MEAN_COLOR; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px, py + s); ctx.stroke();
}

function drawPoints() {
  points.forEach(p => {
    const { x: px, y: py } = dataToPixel(p.x, p.y);
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = DOT_COLOR; ctx.fill();
  });
}

function updateStats(pca) {
  if (!pca) {
    var1El.textContent = '—';
    var2El.textContent = '—';
    explainedEl.textContent = '—';
    return;
  }
  const [l1, l2] = pca.eigenvalues;
  var1El.textContent = l1.toFixed(3);
  var2El.textContent = l2.toFixed(3);
  const total = l1 + l2;
  explainedEl.textContent = total > 0 ? `${(l1 / total * 100).toFixed(1)}%` : '—';
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  const pca = computePCA();
  drawProjections(pca);
  drawPoints();
  drawEigenvectors(pca);
  drawMean(pca);
  updateStats(pca);
}

function clear() {
  points = [];
  messageEl.textContent = '';
  redraw();
}

// --- events ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  if (px < PADDING.left || px > canvas.width - PADDING.right || py < PADDING.top || py > canvas.height - PADDING.bottom) return;
  const d = pixelToData(px, py);
  points.push({ x: d.x, y: d.y });
  messageEl.textContent = `${points.length} points`;
  redraw();
});

// drag support
let dragging = null;
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  // find nearest point within 10px
  let best = null, bestD = 100;
  points.forEach((p, i) => {
    const pp = dataToPixel(p.x, p.y);
    const d = Math.sqrt((pp.x - px) ** 2 + (pp.y - py) ** 2);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best !== null) {
    dragging = best;
    e.preventDefault();
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (dragging === null) return;
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  const d = pixelToData(px, py);
  points[dragging].x = Math.max(X_MIN, Math.min(X_MAX, d.x));
  points[dragging].y = Math.max(Y_MIN, Math.min(Y_MAX, d.y));
  redraw();
});

canvas.addEventListener('mouseup', () => { dragging = null; });
canvas.addEventListener('mouseleave', () => { dragging = null; });

document.getElementById('sampleCorr').addEventListener('click', () => {
  points = sampleCorrelated();
  messageEl.textContent = `${points.length} points`;
  redraw();
});

document.getElementById('sampleCircle').addEventListener('click', () => {
  points = sampleCircle();
  messageEl.textContent = `${points.length} points`;
  redraw();
});

document.getElementById('sampleAniso').addEventListener('click', () => {
  points = sampleAnisotropic();
  messageEl.textContent = `${points.length} points`;
  redraw();
});

document.getElementById('togglePC').addEventListener('click', function () {
  showPC = !showPC;
  this.classList.toggle('toggled', showPC);
  redraw();
});

document.getElementById('toggleProj').addEventListener('click', function () {
  showProj = !showProj;
  this.classList.toggle('toggled', showProj);
  redraw();
});

clearBtn.addEventListener('click', clear);

redraw();
