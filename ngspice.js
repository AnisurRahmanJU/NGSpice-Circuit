const $=s=>document.querySelector(s),svg=$('#svg'),src=$('#src');
const ACC='#2b8fd6',DW=100,GAP=150,RH=130;
/*ENG-START*/const EX={
'RC low-pass filter':`* RC low-pass filter
V1 in 0 SIN(0 1 1k) AC 1
R1 in out 1k
C1 out 0 100n
.tran 10u 5m
.ac dec 20 10 100k
.end`,
'Loaded voltage divider':`* Loaded voltage divider
V1 vcc 0 DC 12
R1 vcc mid 4.7k
R2 mid 0 10k
RL mid 0 22k
.op
.dc V1 0 12 1
.end`,
'Series RLC':`* Series RLC resonance
V1 1 0 SIN(0 1 1.6k) AC 1
R1 1 2 10
L1 2 3 10m
C1 3 0 1u
.ac dec 50 10 100k
.tran 10u 5m
.end`,
'Parallel resistors':`* Parallel resistors
V1 1 0 DC 9
R1 1 2 1k
R2 1 2 2.2k
R3 2 0 3.3k
.op
.dc V1 0 9 1
.end`,
'Half-wave rectifier':`* Half-wave rectifier
V1 in 0 SIN(0 5 50)
D1 in out 1N4148
C1 out 0 10u
RL out 0 1k
.model 1N4148 D(Is=2.5n Rs=0.5)
.tran 0.1m 60m
.end`,
'BJT common-emitter':`* NPN common-emitter stage
Vcc vcc 0 DC 12
Rb vcc b 100k
Rc vcc c 4.7k
Q1 c b 0 2N2222
.model 2N2222 NPN(Is=1e-14 Bf=200)
.op
.dc Vcc 0 12 0.25
.end`,
'NMOS common-source':`* NMOS common-source
Vdd vdd 0 DC 5
Vg g 0 DC 2
Rd vdd d 4.7k
M1 d g 0 0 NM W=10u L=1u
.model NM NMOS(Vto=1 Kp=100u)
.op
.dc Vg 0 5 0.1
.end`};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cut=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
const gnd=n=>{n=n.toLowerCase();return n==='gnd'?'0':n};
const T=(x,y,s,o={})=>`<text x="${x}" y="${y}" text-anchor="${o.a||'middle'}" font-size="${o.s||12}" ${o.b?'font-weight="700"':''} fill="${o.c||'currentColor'}" stroke="none" font-family="ui-monospace,Menlo,Consolas,monospace">${esc(s)}</text>`;
const dot=(x,y)=>`<circle cx="${x}" cy="${y}" r="3.5" fill="currentColor" stroke="none"/>`;

/* ---------- parser ---------- */
const NP={R:2,C:2,L:2,V:2,I:2,D:2,Q:3,M:4,E:4,G:4,S:4,F:2,H:2,B:2,T:2,K:2};
function parseEl(s){const r=parseEl0(s);if(r.err)return r;const t=s.split(/\s+/),np=r.k==='X'?t.length-2:(NP[r.k]||2);r.np=np;r.nodes=t.slice(1,1+np);r.tail=t.slice(1+np).join(' ');return r}
function parseEl0(s){
  const t=s.split(/\s+/),n=t[0],k=n[0].toUpperCase(),g=gnd,P=i=>g(t[i]);
  if('RCL'.includes(k)) return t.length<4?{err:'needs two nodes and a value'}:{k,n,pins:[P(1),P(2)],val:t.slice(3).join(' ')};
  if(k==='V'||k==='I') return t.length<3?{err:'needs two nodes'}:{k,n,pins:[P(1),P(2)],val:t.slice(3).join(' ')||'DC 0'};
  if(k==='D') return t.length<4?{err:'needs two nodes and a model'}:{k,n,pins:[P(1),P(2)],val:t[3]};
  if(k==='Q') return t.length<5?{err:'needs c b e and a model'}:{k,n,hub:'Q',pins:[P(1),P(2),P(3)],names:['c','b','e'],val:t[4]};
  if(k==='M') return t.length<6?{err:'needs d g s b and a model'}:{k,n,hub:'M',pins:[P(1),P(2),P(3)],names:['d','g','s'],val:t[5]+' B:'+t[4]};
  if(k==='E'||k==='G') return t.length<6?{err:'needs 4 nodes and a gain'}:{k,n,hub:'B',pins:[P(1),P(2),P(3),P(4)],names:['+','−','c+','c−'],val:t.slice(5).join(' ')};
  if(k==='S') return t.length<6?{err:'needs 4 nodes and a model'}:{k,n,hub:'B',pins:[P(1),P(2),P(3),P(4)],names:['+','−','c+','c−'],val:t[5]};
  if(k==='X') return t.length<3?{err:'needs nodes and a subcircuit name'}:{k,n,hub:'B',pins:t.slice(1,-1).map(g),names:t.slice(1,-1).map((_,i)=>i+1+''),val:t[t.length-1]};
  if('FHBTK'.includes(k)) return t.length<3?{err:'needs two nodes'}:{k,n,hub:'B',pins:[P(1),P(2)],names:['+','−'],val:t.slice(3).join(' ')};
  return {err:'unsupported element type “'+k+'”'};
}
function parse(text){
  const raw=text.split(/\r?\n/),L=[];
  raw.forEach((l,i)=>{if(/^\s*\+/.test(l)&&L.length){const q=L[L.length-1];q.t+=' '+l.replace(/^\s*\+/,'').trim();q.e=i}else L.push({t:l.trim(),n:i,e:i})});
  const M={title:'Circuit',els:[],dirs:[],errs:[],warn:[]};let sub=0,hidden=0,first=true,ctl=0;
  for(const l of L){
    let s=l.t;if(!s)continue;
    if(/^\.control/i.test(s)){ctl=1;continue}if(/^\.endc/i.test(s)){ctl=0;continue}if(ctl)continue;
    if(first){first=false;
      if(s[0]==='*'){M.title=s.replace(/^\*+\s*/,'')||M.title;continue}
      if(s[0]!=='.'){const p=parseEl(s);
        if(p.err||!/^[A-Za-z][A-Za-z0-9_]{0,5}$/.test(s.split(/\s+/)[0])){M.title=s;continue}}}
    if(s[0]==='*'||s[0]===';')continue;
    s=s.replace(/\s*[;$].*$/,'');
    if(s[0]==='.'){const d=s.toLowerCase();
      if(/^\.subckt/.test(d))sub++;
      if(/^\.ends/.test(d)){sub=Math.max(0,sub-1)}
      if(!/^\.end$/.test(d))M.dirs.push(s);continue}
    if(sub){hidden++;continue}
    const p=parseEl(s);
    if(p.err){M.errs.push({n:l.n,m:`${s.split(/\s+/)[0]}: ${p.err}`});continue}
    p.line=l.n;p.span=l.e-l.n+1;M.els.push(p);
  }
  if(hidden)M.warn.push(hidden+' element(s) inside .subckt are not drawn');
  return M;
}

