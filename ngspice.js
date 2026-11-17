
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cut=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
const gnd=n=>{n=n.toLowerCase();return n==='gnd'?'0':n};

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
  const M={title:'Circuit',els:[],dirs:[],errs:[],warn:[]};let sub=0,blk=null,first=true,ctl=0;
  for(const l of L){
    let s=l.t;if(!s)continue;
    if(/^\.control/i.test(s)){ctl=1;continue}if(/^\.endc/i.test(s)){ctl=0;continue}
    if(ctl){const m=/^(tran|ac|dc|op)\b/i.exec(s);if(m&&!M.dirs.some(d=>new RegExp('^\\.'+m[1]+'(\\s|$)','i').test(d)))M.dirs.push('.'+s.replace(/\s+/g,' '));continue}
    if(first){first=false;
      if(s[0]==='*'){M.title=s.replace(/^\*+\s*/,'')||M.title;continue}
      if(s[0]!=='.'){const p=parseEl(s);
        if(p.err||!/^[A-Za-z][A-Za-z0-9_]{0,5}$/.test(s.split(/\s+/)[0])){M.title=s;continue}}}
    if(s[0]==='*'||s[0]===';')continue;
    s=s.replace(/\s*[;$].*$/,'');
    if(blk){if(!s)continue;blk.push(s);const dl=s.toLowerCase();if(/^\.subckt/.test(dl))sub++;else if(/^\.ends/.test(dl)){sub--;if(sub<=0){M.dirs.push(blk.join('\n'));blk=null;sub=0}}continue}
    if(s[0]==='.'){const d=s.toLowerCase();
      if(/^\.subckt/.test(d)){blk=[s];sub=1;continue}
      if(/^\.ends/.test(d))continue;
      if(!/^\.end$/.test(d))M.dirs.push(s);continue}
    const p=parseEl(s);
    if(p.err){M.errs.push({n:l.n,m:`${s.split(/\s+/)[0]}: ${p.err}`});continue}
    p.line=l.n;p.span=l.e-l.n+1;M.els.push(p);
  }
  if(blk)M.dirs.push(blk.join('\n')+'\n.ends');
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
/* ---------- CMOS cell library + 555 + subcircuit flattening ---------- */
const BUILTIN555=/^(ne555|lm555|ne555p|ne555d|sa555|tlc555|lmc555|ca555|555)$/i;
const CMOS_MODELS=['.model NM NMOS(Vto=0.7 Kp=200u Lambda=0.02)','.model PM PMOS(Vto=-0.7 Kp=100u Lambda=0.02)'];
const CELLS={
INV:['A Y VDD VSS','MP1 Y A VDD VDD PM W=4u L=1u','MN1 Y A VSS VSS NM W=2u L=1u','CL Y VSS 50f'],
BUF:['A Y VDD VSS','XI1 A m VDD VSS INV','XI2 m Y VDD VSS INV'],
NAND2:['A B Y VDD VSS','MP1 Y A VDD VDD PM W=4u L=1u','MP2 Y B VDD VDD PM W=4u L=1u','MN1 Y A x VSS NM W=4u L=1u','MN2 x B VSS VSS NM W=4u L=1u','CL Y VSS 50f'],
NOR2:['A B Y VDD VSS','MP1 x A VDD VDD PM W=8u L=1u','MP2 Y B x VDD PM W=8u L=1u','MN1 Y A VSS VSS NM W=2u L=1u','MN2 Y B VSS VSS NM W=2u L=1u','CL Y VSS 50f'],
AND2:['A B Y VDD VSS','XN1 A B m VDD VSS NAND2','XI1 m Y VDD VSS INV'],
OR2:['A B Y VDD VSS','XN1 A B m VDD VSS NOR2','XI1 m Y VDD VSS INV'],
XOR2:['A B Y VDD VSS','XN1 A B n1 VDD VSS NAND2','XN2 A n1 n2 VDD VSS NAND2','XN3 B n1 n3 VDD VSS NAND2','XN4 n2 n3 Y VDD VSS NAND2'],
XNOR2:['A B Y VDD VSS','XX1 A B m VDD VSS XOR2','XI1 m Y VDD VSS INV'],
NAND3:['A B C Y VDD VSS','MP1 Y A VDD VDD PM W=4u L=1u','MP2 Y B VDD VDD PM W=4u L=1u','MP3 Y C VDD VDD PM W=4u L=1u','MN1 Y A x1 VSS NM W=6u L=1u','MN2 x1 B x2 VSS NM W=6u L=1u','MN3 x2 C VSS VSS NM W=6u L=1u','CL Y VSS 50f'],
NOR3:['A B C Y VDD VSS','MP1 x1 A VDD VDD PM W=12u L=1u','MP2 x2 B x1 VDD PM W=12u L=1u','MP3 Y C x2 VDD PM W=12u L=1u','MN1 Y A VSS VSS NM W=2u L=1u','MN2 Y B VSS VSS NM W=2u L=1u','MN3 Y C VSS VSS NM W=2u L=1u','CL Y VSS 50f'],
AND3:['A B C Y VDD VSS','XN1 A B C m VDD VSS NAND3','XI1 m Y VDD VSS INV'],
OR3:['A B C Y VDD VSS','XN1 A B C m VDD VSS NOR3','XI1 m Y VDD VSS INV']};
const NE555_SUB=['.subckt NE555 GND TRIG OUT RESET CTRL THRESH DISCH VCC','R_div1 VCC CTRL 5k','R_div2 CTRL V_third 5k','R_div3 V_third GND 5k',
'B_comp1 R_int 0 V = (V(THRESH) > V(CTRL)) ? 1 : 0','B_comp2 S_int 0 V = (V(TRIG) < V(V_third)) ? 1 : 0',
'B_latch Q_bar 0 V = (V(RESET) < 0.7) ? 1 : ((V(R_int) > 0.5) ? 1 : ((V(S_int) > 0.5) ? 0 : V(Q_bar_del)))',
'R_del Q_bar Q_bar_del 100','C_del Q_bar_del 0 10p IC=0','B_out OUT 0 V = (V(Q_bar_del) < 0.5) ? (V(VCC) - 1.2) : 0.1',
'S_disch DISCH GND Q_bar_del 0 SW_DISCH','.model SW_DISCH SW(Ron=10 Roff=10Meg Vt=0.5 Vh=0.05)','.ends NE555'];
const cellText=n=>['.subckt '+n+' '+CELLS[n][0],...CELLS[n].slice(1),'.ends '+n].join('\n');
const subName=l=>{const m=/^X\S*\s.*\s(\S+)$/.exec(l.trim());return m?m[1]:null};
/* netlist lines needed so the exported netlist is complete for real ngspice */
function libFor(names,dirs){
  const have=new Set(),hm=new Set(),out=[],seen=new Set();let cm=false;
  dirs.forEach(d=>{let m=/^\.subckt\s+(\S+)/i.exec(d);if(m)have.add(m[1].toLowerCase());m=/^\.model\s+(\S+)/i.exec(d);if(m)hm.add(m[1].toLowerCase())});
  const add=n=>{n=String(n||'').trim();const u=n.toUpperCase();if(!n||seen.has(u))return;seen.add(u);
    if(BUILTIN555.test(n)){if(!have.has(n.toLowerCase()))out.push(NE555_SUB.join('\n').replace(/NE555/g,u));return}
    const c=CELLS[u];if(!c||have.has(n.toLowerCase()))return;
    c.slice(1).forEach(l=>{const s=subName(l);if(s)add(s)});out.push(cellText(u));cm=true};
  names.forEach(add);
  if(cm)CMOS_MODELS.slice().reverse().forEach(l=>{if(!hm.has(l.split(/\s+/)[1].toLowerCase()))out.unshift(l)});
  return out}
const exNet=lines=>{const names=lines.map(subName).filter(Boolean);return lines.concat(libFor(names,lines),['.end']).join('\n')};
function subDefs(dirs){const D={};
  dirs.forEach(d=>{if(!/^\.subckt/i.test(d))return;const L=d.split('\n'),h=L[0].trim().split(/\s+/),name=(h[1]||'').toLowerCase(),ports=[];
    for(const w of h.slice(2)){if(/=/.test(w)||/^params:?$/i.test(w))break;ports.push(w.toLowerCase())}
    const els=[];L.slice(1).forEach(l=>{l=l.trim();if(!l||l[0]==='.'||l[0]==='*')return;const p=parseEl(l);if(!p.err)els.push(p)});D[name]={ports,els}});return D}
const _cd={};
function cellDef(n){if(!CELLS[n])return null;if(!_cd[n]){const c=CELLS[n];_cd[n]={ports:c[0].toLowerCase().split(' '),els:c.slice(1).map(l=>parseEl(l)).filter(p=>!p.err)}}return _cd[n]}
function flatten(M,out){
  const defs=subDefs(M.dirs),els=[],t555=[];
  const go=(e,d)=>{const nm=String(e.val||e.tail).trim(),low=nm.toLowerCase();
    if(BUILTIN555.test(nm)){if(e.pins.length!==8)out.errs.push(e.n+': a 555 timer needs 8 pins (GND TRIG OUT RESET CTRL THRESH DISCH VCC)');else t555.push({n:e.n,pins:e.pins});return}
    const def=defs[low]||cellDef(nm.toUpperCase());
    if(!def){out.warn.push(`${e.n}: subcircuit “${nm}” is not defined`);return}
    if(def.ports.length!==e.pins.length){out.errs.push(`${e.n}: ${nm} expects ${def.ports.length} nodes, got ${e.pins.length}`);return}
    if(d>8){out.errs.push(e.n+': subcircuit nesting is too deep');return}
    const map={},pre=e.n+'.';def.ports.forEach((p,i)=>{map[p]=e.pins[i]});
    def.els.forEach(q=>{const c=Object.assign({},q,{n:pre+q.n,pins:q.pins.map(n=>{const l=n.toLowerCase();return n==='0'?'0':(l in map?map[l]:pre+l)})});
      if(q.k==='X')go(c,d+1);else els.push(c)})};
  M.els.forEach(e=>e.k==='X'?go(e,0):els.push(e));
  return{els,t555}}
/* 555 timer: 3×5k divider, two comparators, SR latch (state), Thevenin output, discharge switch */
function q555(d,x){const V=i=>i<0?0:x[i];let q=d.q;
  if(V(d.rs)-V(d.gn)<.7||V(d.th)>V(d.ct))q=0;else if(V(d.tr)<V(d.nt))q=1;
  const ch=q!==d.q;d.q=q;return ch}
