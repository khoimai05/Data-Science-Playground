const canvas = document.getElementById('plot');
const ctx = canvas.getContext('2d');
const fitBtn = document.getElementById('fitBtn');
const clearBtn = document.getElementById('clearBtn');
const class0Btn = document.getElementById('class0Btn');
const class1Btn = document.getElementById('class1Btn');
const messageEl = document.getElementById('message');

const PADDING = { left: 44, right: 24, top: 24, bottom: 44 };
const X_MIN = 0, X_MAX = 10, Y_MIN = 0, Y_MAX = 10;
const plotWidth = canvas.width - PADDING.left - PADDING.right;
const plotHeight = canvas.height - PADDING.top - PADDING.bottom;

let points = [], boundary = null, animId = null, addingClass = 0;
const SAMPLE_DATA = {
  linear: () => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      pts.push({ x: 2+i*0.5, y: 2+i*0.3+Math.random()*0.5, label: 0 });
      pts.push({ x: 5+i*0.5, y: 5+i*0.3+Math.random()*0.5, label: 1 });
    }
    return pts;
  }
};

function sigmoid(z) { const t = Math.max(-500, Math.min(500, -z)); return 1/(1+Math.exp(t)); }

function dataToPixel(x, y) {
  return { x: PADDING.left+((x-X_MIN)/(X_MAX-X_MIN))*plotWidth, y: canvas.height-PADDING.bottom-((y-Y_MIN)/(Y_MAX-Y_MIN))*plotHeight };
}
function pixelToData(px, py) {
  return { x: X_MIN+((px-PADDING.left)/plotWidth)*(X_MAX-X_MIN), y: Y_MAX-((py-PADDING.top)/plotHeight)*(Y_MAX-Y_MIN) };
}

function drawGrid() {
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
  for (let x = X_MIN; x <= X_MAX; x++) {
    const {x:px} = dataToPixel(x, Y_MIN);
    ctx.beginPath(); ctx.moveTo(px, PADDING.top); ctx.lineTo(px, canvas.height-PADDING.bottom); ctx.stroke();
  }
  for (let y = Y_MIN; y <= Y_MAX; y++) {
    const {y:py} = dataToPixel(X_MIN, y);
    ctx.beginPath(); ctx.moveTo(PADDING.left, py); ctx.lineTo(canvas.width-PADDING.right, py); ctx.stroke();
  }
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING.left, PADDING.top);
  ctx.lineTo(PADDING.left, canvas.height-PADDING.bottom);
  ctx.lineTo(canvas.width-PADDING.right, canvas.height-PADDING.bottom);
  ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '10px "JetBrains Mono",monospace'; ctx.textAlign = 'center';
  for (let x = 0; x <= X_MAX; x += 2) { const {x:px} = dataToPixel(x,Y_MIN); ctx.fillText(String(x), px, canvas.height-PADDING.bottom+16); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = 0; y <= Y_MAX; y += 2) { const {y:py} = dataToPixel(X_MIN,y); ctx.fillText(String(y), PADDING.left-8, py); }
}

function drawPoints() {
  points.forEach(({x,y,label}) => {
    const {x:px,y:py} = dataToPixel(x,y);
    ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2);
    ctx.fillStyle = label===0 ? '#60a5fa' : '#f87171';
    ctx.fill();
  });
}

function drawRegionOverlay() {
  if (!boundary || points.length<2) return;
  const {w1,w2,b} = boundary;
  const z = (x,y) => w1*x+w2*y+b;
  const corners = [[X_MIN,Y_MIN],[X_MAX,Y_MIN],[X_MAX,Y_MAX],[X_MIN,Y_MAX]];
  const bPts = [];
  for (let i=0;i<4;i++) {
    const p1=corners[i],p2=corners[(i+1)%4];
    bPts.push({p:p1,inter:false});
    const z1=z(p1[0],p1[1]),z2=z(p2[0],p2[1]);
    if(z1*z2<0){const t=-z1/(z2-z1);bPts.push({p:[p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])],inter:true});}
  }
  const interIdx=bPts.map((x,i)=>x.inter?i:-1).filter(i=>i>=0);
  if(interIdx.length!==2) return;
  const pts=bPts.map(x=>x.p);
  const [i1,i2]=interIdx.sort((a,b)=>a-b);
  const poly1=pts.slice(i1,i2+1), poly2=[...pts.slice(i2),...pts.slice(0,i1+1)];
  const fillPoly=(poly,isRed)=>{
    if(poly.length<3)return;
    const px=poly.map(p=>dataToPixel(p[0],p[1]));
    ctx.beginPath();ctx.moveTo(px[0].x,px[0].y);
    px.slice(1).forEach(pt=>ctx.lineTo(pt.x,pt.y));ctx.closePath();
    ctx.fillStyle=isRed?'rgba(248,113,113,0.08)':'rgba(96,165,250,0.08)';ctx.fill();
  };
  const mid=(poly)=>poly.reduce((s,p)=>[s[0]+p[0],s[1]+p[1]],[0,0]).map(v=>v/poly.length);
  fillPoly(poly1,z(mid(poly1)[0],mid(poly1)[1])>0);
  fillPoly(poly2,z(mid(poly2)[0],mid(poly2)[1])>0);
}