/* ---------- simulation engine (MNA: .op .dc .ac .tran) ---------- */
const SU={t:1e12,g:1e9,meg:1e6,k:1e3,m:1e-3,u:1e-6,n:1e-9,p:1e-12,f:1e-15,mil:25.4e-6};
function num(s){const m=/^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|mil|[tgkmunpf])?/i.exec(s==null?'':String(s));return m?+m[1]*(m[2]?SU[m[2].toLowerCase()]:1):NaN}
function eng(v,sp){if(!isFinite(v))return String(v);if(v===0)return'0';const P=['f','p','n',sp?'u':'µ','m','','k',sp?'meg':'M','G','T'];let e=Math.floor(Math.log10(Math.abs(v))/3);e=Math.max(-5,Math.min(4,e));return +(v/Math.pow(10,3*e)).toPrecision(sp?6:3)+P[e+5]}
function spec(v){const o={dc:null,acm:0,acp:0,w:null};let s=v||'';
  const f=/(sin|pulse|pwl)\s*\(([^)]*)\)/i.exec(s);if(f){o.w={t:f[1].toLowerCase(),a:f[2].trim().split(/[\s,]+/).map(num)};s=s.replace(f[0],' ')}
  const a=/\bac\s+(\S+)(?:\s+(\S+))?/i.exec(s);if(a){o.acm=num(a[1])||0;const p=a[2]!=null?num(a[2]):NaN;o.acp=isNaN(p)?0:p;s=s.replace(a[0],' ')}
  const d=/\bdc\s+(\S+)/i.exec(s);if(d)o.dc=num(d[1]);else{const q=s.trim().split(/\s+/)[0];if(q&&!isNaN(num(q)))o.dc=num(q)}
  if(o.dc==null||isNaN(o.dc))o.dc=o.w?wave(o.w,0,{}):0;return o}
function wave(w,t,g){const a=w.a,z=(i,d)=>a[i]==null||isNaN(a[i])?d:a[i];
  if(w.t==='sin'){const vo=z(0,0),va=z(1,0),fr=z(2,1/(g.tstop||1)),td=z(3,0),th=z(4,0),ph=z(5,0)*Math.PI/180;
    return t<td?vo+va*Math.sin(ph):vo+va*Math.exp(-(t-td)*th)*Math.sin(2*Math.PI*fr*(t-td)+ph)}
  if(w.t==='pulse'){const v1=z(0,0),v2=z(1,0),td=z(2,0),tr=z(3,g.tstep||1e-9)||1e-12,tf=z(4,g.tstep||1e-9)||1e-12,pw=z(5,g.tstop||1),pr=z(6,g.tstop||1);
    if(t<td)return v1;const u=pr>0?(t-td)%pr:t-td;if(u<tr)return v1+(v2-v1)*u/tr;if(u<tr+pw)return v2;if(u<tr+pw+tf)return v2+(v1-v2)*(u-tr-pw)/tf;return v1}
  if(w.t==='pwl'){for(let i=0;i+1<a.length;i+=2)if(t<=a[i])return i===0?a[1]:a[i-1]+(a[i+1]-a[i-1])*(t-a[i-2])/(a[i]-a[i-2]);return a[a.length-1]}
  return 0}
function solve(A,b,S){
  for(let c=0;c<S;c++){let p=c,mx=Math.abs(A[c*S+c]);for(let r=c+1;r<S;r++){const v=Math.abs(A[r*S+c]);if(v>mx){mx=v;p=r}}
    if(mx<1e-30)return null;
    if(p!==c){for(let k=c;k<S;k++){const t=A[c*S+k];A[c*S+k]=A[p*S+k];A[p*S+k]=t}const t=b[c];b[c]=b[p];b[p]=t}
    const d=A[c*S+c];
    for(let r=c+1;r<S;r++){const f=A[r*S+c]/d;if(f===0)continue;for(let k=c;k<S;k++)A[r*S+k]-=f*A[c*S+k];b[r]-=f*b[c]}}
  const x=new Float64Array(S);for(let r=S-1;r>=0;r--){let s=b[r];for(let k=r+1;k<S;k++)s-=A[r*S+k]*x[k];x[r]=s/A[r*S+r]}return x}
function compile(M,out){
  const mod={};M.dirs.forEach(d=>{const m=/^\.model\s+(\S+)\s+(\w+)\s*\(?([^)]*)\)?/i.exec(d);if(m){const p={};m[3].split(/[\s,()]+/).forEach(kv=>{const q=kv.split('=');if(q.length===2)p[q[0].toLowerCase()]=num(q[1])});mod[m[1].toLowerCase()]={type:m[2].toLowerCase(),p}}});
  const idx={};let nn=0;M.els.forEach(e=>e.pins.forEach(p=>{if(p!=='0'&&!(p in idx))idx[p]=nn++}));
  const I=n=>n==='0'?-1:idx[n];let nb=0;const devs=[],bad=(e,m)=>out.errs.push(e.n+': '+m);
  for(const e of M.els){
    const p=e.pins.map(I),tk=(e.tail||'').split(/\s+/),v=num(tk[0]),K=e.k,m=mod[(tk[0]||'').toLowerCase()],P=m?m.p:{};let d=null;
    if(K==='R'){if(!(v>0)){bad(e,'invalid resistance');continue}d={t:'R',a:p[0],b:p[1],g:1/v}}
    else if(K==='C'){if(!(v>=0)){bad(e,'invalid capacitance');continue}d={t:'C',a:p[0],b:p[1],c:v,vp:0,ip:0}}
    else if(K==='L'){if(!(v>0)){bad(e,'invalid inductance');continue}d={t:'L',a:p[0],b:p[1],l:v,k:nn+nb++,vp:0,ip:0}}
    else if(K==='V')d={t:'V',a:p[0],b:p[1],k:nn+nb++,s:spec(e.val)};
    else if(K==='I')d={t:'I',a:p[0],b:p[1],s:spec(e.val)};
    else if(K==='E'||K==='G'){if(isNaN(v)){bad(e,'invalid gain');continue}d={t:K,a:p[0],b:p[1],c:p[2],cb:p[3],g:v};if(K==='E')d.k=nn+nb++}
    else if(K==='D'){if(!m)out.warn.push(`${e.n}: model “${tk[0]}” not found, using defaults`);d={t:'D',a:p[0],b:p[1],is:P.is||1e-14,nf:P.n||1,v:0}}
    else if(K==='Q'){if(!m)out.warn.push(`${e.n}: model “${tk[0]}” not found, using NPN defaults`);d={t:'Q',c:p[0],bb:p[1],e:p[2],sg:(m?m.type==='pnp':/pnp/i.test(tk[0]))?-1:1,is:P.is||1e-16,bf:P.bf||100,br:P.br||1,vbe:0,vbc:0}}
    else if(K==='M'){const pm=m?m.type==='pmos':/pmos/i.test(tk[0]),W=num((/\bw=(\S+)/i.exec(e.tail)||[])[1])||1,Ln=num((/\bl=(\S+)/i.exec(e.tail)||[])[1])||1;
      d={t:'M',d:p[0],g:p[1],s:p[2],sg:pm?-1:1,vto:P.vto!=null?Math.abs(P.vto):1,beta:(P.kp||2e-5)*W/Ln,lam:P.lambda||0}}
    else{out.warn.push(e.n+': element type '+K+' is drawn but not simulated');continue}
    d.nm=e.n;devs.push(d)}
  return{devs,idx,nn,nb,N:nn+nb,nl:devs.some(d=>'DQM'.includes(d.t)),lim:false}}