function compile(M,out){
  const mod={};M.dirs.forEach(d=>{const m=/^\.model\s+(\S+)\s+(\w+)\s*\(?([^)]*)\)?/i.exec(d);if(m){const p={};m[3].split(/[\s,()]+/).forEach(kv=>{const q=kv.split('=');if(q.length===2)p[q[0].toLowerCase()]=num(q[1])});mod[m[1].toLowerCase()]={type:m[2].toLowerCase(),p}}});
  if(!mod.nm)mod.nm={type:'nmos',p:{vto:.7,kp:2e-4,lambda:.02}};if(!mod.pm)mod.pm={type:'pmos',p:{vto:-.7,kp:1e-4,lambda:.02}};
  const F=flatten(M,out),EL=F.els;
  const idx={};let nn=0;EL.forEach(e=>e.pins.forEach(p=>{if(p!=='0'&&!(p in idx))idx[p]=nn++}));F.t555.forEach(t=>{t.pins.forEach(p=>{if(p!=='0'&&!(p in idx))idx[p]=nn++});idx[t.n+'.third']=nn++});
  const I=n=>n==='0'?-1:idx[n];let nb=0;const devs=[],bad=(e,m)=>out.errs.push(e.n+': '+m);
  for(const e of EL){
    const p=e.pins.map(I),tk=(e.tail||'').split(/\s+/),v=num(tk[0]),K=e.k,m=mod[(tk[0]||'').toLowerCase()],P=m?m.p:{};let d=null;
    if(K==='R'){if(!(v>0)){bad(e,'invalid resistance');continue}d={t:'R',a:p[0],b:p[1],g:1/v}}
    else if(K==='C'){if(!(v>=0)){bad(e,'invalid capacitance');continue}d={t:'C',a:p[0],b:p[1],c:v,vp:0,ip:0,ic:(q=>q?num(q[1]):null)(/\bic\s*=\s*(\S+)/i.exec(e.tail))}}
    else if(K==='L'){if(!(v>0)){bad(e,'invalid inductance');continue}d={t:'L',a:p[0],b:p[1],l:v,k:nn+nb++,vp:0,ip:0}}
    else if(K==='V')d={t:'V',a:p[0],b:p[1],k:nn+nb++,s:spec(e.val)};
    else if(K==='I')d={t:'I',a:p[0],b:p[1],s:spec(e.val)};
    else if(K==='E'||K==='G'){if(isNaN(v)){bad(e,'invalid gain');continue}d={t:K,a:p[0],b:p[1],c:p[2],cb:p[3],g:v};if(K==='E')d.k=nn+nb++}
    else if(K==='D'){if(!m)out.warn.push(`${e.n}: model “${tk[0]}” not found, using defaults`);d={t:'D',a:p[0],b:p[1],is:P.is||1e-14,nf:P.n||1,v:0,bv:P.bv||0,ibv:P.ibv||1e-3}}
    else if(K==='Q'){if(!m)out.warn.push(`${e.n}: model “${tk[0]}” not found, using NPN defaults`);d={t:'Q',c:p[0],bb:p[1],e:p[2],sg:(m?m.type==='pnp':/pnp/i.test(tk[0]))?-1:1,is:P.is||1e-16,bf:P.bf||100,br:P.br||1,vbe:0,vbc:0}}
    else if(K==='M'){const pm=m?m.type==='pmos':/pmos/i.test(tk[0]),W=num((/\bw=(\S+)/i.exec(e.tail)||[])[1])||1,Ln=num((/\bl=(\S+)/i.exec(e.tail)||[])[1])||1;
      d={t:'M',d:p[0],g:p[1],s:p[2],sg:pm?-1:1,vto:P.vto!=null?Math.abs(P.vto):1,beta:(P.kp||2e-5)*W/Ln,lam:P.lambda||0}}
    else{out.warn.push(e.n+': element type '+K+' is drawn but not simulated');continue}
    d.nm=e.n;devs.push(d)}
  F.t555.forEach(t=>{const q=t.pins.map(I);devs.push({t:'T',nm:t.n,gn:q[0],tr:q[1],ou:q[2],rs:q[3],ct:q[4],th:q[5],di:q[6],vc:q[7],nt:I(t.n+'.third'),q:0,ro:10,ron:10,vd:1.2,vl:.1})});
  return{devs,t555:devs.filter(d=>d.t==='T'),idx,nn,nb,N:nn+nb,nl:devs.some(d=>'DQM'.includes(d.t)),lim:false}}
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
    else if(mode==='dc'&&C.uic&&d.ic!=null&&!isNaN(d.ic)){const G=1e4;ad(m,d.a,d.a,G);ad(m,d.b,d.b,G);ad(m,d.a,d.b,-G);ad(m,d.b,d.a,-G);rh(m,d.a,G*d.ic);rh(m,d.b,-G*d.ic)}
    else if(mode==='tran'){const g=(X.first?1:2)*d.c/X.h,ie=-g*d.vp-(X.first?0:d.ip);d.g=g;d.ie=ie;ad(m,d.a,d.a,g);ad(m,d.b,d.b,g);ad(m,d.a,d.b,-g);ad(m,d.b,d.a,-g);rh(m,d.a,-ie);rh(m,d.b,ie)}break;
  case'L':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);
    if(ac)ad(m,k,k,0,-X.w*d.l);else if(mode==='tran'){const c=(X.first?1:2)*d.l/X.h;ad(m,k,k,-c);rh(m,k,-c*d.ip-(X.first?0:d.vp))}break}
  case'V':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);
    if(ac){const p=d.s.acp*Math.PI/180;rh(m,k,d.s.acm*Math.cos(p),d.s.acm*Math.sin(p))}else rh(m,k,srcv(d,mode,X));break}
  case'I':if(ac){const p=d.s.acp*Math.PI/180,re=d.s.acm*Math.cos(p),im=d.s.acm*Math.sin(p);rh(m,d.a,-re,-im);rh(m,d.b,re,im)}else{const v=srcv(d,mode,X);rh(m,d.a,-v);rh(m,d.b,v)}break;
  case'E':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);ad(m,k,d.a,1);ad(m,k,d.b,-1);ad(m,k,d.c,-d.g);ad(m,k,d.cb,d.g);break}
  case'G':ad(m,d.a,d.c,d.g);ad(m,d.a,d.cb,-d.g);ad(m,d.b,d.c,-d.g);ad(m,d.b,d.cb,d.g);break;
  case'T':{const res=(a,b,g)=>{ad(m,a,a,g);ad(m,b,b,g);ad(m,a,b,-g);ad(m,b,a,-g)},G=1/5e3,go=1/d.ro;
    res(d.vc,d.ct,G);res(d.ct,d.nt,G);res(d.nt,d.gn,G);res(d.di,d.gn,d.q?1e-9:1/d.ron);ad(m,d.ou,d.ou,go);
    if(d.q){ad(m,d.ou,d.vc,-go);if(!ac)rh(m,d.ou,-go*d.vd)}else{ad(m,d.ou,d.gn,-go);if(!ac)rh(m,d.ou,go*d.vl)}break}
  default:{
    if(ac){d.ent.forEach(q=>ad(m,q[0],q[1],q[2]));break}
    const ent=[],rhs=[];
    if(d.t==='D'){const vt=.02585*d.nf,vc=vt*Math.log(vt/(1.414*d.is)),v=pnj(V(d.a)-V(d.b),d.v,vt,vc,C);d.v=v;
      const ex=Math.exp(Math.min(v/vt,80)),a=d.a,b=d.b;let i=d.is*(ex-1),g=d.is*ex/vt+1e-12;if(d.bv){const eb=d.ibv*Math.exp(Math.min(-(v+d.bv)/vt,80));i-=eb;g+=eb/vt}
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
  Object.keys(C.idx).forEach(n=>{if(n.includes('.')&&!n.endsWith('.third'))return;const i=C.idx[n];t.push({name:`v(${n})`,f:u=>u(i),k:'v'})});
  C.devs.forEach(d=>{if(d.t==='V'||d.t==='L'||d.t==='E')t.push({name:`i(${d.nm})`,f:u=>u(d.k),k:'i'});
    if(d.t==='R')t.push({name:`i(${d.nm})`,f:u=>(u0(u,d.a)-u0(u,d.b))*d.g,k:'i'})});return t}
function opRows(C,x){const V=i=>i<0?0:x[i],rows=[];
  C.devs.forEach(d=>{let v=0,i=0;
    switch(d.t){case'R':v=V(d.a)-V(d.b);i=v*d.g;break;case'C':v=V(d.a)-V(d.b);break;case'L':i=x[d.k];break;
      case'V':case'E':v=V(d.a)-V(d.b);i=x[d.k];break;case'I':v=V(d.a)-V(d.b);i=srcv(d,'dc',{sc:1});break;
      case'D':v=V(d.a)-V(d.b);i=d.i;break;case'Q':v=V(d.c)-V(d.e);i=d.ic;break;case'M':v=V(d.d)-V(d.s);i=d.id;break;
      case'G':v=V(d.a)-V(d.b);i=d.g*(V(d.c)-V(d.cb));break;case'T':v=V(d.vc)-V(d.gn);i=(V(d.vc)-V(d.ct))/5e3}
    rows.push([d.nm,v,i,v*i])});return rows}
function runSim(M){
  const R={errs:[],warn:[]},C=compile(M,R);R.C=C;
  if(R.errs.length)return R;
  if(!C.N){R.errs.push('Nothing to simulate');return R}
  R.tr=traces(C);const X={g:{},sc:1};
  const dirs=M.dirs.map(s=>s.trim().split(/\s+/)),find=k=>dirs.filter(t=>t[0].toLowerCase()==='.'+k);
  C.uic=find('tran').some(t=>t.slice(1).some(z=>z.toLowerCase()==='uic'));
  let x=op(C,X);if(x&&C.t555.length){for(let k=0;k<2;k++){if(!C.t555.some(d=>q555(d,x)))break;const y=op(C,X);if(!y)break;x=y}}
  if(!x){R.errs.push('DC operating point did not converge — check for floating nodes or loops of voltage sources');return R}
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
    const upd=()=>{C.t555.forEach(d=>q555(d,xc));C.devs.forEach(d=>{const V=i=>i<0?0:xc[i];
      if(d.t==='C'){const v=V(d.a)-V(d.b);d.ip=d.g*v+d.ie;d.vp=v}else if(d.t==='L'){d.ip=xc[d.k];d.vp=V(d.a)-V(d.b)}})};
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

/* symbols.js — realistic schematic symbols (LTspice-style), 1 grid unit = 10 px */
const U=10,rot=(x,y,r)=>[[x,y],[-y,x],[-x,-y],[y,-x]][r&3];
const sg=Math.sign;
const STY='fill="none" stroke="var(--sym)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const FIL='fill="var(--symf)" ';
const tx=(x,y,s,o={})=>`<text x="${x}" y="${y}" text-anchor="${o.a||'middle'}" font-size="${o.s||11}" ${o.b?'font-weight="700"':''} fill="${o.c||'var(--sym)'}" stroke="none" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${esc(s)}</text>`;
const srcKind=v=>/sin|ac\s/i.test(v)?'sin':/pulse/i.test(v)?'pulse':/pwl/i.test(v)?'pwl':'dc';
const resIEC={on:false};
const two=[['1',-3,0],['2',3,0]];
function mos(p,n4){ /* p: pmos */
  const top=p?'s':'d',bot=p?'d':'s';
  return `<path d="M-30 0H-9M-9-14V14M0-16V-9M0-4V4M0 9V16M0-12H20V-30M0 12H20V30" ${STY}/>`+
    (p?`<path d="M0 0H9" ${STY}/><path d="M9 0L2-3.5V3.5Z" fill="var(--sym)"/>`:`<path d="M2 0H20" ${STY}/><path d="M2 0L9-3.5V3.5Z" fill="var(--sym)"/>`)+
    (p?`<path d="M9 0H20" ${STY}/>`:'')+
    (n4?`<path d="M20 0H30" ${STY}/>`:`<path d="M20 0V${p?-12:12}" ${STY}/>`)}
function bjt(pnp){const arrow=pnp?`<path d="M3-9L10.8-9.9 7-15.7Z" fill="var(--sym)"/>`:`<path d="M17 18L13 11.3 9.2 17.1Z" fill="var(--sym)"/>`;
  return `<circle cx="8" cy="0" r="27" ${FIL}stroke="var(--sym)" stroke-width="1.6"/><path d="M-30 0H0M0-14V14M0-7L20-20V-30M0 7L20 20V30" ${STY}/>`+(pnp?`<path d="M0-7L20-20" ${STY}/>`:'')+arrow}
function diodeBase(){return `<path d="M-30 0H-8M8 0H30" ${STY}/><path d="M-8-12V12L8 0Z" ${FIL}stroke="var(--sym)" stroke-width="2" stroke-linejoin="round"/>`}
const ar=(x,y)=>`<path d="M${x} ${y}l8-8" ${STY}/><path d="M${x+8} ${y-8}l-5.5 1 4.5 4.5Z" fill="var(--sym)"/>`;
const SYMS={
R:{pre:'R',fmt:'two',pins:two,bb:[-2,-1,2,1],def:'1k',name:'Resistor',cat:'Passive',
  draw:()=>resIEC.on?`<path d="M-30 0H-20M20 0H30" ${STY}/><rect x="-20" y="-7" width="40" height="14" ${FIL}stroke="var(--sym)" stroke-width="2"/>`:`<path d="M-30 0H-21L-17.5-8-10.5 8-3.5-8 3.5 8 10.5-8 17.5 8 21 0H30" ${STY}/>`},
C:{pre:'C',fmt:'two',pins:two,bb:[-2,-1,2,1],def:'100n',name:'Capacitor',cat:'Passive',
  draw:()=>`<path d="M-30 0H-4M4 0H30M-4-14V14M4-14V14" ${STY}/>`},
Cp:{pre:'C',fmt:'two',pins:two,bb:[-2,-1,2,1],def:'10u',name:'Electrolytic cap',cat:'Passive',
  draw:()=>`<path d="M-30 0H-4M6 0H30M-4-14V14M9-14Q3 0 9 14" ${STY}/>`+tx(-12,-8,'+',{s:12,b:1})},
L:{pre:'L',fmt:'two',pins:two,bb:[-2,-1,2,1],def:'10m',name:'Inductor',cat:'Passive',
  draw:()=>`<path d="M-30 0H-20a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0H30" ${STY}/>`},
V:{pre:'V',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'DC 5',name:'Voltage source',cat:'Sources',
  draw:p=>{const k=srcKind(p.v||'');if(k==='dc')return `<path d="M-30 0H-4M4 0H30M-4-15V15M4-8V8" ${STY}/>`+tx(-14,-8,'+',{s:12,b:1});
    const ic={sin:'M-9 0q4.5-9 9 0t9 0',pulse:'M-9 5V-5H-1V5H7V-5',pwl:'M-9 5L-2-5 3 3 9-5'}[k];
    return `<path d="M-30 0H-14M14 0H30" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="${ic}" ${STY}/>`}},
I:{pre:'I',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'DC 1m',name:'Current source',cat:'Sources',
  draw:()=>`<path d="M-30 0H-14M14 0H30M-8 0H6" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="M8 0L1-4V4Z" fill="var(--sym)"/>`},
D:{pre:'D',fmt:'two',pins:[['1',-3,0],['2',3,0]],bb:[-2,-2,2,2],def:'1N4148',name:'Diode',cat:'Semiconductors',mdl:'D(Is=2.52n N=1.75)',
  draw:()=>diodeBase()+`<path d="M8-12V12" ${STY}/>`},
SCH:{pre:'D',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'1N5819',name:'Schottky diode',cat:'Semiconductors',mdl:'D(Is=3u N=1.1)',
  draw:()=>diodeBase()+`<path d="M5-9V-12H8V12H11V9" ${STY}/>`},
ZEN:{pre:'D',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'BZX5V1',name:'Zener diode',cat:'Semiconductors',mdl:'D(Is=1n N=1 Bv=5.1 Ibv=1m)',
  draw:()=>diodeBase()+`<path d="M4-14L8-12V12L12 14" ${STY}/>`},
LED:{pre:'D',fmt:'two',pins:two,bb:[-2,-3,2,2],def:'LED',name:'LED',cat:'Semiconductors',mdl:'D(Is=1e-18 N=2)',
  draw:()=>diodeBase()+`<path d="M8-12V12" ${STY}/>`+ar(-2,-14)+ar(6,-18)},
QN:{pre:'Q',fmt:'Q',pins:[['b',-3,0],['c',2,-3],['e',2,3]],bb:[-2,-2,2,2],def:'2N2222',name:'NPN transistor',cat:'Semiconductors',mdl:'NPN(Is=1e-14 Bf=200)',draw:()=>bjt(0)},
QP:{pre:'Q',fmt:'Q',pins:[['b',-3,0],['c',2,3],['e',2,-3]],bb:[-2,-2,2,2],def:'2N2907',name:'PNP transistor',cat:'Semiconductors',mdl:'PNP(Is=1e-14 Bf=100)',draw:()=>bjt(1)},
MN:{pre:'M',fmt:'M',pins:[['g',-3,0],['d',2,-3],['s',2,3]],bb:[-2,-2,2,2],def:'NM W=10u L=1u',name:'N-MOSFET',cat:'Semiconductors',mdl:'NMOS(Vto=1 Kp=100u Lambda=0.02)',draw:()=>mos(0,0)},
MP:{pre:'M',fmt:'M',pins:[['g',-3,0],['s',2,-3],['d',2,3]],bb:[-2,-2,2,2],def:'PM W=20u L=1u',name:'P-MOSFET',cat:'Semiconductors',mdl:'PMOS(Vto=-1 Kp=50u Lambda=0.02)',draw:()=>mos(1,0)},
MN4:{pre:'M',fmt:'M',pins:[['g',-3,0],['d',2,-3],['s',2,3],['b',3,0]],bb:[-2,-2,2,2],def:'NM W=10u L=1u',name:'N-MOSFET (4 pin)',cat:'Semiconductors',mdl:'NMOS(Vto=1 Kp=100u Lambda=0.02)',draw:()=>mos(0,1)},
MP4:{pre:'M',fmt:'M',pins:[['g',-3,0],['s',2,-3],['d',2,3],['b',3,0]],bb:[-2,-2,2,2],def:'PM W=20u L=1u',name:'P-MOSFET (4 pin)',cat:'Semiconductors',mdl:'PMOS(Vto=-1 Kp=50u Lambda=0.02)',draw:()=>mos(1,1)},
OA:{pre:'E',fmt:'OA',pins:[['inp',-4,-2],['inn',-4,2],['out',4,0]],bb:[-3,-3,3,3],def:'1e6',name:'Op-amp (ideal)',cat:'Active',
  draw:()=>`<path d="M-40-20H-30M-40 20H-30" ${STY}/><path d="M-30-40V40L40 0Z" ${FIL}stroke="var(--sym)" stroke-width="2" stroke-linejoin="round"/>`+tx(-22,-16,'+',{s:13,b:1})+tx(-22,24,'−',{s:13,b:1})},
EV:{pre:'E',fmt:'E',pins:[['p',0,-3],['n',0,3],['cp',-3,-1],['cn',-3,1]],bb:[-2,-2,2,2],def:'10',name:'VCVS (E)',cat:'Active',
  draw:()=>`<path d="M-30-10H-17M-30 10H-17M0-30V-28M0 28V30" ${STY}/><path d="M0-28L26 0 0 28-26 0Z" ${FIL}stroke="var(--sym)" stroke-width="2" stroke-linejoin="round"/>`+tx(0,-12,'+',{s:12,b:1})+tx(0,20,'−',{s:12,b:1})},
GV:{pre:'G',fmt:'E',pins:[['p',0,-3],['n',0,3],['cp',-3,-1],['cn',-3,1]],bb:[-2,-2,2,2],def:'1m',name:'VCCS (G)',cat:'Active',
  draw:()=>`<path d="M-30-10H-17M-30 10H-17M0-30V-28M0 28V30M0 14V-14" ${STY}/><path d="M0-28L26 0 0 28-26 0Z" ${FIL}stroke="var(--sym)" stroke-width="2" stroke-linejoin="round"/><path d="M0 14V-14" ${STY}/><path d="M0-14L-4-6H4Z" fill="var(--sym)"/>`},
GND:{pins:[['g',0,0]],bb:[0,0,0,0],name:'Ground',cat:'Nets',
  draw:()=>`<path d="M0 0V8M-11 8H11M-7 13H7M-3 18H3" ${STY}/>`},
LBL:{pins:[['n',0,0]],bb:[0,0,0,0],def:'out',name:'Net label',cat:'Nets',
  draw:p=>{const w=14+Math.max(2,(p.v||'').length)*7;return `<path d="M0 0H6" ${STY}/><path d="M6 0L12-8H${w}V8H12Z" ${FIL}stroke="var(--sym)" stroke-width="1.6" stroke-linejoin="round"/>`}},
BOX:{pre:'?',fmt:'BOX',pins:[],bb:[-4,-3,4,3],name:'Block',cat:'Nets',
  dyn:p=>{const n=p.np||2,l=Math.ceil(n/2),o=[];for(let i=0;i<n;i++){const L=i<l,j=L?i:i-l;o.push([String(i+1),L?-6:6,(j-(Math.max(l,n-l)-1)/2)*2|0])}return o},
  draw:p=>{const n=p.np||2,l=Math.ceil(n/2),h=Math.max(l,n-l,2)*20;let g=`<rect x="-50" y="${-h/2}" width="100" height="${h}" rx="4" ${FIL}stroke="var(--sym)" stroke-width="2"/>`+tx(0,4,p.n,{b:1});
    (SYMS.BOX.dyn(p)).forEach(([nm,dx,dy])=>{g+=`<path d="M${dx*10} ${dy*10}H${dx*5}" ${STY}/>`+tx(dx*5+(dx<0?5:-5),dy*10+4,nm,{a:dx<0?'start':'end',s:9,c:'var(--mut)'})});return g}}
};
/* ---- 555 timer IC + CMOS logic gate symbols ---- */
{const lg=(x,y,s,a)=>tx(x,y,s,{a,s:8.5,c:'var(--mut)'}),L=(y,s)=>lg(-36,y+3,s,'start'),Rr=(y,s)=>lg(36,y+3,s,'end');
SYMS.NE555={pre:'X',fmt:'X',order:['gnd','trig','out','rst','ctl','thr','dis','vcc'],
  pins:[['gnd',0,5],['trig',-5,-3],['out',5,-2],['rst',-5,3],['ctl',-5,1],['thr',-5,-1],['dis',5,2],['vcc',0,-5]],
  bb:[-4,-4,4,4],lw:58,ib:[-56,-56,60,56],def:'NE555',name:'555 Timer IC',cat:'ICs',sub:1,
  draw:()=>`<path d="M-50-30H-40M-50-10H-40M-50 10H-40M-50 30H-40M40-20H50M40 20H50M0-50V-40M0 40V50" ${STY}/><rect x="-40" y="-40" width="80" height="80" rx="4" ${FIL}stroke="var(--sym)" stroke-width="2"/>`+
    L(-30,'TRIG')+L(-10,'THR')+L(10,'CTRL')+L(30,'RST')+Rr(-20,'OUT')+Rr(20,'DIS')+lg(0,-30,'VCC','middle')+lg(0,36,'GND','middle')+tx(0,6,'555',{s:18,b:1})};
const BODY={and:'M-30-30H0A30 30 0 0 1 0 30H-30Z',or:'M-30-30C-10-30 18-24 30 0C18 24-10 30-30 30C-20 14-20-14-30-30Z',buf:'M-30-26V26L30 0Z',inv:'M-30-26V26L24 0Z'};
function gate(kind,bub,ys,xor){const sh=kind==='inv'?'inv':kind==='buf'?'buf':kind;
  let g=`<path d="${ys.map(y=>`M-40 ${y}H-20`).join('')}M0-40V-10M0 40V10" ${STY}/><path d="${BODY[sh]}" ${FIL}stroke="var(--sym)" stroke-width="2" stroke-linejoin="round"/>`;
  if(xor)g+=`<path d="M-38-30C-28-14-28 14-38 30" ${STY}/>`;
  const ox=kind==='inv'?24:30;
  g+=bub?`<circle cx="${ox+4}" cy="0" r="4" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="M${ox+8} 0H40" ${STY}/>`:`<path d="M30 0H40" ${STY}/>`;
  return g+tx(5,-32,'VDD',{a:'start',s:8,c:'var(--mut)'})+tx(5,38,'VSS',{a:'start',s:8,c:'var(--mut)'})}
const defG=(key,def,name,kind,bub,n,xor)=>{const ys=n===1?[0]:n===2?[-10,10]:[-20,0,20],ord=['A','B','C'].slice(0,n).concat(['Y','VDD','VSS']);
  SYMS[key]={pre:'X',fmt:'X',order:ord,pins:ys.map((y,i)=>[ord[i],-4,y/10]).concat([['Y',4,0],['VDD',0,-4],['VSS',0,4]]),bb:[-3,-3,3,3],lw:52,ib:[-46,-46,46,46],def,name,cat:'CMOS logic',sub:1,draw:()=>gate(kind,bub,ys,xor)}};
defG('G_INV','INV','NOT gate (inverter)','inv',1,1);defG('G_BUF','BUF','Buffer','buf',0,1);
defG('G_AND2','AND2','AND gate','and',0,2);defG('G_NAND2','NAND2','NAND gate','and',1,2);
defG('G_OR2','OR2','OR gate','or',0,2);defG('G_NOR2','NOR2','NOR gate','or',1,2);
defG('G_XOR2','XOR2','XOR gate','or',0,2,1);defG('G_XNOR2','XNOR2','XNOR gate','or',1,2,1);
defG('G_AND3','AND3','AND gate (3-in)','and',0,3);defG('G_NAND3','NAND3','NAND gate (3-in)','and',1,3);
defG('G_OR3','OR3','OR gate (3-in)','or',0,3);defG('G_NOR3','NOR3','NOR gate (3-in)','or',1,3)}
const GATE_BY_SUB={};Object.keys(SYMS).forEach(k=>{if(k.startsWith('G_'))GATE_BY_SUB[SYMS[k].def.toLowerCase()]=k});
function xType(e){const nm=(e.tail||'').trim().split(/\s+/)[0].toLowerCase(),n=e.pins.length;
  if(BUILTIN555.test(nm)&&n===8)return'NE555';const g=GATE_BY_SUB[nm];return g&&SYMS[g].order.length===n?g:'BOX'}
const bbOf=p=>{const S=SYMS[p.t];let b=S.bb;if(S.dyn){const n=p.np||2,h=Math.max(Math.ceil(n/2),2);b=[-5,-h,5,h]}return b};
function partPins(p){const S=SYMS[p.t],pins=S.dyn?S.dyn(p):S.pins;
  return pins.map(([nm,dx,dy])=>{const mx=p.m?-dx:dx,[rx,ry]=rot(mx,dy,p.r),ox=Math.abs(dx)>=Math.abs(dy)?sg(dx)||1:0,oy=ox?0:sg(dy),[qx,qy]=rot(p.m?-ox:ox,oy,p.r);
    return{name:nm,x:p.x+rx,y:p.y+ry,ox:qx,oy:qy}})}
function partBox(p){const b=bbOf(p),c=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(([x,y])=>rot(p.m?-x:x,y,p.r));
  return[p.x+Math.min(...c.map(q=>q[0])),p.y+Math.min(...c.map(q=>q[1])),p.x+Math.max(...c.map(q=>q[0])),p.y+Math.max(...c.map(q=>q[1]))]}
/* label placement (world px) */
function labelPos(p){const S=SYMS[p.t],x=p.x*U,y=p.y*U,vert=p.r%2===1;
  if(S.fmt==='two'){const up=S.bb[1]*U-12;return vert?{x:x+(S.bb[3]*U+10),y:y+2,a:'start',dy:12}:{x:x,y:y-(Math.abs(up)+4),a:'middle',dy:12,up:1}}
  if(p.t==='OA')return{x:x-4,y:y-42,a:'middle',dy:12,up:1};
  const w=(S.lw||(S.dyn?60:34));return{x:x+w,y:y-2,a:'start',dy:12}}
function drawPart(p,o={}){const S=SYMS[p.t],x=p.x*U,y=p.y*U;
  let g=`<g transform="translate(${x} ${y}) rotate(${p.r*90}) ${p.m?'scale(-1 1)':''}">${S.draw(p)}</g>`;
  if(p.t==='GND')return g;
  if(p.t==='LBL'){const l=(p.v||'').length*7+14;return g+(p.r===2?tx(x-14,y+3.5,p.v||'',{a:'end',b:1}):tx(x+14,y+3.5,p.v||'',{a:'start',b:1}))}
  const L=labelPos(p),v=p.v==null?'':String(p.v),nm=tx(L.x,L.up?L.y-12:L.y,p.n,{a:L.a,b:1,c:'var(--ink)'});
  g+=nm+tx(L.x,L.up?L.y:L.y+L.dy,cut(v,22),{a:L.a,s:10.5,c:'var(--mut)'});
  return g}
function iconSVG(k,sz,v){const p={t:k,x:0,y:0,r:0,v:v||SYMS[k].def||'',n:''},b=k==='OA'?[-48,-46,52,46]:k==='GND'?[-14,-4,14,22]:k==='LBL'?[-6,-12,64,12]:SYMS[k].fmt==='two'?[-34,-22,34,22]:(SYMS[k].ib||[-36,-36,40,36]);
  return `<svg viewBox="${b[0]} ${b[1]} ${b[2]-b[0]} ${b[3]-b[1]}" width="${sz||46}" height="${(sz||46)*(b[3]-b[1])/(b[2]-b[0])}">${SYMS[k].draw(p)}${k==='LBL'?tx(14,3.5,'out',{a:'start',b:1}):''}</svg>`}

/* schem.js — schematic model, net extraction, netlist generation, auto layout + wire router */
const K=(x,y)=>x+','+y;
const newModel=()=>({title:'New circuit',parts:[],wires:[],dirs:['.op'],seq:1});
const cloneM=M=>JSON.parse(JSON.stringify(M));
function extract(M){
  const par=new Map(),add=k=>{if(!par.has(k))par.set(k,k)},find=k=>{let r=k;while(par.get(r)!==r)r=par.get(r);while(par.get(k)!==r){const n=par.get(k);par.set(k,r);k=n}return r},
    uni=(a,b)=>{add(a);add(b);const ra=find(a),rb=find(b);if(ra!==rb)par.set(ra,rb)};
  const pins=[],pts=new Set(),segs=[];
  M.parts.forEach(p=>partPins(p).forEach(q=>{const k=K(q.x,q.y);add(k);pts.add(k);pins.push([p,q,k]);
    if(p.t==='GND')uni(k,'L:0');else if(p.t==='LBL'){const nm=(p.v||'').trim().toLowerCase();uni(k,'L:'+(nm==='gnd'||nm===''?'0':nm))}}));
  M.wires.forEach(w=>{w.pts.forEach(q=>{const k=K(q[0],q[1]);add(k);pts.add(k)});for(let i=0;i+1<w.pts.length;i++)segs.push({a:w.pts[i],b:w.pts[i+1],w})});
  segs.forEach(s=>uni(K(s.a[0],s.a[1]),K(s.b[0],s.b[1])));
  const P=[...pts].map(k=>{const[x,y]=k.split(',').map(Number);return[x,y,k]});
  segs.forEach(s=>{const[x1,y1]=s.a,[x2,y2]=s.b,h=y1===y2,v=x1===x2;if(!h&&!v)return;const xa=Math.min(x1,x2),xb=Math.max(x1,x2),ya=Math.min(y1,y2),yb=Math.max(y1,y2);
    for(const[x,y,k]of P)if(x>=xa&&x<=xb&&y>=ya&&y<=yb&&(h?y===y1:x===x1))uni(k,K(x1,y1))});
  const G=new Map(),g=r=>{if(!G.has(r))G.set(r,{hint:'',lbl:'',gnd:false});return G.get(r)};
  par.forEach((_,k)=>{if(k.startsWith('L:')){const o=g(find(k));if(k==='L:0')o.gnd=true;else if(!o.lbl)o.lbl=k.slice(2)}});
  M.wires.forEach(w=>{if(w.net&&w.pts.length){const o=g(find(K(w.pts[0][0],w.pts[0][1])));if(!o.hint)o.hint=w.net}});
  const name=new Map(),used=new Set(['0']);let ai=0;
  const roots=[];pins.forEach(([,,k])=>{const r=find(k);if(!roots.includes(r))roots.push(r)});segs.forEach(s=>{const r=find(K(s.a[0],s.a[1]));if(!roots.includes(r))roots.push(r)});
  roots.forEach(r=>{const o=g(r);if(o.gnd)name.set(r,'0');else if(o.lbl&&!used.has(o.lbl)){name.set(r,o.lbl);used.add(o.lbl)}});
  roots.forEach(r=>{if(name.has(r))return;const o=g(r);if(o.hint&&!used.has(o.hint)){name.set(r,o.hint);used.add(o.hint)}});
  roots.forEach(r=>{if(name.has(r))return;let n;do n='n'+(++ai);while(used.has(n));name.set(r,n);used.add(n)});
  const pin={};pins.forEach(([p,q,k])=>{pin[p.id+'.'+q.name]=name.get(find(k))});
  return{pin,segs:segs.map(s=>({a:s.a,b:s.b,w:s.w,net:name.get(find(K(s.a[0],s.a[1])))})),net:k=>name.get(find(k))}}
function genNetlist(M){
  const X=extract(M),L=['* '+(M.title||'Circuit')];
  M.parts.forEach(p=>{const S=SYMS[p.t];if(!S.pre)return;const g=n=>X.pin[p.id+'.'+n];let s;
    switch(S.fmt){case'two':s=`${p.n} ${g('1')} ${g('2')} ${p.v}`;break;case'Q':s=`${p.n} ${g('c')} ${g('b')} ${g('e')} ${p.v}`;break;
      case'M':s=`${p.n} ${g('d')} ${g('g')} ${g('s')} ${g('b')||g('s')} ${p.v}`;break;case'OA':s=`${p.n} ${g('out')} 0 ${g('inp')} ${g('inn')} ${p.v}`;break;
      case'E':s=`${p.n} ${g('p')} ${g('n')} ${g('cp')} ${g('cn')} ${p.v}`;break;
      case'X':s=`${p.n} ${S.order.map(g).join(' ')} ${p.v}`;break;
      case'BOX':s=`${p.n} ${Array.from({length:p.np||2},(_,i)=>g(String(i+1))).join(' ')} ${p.v}`;break}
    L.push(s.replace(/\s+/g,' ').trim())});
  return L.concat(M.dirs.length?M.dirs:['.op'],libFor(M.parts.filter(p=>SYMS[p.t].order).map(p=>p.v),M.dirs),['.end']).join('\n')}
/* ---- netlist → part types ---- */
function modsOf(P){const m={};P.dirs.forEach(d=>{const r=/^\.model\s+(\S+)\s+(\w+)\s*\(?(.*)/i.exec(d);if(r)m[r[1].toLowerCase()]={type:r[2].toLowerCase(),raw:r[3].toLowerCase()}});return m}
function typeFor(e,mods){const m0=(e.tail||'').split(/\s+/)[0]||'',m=m0.toLowerCase(),md=mods[m];
  switch(e.k){case'R':return'R';case'C':return num(e.tail)>=4.7e-6?'Cp':'C';case'L':return'L';case'V':return'V';case'I':return'I';
    case'D':if(/led/i.test(m)||(md&&/is=1e-1[5-9]/.test(md.raw)&&/n=2/.test(md.raw)))return'LED';if(/zen|^bz|^1n47|^1n52/i.test(m)||(md&&/\bbv\s*=/.test(md.raw)))return'ZEN';if(/sch|^1n58|^bat|^sb/i.test(m))return'SCH';return'D';
    case'Q':return(md?md.type==='pnp':/pnp|2907|3906/i.test(m))?'QP':'QN';
    case'M':{const p=md?md.type==='pmos':/pmos|^pm/i.test(m);return(p?'MP':'MN')+(gnd(e.nodes[3])!==gnd(e.nodes[2])?'4':'')}
    case'E':return e.pins[1]==='0'?'OA':'EV';case'G':return'GV';case'X':return xType(e);default:return'BOX'}}
const sigOf=P=>{const m=modsOf(P);return P.els.map(e=>e.n+':'+typeFor(e,m)+':'+e.pins.join('/')+(e.k==='M'?'/'+gnd(e.nodes[3]):'')).join('|')};
function mkParts(P){const mods=modsOf(P);
  return P.els.map((e,i)=>{const t=typeFor(e,mods),q=e.pins,p={id:'p'+i,t,n:e.n,v:e.k==='V'||e.k==='I'?e.val:e.tail,x:0,y:0,r:0,m:0,pn:{}};
    if(e.k==='Q')p.pn={c:q[0],b:q[1],e:q[2]};else if(e.k==='M'){p.pn={d:q[0],g:q[1],s:q[2]};if(t.endsWith('4'))p.pn.b=gnd(e.nodes[3])}
    else if(t==='OA')p.pn={out:q[0],inp:q[2],inn:q[3]};else if(e.k==='E'||e.k==='G')p.pn={p:q[0],n:q[1],cp:q[2],cn:q[3]};
    else if(SYMS[t].order){SYMS[t].order.forEach((nm,j)=>{p.pn[nm]=q[j]})}else if(t==='BOX'){p.np=q.length;q.forEach((n,j)=>p.pn[String(j+1)]=n)}else p.pn={'1':q[0],'2':q[1]};
    return p})}
/* ---- auto layout + router ---- */
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]],dirIdx=(ox,oy)=>ox===1?0:oy===1?1:ox===-1?2:3;
class Heap{constructor(){this.a=[]}get size(){return this.a.length}
  push(c,v){const a=this.a;a.push([c,v]);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p}}
  pop(){const a=this.a,t=a[0],l=a.pop();if(a.length){a[0]=l;let i=0;for(;;){let m=i,x=2*i+1,y=x+1;if(x<a.length&&a[x][0]<a[m][0])m=x;if(y<a.length&&a[y][0]<a[m][0])m=y;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m}}return t[1]}}