function clipLineToRect(w1,w2,b) {
  const pts=[];
  if(Math.abs(w2)>1e-10){const yAt=x=>-(w1*x+b)/w2;for(const x of[X_MIN,X_MAX]){const y=yAt(x);if(y>=Y_MIN&&y<=Y_MAX)pts.push([x,y]);}}
  if(Math.abs(w1)>1e-10){const xAt=y=>-(w2*y+b)/w1;for(const y of[Y_MIN,Y_MAX]){const x=xAt(y);if(x>=X_MIN&&x<=X_MAX)pts.push([x,y]);}}
  return pts.filter((p,i)=>!pts.slice(0,i).some(q=>Math.abs(q[0]-p[0])<1e-6&&Math.abs(q[1]-p[1])<1e-6)).slice(0,2);
}

function getBoundaryIntersections() {
  if(!boundary)return[];
  const{w1,w2,b}=boundary;
  if(!Number.isFinite(w1)||!Number.isFinite(w2)||!Number.isFinite(b))return[];
  const z=(x,y)=>w1*x+w2*y+b;
  const edges=[[[X_MIN,Y_MIN],[X_MAX,Y_MIN]],[[X_MAX,Y_MIN],[X_MAX,Y_MAX]],[[X_MAX,Y_MAX],[X_MIN,Y_MAX]],[[X_MIN,Y_MAX],[X_MIN,Y_MIN]]];
  const ints=[];
  edges.forEach(([p1,p2])=>{const z1=z(p1[0],p1[1]),z2=z(p2[0],p2[1]);if(z1*z2<=0&&Math.abs(z2-z1)>1e-14){const t=-z1/(z2-z1);if(t>=-0.001&&t<=1.001)ints.push([p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]);}});
  return ints;
}

function drawBoundary() {
  if(!boundary||points.length<2) return;
  let ints=getBoundaryIntersections();
  if(ints.length!==2) ints=clipLineToRect(boundary.w1,boundary.w2,boundary.b);
  if(ints.length<2) return;
  const p1=dataToPixel(ints[0][0],ints[0][1]), p2=dataToPixel(ints[1][0],ints[1][1]);
  ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=1.5; ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
}

function drawResidualLines() {
  if(!boundary||points.length<2)return;
  let ints=getBoundaryIntersections();
  if(ints.length!==2)ints=clipLineToRect(boundary.w1,boundary.w2,boundary.b);
  if(ints.length<2)return;
  const lP1=dataToPixel(ints[0][0],ints[0][1]),lP2=dataToPixel(ints[1][0],ints[1][1]);
  const dx=lP2.x-lP1.x,dy=lP2.y-lP1.y,lenSq=dx*dx+dy*dy+1e-12;
  ctx.setLineDash([3,3]);
  points.forEach(({x,y,label})=>{
    const pt=dataToPixel(x,y),t=((pt.x-lP1.x)*dx+(pt.y-lP1.y)*dy)/lenSq;
    ctx.strokeStyle=label===0?'rgba(96,165,250,0.35)':'rgba(248,113,113,0.35)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(lP1.x+t*dx,lP1.y+t*dy);ctx.stroke();
  });
  ctx.setLineDash([]);
}

