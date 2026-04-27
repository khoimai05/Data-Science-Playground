const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const runBtn = document.getElementById('runBtn');
const stepBtn = document.getElementById('stepBtn');
const clearBtn = document.getElementById('clearBtn');
const kSlider = document.getElementById('kSlider');
const kValueEl = document.getElementById('kValue');
const messageEl = document.getElementById('message');

const PADDING = { left: 44, right: 24, top: 24, bottom: 44 };
const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 10;
const plotWidth = canvas.width - PADDING.left - PADDING.right;
const plotHeight = canvas.height - PADDING.top - PADDING.bottom;

// cluster colors — muted, distinct
const COLORS = [
  { dot: '#60a5fa', fill: 'rgba(96,165,250,0.08)', centroid: '#93c5fd' },
  { dot: '#f87171', fill: 'rgba(248,113,113,0.08)', centroid: '#fca5a5' },
  { dot: '#4ade80', fill: 'rgba(74,222,128,0.08)', centroid: '#86efac' },
  { dot: '#facc15', fill: 'rgba(250,204,21,0.08)', centroid: '#fde68a' },
  { dot: '#c084fc', fill: 'rgba(192,132,252,0.08)', centroid: '#d8b4fe' },
  { dot: '#fb923c', fill: 'rgba(251,146,60,0.08)', centroid: '#fdba74' },
  { dot: '#22d3ee', fill: 'rgba(34,211,238,0.08)', centroid: '#67e8f9' },
  { dot: '#f472b6', fill: 'rgba(244,114,182,0.08)', centroid: '#f9a8d4' },
];

let points = [];       // { x, y, cluster: -1 }
let centroids = [];    // { x, y }
let animId = null;
let converged = false;

// --- sample data generators ---
function sampleBlobs() {
  const pts = [];
  const centers = [[3, 3], [7, 7], [3, 7]];
  centers.forEach(([cx, cy]) => {
    for (let i = 0; i < 15; i++) {
      pts.push({ x: cx + (Math.random() - 0.5) * 2.5, y: cy + (Math.random() - 0.5) * 2.5, cluster: -1 });
    }
  });
  return pts;
}

function sampleRing() {
  const pts = [];
  // inner cluster
  for (let i = 0; i < 15; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.2;
    pts.push({ x: 5 + Math.cos(a) * r, y: 5 + Math.sin(a) * r, cluster: -1 });
  }
  // outer ring
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + (Math.random() - 0.5) * 1;
    pts.push({ x: 5 + Math.cos(a) * r, y: 5 + Math.sin(a) * r, cluster: -1 });
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

function drawVoronoi() {
  if (centroids.length < 2) return;
  // pixel-based voronoi fill
  const w = 90, h = 70;
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = X_MIN + (px / w) * (X_MAX - X_MIN);
      const dy = Y_MAX - (py / h) * (Y_MAX - Y_MIN);
      let minD = Infinity, best = 0;
      centroids.forEach((c, i) => {
        const d = (dx - c.x) ** 2 + (dy - c.y) ** 2;
        if (d < minD) { minD = d; best = i; }
      });
      const col = COLORS[best % COLORS.length];
      // parse rgba
      const m = col.fill.match(/[\d.]+/g);
      const idx = (py * w + px) * 4;
      img.data[idx] = +m[0]; img.data[idx + 1] = +m[1]; img.data[idx + 2] = +m[2];
      img.data[idx + 3] = Math.round(+m[3] * 255);
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, w, h, PADDING.left, PADDING.top, plotWidth, plotHeight);
}

function drawConnections() {
  if (centroids.length === 0) return;
  ctx.setLineDash([2, 3]);
  points.forEach(p => {
    if (p.cluster < 0 || p.cluster >= centroids.length) return;
    const c = centroids[p.cluster];
    const pp = dataToPixel(p.x, p.y);
    const cp = dataToPixel(c.x, c.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(cp.x, cp.y); ctx.stroke();
  });
  ctx.setLineDash([]);
}

function drawPoints() {
  points.forEach(p => {
    const { x: px, y: py } = dataToPixel(p.x, p.y);
    const col = p.cluster >= 0 ? COLORS[p.cluster % COLORS.length].dot : '#555';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  });
}

function drawCentroids() {
  centroids.forEach((c, i) => {
    const { x: px, y: py } = dataToPixel(c.x, c.y);
    const col = COLORS[i % COLORS.length].centroid;
    // outer ring
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    // cross
    const s = 5;
    ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px, py + s); ctx.stroke();
  });
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawVoronoi();
  drawGrid();
  drawConnections();
  drawPoints();
  drawCentroids();
}