function layout(P,opt){opt=opt||{};
  const parts=mkParts(P),M={title:P.title,parts:[],wires:[],dirs:P.dirs.slice(),seq:1};
  const netPins=new Map();parts.forEach(p=>Object.entries(p.pn).forEach(([pin,n])=>{if(!netPins.has(n))netPins.set(n,[]);netPins.get(n).push([p,pin])}));
  const adj=new Map(parts.map(p=>[p,new Set()]));
  netPins.forEach((L,n)=>{if(n==='0'||L.length>12)return;L.forEach(([a])=>L.forEach(([b])=>{if(a!==b)adj.get(a).add(b)}))});
  const lvl=new Map(),isSrc=p=>p.t==='V'||p.t==='I',bfs=roots=>{const q=[];roots.forEach(r=>{if(!lvl.has(r)){lvl.set(r,0);q.push(r)}});while(q.length){const u=q.shift();for(const v of adj.get(u))if(!lvl.has(v)){lvl.set(v,lvl.get(u)+1);q.push(v)}}};
  bfs(parts.filter(isSrc));for(const p of parts)if(!lvl.has(p))bfs([p]);
  const byL=[];parts.forEach(p=>{const l=lvl.get(p);(byL[l]=byL[l]||[]).push(p)});const row=new Map();
  byL.forEach((L,l)=>{if(!L)return;const want=p=>{const n=[...adj.get(p)].filter(q=>lvl.get(q)<l&&row.has(q));return n.length?n.reduce((s,q)=>s+row.get(q),0)/n.length:1e9};
    const ord=L.map((p,i)=>[p,want(p),i]).sort((a,b)=>(a[1]-b[1])||(a[2]-b[2]));let prev=-1;ord.forEach(([p,w])=>{let r=w>1e8?prev+1:Math.max(Math.round(w),prev+1);row.set(p,r);prev=r})});
  const avgL=(n,p)=>{const L=(netPins.get(n)||[]).filter(([q])=>q!==p);return L.length?L.reduce((s,[q])=>s+lvl.get(q),0)/L.length:lvl.get(p)};
  parts.forEach(p=>{p.x=7+lvl.get(p)*24;p.y=8+row.get(p)*17;const S=SYMS[p.t];
    if(S.fmt==='two'){const a=p.pn['1']==='0',b=p.pn['2']==='0';if(b&&!a)p.r=1;else if(a&&!b)p.r=3;else if(avgL(p.pn['1'],p)>avgL(p.pn['2'],p))p.r=2;if(p.r%2)p.y+=3}});
  /* occupancy grid */
  const OFF=2000,key=(x,y)=>(x+OFF)*5000+(y+OFF),occ=new Map();let log=[];
  const claim=(x,y,o,m,s)=>{const k=key(x,y),pv=occ.get(k);log.push([k,pv]);occ.set(k,{o,m:(pv&&pv.o===o?pv.m:0)|m,s:Math.max(pv&&pv.o===o?pv.s:0,s?(s===true?2:s):0)})};
  const cross=(x,y)=>{const k=key(x,y),pv=occ.get(k);log.push([k,pv]);occ.set(k,{o:pv.o,m:3,s:pv.s})};
  const rollback=()=>{for(let i=log.length-1;i>=0;i--){const[k,pv]=log[i];if(pv)occ.set(k,pv);else occ.delete(k)}log=[]};
  let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
  parts.forEach(p=>{const b=partBox(p);bx0=Math.min(bx0,b[0]);by0=Math.min(by0,b[1]);bx1=Math.max(bx1,b[2]);by1=Math.max(by1,b[3]);
    for(let x=b[0];x<=b[2];x++)for(let y=b[1];y<=b[3];y++)claim(x,y,'#',3,2)});
  bx0-=14;by0-=14;bx1+=18;by1+=24;
  const pinList=[];parts.forEach(p=>{const pp=partPins(p);pp.forEach(q=>{const n=p.pn[q.name];pinList.push({p,q,n});claim(q.x,q.y,n==='0'?'#':n,0,2)})});
  pinList.forEach(o=>{if(o.n!=='0'&&!occ.has(key(o.q.x+o.q.ox,o.q.y+o.q.oy)))claim(o.q.x+o.q.ox,o.q.y+o.q.oy,o.n,o.q.ox?1:2,1)});
  const out=[];let gi=0;const nextId=()=>'g'+(gi++);
  const addGnd=(q)=>{const gx=q.x+q.ox,gy=q.y+q.oy;out.push({id:nextId(),t:'GND',n:'',v:'',x:gx,y:gy,r:dirIdx(-q.ox,-q.oy)===0?0:[0,0,2,0][0],m:0});
    const g=out[out.length-1];g.r=(q.oy===1?0:q.ox===-1?1:q.oy===-1?2:3);
    for(let i=0;i<=3;i++)claim(q.x+q.ox*(i+1),q.y+q.oy*(i+1),'#',3,2);M.wires.push({pts:[[q.x,q.y],[gx,gy]],net:'0'})};
  const addLbl=(q,name)=>{const lx=q.x+q.ox,ly=q.y+q.oy;out.push({id:nextId(),t:'LBL',n:'',v:name,x:lx,y:ly,r:q.ox===-1?2:0,m:0});M.wires.push({pts:[[q.x,q.y],[lx,ly]],net:name})};
  const byNet=new Map();pinList.forEach(o=>{if(!byNet.has(o.n))byNet.set(o.n,[]);byNet.get(o.n).push(o)});
  byNet.forEach((L,n)=>{if(n==='0')L.forEach(o=>addGnd(o.q))});
  /* route one net: returns polylines or null */
  const route=(name,L)=>{log=[];const own=new Set(),polys=[];
    const ps=L.map(o=>({x:o.q.x,y:o.q.y,ox:o.q.ox,oy:o.q.oy,sx:o.q.x+o.q.ox,sy:o.q.y+o.q.oy,d:dirIdx(o.q.ox,o.q.oy)}));
    for(const q of ps){const c=occ.get(key(q.sx,q.sy));if(!c||c.o!==name){rollback();return null}claim(q.sx,q.sy,name,q.d%2?2:1,1)}
    const first=ps[0];own.add(key(first.sx,first.sy));polys.push([[first.x,first.y],[first.sx,first.sy]]);
    const rest=ps.slice(1).sort((a,b)=>(Math.abs(a.sx-first.sx)+Math.abs(a.sy-first.sy))-(Math.abs(b.sx-first.sx)+Math.abs(b.sy-first.sy)));
    for(const q of rest){
      if(own.has(key(q.sx,q.sy))){polys.push([[q.x,q.y],[q.sx,q.sy]]);continue}
      const dist=new Map(),H=new Heap(),sk=(x,y,d)=>key(x,y)*4+d;
      const s0={x:q.sx,y:q.sy,d:q.d,g:0,prev:null,via:null};dist.set(sk(s0.x,s0.y,s0.d),0);H.push(0,s0);let goal=null;
      while(H.size){const n=H.pop();if(n.g>dist.get(sk(n.x,n.y,n.d)))continue;
        if(n!==s0&&own.has(key(n.x,n.y))){goal=n;break}
        for(let nd=0;nd<4;nd++){if(nd===(n.d+2)%4)continue;const[dx,dy]=DIRS[nd],x=n.x+dx,y=n.y+dy;if(x<bx0||x>bx1||y<by0||y>by1)continue;
          const o=occ.get(key(x,y)),am=nd%2?2:1;let cost=1+(nd!==n.d?2:0),nx=x,ny=y,via=null;
          if(o){if(o.o==='#')continue;
            if(o.o===name){if(o.s===2)continue}
            else{if(o.s||o.m!==3-am)continue;nx=x+dx;ny=y+dy;if(nx<bx0||nx>bx1||ny<by0||ny>by1)continue;const o2=occ.get(key(nx,ny));if(o2&&!(o2.o===name&&!o2.s))continue;cost+=6;via=[x,y]}}
          const g=n.g+cost,k=sk(nx,ny,nd);if(dist.has(k)&&dist.get(k)<=g)continue;dist.set(k,g);H.push(g,{x:nx,y:ny,d:nd,g,prev:n,via})}}
      if(!goal){rollback();return null}
      const cells=[];const vias=new Set();for(let n=goal;n;n=n.prev){cells.push([n.x,n.y]);if(n.via){cells.push(n.via);vias.add(K(n.via[0],n.via[1]))}}cells.reverse();
      const all=[[q.x,q.y],...cells],vtx=[all[0]];
      for(let i=1;i<all.length-1;i++){const a=all[i-1],b=all[i],c=all[i+1];if((b[0]-a[0])!==(c[0]-b[0])||(b[1]-a[1])!==(c[1]-b[1]))vtx.push(b)}vtx.push(all[all.length-1]);polys.push(vtx);
      for(let i=0;i<cells.length;i++){const[x,y]=cells[i],pv=i?cells[i-1]:[q.x,q.y],nx=cells[i+1],isEnd=i===cells.length-1;
        if(vias.has(K(x,y))){cross(x,y);continue}
        const horiz=y===pv[1],bend=nx&&((nx[0]-x)!==(x-pv[0])||(nx[1]-y)!==(y-pv[1]));
        claim(x,y,name,horiz?1:2,(bend||isEnd)?1:0);own.add(key(x,y))}
      own.add(key(q.sx,q.sy))}
    return polys};
  const nets=[...byNet.entries()].filter(([n,L])=>n!=='0');
  nets.sort((a,b)=>a[1].length-b[1].length);
  const labelNets=[];
  for(const[n,L]of nets){
    if(L.length===1){labelNets.push([n,L]);continue}
    if(opt.labelOnly||L.length>4||(opt.label&&opt.label.has(n))){labelNets.push([n,L]);continue}
    const polys=route(n,L);if(!polys){labelNets.push([n,L]);continue}log=[];polys.forEach(pts=>M.wires.push({pts,net:n}))}
  labelNets.forEach(([n,L])=>L.forEach(o=>addLbl(o.q,n)));
  M.parts=parts.concat(out);
  return M}