const ad=(m,i,j,g,bi)=>{if(i<0||j<0)return;const{A,S,N}=m;A[i*S+j]+=g;if(m.ac){A[(i+N)*S+j+N]+=g;if(bi){A[i*S+j+N]-=bi;A[(i+N)*S+j]+=bi}}};
const rh=(m,i,re,im)=>{if(i<0)return;m.b[i]+=re;if(m.ac)m.b[i+m.N]+=im||0};
const mk=(C,ac)=>{const N=C.N,S=ac?2*N:N;return{N,S,ac,A:new Float64Array(S*S),b:new Float64Array(S)}};
const srcv=(d,mode,X)=>(X.sc==null?1:X.sc)*(d.sw!==undefined?d.sw:mode==='tran'&&d.s.w?wave(d.s.w,X.t,X.g):d.s.dc);
function pnj(vn,vo,vt,vc,C){if(vn>vc&&Math.abs(vn-vo)>2*vt){C.lim=true;if(vo>0){const a=1+(vn-vo)/vt;return a>0?vo+vt*Math.log(a):vc}return vt*Math.log(vn/vt)}return vn}
function stampDev(d,m,x,mode,C,X){
  const V=i=>i<0?0:x[i],ac=mode==='ac';
  switch(d.t){
  case'R':ad(m,d.a,d.a,d.g);ad(m,d.b,d.b,d.g);ad(m,d.a,d.b,-d.g);ad(m,d.b,d.a,-d.g);break;
  case'C':if(ac){const w=X.w*d.c;ad(m,d.a,d.a,0,w);ad(m,d.b,d.b,0,w);ad(m,d.a,d.b,0,-w);ad(m,d.b,d.a,0,-w)}
    else if(mode==='tran'){const g=(X.first?1:2)*d.c/X.h,ie=-g*d.vp-(X.first?0:d.ip);d.g=g;d.ie=ie;ad(m,d.a,d.a,g);ad(m,d.b,d.b,g);ad(m,d.a,d.b,-g);ad(m,d.b,d.a,-g);rh(m,d.a,-ie);rh(m,d.b,ie)}break;
  case'L':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);
    if(ac)ad(m,k,k,0,-X.w*d.l);else if(mode==='tran'){const c=(X.first?1:2)*d.l/X.h;ad(m,k,k,-c);rh(m,k,-c*d.ip-(X.first?0:d.vp))}break}
  case'V':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);
    if(ac){const p=d.s.acp*Math.PI/180;rh(m,k,d.s.acm*Math.cos(p),d.s.acm*Math.sin(p))}else rh(m,k,srcv(d,mode,X));break}
  case'I':if(ac){const p=d.s.acp*Math.PI/180,re=d.s.acm*Math.cos(p),im=d.s.acm*Math.sin(p);rh(m,d.a,-re,-im);rh(m,d.b,re,im)}else{const v=srcv(d,mode,X);rh(m,d.a,-v);rh(m,d.b,v)}break;
  case'E':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);ad(m,k,d.c,-d.g);ad(m,k,d.cb,d.g);break}
  case'G':ad(m,d.a,d.c,d.g);ad(m,d.a,d.cb,-d.g);ad(m,d.b,d.c,-d.g);ad(m,d.b,d.cb,d.g);break;
  default:{
    if(ac){d.ent.forEach(q=>ad(m,q[0],q[1],q[2]));break}
    const ent=[],rhs=[];
    if(d.t==='D'){const vt=.02585*d.nf,vc=vt*Math.log(vt/(1.414*d.is)),v=pnj(V(d.a)-V(d.b),d.v,vt,vc,C);d.v=v;
      const ex=Math.exp(Math.min(v/vt,80)),i=d.is*(ex-1),g=d.is*ex/vt+1e-12,a=d.a,b=d.b;
      ent.push([a,a,g],[b,b,g],[a,b,-g],[b,a,-g]);const ie=i-g*v;rhs.push([a,-ie],[b,ie]);d.i=i}
    else if(d.t==='Q'){const vt=.02585,vc=vt*Math.log(vt/(1.414*d.is)),sg=d.sg;
      const vbe=pnj(sg*(V(d.bb)-V(d.e)),d.vbe,vt,vc,C),vbc=pnj(sg*(V(d.bb)-V(d.c)),d.vbc,vt,vc,C);d.vbe=vbe;d.vbc=vbc;
      const ef=Math.exp(Math.min(vbe/vt,80)),er=Math.exp(Math.min(vbc/vt,80)),If=d.is*(ef-1),Ir=d.is*(er-1),gf=d.is*ef/vt,gr=d.is*er/vt;
      const Ic=If-Ir*(1+1/d.br),Ib=If/d.bf+Ir/d.br;
      [[d.c,Ic,gf,-gr*(1+1/d.br)],[d.bb,Ib,gf/d.bf,gr/d.br],[d.e,-(Ic+Ib),-(gf+gf/d.bf),gr*(1+1/d.br)-gr/d.br]].forEach(([n,Iv,pe,pc])=>{
        ent.push([n,d.bb,pe+pc],[n,d.e,-pe],[n,d.c,-pc]);rhs.push([n,-(sg*Iv-pe*sg*vbe-pc*sg*vbc)])});
      d.ic=sg*Ic;d.ib=sg*Ib}
    else{const sg=d.sg;let nd=d.d,ns=d.s,sw=false;if(sg*(V(nd)-V(ns))<0){[nd,ns]=[ns,nd];sw=true}
      const vgs=sg*(V(d.g)-V(ns)),vds=sg*(V(nd)-V(ns)),vov=vgs-d.vto,bt=d.beta,lm=1+d.lam*vds;let id=0,gm=0,gd=0;
      if(vov>0){if(vds<vov){id=bt*(vov*vds-vds*vds/2)*lm;gm=bt*vds*lm;gd=bt*(vov-vds)*lm+bt*(vov*vds-vds*vds/2)*d.lam}
        else{id=bt/2*vov*vov*lm;gm=bt*vov*lm;gd=bt/2*vov*vov*d.lam}}
      gd+=1e-12;
      ent.push([nd,d.g,gm],[nd,ns,-(gm+gd)],[nd,nd,gd],[ns,d.g,-gm],[ns,ns,gm+gd],[ns,nd,-gd]);
      const ie=sg*id-gm*(V(d.g)-V(ns))-gd*(V(nd)-V(ns));rhs.push([nd,-ie],[ns,ie]);d.id=(sw?-1:1)*sg*id}
    d.ent=ent;ent.forEach(q=>ad(m,q[0],q[1],q[2]));rhs.forEach(q=>rh(m,q[0],q[1]))}}}
function newton(C,mode,x0,X,maxit){
  let x=x0;maxit=maxit||100;
  for(let it=0;it<maxit;it++){
    C.lim=false;const m=mk(C,false);for(let i=0;i<C.nn;i++)m.A[i*m.S+i]+=1e-12;
    C.devs.forEach(d=>stampDev(d,m,x,mode,C,X));
    const xn=solve(m.A,m.b,m.S);if(!xn||xn.some(isNaN))return null;
    if(!C.nl)return xn;
    let ok=!C.lim&&it>0;
    for(let i=0;i<C.N&&ok;i++)if(!(Math.abs(xn[i]-x[i])<=1e-3*Math.max(Math.abs(xn[i]),Math.abs(x[i]))+(i<C.nn?1e-6:1e-12)))ok=false;
    x=xn;if(ok)return x}
  return null}
function op(C,X){const z=new Float64Array(C.N);let x=newton(C,'dc',z,Object.assign({},X,{sc:1}));if(x)return x;
  x=z;for(let s=1;s<=20;s++){x=newton(C,'dc',x,Object.assign({},X,{sc:s/20}),150);if(!x)return null}return x}
