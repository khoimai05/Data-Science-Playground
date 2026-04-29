const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const PAD = { l: 48, r: 28, t: 28, b: 44 };
const PW = W - PAD.l - PAD.r, PH = H - PAD.t - PAD.b;

const PC1_COLOR = '#60a5fa';
const PC2_COLOR = '#f87171';

let points = [];
let viewMode = 'original';

// ---- PCA math ----
function computePCA(pts) {
  const n = pts.length;
  if (n < 2) return null;

  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const dx = pts.map(p => p.x - mx);
  const dy = pts.map(p => p.y - my);

  const cxx = dx.reduce((s, v, i) => s + v * dx[i], 0) / n;
  const cyy = dy.reduce((s, v, i) => s + v * dy[i], 0) / n;
  const cxy = dx.reduce((s, v, i) => s + v * dy[i], 0) / n;

  // eigenvalues of 2×2 symmetric matrix
  const tr = cxx + cyy;
  const disc = Math.sqrt(Math.max(0, (cxx - cyy) ** 2 / 4 + cxy ** 2));
  const l1 = Math.max(0, tr / 2 + disc);
  const l2 = Math.max(0, tr / 2 - disc);

  // eigenvector for l1
  let e1x, e1y;
  if (Math.abs(cxy) > 1e-10) {
    const m = Math.hypot(cxy, l1 - cxx);
    e1x = cxy / m;
    e1y = (l1 - cxx) / m;
  } else {
    e1x = cxx >= cyy ? 1 : 0;
    e1y = cxx >= cyy ? 0 : 1;
  }
  // PC2 is orthogonal to PC1
  const e2x = -e1y, e2y = e1x;

  const p1 = pts.map((_, i) => dx[i] * e1x + dy[i] * e1y);
  const p2 = pts.map((_, i) => dx[i] * e2x + dy[i] * e2y);

  const tot = l1 + l2;
  return {
    mx, my,
    e1x, e1y, e2x, e2y,
    l1, l2,
    ev1: tot > 1e-15 ? l1 / tot : 0.5,
    ev2: tot > 1e-15 ? l2 / tot : 0.5,
    p1, p2,
  };
}

// ---- coordinate transforms ----
function d2p(x, y, b) {
  return {
    x: PAD.l + ((x - b.xMin) / (b.xMax - b.xMin)) * PW,
    y: H - PAD.b - ((y - b.yMin) / (b.yMax - b.yMin)) * PH,
  };
}

function p2d(px, py) {
  return {
    x: ((px - PAD.l) / PW) * 10,
    y: 10 - ((py - PAD.t) / PH) * 10,
  };
}

function niceStep(range) {
  const raw = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / mag;
  if (frac < 1.5) return mag;
  if (frac < 3.5) return 2 * mag;
  if (frac < 7.5) return 5 * mag;
  return 10 * mag;
}

function getBounds(r) {
  if (!r || viewMode === 'original') return { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };

  const xMargin = Math.max((Math.max(...r.p1) - Math.min(...r.p1)) * 0.22, 0.6);
  const yMargin = Math.max((Math.max(...r.p2) - Math.min(...r.p2)) * 0.22, 0.6);
  let xMin = Math.min(...r.p1) - xMargin, xMax = Math.max(...r.p1) + xMargin;
  let yMin = Math.min(...r.p2) - yMargin, yMax = Math.max(...r.p2) + yMargin;

  // keep origin visible
  xMin = Math.min(xMin, -0.5); xMax = Math.max(xMax, 0.5);
  yMin = Math.min(yMin, -0.5); yMax = Math.max(yMax, 0.5);

  // square canvas
  const maxRange = Math.max(xMax - xMin, yMax - yMin);
  const xMid = (xMin + xMax) / 2, yMid = (yMin + yMax) / 2;
  return {
    xMin: xMid - maxRange / 2, xMax: xMid + maxRange / 2,
    yMin: yMid - maxRange / 2, yMax: yMid + maxRange / 2,
  };
}

