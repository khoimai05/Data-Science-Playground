const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const kSlider = document.getElementById('kSlider');
const kValue = document.getElementById('kValue');
const class0Btn = document.getElementById('class0Btn');
const class1Btn = document.getElementById('class1Btn');
const messageEl = document.getElementById('message');
const PADDING = { left: 44, right: 24, top: 24, bottom: 44 };
const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 10;
const plotWidth = canvas.width - PADDING.left - PADDING.right;
const plotHeight = canvas.height - PADDING.top - PADDING.bottom;
let points = [], addingClass = 0;

const SAMPLE_DATA = {
  clusters: () => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      pts.push({ x: 2+Math.random()*1.5, y: 2+Math.random()*1.5, label: 0 });
      pts.push({ x: 6+Math.random()*1.5, y: 6+Math.random()*1.5, label: 1 });
    }
    return pts;
  }
};

function dataToPixel(x, y) {
  return { x: PADDING.left+((x-X_MIN)/(X_MAX-X_MIN))*plotWidth, y: canvas.height-PADDING.bottom-((y-Y_MIN)/(Y_MAX-Y_MIN))*plotHeight };
}
function pixelToData(px, py) {
  return { x: X_MIN+((px-PADDING.left)/plotWidth)*(X_MAX-X_MIN), y: Y_MAX-((py-PADDING.top)/plotHeight)*(Y_MAX-Y_MIN) };
}
function dist(metric, x1, y1, x2, y2) {
  const dx=x2-x1, dy=y2-y1;
  return metric==='manhattan' ? Math.abs(dx)+Math.abs(dy) : Math.sqrt(dx*dx+dy*dy);
}
function predict(x, y, k, metric) {
  if (points.length===0) return null;
  const d = metric || document.getElementById('distanceSelect').value;
  const dists = points.map(p=>({d:dist(d,x,y,p.x,p.y),label:p.label}));
  dists.sort((a,b)=>a.d-b.d);
  const kN = dists.slice(0,Math.min(k,dists.length));
  const votes = {0:0,1:0};
  kN.forEach(n=>votes[n.label]++);
  return votes[1]>=votes[0]?1:0;
}

function drawRegions() {
  if (points.length<2) return;
  const k = parseInt(kSlider.value,10);
  const metric = document.getElementById('distanceSelect').value;
  const w=60, h=50;
  const img = ctx.createImageData(w,h);
  for (let py=0;py<h;py++) {
    for (let px=0;px<w;px++) {
      const dataX=X_MIN+(px/w)*(X_MAX-X_MIN), dataY=Y_MAX-(py/h)*(Y_MAX-Y_MIN);
      const pred=predict(dataX,dataY,k,metric);
      const idx=(py*w+px)*4;
      if (pred===0) { img.data[idx]=96;img.data[idx+1]=165;img.data[idx+2]=250;img.data[idx+3]=18; }
      else { img.data[idx]=248;img.data[idx+1]=113;img.data[idx+2]=113;img.data[idx+3]=18; }
    }
  }
  const tmp=document.createElement('canvas');
  tmp.width=w;tmp.height=h;
  tmp.getContext('2d').putImageData(img,0,0);
  ctx.drawImage(tmp,0,0,tmp.width,tmp.height,PADDING.left,PADDING.top,plotWidth,plotHeight);
}

function drawGrid() {
  ctx.strokeStyle='#1a1a1a';ctx.lineWidth=1;
  for(let x=X_MIN;x<=X_MAX;x++){const{x:px}=dataToPixel(x,Y_MIN);ctx.beginPath();ctx.moveTo(px,PADDING.top);ctx.lineTo(px,canvas.height-PADDING.bottom);ctx.stroke();}
  for(let y=Y_MIN;y<=Y_MAX;y++){const{y:py}=dataToPixel(X_MIN,y);ctx.beginPath();ctx.moveTo(PADDING.left,py);ctx.lineTo(canvas.width-PADDING.right,py);ctx.stroke();}
  ctx.strokeStyle='#2a2a2a';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(PADDING.left,PADDING.top);ctx.lineTo(PADDING.left,canvas.height-PADDING.bottom);ctx.lineTo(canvas.width-PADDING.right,canvas.height-PADDING.bottom);ctx.stroke();
  ctx.fillStyle='#333';ctx.font='10px "JetBrains Mono",monospace';ctx.textAlign='center';
  for(let x=0;x<=X_MAX;x+=2){const{x:px}=dataToPixel(x,Y_MIN);ctx.fillText(String(x),px,canvas.height-PADDING.bottom+16);}
  ctx.textAlign='right';ctx.textBaseline='middle';
  for(let y=0;y<=Y_MAX;y+=2){const{y:py}=dataToPixel(X_MIN,y);ctx.fillText(String(y),PADDING.left-8,py);}
}

function drawPoints() {
  points.forEach(({x,y,label})=>{
    const{x:px,y:py}=dataToPixel(x,y);
    ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);
    ctx.fillStyle=label===0?'#60a5fa':'#f87171';
    ctx.fill();
  });
}

function redraw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawRegions();drawGrid();drawPoints();
}

canvas.addEventListener('click',(e)=>{
  const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width,sy=canvas.height/rect.height;
  const px=(e.clientX-rect.left)*sx,py=(e.clientY-rect.top)*sy;
  if(px<PADDING.left||px>canvas.width-PADDING.right||py<PADDING.top||py>canvas.height-PADDING.bottom)return;
  points.push({...pixelToData(px,py),label:addingClass});redraw();
});

kSlider.addEventListener('input',()=>{kValue.textContent=kSlider.value;redraw();});
document.getElementById('distanceSelect').addEventListener('change',redraw);
class0Btn.addEventListener('click',()=>{addingClass=0;class0Btn.classList.add('active');class1Btn.classList.remove('active');});
class1Btn.addEventListener('click',()=>{addingClass=1;class1Btn.classList.add('active');class0Btn.classList.remove('active');});
document.getElementById('sampleClusters').addEventListener('click',()=>{points=SAMPLE_DATA.clusters();messageEl.textContent='loaded clusters';redraw();});
document.getElementById('clearBtn').addEventListener('click',()=>{points=[];messageEl.textContent='';redraw();});
redraw();