function checkLayout(M){const X=extract(M),f=new Map(),r=new Map(),off=new Set();
  M.parts.forEach(p=>{if(!p.pn)return;Object.entries(p.pn).forEach(([pin,exp])=>{const got=X.pin[p.id+'.'+pin];
    if(!f.has(exp))f.set(exp,new Set());f.get(exp).add(got);if(!r.has(got))r.set(got,new Set());r.get(got).add(exp)})});
  f.forEach((st,e)=>{if(st.size>1)off.add(e)});r.forEach(st=>{if(st.size>1)st.forEach(e=>off.add(e))});
  if(f.has('0')&&(f.get('0').size>1||!f.get('0').has('0')))off.add('*');off.delete('0');return[...off]}
function buildFromNetlist(P){const lab=new Set();let M;
  for(let i=0;i<8;i++){M=layout(P,{label:lab});const off=checkLayout(M);if(!off.length)break;if(off.includes('*')){M=null;break}off.forEach(n=>lab.add(n));M=null}
  if(!M){M=layout(P,{labelOnly:true});M.fallback=true}
  M.parts.forEach(p=>delete p.pn);return M}

/* render.js — draws the schematic: wires, junction dots, parts, net names */
function drawScene(M,o){o=o||{};let s='';const X=extract(M),sel=o.sel||new Set();
  const ends=new Map(),inc=(x,y)=>{const k=K(x,y);ends.set(k,(ends.get(k)||0)+1)};
  M.wires.forEach(w=>{for(let i=0;i+1<w.pts.length;i++){inc(w.pts[i][0],w.pts[i][1]);inc(w.pts[i+1][0],w.pts[i+1][1])}});
  const pinPts=[];M.parts.forEach(p=>partPins(p).forEach(q=>{inc(q.x,q.y);pinPts.push([p,q])}));
  const interior=(x,y)=>X.segs.some(g=>{const[x1,y1]=g.a,[x2,y2]=g.b;if(x1===x2)return x===x1&&y>Math.min(y1,y2)&&y<Math.max(y1,y2);if(y1===y2)return y===y1&&x>Math.min(x1,x2)&&x<Math.max(x1,x2);return false});
  /* net highlight */
  M.wires.forEach(w=>{const hi=o.selW===w,nt=o.selNet&&w.net&&w.net===o.selNet;
    s+=`<path d="M${w.pts.map(q=>q[0]*U+' '+q[1]*U).join('L')}" fill="none" stroke="${hi?'var(--accent)':nt?'var(--accent)':'var(--wire)'}" stroke-width="${hi?3.2:nt?2.8:1.9}" stroke-linecap="round" stroke-linejoin="round"/>`});
  ends.forEach((n,k)=>{const[x,y]=k.split(',').map(Number);const pins=pinPts.filter(([,q])=>q.x===x&&q.y===y).length,wc=n-pins,it=interior(x,y);
    if(n>=3&&(wc>0||pins>1)||(it&&n>=1))s+=`<circle cx="${x*U}" cy="${y*U}" r="3.4" fill="var(--wire)"/>`});
  if(o.pins!==false)pinPts.forEach(([p,q])=>{const k=K(q.x,q.y),n=ends.get(k),pins=pinPts.filter(([,z])=>z.x===q.x&&z.y===q.y).length;
    if(p.t!=='GND'&&p.t!=='LBL'&&n===pins&&pins===1&&!interior(q.x,q.y))s+=`<rect x="${q.x*U-3}" y="${q.y*U-3}" width="6" height="6" fill="none" stroke="var(--err)" stroke-width="1.4"/>`});
  if(o.nets!==false){const best=new Map(),lbl=new Set(M.parts.filter(p=>p.t==='LBL').map(p=>(p.v||'').toLowerCase()));
    X.segs.forEach(g=>{const n=g.net;if(n==='0'||/^n\d+$/.test(n)||lbl.has(n))return;const len=Math.abs(g.a[0]-g.b[0])+Math.abs(g.a[1]-g.b[1]);if(len<3)return;const hz=g.a[1]===g.b[1],sc=len+(hz?100:0);if(!best.has(n)||best.get(n).sc<sc)best.set(n,{g,hz,sc})});
    best.forEach(({g,hz},n)=>{const mx=(g.a[0]+g.b[0])/2*U,my=(g.a[1]+g.b[1])/2*U;s+=hz?tx(mx,my-6,n,{s:10,c:'var(--accent)',b:1}):tx(mx+6,my+3,n,{a:'start',s:10,c:'var(--accent)',b:1})})}
  M.parts.forEach(p=>{const hl=sel.has(p.id);
    if(hl){const b=partBox(p);s+=`<rect x="${b[0]*U-8}" y="${b[1]*U-8}" width="${(b[2]-b[0])*U+16}" height="${(b[3]-b[1])*U+16}" rx="6" fill="var(--accent)" fill-opacity=".10" stroke="var(--accent)" stroke-dasharray="4 3"/>`}
    s+=`<g data-id="${p.id}" class="part${hl?' sel':''}">${drawPart(p)}</g>`});
  return s}