function traces(C){const t=[],u0=(u,i)=>i<0?0:u(i);
  Object.keys(C.idx).forEach(n=>{const i=C.idx[n];t.push({name:`v(${n})`,f:u=>u(i),k:'v'})});
  C.devs.forEach(d=>{if(d.t==='V'||d.t==='L'||d.t==='E')t.push({name:`i(${d.nm})`,f:u=>u(d.k),k:'i'});
    if(d.t==='R')t.push({name:`i(${d.nm})`,f:u=>(u0(u,d.a)-u0(u,d.b))*d.g,k:'i'})});return t}
function opRows(C,x){const V=i=>i<0?0:x[i],rows=[];
  C.devs.forEach(d=>{let v=0,i=0;
    switch(d.t){case'R':v=V(d.a)-V(d.b);i=v*d.g;break;case'C':v=V(d.a)-V(d.b);break;case'L':i=x[d.k];break;
      case'V':case'E':v=V(d.a)-V(d.b);i=x[d.k];break;case'I':v=V(d.a)-V(d.b);i=srcv(d,'dc',{sc:1});break;
      case'D':v=V(d.a)-V(d.b);i=d.i;break;case'Q':v=V(d.c)-V(d.e);i=d.ic;break;case'M':v=V(d.d)-V(d.s);i=d.id;break;
      case'G':v=V(d.a)-V(d.b);i=d.g*(V(d.c)-V(d.cb))}
    rows.push([d.nm,v,i,v*i])});return rows}
function runSim(M){
  const R={errs:[],warn:[]},C=compile(M,R);R.C=C;
  if(R.errs.length)return R;
  if(!C.N){R.errs.push('Nothing to simulate');return R}
  R.tr=traces(C);const X={g:{},sc:1};
  const dirs=M.dirs.map(s=>s.trim().split(/\s+/)),find=k=>dirs.filter(t=>t[0].toLowerCase()==='.'+k);
  const x=op(C,X);if(!x){R.errs.push('DC operating point did not converge — check for floating nodes or loops of voltage sources');return R}
  R.op={x};{const m0=mk(C,false);C.devs.forEach(d=>stampDev(d,m0,x,'dc',C,X));R.rows=opRows(C,x)}
  find('dc').forEach(t=>{
    const d=C.devs.find(q=>(q.t==='V'||q.t==='I')&&q.nm.toLowerCase()===(t[1]||'').toLowerCase()),a=num(t[2]),b=num(t[3]);let s=num(t[4]);
    if(!d||isNaN(a)||isNaN(b)||!s){R.errs.push('.dc: expected  .dc source start stop step');return}
    if((b-a)*s<0)s=-s;const n=Math.min(Math.floor((b-a)/s+1e-9)+1,5000),xs=[],XS=[];let xc=x;
    for(let i=0;i<n;i++){d.sw=a+i*s;let y=newton(C,'dc',xc,{g:{},sc:1},150);if(!y)y=op(C,{g:{}});
      if(!y){R.errs.push('.dc: no convergence at '+eng(d.sw));break}xc=y;xs.push(d.sw);XS.push(Float64Array.from(y))}
    delete d.sw;R.dc={xs,X:XS,src:d.nm,cur:d.t==='I'}});
  find('ac').forEach(t=>{
    const ty=(t[1]||'').toLowerCase(),n=num(t[2]),f0=num(t[3]),f1=num(t[4]);
    if(!['dec','oct','lin'].includes(ty)||!(n>0)||!(f0>0)||!(f1>=f0)){R.errs.push('.ac: expected  .ac dec|oct|lin N fstart fstop');return}
    if(!C.devs.some(d=>(d.t==='V'||d.t==='I')&&d.s.acm))R.warn.push('.ac: no source has an AC magnitude — add “AC 1” to a source');
    const m0=mk(C,false);C.devs.forEach(d=>stampDev(d,m0,x,'dc',C,X));
    const fs=[];if(ty==='lin'){for(let i=0;i<n;i++)fs.push(n>1?f0+(f1-f0)*i/(n-1):f0)}
    else{const bs=ty==='dec'?10:2;for(let k=0;fs.length<5000;k++){const f=f0*Math.pow(bs,k/n);if(f>f1*(1+1e-9))break;fs.push(f)}}
    const re=[],im=[];
    for(const f of fs){const m=mk(C,true);for(let i=0;i<C.nn;i++){m.A[i*m.S+i]+=1e-12;m.A[(i+C.N)*m.S+i+C.N]+=1e-12}
      C.devs.forEach(d=>stampDev(d,m,x,'ac',C,{w:2*Math.PI*f}));
      const y=solve(m.A,m.b,m.S);if(!y){R.errs.push('.ac: singular matrix at '+eng(f)+'Hz');return}
      re.push(y.slice(0,C.N));im.push(y.slice(C.N))}
    R.ac={f:fs,re,im,type:ty}});
  find('tran').forEach(t=>{
    const ts=num(t[1]),tf=num(t[2]),t0=t[3]&&!isNaN(num(t[3]))?num(t[3]):0,tm=t[4]&&!isNaN(num(t[4]))?num(t[4]):Infinity;
    if(!(ts>0)||!(tf>0)){R.errs.push('.tran: expected  .tran tstep tstop [tstart [tmax]]');return}
    const h=Math.max(Math.min(ts,tm,tf/1000),tf/20000),X2={g:{tstep:ts,tstop:tf},sc:1,h,first:true,t:0};
    C.devs.forEach(d=>{const V=i=>i<0?0:x[i];if(d.t==='C'){d.vp=V(d.a)-V(d.b);d.ip=0}if(d.t==='L'){d.ip=x[d.k];d.vp=0}});
    let xc=x;const T=[],XS=[];
    const upd=()=>C.devs.forEach(d=>{const V=i=>i<0?0:xc[i];
      if(d.t==='C'){const v=V(d.a)-V(d.b);d.ip=d.g*v+d.ie;d.vp=v}else if(d.t==='L'){d.ip=xc[d.k];d.vp=V(d.a)-V(d.b)}});
    const step=(t1,hh,dp)=>{X2.t=t1;X2.h=hh;const xn=newton(C,'tran',xc,X2);
      if(xn){xc=xn;upd();X2.first=false;return true}
      if(dp>=5)return false;const hm=hh/2;return step(t1-hm,hm,dp+1)&&step(t1,hm,dp+1)};
    if(t0<=0){T.push(0);XS.push(Float64Array.from(x))}
    const ns=Math.round(tf/h);
    for(let k=1;k<=ns;k++){const tt=k*h;
      if(!step(tt,h,0)){R.errs.push('.tran: timestep too small at t='+eng(tt)+'s');break}
      if(tt>=t0){T.push(tt);XS.push(Float64Array.from(xc))}}
    R.tran={t:T,X:XS}});
  return R}