// --- k-means logic ---
function initCentroids(k) {
  // k-means++ initialization
  const chosen = [];
  // first centroid: random point
  chosen.push({ ...points[Math.floor(Math.random() * points.length)] });

  for (let c = 1; c < k; c++) {
    // compute D(x)^2 for each point
    const dists = points.map(p => {
      let minD = Infinity;
      chosen.forEach(cen => {
        const d = (p.x - cen.x) ** 2 + (p.y - cen.y) ** 2;
        if (d < minD) minD = d;
      });
      return minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    // weighted random pick
    let r = Math.random() * total, cum = 0;
    for (let i = 0; i < dists.length; i++) {
      cum += dists[i];
      if (cum >= r) { chosen.push({ x: points[i].x, y: points[i].y }); break; }
    }
  }
  return chosen;
}

function assignClusters() {
  let changed = false;
  points.forEach(p => {
    let minD = Infinity, best = 0;
    centroids.forEach((c, i) => {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < minD) { minD = d; best = i; }
    });
    if (p.cluster !== best) { p.cluster = best; changed = true; }
  });
  return changed;
}

function updateCentroids() {
  const k = centroids.length;
  const sums = Array.from({ length: k }, () => ({ sx: 0, sy: 0, n: 0 }));
  points.forEach(p => {
    if (p.cluster >= 0 && p.cluster < k) {
      sums[p.cluster].sx += p.x;
      sums[p.cluster].sy += p.y;
      sums[p.cluster].n++;
    }
  });
  sums.forEach((s, i) => {
    if (s.n > 0) {
      centroids[i].x = s.sx / s.n;
      centroids[i].y = s.sy / s.n;
    }
  });
}

function computeWCSS() {
  let total = 0;
  points.forEach(p => {
    if (p.cluster >= 0 && p.cluster < centroids.length) {
      const c = centroids[p.cluster];
      total += (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    }
  });
  return total;
}

function doStep() {
  if (points.length < 2) {
    messageEl.textContent = 'need more points';
    return false;
  }
  const k = parseInt(kSlider.value, 10);
  if (centroids.length === 0) {
    centroids = initCentroids(k);
    converged = false;
  }
  const changed = assignClusters();
  updateCentroids();
  const wcss = computeWCSS();
  if (!changed) {
    converged = true;
    messageEl.textContent = `converged  wcss: ${wcss.toFixed(2)}`;
    redraw();
    return false;
  }
  messageEl.textContent = `wcss: ${wcss.toFixed(2)}`;
  redraw();
  return true;
}

function runAnimation() {
  if (points.length < 2) {
    messageEl.textContent = 'need more points';
    return;
  }
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  // reset
  const k = parseInt(kSlider.value, 10);
  centroids = initCentroids(k);
  points.forEach(p => p.cluster = -1);
  converged = false;
  runBtn.disabled = true;

  let stepCount = 0;
  function tick() {
    stepCount++;
    const changed = assignClusters();
    updateCentroids();
    const wcss = computeWCSS();
    messageEl.textContent = `step ${stepCount}  wcss: ${wcss.toFixed(2)}`;
    redraw();
    if (!changed || stepCount > 100) {
      converged = true;
      messageEl.textContent = `converged after ${stepCount} steps  wcss: ${wcss.toFixed(2)}`;
      runBtn.disabled = false;
      animId = null;
      return;
    }
    animId = setTimeout(tick, 350);
  }
  tick();
}

function clear() {
  if (animId) { clearTimeout(animId); animId = null; }
  runBtn.disabled = false;
  points = []; centroids = []; converged = false;
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
  points.push({ x: d.x, y: d.y, cluster: -1 });
  // reset clustering when new points added
  centroids = []; converged = false;
  points.forEach(p => p.cluster = -1);
  redraw();
});

kSlider.addEventListener('input', () => {
  kValueEl.textContent = kSlider.value;
  // reset clustering on k change
  centroids = []; converged = false;
  points.forEach(p => p.cluster = -1);
  redraw();
});

document.getElementById('sampleBlobs').addEventListener('click', () => {
  if (animId) { clearTimeout(animId); animId = null; }
  runBtn.disabled = false;
  points = sampleBlobs(); centroids = []; converged = false;
  messageEl.textContent = `${points.length} points`;
  redraw();
});

document.getElementById('sampleRing').addEventListener('click', () => {
  if (animId) { clearTimeout(animId); animId = null; }
  runBtn.disabled = false;
  points = sampleRing(); centroids = []; converged = false;
  messageEl.textContent = `${points.length} points`;
  redraw();
});

stepBtn.addEventListener('click', () => {
  if (animId) return;
  doStep();
});

runBtn.addEventListener('click', runAnimation);
clearBtn.addEventListener('click', clear);

redraw();