/* examples.js — 100 NGspice examples in 9 topics */
const TOPICS=[{"topic": "DC Resistor Circuits", "items": [{"n": 1, "title": "Voltage divider", "desc": "Plot `v(out)` in the DC tab: it is exactly half the input.", "net": "* Voltage divider\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 1k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 2, "title": "Series resistors", "desc": "Current is identical through all three; check `i(R1)`, `i(R2)`, `i(R3)`.", "net": "* Series resistors\nV1 1 0 DC 12\nR1 1 2 1k\nR2 2 3 2.2k\nR3 3 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 3, "title": "Parallel resistors", "desc": "Branch currents add up to the source current.", "net": "* Three parallel branches\nV1 in 0 DC 12\nR1 in 0 1k\nR2 in 0 2.2k\nR3 in 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 4, "title": "Loaded voltage divider", "desc": "Compare `v(mid)` with and without `RL`.", "net": "* Loaded voltage divider\nV1 vcc 0 DC 12\nR1 vcc mid 10k\nR2 mid 0 10k\nR3 mid 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 5, "title": "Wheatstone bridge", "desc": "`R4` is slightly off balance, so the bridge detector `Rg` sees a small voltage.", "net": "* Wheatstone bridge\nV1 top 0 DC 10\nR1 top a 1k\nR2 top b 1k\nR3 a 0 1k\nR4 b 0 1.1k\nRg a b 10k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 6, "title": "Superposition with two sources", "desc": "", "net": "* Superposition: two voltage sources\nV1 1 0 DC 10\nV2 3 0 DC 5\nR1 1 2 1k\nR2 2 0 2k\nR3 3 2 1k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 7, "title": "Current source feeding a resistor network", "desc": "", "net": "* Current source network\nI1 0 1 DC 1m\nR1 1 0 4.7k\nR2 1 2 1k\nR3 2 0 2.2k\n.op\n.dc I1 0 2m 0.1m\n.end"}, {"n": 8, "title": "R-2R ladder DAC (3 bit, code 101)", "desc": "Expected output: 5 V × 5/8 = 3.125 V at `n2`.", "net": "* R-2R ladder DAC, code 101\nVb2 b2 0 DC 5\nVb1 b1 0 DC 0\nVb0 b0 0 DC 5\nR2b b2 n2 20k\nR1b b1 n1 20k\nR0b b0 n0 20k\nRt n0 0 20k\nRa n0 n1 10k\nRb n1 n2 10k\n.op\n.end"}, {"n": 9, "title": "Delta network with loads", "desc": "", "net": "* Delta resistor network with loads\nV1 a 0 DC 10\nR1 a b 1k\nR2 b c 1k\nR3 c a 1k\nR4 b 0 2.2k\nR5 c 0 2.2k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 10, "title": "Maximum power transfer", "desc": "Power in `RL` is highest when `RL = Rs` (see the P column in the operating-point table).", "net": "* Maximum power transfer RL = Rs\nVs 1 0 DC 10\nR1 1 2 50\nR2 2 0 50\n.op\n.dc Vs 0 10 1\n.end"}]}, {"topic": "Transient: RC, RL, RLC", "items": [{"n": 11, "title": "RC charge and discharge (square wave)", "desc": "Time constant is 1 ms.", "net": "* RC charge/discharge\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 1k\nC1 out 0 1u\n.tran 20u 10m\n.end"}, {"n": 12, "title": "Slow RC (τ = 1 ms with 10 kΩ and 100 nF)", "desc": "", "net": "* RC time constant 1 ms\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 10k\nC1 out 0 100n\n.tran 20u 10m\n.end"}, {"n": 13, "title": "RL step response", "desc": "Time constant L/R = 0.1 ms. Plot `i(L1)`.", "net": "* RL step response\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 100\nL1 out 0 10m\n.tran 5u 1m\n.end"}, {"n": 14, "title": "RC differentiator", "desc": "", "net": "* RC differentiator\nV1 in 0 PULSE(0 5 0 1n 1n 1m 2m)\nC1 in out 10n\nR1 out 0 10k\n.tran 5u 4m\n.end"}, {"n": 15, "title": "RC integrator (square wave to triangle)", "desc": "", "net": "* RC integrator\nV1 in 0 PULSE(-1 1 0 1n 1n 50u 100u)\nR1 in out 100k\nC1 out 0 10n\n.tran 0.5u 1m\n.end"}, {"n": 16, "title": "Series RLC, underdamped", "desc": "Overshoot and ringing at about 1.6 kHz.", "net": "* Series RLC underdamped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 10\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 17, "title": "Series RLC, overdamped", "desc": "", "net": "* Series RLC overdamped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 1k\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 18, "title": "Series RLC, critically damped", "desc": "R = 2·√(L/C) = 200 Ω.", "net": "* Series RLC critically damped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 200\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 19, "title": "Parallel RLC ringing (current impulse)", "desc": "", "net": "* Parallel RLC impulse response\nI1 0 n PULSE(0 1m 0 1n 1n 20u 1)\nR1 n 0 100\nL1 n 0 1m\nC1 n 0 1u\n.tran 1u 2m\n.end"}, {"n": 20, "title": "Two-stage RC network", "desc": "", "net": "* Two-stage RC low-pass step\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in a 1k\nC1 a 0 1u\nR2 a b 1k\nC2 b 0 1u\n.tran 20u 10m\n.end"}, {"n": 21, "title": "Capacitor charged through a Thevenin divider", "desc": "Final value is the divider voltage, not the supply.", "net": "* Capacitor charging via divider\nV1 in 0 DC 10\nR1 in a 10k\nR2 a 0 10k\nC1 a 0 1u\n.tran 50u 50m\n.end"}, {"n": 22, "title": "Charge sharing between two capacitors", "desc": "", "net": "* Coupled RC stages\nV1 in 0 PULSE(0 5 0 1n 1n 10m 20m)\nR1 in a 1k\nC1 a 0 1u\nR2 a b 1k\nC2 b 0 2u\n.tran 50u 20m\n.end"}]}, {"topic": "AC Frequency Response and Filters", "items": [{"n": 23, "title": "RC low-pass (fc ≈ 1.59 kHz)", "desc": "", "net": "* RC low-pass\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 100n\n.ac dec 50 10 1meg\n.end"}, {"n": 24, "title": "RC high-pass", "desc": "", "net": "* RC high-pass\nV1 in 0 AC 1\nC1 in out 100n\nR1 out 0 1k\n.ac dec 50 10 1meg\n.end"}, {"n": 25, "title": "RL low-pass", "desc": "fc = R/(2πL) ≈ 1.59 kHz.", "net": "* RL low-pass\nV1 in 0 AC 1\nL1 in out 10m\nR1 out 0 100\n.ac dec 50 10 1meg\n.end"}, {"n": 26, "title": "RL high-pass", "desc": "", "net": "* RL high-pass\nV1 in 0 AC 1\nR1 in out 100\nL1 out 0 10m\n.ac dec 50 10 1meg\n.end"}, {"n": 27, "title": "Series RLC band-pass (Q = 10)", "desc": "Output is taken across `R1`.", "net": "* Series RLC band-pass\nV1 in 0 AC 1\nL1 in a 10m\nC1 a out 1u\nR1 out 0 10\n.ac dec 100 100 100k\n.end"}, {"n": 28, "title": "Series LC notch (band-stop)", "desc": "", "net": "* LC notch at 1.59 kHz\nV1 in 0 AC 1\nR1 in out 100\nL1 out m 10m\nC1 m 0 1u\n.ac dec 100 100 100k\n.end"}, {"n": 29, "title": "Parallel LC resonant band-pass", "desc": "", "net": "* Parallel resonant band-pass\nV1 in 0 AC 1\nR1 in out 1k\nL1 out 0 10m\nC1 out 0 1u\n.ac dec 100 100 100k\n.end"}, {"n": 30, "title": "Second-order LC low-pass", "desc": "", "net": "* Second-order LC low-pass\nV1 in 0 AC 1\nL1 in out 10m\nC1 out 0 1u\nR1 out 0 50\n.ac dec 50 100 100k\n.end"}, {"n": 31, "title": "Second-order CL high-pass", "desc": "", "net": "* Second-order high-pass\nV1 in 0 AC 1\nC1 in out 1u\nL1 out 0 10m\nR1 out 0 100\n.ac dec 50 100 100k\n.end"}, {"n": 32, "title": "Twin-T notch filter (fn ≈ 1.59 kHz)", "desc": "", "net": "* Twin-T notch\nV1 in 0 AC 1\nR1 in a 10k\nR2 a out 10k\nC3 a 0 20n\nC1 in b 10n\nC2 b out 10n\nR3 b 0 5k\nR4 out 0 1meg\n.ac dec 100 10 100k\n.end"}, {"n": 33, "title": "Wien bridge network (peak gain 1/3 at 1.59 kHz)", "desc": "", "net": "* Wien network band-pass\nV1 in 0 AC 1\nR1 in a 10k\nC1 a out 10n\nR2 out 0 10k\nC2 out 0 10n\n.ac dec 100 10 100k\n.end"}, {"n": 34, "title": "Two-stage RC low-pass (−40 dB/dec)", "desc": "", "net": "* Cascaded RC low-pass\nV1 in 0 AC 1\nR1 in a 1k\nC1 a 0 100n\nR2 a out 1k\nC2 out 0 100n\n.ac dec 50 10 1meg\n.end"}, {"n": 35, "title": "Three-stage RC phase-shift network", "desc": "The phase plot reaches 180° of lead near 650 Hz (1/(2πRC√6)), where the gain is about 1/29.", "net": "* Three-stage RC phase shifter\nV1 in 0 AC 1\nC1 in a 10n\nR1 a 0 10k\nC2 a b 10n\nR2 b 0 10k\nC3 b out 10n\nR3 out 0 10k\n.ac dec 100 10 100k\n.end"}, {"n": 36, "title": "Lead network", "desc": "", "net": "* Lead network\nV1 in 0 AC 1\nR1 in out 10k\nC1 in out 10n\nR2 out 0 1k\n.ac dec 50 10 1meg\n.end"}, {"n": 37, "title": "Lag network", "desc": "", "net": "* Lag network\nV1 in 0 AC 1\nR1 in out 10k\nR2 out m 1k\nC1 m 0 100n\n.ac dec 50 1 100k\n.end"}, {"n": 38, "title": "Pi (C-L-C) filter between 50 Ω terminations", "desc": "", "net": "* Pi filter 50 ohm\nV1 src 0 AC 1\nR1 src in 50\nC1 in 0 1u\nL1 in out 10m\nC2 out 0 1u\nR2 out 0 50\n.ac dec 50 100 1meg\n.end"}]}, {"topic": "Diodes and Rectifiers", "items": [{"n": 39, "title": "Diode forward I-V curve", "desc": "", "net": "* Diode forward I-V\nV1 in 0 DC 0\nR1 in a 100\nD1 a 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 5 0.05\n.end"}, {"n": 40, "title": "Reverse-biased diode", "desc": "", "net": "* Diode reverse and forward sweep\nV1 in 0 DC -5\nR1 in a 1k\nD1 a 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 -10 5 0.25\n.end"}, {"n": 41, "title": "Half-wave rectifier (no filter)", "desc": "", "net": "* Half-wave rectifier\nV1 in 0 SIN(0 5 50)\nD1 in out DX\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 42, "title": "Half-wave rectifier with filter capacitor", "desc": "", "net": "* Half-wave rectifier with filter\nV1 in 0 SIN(0 5 50)\nD1 in out DX\nC1 out 0 10u\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 43, "title": "Full-wave bridge rectifier", "desc": "", "net": "* Full-wave bridge rectifier\nV1 a b SIN(0 10 50)\nR1 b 0 1meg\nD1 a p DX\nD2 b p DX\nD3 0 a DX\nD4 0 b DX\nR2 p 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 44, "title": "Center-tapped full-wave rectifier", "desc": "", "net": "* Center-tapped full-wave rectifier\nV1 a 0 SIN(0 10 50)\nV2 b 0 SIN(0 10 50 0 0 180)\nD1 a out DX\nD2 b out DX\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 45, "title": "Positive clipper (limits at about +0.7 V)", "desc": "", "net": "* Diode clipper\nV1 in 0 SIN(0 5 1k)\nR1 in out 1k\nD1 out 0 DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 46, "title": "Bidirectional clipper (±0.7 V)", "desc": "", "net": "* Bidirectional clipper\nV1 in 0 SIN(0 5 1k)\nR1 in out 1k\nD1 out 0 DX\nD2 0 out DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 47, "title": "Biased clipper (limits near 2.7 V)", "desc": "", "net": "* Biased clipper\nV1 in 0 SIN(0 5 1k)\nVb ref 0 DC 2\nR1 in out 1k\nD1 out ref DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 48, "title": "Diode clamper (DC restorer)", "desc": "The signal is shifted upward so its negative peaks are clamped at about −0.7 V; compare `v(in)` with `v(out)`.", "net": "* Diode clamper\nV1 in 0 SIN(0 5 1k)\nC1 in out 10u\nD1 0 out DX\nR1 out 0 100k\n.model DX D(Is=1e-14 N=1)\n.tran 5u 10m\n.end"}, {"n": 49, "title": "Voltage doubler", "desc": "Output approaches about 2·Vpeak minus diode drops.", "net": "* Voltage doubler\nV1 in 0 SIN(0 5 1k)\nC1 in a 1u\nD1 0 a DX\nD2 a out DX\nC2 out 0 1u\nR1 out 0 10k\n.model DX D(Is=1e-14 N=1)\n.tran 10u 30m\n.end"}, {"n": 50, "title": "Three series diodes as a voltage reference", "desc": "Output `v(a)` is about 2 V.", "net": "* Series diode reference\nV1 in 0 DC 9\nR1 in a 1k\nD1 a b DX\nD2 b c DX\nD3 c 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 9 0.25\n.end"}, {"n": 51, "title": "Diode AND gate", "desc": "", "net": "* Diode AND gate\nVcc vcc 0 DC 5\nVa a 0 PULSE(0 5 0 1n 1n 1m 2m)\nVb b 0 PULSE(0 5 0 1n 1n 2m 4m)\nR1 vcc y 1k\nD1 y a DX\nD2 y b DX\n.model DX D(Is=1e-14 N=1)\n.tran 20u 4m\n.end"}, {"n": 52, "title": "Diode OR gate", "desc": "", "net": "* Diode OR gate\nVa a 0 PULSE(0 5 0 1n 1n 1m 2m)\nVb b 0 PULSE(0 5 0 1n 1n 2m 4m)\nD1 a y DX\nD2 b y DX\nR1 y 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 20u 4m\n.end"}, {"n": 53, "title": "LED with current-limiting resistor", "desc": "", "net": "* LED driver\nVs 1 0 DC 5\nR1 1 a 330\nD1 a 0 LED\n.model LED D(Is=1e-18 N=2)\n.op\n.dc Vs 0 5 0.1\n.end"}, {"n": 54, "title": "Schottky versus silicon diode", "desc": "The Schottky (`DS`) conducts at a lower voltage.", "net": "* Schottky vs silicon\nV1 in 0 DC 0\nR1 in a 100\nD1 a 0 DS\nR2 in b 100\nD2 b 0 DX\n.model DS D(Is=1e-8 N=1.05)\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 5 0.05\n.end"}]}, {"topic": "BJT Circuits", "items": [{"n": 55, "title": "Fixed-bias common emitter (supply sweep)", "desc": "", "net": "* NPN fixed bias\nVcc vcc 0 DC 12\nRb vcc b 220k\nRc vcc c 2.2k\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 56, "title": "BJT output characteristics (Ib = 20 µA)", "desc": "Plot `i(Vce)` against the swept `Vce`.", "net": "* BJT output characteristic\nIb 0 b DC 20u\nVce c 0 DC 5\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vce 0 10 0.1\n.end"}, {"n": 57, "title": "Voltage-divider bias with emitter resistor", "desc": "", "net": "* Voltage-divider bias\nVcc vcc 0 DC 12\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nQ1 c b e QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 58, "title": "BJT as a saturated switch", "desc": "", "net": "* BJT switch\nVcc vcc 0 DC 5\nVin in 0 PULSE(0 5 0 1u 1u 1m 2m)\nRb in b 10k\nRc vcc c 1k\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 4m\n.end"}, {"n": 59, "title": "Emitter follower", "desc": "", "net": "* Emitter follower\nVcc vcc 0 DC 12\nVin in 0 SIN(6 1 1k)\nQ1 vcc in e QN\nRe e 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 3m\n.end"}, {"n": 60, "title": "Common-emitter amplifier: frequency response", "desc": "", "net": "* CE amplifier AC response\nVcc vcc 0 DC 12\nVin in 0 SIN(0 10m 1k) AC 1\nCin in b 10u\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nCe e 0 100u\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.ac dec 20 1 1meg\n.end"}, {"n": 61, "title": "Common-emitter amplifier: transient", "desc": "", "net": "* CE amplifier transient\nVcc vcc 0 DC 12\nVin in 0 SIN(0 20m 1k)\nCin in b 10u\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nCe e 0 100u\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 5m\n.end"}, {"n": 62, "title": "Common-base amplifier", "desc": "", "net": "* Common-base amplifier\nVcc vcc 0 DC 12\nVin in 0 SIN(0 20m 1k) AC 1\nCin in e 10u\nRe e 0 1k\nR1 vcc b 47k\nR2 b 0 10k\nCb b 0 100u\nRc vcc c 2.2k\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.ac dec 20 10 1meg\n.tran 10u 3m\n.end"}, {"n": 63, "title": "BJT current mirror", "desc": "", "net": "* BJT current mirror\nVcc vcc 0 DC 12\nR1 vcc c1 10k\nQ1 c1 c1 0 QN\nQ2 out c1 0 QN\nR2 vcc out 4.7k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 64, "title": "Differential pair", "desc": "Sweep `Vin1` and watch the collector voltages cross.", "net": "* BJT differential pair\nVcc vcc 0 DC 12\nVee vee 0 DC -12\nVin1 in1 0 DC 0\nVin2 in2 0 DC 0\nRc1 vcc c1 4.7k\nRc2 vcc c2 4.7k\nQ1 c1 in1 e QN\nQ2 c2 in2 e QN\nRe e vee 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vin1 -0.2 0.2 0.01\n.end"}, {"n": 65, "title": "Darlington emitter follower", "desc": "Emitter voltage is about 1.4 V below the base.", "net": "* Darlington pair\nVcc vcc 0 DC 12\nVb b 0 DC 5\nQ1 vcc b e1 QN\nQ2 vcc e1 e QN\nRe e 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vb 0 10 0.1\n.end"}, {"n": 66, "title": "PNP common-emitter stage", "desc": "", "net": "* PNP common emitter\nVcc vcc 0 DC 12\nRb b 0 220k\nRc c 0 2.2k\nQ1 c b vcc QP\n.model QP PNP(Is=1e-14 Bf=100)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 67, "title": "Complementary push-pull follower (crossover distortion)", "desc": "", "net": "* Push-pull emitter follower\nVcc vcc 0 DC 12\nVee vee 0 DC -12\nVin in 0 SIN(0 5 1k)\nQ1 vcc in out QN\nQ2 vee in out QP\nR1 out 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.model QP PNP(Is=1e-14 Bf=100)\n.tran 5u 3m\n.end"}, {"n": 68, "title": "Constant-current source with diode reference", "desc": "", "net": "* BJT current source\nVcc vcc 0 DC 12\nR1 vcc b 4.7k\nD1 b m DX\nD2 m 0 DX\nQ1 c b e QN\nRe e 0 470\nR2 vcc c 1k\n.model DX D(Is=1e-14 N=1)\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}]}, {"topic": "MOSFET Circuits", "items": [{"n": 69, "title": "NMOS transfer characteristic", "desc": "", "net": "* NMOS transfer curve\nVdd vdd 0 DC 5\nVg g 0 DC 0\nRd vdd d 1k\nM1 d g 0 0 NM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vg 0 5 0.05\n.end"}, {"n": 70, "title": "NMOS output characteristic (Vgs = 3 V)", "desc": "", "net": "* NMOS output characteristic\nVg g 0 DC 3\nVds d 0 DC 5\nM1 d g 0 0 NM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vds 0 5 0.05\n.end"}, {"n": 71, "title": "Common-source stage with gate-voltage sweep", "desc": "", "net": "* NMOS common source\nVdd vdd 0 DC 5\nVg g 0 DC 2\nRd vdd d 4.7k\nM1 d g 0 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u)\n.op\n.dc Vg 0 5 0.1\n.end"}, {"n": 72, "title": "Common-source amplifier: transient", "desc": "", "net": "* NMOS CS amplifier transient\nVdd vdd 0 DC 10\nVin g 0 SIN(2 0.2 1k)\nRd vdd d 4.7k\nM1 d g 0 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.tran 5u 3m\n.end"}, {"n": 73, "title": "Common-source amplifier: frequency response", "desc": "", "net": "* NMOS CS amplifier AC\nVdd vdd 0 DC 10\nVin in 0 SIN(0 10m 1k) AC 1\nCin in g 100n\nR1 vdd g 680k\nR2 g 0 320k\nRd vdd d 2.2k\nM1 d g 0 0 NM W=10u L=1u\nCout d out 100n\nR3 out 0 100k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.ac dec 20 10 1meg\n.end"}, {"n": 74, "title": "Source follower", "desc": "", "net": "* NMOS source follower\nVdd vdd 0 DC 10\nVin in 0 SIN(5 0.5 1k)\nM1 vdd in s 0 NM W=20u L=1u\nRs s 0 4.7k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.tran 5u 3m\n.end"}, {"n": 75, "title": "NMOS inverter with resistive load", "desc": "", "net": "* NMOS resistive-load inverter\nVdd vdd 0 DC 5\nVin in 0 PULSE(0 5 0 10n 10n 1u 2u)\nRd vdd out 10k\nM1 out in 0 0 NM W=10u L=1u\nCl out 0 1p\n.model NM NMOS(Vto=1 Kp=100u)\n.tran 10n 4u\n.end"}, {"n": 76, "title": "CMOS inverter transfer curve", "desc": "Switching threshold is near 2.5 V because the devices are matched.", "net": "* CMOS inverter VTC\nVdd vdd 0 DC 5\nVin in 0 DC 0\nM1 out in 0 0 NM W=10u L=1u\nM2 out in vdd vdd PM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)\n.op\n.dc Vin 0 5 0.05\n.end"}, {"n": 77, "title": "CMOS inverter transient with load capacitor", "desc": "", "net": "* CMOS inverter switching\nVdd vdd 0 DC 5\nVin in 0 PULSE(0 5 0 100p 100p 5n 10n)\nM1 out in 0 0 NM W=10u L=1u\nM2 out in vdd vdd PM W=20u L=1u\nCl out 0 100f\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)\n.tran 50p 20n\n.end"}, {"n": 78, "title": "NMOS current mirror", "desc": "", "net": "* NMOS current mirror\nVdd vdd 0 DC 5\nR1 vdd g 10k\nM1 g g 0 0 NM W=10u L=1u\nM2 out g 0 0 NM W=10u L=1u\nR2 vdd out 4.7k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vdd 0 5 0.1\n.end"}, {"n": 79, "title": "NMOS differential pair", "desc": "", "net": "* NMOS differential pair\nVdd vdd 0 DC 5\nI1 s 0 DC 200u\nVin1 in1 0 DC 2\nVin2 in2 0 DC 2\nRd1 vdd d1 10k\nRd2 vdd d2 10k\nM1 d1 in1 s 0 NM W=10u L=1u\nM2 d2 in2 s 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vin1 1.5 2.5 0.02\n.end"}, {"n": 80, "title": "NMOS pass transistor with capacitive load", "desc": "Output reaches the input voltage while the gate is high, then holds on the capacitor.", "net": "* NMOS pass gate\nVin in 0 DC 3\nVg g 0 PULSE(0 5 0 1u 1u 100u 200u)\nM1 in g out 0 NM W=10u L=1u\nCl out 0 1n\nRl out 0 1meg\n.model NM NMOS(Vto=1 Kp=100u)\n.tran 1u 400u\n.end"}]}, {"topic": "Controlled Sources and Op-Amp Circuits", "items": [{"n": 81, "title": "VCVS amplifier (gain 10)", "desc": "", "net": "* VCVS gain of 10\nVin in 0 DC 0 AC 1\nE1 out 0 in 0 10\nRl out 0 1k\n.op\n.dc Vin -1 1 0.1\n.ac dec 10 1 1k\n.end"}, {"n": 82, "title": "VCCS transconductance stage", "desc": "", "net": "* VCCS transconductance 2 mS\nVin in 0 DC 0\nG1 out 0 in 0 2m\nRl out 0 2k\n.op\n.dc Vin -1 1 0.1\n.end"}, {"n": 83, "title": "Inverting amplifier (gain −10)", "desc": "", "net": "* Inverting op-amp\nVin in 0 DC 0 AC 1\nR1 in inv 1k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.op\n.dc Vin -1 1 0.1\n.ac dec 10 1 1k\n.end"}, {"n": 84, "title": "Non-inverting amplifier (gain 10)", "desc": "", "net": "* Non-inverting op-amp\nVin in 0 DC 0.5 AC 1\nRf out inv 9k\nRg inv 0 1k\nE1 out 0 in inv 100000\n.op\n.dc Vin -1 1 0.1\n.end"}, {"n": 85, "title": "Voltage follower (buffer)", "desc": "", "net": "* Voltage follower\nVin in 0 SIN(0 1 1k)\nE1 out 0 in out 100000\nRl out 0 1k\n.tran 10u 3m\n.end"}, {"n": 86, "title": "Summing amplifier", "desc": "Expected output: −(1 V + 2 V) = −3 V.", "net": "* Summing amplifier\nV1 a 0 DC 1\nV2 b 0 DC 2\nR1 a inv 10k\nR2 b inv 10k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.op\n.end"}, {"n": 87, "title": "Difference amplifier", "desc": "Expected output: 100k/10k × (2 V − 1 V) = 10 V.", "net": "* Difference amplifier\nV1 a 0 DC 2\nV2 b 0 DC 1\nR1 a inv 10k\nRf inv out 100k\nR3 b np 10k\nR4 np 0 100k\nE1 out 0 np inv 100000\n.op\n.end"}, {"n": 88, "title": "Op-amp integrator", "desc": "", "net": "* Op-amp integrator\nVin in 0 PULSE(-1 1 0 1n 1n 500u 1m)\nR1 in inv 10k\nC1 inv out 10n\nRf inv out 1meg\nE1 out 0 0 inv 100000\n.tran 2u 4m\n.end"}, {"n": 89, "title": "Op-amp differentiator", "desc": "Triangle input gives a square-wave output.", "net": "* Op-amp differentiator\nVin in 0 PWL(0 0 0.5m 1 1m 0 1.5m 1 2m 0)\nRs in x 100\nCin x inv 10n\nRf inv out 10k\nE1 out 0 0 inv 100000\n.tran 5u 2m\n.end"}, {"n": 90, "title": "Active low-pass filter (fc ≈ 1 kHz, gain −1)", "desc": "", "net": "* Active inverting low-pass\nVin in 0 AC 1\nR1 in inv 10k\nRf inv out 10k\nCf inv out 15.9n\nE1 out 0 0 inv 100000\n.ac dec 50 10 100k\n.end"}, {"n": 91, "title": "Active high-pass filter (fc ≈ 1 kHz, gain −1)", "desc": "", "net": "* Active inverting high-pass\nVin in 0 AC 1\nC1 in a 15.9n\nR1 a inv 10k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.ac dec 50 10 100k\n.end"}, {"n": 92, "title": "Sallen-Key low-pass (Butterworth, fc ≈ 1.6 kHz)", "desc": "", "net": "* Sallen-Key low-pass\nVin in 0 AC 1\nR1 in a 10k\nR2 a b 10k\nC1 a out 14.1n\nC2 b 0 7.07n\nE1 out 0 b 0 1\n.ac dec 50 10 100k\n.end"}]}, {"topic": "Source Waveforms", "items": [{"n": 93, "title": "Exponentially damped sine", "desc": "", "net": "* Damped sine source\nV1 in 0 SIN(0 5 1k 0 500 0)\nR1 in 0 1k\n.tran 5u 5m\n.end"}, {"n": 94, "title": "Square wave through an RC low-pass (harmonic filtering)", "desc": "", "net": "* Square wave into RC filter\nV1 in 0 PULSE(0 5 0 1n 1n 0.5m 1m)\nR1 in out 1.6k\nC1 out 0 100n\n.tran 5u 5m\n.end"}, {"n": 95, "title": "Arbitrary PWL stimulus", "desc": "", "net": "* PWL source into RC\nV1 in 0 PWL(0 0 1m 0 1.1m 5 3m 5 3.1m 0 5m 0)\nR1 in out 1k\nC1 out 0 1u\n.tran 10u 6m\n.end"}, {"n": 96, "title": "Two series sine sources (100 Hz beat)", "desc": "", "net": "* Beat between 1 kHz and 1.1 kHz\nV1 a 0 SIN(0 1 1k)\nV2 b a SIN(0 1 1.1k)\nR1 b 0 1k\n.tran 10u 20m\n.end"}]}, {"topic": "Applications", "items": [{"n": 97, "title": "Bridge rectifier with reservoir capacitor (ripple)", "desc": "", "net": "* Bridge rectifier with filter cap\nV1 a b SIN(0 12 50)\nR1 b 0 1meg\nD1 a p DX\nD2 b p DX\nD3 0 a DX\nD4 0 b DX\nC1 p 0 470u\nR2 p 0 100\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 100m\n.end"}, {"n": 98, "title": "Series-pass regulator (LED reference)", "desc": "Output stays near 1.2 V once the input is high enough.", "net": "* Series-pass regulator\nVin vin 0 DC 15\nR1 vin b 2.2k\nD1 b 0 LED\nQ1 vin b out QN\nR2 out 0 1k\n.model LED D(Is=1e-18 N=2)\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vin 0 15 0.25\n.end"}, {"n": 99, "title": "Third-order Butterworth LC low-pass (fc = 1 kHz, 50 Ω)", "desc": "", "net": "* 3rd-order Butterworth LC low-pass\nV1 src 0 AC 1\nR1 src in 50\nC1 in 0 3.18u\nL1 in out 15.9m\nC2 out 0 3.18u\nR2 out 0 50\n.ac dec 50 100 100k\n.end"}, {"n": 100, "title": "LC delay line (4 sections, Z0 ≈ 32 Ω)", "desc": "The pulse arrives about 32 µs later per section.", "net": "* LC delay line\nV1 src 0 PULSE(0 1 0 1u 1u 200u 1m)\nR1 src a 32\nC1 a 0 1u\nL1 a b 1m\nC2 b 0 1u\nL2 b c 1m\nC3 c 0 1u\nL3 c d 1m\nC4 d 0 1u\nR2 d 0 32\n.tran 1u 500u\n.end"}]}];
/* ---- extra topics: 555 timer + CMOS logic gates ---- */
{const sup=['VDD vdd 0 DC 5'],pA='VA a 0 PULSE(0 5 0 1n 1n 5u 10u)',pB='VB b 0 PULSE(0 5 0 1n 1n 10u 20u)',pC='VC c 0 PULSE(0 5 0 1n 1n 20u 40u)';
const g2=(n,t,title,desc,cell)=>({n,title,desc,net:exNet(['* '+title,...sup,pA,pB,`X1 a b y vdd 0 ${cell}`,'CY y 0 100f','.tran 20n 20u'])});
const g3=(n,title,desc,cell)=>({n,title,desc,net:exNet(['* '+title,...sup,pA,pB,pC,`X1 a b c y vdd 0 ${cell}`,'CY y 0 100f','.tran 40n 40u'])});
const g1=(n,title,desc,cell)=>({n,title,desc,net:exNet(['* '+title,...sup,pA,`X1 a y vdd 0 ${cell}`,'CY y 0 100f','.tran 20n 20u'])});
const RL=['.model NM NMOS(Vto=0.7 Kp=200u Lambda=0.02)','.model PM PMOS(Vto=-0.7 Kp=100u Lambda=0.02)'];
TOPICS.push({topic:'555 Timer Circuits',items:[
{n:101,title:'555 astable LED blinker (1.4 s)',desc:'The built-in 555 model now runs: f ≈ 1.44/((R1+2·R2)·C1) ≈ 0.72 Hz. `IC=0` + `uic` start the capacitor empty. Plot `v(out)`, `v(trig)`, `v(led_anode)`.',
 net:exNet(['* 555 astable LED blinker','VCC vcc 0 DC 5','X1 0 trig out vcc ctrl trig disch vcc NE555','R1 vcc disch 1k','R2 disch trig 100k','C1 trig 0 10u IC=0','C2 ctrl 0 10n','R_led out led_anode 330','D_led led_anode 0 RED_LED','.model RED_LED D(Is=1e-19 N=1.6 Rs=2.5 Cjo=20p)','.tran 5m 6s uic'])},
{n:102,title:'555 astable 1 kHz clock',desc:'f ≈ 1.44/((1k+2·6.8k)·100n) ≈ 986 Hz. `v(trig)` ramps between 1/3 and 2/3 of VCC.',
 net:exNet(['* 555 astable clock ~1 kHz','VCC vcc 0 DC 5','X1 0 trig out vcc ctrl trig disch vcc NE555','R1 vcc disch 1k','R2 disch trig 6.8k','C1 trig 0 100n IC=0','C2 ctrl 0 10n','.tran 5u 5m uic'])},
{n:103,title:'555 astable with 50 % duty (diode steering)',desc:'`D1` bypasses `R2` while charging, so high ≈ 0.69·R1·C and low ≈ 0.69·R2·C.',
 net:exNet(['* 555 astable 50% duty','VCC vcc 0 DC 5','X1 0 trig out vcc ctrl trig disch vcc NE555','R1 vcc disch 10k','D1 disch trig 1N4148','R2 disch trig 10k','C1 trig 0 100n IC=0','C2 ctrl 0 10n','.model 1N4148 D(Is=2.52n N=1.75)','.tran 5u 5m uic'])},
{n:104,title:'555 monostable one-shot (≈11 ms)',desc:'A short low pulse on TRIG starts the timer: T = 1.1·R1·C1 ≈ 11 ms. THRESH and DISCH sit on the RC node `cap`.',
 net:exNet(['* 555 monostable','VCC vcc 0 DC 5','VT trg 0 PULSE(5 0 2m 10n 10n 200u 1)','X1 0 trg out vcc ctrl cap cap vcc NE555','R1 vcc cap 100k','C1 cap 0 100n','C2 ctrl 0 10n','.tran 50u 30m'])},
{n:105,title:'555 Schmitt trigger',desc:'TRIG and THRESH tied together: output goes low above 2/3·VCC and high below 1/3·VCC (hysteresis 1.67 V).',
 net:exNet(['* 555 Schmitt trigger','VCC vcc 0 DC 5','VIN in 0 SIN(2.5 2.2 100)','X1 0 in out vcc ctrl in nc vcc NE555','C2 ctrl 0 10n','.tran 50u 30m'])},
{n:106,title:'555 PWM via control voltage',desc:'A slow sine on CTRL (pin 5) moves both thresholds, so the astable duty cycle is modulated.',
 net:exNet(['* 555 PWM using CTRL pin','VCC vcc 0 DC 5','VM ctrl 0 SIN(3 0.9 100)','X1 0 trig out vcc ctrl trig disch vcc NE555','R1 vcc disch 1k','R2 disch trig 10k','C1 trig 0 10n IC=0','.tran 2u 20m uic'])},
{n:107,title:'555 bistable (set / reset latch)',desc:'`set` pulses low on TRIG, `rst` pulses high on THRESH. The output remembers the last event.',
 net:exNet(['* 555 bistable flip-flop','VCC vcc 0 DC 5','VS set 0 PULSE(5 0 1m 10n 10n 500u 4m)','VR rst 0 PULSE(0 5 3m 10n 10n 500u 4m)','X1 0 set q vcc ctrl rst nc vcc NE555','C2 ctrl 0 10n','.tran 10u 10m'])}]});
TOPICS.push({topic:'CMOS Logic Gates',items:[
{n:108,title:'CMOS inverter from MOSFETs (transfer curve)',desc:'The transistor-level cell behind every gate: PMOS pull-up, NMOS pull-down. Plot `v(out)` against `VIN`.',
 net:['* CMOS inverter VTC','VDD vdd 0 DC 5','VIN in 0 DC 0','MP1 out in vdd vdd PM W=4u L=1u','MN1 out in 0 0 NM W=2u L=1u',...RL,'.dc VIN 0 5 0.05','.end'].join('\n')},
g1(109,'NOT gate (CMOS inverter cell)','`y` is the complement of `a`. Cell `INV` comes from the built-in CMOS library.','INV'),
g1(110,'Buffer (two inverters)','`y` follows `a`. Cell `BUF` = INV + INV.','BUF'),
g2(111,0,'AND gate','Inputs A and B count through all four combinations. `y` is high only when both are high.','AND2'),
g2(112,0,'NAND gate','NAND2: series NMOS pull-down, parallel PMOS pull-up.','NAND2'),
g2(113,0,'OR gate','OR2 = NOR2 + inverter.','OR2'),
g2(114,0,'NOR gate','NOR2: parallel NMOS pull-down, series PMOS pull-up.','NOR2'),
g2(115,0,'XOR gate','XOR2 built from four NAND2 cells: high when inputs differ.','XOR2'),
g2(116,0,'XNOR gate','XNOR2 = XOR2 + inverter: high when inputs match.','XNOR2'),
g3(117,'3-input NAND gate','A, B and C count in binary; `y` is low only for 111.','NAND3'),
g3(118,'3-input NOR gate','`y` is high only for 000.','NOR3'),
g3(119,'3-input AND gate','`y` is high only for 111.','AND3'),
g3(120,'3-input OR gate','`y` is low only for 000.','OR3'),
{n:121,title:'Half adder (XOR + AND)',desc:'`sum` = A ⊕ B and `cout` = A·B, from two library gates.',
 net:exNet(['* Half adder',...sup,pA,pB,'X1 a b sum vdd 0 XOR2','X2 a b cout vdd 0 AND2','.tran 20n 20u'])},
{n:122,title:'Full adder (2 XOR + 2 AND + OR)',desc:'Three inputs `a`, `b`, `c`(carry-in); outputs `sum` and `cout`.',
 net:exNet(['* Full adder',...sup,pA,pB,pC,'X1 a b s1 vdd 0 XOR2','X2 s1 c sum vdd 0 XOR2','X3 a b c1 vdd 0 AND2','X4 s1 c c2 vdd 0 AND2','X5 c1 c2 cout vdd 0 OR2','.tran 40n 40u'])},
{n:123,title:'SR latch from two NOR gates',desc:'Cross-coupled NORs remember: `r` clears `q` first, `s` sets it at 3 µs, `r` clears it again at 12 µs.',
 net:exNet(['* NOR SR latch',...sup,'VS s 0 PWL(0 0 3u 0 3.01u 5 5u 5 5.01u 0)','VR r 0 PWL(0 5 1u 5 1.01u 0 12u 0 12.01u 5 14u 5 14.01u 0)','X1 r qb q vdd 0 NOR2','X2 s q qb vdd 0 NOR2','.tran 20n 20u'])},
{n:124,title:'555 clock gated by an AND gate',desc:'A 555 astable (~10 kHz) feeds one AND input; `en` gates it on and off at 200 µs.',
 net:exNet(['* 555 clock + AND gate','VDD vdd 0 DC 5','X1 0 trig clk vdd ctrl trig disch vdd NE555','R1 vdd disch 1k','R2 disch trig 6.8k','C1 trig 0 10n IC=0','C2 ctrl 0 10n','VE en 0 PULSE(0 5 0 1n 1n 200u 400u)','X2 clk en y vdd 0 AND2','CY y 0 100f','.tran 100n 800u uic'])}]})}