/*ENG-END*/
/* ---------- symbols (local coords, x −28…28) ---------- */
const wf=v=>/sin|ac|pulse|pwl|exp|sffm|am\(/i.test(v);
const SYM={
R:()=>`<path d="M-28 0H-20L-16-7-8 7 0-7 8 7 16-7 20 0H28"/>`,
C:()=>`<path d="M-28 0H-4M-4-12V12M4-12V12M4 0H28"/>`,
L:()=>`<path d="M-28 0H-16a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0H28"/>`,
V:e=>`<path d="M-28 0H-14M14 0H28"/><circle r="14"/>`+(wf(e.val)?`<path d="M-8 0q4-8 8 0t8 0"/>`:`<path d="M-10 0h6M-7-3v6M4 0h6"/>`),
I:()=>`<path d="M-28 0H-14M14 0H28M-8 0H4"/><path d="M8 0l-6-4v8z" fill="currentColor"/><circle r="14"/>`,
D:()=>`<path d="M-28 0H-8M8 0H28M8-9V9"/><path d="M-8-9V9L8 0z"/>`};

function drawTwo(e,pts,si,flip){
  const a=pts[si],b=pts[si+1],cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,hz=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1]);
  const ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+(flip?180:0);
  let w='';
  pts.slice(0,-1).forEach((p,i)=>{const q=pts[i+1];
    if(i!==si)w+=`M${p}L${q}`;
    else{const d=Math.hypot(q[0]-p[0],q[1]-p[1])||1,ux=(q[0]-p[0])/d,uy=(q[1]-p[1])/d;
      w+=`M${p}L${cx-ux*28},${cy-uy*28}M${cx+ux*28},${cy+uy*28}L${q}`}});
  const lab=hz?T(cx,cy-34,e.n,{b:1})+T(cx,cy-20,cut(e.val,18),{s:11,c:'var(--mut)'})
              :T(cx+24,cy-2,e.n,{a:'start',b:1})+T(cx+24,cy+13,cut(e.val,12),{a:'start',s:11,c:'var(--mut)'});
  return `<g class="el" data-line="${e.line}" data-n="${esc(e.n)}"><title>${esc(e.n+' '+e.pins.join(' ')+' '+e.val)}</title>
  <path d="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(${cx} ${cy}) rotate(${ang})" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${SYM[e.k](e)}<rect x="-28" y="-18" width="56" height="36" fill="transparent" stroke="none"/></g>${lab}</g>`;
}

function drawHub(e,tx,ty){
  const tag=(x,y,dx,dy,nm,net)=>{const s=`${nm}:${net==='0'?'GND':cut(net,8)}`;
    return `<circle cx="${x}" cy="${y}" r="3" fill="var(--canvas)"/>`+(dx<0?T(x-8,y+4,s,{a:'end',s:11,c:ACC}):dx>0?T(x+8,y+4,s,{a:'start',s:11,c:ACC}):dy<0?T(x,y-9,s,{s:11,c:ACC}):T(x,y+17,s,{s:11,c:ACC}))};
  let b='',h=150,pp={};
  if(e.hub==='Q'){const pnp=/pnp/i.test(e.val);
    pp={b:[-44,0,-1,0],c:[24,-44,0,-1],e:[24,44,0,1]};
    b=`<circle cx="10" cy="0" r="34" stroke-opacity=".35"/><path d="M-44 0H0M0-18V18M0-8L24-28V-44M0 8L24 28V44"/>`+
      (pnp?`<path d="M5 10L13 12 9 18z" fill="currentColor"/>`:`<path d="M21 26L12 24 17 18z" fill="currentColor"/>`)+
      T(50,-2,e.n,{a:'start',b:1})+T(50,13,cut(e.val,10),{a:'start',s:11,c:'var(--mut)'});
  }else if(e.hub==='M'){const p=/pmos|^p/i.test(e.val.split(' ')[0]);
    pp={g:[-44,0,-1,0],d:[24,-44,0,-1],s:[24,44,0,1]};
    b=`<path d="M-44 0H-10M-10-14V14M0-16V-8M0-4V4M0 8V16M0-12H24V-44M0 12H24V44M0 0H12"/>`+
      (p?`<path d="M12 0L6-3.5V3.5z" fill="currentColor"/>`:`<path d="M0 0L6-3.5V3.5z" fill="currentColor"/>`)+
      T(50,-2,e.n,{a:'start',b:1})+T(50,13,cut(e.val,12),{a:'start',s:11,c:'var(--mut)'});
  }else{const n=e.pins.length,l=Math.ceil(n/2);h=Math.max(l,n-l,2)*26+20;
    b=`<rect x="-50" y="${-h/2}" width="100" height="${h}" rx="4"/>`+T(0,-2,e.n,{b:1})+T(0,13,cut(e.val,12),{s:11,c:'var(--mut)'});
    e.pins.forEach((_,i)=>{const L=i<l,j=L?i:i-l,y=-h/2+23+j*26;pp[e.names[i]]=[L?-70:70,y,L?-1:1,0];b+=`<path d="M${L?-70:70} ${y}H${L?-50:50}"/>`})}
  let t='';e.pins.forEach((net,i)=>{const q=pp[e.names[i]];t+=tag(q[0],q[1],q[2],q[3],e.names[i],net)});
  return [`<g class="el" data-line="${e.line}" data-n="${esc(e.n)}" transform="translate(${tx} ${ty})"><title>${esc(e.n+' '+e.pins.join(' ')+' '+e.val)}</title>
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${b}</g>${t}</g>`,Math.max(h,150)];
}