function crossEntropy(w1,w2,b) {
  let loss=0;const eps=1e-12;
  points.forEach(({x,y,label})=>{let p=sigmoid(w1*x+w2*y+b);p=Math.max(eps,Math.min(1-eps,p));loss-=label*Math.log(p)+(1-label)*Math.log(1-p);});
  return loss/points.length;
}
function fit() {
  const n0=points.filter(p=>p.label===0).length,n1=points.filter(p=>p.label===1).length;
  if(points.length<2||n0===0||n1===0){messageEl.textContent='need points from both classes';boundary=null;redraw();return;}
  fitBtn.disabled=true;canvas.classList.add('fitting');
  let w1=0,w2=0,b=0,iter=0;

  function tick(){
    const n=points.length;
    let g1=0,g2=0,g3=0,h11=0,h12=0,h13=0,h22=0,h23=0,h33=0;
    points.forEach(({x,y,label})=>{
      const p=sigmoid(w1*x+w2*y+b),err=p-label,pq=p*(1-p);
      g1+=err*x;g2+=err*y;g3+=err;
      h11+=pq*x*x;h12+=pq*x*y;h13+=pq*x;h22+=pq*y*y;h23+=pq*y;h33+=pq;
    });
    g1/=n;g2/=n;g3/=n;h11/=n;h12/=n;h13/=n;h22/=n;h23/=n;h33/=n;

    const det=h11*(h22*h33-h23*h23)-h12*(h12*h33-h23*h13)+h13*(h12*h23-h22*h13);
    let converged=false;
    if(Math.abs(det)<1e-12){
      converged=true;
    } else {
      const i00=(h22*h33-h23*h23)/det,i01=(h23*h13-h12*h33)/det,i02=(h12*h23-h22*h13)/det;
      const i11=(h11*h33-h13*h13)/det,i12=(h12*h13-h11*h23)/det,i22=(h11*h22-h12*h12)/det;
      const dw1=i00*g1+i01*g2+i02*g3,dw2=i01*g1+i11*g2+i12*g3,db=i02*g1+i12*g2+i22*g3;
      if(Math.sqrt(dw1*dw1+dw2*dw2+db*db)<1e-7){
        converged=true;
      } else {
        let alpha=1.0,loss0=crossEntropy(w1,w2,b),updated=false;
        for(let k=0;k<20;k++){
          const nw1=w1-alpha*dw1,nw2=w2-alpha*dw2,nb=b-alpha*db;
          const nl=crossEntropy(nw1,nw2,nb);
          if(Number.isFinite(nl)&&nl<loss0-1e-12){w1=nw1;w2=nw2;b=nb;updated=true;break;}
          alpha*=0.5;
        }
        if(!updated) converged=true;
      }
    }

    iter++;
    boundary={w1,w2,b};
    const loss=crossEntropy(w1,w2,b);
    redraw();

    if(converged||iter>=50){
      messageEl.textContent=`${w1.toFixed(2)}x + ${w2.toFixed(2)}y + ${b.toFixed(2)} = 0  loss: ${loss.toFixed(4)}`;
      fitBtn.disabled=false;canvas.classList.remove('fitting');
      return;
    }
    messageEl.textContent=`step ${iter}  loss: ${loss.toFixed(4)}`;
    animId=setTimeout(tick,150);
  }
  tick();
}

function clear(){if(animId){clearTimeout(animId);animId=null;}fitBtn.disabled=false;canvas.classList.remove('fitting');points=[];boundary=null;messageEl.textContent='';redraw();}
function loadSample(key){clear();points=SAMPLE_DATA[key]();messageEl.textContent=`${points.length} points loaded`;redraw();}
function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);drawGrid();drawRegionOverlay();drawBoundary();drawResidualLines();drawPoints();}

class0Btn.addEventListener('click',()=>{addingClass=0;class0Btn.classList.add('active');class1Btn.classList.remove('active');});
class1Btn.addEventListener('click',()=>{addingClass=1;class1Btn.classList.add('active');class0Btn.classList.remove('active');});
document.getElementById('sampleLinear').addEventListener('click',()=>loadSample('linear'));
canvas.addEventListener('click',(e)=>{
  if(animId)return;const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width,sy=canvas.height/rect.height;
  const px=(e.clientX-rect.left)*sx,py=(e.clientY-rect.top)*sy;
  if(px<PADDING.left||px>canvas.width-PADDING.right||py<PADDING.top||py>canvas.height-PADDING.bottom)return;
  points.push({...pixelToData(px,py),label:addingClass});redraw();
});
fitBtn.addEventListener('click',fit);
clearBtn.addEventListener('click',clear);
redraw();