/* results.js — simulation dock: tables, plots, probes */
/* ---------- results UI ---------- */
let RES=null,TAB='op',simT;const PL={},SEL={dc:new Set(),ac:new Set(),tran:new Set()};
const T=tx,COL=['#2b8fd6','#e8590c','#2f9e44','#ae3ec9','#f08c00','#1098ad','#d6336c','#5c7cfa'];
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
  if(S.P.errs.length)R={errs:['Fix the netlist errors first (see Netlist tab)'],warn:[]};
  else try{R=runSim(S.P)}catch(err){R={errs:['Simulator error: '+err.message],warn:[]}}
  R.ms=performance.now()-t0;RES=R;if(S.pickTab&&R.op){S.pickTab=false;TAB=['tran','ac','dc'].find(k=>R[k])||'op'}if(R.op&&TAB!=='op'&&!R[TAB])TAB='op';showTab()}
const schedSim=()=>{if($('#auto').checked){clearTimeout(simT);simT=setTimeout(runSimUI,150)}};
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

/* app.js — schematic editor UI: palette, canvas interactions, inspector, netlist sync, examples */
const svg=$('#svg'),scene=$('#scene'),over=$('#over'),src=$('#src');
const S={M:newModel(),P:null,sel:new Set(),selW:null,selNet:null,tool:'select',armed:null,armV:null,gr:0,gm:0,hist:[],fut:[],vb:{x:-100,y:-60,w:1000,h:600},mouse:{x:0,y:0,gx:0,gy:0,in:false},wire:null,drag:null,pan:null,sig:'',touched:false,pickTab:false,desc:'',lastKey:'',lastT:0};
const PAL=[{k:'R',g:'Passive'},{k:'C',g:'Passive'},{k:'Cp',g:'Passive'},{k:'L',g:'Passive'},
 {k:'V',g:'Sources',n:'DC source'},{k:'V',g:'Sources',n:'Sine source',v:'SIN(0 1 1k) AC 1'},{k:'V',g:'Sources',n:'Pulse source',v:'PULSE(0 5 0 1n 1n 0.5m 1m)'},{k:'I',g:'Sources'},
 {k:'D',g:'Semiconductors'},{k:'SCH',g:'Semiconductors'},{k:'ZEN',g:'Semiconductors'},{k:'LED',g:'Semiconductors'},{k:'QN',g:'Semiconductors'},{k:'QP',g:'Semiconductors'},{k:'MN',g:'Semiconductors'},{k:'MP',g:'Semiconductors'},{k:'MN4',g:'Semiconductors'},{k:'MP4',g:'Semiconductors'},
 {k:'OA',g:'Active'},{k:'EV',g:'Active'},{k:'GV',g:'Active'},{k:'V',g:'Sources',n:'Logic input A (10 µs)',v:'PULSE(0 5 0 1n 1n 5u 10u)'},{k:'V',g:'Sources',n:'Logic input B (20 µs)',v:'PULSE(0 5 0 1n 1n 10u 20u)'},
 {k:'NE555',g:'ICs'},{k:'G_INV',g:'CMOS logic gates'},{k:'G_BUF',g:'CMOS logic gates'},{k:'G_AND2',g:'CMOS logic gates'},{k:'G_NAND2',g:'CMOS logic gates'},{k:'G_OR2',g:'CMOS logic gates'},{k:'G_NOR2',g:'CMOS logic gates'},{k:'G_XOR2',g:'CMOS logic gates'},{k:'G_XNOR2',g:'CMOS logic gates'},{k:'G_AND3',g:'CMOS logic gates'},{k:'G_NAND3',g:'CMOS logic gates'},{k:'G_OR3',g:'CMOS logic gates'},{k:'G_NOR3',g:'CMOS logic gates'},
 {k:'GND',g:'Nets & ground'},{k:'LBL',g:'Nets & ground'}];