/* ---------- layout ---------- */
function build(M){
  const nodes=new Map(),N=n=>{if(!nodes.has(n))nodes.set(n,{n,drops:[],adj:[],lvl:-1,row:0,out:0,inn:0});return nodes.get(n)};
  const two=M.els.filter(e=>!e.hub),hubs=M.els.filter(e=>e.hub),series=[];
  two.forEach(e=>{const[a,b]=e.pins;
    if(a===b){M.warn.push(`${e.n} has both terminals on the same net`);return}
    if(a==='0'||b==='0')N(a==='0'?b:a).drops.push(e);
    else{N(a);N(b);series.push(e);N(a).adj.push([e,b]);N(b).adj.push([e,a])}});
  const hasSrc=n=>n.drops.some(d=>'VI'.includes(d.k)),order=[...nodes.values()].sort((a,b)=>hasSrc(b)-hasSrc(a));
  let maxRow=-1;const occ=new Set(),put=(n,l,r)=>{n.lvl=l;n.row=r;occ.add(l+','+r)};
  for(const s of order){if(s.lvl>=0)continue;put(s,0,++maxRow);const q=[s];
    while(q.length){const u=q.shift();
      for(const[,vn]of u.adj){const v=nodes.get(vn);if(v.lvl>=0)continue;const l=u.lvl+1;
        put(v,l,occ.has(l+','+u.row)?++maxRow:u.row);q.push(v)}}}
  const nl=nodes.size?Math.max(...[...nodes.values()].map(n=>n.lvl))+1:0,km=Array(nl).fill(1);
  nodes.forEach(n=>km[n.lvl]=Math.max(km[n.lvl],n.drops.length||1));
  const cx=[];let x=100;for(let l=0;l<nl;l++){cx[l]=x;x+=(km[l]-1)*DW+GAP}
  nodes.forEach(n=>{n.y=90+n.row*RH;n.xl=cx[n.lvl];n.xr=n.xl+Math.max(0,n.drops.length-1)*DW});
  const yg=90+Math.max(0,maxRow)*RH+130;
  /* orient series edges, count branching */
  const E=series.map(e=>{let A=nodes.get(e.pins[0]),B=nodes.get(e.pins[1]);
    if(A.lvl>B.lvl||(A.lvl===B.lvl&&A.row>B.row))[A,B]=[B,A];A.out++;B.inn++;return{e,A,B}});
  const seen={};let s='',xs=[];
  E.forEach(({e,A,B})=>{
    const key=[A.n,B.n].sort().join('|'),j=seen[key]=(seen[key]??-1)+1,flip=e.pins[0]!==A.n;let p,si;
    if(A.lvl===B.lvl){const xv=Math.max(A.xr,B.xr)+45+j*50;p=[[A.xr,A.y],[xv,A.y],[xv,B.y],[B.xr,B.y]];si=1}
    else if(j>0){const ym=Math.max(A.y,B.y)+j*60;p=[[A.xr,A.y],[A.xr+22,A.y],[A.xr+22,ym],[B.xl-22,ym],[B.xl-22,B.y],[B.xl,B.y]];si=2}
    else if(A.y===B.y){p=[[A.xr,A.y],[B.xl,B.y]];si=0}
    else if(A.out>1&&B.inn===1){const xv=A.xr+25;p=[[A.xr,A.y],[xv,A.y],[xv,B.y],[B.xl,B.y]];si=2;s+=dot(xv,A.y)}
    else{const xv=B.xl-25;p=[[A.xr,A.y],[xv,A.y],[xv,B.y],[B.xl,B.y]];si=0;if(B.inn>1)s+=dot(xv,B.y)}
    s+=drawTwo(e,p,si,flip)});
  nodes.forEach(n=>{
    const k=n.drops.length,deg=n.adj.length;
    if(k>1)s+=`<path d="M${n.xl} ${n.y}H${n.xr}" stroke="currentColor" stroke-width="2"/>`;
    n.drops.forEach((e,i)=>{const px=n.xl+i*DW;xs.push(px);
      s+=drawTwo(e,[[px,n.y],[px,yg]],0,e.pins[0]==='0')+dot(px,yg);if(k+deg>=3||k>1)s+=dot(px,n.y)});
    if(!k&&deg>=3)s+=dot(n.xl,n.y);
    s+=T(n.xl-8,n.y-8,n.n,{a:'end',s:11,c:ACC,b:1});
  });
  if(xs.length){const a=Math.min(...xs)-30,b=Math.max(...xs)+30,g=(a+b)/2;
    s+=`<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><path d="M${a} ${yg}H${b}M${g} ${yg}V${yg+12}M${g-14} ${yg+12}H${g+14}M${g-9} ${yg+18}H${g+9}M${g-4} ${yg+24}H${g+4}"/></g>`+T(g+22,yg+26,'GND (0)',{a:'start',s:11,c:'var(--mut)'})}
  let hx=nl?cx[nl-1]+(km[nl-1]-1)*DW+270:170,hy=100;
  hubs.forEach(e=>{const[g,h]=drawHub(e,hx,hy+h0(e));s+=g;hy+=h+40});
  if(!M.els.some(e=>e.pins.includes('0')))M.warn.push('No ground node (0) — NGspice needs one');
  return s;
}
const h0=e=>e.hub==='B'?40:20;

/* ---------- view ---------- */
let vb={x:0,y:0,w:800,h:500},touched=false;
const setVB=()=>{svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);placePop()};
function fit(){
  const b=$('#scene').getBBox();if(!b.width)return;const r=svg.getBoundingClientRect(),ar=(r.width/r.height)||1.5,p=50;
  let w=b.width+2*p,h=b.height+2*p;if(w/h<ar)w=h*ar;else h=w/ar;
  vb={x:b.x+b.width/2-w/2,y:b.y+b.height/2-h/2,w,h};setVB();
}
function render(){
  const M=parse(src.value);LM=M;let s='';
  try{s=build(M)}catch(err){M.errs.push({n:0,m:'Layout error: '+err.message})}
  $('#scene').innerHTML=s;$('#ttl').textContent=M.title;
  $('#dirs').innerHTML=M.dirs.length?M.dirs.map(d=>`<span class="chip">${esc(d)}</span>`).join(''):'<span class="hint">No dot-commands (.tran, .ac, .op …) in this netlist</span>';
  const nets=new Set();M.els.forEach(e=>e.pins.forEach(p=>nets.add(p)));
  $('#status').innerHTML=(M.errs.length?'':`<div class="ok">✓ ${M.els.length} elements · ${nets.size} nets</div>`)+
    M.errs.map(x=>`<div class="er">Line ${x.n+1}: ${esc(x.m)}</div>`).join('')+M.warn.map(w=>`<div class="wn">⚠ ${esc(w)}</div>`).join('')+
    '<div class="hint">First line is the title (SPICE convention). Continuation lines start with +.</div>';
  if(!touched)fit();
  if(selN&&!cur())selN=null;if(!document.activeElement.closest('#pop'))showProps();hilite();
  if($('#auto').checked)schedSim();
}
let tm;src.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(render,150)});
/* (click handling is in the properties section) */
/* pan & zoom */
let drag=null,moved=false;
svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};moved=false});
addEventListener('pointerup',()=>drag=null);
addEventListener('pointermove',e=>{if(!drag)return;const r=svg.getBoundingClientRect(),dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(!moved)return;
  vb.x-=dx*vb.w/r.width;vb.y-=dy*vb.h/r.height;drag={x:e.clientX,y:e.clientY};touched=true;setVB()});
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect(),f=e.deltaY<0?.87:1.15,sx=(e.clientX-r.left)/r.width,sy=(e.clientY-r.top)/r.height;
  vb.x+=vb.w*(1-f)*sx;vb.y+=vb.h*(1-f)*sy;vb.w*=f;vb.h*=f;touched=true;setVB()},{passive:false});