// ---- drawing helpers ----
function drawGrid(b) {
  const xStep = niceStep(b.xMax - b.xMin);
  const yStep = niceStep(b.yMax - b.yMin);

  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
  let x = Math.ceil(b.xMin / xStep) * xStep;
  while (x <= b.xMax + 1e-9) {
    const px = d2p(x, 0, b).x;
    ctx.beginPath(); ctx.moveTo(px, PAD.t); ctx.lineTo(px, H - PAD.b); ctx.stroke();
    x += xStep;
  }
  let y = Math.ceil(b.yMin / yStep) * yStep;
  while (y <= b.yMax + 1e-9) {
    const py = d2p(0, y, b).y;
    ctx.beginPath(); ctx.moveTo(PAD.l, py); ctx.lineTo(W - PAD.r, py); ctx.stroke();
    y += yStep;
  }

  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, H - PAD.b); ctx.lineTo(W - PAD.r, H - PAD.b);
  ctx.stroke();

  ctx.fillStyle = '#333'; ctx.font = '10px "JetBrains Mono", monospace';
  x = Math.ceil(b.xMin / xStep) * xStep;
  while (x <= b.xMax + 1e-9) {
    const px = d2p(x, 0, b).x;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(Number(x.toFixed(2)).toString(), px, H - PAD.b + 6);
    x += xStep;
  }
  y = Math.ceil(b.yMin / yStep) * yStep;
  while (y <= b.yMax + 1e-9) {
    const py = d2p(0, y, b).y;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Number(y.toFixed(2)).toString(), PAD.l - 6, py);
    y += yStep;
  }
}

function drawAxisLabels(b) {
  ctx.font = '10px "JetBrains Mono", monospace';
  if (viewMode === 'pca') {
    ctx.fillStyle = PC1_COLOR; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('PC1 →', W - PAD.r, H - PAD.b - 4);
    ctx.fillStyle = PC2_COLOR; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('↑ PC2', PAD.l + 4, PAD.t);
  }
}

function drawArrow(x1, y1, x2, y2, color, b) {
  const from = d2p(x1, y1, b);
  const to = d2p(x2, y2, b);
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len, uy = dy / len;
  const head = 8;

  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x - ux * head * 0.55, to.y - uy * head * 0.55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * head - uy * head * 0.45, to.y - uy * head + ux * head * 0.45);
  ctx.lineTo(to.x - ux * head + uy * head * 0.45, to.y - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

function drawPCArrows(r, b) {
  const { mx, my, e1x, e1y, e2x, e2y, l1, l2 } = r;
  // scale arrow length to std dev, with a visual multiplier
  const s1 = Math.sqrt(l1) * 1.8;
  const s2 = Math.sqrt(l2) * 1.8;

  // PC1: solid positive arm + faint dashed negative arm
  const m = d2p(mx, my, b);
  const pc1m = d2p(mx - e1x * s1, my - e1y * s1, b);
  const pc2m = d2p(mx - e2x * s2, my - e2y * s2, b);

  ctx.setLineDash([3, 5]); ctx.strokeStyle = PC1_COLOR; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(pc1m.x, pc1m.y); ctx.stroke();
  ctx.setLineDash([3, 5]); ctx.strokeStyle = PC2_COLOR;
  ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(pc2m.x, pc2m.y); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  drawArrow(mx, my, mx + e1x * s1, my + e1y * s1, PC1_COLOR, b);
  drawArrow(mx, my, mx + e2x * s2, my + e2y * s2, PC2_COLOR, b);

  // labels at tips
  const tip1 = d2p(mx + e1x * s1, my + e1y * s1, b);
  const tip2 = d2p(mx + e2x * s2, my + e2y * s2, b);
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
  ctx.fillStyle = PC1_COLOR; ctx.textAlign = 'left'; ctx.fillText('PC1', tip1.x + 7, tip1.y);
  ctx.fillStyle = PC2_COLOR; ctx.textAlign = 'left'; ctx.fillText('PC2', tip2.x + 7, tip2.y);

  // mean dot
  ctx.beginPath(); ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#3a3a3a'; ctx.fill();
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.stroke();
}

function drawProjectionLines(r, b) {
  ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(96,165,250,0.12)'; ctx.lineWidth = 1;
  points.forEach((p, i) => {
    const projX = r.mx + r.p1[i] * r.e1x;
    const projY = r.my + r.p1[i] * r.e1y;
    const from = d2p(p.x, p.y, b);
    const to = d2p(projX, projY, b);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  });
  ctx.setLineDash([]);
}

function drawZeroLines(b) {
  const y0 = d2p(0, 0, b).y;
  const x0 = d2p(0, 0, b).x;
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(96,165,250,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.l, y0); ctx.lineTo(W - PAD.r, y0); ctx.stroke();
  ctx.strokeStyle = 'rgba(248,113,113,0.18)';
  ctx.beginPath(); ctx.moveTo(x0, PAD.t); ctx.lineTo(x0, H - PAD.b); ctx.stroke();
  ctx.setLineDash([]);
}

function drawPoints(r, b) {
  if (viewMode === 'pca' && r) {
    drawZeroLines(b);
    r.p1.forEach((v, i) => {
      const { x, y } = d2p(v, r.p2[i], b);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = PC1_COLOR; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
    });
  } else {
    // original space
    points.forEach((p, i) => {
      const { x, y } = d2p(p.x, p.y, b);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#666'; ctx.fill();
    });
    // projected dots on PC1 axis
    if (r) {
      r.p1.forEach((v, i) => {
        const px = r.mx + v * r.e1x;
        const py = r.my + v * r.e1y;
        const { x, y } = d2p(px, py, b);
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = PC1_COLOR; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
      });
    }
  }
}

function updateStats(r) {
  const ev1El = document.getElementById('ev1');
  const ev2El = document.getElementById('ev2');
  const bar1El = document.getElementById('bar1');
  const bar2El = document.getElementById('bar2');
  if (!r) {
    ev1El.textContent = '—'; ev2El.textContent = '—';
    bar1El.style.width = '0%'; bar2El.style.width = '0%';
    return;
  }
  ev1El.textContent = (r.ev1 * 100).toFixed(1) + '%';
  ev2El.textContent = (r.ev2 * 100).toFixed(1) + '%';
  bar1El.style.width = (r.ev1 * 100) + '%';
  bar2El.style.width = (r.ev2 * 100) + '%';
}

function redraw() {
  ctx.clearRect(0, 0, W, H);
  const r = points.length >= 2 ? computePCA(points) : null;
  const b = getBounds(r);

  drawGrid(b);
  if (r && viewMode === 'original') drawProjectionLines(r, b);
  drawPoints(r, b);
  if (r && viewMode === 'original') drawPCArrows(r, b);
  drawAxisLabels(b);
  updateStats(r);
}

// ---- sample data ----
function sampleDiagonal() {
  const pts = [];
  for (let i = 0; i < 50; i++) {
    const t = Math.random() * 7.5 + 1.2;
    pts.push({ x: t + (Math.random() - 0.5) * 1.1, y: t + (Math.random() - 0.5) * 1.1 });
  }
  return pts;
}

function sampleWide() {
  const pts = [];
  for (let i = 0; i < 50; i++) {
    const t = Math.random() * 7.5 + 1.2;
    pts.push({ x: t + (Math.random() - 0.5) * 2.8, y: 11 - t + (Math.random() - 0.5) * 0.5 });
  }
  return pts;
}

function sampleIsotropic() {
  const pts = [];
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + (Math.random() - 0.5) * 0.7;
    pts.push({ x: 5 + Math.cos(a) * r, y: 5 + Math.sin(a) * r });
  }
  return pts;
}