const ALT={D:['D','SCH','ZEN','LED'],SCH:['D','SCH','ZEN','LED'],ZEN:['D','SCH','ZEN','LED'],LED:['D','SCH','ZEN','LED'],C:['C','Cp'],Cp:['C','Cp'],MN:['MN','MN4'],MN4:['MN','MN4'],MP:['MP','MP4'],MP4:['MP','MP4']};
['G_AND2','G_NAND2','G_OR2','G_NOR2','G_XOR2','G_XNOR2'].forEach((k,_,a)=>ALT[k]=a);['G_AND3','G_NAND3','G_OR3','G_NOR3'].forEach((k,_,a)=>ALT[k]=a);ALT.G_INV=ALT.G_BUF=['G_INV','G_BUF'];
const PRE={V:['PULSE(0 5 0 1n 1n 5u 10u)','PULSE(0 5 0 1n 1n 10u 20u)','DC 5','DC 12','AC 1','SIN(0 1 1k)','SIN(0 1 1k) AC 1','PULSE(0 5 0 1n 1n 0.5m 1m)','PWL(0 0 1m 5 2m 0)'],I:['DC 1m','AC 1m','SIN(0 1m 1k)','PULSE(0 1m 0 1n 1n 0.5m 1m)']};
const LIGHT={'--sym':'#1f3248','--symf':'#eaf3fb','--wire':'#0d8a66','--ink':'#14263a','--mut':'#62768b','--accent':'#1f8fe0','--err':'#d64545'};
/* ---------- view ---------- */
function setVB(){const r=svg.getBoundingClientRect();if(r.width)S.vb.h=S.vb.w*r.height/r.width;const v=S.vb;svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`)}
function bounds(){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;S.M.parts.forEach(p=>{const b=partBox(p);x0=Math.min(x0,b[0]-2);y0=Math.min(y0,b[1]-5);x1=Math.max(x1,b[2]+8);y1=Math.max(y1,b[3]+4)});S.M.wires.forEach(w=>w.pts.forEach(q=>{x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1])}));return x0>1e8?null:{x0,y0,x1,y1}}
function fit(){const b=bounds(),r=svg.getBoundingClientRect(),ar=(r.width||1000)/(r.height||600);
  if(!b){S.vb={x:-100,y:-60,w:1000,h:1000/ar};setVB();return}
  let w=(b.x1-b.x0)*U+80,h=(b.y1-b.y0)*U+80;if(w/h<ar)w=h*ar;else h=w/ar;w=Math.max(w,(r.width||1000)/1.5);
  S.vb={x:(b.x0+b.x1)/2*U-w/2,y:(b.y0+b.y1)/2*U-h/2,w,h};setVB()}
function zoom(f,cx,cy){const v=S.vb;if(cx==null){cx=v.x+v.w/2;cy=v.y+v.h/2}const nw=Math.max(120,Math.min(8000,v.w*f)),k=nw/v.w;v.x=cx-(cx-v.x)*k;v.y=cy-(cy-v.y)*k;v.w=nw;S.touched=true;setVB()}
function toWorld(e){const r=svg.getBoundingClientRect(),v=S.vb;return[v.x+(e.clientX-r.left)/r.width*v.w,v.y+(e.clientY-r.top)/r.height*v.h]}
/* ---------- drawing ---------- */
function draw(){scene.innerHTML=drawScene(S.M,{sel:S.sel,selW:S.selW,selNet:S.selNet});drawOver();
  $('#sCount').textContent=`${S.M.parts.filter(p=>p.t!=='GND'&&p.t!=='LBL').length} parts · ${S.M.wires.length} wires`}
const lr=(a,b,hf)=>a[0]===b[0]||a[1]===b[1]?[b]:hf?[[b[0],a[1]],b]:[[a[0],b[1]],b];
function wirePath(){const w=S.wire,last=w.pts[w.pts.length-1],cur=[S.mouse.gx,S.mouse.gy];
  const hf=w.pts.length===1&&w.dir!=null?w.dir:Math.abs(cur[0]-last[0])>=Math.abs(cur[1]-last[1]);return[...w.pts,...lr(last,cur,hf)]}
function drawOver(){let s='';
  if(S.tool==='place'&&S.armed&&S.mouse.in)s+=`<g opacity=".6" pointer-events="none">${drawPart({id:'g',t:S.armed,n:'',v:S.armV!=null?S.armV:(SYMS[S.armed].def||''),x:S.mouse.gx,y:S.mouse.gy,r:S.gr,m:S.gm})}</g>`;
  if(S.wire){const p=wirePath();s+=`<path d="M${p.map(q=>q[0]*U+' '+q[1]*U).join('L')}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-dasharray="6 3" stroke-linecap="round"/><circle cx="${S.mouse.gx*U}" cy="${S.mouse.gy*U}" r="4" fill="var(--accent)"/>`}
  over.innerHTML=s}
function hint(t){$('#sHint').textContent=t}
function setTool(t,k,v){S.tool=t;S.armed=k||null;S.armV=v==null?null:v;S.wire=null;svg.setAttribute('class',t==='place'?'place':t==='wire'?'wire':'');
  document.querySelectorAll('.tools [data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===(t==='place'?'select':t)));
  document.querySelectorAll('.pi').forEach(b=>b.classList.toggle('on',t==='place'&&b.dataset.k===k&&(b.dataset.v||'')===(v||'')));
  hint(t==='place'?`Placing ${SYMS[k].name} — click to drop · R rotate · Esc to stop`:t==='wire'?'Wire tool — click to start, click to bend, click a pin to finish':'Select tool — drag parts · click a pin to wire · Del to delete');drawOver()}
/* ---------- model editing ---------- */
const uid=M=>'u'+(M.seq++);
function newName(pre){let n=1;while(S.M.parts.some(p=>p.n.toLowerCase()===(pre+n).toLowerCase()))n++;return pre+n}
function ensureModel(M,p){const D=SYMS[p.t];if(!D.mdl)return;const nm=(p.v||'').split(/\s+/)[0];if(!nm)return;
  const re=new RegExp('^\\.model\\s+'+nm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s','i');
  if(!M.dirs.some(d=>re.test(d))){const i=M.dirs.findIndex(d=>/^\.(op|dc|ac|tran)/i.test(d));M.dirs.splice(i<0?M.dirs.length:i,0,`.model ${nm} ${D.mdl}`)}}
function mutate(fn,key,keep){const now=Date.now();if(!(key&&key===S.lastKey&&now-S.lastT<900)){S.hist.push(JSON.stringify(S.M));if(S.hist.length>120)S.hist.shift()}S.fut=[];S.lastKey=key||'';S.lastT=now;fn();afterEdit(keep)}
function writeText(t){src.value=t;S.P=parse(t);S.sig=sigOf(S.P);gutter();showErrs(S.P)}
function afterEdit(keep){const X=extract(S.M);S.M.wires.forEach(w=>{const g=X.segs.find(s=>s.w===w);if(g&&g.net)w.net=g.net});
  writeText(genNetlist(S.M));draw();updUndo();if(keep)codePreview();else inspect();schedSim()}
function normPts(pts){const o=[];pts.forEach(q=>{if(!o.length||o[o.length-1][0]!==q[0]||o[o.length-1][1]!==q[1])o.push([q[0],q[1]])});
  for(let i=o.length-2;i>0;i--){const a=o[i-1],b=o[i],c=o[i+1];if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1]))o.splice(i,1)}return o.length>1?o:null}
function addPart(k,gx,gy,v){mutate(()=>{const D=SYMS[k];let val=v!=null?v:D.def;
    const pre=D.pre||'';let n=k==='GND'?'':k==='LBL'?'':newName(pre);if(k==='LBL'){let i=1;while(S.M.parts.some(p=>p.t==='LBL'&&p.v==='net'+i))i++;val='net'+i}
    const p={id:uid(S.M),t:k,n,v:val==null?'':val,x:gx,y:gy,r:S.gr,m:S.gm};S.M.parts.push(p);ensureModel(S.M,p);S.sel=new Set([p.id]);S.selW=null})}
function delSel(){if(S.selW){mutate(()=>{S.M.wires=S.M.wires.filter(w=>w!==S.selW);S.selW=null;S.selNet=null});return}
  if(!S.sel.size)return;mutate(()=>{S.M.parts=S.M.parts.filter(p=>!S.sel.has(p.id));S.sel.clear()})}
function dupSel(){if(!S.sel.size)return;mutate(()=>{const ns=new Set();[...S.sel].forEach(id=>{const p=S.M.parts.find(q=>q.id===id);if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=uid(S.M);c.x+=3;c.y+=3;if(SYMS[c.t].pre)c.n=newName(SYMS[c.t].pre);S.M.parts.push(c);ns.add(c.id)});S.sel=ns})}
function attach(ids){const pk=new Map();S.M.parts.filter(p=>ids.has(p.id)).forEach(p=>partPins(p).forEach(q=>pk.set(K(q.x,q.y),{p,name:q.name,ox:q.ox,oy:q.oy})));
  const att=[];S.M.wires.forEach(w=>{const a=w.pts[0],b=w.pts[w.pts.length-1],ka=pk.get(K(a[0],a[1])),kb=pk.get(K(b[0],b[1]));if(ka||kb)att.push({w,o:w.pts.map(q=>q.slice()),a:ka,b:kb})});return att}
function transformSel(fn){if(!S.sel.size)return;mutate(()=>{const att=attach(S.sel);S.M.parts.filter(p=>S.sel.has(p.id)).forEach(fn);
  const pos=(t)=>{const pp=partPins(t.p).find(q=>q.name===t.name);return pp};
  att.forEach(t=>{const A=t.a&&pos(t.a),B=t.b&&pos(t.b),o=t.o,n=o.length;
    if(A&&B){const na=[A.x,A.y],nb=[B.x,B.y];t.w.pts=[na,...lr(na,nb,A.ox!==0)]}
    else if(A){const na=[A.x,A.y];t.w.pts=[na,...lr(na,o[n-1],A.ox!==0)]}
    else{const nb=[B.x,B.y];t.w.pts=[o[0],...lr(o[0],nb,B.ox===0)]}
    t.w.pts=normPts(t.w.pts)||t.w.pts});S.M.wires=S.M.wires.filter(w=>w.pts.length>1)})}
const rotSel=()=>{if(S.tool==='place'){S.gr=(S.gr+1)%4;drawOver();return}transformSel(p=>{if(p.t!=='GND'||true)p.r=(p.r+1)%4})};
const mirSel=()=>{if(S.tool==='place'){S.gm^=1;drawOver();return}transformSel(p=>{p.m=p.m?0:1})};
function startDrag(ids,g){const att=attach(ids);S.drag={ids,start:g,orig:S.M.parts.filter(p=>ids.has(p.id)).map(p=>[p.id,p.x,p.y]),att,moved:false,snap:JSON.stringify(S.M)}}
function doDrag(gx,gy){const d=S.drag,dx=gx-d.start[0],dy=gy-d.start[1];if(!dx&&!dy&&!d.moved)return;d.moved=true;
  d.orig.forEach(([id,x,y])=>{const p=S.M.parts.find(q=>q.id===id);p.x=x+dx;p.y=y+dy});
  d.att.forEach(t=>{const o=t.o,n=o.length;
    if(t.a&&t.b)t.w.pts=o.map(q=>[q[0]+dx,q[1]+dy]);
    else if(t.a){const na=[o[0][0]+dx,o[0][1]+dy];t.w.pts=[na,...lr(na,o[n-1],t.a.ox!==0)]}
    else{const nb=[o[n-1][0]+dx,o[n-1][1]+dy];t.w.pts=[o[0],...lr(o[0],nb,t.b.ox===0)]}});draw()}
function endDrag(){const d=S.drag;S.drag=null;if(!d||!d.moved)return;S.hist.push(d.snap);S.fut=[];
  S.M.wires.forEach(w=>{w.pts=normPts(w.pts)||[w.pts[0],w.pts[0]]});S.M.wires=S.M.wires.filter(w=>w.pts.length>1&&!(w.pts.length===2&&w.pts[0][0]===w.pts[1][0]&&w.pts[0][1]===w.pts[1][1]));afterEdit()}
/* ---------- hit testing ---------- */
function pinAt(wx,wy,tol){tol=tol||8;let best=null,bd=tol;S.M.parts.forEach(p=>partPins(p).forEach(q=>{const d=Math.hypot(q.x*U-wx,q.y*U-wy);if(d<bd){bd=d;best={p,q}}}));return best}
function partAt(wx,wy){let best=null,ba=1e9;S.M.parts.forEach(p=>{const b=partBox(p),m=p.t==='GND'||p.t==='LBL'?1.2:.6;if(wx>=(b[0]-m)*U&&wx<=(b[2]+m)*U&&wy>=(b[1]-m)*U&&wy<=(b[3]+m)*U){const a=(b[2]-b[0]+2*m)*(b[3]-b[1]+2*m);if(a<ba){ba=a;best=p}}});return best}
const segDist=(px,py,a,b)=>{const x1=a[0]*U,y1=a[1]*U,x2=b[0]*U,y2=b[1]*U,dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l)):0;return Math.hypot(px-x1-t*dx,py-y1-t*dy)};
function wireAt(wx,wy){let best=null,bd=6;S.M.wires.forEach(w=>{for(let i=0;i+1<w.pts.length;i++){const d=segDist(wx,wy,w.pts[i],w.pts[i+1]);if(d<bd){bd=d;best=w}}});return best}
const wireAtGrid=(gx,gy)=>S.M.wires.some(w=>{for(let i=0;i+1<w.pts.length;i++)if(segDist(gx*U,gy*U,w.pts[i],w.pts[i+1])<.5)return true;return false});
/* ---------- wiring ---------- */
function startWire(pt,q){S.wire={pts:[pt],dir:q?q.ox!==0:null};S.mouse.gx=pt[0];S.mouse.gy=pt[1];hint('Wire — click to bend · click a pin or wire to finish · Esc cancels');drawOver()}
function finishWire(path){const pts=normPts(path);S.wire=null;if(pts)mutate(()=>S.M.wires.push({pts,net:''}));else draw();drawOver();if(S.tool!=='wire')hint('Select tool')}
function wireClick(gx,gy){const w=S.wire,last=w.pts[w.pts.length-1],path=wirePath();
  const hit=pinAt(gx*U,gy*U,6)||wireAtGrid(gx,gy);
  if(gx===last[0]&&gy===last[1]){if(w.pts.length>1)finishWire(w.pts);return}
  if(hit){finishWire(path);return}
  w.pts=path;w.dir=null;drawOver()}
/* ---------- pointer / keyboard ---------- */
function pan(e,clr){S.pan={x:e.clientX,y:e.clientY,vx:S.vb.x,vy:S.vb.y,moved:false,clr};svg.classList.add('pan')}
svg.addEventListener('pointerdown',e=>{svg.focus();const[wx,wy]=toWorld(e),gx=Math.round(wx/U),gy=Math.round(wy/U);S.mouse={x:wx,y:wy,gx,gy,in:true};
  if(e.button===1||(e.button===0&&e.altKey)){pan(e);e.preventDefault();return}
  if(e.button!==0)return;
  if(S.tool==='place'){addPart(S.armed,gx,gy,S.armV);return}
  if(S.wire){wireClick(gx,gy);return}
  const pin=pinAt(wx,wy,7);
  if(S.tool==='wire'||pin){const q=pin&&pin.q;startWire(q?[q.x,q.y]:[gx,gy],q);return}
  const part=partAt(wx,wy);
  if(part){if(e.shiftKey){S.sel.has(part.id)?S.sel.delete(part.id):S.sel.add(part.id)}else if(!S.sel.has(part.id))S.sel=new Set([part.id]);
    S.selW=null;S.selNet=null;startDrag(new Set(S.sel),[gx,gy]);draw();inspect();return}
  const w=wireAt(wx,wy);
  if(w){S.selW=w;S.sel.clear();S.selNet=w.net||null;probe(w.net);draw();inspect();return}
  S.sel.clear();S.selW=null;S.selNet=null;pan(e,true);draw();inspect()});
addEventListener('pointermove',e=>{
  if(S.pan){const r=svg.getBoundingClientRect(),dx=e.clientX-S.pan.x,dy=e.clientY-S.pan.y;if(Math.abs(dx)+Math.abs(dy)>3)S.pan.moved=true;
    if(S.pan.moved){S.vb.x=S.pan.vx-dx*S.vb.w/r.width;S.vb.y=S.pan.vy-dy*S.vb.w/r.width;S.touched=true;setVB()}return}
  const r=svg.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
  if(!inside&&!S.drag){if(S.mouse.in){S.mouse.in=false;drawOver()}return}
  const[wx,wy]=toWorld(e),gx=Math.round(wx/U),gy=Math.round(wy/U);S.mouse={x:wx,y:wy,gx,gy,in:true};$('#sCoord').textContent=`x ${gx} · y ${gy}`;
  if(S.drag)doDrag(gx,gy);else if(S.wire||S.tool==='place')drawOver()});