addEventListener('resize',()=>{if(!touched)fit()});
/* toolbar */
const sel=$('#ex');sel.innerHTML=Object.keys(EX).map(k=>`<option>${k}</option>`).join('');
sel.onchange=()=>{src.value=EX[sel.value];touched=false;render()};
$('#bFit').onclick=()=>{touched=false;fit()};
$('#bTheme').onclick=()=>{const r=document.documentElement,d=getComputedStyle(r).colorScheme==='dark';r.dataset.theme=d?'light':'dark'};
const dl=(name,txt,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
const fn=()=>($('#fname').value.trim().replace(/\.(cir|svg)$/i,'').replace(/[\\/:*?"<>|]+/g,'_'))||'circuit';
$('#bCir').onclick=()=>dl(fn()+'.cir',src.value,'text/plain');
$('#bCopy').onclick=async e=>{try{await navigator.clipboard.writeText(src.value)}catch(_){src.select();document.execCommand('copy')}e.target.textContent='Copied ✓';setTimeout(()=>e.target.textContent='Copy',1200)};
$('#bSvg').onclick=()=>{const b=$('#scene').getBBox(),p=40;
  dl(fn()+'.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-p} ${b.y-p} ${b.width+2*p} ${b.height+2*p}" width="${b.width+2*p}" height="${b.height+2*p}" style="color:#13293d"><rect x="${b.x-p}" y="${b.y-p}" width="100%" height="100%" fill="#fff"/>${$('#scene').innerHTML.replace(/var\(--mut\)/g,'#5b7088').replace(/var\(--canvas\)/g,'#fff')}</svg>`,'image/svg+xml')};
/* ---------- results UI ---------- */
let LM,RES=null,TAB='op',selN=null,simT;const PL={},SEL={dc:new Set(),ac:new Set(),tran:new Set()};
const COL=['#2b8fd6','#e8590c','#2f9e44','#ae3ec9','#f08c00','#1098ad','#d6336c','#5c7cfa'];
const col=(tr,arr)=>Array.from(arr,x=>tr.f(i=>x[i]));
function ticks(lo,hi,n){const r=hi-lo||1,s0=r/n,p=Math.pow(10,Math.floor(Math.log10(s0))),f=s0/p,st=(f<1.5?1:f<3?2:f<7?5:10)*p,o=[];for(let v=Math.ceil(lo/st-1e-9)*st;v<=hi+st*1e-9;v+=st)o.push(+v.toPrecision(12));return o}
function plot(o,id){
  o.id=id;PL[id]=o;const W=720,H=o.H||230,L=64,Rr=12,Tp=10,B=34,pw=W-L-Rr,ph=H-Tp-B,xs=o.xs,fx=o.xlog?Math.log10:v=>v;
  let x0=fx(xs[0]),x1=fx(xs[xs.length-1]);if(x1===x0)x1=x0+1;
  let lo=Infinity,hi=-Infinity;o.series.forEach(s=>s.ys.forEach(v=>{if(isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v)}}));
  if(!isFinite(lo)){lo=0;hi=1}if(hi-lo<1e-9*Math.max(1,Math.abs(hi))){const c=Math.max(1,Math.abs(hi))*.1;lo-=c;hi+=c}
  const pd=(hi-lo)*.06;lo-=pd;hi+=pd;
  const X=v=>L+(fx(v)-x0)/(x1-x0)*pw,Y=v=>Tp+(1-(v-lo)/(hi-lo))*ph;let g='';
  ticks(lo,hi,5).forEach(v=>{g+=`<path d="M${L} ${Y(v)}H${W-Rr}" stroke="var(--grid)"/>`+T(L-6,Y(v)+4,eng(v),{a:'end',s:10.5,c:'var(--mut)'})});
  const xt=o.xlog?(()=>{const a=[];for(let e=Math.ceil(x0-1e-9);e<=x1+1e-9;e++)a.push(Math.pow(10,e));return a})():ticks(xs[0],xs[xs.length-1],6);
  xt.forEach(v=>{g+=`<path d="M${X(v)} ${Tp}V${Tp+ph}" stroke="var(--grid)"/>`+T(X(v),H-B+14,eng(v),{s:10.5,c:'var(--mut)'})});
  o.series.forEach(s=>{let d='';s.ys.forEach((v,i)=>{if(isFinite(v))d+=(d?'L':'M')+X(xs[i]).toFixed(1)+' '+Y(v).toFixed(1)});g+=`<path d="${d}" fill="none" stroke="${s.c}" stroke-width="1.8" stroke-linejoin="round"/>`});
  g+=`<path d="M${L} ${Tp}V${Tp+ph}H${W-Rr}" fill="none" stroke="var(--mut)"/>`+T(L+pw/2,H-4,o.xl,{s:11,c:'var(--mut)'})+`<text transform="translate(12 ${Tp+ph/2}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--mut)">${esc(o.yl)}</text>`;
  return `<div class="plot" data-id="${id}"><svg viewBox="0 0 ${W} ${H}" data-geom="${[L,pw,x0,x1,Tp,ph].join(',')}" style="position:static;width:100%;height:auto;cursor:crosshair;touch-action:pan-y">${g}<path class="xh" d="" stroke="var(--mut)" stroke-dasharray="3 3"/></svg><div class="rd">&nbsp;</div></div>`}
function chips(kind,R){const trs=R.tr,S=SEL[kind],sig=trs.map(t=>t.name).join();
  if(S.sig!==sig){S.sig=sig;S.clear();trs.filter(t=>t.k==='v').slice(0,kind==='ac'?2:4).forEach(t=>S.add(t.name))}
  return `<div class="chips">`+trs.map((t,i)=>`<label class="tr"><input type="checkbox" data-k="${kind}" value="${esc(t.name)}" ${S.has(t.name)?'checked':''}><i style="background:${COL[i%8]}"></i>${esc(t.name)}</label>`).join('')+'</div>'}
function opHTML(R){const C=R.C,x=R.op.x,rows=R.rows;
  return `<div class="two"><table><tr><th>Node</th><th>Voltage</th></tr>${Object.keys(C.idx).map(n=>`<tr><td>v(${esc(n)})</td><td>${eng(x[C.idx[n]])}V</td></tr>`).join('')}</table>
  <table><tr><th>Element</th><th>V across</th><th>I into n1</th><th>P absorbed</th></tr>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${eng(r[1])}V</td><td>${eng(r[2])}A</td><td>${eng(r[3])}W</td></tr>`).join('')}</table></div>`}
function showTab(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===TAB));
  const R=RES,o=$('#out'),S=$('#simst');if(!R){o.innerHTML='';S.innerHTML='';return}
  S.innerHTML=(R.errs.length?`<span class="er">${R.errs.map(esc).join(' · ')}</span>`:`<span class="ok">✓ ${['op','dc','ac','tran'].filter(k=>R[k]).join(' · ')} · ${R.ms.toFixed(0)} ms</span>`)+R.warn.map(w=>` <span class="wn">⚠ ${esc(w)}</span>`).join('');
  if(!R.op){o.innerHTML='';return}
  let h='';const K=TAB;
  if(K==='op')h=opHTML(R);
  else if(!R[K])h=`<p class="hint">No ${{dc:'.dc',ac:'.ac',tran:'.tran'}[K]} analysis in the netlist — pick one from <b>＋ Analysis</b> above the editor, or type the dot-command.</p>`;
  else{const tr=R.tr,cl=t=>COL[tr.indexOf(t)%8];h=chips(K,R);const sl=tr.filter(t=>SEL[K].has(t.name));
    if(!sl.length)h+='<p class="hint">Tick a trace above.</p>';
    else if(K==='dc'){const d=R.dc;h+=plot({xs:d.xs,series:sl.map(t=>({name:t.name,ys:col(t,d.X),c:cl(t)})),xl:d.src+(d.cur?' (A)':' (V)'),yl:'V / A'},'dc')}
    else if(K==='tran'){const d=R.tran;h+=plot({xs:d.t,series:sl.map(t=>({name:t.name,ys:col(t,d.X),c:cl(t)})),xl:'time (s)',yl:'V / A'},'tr')}
    else{const a=R.ac,lg=a.type!=='lin',S2=sl.map(t=>{const re=col(t,a.re),im=col(t,a.im);return{name:t.name,c:cl(t),db:re.map((r,i)=>20*Math.log10(Math.max(Math.hypot(r,im[i]),1e-30))),ph:re.map((r,i)=>Math.atan2(im[i],r)*180/Math.PI)}});
      h+=plot({xs:a.f,xlog:lg,series:S2.map(s=>({name:s.name,ys:s.db,c:s.c})),xl:'frequency (Hz)',yl:'magnitude (dB)'},'am');
      const s0=S2[0],ref=s0.db[0],j=s0.db.findIndex((v,i)=>i>0&&v<=ref-3);
      if(j>0){const f=Math.pow(10,Math.log10(a.f[j-1])+(ref-3-s0.db[j-1])/(s0.db[j]-s0.db[j-1])*(Math.log10(a.f[j])-Math.log10(a.f[j-1])));h+=`<p class="hint">−3 dB below the low-frequency level of ${esc(s0.name)} at ≈ <b>${eng(f)}Hz</b></p>`}
      h+=plot({xs:a.f,xlog:lg,series:S2.map(s=>({name:s.name,ys:s.ph,c:s.c})),xl:'frequency (Hz)',yl:'phase (°)'},'ap')}}
  o.innerHTML=h}
function runSimUI(){const t0=performance.now();let R;
  if(LM.errs.length)R={errs:['Fix the netlist errors on the left first'],warn:[]};
  else try{R=runSim(LM)}catch(err){R={errs:['Simulator error: '+err.message],warn:[]}}
  R.ms=performance.now()-t0;RES=R;if(R.op&&TAB!=='op'&&!R[TAB])TAB='op';showTab()}
const schedSim=()=>{clearTimeout(simT);simT=setTimeout(runSimUI,120)};
/* plot hover readout */
$('#out').addEventListener('pointermove',e=>{const s=e.target.closest('svg[data-geom]');if(!s)return;
  const pl=PL[s.parentNode.dataset.id],[L,pw,x0,x1,Tp,ph]=s.dataset.geom.split(',').map(Number),r=s.getBoundingClientRect();
  const f=Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*720-L)/pw)),xv=pl.xlog?Math.pow(10,x0+f*(x1-x0)):x0+f*(x1-x0),xs=pl.xs;
  let a=0,b=xs.length-1;while(b-a>1){const m=(a+b)>>1;xs[m]<xv?a=m:b=m}const i=Math.abs(xs[a]-xv)<Math.abs(xs[b]-xv)?a:b;
  const px=L+((pl.xlog?Math.log10(xs[i]):xs[i])-x0)/(x1-x0)*pw;
  s.querySelector('.xh').setAttribute('d',`M${px} ${Tp}V${Tp+ph}`);
  s.parentNode.querySelector('.rd').innerHTML=`<span>${eng(xs[i])}</span>`+pl.series.map(q=>`<span style="color:${q.c}">${esc(q.name)} = ${eng(q.ys[i])}</span>`).join('')});
$('#out').addEventListener('change',e=>{const c=e.target.closest('input[data-k]');if(!c)return;const S=SEL[c.dataset.k];c.checked?S.add(c.value):S.delete(c.value);showTab()});
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b){TAB=b.dataset.t;showTab()}};
$('#bRun').onclick=runSimUI;
$('#auto').onchange=e=>{if(e.target.checked)schedSim()};
/* properties: floating editor on the drawing, writes straight back to the netlist */
const cur=()=>LM&&LM.els.find(x=>x.n===selN);
const PLB={R:'Resistance (Ω)',C:'Capacitance (F)',L:'Inductance (H)',V:'Source',I:'Source',D:'Diode model',Q:'BJT model',M:'MOS model / W L',E:'Gain',G:'Gain (S)'};
const PRE={V:['DC 5','DC 12','AC 1','SIN(0 1 1k)','SIN(0 1 1k) AC 1','PULSE(0 5 0 1n 1n 1m 2m)'],I:['DC 1m','AC 1m','SIN(0 1m 1k)']};
function placePop(){const P=$('#pop'),e=selN&&cur(),g=e&&[...svg.querySelectorAll('[data-n]')].find(n=>n.dataset.n===selN);
  if(!g){P.style.display='none';return}
  const r=g.getBoundingClientRect(),c=$('#cv').getBoundingClientRect();P.style.display='block';
  const w=P.offsetWidth||260,h=P.offsetHeight||200;let x=r.right-c.left+12,y=r.top-c.top-10;
  if(x+w>c.width-6)x=r.left-c.left-w-12;x=Math.max(6,Math.min(x,c.width-w-6));y=Math.max(6,Math.min(y,c.height-h-6));
  P.style.left=x+'px';P.style.top=y+'px'}
function showProps(){const e=cur(),P=$('#pop');if(!e){P.style.display='none';P.innerHTML='';return}
  const m=/^(dc\s+)?([-+.\w]+)$/i.exec(e.tail.trim()),b0=m&&'RCLVI'.includes(e.k)?num(m[2]):NaN,sl=isFinite(b0)&&b0!==0;
  P.innerHTML=`<div class="ph"><b>${esc(e.n)}</b><span class="hint">${esc(e.k)} · line ${e.line+1}</span><button id="pX" title="Close">✕</button></div>
  <label>${PLB[e.k]||'Value'}<input type="text" id="pV" value="${esc(e.tail)}" autocomplete="off" spellcheck="false"></label>`+
  (PRE[e.k]?`<label>Preset<select id="pP"><option value="">choose…</option>${PRE[e.k].map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`:'')+
  (sl?`<label>Adjust<input type="range" id="pS" min="-100" max="100" value="0" data-b="${b0}" data-p="${esc(m[1]||'')}"></label>`:'')+
  `<label>Nodes<input type="text" id="pN" value="${esc(e.nodes.join(' '))}" autocomplete="off" spellcheck="false"></label>
  <code id="pCode">${esc((e.n+' '+e.nodes.join(' ')+' '+e.tail).trim())}</code><div class="pf"><span class="hint">Edits update the NGspice code live</span><button id="pD">Delete</button></div>`;
  placePop();const v=$('#pV');if(v&&!/Mobi/.test(navigator.userAgent)){v.focus();v.select()}}
const closePop=()=>{selN=null;showProps();hilite()};
$('#pop').addEventListener('input',ev=>{const e=cur();if(!e)return;const id=ev.target.id;
  if(id==='pS'){const v=+ev.target.dataset.b*Math.pow(10,ev.target.value/100);$('#pV').value=ev.target.dataset.p+eng(v,true)}
  else if(id==='pP'){if(!ev.target.value)return;$('#pV').value=ev.target.value}
  else if(id!=='pN'&&id!=='pV')return;
  const line=`${e.n} ${$('#pN').value.trim()} ${$('#pV').value.trim()}`.replace(/\s+/g,' ').trim(),ls=src.value.split('\n'),n=e.line;
  ls.splice(n,e.span,line);src.value=ls.join('\n');$('#pCode').textContent=line;
  const lh=parseFloat(getComputedStyle(src).lineHeight)||20;if(n*lh<src.scrollTop||n*lh>src.scrollTop+src.clientHeight-lh*2)src.scrollTop=Math.max(0,n*lh-src.clientHeight/2);
  render()});
$('#pop').addEventListener('click',ev=>{const id=ev.target.id;if(id==='pX')closePop();
  if(id==='pD'){const e=cur();if(!e)return;const ls=src.value.split('\n');ls.splice(e.line,e.span);src.value=ls.join('\n');selN=null;render()}});
addEventListener('keydown',ev=>{if(ev.key==='Escape'&&selN)closePop()});
function hilite(){svg.querySelectorAll('.sel').forEach(n=>n.classList.remove('sel'));
  if(selN){const g=[...svg.querySelectorAll('[data-n]')].find(n=>n.dataset.n===selN);if(g)g.classList.add('sel')}placePop()}
svg.addEventListener('click',ev=>{if(moved)return;const g=ev.target.closest('[data-n]');selN=g?g.dataset.n:null;showProps();hilite()});
$('#addan').onchange=ev=>{const k=ev.target.value;ev.target.value='';if(!k)return;
  const vs=LM.els.find(x=>x.k==='V'),L={op:'.op',dc:`.dc ${vs?vs.n:'V1'} 0 5 0.1`,ac:'.ac dec 20 10 100k',tran:'.tran 10u 5m'}[k],ls=src.value.replace(/\s+$/,'').split('\n');
  if(k==='ac'&&vs&&vs.span===1&&!/\bac\b/i.test(vs.val))ls[vs.line]=`${vs.n} ${vs.nodes.join(' ')} ${vs.tail} AC 1`.replace(/\s+/g,' ');
  const ei=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));ei>=0?ls.splice(ei,0,L):ls.push(L);
  src.value=ls.join('\n');if(k!=='op')TAB=k;render()};

src.value=EX[sel.value];render();