function sampleBlobs() {
  const pts = [];
  [[2.5, 2.5], [7.5, 7.5], [2.5, 7.5], [7.5, 2.5]].forEach(([cx, cy]) => {
    for (let i = 0; i < 12; i++) {
      pts.push({ x: cx + (Math.random() - 0.5) * 2, y: cy + (Math.random() - 0.5) * 2 });
    }
  });
  return pts;
}

// ---- events ----
canvas.addEventListener('click', e => {
  if (viewMode !== 'original') return;
  const rect = canvas.getBoundingClientRect();
  const sx = W / rect.width, sy = H / rect.height;
  const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  if (px < PAD.l || px > W - PAD.r || py < PAD.t || py > H - PAD.b) return;
  const d = p2d(px, py);
  points.push({ x: d.x, y: d.y });
  document.getElementById('message').textContent = `${points.length} points`;
  redraw();
});

document.getElementById('sampleDiag').addEventListener('click', () => {
  points = sampleDiagonal();
  document.getElementById('message').textContent = `${points.length} points`;
  redraw();
});
document.getElementById('sampleWide').addEventListener('click', () => {
  points = sampleWide();
  document.getElementById('message').textContent = `${points.length} points`;
  redraw();
});
document.getElementById('sampleIso').addEventListener('click', () => {
  points = sampleIsotropic();
  document.getElementById('message').textContent = `${points.length} points`;
  redraw();
});
document.getElementById('sampleBlobs').addEventListener('click', () => {
  points = sampleBlobs();
  document.getElementById('message').textContent = `${points.length} points`;
  redraw();
});

document.getElementById('viewOriginal').addEventListener('click', () => {
  viewMode = 'original';
  document.getElementById('viewOriginal').classList.add('active');
  document.getElementById('viewPCA').classList.remove('active');
  redraw();
});
document.getElementById('viewPCA').addEventListener('click', () => {
  viewMode = 'pca';
  document.getElementById('viewOriginal').classList.remove('active');
  document.getElementById('viewPCA').classList.add('active');
  redraw();
});
document.getElementById('clearBtn').addEventListener('click', () => {
  points = [];
  document.getElementById('message').textContent = '';
  redraw();
});

redraw();