addEventListener('pointerup',()=>{if(S.pan){svg.classList.remove('pan');S.pan=null}if(S.drag)endDrag()});
svg.addEventListener('dblclick',e=>{if(S.wire){finishWire(S.wire.pts.length>1?S.wire.pts:wirePath());return}const[wx,wy]=toWorld(e),p=partAt(wx,wy);if(p){selTab('prop');const f=$('#fV')||$('#fN');if(f){f.focus();f.select()}}});
svg.addEventListener('contextmenu',e=>{e.preventDefault();if(S.tool!=='select'||S.wire)setTool('select')});
svg.addEventListener('wheel',e=>{e.preventDefault();const[wx,wy]=toWorld(e);zoom(e.deltaY<0?.87:1.15,wx,wy)},{passive:false});
svg.addEventListener('dragover',e=>e.preventDefault());
svg.addEventListener('drop',e=>{e.preventDefault();const k=e.dataTransfer.getData('text/sym');if(!k)return;const[wx,wy]=toWorld(e),v=e.dataTransfer.getData('text/val');addPart(k,Math.round(wx/U),Math.round(wy/U),v||undefined)});
addEventListener('keydown',e=>{const t=e.target,typing=/INPUT|TEXTAREA|SELECT/.test(t.tagName);
  if(e.key==='Escape'){S.wire?(S.wire=null,drawOver()):setTool('select');S.sel.clear();S.selW=null;draw();inspect();return}
  if(typing)return;const k=e.key.toLowerCase(),c=e.ctrlKey||e.metaKey;
  if(c&&k==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(c&&k==='y'){e.preventDefault();redo()}else if(c&&k==='d'){e.preventDefault();dupSel()}
  else if(k==='delete'||k==='backspace'){e.preventDefault();delSel()}else if(k==='r'&&!c)rotSel();else if(k==='m')mirSel();else if(k==='w')setTool('wire');else if(k==='f'){S.touched=false;fit()}
  else if(k==='a'&&c){e.preventDefault();S.sel=new Set(S.M.parts.map(p=>p.id));draw();inspect()}});
function undo(){if(!S.hist.length)return;S.fut.push(JSON.stringify(S.M));S.M=JSON.parse(S.hist.pop());S.sel.clear();S.selW=null;afterEdit()}
function redo(){if(!S.fut.length)return;S.hist.push(JSON.stringify(S.M));S.M=JSON.parse(S.fut.pop());S.sel.clear();S.selW=null;afterEdit()}
const updUndo=()=>{$('#bUndo').disabled=!S.hist.length;$('#bRedo').disabled=!S.fut.length};
function probe(net){if(!net||!RES||!RES.tr||!RES.tr.some(t=>t.name==='v('+net+')'))return;const tab=RES[TAB]&&TAB!=='op'?TAB:['tran','ac','dc'].find(k=>RES[k]);if(tab){TAB=tab;chips(tab,RES);SEL[tab].add('v('+net+')');showTab()}}
/* ---------- palette ---------- */
function buildPalette(q){q=(q||'').toLowerCase();const groups={};PAL.forEach(p=>{const nm=p.n||SYMS[p.k].name;if(q&&!nm.toLowerCase().includes(q))return;(groups[p.g]=groups[p.g]||[]).push([p,nm])});
  $('#plist').innerHTML=Object.entries(groups).map(([g,L])=>`<div class="pg"><h4>${g}</h4><div class="pgrid">${L.map(([p,nm])=>`<div class="pi" draggable="true" data-k="${p.k}" data-v="${esc(p.v||'')}" title="${esc(nm)}">${iconSVG(p.k,46,p.v)}<span>${esc(nm)}</span></div>`).join('')}</div></div>`).join('')||'<p class="hint">No match</p>'}
$('#plist').addEventListener('click',e=>{const b=e.target.closest('.pi');if(!b)return;const k=b.dataset.k,v=b.dataset.v||null;S.tool==='place'&&S.armed===k&&(S.armV||null)===v?setTool('select'):setTool('place',k,v)});
$('#plist').addEventListener('dragstart',e=>{const b=e.target.closest('.pi');if(!b)return;e.dataTransfer.setData('text/sym',b.dataset.k);e.dataTransfer.setData('text/val',b.dataset.v||'')});
$('#psearch').addEventListener('input',e=>buildPalette(e.target.value));
/* ---------- inspector ---------- */
const lineOf=p=>genNetlist(S.M).split('\n').find(l=>l.split(' ')[0]===p.n)||'';
function codePreview(){const c=$('#fCode'),p=S.M.parts.find(q=>S.sel.has(q.id));if(c&&p)c.textContent=lineOf(p)}
function inspect(){const P=$('#pProp'),ids=[...S.sel],M=S.M;
  if(S.selW){const n=S.selW.net||'';P.innerHTML=`<div class="ph"><div><b>Wire</b><small>${S.selW.pts.length-1} segment(s)</small></div></div><div class="field">Net name<input value="${esc(n)}" disabled></div><div class="row">${RES&&RES.tr&&RES.tr.some(t=>t.name==='v('+n+')')?'<button id="bProbe">Plot v('+esc(n)+')</button>':''}<button id="bDelW">Delete wire</button></div><p class="hint">Net names come from your netlist. Add a <b>Net label</b> part to name a net yourself.</p>`;return}
  if(!ids.length){P.innerHTML=`<div class="field">Circuit title<input id="fTitle" value="${esc(M.title||'')}"></div>
    ${S.desc?`<p class="hint" style="margin:0 0 12px">${esc(S.desc)}</p>`:''}
    <div class="empty"><h3>Nothing selected</h3>Click a part to edit its properties.<br>Changes are written to the NGspice netlist instantly.</div>`;return}
  if(ids.length>1){P.innerHTML=`<div class="ph"><div><b>${ids.length} parts selected</b></div></div><div class="row"><button id="bRot">Rotate</button><button id="bMir">Mirror</button></div><div class="row"><button id="bDup">Duplicate</button><button id="bDel">Delete</button></div>`;return}
  const p=M.parts.find(q=>q.id===ids[0]);if(!p){P.innerHTML='';return}const D=SYMS[p.t],two=!!D.pre;
  const vl={R:'Resistance',C:'Capacitance',L:'Inductance',V:'Source value',I:'Source value',D:'Model',Q:'Model',M:'Model / W L',E:'Gain',G:'Transconductance',X:'Subcircuit'}[D.pre]||'Value';
  P.innerHTML=`<div class="ph">${iconSVG(p.t,64,p.v)}<div><b>${esc(p.n||D.name)}</b><small>${esc(D.name)}</small></div></div>
  ${two?`<div class="field">Reference<input id="fN" value="${esc(p.n)}"></div>`:''}
  ${p.t==='GND'?'<p class="hint">All ground symbols are node 0.</p>':`<div class="field">${p.t==='LBL'?'Net name':vl}<input id="fV" value="${esc(p.v)}" spellcheck="false" autocomplete="off"></div>`}
  ${PRE[D.pre]&&(D.pre==='V'||D.pre==='I')?`<div class="field">Preset<select id="fP"><option value="">choose waveform…</option>${PRE[D.pre].map(v=>`<option>${esc(v)}</option>`).join('')}</select></div>`:''}
  ${ALT[p.t]?`<div class="field">Symbol<select id="fS">${ALT[p.t].map(k=>`<option value="${k}" ${k===p.t?'selected':''}>${SYMS[k].name}</option>`).join('')}</select></div>`:''}
  <div class="row"><button id="bRot">⟳ Rotate</button><button id="bMir">⇋ Mirror</button></div><div class="row"><button id="bDup">Duplicate</button><button id="bDel">Delete</button></div>
  ${two?`<div class="field" style="margin-top:10px">NGspice line</div><code class="code" id="fCode">${esc(lineOf(p))}</code>`:''}`}
$('#pProp').addEventListener('input',e=>{const id=e.target.id,p=S.M.parts.find(q=>S.sel.has(q.id));
  if(id==='fTitle'){mutate(()=>{S.M.title=e.target.value},'title',true);return}
  if(!p)return;
  if(id==='fV')mutate(()=>{p.v=e.target.value;ensureModel(S.M,p)},'v'+p.id,true);
  else if(id==='fN'){const v=e.target.value.trim();if(v&&!S.M.parts.some(q=>q!==p&&q.n.toLowerCase()===v.toLowerCase()))mutate(()=>{p.n=v},'n'+p.id,true)}
  else if(id==='fP'&&e.target.value){mutate(()=>{p.v=e.target.value},'p'+p.id,true);$('#fV').value=p.v;e.target.value=''}
  else if(id==='fS')mutate(()=>{p.t=e.target.value;if(SYMS[p.t].sub)p.v=SYMS[p.t].def;ensureModel(S.M,p)});});
$('#pProp').addEventListener('click',e=>{const id=e.target.id;
  if(id==='bRot')rotSel();else if(id==='bMir')mirSel();else if(id==='bDel')delSel();else if(id==='bDup')dupSel();else if(id==='bDelW')delSel();
  else if(id==='bProbe')probe(S.selW.net)});
/* ---------- netlist panel ---------- */
/* ---- NGspice syntax highlighter (overlay <pre> behind a transparent textarea) ---- */
const HL_KW=/\b(dc|ac|sin|pulse|pwl|exp)(?=[\s(]|$)/gi,HL_TY=/\b(npn|pnp|nmos|pmos|d|njf|pjf)(?=[\s(]|$)/gi;
function hlGen(s){return esc(s).replace(/([A-Za-z_]\w*)(?==)|(\b(?:dc|ac|sin|pulse|pwl|exp)\b(?=[\s(]|$))|(\b(?:npn|pnp|nmos|pmos)\b(?=[\s(]|$))|(-?\b\d*\.?\d+(?:e[-+]?\d+)?(?:meg|mil|[tgkmunpf])?[A-Za-z]*)|([()=,])/gi,(m,a,b,c,d,f)=>a?`<span class="p">${a}</span>`:b?`<span class="k">${b}</span>`:c?`<span class="q">${c}</span>`:d?`<span class="x">${d}</span>`:`<span class="u">${f}</span>`)}
function hlLine(l){
  if(/^\s*[*;]/.test(l))return`<span class="c">${esc(l)}</span>`;
  let m=/^(\s*)(\.\w+)(.*)$/.exec(l);
  if(m){let r=m[3];if(/^\.model$/i.test(m[2])){const q=/^(\s+)(\S+)(\s+)(\w+)(.*)$/.exec(r);if(q)return esc(m[1])+`<span class="d">${esc(m[2])}</span>`+esc(q[1])+`<span class="n">${esc(q[2])}</span>`+esc(q[3])+`<span class="q">${esc(q[4])}</span>`+hlGen(q[5])}
    return esc(m[1])+`<span class="d">${esc(m[2])}</span>`+hlGen(r)}
  m=/^(\s*)\+(.*)$/.exec(l);if(m)return esc(m[1])+'<span class="u">+</span>'+hlGen(m[2]);
  m=/^(\s*)(\S+)(.*)$/.exec(l);if(!m)return esc(l);
  const L=m[2][0].toUpperCase(),cls='RCL'.includes(L)?'e1':'VI'.includes(L)?'e2':'DQMJ'.includes(L)?'e3':'EGFH'.includes(L)?'e4':'e5',toks=m[3].split(/(\s+)/);
  let np=L==='X'?toks.filter(t=>t&&!/^\s+$/.test(t)).length-1:(NP[L]||2),out=esc(m[1])+`<span class="${cls}">${esc(m[2])}</span>`,seen=0,rest='';
  toks.forEach(t=>{if(!t||/^\s+$/.test(t)){(seen<np?out+=t:rest+=t);return}
    if(seen<np){seen++;out+=`<span class="${t==='0'||/^gnd$/i.test(t)?'g':'n'}">${esc(t)}</span>`}else rest+=t});
  return out+hlGen(rest)}
function highlight(){const bad=new Set(((S.P&&S.P.errs)||[]).map(x=>x.n));
  $('#hl').innerHTML=src.value.split('\n').map((l,i)=>bad.has(i)?`<span class="lerr">${hlLine(l)||' '}</span>`:hlLine(l)).join('\n')+'\n'}
function gutter(){const n=src.value.split('\n').length;$('#gut').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');highlight()}
src.addEventListener('scroll',()=>{$('#gut').scrollTop=src.scrollTop;const h=$('#hl');h.scrollTop=src.scrollTop;h.scrollLeft=src.scrollLeft});
function showErrs(P){setTimeout(highlight,0);$('#nerr').innerHTML=(P.errs.length?P.errs.map(x=>`<div class="er">Line ${x.n+1}: ${esc(x.m)}</div>`).join(''):`<div class="ok">✓ ${P.els.length} elements · ${P.dirs.filter(d=>/^\.(op|dc|ac|tran)/i.test(d)).length} analyses</div>`)+P.warn.map(w=>`<div class="wn">⚠ ${esc(w)}</div>`).join('')}
function onText(){const P=parse(src.value);S.P=P;gutter();showErrs(P);if(P.errs.length){schedSim();return}
  const sg=sigOf(P);
  if(sg===S.sig&&S.M.parts.length){P.els.forEach(e=>{const p=S.M.parts.find(q=>q.n===e.n);if(p)p.v=e.k==='V'||e.k==='I'?e.val:e.tail});S.M.dirs=P.dirs.slice();S.M.title=P.title}
  else{S.M=buildFromNetlist(P);S.sig=sg;S.sel.clear();S.selW=null;S.selNet=null;S.hist=[];S.fut=[];if(!S.touched)fit()}
  draw();updUndo();inspect();schedSim()}
let txT;src.addEventListener('input',()=>{clearTimeout(txT);gutter();txT=setTimeout(onText,200)});
$('#addan').onchange=ev=>{const k=ev.target.value;ev.target.value='';if(!k)return;const vs=S.P.els.find(x=>x.k==='V'),
  L={op:'.op',dc:`.dc ${vs?vs.n:'V1'} 0 5 0.1`,ac:'.ac dec 20 10 100k',tran:'.tran 10u 5m'}[k],ls=src.value.replace(/\s+$/,'').split('\n');
  if(k==='ac'&&vs&&vs.span===1&&!/\bac\b/i.test(vs.val))ls[vs.line]=`${vs.n} ${vs.nodes.join(' ')} ${vs.tail||vs.val} AC 1`.replace(/\s+/g,' ');
  const ei=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));ei>=0?ls.splice(ei,0,L):ls.push(L);src.value=ls.join('\n');if(k!=='op')TAB=k;onText()};
$('#bCopy').onclick=async e=>{try{await navigator.clipboard.writeText(src.value)}catch(_){src.select();document.execCommand('copy')}e.target.textContent='Copied ✓';setTimeout(()=>e.target.textContent='Copy',1200)};
function selTab(p){document.querySelectorAll('.stabs button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));$('#pProp').hidden=p!=='prop';$('#pNet').hidden=p!=='net';if(p==='net')gutter()}
document.querySelector('.stabs').onclick=e=>{const b=e.target.closest('button');if(b)selTab(b.dataset.p)};
/* ---------- examples, files, export ---------- */
function loadText(t,desc){S.desc=desc||'';S.touched=false;S.sig='';src.value=t;S.pickTab=true;onText();fit()}
const topic=$('#topic'),exsel=$('#exsel');
TOPICS.forEach((t,i)=>topic.add(new Option(`${i+1}. ${t.topic} (${t.items.length})`,i)));
function fillEx(){exsel.innerHTML=TOPICS[topic.value].items.map(it=>`<option value="${it.n}">${it.n}. ${esc(it.title)}</option>`).join('')}
function loadSel(){const it=TOPICS[topic.value].items.find(x=>x.n==exsel.value);if(it)loadText(it.net,it.desc)}
topic.onchange=()=>{fillEx();loadSel()};exsel.onchange=loadSel;
$('#bNew').onclick=()=>{S.M=newModel();S.sel.clear();S.selW=null;S.hist=[];S.fut=[];S.desc='';S.touched=false;writeText(genNetlist(S.M));draw();inspect();fit();RES=null;showTab()};
$('#bOpen').onclick=()=>$('#fileIn').click();
$('#fileIn').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadText(String(r.result),'Loaded from '+f.name);r.readAsText(f);e.target.value=''};
const dl=(name,blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800)};
const fname=()=>((S.M.title||'circuit').replace(/[^\w-]+/g,'_').slice(0,40)||'circuit');
$('#bCir').onclick=()=>dl(fname()+'.cir',new Blob([src.value],{type:'text/plain'}));
function svgString(){const b=bounds();if(!b)return null;const p=3,x=(b.x0-p)*U,y=(b.y0-p)*U,w=(b.x1-b.x0+2*p)*U,h=(b.y1-b.y0+2*p)*U;
  const inner=drawScene(S.M,{pins:false}).replace(/var\((--[\w-]+)\)/g,(m,k)=>LIGHT[k]||'#000');
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${inner}</svg>`}
$('#bSvg').onclick=()=>{const s=svgString();if(s)dl(fname()+'.svg',new Blob([s],{type:'image/svg+xml'}))};
$('#bPng').onclick=()=>{const s=svgString();if(!s)return;const m=/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(s),w=+m[1]*2,h=+m[2]*2,img=new Image();
  img.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(b=>dl(fname()+'.png',b))};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s)};
/* ---------- chrome ---------- */
$('#bUndo').onclick=undo;$('#bRedo').onclick=redo;$('#tRot').onclick=rotSel;$('#tMir').onclick=mirSel;$('#tDel').onclick=delSel;
$('#tFit').onclick=()=>{S.touched=false;fit()};$('#tZi').onclick=()=>zoom(.8);$('#tZo').onclick=()=>zoom(1.25);
document.querySelectorAll('.tools [data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#bTheme').onclick=()=>{const r=document.documentElement,d=getComputedStyle(r).colorScheme==='dark';r.dataset.theme=d?'light':'dark'};
(function(){const sp=$('#split'),ct=document.querySelector('.center');let on=false;
  sp.addEventListener('pointerdown',e=>{on=true;sp.setPointerCapture(e.pointerId)});
  sp.addEventListener('pointermove',e=>{if(!on)return;const r=ct.getBoundingClientRect();ct.classList.remove('min','big');$('#dockB').textContent='⤢';ct.style.setProperty('--dockH',Math.max(100,Math.min(r.height-260,r.bottom-e.clientY))+'px');setVB()});
  sp.addEventListener('pointerup',()=>{on=false;if(!S.touched)fit()})})();
const toggleDock=()=>{const ct=document.querySelector('.center');ct.style.removeProperty('--dockH');ct.classList.remove('big');$('#dockB').textContent='⤢';ct.classList.toggle('min');$('#dockT').textContent=ct.classList.contains('min')?'▴':'▾';setTimeout(()=>{setVB();if(!S.touched)fit()},220)};
const toggleBig=()=>{const ct=document.querySelector('.center');ct.style.removeProperty('--dockH');ct.classList.remove('min');$('#dockT').textContent='▾';ct.classList.toggle('big');$('#dockB').textContent=ct.classList.contains('big')?'⤡':'⤢';setTimeout(()=>{setVB();if(!S.touched)fit()},220)};
$('#dockB').onclick=toggleBig;$('#dockT').onclick=toggleDock;$('#split').addEventListener('dblclick',toggleDock);
addEventListener('resize',()=>{setVB();if(!S.touched)fit()});
/* ---------- start ---------- */
buildPalette();selTab('prop');
topic.value=4;fillEx();exsel.value=60;
const it0=TOPICS[4].items.find(x=>x.n===60);loadText(it0.net,it0.desc);setTool('select');updUndo();
