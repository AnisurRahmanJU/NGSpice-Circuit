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
  if(k==='K') return t.length<4?{err:'needs two inductor names and a coupling k'}:{k,n,pins:[],l1:t[1],l2:t[2],val:t[3]};
  if('FHBT'.includes(k)) return t.length<3?{err:'needs two nodes'}:{k,n,hub:'B',pins:[P(1),P(2)],names:['+','−'],val:t.slice(3).join(' ')};
  return {err:'unsupported element type “'+k+'”'};
}
const nk=s=>String(s).trim().toLowerCase().replace(/\s+/g,' ');
function parse(text){
  const raw=text.split(/\r?\n/),L=[];
  raw.forEach((l,i)=>{if(/^\s*\+/.test(l)&&L.length){const q=L[L.length-1];q.t+=' '+l.replace(/^\s*\+/,'').trim();q.e=i}else L.push({t:l.trim(),n:i,e:i})});
  const M={title:'Circuit',els:[],dirs:[],errs:[],warn:[],notes:[]};let sub=0,blk=null,first=true,ctl=0,pend=[],seen=false;const fl=k=>{pend.forEach(t=>M.notes.push({t,at:seen?k:'head'}));pend=[];seen=true};
  for(const l of L){
    let s=l.t;if(!s)continue;
    if(/^\.control/i.test(s)){ctl=1;continue}if(/^\.endc/i.test(s)){ctl=0;continue}
    if(ctl){const m=/^(tran|ac|dc|op)\b/i.exec(s);if(m&&!M.dirs.some(d=>new RegExp('^\\.'+m[1]+'(\\s|$)','i').test(d)))M.dirs.push('.'+s.replace(/\s+/g,' '));continue}
    if(first){first=false;
      if(s[0]==='*'){M.title=s.replace(/^\*+\s*/,'')||M.title;continue}
      if(s[0]!=='.'){const p=parseEl(s);
        if(p.err||!/^[A-Za-z][A-Za-z0-9_]{0,5}$/.test(s.split(/\s+/)[0])){M.title=s;continue}}}
    if(!blk){const tm=/^\.title\b\s*(.*)$/i.exec(s);if(tm){const tt=tm[1].trim();if(tt)M.title=tt;M.tdir=true;continue}}
    if(s[0]==='*'||s[0]===';'){if(blk)blk.push(s);else if(s[0]==='*')pend.push(s);continue}
    s=s.replace(/\s*[;$].*$/,'');
    if(blk){if(!s)continue;blk.push(s);const dl=s.toLowerCase();if(/^\.subckt/.test(dl))sub++;else if(/^\.ends/.test(dl)){sub--;if(sub<=0){M.dirs.push(blk.join('\n'));blk=null;sub=0}}continue}
    if(s[0]==='.'){const d=s.toLowerCase();
      if(/^\.subckt/.test(d)){fl('d:'+nk(s));blk=[s];sub=1;continue}
      if(/^\.ends/.test(d))continue;
      if(!/^\.end$/.test(d)){fl('d:'+nk(s));M.dirs.push(s)}else fl('end');continue}
    const p=parseEl(s);
    if(p.err){M.errs.push({n:l.n,m:`${s.split(/\s+/)[0]}: ${p.err}`});continue}
    p.line=l.n;p.span=l.e-l.n+1;fl('el:'+p.n.toLowerCase());M.els.push(p);
  }
  if(pend.length)fl('end');
  if(blk)M.dirs.push(blk.join('\n')+'\n.ends');
  return M;
}

/* ---------- simulation engine (MNA: .op .dc .ac .tran) ---------- */
const SU={t:1e12,g:1e9,meg:1e6,k:1e3,m:1e-3,u:1e-6,n:1e-9,p:1e-12,f:1e-15,mil:25.4e-6};
function num(s){const m=/^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|mil|[tgkmunpf])?/i.exec(s==null?'':String(s));return m?+m[1]*(m[2]?SU[m[2].toLowerCase()]:1):NaN}
function eng(v,sp){if(!isFinite(v))return String(v);if(v===0)return'0';const P=['f','p','n',sp?'u':'µ','m','','k',sp?'meg':'M','G','T'];let e=Math.floor(Math.log10(Math.abs(v))/3);e=Math.max(-5,Math.min(4,e));return +(v/Math.pow(10,3*e)).toPrecision(sp?6:3)+P[e+5]}
function spec(v){const o={dc:null,acm:0,acp:0,w:null};let s=v||'';
  const f=/\b(sin|pulse|pwl|tri|saw|noise)\s*\(([^)]*)\)/i.exec(s);if(f){o.w={t:f[1].toLowerCase(),a:f[2].trim().split(/[\s,]+/).map(num)};s=s.replace(f[0],' ')}
  const a=/\bac\s+(\S+)(?:\s+(\S+))?/i.exec(s);if(a){o.acm=num(a[1])||0;const p=a[2]!=null?num(a[2]):NaN;o.acp=isNaN(p)?0:p;s=s.replace(a[0],' ')}
  const d=/\bdc\s+(\S+)/i.exec(s);if(d)o.dc=num(d[1]);else{const q=s.trim().split(/\s+/)[0];if(q&&!isNaN(num(q)))o.dc=num(q)}
  if(o.dc==null||isNaN(o.dc))o.dc=o.w?(o.w.t==='noise'?(o.w.a[0]||0):wave(o.w,0,{})):0;return o}
/* deterministic gaussian noise sample n (same n + seed -> same value, so Newton iterations stay consistent) */
function gnoise(n,seed){let h=Math.imul(n|0,0x9E3779B1)^Math.imul((seed|0)+0x7F4A7C15,0x85EBCA6B);
  const u=()=>{h^=h>>>15;h=Math.imul(h,0x2C1B3C6D);h^=h>>>12;h=Math.imul(h,0x297A2D39);h^=h>>>15;return((h>>>0)+0.5)/4294967296};
  return Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u())}
function wave(w,t,g){const a=w.a,z=(i,d)=>a[i]==null||isNaN(a[i])?d:a[i];
  if(w.t==='sin'){const vo=z(0,0),va=z(1,0),fr=z(2,1/(g.tstop||1)),td=z(3,0),th=z(4,0),ph=z(5,0)*Math.PI/180;
    return t<td?vo+va*Math.sin(ph):vo+va*Math.exp(-(t-td)*th)*Math.sin(2*Math.PI*fr*(t-td)+ph)}
  if(w.t==='pulse'){const v1=z(0,0),v2=z(1,0),td=z(2,0),tr=z(3,g.tstep||1e-9)||1e-12,tf=z(4,g.tstep||1e-9)||1e-12,pw=z(5,g.tstop||1),pr=z(6,g.tstop||1);
    if(t<td)return v1;const u=pr>0?(t-td)%pr:t-td;if(u<tr)return v1+(v2-v1)*u/tr;if(u<tr+pw)return v2;if(u<tr+pw+tf)return v2+(v1-v2)*(u-tr-pw)/tf;return v1}
  if(w.t==='tri'||w.t==='saw'){const vo=z(0,0),va=z(1,0),fr=z(2,1/(g.tstop||1)),td=z(3,0),ph=z(4,0)/360;
    let p=((t<td?0:t-td)*fr+ph)%1;if(p<0)p+=1;
    return vo+va*(w.t==='tri'?(p<.25?4*p:p<.75?2-4*p:4*p-4):2*p-1)}
  if(w.t==='noise'){const vo=z(0,0),va=z(1,0),fs=z(2,0)>0?z(2,0):1/(g.tstep||(g.tstop||1)/500),sd=z(3,1),td=z(4,0);
    if(t<td)return vo;const x=(t-td)*fs,n=Math.floor(x),f=x-n;
    return vo+va*((1-f)*gnoise(n,sd)+f*gnoise(n+1,sd))}
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
/* ---- switches + relays: DPDT switch cells, relay cells (coil R + L, contacts = voltage-controlled switches S) ----
   Relay coil: RCOIL + LCOIL in series.  The contacts sense the voltage across RCOIL (= coil current x R), so they
   follow the coil CURRENT and the pull-in is delayed by L/R like a real relay.  Two switches (one per coil polarity)
   make the relay polarity-independent: NO contact = SNOP || SNON, NC contact = SNCP in series with SNCN.
   Pull-in at 75 % of the rated coil voltage, drop-out at 25 %  (Vt = 0.5 Vn, Vh = 0.25 Vn). */
const RLY_V={5:[70,0.3],6:[100,0.4],9:[225,0.8],12:[400,1.2],24:[1600,5]};
const SWM_TABLE={};            /* built-in S models  name -> {type:'sw',p:{vt,vh,ron,roff}} */
const CMODELS={};              /* cell -> .model lines to export with it */
Object.keys(RLY_V).forEach(v=>{const vn=+v,vt=vn/2,vh=vn/4,R=RLY_V[v][0],Lc=RLY_V[v][1];
  const mNO='RLY'+v+'_NO',mNC='RLY'+v+'_NC';
  SWM_TABLE[mNO.toLowerCase()]={type:'sw',p:{vt:vt,vh:vh,ron:0.05,roff:1e9}};SWM_TABLE[mNC.toLowerCase()]={type:'sw',p:{vt:-vt,vh:vh,ron:0.05,roff:1e9}};
  const ml=['.model '+mNO+' SW(Vt='+vt+' Vh='+vh+' Ron=0.05 Roff=1G)','.model '+mNC+' SW(Vt='+(-vt)+' Vh='+vh+' Ron=0.05 Roff=1G)'];
  CELLS['RELAY_'+v+'V']=['CP CN COM NO NC','RCOIL CP M '+R,'LCOIL M CN '+Lc+' IC=0','SNOP COM NO CP M '+mNO,'SNON COM NO M CP '+mNO,'SNCP COM X1 M CP '+mNC,'SNCN X1 NC CP M '+mNC];
  CMODELS['RELAY_'+v+'V']=ml;
  CELLS['RELAY2_'+v+'V']=['CP CN COM1 NO1 NC1 COM2 NO2 NC2','RCOIL CP M '+R,'LCOIL M CN '+Lc+' IC=0',
    'SNOP1 COM1 NO1 CP M '+mNO,'SNON1 COM1 NO1 M CP '+mNO,'SNCP1 COM1 X1 M CP '+mNC,'SNCN1 X1 NC1 CP M '+mNC,
    'SNOP2 COM2 NO2 CP M '+mNO,'SNON2 COM2 NO2 M CP '+mNO,'SNCP2 COM2 X2 M CP '+mNC,'SNCN2 X2 NC2 CP M '+mNC];
  CMODELS['RELAY2_'+v+'V']=ml});
/* DPDT toggle switch: position A = each common to its "a" throw, position B = each common to its "b" throw */
CELLS.DPDT_A=['C1 A1 B1 C2 A2 B2','R1 C1 A1 1m','R2 C1 B1 1G','R3 C2 A2 1m','R4 C2 B2 1G'];
CELLS.DPDT_B=['C1 A1 B1 C2 A2 B2','R1 C1 A1 1G','R2 C1 B1 1m','R3 C2 A2 1G','R4 C2 B2 1m'];
/* position OFF: every contact open - the circuit through the switch is dead (like a power switch OFF) */
CELLS.DPDT_O=['C1 A1 B1 C2 A2 B2','R1 C1 A1 1G','R2 C1 B1 1G','R3 C2 A2 1G','R4 C2 B2 1G'];
/* ---- transformers: two coupled inductors (K = 0.995) + winding resistances. XFMR_<a>TO<b> = turns ratio a:b (Vsec = Vpri * b/a),
   XFMR_CT_<a>TO<b> = centre-tapped secondary (total secondary = b/a, each half b/(2a)).  Dots: P1 and S1 (S1 -> CT -> S2). ---- */
const XF_RATIOS=[[1,1],[1,2],[2,1],[5,1],[10,1],[20,1]],XF_CT=[[10,1],[20,1]];
XF_RATIOS.forEach(([a,b])=>{const r=b/a,Lp=a/b>=5?20:2,Ls=+(Lp*r*r).toPrecision(4),Rs=+(1*r*r+0.01).toPrecision(3);
  CELLS['XFMR_'+a+'TO'+b]=['P1 P2 S1 S2','RP P1 PA 1','LP PA P2 '+Lp,'RS S1 SA '+Rs,'LS SA S2 '+Ls,'K1 LP LS 0.995']});
XF_CT.forEach(([a,b])=>{const r=b/a,Lp=a/b>=5?20:2,Lh=+(Lp*r*r/4).toPrecision(4),Rs=+(1*r*r/2+0.01).toPrecision(3);
  CELLS['XFMR_CT_'+a+'TO'+b]=['P1 P2 S1 CT S2','RP P1 PA 1','LP PA P2 '+Lp,'RS1 S1 SA '+Rs,'LS1 SA CT '+Lh,'RS2 CT SB '+Rs,'LS2 SB S2 '+Lh,'K12 LP LS1 0.995','K13 LP LS2 0.995','K23 LS1 LS2 0.995']});
const cellText=n=>['.subckt '+n+' '+CELLS[n][0],...CELLS[n].slice(1),'.ends '+n].join('\n');
const subName=l=>{const m=/^X\S*\s.*\s(\S+)$/.exec(l.trim());return m?m[1]:null};
/* netlist lines needed so the exported netlist is complete for real ngspice */
function libFor(names,dirs){
  const have=new Set(),hm=new Set(),out=[],seen=new Set();let cm=false;
  dirs.forEach(d=>{let m=/^\.subckt\s+(\S+)/i.exec(d);if(m)have.add(m[1].toLowerCase());m=/^\.model\s+(\S+)/i.exec(d);if(m)hm.add(m[1].toLowerCase())});
  const add=n=>{n=String(n||'').trim();const u=n.toUpperCase();if(!n||seen.has(u))return;seen.add(u);
    if(BUILTIN555.test(n)){if(!have.has(n.toLowerCase()))out.push(NE555_SUB.join('\n').replace(/NE555/g,u));return}
    const c=CELLS[u];if(!c||have.has(n.toLowerCase()))return;
    c.slice(1).forEach(l=>{const s=subName(l);if(s)add(s)});out.push(cellText(u));if(c.slice(1).some(l=>/^M\S*\s/i.test(l)))cm=true;
    (CMODELS[u]||[]).forEach(l=>{const nm=l.split(/\s+/)[1].toLowerCase();if(!hm.has(nm)){hm.add(nm);out.unshift(l)}})};
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
    def.els.forEach(q=>{const c=Object.assign({},q,q.k==='K'?{l1:pre+q.l1,l2:pre+q.l2}:{},{n:pre+q.n,pins:q.pins.map(n=>{const l=n.toLowerCase();return n==='0'?'0':(l in map?map[l]:pre+l)})});
      if(q.k==='X')go(c,d+1);else els.push(c)})};
  M.els.forEach(e=>e.k==='X'?go(e,0):els.push(e));
  return{els,t555}}
/* 555 timer: 3×5k divider, two comparators, SR latch (state), Thevenin output, discharge switch */
function q555(d,x){const V=i=>i<0?0:x[i];let q=d.q;
  if(V(d.rs)-V(d.gn)<.7||V(d.th)>V(d.ct))q=0;else if(V(d.tr)<V(d.nt))q=1;
  const ch=q!==d.q;d.q=q;return ch}
function compile(M,out){
  const mod=Object.assign({},SWM_TABLE);M.dirs.forEach(d=>{const m=/^\.model\s+(\S+)\s+(\w+)\s*\(?([^)]*)\)?/i.exec(d);if(m){const p={};m[3].split(/[\s,()]+/).forEach(kv=>{const q=kv.split('=');if(q.length===2)p[q[0].toLowerCase()]=num(q[1])});mod[m[1].toLowerCase()]={type:m[2].toLowerCase(),p}}});
  if(!mod.nm)mod.nm={type:'nmos',p:{vto:.7,kp:2e-4,lambda:.02}};if(!mod.pm)mod.pm={type:'pmos',p:{vto:-.7,kp:1e-4,lambda:.02}};
  const F=flatten(M,out),EL=F.els;
  const idx={};let nn=0;EL.forEach(e=>e.pins.forEach(p=>{if(p!=='0'&&!(p in idx))idx[p]=nn++}));F.t555.forEach(t=>{t.pins.forEach(p=>{if(p!=='0'&&!(p in idx))idx[p]=nn++});idx[t.n+'.third']=nn++});
  const I=n=>n==='0'?-1:idx[n];let nb=0;const kdef=[],devs=[],bad=(e,m)=>out.errs.push(e.n+': '+m);
  for(const e of EL){
    const p=e.pins.map(I),tk=(e.tail||'').split(/\s+/),v=num(tk[0]),K=e.k,m=mod[(tk[0]||'').toLowerCase()],P=m?m.p:{};let d=null;
    if(K==='R'){if(!(v>0)){bad(e,'invalid resistance');continue}d={t:'R',a:p[0],b:p[1],g:1/v}}
    else if(K==='C'){if(!(v>=0)){bad(e,'invalid capacitance');continue}d={t:'C',a:p[0],b:p[1],c:v,vp:0,ip:0,ic:(q=>q?num(q[1]):null)(/\bic\s*=\s*(\S+)/i.exec(e.tail))}}
    else if(K==='L'){if(!(v>0)){bad(e,'invalid inductance');continue}d={t:'L',a:p[0],b:p[1],l:v,k:nn+nb++,vp:0,ip:0,ic:(q=>q?num(q[1]):null)(/\bic\s*=\s*(\S+)/i.exec(e.tail))}}
    else if(K==='V')d={t:'V',a:p[0],b:p[1],k:nn+nb++,s:spec(e.val)};
    else if(K==='I')d={t:'I',a:p[0],b:p[1],s:spec(e.val)};
    else if(K==='E'||K==='G'){if(isNaN(v)){bad(e,'invalid gain');continue}d={t:K,a:p[0],b:p[1],c:p[2],cb:p[3],g:v};if(K==='E')d.k=nn+nb++}
    else if(K==='D'){const ledLike=!m&&/led|red|green|blue|yellow|orange|white|amber/i.test(tk[0]||'');if(!m&&!ledLike)out.warn.push(`${e.n}: model “${tk[0]}” not found, using defaults`);d={t:'D',a:p[0],b:p[1],is:P.is||(ledLike?1e-18:1e-14),nf:P.n||(ledLike?2:1),v:0,bv:P.bv||0,ibv:P.ibv||1e-3}}
    else if(K==='Q'){if(!m)out.warn.push(`${e.n}: model “${tk[0]}” not found, using NPN defaults`);d={t:'Q',c:p[0],bb:p[1],e:p[2],sg:(m?m.type==='pnp':/pnp/i.test(tk[0]))?-1:1,is:P.is||1e-16,bf:P.bf||100,br:P.br||1,vbe:0,vbc:0}}
    else if(K==='M'){const pm=m?m.type==='pmos':/pmos/i.test(tk[0]),W=num((/\bw=(\S+)/i.exec(e.tail)||[])[1])||1,Ln=num((/\bl=(\S+)/i.exec(e.tail)||[])[1])||1;
      d={t:'M',d:p[0],g:p[1],s:p[2],sg:pm?-1:1,vto:P.vto!=null?Math.abs(P.vto):1,beta:(P.kp||2e-5)*W/Ln,lam:P.lambda||0}}
    else if(K==='K'){kdef.push(e);continue}
    else if(K==='S'){if(!m)out.warn.push(`${e.n}: switch model “${tk[0]}” not found, using defaults (Vt=0 Vh=0 Ron=1 Roff=1G)`);
      const rn=P.ron!=null&&P.ron>0?P.ron:1,rf=P.roff!=null&&P.roff>0?P.roff:1e9;
      d={t:'S',a:p[0],b:p[1],c:p[2],cb:p[3],vt:P.vt||0,vh:Math.abs(P.vh||0),ron:rn,roff:rf,on:false}}
    else{out.warn.push(e.n+': element type '+K+' is drawn but not simulated');continue}
    d.nm=e.n;devs.push(d)}
  kdef.forEach(e=>{const kv=num(e.val),f=n=>devs.find(d=>d.t==='L'&&String(d.nm).toLowerCase()===String(n).toLowerCase()),a=f(e.l1),b=f(e.l2);
    if(!a||!b){bad(e,'coupled inductor not found ('+(a?e.l2:e.l1)+')');return}
    if(!(kv>0&&kv<=1)){bad(e,'coupling k must be between 0 and 1');return}
    devs.push({t:'K',nm:e.n,l1:a,l2:b,m:kv*Math.sqrt(a.l*b.l)})});
  F.t555.forEach(t=>{const q=t.pins.map(I);devs.push({t:'T',nm:t.n,gn:q[0],tr:q[1],ou:q[2],rs:q[3],ct:q[4],th:q[5],di:q[6],vc:q[7],nt:I(t.n+'.third'),q:0,ro:10,ron:10,vd:1.2,vl:.1})});
  return{devs,t555:devs.filter(d=>d.t==='T'),sws:devs.filter(d=>d.t==='S'),idx,nn,nb,N:nn+nb,nl:devs.some(d=>'DQM'.includes(d.t)),lim:false}}
/* ---- voltage-controlled switch state (hysteresis): ON above Vt+Vh, OFF below Vt-Vh, otherwise unchanged ---- */
function swUpd(C,x){let ch=false;if(!C.sws||!C.sws.length)return false;const V=i=>i<0?0:x[i];
  C.sws.forEach(d=>{const v=V(d.c)-V(d.cb);let on=d.on;if(v>d.vt+d.vh)on=true;else if(v<d.vt-d.vh)on=false;if(on!==d.on){d.on=on;ch=true}});return ch}
const swSnap=C=>Uint8Array.from((C.sws||[]).map(d=>d.on?1:0));
const swRestore=(C,a)=>{if(a)(C.sws||[]).forEach((d,i)=>{d.on=!!a[i]})};
const ad=(m,i,j,g,bi)=>{if(i<0||j<0)return;const{A,S,N}=m;A[i*S+j]+=g;if(m.ac){A[(i+N)*S+j+N]+=g;if(bi){A[i*S+j+N]-=bi;A[(i+N)*S+j]+=bi}}};
const rh=(m,i,re,im)=>{if(i<0)return;m.b[i]+=re;if(m.ac)m.b[i+m.N]+=im||0};
const mk=(C,ac)=>{const N=C.N,S=ac?2*N:N;return{N,S,ac,A:new Float64Array(S*S),b:new Float64Array(S)}};
const srcv=(d,mode,X)=>(X.sc==null?1:X.sc)*(d.sw!==undefined?d.sw:mode==='tran'&&d.s.w?wave(d.s.w,X.t,X.g):d.s.dc);
function pnj(vn,vo,vt,vc,C){if(vn>vc&&Math.abs(vn-vo)>2*vt){C.lim=true;if(vo>0){const a=1+(vn-vo)/vt;return a>0?vo+vt*Math.log(a):vc}return vt*Math.log(vn/vt)}return vn}
function stampDev(d,m,x,mode,C,X){
  const V=i=>i<0?0:x[i],ac=mode==='ac';
  switch(d.t){
  case'R':ad(m,d.a,d.a,d.g);ad(m,d.b,d.b,d.g);ad(m,d.a,d.b,-d.g);ad(m,d.b,d.a,-d.g);break;
  case'K':{if(ac){ad(m,d.l1.k,d.l2.k,0,-X.w*d.m);ad(m,d.l2.k,d.l1.k,0,-X.w*d.m)}
    else if(mode==='tran'){const c=(X.first?1:2)*d.m/X.h;ad(m,d.l1.k,d.l2.k,-c);ad(m,d.l2.k,d.l1.k,-c);rh(m,d.l1.k,-c*d.l2.ip);rh(m,d.l2.k,-c*d.l1.ip)}break}
  case'S':{const g=1/(d.on?d.ron:d.roff);ad(m,d.a,d.a,g);ad(m,d.b,d.b,g);ad(m,d.a,d.b,-g);ad(m,d.b,d.a,-g);break}
  case'C':if(ac){const w=X.w*d.c;ad(m,d.a,d.a,0,w);ad(m,d.b,d.b,0,w);ad(m,d.a,d.b,0,-w);ad(m,d.b,d.a,0,-w)}
    else if(mode==='dc'&&C.icOn&&C.uic&&d.ic!=null&&!isNaN(d.ic)){const G=1e4;ad(m,d.a,d.a,G);ad(m,d.b,d.b,G);ad(m,d.a,d.b,-G);ad(m,d.b,d.a,-G);rh(m,d.a,G*d.ic);rh(m,d.b,-G*d.ic)}
    else if(mode==='tran'){const g=(X.first?1:2)*d.c/X.h,ie=-g*d.vp-(X.first?0:d.ip);d.g=g;d.ie=ie;ad(m,d.a,d.a,g);ad(m,d.b,d.b,g);ad(m,d.a,d.b,-g);ad(m,d.b,d.a,-g);rh(m,d.a,-ie);rh(m,d.b,ie)}break;
  case'L':{const k=d.k;ad(m,d.a,k,1);ad(m,d.b,k,-1);
    if(mode==='dc'&&C.icOn&&C.uic&&d.ic!=null&&!isNaN(d.ic)){ad(m,k,k,1);rh(m,k,d.ic)}else{ad(m,k,d.a,1);ad(m,k,d.b,-1)}
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
    if(C.icOn&&C.nic)C.nic.forEach(q=>{ad(m,q.i,q.i,1e4);rh(m,q.i,1e4*q.v)});
    const xn=solve(m.A,m.b,m.S);if(!xn||xn.some(isNaN))return null;
    if(!C.nl)return xn;
    let ok=!C.lim&&it>0;
    for(let i=0;i<C.N&&ok;i++)if(!(Math.abs(xn[i]-x[i])<=1e-3*Math.max(Math.abs(xn[i]),Math.abs(x[i]))+(i<C.nn?1e-6:1e-12)))ok=false;
    x=xn;if(ok)return x}
  return null}
function op(C,X){const z=new Float64Array(C.N);let x=newton(C,'dc',z,Object.assign({},X,{sc:1}));if(x)return x;
  x=z;for(let s=1;s<=20;s++){x=newton(C,'dc',x,Object.assign({},X,{sc:s/20}),150);if(!x)return null}return x}
/* operating point that also lets every switch / relay settle (re-solve until no contact changes state) */
function opS(C,X){let x=op(C,X);if(!x||!C.sws.length)return x;
  for(let k=0;k<10;k++){if(!swUpd(C,x))break;const y=op(C,X);if(!y)break;x=y}return x}
function traces(C){const t=[],u0=(u,i)=>i<0?0:u(i);
  Object.keys(C.idx).forEach(n=>{if(n.includes('.')&&!n.endsWith('.third'))return;const i=C.idx[n];t.push({name:`v(${n})`,f:u=>u(i),k:'v'})});
  C.devs.forEach(d=>{if(d.t==='V'||d.t==='L'||d.t==='E')t.push({name:`i(${d.nm})`,f:u=>u(d.k),k:'i'});
    if(d.t==='R')t.push({name:`i(${d.nm})`,f:u=>(u0(u,d.a)-u0(u,d.b))*d.g,k:'i'})});return t}
function opRows(C,x){const V=i=>i<0?0:x[i],rows=[];
  C.devs.forEach(d=>{if(d.t==='K')return;let v=0,i=0;
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
  C.uic=find('tran').some(t=>t.slice(1).some(z=>z.toLowerCase()==='uic'));C.icOn=false;C.nic=[];
  M.dirs.forEach(d=>{if(!/^\.ic\b/i.test(d))return;const re=/v\(\s*([^)\s]+)\s*\)\s*=\s*([^\s,]+)/gi;let q;
    while((q=re.exec(d))){const n=gnd(q[1]),v=num(q[2]),i=C.idx[n];if(n==='0'||isNaN(v)||i==null)continue;C.nic=C.nic.filter(z=>z.i!==i);C.nic.push({i,v})}});
  {const SC=shortCircuit(M);if(SC.nets.size){R.errs.push(shortMsg(SC));return R}}
  let x=opS(C,X);if(x&&C.t555.length){for(let k=0;k<2;k++){if(!C.t555.some(d=>q555(d,x)))break;const y=op(C,X);if(!y)break;x=y}}
  if(!x){R.errs.push('DC operating point did not converge — check for floating nodes or loops of voltage sources');return R}
  R.op={x,SW:swSnap(C)};{const m0=mk(C,false);C.devs.forEach(d=>stampDev(d,m0,x,'dc',C,X));R.rows=opRows(C,x)}
  find('dc').forEach(t=>{
    const d=C.devs.find(q=>(q.t==='V'||q.t==='I')&&q.nm.toLowerCase()===(t[1]||'').toLowerCase()),a=num(t[2]),b=num(t[3]);let s=num(t[4]);
    if(!d||isNaN(a)||isNaN(b)||!s){R.errs.push('.dc: expected  .dc source start stop step');return}
    if((b-a)*s<0)s=-s;const n=Math.min(Math.floor((b-a)/s+1e-9)+1,5000),xs=[],XS=[];let xc=x;
    const SWS=[];swRestore(C,R.op.SW);
    for(let i=0;i<n;i++){d.sw=a+i*s;let y=newton(C,'dc',xc,{g:{},sc:1},150);if(!y)y=op(C,{g:{}});
      if(y&&C.sws.length){for(let k=0;k<6;k++){if(!swUpd(C,y))break;const y2=newton(C,'dc',y,{g:{},sc:1},150);if(!y2)break;y=y2}}
      if(!y){R.errs.push('.dc: no convergence at '+eng(d.sw));break}xc=y;xs.push(d.sw);XS.push(Float64Array.from(y));SWS.push(swSnap(C))}
    delete d.sw;R.dc={xs,X:XS,src:d.nm,cur:d.t==='I',SW:SWS};swRestore(C,R.op.SW)});
  /* .ac with only SIN sources (no "AC mag"): use the SIN amplitude as the AC magnitude */
  const acFix=[];
  if(find('ac').length&&!C.devs.some(d=>(d.t==='V'||d.t==='I')&&d.s.acm)){
    C.devs.forEach(d=>{if((d.t==='V'||d.t==='I')&&d.s.w&&d.s.w.t==='sin'&&d.s.w.a[1]>0){d.s.acm=d.s.w.a[1];d.s.acp=d.s.w.a[5]||0;acFix.push(d)}});
    if(acFix.length)R.warn.push('.ac: no AC magnitude found, using the SIN amplitude of '+acFix.map(d=>d.nm).join(', ')+' as the AC magnitude')}
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
  /* transient start point: .ic v(node)=value  (always)  +  IC= on C / L  (with uic) -- solved apart from .op / .dc / .ac */
  let xT=x,SW0=R.op.SW;
  if(find('tran').length&&(C.nic.length||(C.uic&&C.devs.some(d=>(d.t==='C'||d.t==='L')&&d.ic!=null&&!isNaN(d.ic))))){
    C.icOn=true;swRestore(C,R.op.SW);let y=opS(C,X);if(y&&C.t555.length){for(let k=0;k<2;k++){if(!C.t555.some(d=>q555(d,y)))break;const z=op(C,X);if(!z)break;y=z}}C.icOn=false;
    if(y){xT=y;SW0=swSnap(C)}else R.warn.push('.ic: the initial conditions could not be applied, .tran starts from the DC operating point')}
  const tranFix=[];
  find('tran').forEach(t=>{
    const ts=num(t[1]),tf=num(t[2]),t0=t[3]&&!isNaN(num(t[3]))?num(t[3]):0,tm=t[4]&&!isNaN(num(t[4]))?num(t[4]):Infinity;
    if(!(ts>0)||!(tf>0)){R.errs.push('.tran: expected  .tran tstep tstop [tstart [tmax]]');return}
    /* AC-only sources (V1 in 0 AC 1 / DC 0 AC 1) have no time-domain waveform: in .tran they are driven as
       a sine  dc + acMag*sin(2*pi*f*t + acPhase).  f = frequency of any SIN source in the netlist,
       otherwise 5 cycles across the .tran window. */
    const sinF=(()=>{for(const d of C.devs)if((d.t==='V'||d.t==='I')&&d.s.w&&/^(sin|tri|saw)$/.test(d.s.w.t)&&d.s.w.a[2]>0)return d.s.w.a[2];return 0})(),fAC=sinF||5/tf;
    C.devs.forEach(d=>{if((d.t==='V'||d.t==='I')&&d.s.acm&&!d.s.w){d.s.w={t:'sin',a:[d.s.dc||0,d.s.acm,fAC,0,0,d.s.acp||0]};tranFix.push(d)}});
    if(tranFix.length)R.warn.push('.tran: AC source '+tranFix.map(d=>d.nm).join(', ')+' driven as a sine at '+eng(fAC)+'Hz');
    const h=Math.max(Math.min(ts,tm,tf/1000),tf/20000),X2={g:{tstep:ts,tstop:tf},sc:1,h,first:true,t:0};
    C.devs.forEach(d=>{const V=i=>i<0?0:xT[i];if(d.t==='C'){d.vp=V(d.a)-V(d.b);d.ip=0}if(d.t==='L'){d.ip=xT[d.k];d.vp=0}});
    let xc=xT;const T=[],XS=[];
    const upd=()=>{C.t555.forEach(d=>q555(d,xc));C.devs.forEach(d=>{const V=i=>i<0?0:xc[i];
      if(d.t==='C'){const v=V(d.a)-V(d.b);d.ip=d.g*v+d.ie;d.vp=v}else if(d.t==='L'){d.ip=xc[d.k];d.vp=V(d.a)-V(d.b)}})};
    const step=(t1,hh,dp)=>{X2.t=t1;X2.h=hh;const xn=newton(C,'tran',xc,X2);
      if(xn){xc=xn;const chg=swUpd(C,xc);upd();X2.first=!!chg;return true}
      if(dp>=5)return false;const hm=hh/2;return step(t1-hm,hm,dp+1)&&step(t1,hm,dp+1)};
    const TSW=[];swRestore(C,SW0);
    if(t0<=0){T.push(0);XS.push(Float64Array.from(xT));TSW.push(swSnap(C))}
    const ns=Math.round(tf/h);
    for(let k=1;k<=ns;k++){const tt=k*h;
      if(!step(tt,h,0)){R.errs.push('.tran: timestep too small at t='+eng(tt)+'s');break}
      if(tt>=t0){T.push(tt);XS.push(Float64Array.from(xc));TSW.push(swSnap(C))}}
    R.tran={t:T,X:XS,SW:TSW};tranFix.forEach(d=>{d.s.w=null})});
  acFix.forEach(d=>{d.s.acm=0;d.s.acp=0});
  return R}

/* symbols.js — realistic schematic symbols (LTspice-style), 1 grid unit = 10 px */
const U=10,rot=(x,y,r)=>[[x,y],[-y,x],[-x,-y],[y,-x]][r&3];
const sg=Math.sign;
const STY='fill="none" stroke="var(--sym)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const FIL='fill="var(--symf)" ';
/* Schematic <-> Realistic: realistic-com.js (window.RC) supplies the realistic bodies; pins are identical */
const RCd=(p,S)=>window.RC&&RC.on&&RC.has(p.t)?RC.draw(p):S.draw(p);
const RCink=()=>window.RC&&RC.on?'#2a1f00':null;
const tx=(x,y,s,o={})=>`<text x="${x}" y="${y}" text-anchor="${o.a||'middle'}" font-size="${o.s||11}" ${o.b?'font-weight="700"':''} fill="${o.c||'var(--sym)'}" stroke="none" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${esc(s)}</text>`;
const fxs=p=>window.FX&&p&&p.id?FX.get(p):{l:0,a:0,s:0,t:'',w:0},hk=(p,r)=>p&&p.id?` data-fx="${p.id}" data-role="${r}"`:'',two4=[['1',-4,0],['2',4,0]];
const srcKind=v=>/\bnoise\s*\(/i.test(v)?'noise':/\btri\s*\(/i.test(v)?'tri':/\bsaw\s*\(/i.test(v)?'saw':/sin|ac\s/i.test(v)?'sin':/pulse/i.test(v)?'pulse':/pwl/i.test(v)?'pwl':'dc';
const resIEC={on:false};
/* fuse rated current in A (accepts 5, 5A, 10 A, 500m ...) */
const fuseA=v=>{const n=num(v);return n>0&&isFinite(n)?+n.toPrecision(6):5};
const fuseLbl=p=>fuseA(p&&p.v)+' A'+(p&&p.bn?' (blown)':'');
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
    const ic={sin:'M-9 0q4.5-9 9 0t9 0',pulse:'M-9 5V-5H-1V5H7V-5',pwl:'M-9 5L-2-5 3 3 9-5',tri:'M-9 5L-4.5-5 0 5 4.5-5 9 5',saw:'M-9 5L-4-5V5L1-5V5L6-5',noise:'M-10 0L-8-4-6 3-4-6-2 5 0-2 2 6 4-5 6 4 8-3 10 1'}[k];
    return `<path d="M-30 0H-14M14 0H30" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="${ic}" ${STY}/>`}},
I:{pre:'I',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'DC 1m',name:'Current source',cat:'Sources',
  draw:()=>`<path d="M-30 0H-14M14 0H30M-8 0H6" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="M8 0L1-4V4Z" fill="var(--sym)"/>`},
D:{pre:'D',fmt:'two',pins:[['1',-3,0],['2',3,0]],bb:[-2,-2,2,2],def:'1N4148',name:'Diode',cat:'Semiconductors',mdl:'D(Is=2.52n N=1.75)',
  draw:()=>diodeBase()+`<path d="M8-12V12" ${STY}/>`},
ZEN:{pre:'D',fmt:'two',pins:two,bb:[-2,-2,2,2],def:'BZX5V1',name:'Zener diode',cat:'Semiconductors',mdl:'D(Is=1n N=1 Bv=5.1 Ibv=1m)',
  draw:()=>diodeBase()+`<path d="M4-14L8-12V12L12 14" ${STY}/>`},
LED:{pre:'D',fmt:'two',pins:two,bb:[-2,-3,2,2],def:'LED',name:'LED',cat:'Semiconductors',mdl:'D(Is=1e-18 N=2)',
  draw:p=>`<circle${hk(p,'ledhalo')} cx="0" cy="-10" r="34" fill="url(#rc-halo-yellow)" opacity="${fxs(p).l}" pointer-events="none"/>`+diodeBase()+`<path${hk(p,'ledlit')} d="M-8-12V12L8 0Z" fill="#ffd60a" opacity="${fxs(p).l}"/><path d="M8-12V12" ${STY}/>`+ar(-2,-14)+ar(6,-18)},
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
/* ---- Bulb, Fan (Passive) and Ammeter, Voltmeter (Measurement) ---- */
{const mtr=(p,l)=>`<path d="M-40 0H-14M14 0H40" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/>`+tx(0,5,l,{s:15,b:1})+`<text${hk(p,'txt')} x="0" y="29" text-anchor="middle" font-size="10" font-weight="700" fill="var(--accent)" font-family="ui-monospace,monospace">${esc(fxs(p).t)}</text>`;
Object.assign(SYMS,{
BULB:{pre:'RBULB',fmt:'two',pins:two,bb:[-3,-3,3,3],ib:[-34,-30,34,30],def:'24',name:'Bulb',cat:'Passive',
 draw:p=>`<path d="M-30 0H-14M14 0H30" ${STY}/><circle${hk(p,'halo')} r="40" fill="url(#rc-halo-bulb)" opacity="${fxs(p).l}" pointer-events="none"/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><circle${hk(p,'lit')} r="13" fill="#ffd54a" opacity="${fxs(p).l}"/><path d="M-10-10L10 10M10-10L-10 10" ${STY}/>`},
FAN:{pre:'RFAN',fmt:'two',pins:two4,bb:[-4,-3,4,3],ib:[-44,-30,44,30],def:'120',name:'Fan',cat:'Passive',
 draw:p=>`<path d="M-40 0H-16M16 0H40" ${STY}/><circle r="16" ${FIL}stroke="var(--sym)" stroke-width="2"/><g${hk(p,'rotor')} transform="rotate(${p&&p.m?-fxs(p).a:fxs(p).a})"><path d="M0 0V-12M0 0L10.4 6M0 0L-10.4 6" ${STY}/></g>`},
BUZ:{pre:'RBUZ',fmt:'two',pins:two,bb:[-3,-3,3,3],ib:[-34,-30,34,30],def:'400 f=800',name:'Buzzer',cat:'Passive',
 draw:p=>`<path d="M-30 0H-14M14 0H30" ${STY}/><circle r="14" ${FIL}stroke="var(--sym)" stroke-width="2"/><circle r="6" fill="var(--sym)" opacity=".85"/><circle r="2.2" ${FIL}stroke="none"/>`+[19,24,29].map((r,i)=>{const a0=-72*Math.PI/180,a1=-18*Math.PI/180;return`<path${hk(p,'wave'+(i+1))} d="M${(r*Math.cos(a0)).toFixed(1)} ${(r*Math.sin(a0)).toFixed(1)}A${r} ${r} 0 0 1 ${(r*Math.cos(a1)).toFixed(1)} ${(r*Math.sin(a1)).toFixed(1)}" fill="none" stroke="#1f8fe0" stroke-width="2.4" stroke-linecap="round" opacity="0" pointer-events="none"/>`}).join('')},
/* Fuse: only property = rated current (A). Netlist: RFUSEn a b 10m I=<A>  (10 mOhm). When live-effects.js sees more current than the rating the
   fuse BLOWS (p.bn = 1): the line becomes RFUSEn a b 1G I=<A> (open circuit) but the part itself stays - "Replace fuse" in the inspector resets it. */
FUSE:{pre:'RFUSE',fmt:'two',pins:two,bb:[-3,-3,3,3],ib:[-34,-30,34,30],def:'5',name:'Fuse',cat:'Passive',lbl:p=>fuseLbl(p),
 draw:p=>`<path d="M-30 0H-19M19 0H30" ${STY}/>`+(p&&p.bn
   ?`<rect x="-19" y="-8" width="38" height="16" rx="3" fill="#3a3430" stroke="var(--sym)" stroke-width="2"/><path d="M-19 0H-7L-4-4M19 0H7L4 4" fill="none" stroke="#9a9a9a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M-2-5L1 0-1 5" fill="none" stroke="#6b625b" stroke-width="1.4" stroke-linecap="round"/>`
   :`<rect x="-19" y="-8" width="38" height="16" rx="3" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="M-19 0H19" fill="none" stroke="var(--sym)" stroke-width="1.6" stroke-linecap="round"/><circle cx="-19" cy="0" r="2.4" fill="var(--sym)"/><circle cx="19" cy="0" r="2.4" fill="var(--sym)"/>`)},
AM:{pre:'VAM',fmt:'two',pins:two4,bb:[-4,-3,4,3],ib:[-44,-30,44,36],def:'DC 0',name:'Ammeter',cat:'Measurement',draw:p=>mtr(p,'A')},
VM:{pre:'RVM',fmt:'two',pins:two4,bb:[-4,-3,4,3],ib:[-44,-30,44,36],def:'10meg',name:'Voltmeter',cat:'Measurement',draw:p=>mtr(p,'V')}})}
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
/* ---- Switches + relays: SPST switch, power (master) switch, DPDT switch, voltage-controlled switch, SPDT relay, DPDT relay ----
   SPST switch  = resistor RSWn   (1m = ON, 1G = OFF)          click it on the canvas to toggle
   Power switch = resistor RSWMn  (same, but OFF also stops the whole simulation)
   DPDT switch  = subcircuit XSWn ... DPDT_A | DPDT_B | DPDT_O   click it to cycle A -> B -> OFF
   Relay        = subcircuit XKn  ... RELAY_12V (coil R + L, contacts = voltage-controlled switches)
   Switch (S)   = real SPICE voltage-controlled switch  Sn p n cp cn MODEL */
{const swClosed=p=>{const v=num(p&&p.v);return !(v>1)};
const rlyT=p=>window.RLYX&&p&&p.id?RLYX.t(p):0;
const dot=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r||2.6}" ${FIL}stroke="var(--sym)" stroke-width="1.6"/>`;
const badge=(x,y,t,c)=>tx(x,y,t,{s:9,b:1,c});
const ON_C='#1a9d55',OFF_C='#d64545';
/* pole of a relay: pivot (px,py), NC dot (nx,ny), NO dot (ox,oy); the blade is drawn on the NC dot and rotated to the NO dot */
const pole=(p,px,py,nx,ny,ox,oy)=>{const t=rlyT(p),a0=Math.atan2(ny-py,nx-px),a1=Math.atan2(oy-py,ox-px),d=(a1-a0)*180/Math.PI,dd=d>0?d-360:d+360,rot=(Math.abs(d)>Math.abs(dd)?dd:d);
  return dot(nx,ny,2.4)+dot(ox,oy,2.4)+`<g${p&&p.id?` data-rly="${p.id}" data-rrole="arm" data-px="${px}" data-py="${py}" data-rot="${rot.toFixed(2)}"`:''} transform="rotate(${(rot*t).toFixed(1)} ${px} ${py})"><path d="M${px} ${py}L${nx} ${ny}" fill="none" stroke="var(--sym)" stroke-width="2.4" stroke-linecap="round"/></g>`+dot(px,py,2.2)};
const coilBox=p=>{const t=rlyT(p);return `<path d="M-40 -30H-18V-18M-40 30H-18V18" ${STY}/><rect x="-26" y="-18" width="16" height="36" ${FIL}stroke="var(--sym)" stroke-width="2"/><rect${p&&p.id?` data-rly="${p.id}" data-rrole="coil"`:''} x="-26" y="-18" width="16" height="36" fill="#ffb703" opacity="${(t*0.55).toFixed(2)}" pointer-events="none"/>`+tx(-18,4,'K',{s:11,b:1})};
Object.assign(SYMS,{
SW:{pre:'RSW',fmt:'two',pins:two,bb:[-3,-3,3,2],ib:[-34,-24,34,26],def:'1m',name:'Switch (SPST)',cat:'Switches',lbl:()=>'',
 draw:p=>{const on=swClosed(p);return `<path d="M-30 0H-14M14 0H30" ${STY}/>`+(on?`<path d="M-14 0H14" stroke="var(--sym)" stroke-width="2.4" stroke-linecap="round"/>`:`<path d="M-14 0L11-15" stroke="var(--sym)" stroke-width="2.4" stroke-linecap="round"/>`)+dot(-14,0)+dot(14,0)+(on?'':'')+badge(0,on?19:19,on?'ON':'OFF',on?ON_C:OFF_C)}},
SWM:{pre:'RSWM',fmt:'two',pins:two,bb:[-3,-3,3,2],ib:[-34,-24,34,26],def:'1m',name:'Power switch (ON/OFF)',cat:'Switches',lbl:()=>'',
 draw:p=>{const on=swClosed(p);return `<path d="M-30 0H-17M17 0H30" ${STY}/><rect x="-17" y="-13" width="34" height="26" rx="6" fill="${on?'#d9f5e3':'#fde3e3'}" stroke="var(--sym)" stroke-width="2"/><rect x="-11" y="-6" width="22" height="12" rx="6" fill="${on?ON_C:'#9aa7b4'}"/><circle cx="${on?5:-5}" cy="0" r="4.4" fill="#fff"/>`+badge(0,25,on?'ON':'OFF',on?ON_C:OFF_C)}},
DPDT:{pre:'XSW',fmt:'X',order:['c1','a1','b1','c2','a2','b2'],pins:[['c1',-4,-2],['a1',4,-3],['b1',4,-1],['c2',-4,2],['a2',4,1],['b2',4,3]],bb:[-4,-4,4,4],lw:50,ib:[-46,-40,46,40],def:'DPDT_A',name:'DPDT switch',cat:'Switches',sub:1,
 draw:p=>{const V=String(p&&p.v||''),B=/_b\s*$/i.test(V),O=/_o\s*$/i.test(V),y1=O?-20:B?-10:-30,y2=O?20:B?30:10,my1=(-20+y1)/2,my2=(20+y2)/2;
  return `<path d="M-40-20H-26M-40 20H-26M40-30H26M40-10H26M40 10H26M40 30H26" ${STY}/>`+
   `<path d="M-26-20L26 ${y1}M-26 20L26 ${y2}" stroke="var(--sym)" stroke-width="2.4" stroke-linecap="round"/><path d="M0 ${my1}V${my2}" ${STY} stroke-dasharray="3 3"/>`+
   dot(-26,-20,2.2)+dot(-26,20,2.2)+[-30,-10,10,30].map(y=>dot(26,y,2.4)).join('')+
   tx(-40,-24,'C1',{s:8,c:'var(--mut)',a:'start'})+tx(-40,36,'C2',{s:8,c:'var(--mut)',a:'start'})+badge(0,-37,B?'B':'A',B?'#d6791a':'#1f8fe0')}},
SVC:{pre:'S',fmt:'E',pins:[['p',0,-3],['n',0,3],['cp',-3,-1],['cn',-3,1]],bb:[-3,-3,2,3],ib:[-36,-34,12,34],def:'SWMOD',name:'Voltage-controlled switch (S)',cat:'Switches',mdl:'SW(Vt=2.5 Vh=0.5 Ron=1 Roff=1G)',
 draw:()=>`<path d="M0-30V-14M0 14V30M-30-10H-16M-30 10H-16" ${STY}/><rect x="-16" y="-14" width="10" height="28" ${FIL}stroke="var(--sym)" stroke-width="2"/><path d="M-6 0H-2" ${STY} stroke-dasharray="2 2"/>`+dot(0,-14,2.4)+dot(0,14,2.4)+`<path d="M0 14L-9-11" stroke="var(--sym)" stroke-width="2.4" stroke-linecap="round"/>`+tx(8,-18,'S',{s:9,b:1,a:'start',c:'var(--mut)'})},
RLY:{pre:'XK',fmt:'X',order:['cp','cn','com','no','nc'],pins:[['cp',-4,-3],['cn',-4,3],['com',4,0],['no',4,3],['nc',4,-3]],bb:[-4,-4,4,4],lw:50,ib:[-46,-40,46,40],def:'RELAY_12V',name:'Relay (SPDT)',cat:'Switches',sub:1,
 draw:p=>coilBox(p)+`<path d="M40 0H36M40-30H20V-25M40 30H20V25" ${STY}/><path d="M-10 0H22" ${STY} stroke-dasharray="3 3"/>`+pole(p,36,0,20,-22,20,22)+tx(17,-27,'NC',{s:7,c:'var(--mut)',a:'end'})+tx(17,33,'NO',{s:7,c:'var(--mut)',a:'end'})+tx(31,-5,'COM',{s:7,c:'var(--mut)',a:'end'})},
RLY2:{pre:'XK',fmt:'X',order:['cp','cn','com1','no1','nc1','com2','no2','nc2'],pins:[['cp',-4,-3],['cn',-4,3],['com1',4,-4],['no1',4,-1],['nc1',4,-7],['com2',4,4],['no2',4,7],['nc2',4,1]],bb:[-4,-8,4,8],lw:50,ib:[-46,-84,46,84],def:'RELAY2_12V',name:'Relay (DPDT)',cat:'Switches',sub:1,
 draw:p=>coilBox(p)+`<path d="M40-40H36M40-70H20V-65M40-10H20V-15M40 40H36M40 10H20V15M40 70H20V65" ${STY}/><path d="M-10 0H-2M-2-40V40" ${STY} stroke-dasharray="3 3"/>`+pole(p,36,-40,20,-62,20,-18)+pole(p,36,40,20,18,20,62)+
  [[-67,'NC1'],[-43,'COM1'],[-7,'NO1'],[13,'NC2'],[37,'COM2'],[73,'NO2']].map(([y,t])=>tx(17,y+3,t,{s:7,c:'var(--mut)',a:'end'})).join('')}
})}

/* ---- Transformer symbols ---- */
{const coil=(x,y0,n,sw)=>{let d='M'+x+' '+y0;for(let i=0;i<n;i++)d+='a5 5 0 0 '+sw+' 0 10';return d};
const xfdot=(x,y)=>`<circle cx="${x}" cy="${y}" r="2" fill="var(--sym)"/>`;
Object.assign(SYMS,{
XFMR:{pre:'XT',fmt:'X',order:['p1','p2','s1','s2'],pins:[['p1',-4,-2],['p2',-4,2],['s1',4,-2],['s2',4,2]],bb:[-4,-3,4,3],lw:50,ib:[-46,-30,46,30],def:'XFMR_10TO1',name:'Transformer',cat:'Transformers',sub:1,
 draw:()=>`<path d="M-40-20H-14M-40 20H-14M40-20H14M40 20H14" ${STY}/><path d="${coil(-14,-20,4,1)}" ${STY}/><path d="${coil(14,-20,4,0)}" ${STY}/><path d="M-3-24V24M3-24V24" ${STY}/>`+xfdot(-24,-26)+xfdot(24,-26)},
XFMRC:{pre:'XT',fmt:'X',order:['p1','p2','s1','ct','s2'],pins:[['p1',-4,-3],['p2',-4,3],['s1',4,-3],['ct',4,0],['s2',4,3]],bb:[-4,-4,4,4],lw:50,ib:[-46,-40,46,40],def:'XFMR_CT_10TO1',name:'Transformer (centre tap)',cat:'Transformers',sub:1,
 draw:()=>`<path d="M-40-30H-14M-40 30H-14M40-30H14M40 30H14M40 0H14" ${STY}/><path d="${coil(-14,-30,6,1)}" ${STY}/><path d="${coil(14,-30,6,0)}" ${STY}/><path d="M-3-34V34M3-34V34" ${STY}/>`+xfdot(-24,-36)+xfdot(24,-36)+tx(36,-4,'CT',{s:8,c:'var(--mut)',a:'end'})}
})}
const GATE_BY_SUB={};Object.keys(SYMS).forEach(k=>{if(k.startsWith('G_'))GATE_BY_SUB[SYMS[k].def.toLowerCase()]=k});
function xType(e){const nm=(e.tail||'').trim().split(/\s+/)[0].toLowerCase(),n=e.pins.length;
  if(BUILTIN555.test(nm)&&n===8)return'NE555';if(/^dpdt_[abo]$/.test(nm)&&n===6)return'DPDT';if(/^xfmr_\d+to\d+$/.test(nm)&&n===4)return'XFMR';if(/^xfmr_ct_\d+to\d+$/.test(nm)&&n===5)return'XFMRC';if(/^relay_\d+v$/.test(nm)&&n===5)return'RLY';if(/^relay2_\d+v$/.test(nm)&&n===8)return'RLY2';const g=GATE_BY_SUB[nm];return g&&SYMS[g].order.length===n?g:'BOX'}
const bbOf=p=>{const S=SYMS[p.t];let b=S.bb;if(S.dyn){const n=p.np||2,h=Math.max(Math.ceil(n/2),2);b=[-5,-h,5,h]}return b};
function partPins(p){const S=SYMS[p.t],pins=S.dyn?S.dyn(p):S.pins;
  return pins.map(([nm,dx,dy])=>{const mx=p.m?-dx:dx,[rx,ry]=rot(mx,dy,p.r),ox=Math.abs(dx)>=Math.abs(dy)?sg(dx)||1:0,oy=ox?0:sg(dy),[qx,qy]=rot(p.m?-ox:ox,oy,p.r);
    return{name:nm,x:p.x+rx,y:p.y+ry,ox:qx,oy:qy}}).map((q,i,a)=>p.fl&&a.length===2?{...q,name:a[1-i].name}:q)}
function partBox(p){const b=bbOf(p),c=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(([x,y])=>rot(p.m?-x:x,y,p.r));
  return[p.x+Math.min(...c.map(q=>q[0])),p.y+Math.min(...c.map(q=>q[1])),p.x+Math.max(...c.map(q=>q[0])),p.y+Math.max(...c.map(q=>q[1]))]}
/* label placement (world px) */
function labelPos(p){const S=SYMS[p.t],x=p.x*U,y=p.y*U,vert=p.r%2===1;
  if(S.fmt==='two'){const up=S.bb[1]*U-12;return vert?{x:x+(S.bb[3]*U+10),y:y+2,a:'start',dy:12}:{x:x,y:y-(Math.abs(up)+4),a:'middle',dy:12,up:1}}
  if(p.t==='OA')return{x:x-4,y:y-42,a:'middle',dy:12,up:1};
  const w=(S.lw||(S.dyn?60:34));return{x:x+w,y:y-2,a:'start',dy:12}}
function drawPart(p,o={}){const S=SYMS[p.t],x=p.x*U,y=p.y*U;
  let g=`<g transform="translate(${x} ${y}) rotate(${p.r*90}) ${p.m?'scale(-1 1)':''}"><g transform="${p.fl?'scale(-1 1)':''}">${RCd(p,S)}</g></g>`;
  if(p.t==='GND')return g;
  if(p.t==='LBL'){const l=(p.v||'').length*7+14;return g+(p.r===2?tx(x-14,y+3.5,p.v||'',{a:'end',b:1,c:RCink()}):tx(x+14,y+3.5,p.v||'',{a:'start',b:1,c:RCink()}))}
  const L=labelPos(p),v=S.lbl?String(S.lbl(p)):p.v==null?'':String(p.v),nm=tx(L.x,L.up?L.y-12:L.y,p.n,{a:L.a,b:1,c:'var(--ink)'});
  g+=nm+tx(L.x,L.up?L.y:L.y+L.dy,cut(v,22),{a:L.a,s:10.5,c:'var(--mut)'});
  return g}
function iconSVG(k,sz,v){const p={t:k,x:0,y:0,r:0,v:v||SYMS[k].def||'',n:''},b=k==='OA'?[-48,-46,52,46]:k==='GND'?[-14,-4,14,22]:k==='LBL'?[-6,-12,64,12]:SYMS[k].ib||(SYMS[k].fmt==='two'?[-34,-22,34,22]:[-36,-36,40,36]);
  return `<svg viewBox="${b[0]} ${b[1]} ${b[2]-b[0]} ${b[3]-b[1]}" width="${sz||46}" height="${(sz||46)*(b[3]-b[1])/(b[2]-b[0])}">${RCd(p,SYMS[k])}${k==='LBL'?tx(14,3.5,'out',{a:'start',b:1,c:RCink()}):''}</svg>`}

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
  const X=extract(M),L=['.title '+(String(M.title||'').replace(/\s+/g,' ').trim()||'Circuit')],N=M.notes||[],nt=k=>N.filter(n=>n.at===k).map(n=>n.t);L.push(...nt('head'));
  M.parts.forEach(p=>{const S=SYMS[p.t];if(!S.pre)return;const g=n=>X.pin[p.id+'.'+n];let s;
    switch(S.fmt){case'two':s=p.t==='FUSE'?`${p.n} ${g('1')} ${g('2')} ${p.bn?'1G':'10m'} I=${fuseA(p.v)}`:`${p.n} ${g('1')} ${g('2')} ${p.v}`;break;case'Q':s=`${p.n} ${g('c')} ${g('b')} ${g('e')} ${p.v}`;break;
      case'M':s=`${p.n} ${g('d')} ${g('g')} ${g('s')} ${g('b')||g('s')} ${p.v}`;break;case'OA':s=`${p.n} ${g('out')} 0 ${g('inp')} ${g('inn')} ${p.v}`;break;
      case'E':s=`${p.n} ${g('p')} ${g('n')} ${g('cp')} ${g('cn')} ${p.v}`;break;
      case'X':s=`${p.n} ${S.order.map(g).join(' ')} ${p.v}`;break;
      case'BOX':s=`${p.n} ${Array.from({length:p.np||2},(_,i)=>g(String(i+1))).join(' ')} ${p.v}`;break}
    L.push(...nt('el:'+String(p.n).toLowerCase()),s.replace(/\s+/g,' ').trim())});
  return L.concat((M.dirs.length?M.dirs:['.op']).flatMap(d=>[...nt('d:'+nk(d.split('\n')[0])),d]),libFor(M.parts.filter(p=>SYMS[p.t].order).map(p=>p.v),M.dirs),nt('end'),['.end']).join('\n')}
/* ---- netlist → part types ---- */
function modsOf(P){const m={};P.dirs.forEach(d=>{const r=/^\.model\s+(\S+)\s+(\w+)\s*\(?(.*)/i.exec(d);if(r)m[r[1].toLowerCase()]={type:r[2].toLowerCase(),raw:r[3].toLowerCase()}});return m}
function typeFor(e,mods){const m0=(e.tail||'').split(/\s+/)[0]||'',m=m0.toLowerCase(),md=mods[m];
  switch(e.k){case'R':return/^rswm(\d|_|$)/i.test(e.n)?'SWM':/^rsw(\d|_|$)/i.test(e.n)?'SW':/^rfuse/i.test(e.n)?'FUSE':/^rbulb/i.test(e.n)?'BULB':/^rfan/i.test(e.n)?'FAN':/^rbuz/i.test(e.n)?'BUZ':/^rvm(\d|_|$)/i.test(e.n)?'VM':'R';case'C':return num(e.tail)>=4.7e-6?'Cp':'C';case'L':return'L';case'V':return/^vam(\d|_|$)/i.test(e.n)?'AM':'V';case'I':return'I';
    case'D':if(/led/i.test(m)||(md&&/is=1e-1[5-9]/.test(md.raw)&&/n=2/.test(md.raw)))return'LED';if(/zen|^bz|^1n47|^1n52/i.test(m)||(md&&/\bbv\s*=/.test(md.raw)))return'ZEN';return'D';
    case'Q':return(md?md.type==='pnp':/pnp|2907|3906/i.test(m))?'QP':'QN';
    case'M':{const p=md?md.type==='pmos':/pmos|^pm/i.test(m);return(p?'MP':'MN')+(gnd(e.nodes[3])!==gnd(e.nodes[2])?'4':'')}
    case'E':return e.pins[1]==='0'?'OA':'EV';case'G':return'GV';case'S':return'SVC';case'X':return xType(e);default:return'BOX'}}
const sigOf=P=>{const m=modsOf(P);return P.els.map(e=>e.n+':'+typeFor(e,m)+':'+e.pins.join('/')+(e.k==='M'?'/'+gnd(e.nodes[3]):'')).join('|')};
function mkParts(P){const mods=modsOf(P);
  return P.els.map((e,i)=>{const t=typeFor(e,mods),q=e.pins,p={id:'p'+i,t,n:e.n,v:e.k==='V'||e.k==='I'?e.val:e.tail,x:0,y:0,r:0,m:0,pn:{}};
    if(e.k==='Q')p.pn={c:q[0],b:q[1],e:q[2]};else if(e.k==='M'){p.pn={d:q[0],g:q[1],s:q[2]};if(t.endsWith('4'))p.pn.b=gnd(e.nodes[3])}
    else if(t==='OA')p.pn={out:q[0],inp:q[2],inn:q[3]};else if(e.k==='E'||e.k==='G'||e.k==='S')p.pn={p:q[0],n:q[1],cp:q[2],cn:q[3]};
    else if(SYMS[t].order){SYMS[t].order.forEach((nm,j)=>{p.pn[nm]=q[j]})}else if(t==='BOX'){p.np=q.length;q.forEach((n,j)=>p.pn[String(j+1)]=n)}else p.pn={'1':q[0],'2':q[1]};
    if(t==='FUSE'){const m=/\bi\s*=\s*(\S+)/i.exec(e.tail||'');p.v=String(m?fuseA(m[1]):5);p.bn=num(e.tail)>1?1:0}
    return p})}
/* ---- auto layout + router ---- */
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]],dirIdx=(ox,oy)=>ox===1?0:oy===1?1:ox===-1?2:3;
class Heap{constructor(){this.a=[]}get size(){return this.a.length}
  push(c,v){const a=this.a;a.push([c,v]);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p}}
  pop(){const a=this.a,t=a[0],l=a.pop();if(a.length){a[0]=l;let i=0;for(;;){let m=i,x=2*i+1,y=x+1;if(x<a.length&&a[x][0]<a[m][0])m=x;if(y<a.length&&a[y][0]<a[m][0])m=y;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m}}return t[1]}}
function layout(P,opt){opt=opt||{};
  const parts=mkParts(P),M={title:P.title,parts:[],wires:[],dirs:P.dirs.slice(),notes:P.notes||[],seq:1};
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

/* Short-circuit detection: a loop made only of ideal voltage sources / ammeters (0 V sources) and wires has no resistance at all
   (battery terminals joined by a wire, ammeter straight across a battery, two batteries in parallel ...). Returns the nets
   (lower-case node names) on that loop - their wires are drawn red - and the names of the sources that form it. */
function shortCircuit(P){
  const out={nets:new Set(),names:[]};
  try{
    const nm=n=>{n=String(n).toLowerCase();return n==='gnd'?'0':n};
    const par=new Map(),find=a=>{while(par.get(a)!==a)a=par.get(a);return a};
    const adj=new Map(),add=(a,b,n)=>{if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push({to:b,n});adj.get(b).push({to:a,n})};
    (P&&P.els||[]).forEach(e=>{
      if(e.k!=='V'||!e.nodes||e.nodes.length<2)return;
      const a=nm(e.nodes[0]),b=nm(e.nodes[1]);
      [a,b].forEach(x=>{if(!par.has(x))par.set(x,x)});
      if(a===b){out.nets.add(a);out.names.push(e.n);return}                 /* both terminals on the same wire */
      if(find(a)===find(b)){                                                 /* closes a loop of voltage sources */
        const prev=new Map([[a,null]]),q=[a];
        while(q.length&&!prev.has(b)){const u=q.shift();(adj.get(u)||[]).forEach(x=>{if(!prev.has(x.to)){prev.set(x.to,{from:u,n:x.n});q.push(x.to)}})}
        out.nets.add(a);out.nets.add(b);out.names.push(e.n);
        for(let u=b;prev.get(u);u=prev.get(u).from){out.nets.add(u);out.nets.add(prev.get(u).from);out.names.push(prev.get(u).n)}
      }else par.set(find(a),find(b));
      add(a,b,e.n);
    });
  }catch(_){}
  out.names=[...new Set(out.names)];
  return out}
const shortMsg=sc=>'Short circuit: '+sc.names.join(', ')+' has no resistance in its loop (the wires of the loop are red). Remove the wire loop or add a resistor / load.';
/* render.js — draws the schematic: wires, junction dots, parts, net names */
function drawScene(M,o){o=o||{};let s='';const X=extract(M),sel=o.sel||new Set();
  const ends=new Map(),inc=(x,y)=>{const k=K(x,y);ends.set(k,(ends.get(k)||0)+1)};
  M.wires.forEach(w=>{for(let i=0;i+1<w.pts.length;i++){inc(w.pts[i][0],w.pts[i][1]);inc(w.pts[i+1][0],w.pts[i+1][1])}});
  const pinPts=[];M.parts.forEach(p=>partPins(p).forEach(q=>{inc(q.x,q.y);pinPts.push([p,q])}));
  const interior=(x,y)=>X.segs.some(g=>{const[x1,y1]=g.a,[x2,y2]=g.b;if(x1===x2)return x===x1&&y>Math.min(y1,y2)&&y<Math.max(y1,y2);if(y1===y2)return y===y1&&x>Math.min(x1,x2)&&x<Math.max(x1,x2);return false});
  /* net highlight */
  M.wires.forEach(w=>{const hi=o.selW===w,nt=o.selNet&&w.net&&w.net===o.selNet,sh=!hi&&o.short&&w.net!=null&&o.short.has(String(w.net).toLowerCase());
    s+=`<path d="M${w.pts.map(q=>q[0]*U+' '+q[1]*U).join('L')}" fill="none" stroke="${hi?'var(--accent)':sh?'#ee2b2b':nt?'var(--accent)':'var(--wire)'}" stroke-width="${hi?3.2:sh?3:nt?2.8:1.9}" stroke-linecap="round" stroke-linejoin="round"/>`});
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

/* examples.js — 142 NGspice examples in 13 topics */
const TOPICS=[{"topic": "DC Resistor Circuits", "items": [{"n": 1, "title": "Voltage divider", "desc": "Plot `v(out)` in the DC tab: it is exactly half the input.", "net": "* Voltage divider\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 1k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 2, "title": "Series resistors", "desc": "Current is identical through all three; check `i(R1)`, `i(R2)`, `i(R3)`.", "net": "* Series resistors\nV1 1 0 DC 12\nR1 1 2 1k\nR2 2 3 2.2k\nR3 3 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 3, "title": "Parallel resistors", "desc": "Branch currents add up to the source current.", "net": "* Three parallel branches\nV1 in 0 DC 12\nR1 in 0 1k\nR2 in 0 2.2k\nR3 in 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 4, "title": "Loaded voltage divider", "desc": "Compare `v(mid)` with and without `RL`.", "net": "* Loaded voltage divider\nV1 vcc 0 DC 12\nR1 vcc mid 10k\nR2 mid 0 10k\nR3 mid 0 4.7k\n.op\n.dc V1 0 12 1\n.end"}, {"n": 5, "title": "Wheatstone bridge", "desc": "`R4` is slightly off balance, so the bridge detector `Rg` sees a small voltage.", "net": "* Wheatstone bridge\nV1 top 0 DC 10\nR1 top a 1k\nR2 top b 1k\nR3 a 0 1k\nR4 b 0 1.1k\nRg a b 10k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 6, "title": "Superposition with two sources", "desc": "", "net": "* Superposition: two voltage sources\nV1 1 0 DC 10\nV2 3 0 DC 5\nR1 1 2 1k\nR2 2 0 2k\nR3 3 2 1k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 7, "title": "Current source feeding a resistor network", "desc": "", "net": "* Current source network\nI1 0 1 DC 1m\nR1 1 0 4.7k\nR2 1 2 1k\nR3 2 0 2.2k\n.op\n.dc I1 0 2m 0.1m\n.end"}, {"n": 8, "title": "R-2R ladder DAC (3 bit, code 101)", "desc": "Expected output: 5 V × 5/8 = 3.125 V at `n2`.", "net": "* R-2R ladder DAC, code 101\nVb2 b2 0 DC 5\nVb1 b1 0 DC 0\nVb0 b0 0 DC 5\nR2b b2 n2 20k\nR1b b1 n1 20k\nR0b b0 n0 20k\nRt n0 0 20k\nRa n0 n1 10k\nRb n1 n2 10k\n.op\n.end"}, {"n": 9, "title": "Delta network with loads", "desc": "", "net": "* Delta resistor network with loads\nV1 a 0 DC 10\nR1 a b 1k\nR2 b c 1k\nR3 c a 1k\nR4 b 0 2.2k\nR5 c 0 2.2k\n.op\n.dc V1 0 10 1\n.end"}, {"n": 10, "title": "Maximum power transfer", "desc": "Power in `RL` is highest when `RL = Rs` (see the P column in the operating-point table).", "net": "* Maximum power transfer RL = Rs\nVs 1 0 DC 10\nR1 1 2 50\nR2 2 0 50\n.op\n.dc Vs 0 10 1\n.end"}]}, {"topic": "Transient: RC, RL, RLC", "items": [{"n": 11, "title": "RC charge and discharge (square wave)", "desc": "Time constant is 1 ms.", "net": "* RC charge/discharge\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 1k\nC1 out 0 1u\n.tran 20u 10m\n.end"}, {"n": 12, "title": "Slow RC (τ = 1 ms with 10 kΩ and 100 nF)", "desc": "", "net": "* RC time constant 1 ms\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 10k\nC1 out 0 100n\n.tran 20u 10m\n.end"}, {"n": 13, "title": "RL step response", "desc": "Time constant L/R = 0.1 ms. Plot `i(L1)`.", "net": "* RL step response\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in out 100\nL1 out 0 10m\n.tran 5u 1m\n.end"}, {"n": 14, "title": "RC differentiator", "desc": "", "net": "* RC differentiator\nV1 in 0 PULSE(0 5 0 1n 1n 1m 2m)\nC1 in out 10n\nR1 out 0 10k\n.tran 5u 4m\n.end"}, {"n": 15, "title": "RC integrator (square wave to triangle)", "desc": "", "net": "* RC integrator\nV1 in 0 PULSE(-1 1 0 1n 1n 50u 100u)\nR1 in out 100k\nC1 out 0 10n\n.tran 0.5u 1m\n.end"}, {"n": 16, "title": "Series RLC, underdamped", "desc": "Overshoot and ringing at about 1.6 kHz.", "net": "* Series RLC underdamped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 10\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 17, "title": "Series RLC, overdamped", "desc": "", "net": "* Series RLC overdamped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 1k\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 18, "title": "Series RLC, critically damped", "desc": "R = 2·√(L/C) = 200 Ω.", "net": "* Series RLC critically damped\nV1 in 0 PULSE(0 1 0 1n 1n 5m 10m)\nR1 in a 200\nL1 a b 10m\nC1 b 0 1u\n.tran 5u 2m\n.end"}, {"n": 19, "title": "Parallel RLC ringing (current impulse)", "desc": "", "net": "* Parallel RLC impulse response\nI1 0 n PULSE(0 1m 0 1n 1n 20u 1)\nR1 n 0 100\nL1 n 0 1m\nC1 n 0 1u\n.tran 1u 2m\n.end"}, {"n": 20, "title": "Two-stage RC network", "desc": "", "net": "* Two-stage RC low-pass step\nV1 in 0 PULSE(0 5 0 1n 1n 5m 10m)\nR1 in a 1k\nC1 a 0 1u\nR2 a b 1k\nC2 b 0 1u\n.tran 20u 10m\n.end"}, {"n": 21, "title": "Capacitor charged through a Thevenin divider", "desc": "Final value is the divider voltage, not the supply.", "net": "* Capacitor charging via divider\nV1 in 0 DC 10\nR1 in a 10k\nR2 a 0 10k\nC1 a 0 1u\n.tran 50u 50m\n.end"}, {"n": 22, "title": "Charge sharing between two capacitors", "desc": "", "net": "* Coupled RC stages\nV1 in 0 PULSE(0 5 0 1n 1n 10m 20m)\nR1 in a 1k\nC1 a 0 1u\nR2 a b 1k\nC2 b 0 2u\n.tran 50u 20m\n.end"}]}, {"topic": "AC Frequency Response and Filters", "items": [{"n": 23, "title": "RC low-pass (fc ≈ 1.59 kHz)", "desc": "", "net": "* RC low-pass\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 100n\n.ac dec 50 10 1meg\n.end"}, {"n": 24, "title": "RC high-pass", "desc": "", "net": "* RC high-pass\nV1 in 0 AC 1\nC1 in out 100n\nR1 out 0 1k\n.ac dec 50 10 1meg\n.end"}, {"n": 25, "title": "RL low-pass", "desc": "fc = R/(2πL) ≈ 1.59 kHz.", "net": "* RL low-pass\nV1 in 0 AC 1\nL1 in out 10m\nR1 out 0 100\n.ac dec 50 10 1meg\n.end"}, {"n": 26, "title": "RL high-pass", "desc": "", "net": "* RL high-pass\nV1 in 0 AC 1\nR1 in out 100\nL1 out 0 10m\n.ac dec 50 10 1meg\n.end"}, {"n": 27, "title": "Series RLC band-pass (Q = 10)", "desc": "Output is taken across `R1`.", "net": "* Series RLC band-pass\nV1 in 0 AC 1\nL1 in a 10m\nC1 a out 1u\nR1 out 0 10\n.ac dec 100 100 100k\n.end"}, {"n": 28, "title": "Series LC notch (band-stop)", "desc": "", "net": "* LC notch at 1.59 kHz\nV1 in 0 AC 1\nR1 in out 100\nL1 out m 10m\nC1 m 0 1u\n.ac dec 100 100 100k\n.end"}, {"n": 29, "title": "Parallel LC resonant band-pass", "desc": "", "net": "* Parallel resonant band-pass\nV1 in 0 AC 1\nR1 in out 1k\nL1 out 0 10m\nC1 out 0 1u\n.ac dec 100 100 100k\n.end"}, {"n": 30, "title": "Second-order LC low-pass", "desc": "", "net": "* Second-order LC low-pass\nV1 in 0 AC 1\nL1 in out 10m\nC1 out 0 1u\nR1 out 0 50\n.ac dec 50 100 100k\n.end"}, {"n": 31, "title": "Second-order CL high-pass", "desc": "", "net": "* Second-order high-pass\nV1 in 0 AC 1\nC1 in out 1u\nL1 out 0 10m\nR1 out 0 100\n.ac dec 50 100 100k\n.end"}, {"n": 32, "title": "Twin-T notch filter (fn ≈ 1.59 kHz)", "desc": "", "net": "* Twin-T notch\nV1 in 0 AC 1\nR1 in a 10k\nR2 a out 10k\nC3 a 0 20n\nC1 in b 10n\nC2 b out 10n\nR3 b 0 5k\nR4 out 0 1meg\n.ac dec 100 10 100k\n.end"}, {"n": 33, "title": "Wien bridge network (peak gain 1/3 at 1.59 kHz)", "desc": "", "net": "* Wien network band-pass\nV1 in 0 AC 1\nR1 in a 10k\nC1 a out 10n\nR2 out 0 10k\nC2 out 0 10n\n.ac dec 100 10 100k\n.end"}, {"n": 34, "title": "Two-stage RC low-pass (−40 dB/dec)", "desc": "", "net": "* Cascaded RC low-pass\nV1 in 0 AC 1\nR1 in a 1k\nC1 a 0 100n\nR2 a out 1k\nC2 out 0 100n\n.ac dec 50 10 1meg\n.end"}, {"n": 35, "title": "Three-stage RC phase-shift network", "desc": "The phase plot reaches 180° of lead near 650 Hz (1/(2πRC√6)), where the gain is about 1/29.", "net": "* Three-stage RC phase shifter\nV1 in 0 AC 1\nC1 in a 10n\nR1 a 0 10k\nC2 a b 10n\nR2 b 0 10k\nC3 b out 10n\nR3 out 0 10k\n.ac dec 100 10 100k\n.end"}, {"n": 36, "title": "Lead network", "desc": "", "net": "* Lead network\nV1 in 0 AC 1\nR1 in out 10k\nC1 in out 10n\nR2 out 0 1k\n.ac dec 50 10 1meg\n.end"}, {"n": 37, "title": "Lag network", "desc": "", "net": "* Lag network\nV1 in 0 AC 1\nR1 in out 10k\nR2 out m 1k\nC1 m 0 100n\n.ac dec 50 1 100k\n.end"}, {"n": 38, "title": "Pi (C-L-C) filter between 50 Ω terminations", "desc": "", "net": "* Pi filter 50 ohm\nV1 src 0 AC 1\nR1 src in 50\nC1 in 0 1u\nL1 in out 10m\nC2 out 0 1u\nR2 out 0 50\n.ac dec 50 100 1meg\n.end"}]}, {"topic": "Diodes and Rectifiers", "items": [{"n": 39, "title": "Diode forward I-V curve", "desc": "", "net": "* Diode forward I-V\nV1 in 0 DC 0\nR1 in a 100\nD1 a 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 5 0.05\n.end"}, {"n": 40, "title": "Reverse-biased diode", "desc": "", "net": "* Diode reverse and forward sweep\nV1 in 0 DC -5\nR1 in a 1k\nD1 a 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 -10 5 0.25\n.end"}, {"n": 41, "title": "Half-wave rectifier (no filter)", "desc": "", "net": "* Half-wave rectifier\nV1 in 0 SIN(0 5 50)\nD1 in out DX\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 42, "title": "Half-wave rectifier with filter capacitor", "desc": "", "net": "* Half-wave rectifier with filter\nV1 in 0 SIN(0 5 50)\nD1 in out DX\nC1 out 0 10u\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 43, "title": "Full-wave bridge rectifier", "desc": "", "net": "* Full-wave bridge rectifier\nV1 a b SIN(0 10 50)\nR1 b 0 1meg\nD1 a p DX\nD2 b p DX\nD3 0 a DX\nD4 0 b DX\nR2 p 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 44, "title": "Center-tapped full-wave rectifier", "desc": "", "net": "* Center-tapped full-wave rectifier\nV1 a 0 SIN(0 10 50)\nV2 b 0 SIN(0 10 50 0 0 180)\nD1 a out DX\nD2 b out DX\nR1 out 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 60m\n.end"}, {"n": 45, "title": "Positive clipper (limits at about +0.7 V)", "desc": "", "net": "* Diode clipper\nV1 in 0 SIN(0 5 1k)\nR1 in out 1k\nD1 out 0 DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 46, "title": "Bidirectional clipper (±0.7 V)", "desc": "", "net": "* Bidirectional clipper\nV1 in 0 SIN(0 5 1k)\nR1 in out 1k\nD1 out 0 DX\nD2 0 out DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 47, "title": "Biased clipper (limits near 2.7 V)", "desc": "", "net": "* Biased clipper\nV1 in 0 SIN(0 5 1k)\nVb ref 0 DC 2\nR1 in out 1k\nD1 out ref DX\n.model DX D(Is=1e-14 N=1)\n.tran 5u 3m\n.end"}, {"n": 48, "title": "Diode clamper (DC restorer)", "desc": "The signal is shifted upward so its negative peaks are clamped at about −0.7 V; compare `v(in)` with `v(out)`.", "net": "* Diode clamper\nV1 in 0 SIN(0 5 1k)\nC1 in out 10u\nD1 0 out DX\nR1 out 0 100k\n.model DX D(Is=1e-14 N=1)\n.tran 5u 10m\n.end"}, {"n": 49, "title": "Voltage doubler", "desc": "Output approaches about 2·Vpeak minus diode drops.", "net": "* Voltage doubler\nV1 in 0 SIN(0 5 1k)\nC1 in a 1u\nD1 0 a DX\nD2 a out DX\nC2 out 0 1u\nR1 out 0 10k\n.model DX D(Is=1e-14 N=1)\n.tran 10u 30m\n.end"}, {"n": 50, "title": "Three series diodes as a voltage reference", "desc": "Output `v(a)` is about 2 V.", "net": "* Series diode reference\nV1 in 0 DC 9\nR1 in a 1k\nD1 a b DX\nD2 b c DX\nD3 c 0 DX\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 9 0.25\n.end"}, {"n": 51, "title": "Diode AND gate", "desc": "", "net": "* Diode AND gate\nVcc vcc 0 DC 5\nVa a 0 PULSE(0 5 0 1n 1n 1m 2m)\nVb b 0 PULSE(0 5 0 1n 1n 2m 4m)\nR1 vcc y 1k\nD1 y a DX\nD2 y b DX\n.model DX D(Is=1e-14 N=1)\n.tran 20u 4m\n.end"}, {"n": 52, "title": "Diode OR gate", "desc": "", "net": "* Diode OR gate\nVa a 0 PULSE(0 5 0 1n 1n 1m 2m)\nVb b 0 PULSE(0 5 0 1n 1n 2m 4m)\nD1 a y DX\nD2 b y DX\nR1 y 0 1k\n.model DX D(Is=1e-14 N=1)\n.tran 20u 4m\n.end"}, {"n": 53, "title": "LED with current-limiting resistor", "desc": "", "net": "* LED driver\nVs 1 0 DC 5\nR1 1 a 330\nD1 a 0 LED\n.model LED D(Is=1e-18 N=2)\n.op\n.dc Vs 0 5 0.1\n.end"}, {"n": 54, "title": "Low-drop versus standard silicon diode", "desc": "The low-Is diode (`DS`) is compared with the standard silicon diode (`DX`).", "net": "* Low-drop vs silicon\nV1 in 0 DC 0\nR1 in a 100\nD1 a 0 DS\nR2 in b 100\nD2 b 0 DX\n.model DS D(Is=1e-8 N=1.05)\n.model DX D(Is=1e-14 N=1)\n.op\n.dc V1 0 5 0.05\n.end"}]}, {"topic": "BJT Circuits", "items": [{"n": 55, "title": "Fixed-bias common emitter (supply sweep)", "desc": "", "net": "* NPN fixed bias\nVcc vcc 0 DC 12\nRb vcc b 220k\nRc vcc c 2.2k\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 56, "title": "BJT output characteristics (Ib = 20 µA)", "desc": "Plot `i(Vce)` against the swept `Vce`.", "net": "* BJT output characteristic\nIb 0 b DC 20u\nVce c 0 DC 5\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vce 0 10 0.1\n.end"}, {"n": 57, "title": "Voltage-divider bias with emitter resistor", "desc": "", "net": "* Voltage-divider bias\nVcc vcc 0 DC 12\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nQ1 c b e QN\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 58, "title": "BJT as a saturated switch", "desc": "", "net": "* BJT switch\nVcc vcc 0 DC 5\nVin in 0 PULSE(0 5 0 1u 1u 1m 2m)\nRb in b 10k\nRc vcc c 1k\nQ1 c b 0 QN\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 4m\n.end"}, {"n": 59, "title": "Emitter follower", "desc": "", "net": "* Emitter follower\nVcc vcc 0 DC 12\nVin in 0 SIN(6 1 1k)\nQ1 vcc in e QN\nRe e 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 3m\n.end"}, {"n": 60, "title": "Common-emitter amplifier: frequency response", "desc": "", "net": "* CE amplifier AC response\nVcc vcc 0 DC 12\nVin in 0 SIN(0 10m 1k) AC 1\nCin in b 10u\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nCe e 0 100u\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.ac dec 20 1 1meg\n.end"}, {"n": 61, "title": "Common-emitter amplifier: transient", "desc": "", "net": "* CE amplifier transient\nVcc vcc 0 DC 12\nVin in 0 SIN(0 20m 1k)\nCin in b 10u\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 2.2k\nRe e 0 1k\nCe e 0 100u\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.tran 10u 5m\n.end"}, {"n": 62, "title": "Common-base amplifier", "desc": "", "net": "* Common-base amplifier\nVcc vcc 0 DC 12\nVin in 0 SIN(0 20m 1k) AC 1\nCin in e 10u\nRe e 0 1k\nR1 vcc b 47k\nR2 b 0 10k\nCb b 0 100u\nRc vcc c 2.2k\nQ1 c b e QN\nCout c out 10u\nR3 out 0 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.ac dec 20 10 1meg\n.tran 10u 3m\n.end"}, {"n": 63, "title": "BJT current mirror", "desc": "", "net": "* BJT current mirror\nVcc vcc 0 DC 12\nR1 vcc c1 10k\nQ1 c1 c1 0 QN\nQ2 out c1 0 QN\nR2 vcc out 4.7k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 64, "title": "Differential pair", "desc": "Sweep `Vin1` and watch the collector voltages cross.", "net": "* BJT differential pair\nVcc vcc 0 DC 12\nVee vee 0 DC -12\nVin1 in1 0 DC 0\nVin2 in2 0 DC 0\nRc1 vcc c1 4.7k\nRc2 vcc c2 4.7k\nQ1 c1 in1 e QN\nQ2 c2 in2 e QN\nRe e vee 10k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vin1 -0.2 0.2 0.01\n.end"}, {"n": 65, "title": "Darlington emitter follower", "desc": "Emitter voltage is about 1.4 V below the base.", "net": "* Darlington pair\nVcc vcc 0 DC 12\nVb b 0 DC 5\nQ1 vcc b e1 QN\nQ2 vcc e1 e QN\nRe e 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vb 0 10 0.1\n.end"}, {"n": 66, "title": "PNP common-emitter stage", "desc": "", "net": "* PNP common emitter\nVcc vcc 0 DC 12\nRb b 0 220k\nRc c 0 2.2k\nQ1 c b vcc QP\n.model QP PNP(Is=1e-14 Bf=100)\n.op\n.dc Vcc 0 12 0.25\n.end"}, {"n": 67, "title": "Complementary push-pull follower (crossover distortion)", "desc": "", "net": "* Push-pull emitter follower\nVcc vcc 0 DC 12\nVee vee 0 DC -12\nVin in 0 SIN(0 5 1k)\nQ1 vcc in out QN\nQ2 vee in out QP\nR1 out 0 1k\n.model QN NPN(Is=1e-14 Bf=200)\n.model QP PNP(Is=1e-14 Bf=100)\n.tran 5u 3m\n.end"}, {"n": 68, "title": "Constant-current source with diode reference", "desc": "", "net": "* BJT current source\nVcc vcc 0 DC 12\nR1 vcc b 4.7k\nD1 b m DX\nD2 m 0 DX\nQ1 c b e QN\nRe e 0 470\nR2 vcc c 1k\n.model DX D(Is=1e-14 N=1)\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vcc 0 12 0.25\n.end"}]}, {"topic": "MOSFET Circuits", "items": [{"n": 69, "title": "NMOS transfer characteristic", "desc": "", "net": "* NMOS transfer curve\nVdd vdd 0 DC 5\nVg g 0 DC 0\nRd vdd d 1k\nM1 d g 0 0 NM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vg 0 5 0.05\n.end"}, {"n": 70, "title": "NMOS output characteristic (Vgs = 3 V)", "desc": "", "net": "* NMOS output characteristic\nVg g 0 DC 3\nVds d 0 DC 5\nM1 d g 0 0 NM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vds 0 5 0.05\n.end"}, {"n": 71, "title": "Common-source stage with gate-voltage sweep", "desc": "", "net": "* NMOS common source\nVdd vdd 0 DC 5\nVg g 0 DC 2\nRd vdd d 4.7k\nM1 d g 0 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u)\n.op\n.dc Vg 0 5 0.1\n.end"}, {"n": 72, "title": "Common-source amplifier: transient", "desc": "", "net": "* NMOS CS amplifier transient\nVdd vdd 0 DC 10\nVin g 0 SIN(2 0.2 1k)\nRd vdd d 4.7k\nM1 d g 0 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.tran 5u 3m\n.end"}, {"n": 73, "title": "Common-source amplifier: frequency response", "desc": "", "net": "* NMOS CS amplifier AC\nVdd vdd 0 DC 10\nVin in 0 SIN(0 10m 1k) AC 1\nCin in g 100n\nR1 vdd g 680k\nR2 g 0 320k\nRd vdd d 2.2k\nM1 d g 0 0 NM W=10u L=1u\nCout d out 100n\nR3 out 0 100k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.ac dec 20 10 1meg\n.end"}, {"n": 74, "title": "Source follower", "desc": "", "net": "* NMOS source follower\nVdd vdd 0 DC 10\nVin in 0 SIN(5 0.5 1k)\nM1 vdd in s 0 NM W=20u L=1u\nRs s 0 4.7k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.tran 5u 3m\n.end"}, {"n": 75, "title": "NMOS inverter with resistive load", "desc": "", "net": "* NMOS resistive-load inverter\nVdd vdd 0 DC 5\nVin in 0 PULSE(0 5 0 10n 10n 1u 2u)\nRd vdd out 10k\nM1 out in 0 0 NM W=10u L=1u\nCl out 0 1p\n.model NM NMOS(Vto=1 Kp=100u)\n.tran 10n 4u\n.end"}, {"n": 76, "title": "CMOS inverter transfer curve", "desc": "Switching threshold is near 2.5 V because the devices are matched.", "net": "* CMOS inverter VTC\nVdd vdd 0 DC 5\nVin in 0 DC 0\nM1 out in 0 0 NM W=10u L=1u\nM2 out in vdd vdd PM W=20u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)\n.op\n.dc Vin 0 5 0.05\n.end"}, {"n": 77, "title": "CMOS inverter transient with load capacitor", "desc": "", "net": "* CMOS inverter switching\nVdd vdd 0 DC 5\nVin in 0 PULSE(0 5 0 100p 100p 5n 10n)\nM1 out in 0 0 NM W=10u L=1u\nM2 out in vdd vdd PM W=20u L=1u\nCl out 0 100f\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)\n.tran 50p 20n\n.end"}, {"n": 78, "title": "NMOS current mirror", "desc": "", "net": "* NMOS current mirror\nVdd vdd 0 DC 5\nR1 vdd g 10k\nM1 g g 0 0 NM W=10u L=1u\nM2 out g 0 0 NM W=10u L=1u\nR2 vdd out 4.7k\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vdd 0 5 0.1\n.end"}, {"n": 79, "title": "NMOS differential pair", "desc": "", "net": "* NMOS differential pair\nVdd vdd 0 DC 5\nI1 s 0 DC 200u\nVin1 in1 0 DC 2\nVin2 in2 0 DC 2\nRd1 vdd d1 10k\nRd2 vdd d2 10k\nM1 d1 in1 s 0 NM W=10u L=1u\nM2 d2 in2 s 0 NM W=10u L=1u\n.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)\n.op\n.dc Vin1 1.5 2.5 0.02\n.end"}, {"n": 80, "title": "NMOS pass transistor with capacitive load", "desc": "Output reaches the input voltage while the gate is high, then holds on the capacitor.", "net": "* NMOS pass gate\nVin in 0 DC 3\nVg g 0 PULSE(0 5 0 1u 1u 100u 200u)\nM1 in g out 0 NM W=10u L=1u\nCl out 0 1n\nRl out 0 1meg\n.model NM NMOS(Vto=1 Kp=100u)\n.tran 1u 400u\n.end"}]}, {"topic": "Controlled Sources and Op-Amp Circuits", "items": [{"n": 81, "title": "VCVS amplifier (gain 10)", "desc": "", "net": "* VCVS gain of 10\nVin in 0 DC 0 AC 1\nE1 out 0 in 0 10\nRl out 0 1k\n.op\n.dc Vin -1 1 0.1\n.ac dec 10 1 1k\n.end"}, {"n": 82, "title": "VCCS transconductance stage", "desc": "", "net": "* VCCS transconductance 2 mS\nVin in 0 DC 0\nG1 out 0 in 0 2m\nRl out 0 2k\n.op\n.dc Vin -1 1 0.1\n.end"}, {"n": 83, "title": "Inverting amplifier (gain −10)", "desc": "", "net": "* Inverting op-amp\nVin in 0 DC 0 AC 1\nR1 in inv 1k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.op\n.dc Vin -1 1 0.1\n.ac dec 10 1 1k\n.end"}, {"n": 84, "title": "Non-inverting amplifier (gain 10)", "desc": "", "net": "* Non-inverting op-amp\nVin in 0 DC 0.5 AC 1\nRf out inv 9k\nRg inv 0 1k\nE1 out 0 in inv 100000\n.op\n.dc Vin -1 1 0.1\n.end"}, {"n": 85, "title": "Voltage follower (buffer)", "desc": "", "net": "* Voltage follower\nVin in 0 SIN(0 1 1k)\nE1 out 0 in out 100000\nRl out 0 1k\n.tran 10u 3m\n.end"}, {"n": 86, "title": "Summing amplifier", "desc": "Expected output: −(1 V + 2 V) = −3 V.", "net": "* Summing amplifier\nV1 a 0 DC 1\nV2 b 0 DC 2\nR1 a inv 10k\nR2 b inv 10k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.op\n.end"}, {"n": 87, "title": "Difference amplifier", "desc": "Expected output: 100k/10k × (2 V − 1 V) = 10 V.", "net": "* Difference amplifier\nV1 a 0 DC 2\nV2 b 0 DC 1\nR1 a inv 10k\nRf inv out 100k\nR3 b np 10k\nR4 np 0 100k\nE1 out 0 np inv 100000\n.op\n.end"}, {"n": 88, "title": "Op-amp integrator", "desc": "", "net": "* Op-amp integrator\nVin in 0 PULSE(-1 1 0 1n 1n 500u 1m)\nR1 in inv 10k\nC1 inv out 10n\nRf inv out 1meg\nE1 out 0 0 inv 100000\n.tran 2u 4m\n.end"}, {"n": 89, "title": "Op-amp differentiator", "desc": "Triangle input gives a square-wave output.", "net": "* Op-amp differentiator\nVin in 0 PWL(0 0 0.5m 1 1m 0 1.5m 1 2m 0)\nRs in x 100\nCin x inv 10n\nRf inv out 10k\nE1 out 0 0 inv 100000\n.tran 5u 2m\n.end"}, {"n": 90, "title": "Active low-pass filter (fc ≈ 1 kHz, gain −1)", "desc": "", "net": "* Active inverting low-pass\nVin in 0 AC 1\nR1 in inv 10k\nRf inv out 10k\nCf inv out 15.9n\nE1 out 0 0 inv 100000\n.ac dec 50 10 100k\n.end"}, {"n": 91, "title": "Active high-pass filter (fc ≈ 1 kHz, gain −1)", "desc": "", "net": "* Active inverting high-pass\nVin in 0 AC 1\nC1 in a 15.9n\nR1 a inv 10k\nRf inv out 10k\nE1 out 0 0 inv 100000\n.ac dec 50 10 100k\n.end"}, {"n": 92, "title": "Sallen-Key low-pass (Butterworth, fc ≈ 1.6 kHz)", "desc": "", "net": "* Sallen-Key low-pass\nVin in 0 AC 1\nR1 in a 10k\nR2 a b 10k\nC1 a out 14.1n\nC2 b 0 7.07n\nE1 out 0 b 0 1\n.ac dec 50 10 100k\n.end"}]}, {"topic": "Source Waveforms", "items": [{"n": 93, "title": "Exponentially damped sine", "desc": "", "net": "* Damped sine source\nV1 in 0 SIN(0 5 1k 0 500 0)\nR1 in 0 1k\n.tran 5u 5m\n.end"}, {"n": 94, "title": "Square wave through an RC low-pass (harmonic filtering)", "desc": "", "net": "* Square wave into RC filter\nV1 in 0 PULSE(0 5 0 1n 1n 0.5m 1m)\nR1 in out 1.6k\nC1 out 0 100n\n.tran 5u 5m\n.end"}, {"n": 95, "title": "Arbitrary PWL stimulus", "desc": "", "net": "* PWL source into RC\nV1 in 0 PWL(0 0 1m 0 1.1m 5 3m 5 3.1m 0 5m 0)\nR1 in out 1k\nC1 out 0 1u\n.tran 10u 6m\n.end"}, {"n": 96, "title": "Two series sine sources (100 Hz beat)", "desc": "", "net": "* Beat between 1 kHz and 1.1 kHz\nV1 a 0 SIN(0 1 1k)\nV2 b a SIN(0 1 1.1k)\nR1 b 0 1k\n.tran 10u 20m\n.end"}]}, {"topic": "Applications", "items": [{"n": 97, "title": "Bridge rectifier with reservoir capacitor (ripple)", "desc": "", "net": "* Bridge rectifier with filter cap\nV1 a b SIN(0 12 50)\nR1 b 0 1meg\nD1 a p DX\nD2 b p DX\nD3 0 a DX\nD4 0 b DX\nC1 p 0 470u\nR2 p 0 100\n.model DX D(Is=1e-14 N=1)\n.tran 0.1m 100m\n.end"}, {"n": 98, "title": "Series-pass regulator (LED reference)", "desc": "Output stays near 1.2 V once the input is high enough.", "net": "* Series-pass regulator\nVin vin 0 DC 15\nR1 vin b 2.2k\nD1 b 0 LED\nQ1 vin b out QN\nR2 out 0 1k\n.model LED D(Is=1e-18 N=2)\n.model QN NPN(Is=1e-14 Bf=200)\n.op\n.dc Vin 0 15 0.25\n.end"}, {"n": 99, "title": "Third-order Butterworth LC low-pass (fc = 1 kHz, 50 Ω)", "desc": "", "net": "* 3rd-order Butterworth LC low-pass\nV1 src 0 AC 1\nR1 src in 50\nC1 in 0 3.18u\nL1 in out 15.9m\nC2 out 0 3.18u\nR2 out 0 50\n.ac dec 50 100 100k\n.end"}, {"n": 100, "title": "LC delay line (4 sections, Z0 ≈ 32 Ω)", "desc": "The pulse arrives about 32 µs later per section.", "net": "* LC delay line\nV1 src 0 PULSE(0 1 0 1u 1u 200u 1m)\nR1 src a 32\nC1 a 0 1u\nL1 a b 1m\nC2 b 0 1u\nL2 b c 1m\nC3 c 0 1u\nL3 c d 1m\nC4 d 0 1u\nR2 d 0 32\n.tran 1u 500u\n.end"}]}];
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
/* ---- 555 modulation examples (AM, PAM, PWM, PPM, FM) ---- */
TOPICS[TOPICS.length-1].items.push({n:108,title:"555 Amplitude Modulation (AM): 50 kHz carrier, 1 kHz audio",desc:"A 555 astable makes a ~50 kHz carrier that switches Q1; the 1 kHz audio rides on the collector supply and an LC tank (≈50 kHz) removes the harmonics, leaving a clean AM envelope. Tick `v(mod_in)` and `v(am_out)`.",
 net:"* True Amplitude Modulation (AM) using NE555 Timer\n* Architecture: 555 Carrier (~50 kHz) + Transistor Modulator + LC Tank Filter\n\n.title NE555 Amplitude Modulation (Clean AM Envelope)\n\n* ==========================================\n* 1. POWER SUPPLY & MODULATING AUDIO SIGNAL\n* ==========================================\nVCC vcc 0 DC 9V\n\n* Modulating Signal: 1 kHz sine wave, 2V amplitude + 3.5V DC offset\n* (Offset keeps the transistor biased cleanly across the entire audio cycle)\nVMOD mod_in 0 SIN(3.5 2.0 1k)\n\n* ==========================================\n* 2. NE555 CARRIER OSCILLATOR (~50 kHz)\n* ==========================================\n* Pinout: GND TRIG OUT RESET CTRL THRESH DISCH VCC\nX1 0 trig out vcc ctrl thresh disch vcc NE555\n\n* Bypass capacitor on Pin 5 for clean carrier stability\nC_CTRL ctrl 0 10n\n\n* Timing components for ~50 kHz carrier\nR1 vcc disch 1k\nR2 disch thresh 1.3k\nC1 thresh 0 10n\nV_TRIG thresh trig DC 0\n\n* ==========================================\n* 3. AMPLITUDE MODULATOR & LC TANK FILTER\n* ==========================================\n* Base drive from 555 carrier switches Q1 ON and OFF at 50 kHz,\n* chopping the 1 kHz modulating signal at the collector.\nR_BASE out base 4.7k\nQ1 col base 0 Q2N2222\n\n* Collector pull-up to modulating signal\nR_COL mod_in col 1k\n\n* DC-blocking capacitor into LC Bandpass Tank (resonant at ~50 kHz)\n* f0 = 1 / (2 * pi * sqrt(1mH * 10nF)) = 50.3 kHz\nC_COUP col am_out 10n IC=3.5\nL_TANK am_out 0 1m IC=0\nC_TANK am_out 0 10n\nR_LOAD am_out 0 10k\n\n* ==========================================\n* 4. MODELS (2N2222 & PURE-ANALOG NE555)\n* ==========================================\n.MODEL Q2N2222 NPN(IS=14.34F BF=255.9 VAF=74.03 IKF=0.2847 ISE=14.34F NE=1.307 BR=6.092 RC=1 CJC=7.306P CJE=22.01P TR=46.91N TF=411.1P)\n\n.SUBCKT NE555 1 2 3 4 5 6 7 8\nR_DIV1 8 5 5k\nR_DIV2 5 ref_low 5k\nR_DIV3 ref_low 1 5k\n\nB_COMP_TH comp_r 1 V = { V(6) > V(5) ? 5 : 0 }\nB_COMP_TR comp_s 1 V = { V(2) < V(ref_low) ? 5 : 0 }\n\nB_NOR1 q_raw 1 V = { (V(comp_r) > 2.5 || V(q_bar) > 2.5) ? 0 : 5 }\nR_DEL1 q_raw q 10\nC_DEL1 q 1 1n\n\nB_NOR2 qb_raw 1 V = { (V(comp_s) > 2.5 || V(q) > 2.5) ? 0 : 5 }\nR_DEL2 qb_raw q_bar 10\nC_DEL2 q_bar 1 1n\n\nB_OUT 3 1 V = { (V(4) > 0.7 && V(q_bar) > 2.5) ? (V(8) - 1.2) : 0.1 }\n\nS_DISCH 7 1 q 1 SW_DISCH\n.MODEL SW_DISCH SW(RON=10 ROFF=100MEG VT=2.5 VH=0.1)\n.ENDS NE555\n\n* ==========================================\n* 5. SIMULATION & PLOTTING COMMANDS\n* ==========================================\n* Initial conditions (.ic): start values for the capacitors; L_TANK starts at 0 A (IC=0)\n* so the tank does not ring at t=0 and the AM envelope is clean from the first cycle\n.ic v(ctrl)=6 v(thresh)=0.08911 v(am_out)=0\n\n* Run 3ms (3 full cycles of the 1 kHz modulating wave)\n.tran 500n 3m 0 500n uic\n\n.control\n  run\n  * Plot AC-coupled modulating wave alongside the 50 kHz AM wave\n  plot (v(mod_in)-3.5) v(am_out) title 'NE555 Amplitude Modulation (50kHz Carrier, 1kHz Signal)' xlabel 'Time (s)' ylabel 'Voltage (V)'\n.endc\n\n.end"},
{n:109,title:"555 Pulse Amplitude Modulation (PAM)",desc:"A ~20 kHz 555 clock briefly turns Q1 off every ~46 µs so `pam_out` samples the 1 kHz message; pulse heights follow `v(msg)`.",
 net:"* True Pulse Amplitude Modulation (PAM) using NE555 Timer\n* Architecture: NE555 Narrow-Pulse Sampling Clock (~20 kHz) + Transistor Analog Switch\n\n.title NE555 Pulse Amplitude Modulation (True PAM)\n\n* ==========================================\n* 1. POWER SUPPLY & ANALOG MESSAGE SIGNAL\n* ==========================================\nVCC vcc 0 DC 9V\n\n* Message Signal: 1 kHz sine wave, 2V peak amplitude, shifted +3V DC\n* (Positive DC offset ensures PAM pulses stay unipolar 1V to 5V)\nVMSG msg 0 SIN(3.0 2.0 1k)\n\n* ==========================================\n* 2. NE555 SAMPLING CLOCK (~20 kHz, ~20% Duty Cycle)\n* ==========================================\n* Pinout: GND TRIG OUT RESET CTRL THRESH DISCH VCC\nX1 0 trig clk_out vcc ctrl thresh disch vcc NE555\n\n* Control pin bypass capacitor\nC_CTRL ctrl 0 10n\n\n* Timing components: R1 = 4.7k, R2 = 1k, C1 = 10n\n* Note: In standard astable mode, OUT is HIGH for t_H = 0.693*(R1+R2)*C1\n* and LOW for t_L = 0.693*R2*C1 (~7 us narrow LOW pulse every ~46 us)\nR1 vcc disch 4.7k\nR2 disch thresh 1k\nC1 thresh 0 10n\nV_TRIG thresh trig DC 0\n\n* ==========================================\n* 3. PAM SAMPLING SWITCH (SHUNT CHOPPER)\n* ==========================================\n* When 555 clk_out is HIGH (~7.8V), Q1 turns ON and clamps pam_out to ~0V.\n* When 555 clk_out goes LOW (~0.1V) for ~7us, Q1 turns OFF and pam_out\n* jumps directly to the instantaneous voltage of v(msg)!\nR_SERIES msg pam_out 1k\nQ1 pam_out base 0 Q2N2222\nR_BASE clk_out base 4.7k\nR_LOAD pam_out 0 100k\n\n* ==========================================\n* 4. MODELS (2N2222 & PURE-ANALOG NE555)\n* ==========================================\n.MODEL Q2N2222 NPN(IS=14.34F BF=255.9 VAF=74.03 IKF=0.2847 ISE=14.34F NE=1.307 BR=6.092 RC=1 CJC=7.306P CJE=22.01P TR=46.91N TF=411.1P)\n\n.SUBCKT NE555 1 2 3 4 5 6 7 8\nR_DIV1 8 5 5k\nR_DIV2 5 ref_low 5k\nR_DIV3 ref_low 1 5k\n\nB_COMP_TH comp_r 1 V = { V(6) > V(5) ? 5 : 0 }\nB_COMP_TR comp_s 1 V = { V(2) < V(ref_low) ? 5 : 0 }\n\nB_NOR1 q_raw 1 V = { (V(comp_r) > 2.5 || V(q_bar) > 2.5) ? 0 : 5 }\nR_DEL1 q_raw q 10\nC_DEL1 q 1 1n\n\nB_NOR2 qb_raw 1 V = { (V(comp_s) > 2.5 || V(q) > 2.5) ? 0 : 5 }\nR_DEL2 qb_raw q_bar 10\nC_DEL2 q_bar 1 1n\n\nB_OUT 3 1 V = { (V(4) > 0.7 && V(q_bar) > 2.5) ? (V(8) - 1.2) : 0.1 }\n\nS_DISCH 7 1 q 1 SW_DISCH\n.MODEL SW_DISCH SW(RON=10 ROFF=100MEG VT=2.5 VH=0.1)\n.ENDS NE555\n\n* ==========================================\n* 5. SIMULATION & PLOTTING COMMANDS\n* ==========================================\n.tran 500n 2m 0 500n\n\n.control\n  run\n  * Plot original analog message alongside the PAM pulse train\n  plot v(msg) v(pam_out) title 'NE555 Pulse Amplitude Modulation (True PAM)' xlabel 'Time (s)' ylabel 'Voltage (V)'\n.endc\n\n.end"},
{n:110,title:"555 Pulse Width Modulation (PWM): monostable + pin 5",desc:"A fixed 20 kHz trigger starts a one-shot whose width is set by the 1 kHz signal on CTRL (pin 5). Frequency is constant, duty cycle follows `v(ctrl)`.",
 net:"* True Pulse Width Modulation (PWM) using NE555 Timer\n* Architecture: Monostable One-Shot triggered by Fixed Clock + Analog Signal on Pin 5\n\n.title NE555 True Pulse Width Modulation (Constant Frequency PWM)\n\n* ==========================================\n* 1. POWER SUPPLY, CLOCK & MODULATING SIGNAL\n* ==========================================\nVCC vcc 0 DC 9V\n\n* Fixed-Frequency Sampling Clock: 20 kHz (Period = 50 us)\n* Short active-LOW trigger pulses (9V -> 0V for 2 us every 50 us)\nVCLK trig 0 PULSE(9 0 1u 50n 50n 2u 50u)\n\n* Modulating Analog Signal: 1 kHz sine wave centered at 5.5V, +/- 2.5V swing\n* (Swings Pin 5 between 3.0V and 8.0V to modulate pulse width from ~15% to ~85%)\nVMSG ctrl 0 SIN(5.5 2.5 1k)\n\n* ==========================================\n* 2. NE555 IN MONOSTABLE PWM MODE\n* ==========================================\n* Pinout: GND TRIG OUT RESET CTRL THRESH DISCH VCC\nX1 0 trig pwm_out vcc ctrl thresh disch vcc NE555\n\n* Timing Resistor and Capacitor (Nominal pulse width ~25 us at 20 kHz)\nR_T vcc thresh 2.2k\nC_T thresh 0 10n\n\n* Connect Discharge (Pin 7) to Threshold (Pin 6) for monostable timing\nV_DISCH disch thresh DC 0\n\n* Load resistor\nR_LOAD pwm_out 0 10k\n\n* ==========================================\n* 3. PURE-ANALOG NE555 SUBCIRCUIT MODEL\n* ==========================================\n.SUBCKT NE555 1 2 3 4 5 6 7 8\nR_DIV1 8 5 5k\nR_DIV2 5 ref_low 5k\nR_DIV3 ref_low 1 5k\n\nB_COMP_TH comp_r 1 V = { V(6) > V(5) ? 5 : 0 }\nB_COMP_TR comp_s 1 V = { V(2) < V(ref_low) ? 5 : 0 }\n\nB_NOR1 q_raw 1 V = { (V(comp_r) > 2.5 || V(q_bar) > 2.5) ? 0 : 5 }\nR_DEL1 q_raw q 10\nC_DEL1 q 1 1n\n\nB_NOR2 qb_raw 1 V = { (V(comp_s) > 2.5 || V(q) > 2.5) ? 0 : 5 }\nR_DEL2 qb_raw q_bar 10\nC_DEL2 q_bar 1 1n\n\nB_OUT 3 1 V = { (V(4) > 0.7 && V(q_bar) > 2.5) ? (V(8) - 1.2) : 0.1 }\n\nS_DISCH 7 1 q 1 SW_DISCH\n.MODEL SW_DISCH SW(RON=10 ROFF=100MEG VT=2.5 VH=0.1)\n.ENDS NE555\n\n* ==========================================\n* 4. SIMULATION & PLOTTING COMMANDS\n* ==========================================\n.tran 500n 2m 0 500n\n\n.control\n  run\n  * Plot modulating analog signal (Pin 5) alongside constant-frequency PWM output\n  plot v(ctrl) v(pwm_out) title 'NE555 True Pulse Width Modulation (20kHz PWM, 1kHz Signal)' xlabel 'Time (s)' ylabel 'Voltage (V)'\n.endc\n\n.end"},
{n:111,title:"555 Pulse Position Modulation (PPM): dual 555",desc:"Stage 1 makes PWM, a differentiator turns each falling edge into a trigger, and stage 2 emits fixed ~5 µs pulses whose position follows the signal.",
 net:"* True Pulse Position Modulation (PPM) using Dual NE555 Timers\n* Architecture: Stage 1 (Monostable PWM) -> Falling-Edge Differentiator -> Stage 2 (Monostable PPM)\n\n.title NE555 True Pulse Position Modulation (PPM)\n\n* ==========================================\n* 1. POWER SUPPLY, CLOCK & MODULATING SIGNAL\n* ==========================================\nVCC vcc 0 DC 9V\n\n* Fixed-Frequency Sampling Clock: 20 kHz (Period = 50 us)\nVCLK trig1 0 PULSE(9 0 1u 50n 50n 2u 50u)\n\n* Modulating Analog Signal: 1 kHz sine wave centered at 5.5V, +/- 2.5V swing\nVMSG ctrl1 0 SIN(5.5 2.5 1k)\n\n* ==========================================\n* 2. STAGE 1: NE555 PWM GENERATOR\n* ==========================================\n* Pinout: GND TRIG OUT RESET CTRL THRESH DISCH VCC\nX1 0 trig1 pwm_out vcc ctrl1 thresh1 disch1 vcc NE555\n\nR_T1 vcc thresh1 2.2k\nC_T1 thresh1 0 10n\nV_DISCH1 disch1 thresh1 DC 0\n\n* ==========================================\n* 3. FALLING-EDGE DIFFERENTIATOR & CLAMP\n* ==========================================\n* Differentiates pwm_out so its falling edge creates a negative trigger spike\n* below 1/3 VCC (3V) for Stage 2, while D_CLAMP clips positive spikes at VCC.\nC_DIFF pwm_out trig2 470p\nR_DIFF vcc trig2 4.7k\nD_CLAMP trig2 vcc D1N4148\n\n* ==========================================\n* 4. STAGE 2: NE555 FIXED-WIDTH PPM OUTPUT\n* ==========================================\nX2 0 trig2 ppm_out vcc ctrl2 thresh2 disch2 vcc NE555\n\n* Bypass Pin 5 on Stage 2 for fixed ~5 us output pulse width\n* t_pulse = 1.1 * R_T2 * C_T2 = 1.1 * 4.7k * 1n = 5.17 us\nC_CTRL2 ctrl2 0 10n\nR_T2 vcc thresh2 4.7k\nC_T2 thresh2 0 1n\nV_DISCH2 disch2 thresh2 DC 0\n\nR_LOAD ppm_out 0 10k\n\n* ==========================================\n* 5. MODELS (1N4148 & PURE-ANALOG NE555)\n* ==========================================\n.MODEL D1N4148 D(IS=2.52N RS=0.568 N=1.752 BV=100 IBV=100U CJO=4P TT=20N)\n\n.SUBCKT NE555 1 2 3 4 5 6 7 8\nR_DIV1 8 5 5k\nR_DIV2 5 ref_low 5k\nR_DIV3 ref_low 1 5k\n\nB_COMP_TH comp_r 1 V = { V(6) > V(5) ? 5 : 0 }\nB_COMP_TR comp_s 1 V = { V(2) < V(ref_low) ? 5 : 0 }\n\nB_NOR1 q_raw 1 V = { (V(comp_r) > 2.5 || V(q_bar) > 2.5) ? 0 : 5 }\nR_DEL1 q_raw q 10\nC_DEL1 q 1 1n\n\nB_NOR2 qb_raw 1 V = { (V(comp_s) > 2.5 || V(q) > 2.5) ? 0 : 5 }\nR_DEL2 qb_raw q_bar 10\nC_DEL2 q_bar 1 1n\n\nB_OUT 3 1 V = { (V(4) > 0.7 && V(q_bar) > 2.5) ? (V(8) - 1.2) : 0.1 }\n\nS_DISCH 7 1 q 1 SW_DISCH\n.MODEL SW_DISCH SW(RON=10 ROFF=100MEG VT=2.5 VH=0.1)\n.ENDS NE555\n\n* ==========================================\n* 6. SIMULATION & PLOTTING COMMANDS\n* ==========================================\n.tran 200n 2m 0 200n\n\n.control\n  run\n  * Plot modulating signal alongside fixed-width, position-modulated PPM pulses\n  plot v(ctrl1) v(ppm_out) title 'NE555 True Pulse Position Modulation (PPM)' xlabel 'Time (s)' ylabel 'Voltage (V)'\n  * Optional: Uncomment below to compare PWM (Stage 1) and PPM (Stage 2) together\n  * plot v(ctrl1) v(pwm_out) v(ppm_out)\n.endc\n\n.end"},
{n:112,title:"555 Frequency Modulation (FM): pin-5 VCO + LC filter",desc:"The audio signal drives CTRL (pin 5) so the 555 frequency sweeps around ~25 kHz; Q1 buffers it and an LC filter gives a smooth FM sine at `fm_out`.",
 net:"* Frequency Modulation (FM) using NE555 Timer\n* Architecture: 555 Pin-5 VCO + Q2N2222 Output Buffer + LC Sine Filter (0V DC)\n\n.title NE555 Frequency Modulation (Clean Sine FM)\n\n* ==========================================\n* 1. POWER SUPPLY & MODULATING AUDIO SIGNAL\n* ==========================================\nVCC vcc 0 DC 9V\n\n* Modulating Signal: 1 kHz sine wave, 2.2V amplitude + 6.0V DC offset (natural 2/3 VCC)\n* -90 deg phase starts at trough -> peak -> trough for Low -> High -> Low frequency\nVMOD mod_in 0 SIN(6.0 2.2 1k 0 0 -90)\n\n* ==========================================\n* 2. NE555 FREQUENCY MODULATED OSCILLATOR\n* ==========================================\n* Pinout: GND TRIG OUT RESET CTRL THRESH DISCH VCC\nX1 0 trig out vcc ctrl thresh disch vcc NE555\n\n* Feed modulating signal directly into Pin 5 (Control Voltage)\nR_MOD mod_in ctrl 100\nC_CTRL ctrl 0 1n\n\n* Timing components (sweeps ~12 kHz to ~48 kHz around ~25 kHz center)\nR1 vcc disch 1k\nR2 disch thresh 2.2k\nC1 thresh 0 10n\nV_TRIG thresh trig DC 0\n.ic v(thresh)=0\n\n* ==========================================\n* 3. Q2N2222 BUFFER & LC SINE WAVE FILTER\n* ==========================================\n* Q1 buffers the FM square wave from the 555 output\nR_BASE out base 4.7k\nQ1 col base 0 Q2N2222\nR_COL vcc col 1k\n\n* DC-blocking capacitor + Damped LC Low-Pass Filter (fc ≈ 55 kHz)\n* Converts FM square wave into a 0V-DC pure sine wave across all frequencies\nC_COUP col filt_in 1u\nR_FILT filt_in n1 1k\nL_FILT n1 fm_out 4.7m\nC_FILT fm_out 0 1.8n\nR_LOAD fm_out 0 1.5k\n\n* ==========================================\n* 4. MODELS (2N2222 & PURE-ANALOG NE555)\n* ==========================================\n.MODEL Q2N2222 NPN(IS=14.34F BF=255.9 VAF=74.03 IKF=0.2847 ISE=14.34F NE=1.307 BR=6.092 RC=1 CJC=7.306P CJE=22.01P TR=46.91N TF=411.1P)\n\n.SUBCKT NE555 1 2 3 4 5 6 7 8\nR_DIV1 8 5 5k\nR_DIV2 5 ref_low 5k\nR_DIV3 ref_low 1 5k\n\nB_COMP_TH comp_r 1 V = { V(6) > V(5) ? 5 : 0 }\nB_COMP_TR comp_s 1 V = { V(2) < V(ref_low) ? 5 : 0 }\n\nB_NOR1 q_raw 1 V = { (V(comp_r) > 2.5 || V(q_bar) > 2.5) ? 0 : 5 }\nR_DEL1 q_raw q 10\nC_DEL1 q 1 1n\n\nB_NOR2 qb_raw 1 V = { (V(comp_s) > 2.5 || V(q) > 2.5) ? 0 : 5 }\nR_DEL2 qb_raw q_bar 10\nC_DEL2 q_bar 1 1n\n\nB_OUT 3 1 V = { (V(4) > 0.7 && V(q) > 2.5) ? (V(8) - 1.2) : 0.1 }\n\nS_DISCH 7 1 q_bar 1 SW_DISCH\n.MODEL SW_DISCH SW(RON=10 ROFF=100MEG VT=2.5 VH=0.1)\n.ENDS NE555\n\n* ==========================================\n* 5. SIMULATION & PLOTTING COMMANDS\n* ==========================================\n* Run 3ms (3 full cycles of the 1 kHz modulating wave)\n.tran 500n 3m 0 500n\n\n.control\n  run\n  * Plot 0V-DC modulating wave alongside the 0V-DC FM sine wave\n  plot (v(mod_in)-6.0) v(fm_out) title 'NE555 Frequency Modulation (Pure Sine FM, 0V DC)' xlabel 'Time (s)' ylabel 'Voltage (V)'\n.endc\n\n.end"});
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
const ANIM={on:false,k:'',t0:0,spd:1,idx:null,f:0,raf:0},ZOOM={zx:1,wx:0,zy:1,wy:0},CUR={i:null};
const simSig=t=>String(t||'').split('\n').filter(l=>!/^\s*(plot|print|run|\.control|\.endc)\b/i.test(l)).join('\n').trim();
let RES=null,RUNSIG=null,PLOTSIG=null,TAB='op',simT,SIMLIVE=false;const PL={},SEL={dc:new Set(),ac:new Set(),tran:new Set()};
const T=tx,COL=['#2b8fd6','#e8590c','#2f9e44','#ae3ec9','#f08c00','#1098ad','#d6336c','#5c7cfa'];
const col=(tr,arr)=>Array.from(arr,x=>tr.f(i=>x[i]));
function ticks(lo,hi,n){const r=hi-lo||1,s0=r/n,p=Math.pow(10,Math.floor(Math.log10(s0))),f=s0/p,st=(f<1.5?1:f<3?2:f<7?5:10)*p,o=[];for(let v=Math.ceil(lo/st-1e-9)*st;v<=hi+st*1e-9;v+=st)o.push(+v.toPrecision(12));return o}
function plot(o,id){
  o.id=id;PL[id]=o;const W=720,H=o.H||230,L=64,Rr=12,Tp=10,B=34,pw=W-L-Rr,ph=H-Tp-B,xs=o.xs,fx=o.xlog?Math.log10:v=>v;
  let x0=fx(xs[0]),x1=fx(xs[xs.length-1]);if(x1===x0)x1=x0+1;
  let lo=Infinity,hi=-Infinity;o.series.forEach(s=>s.ys.forEach(v=>{if(isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v)}}));
  if(!isFinite(lo)){lo=0;hi=1}if(hi-lo<1e-9*Math.max(1,Math.abs(hi))){const c=Math.max(1,Math.abs(hi))*.1;lo-=c;hi+=c}
  const pd=(hi-lo)*.06;lo-=pd;hi+=pd;
  { /* zoom window (shared ZOOM state): fractions of the full x / y range */
    const fx0=x0,fx1=x1,fl=lo,fh=hi,zx=ZOOM.zx,zy=ZOOM.zy,wx=Math.min(ZOOM.wx,1-1/zx),wy=Math.min(ZOOM.wy,1-1/zy);
    x0=fx0+(fx1-fx0)*wx;x1=fx0+(fx1-fx0)*(wx+1/zx);lo=fl+(fh-fl)*wy;hi=fl+(fh-fl)*(wy+1/zy)}
  const X=v=>L+(fx(v)-x0)/(x1-x0)*pw,Y=v=>Tp+(1-(v-lo)/(hi-lo))*ph;let g='';
  ticks(lo,hi,5).forEach(v=>{g+=`<path d="M${L} ${Y(v)}H${W-Rr}" stroke="var(--grid)"/>`+T(L-6,Y(v)+4,eng(v),{a:'end',s:10.5,c:'var(--mut)'})});
  if(lo<0&&hi>0)g+=`<path class="zl" d="M${L} ${Y(0)}H${W-Rr}" fill="none" stroke="var(--mut)" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`; /* zero line: separates positive / negative wave */
  const xt=o.xlog?(()=>{const a=[];for(let e=Math.ceil(x0-1e-9);e<=x1+1e-9;e++)a.push(Math.pow(10,e));return a.length>=2?a:ticks(Math.pow(10,x0),Math.pow(10,x1),5)})():ticks(x0,x1,6);
  xt.forEach(v=>{g+=`<path d="M${X(v)} ${Tp}V${Tp+ph}" stroke="var(--grid)"/>`+T(X(v),H-B+14,eng(v),{s:10.5,c:'var(--mut)'})});
  g+=`<clipPath id="cp-${id}"><rect x="${L}" y="${Tp}" width="${pw}" height="${ph}"/></clipPath><g clip-path="url(#cp-${id})">`;
  o.X=X;o.Y=Y;o.series.forEach((s,si)=>{let d='';s.ys.forEach((v,i)=>{if(isFinite(v))d+=(d?'L':'M')+X(xs[i]).toFixed(1)+' '+Y(v).toFixed(1)});g+=`<path class="ln" data-i="${si}" d="${d}" fill="none" stroke="${s.c}" stroke-width="1.8" stroke-linejoin="round"/>`});
  g+='</g>';
  g+=`<path d="M${L} ${Tp}V${Tp+ph}H${W-Rr}" fill="none" stroke="var(--mut)"/>`+T(L+pw/2,H-4,o.xl,{s:11,c:'var(--mut)'})+`<text transform="translate(12 ${Tp+ph/2}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--mut)">${esc(o.yl)}</text>`;
  return `<div class="plot" data-id="${id}"><svg viewBox="0 0 ${W} ${H}" data-geom="${[L,pw,x0,x1,Tp,ph].join(',')}" style="position:static;width:100%;height:auto;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none">${g}<path class="xh" d="" stroke="var(--mut)" stroke-dasharray="3 3"/><g clip-path="url(#cp-${id})"><path class="ph" d="" stroke="var(--accent)" stroke-width="1.4"/><g class="dots"></g><g class="cdots"></g></g></svg><div class="rd">&nbsp;</div></div>`}
/* traces named by the plot / print line(s) inside .control ... .endc of the netlist (null-safe) */
const CTL_OPT=/\s(title|xlabel|ylabel|xlimit|ylimit|xdelta|ydelta|xindices|xcompress|xlog|ylog|loglog|vs|samep|linplot|retraceplot|combplot|nogrid|nointerp|polar|smith|gridsize|pointplot|ps|hcopy|col|line|all|width)\b/i;
function ctlLines(text){let ctl=0;const o=[];String(text||'').split('\n').forEach((l,i)=>{const s=l.trim();
  if(/^\.control\b/i.test(s)){ctl=1;return}if(/^\.endc\b/i.test(s)){ctl=0;return}
  if(!ctl)return;const m=/^(\s*)(plot|print)\b(.*)$/i.exec(l);if(m)o.push({i,ind:m[1],cmd:m[2],rest:m[3]})});return o}
function ctlTraces(trs){const el=document.getElementById('src');if(!el)return[];const out=[],seen=new Set();
  ctlLines(el.value).forEach(L=>{const body=L.rest.split(CTL_OPT)[0],re=/\b(vdb|vm|vp|vr|vi|v|i)\(\s*([^()\s,]+)\s*\)/gi;let m;
    while((m=re.exec(body))){const nm=(m[1].toLowerCase()==='i'?'i':'v')+'('+m[2].toLowerCase()+')',t=trs.find(x=>x.name.toLowerCase()===nm);if(t&&!seen.has(t.name)){seen.add(t.name);out.push(t)}}});return out}
const trCol=(kind,trs,t)=>{const S=SEL[kind];return S.has(t.name)?COL[trs.filter(x=>S.has(x.name)).indexOf(t)%8]:COL[trs.indexOf(t)%8]};
function chips(kind,R){const trs=R.tr,S=SEL[kind],sig=trs.map(t=>t.name).join();
  if(S.sig!==sig){S.sig=sig;S.clear();const cw=ctlTraces(trs);
    if(cw.length)cw.forEach(t=>S.add(t.name));else trs.filter(t=>t.k==='v').slice(0,kind==='ac'?2:4).forEach(t=>S.add(t.name))}
  return `<div class="chips">`+trs.map((t,i)=>`<label class="tr"><input type="checkbox" data-k="${kind}" value="${esc(t.name)}" ${S.has(t.name)?'checked':''}><i style="background:${trCol(kind,trs,t)}"></i>${esc(t.name)}</label>`).join('')+'</div>'}
function opHTML(R){const C=R.C,x=R.op.x,rows=R.rows;
  return `<div class="two"><table><tr><th>Node</th><th>Voltage</th></tr>${Object.keys(C.idx).map(n=>`<tr><td>v(${esc(n)})</td><td>${eng(x[C.idx[n]])}V</td></tr>`).join('')}</table>
  <table><tr><th>Element</th><th>V across</th><th>I into n1</th><th>P absorbed</th></tr>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${eng(r[1])}V</td><td>${eng(r[2])}A</td><td>${eng(r[3])}W</td></tr>`).join('')}</table></div>`}
function showTab(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',!!RES&&b.dataset.t===TAB));   /* output OFF (no result): no analysis button is selected */
  const R=RES,o=$('#out'),S=$('#simst');if(!R){o.innerHTML='';S.innerHTML='';return}
  S.innerHTML=(R.errs.length?`<span class="er">${R.errs.map(esc).join(' · ')}</span>`:`<span class="ok">✓ ${['op','dc','ac','tran'].filter(k=>R[k]).join(' · ')} · ${R.ms.toFixed(0)} ms</span>`)+R.warn.map(w=>` <span class="wn">⚠ ${esc(w)}</span>`).join('');
  if(!R.op){o.innerHTML='';return}
  let h='';const K=TAB;
  if(K==='op')h=opHTML(R);
  else if(!R[K])h=`<p class="hint">No ${{dc:'.dc',ac:'.ac',tran:'.tran'}[K]} analysis in the netlist — pick one from <b>＋ Analysis</b> above the editor, or type the dot-command.</p>`;
  else{const tr=R.tr,cl=t=>trCol(K,tr,t);h=chips(K,R);const sl=tr.filter(t=>SEL[K].has(t.name));
    if(!sl.length)h+='<p class="hint">Tick a trace above.</p>';
    else if(K==='dc'){const d=R.dc;h+=plot({xs:d.xs,series:sl.map(t=>({name:t.name,ys:col(t,d.X),c:cl(t),u:t.k==='i'?'A':'V'})),xl:d.src+(d.cur?' (A)':' (V)'),yl:'V / A'},'dc')}
    else if(K==='tran'){const d=R.tran;h+=plot({xs:d.t,series:sl.map(t=>({name:t.name,ys:col(t,d.X),c:cl(t),u:t.k==='i'?'A':'V'})),xl:'time (s)',yl:'V / A'},'tr')}
    else{const a=R.ac,lg=a.type!=='lin',S2=sl.map(t=>{const re=col(t,a.re),im=col(t,a.im);return{name:t.name,c:cl(t),db:re.map((r,i)=>20*Math.log10(Math.max(Math.hypot(r,im[i]),1e-30))),ph:re.map((r,i)=>Math.atan2(im[i],r)*180/Math.PI)}});
      h+=plot({xs:a.f,xlog:lg,series:S2.map(s=>({name:s.name,ys:s.db,c:s.c,u:' dB'})),xl:'frequency (Hz)',yl:'magnitude (dB)'},'am');
      const s0=S2[0],ref=s0.db[0],j=s0.db.findIndex((v,i)=>i>0&&v<=ref-3);
      if(j>0){const f=Math.pow(10,Math.log10(a.f[j-1])+(ref-3-s0.db[j-1])/(s0.db[j]-s0.db[j-1])*(Math.log10(a.f[j])-Math.log10(a.f[j-1])));h+=`<p class="hint">−3 dB below the low-frequency level of ${esc(s0.name)} at ≈ <b>${eng(f)}Hz</b></p>`}
      h+=plot({xs:a.f,xlog:lg,series:S2.map(s=>({name:s.name,ys:s.ph,c:s.c,u:'°'})),xl:'frequency (Hz)',yl:'phase (°)'},'ap')}}
  o.innerHTML=h;if(ANIM.on&&ANIM.idx!=null)paintAll(ANIM.idx);if(CUR.i!=null)paintCursor(CUR.i)}
const CTL_MSG='Please use plot/print using + Analysis in Editable NGSpice Tab';
/* the simulation runs only when the NGSpice code has a .control block with a plot / print line */
const hasCtl=t=>ctlLines(t).length>0;
function runSimUI(){stopAnim(true);hideTip();
  if(window.SWUI&&SWUI.offGuard())return;   /* power switch OFF: nothing runs */
  if(!hasCtl(($('#src')||{}).value)){RES=null;RUNSIG=null;showTab();$('#simst').innerHTML=`<span class="er">${esc(CTL_MSG)}</span>`;$('#out').innerHTML=`<p class="empty">${esc(CTL_MSG)}</p>`;toast(CTL_MSG);return}
  const t0=performance.now();let R;
  if(S.P.errs.length)R={errs:['Fix the netlist errors first (see Netlist tab)'],warn:[]};
  else try{R=runSim(S.P)}catch(err){R={errs:['Simulator error: '+err.message],warn:[]}}
  R.ms=performance.now()-t0;RES=R;RUNSIG=simSig(($('#src')||{}).value);{const ps=ctlLines(($('#src')||{}).value).map(x=>x.cmd+x.rest).join('\n');if(ps!==PLOTSIG){PLOTSIG=ps;Object.keys(SEL).forEach(k=>{SEL[k].sig=null})}}if(S.pickTab&&R.op){S.pickTab=false;TAB=['tran','ac','dc'].find(k=>R[k])||'op'}if(R.op&&TAB!=='op'&&!R[TAB])TAB='op';showTab()}
const schedSim=()=>{if($('#auto').checked){clearTimeout(simT);simT=setTimeout(runSimUI,150)}};
/* plot hover readout */
$('#out').addEventListener('change',e=>{const c=e.target.closest('input[data-k]');if(!c)return;const S=SEL[c.dataset.k];c.checked?S.add(c.value):S.delete(c.value);showTab();syncPlotCode(c.dataset.k)});
/* Ticking a trace rewrites the plot / print line(s) of the NGSpice code (v(x) -> i(R2) ...) and asks for a re-run */
function syncPlotCode(kind){const el=document.getElementById('src');if(!el||!RES||!RES.tr)return;
  const sel=RES.tr.filter(t=>SEL[kind].has(t.name));if(!sel.length)return;
  const vec=sel.map(t=>kind==='ac'?(t.k==='i'?'db('+t.name+')':'vdb('+t.name.slice(2,-1)+')'):t.name).join(' ');
  let ls=el.value.split('\n');const L=ctlLines(el.value);
  if(L.length){L.forEach(x=>{const opt=x.rest.split(CTL_OPT),first=opt[0],tail=x.rest.slice(first.length);ls[x.i]=x.ind+x.cmd+' '+vec+tail})}
  else{const ci=ls.findIndex(l=>/^\s*\.control\b/i.test(l)),ei=ls.findIndex(l=>/^\s*\.endc\b/i.test(l));
    if(ci>=0&&ei>ci)ls.splice(ei,0,'  plot '+vec);
    else{const end=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l)),blk=['.control','  run','  plot '+vec,'.endc'];end>=0?ls.splice(end,0,...blk):ls.push(...blk)}}
  const t=ls.join('\n');if(t===el.value)return;
  /* keep the caret on the same line / column and keep the scroll position, so editing continues where it was */
  const old=el.value,a=el.selectionStart,b=el.selectionEnd,sT=el.scrollTop,sL=el.scrollLeft,
    lc=o=>{const h=old.slice(0,o).split('\n');return[h.length-1,h[h.length-1].length]};
  const [al,ac]=lc(a),[bl,bc]=lc(b),pos=(l,c)=>{const q=t.split('\n');l=Math.min(l,q.length-1);let o=0;for(let i=0;i<l;i++)o+=q[i].length+1;return o+Math.min(c,q[l].length)};
  /* extra lines inserted above the caret (new .control block) shift it down by the same amount */
  const grow=t.split('\n').length-old.split('\n').length,firstNew=ls.findIndex((x,i)=>x!==old.split('\n')[i]);
  const sh=l=>(grow>0&&firstNew>=0&&l>=firstNew)?l+grow:l;
  el.value=t;try{el.setSelectionRange(pos(sh(al),ac),pos(sh(bl),bc))}catch(_){}
  el.scrollTop=sT;el.scrollLeft=sL;
  PLOTSIG=ctlLines(t).map(x=>x.cmd+x.rest).join('\n');
  S_P_refresh()}
function S_P_refresh(){try{S.P=parse(src.value);gutter();showErrs(S.P)}catch(_){}}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b){TAB=b.dataset.t;zoomReset(true);hideTip();if(ANIM.on&&RES&&RES.op&&RES[TAB])startAnim(TAB);else{stopAnim(true);showTab()}}};
$('#bRun').onclick=runSimUI;
$('#auto').onchange=e=>{if(e.target.checked)schedSim()};

/* app.js — schematic editor UI: palette, canvas interactions, inspector, netlist sync, examples */
const svg=$('#svg'),scene=$('#scene'),over=$('#over'),src=$('#src');
TOPICS.push({topic:'Waveform Sources (Triangle, Sawtooth, Noise)',items:[
{n:130,title:'Triangle wave through an RC low-pass',desc:'`TRI(vo va freq td phase)`: 1 kHz triangle, 1 V amplitude. The RC (fc ≈ 1.6 kHz) rounds the corners; plot `v(in)` and `v(out)` in the Transient tab.',
 net:exNet(['* Triangle into RC low-pass','V1 in 0 TRI(0 1 1k) AC 1','R1 in out 1k','C1 out 0 100n','.tran 10u 3m'])},
{n:131,title:'Sawtooth wave into a diode clipper',desc:'`SAW(vo va freq td phase)`: ramps from vo-va to vo+va each period. The diode clips the positive ramp near 0.6 V.',
 net:exNet(['* Sawtooth diode clipper','V1 in 0 SAW(0 2 1k)','R1 in out 1k','D1 out 0 DX','.model DX D(Is=2.52n N=1.75)','.tran 10u 3m'])},
{n:132,title:'Noise source through an RC low-pass',desc:'`NOISE(vo vrms rate seed)`: repeatable gaussian noise, new random value every 1/rate seconds. The RC (fc ≈ 1.6 kHz) removes the fast part of the noise.',
 net:exNet(['* White noise into RC low-pass','VN in 0 NOISE(0 0.5 200k 1)','R1 in out 1k','C1 out 0 100n','.tran 5u 5m'])},
{n:133,title:'Noisy sine cleaned by an RC filter',desc:'A 1 kHz sine plus noise (two sources in series). `v(in)` is noisy; `v(out)` after the RC is much cleaner.',
 net:exNet(['* Noisy sine + RC filter','VS a 0 SIN(0 1 1k)','VN in a NOISE(0 0.3 200k 3)','R1 in out 470','C1 out 0 100n','.tran 5u 4m'])}]});
/* ---- topic 1: Simple Circuit Examples (LED / Bulb / Fan on DC and AC sources, each with an Ammeter and a Voltmeter) ----
   LED model: red, Vf ≈ 1.8 V at 10 mA (same table as live-effects.js).  Bulb = RBULBn, Fan = RFANn (resistive loads, shown live).
   Ammeter = VAMn (0 V series source, reads current pin 1 -> 2), Voltmeter = RVMn (10 MΩ across the part, reads v(pin1) - v(pin2)).
   AC examples carry a .tran so the lamp / LED / fan visibly blink or pulse while Run is on. The LED lights only while it is
   forward-biased (positive half-cycle) and is dark while reverse-biased (negative half-cycle) - no Flip button needed. */
{const LEDM='.model RED_LED D(Is=7.58e-18 N=2)';
const AC='SIN(0 12 50)',TR='.tran 0.2m 80m';
TOPICS.unshift({topic:'Simple Circuit Examples',items:[
{n:0,title:'LED in DC source',desc:'5 V battery -> ammeter -> 330 Ω resistor -> red LED. Forward-biased, so the LED stays ON. The ammeter reads about 9.7 mA and the voltmeter across the LED reads about 1.8 V. Flip the LED (or the battery) and it goes OFF.',
 net:exNet(['* LED in DC source','V1 1 0 DC 5','VAM1 1 2 DC 0','R1 2 a 330','D1 a 0 RED_LED','RVM1 a 0 10meg',LEDM,'.op','.dc V1 0 5 0.1'])},
{n:0,title:'LED in AC source',desc:'5 V peak, 50 Hz AC source with an ammeter and a voltmeter across the LED. The LED is forward-biased on the positive half-cycle (ON, about 1.8 V) and reverse-biased on the negative half-cycle (OFF), so it blinks. No Flip is needed.',
 net:exNet(['* LED in AC source','V1 in 0 SIN(0 5 50)','VAM1 in 2 DC 0','R1 2 a 330','D1 a 0 RED_LED','RVM1 a 0 10meg',LEDM,TR])},
{n:0,title:'Bulb in DC source',desc:'12 V battery -> ammeter -> 24 Ω bulb (6 W). Steady DC voltage, so the bulb glows at constant full brightness; the ammeter reads 0.5 A and the voltmeter 12 V.',
 net:exNet(['* Bulb in DC source','V1 1 0 DC 12','VAM1 1 2 DC 0','RBULB1 2 0 24','RVM1 2 0 10meg','.op','.dc V1 0 12 0.5'])},
{n:0,title:'Bulb in AC source',desc:'12 V peak, 50 Hz AC -> ammeter -> 24 Ω bulb, voltmeter across the bulb. Brightness follows v², so the bulb pulses on both half-cycles (twice per cycle) while the meters swing positive and negative.',
 net:exNet(['* Bulb in AC source','V1 in 0 '+AC,'VAM1 in 2 DC 0','RBULB1 2 0 24','RVM1 2 0 10meg',TR])},
{n:0,title:'Fan in DC source',desc:'12 V battery -> ammeter -> 120 Ω fan winding. Constant DC voltage, so the fan spins at a constant speed, clockwise; the ammeter reads 0.1 A and the voltmeter 12 V. Flip the battery (or the fan): the polarity reverses and the fan spins anticlockwise.',
 net:exNet(['* Fan in DC source','V1 1 0 DC 12','VAM1 1 2 DC 0','RFAN1 2 0 120','RVM1 2 0 10meg','.op','.dc V1 0 12 0.5'])},
{n:0,title:'Fan in AC source',desc:'12 V peak, 50 Hz AC -> ammeter -> 120 Ω fan winding, voltmeter across the fan. This is a DC fan, so it follows the changing polarity: clockwise on the positive half-cycle, anticlockwise on the negative half-cycle, speed rising and falling with the voltage. Flipped or not, it moves in both directions.',
 net:exNet(['* Fan in AC source','V1 in 0 '+AC,'VAM1 in 2 DC 0','RFAN1 2 0 120','RVM1 2 0 10meg',TR])},
{n:0,title:'Fan, LED, Bulb in DC source',desc:'12 V DC battery feeds a Bulb, a Fan and an LED (with a 1 kΩ resistor) in parallel. The fan spins clockwise (flip the battery and it spins anticlockwise). The voltmeter reads the 12 V supply and the ammeter the total current (about 0.61 A). All three stay on steadily.',
 net:exNet(['* Fan, LED, Bulb in DC source','V1 1 0 DC 12','RVM1 1 0 10meg','VAM1 1 2 DC 0','RBULB1 2 0 24','RFAN1 2 0 120','R1 2 a 1k','D1 a 0 RED_LED',LEDM,'.op','.dc V1 0 12 0.5'])},
{n:0,title:'Fan, LED, Bulb in AC source',desc:'12 V peak, 50 Hz AC feeds a Bulb, a Fan and an LED (with a 1 kΩ resistor) in parallel. The voltmeter reads the supply and the ammeter the total current. The Bulb pulses with |v|; the Fan runs both ways (clockwise / anticlockwise, it is a DC fan); the LED blinks, ON only on the positive half-cycle.',
 net:exNet(['* Fan, LED, Bulb in AC source','V1 in 0 '+AC,'RVM1 in 0 10meg','VAM1 in 2 DC 0','RBULB1 2 0 24','RFAN1 2 0 120','R1 2 a 1k','D1 a 0 RED_LED',LEDM,TR])}
,
{n:0,title:'Short circuit (wire loop across the battery)',desc:'Both terminals of battery V1 are on the same wire (net a), so the wire loop around the battery has no resistance: a dead short. The loop is drawn in RED, a red warning appears under the schematic, and Run reports "Short circuit". Fix: remove the loop wire and put a load (bulb, resistor) between the battery terminals.',
 net:exNet(['* Short circuit: wire loop across the battery','V1 a a DC 12','RBULB1 a 0 24','.op'])}
]})}

const S={M:newModel(),P:null,sel:new Set(),selW:null,selNet:null,tool:'select',armed:null,armV:null,gr:0,gm:0,hist:[],fut:[],vb:{x:-100,y:-60,w:1000,h:600},mouse:{x:0,y:0,gx:0,gy:0,in:false},wire:null,drag:null,pan:null,sig:'',touched:false,pickTab:false,desc:'',lastKey:'',lastT:0};
const PAL=[{k:'R',g:'Passive'},{k:'C',g:'Passive'},{k:'Cp',g:'Passive'},{k:'L',g:'Passive'},{k:'BULB',g:'Passive'},{k:'FAN',g:'Passive'},{k:'BUZ',g:'Passive'},
 {k:'V',g:'Sources',n:'DC source'},{k:'V',g:'Sources',n:'Sine source',v:'SIN(0 1 1k) AC 1'},{k:'V',g:'Sources',n:'Pulse source',v:'PULSE(0 5 0 1n 1n 0.5m 1m)'},{k:'V',g:'Sources',n:'Triangle source',v:'TRI(0 1 1k) AC 1'},{k:'V',g:'Sources',n:'Sawtooth source',v:'SAW(0 1 1k) AC 1'},{k:'V',g:'Sources',n:'Noise source',v:'NOISE(0 0.2 200k 1)'},{k:'I',g:'Sources'},{k:'AM',g:'Measurement'},{k:'VM',g:'Measurement'},
 {k:'D',g:'Semiconductors'},{k:'ZEN',g:'Semiconductors'},{k:'LED',g:'Semiconductors'},{k:'QN',g:'Semiconductors'},{k:'QP',g:'Semiconductors'},{k:'MN',g:'Semiconductors'},{k:'MP',g:'Semiconductors'},{k:'MN4',g:'Semiconductors'},{k:'MP4',g:'Semiconductors'},
 {k:'OA',g:'Active'},{k:'EV',g:'Active'},{k:'GV',g:'Active'},{k:'V',g:'Sources',n:'Logic input A (10 µs)',v:'PULSE(0 5 0 1n 1n 5u 10u)'},{k:'V',g:'Sources',n:'Logic input B (20 µs)',v:'PULSE(0 5 0 1n 1n 10u 20u)'},
 {k:'NE555',g:'ICs'},{k:'G_INV',g:'CMOS logic gates'},{k:'G_BUF',g:'CMOS logic gates'},{k:'G_AND2',g:'CMOS logic gates'},{k:'G_NAND2',g:'CMOS logic gates'},{k:'G_OR2',g:'CMOS logic gates'},{k:'G_NOR2',g:'CMOS logic gates'},{k:'G_XOR2',g:'CMOS logic gates'},{k:'G_XNOR2',g:'CMOS logic gates'},{k:'G_AND3',g:'CMOS logic gates'},{k:'G_NAND3',g:'CMOS logic gates'},{k:'G_OR3',g:'CMOS logic gates'},{k:'G_NOR3',g:'CMOS logic gates'},
 {k:'SW',g:'Switches & relays'},{k:'SWM',g:'Switches & relays'},{k:'DPDT',g:'Switches & relays'},{k:'SVC',g:'Switches & relays'},{k:'RLY',g:'Switches & relays'},{k:'RLY2',g:'Switches & relays'},
 {k:'XFMR',g:'Transformers'},{k:'XFMRC',g:'Transformers'},
 {k:'GND',g:'Nets & ground'},{k:'LBL',g:'Nets & ground'}];
const ALT={D:['D','ZEN','LED'],ZEN:['D','ZEN','LED'],LED:['D','ZEN','LED'],C:['C','Cp'],Cp:['C','Cp'],MN:['MN','MN4'],MN4:['MN','MN4'],MP:['MP','MP4'],MP4:['MP','MP4']};
['G_AND2','G_NAND2','G_OR2','G_NOR2','G_XOR2','G_XNOR2'].forEach((k,_,a)=>ALT[k]=a);['G_AND3','G_NAND3','G_OR3','G_NOR3'].forEach((k,_,a)=>ALT[k]=a);ALT.G_INV=ALT.G_BUF=['G_INV','G_BUF'];
const PRE={V:['PULSE(0 5 0 1n 1n 5u 10u)','PULSE(0 5 0 1n 1n 10u 20u)','DC 5','DC 12','AC 1','SIN(0 1 1k)','SIN(0 1 1k) AC 1','PULSE(0 5 0 1n 1n 0.5m 1m)','PWL(0 0 1m 5 2m 0)','TRI(0 1 1k) AC 1','SAW(0 1 1k) AC 1','NOISE(0 0.2 200k 1)'],I:['DC 1m','AC 1m','SIN(0 1m 1k)','PULSE(0 1m 0 1n 1n 0.5m 1m)']};
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
function showShort(sc){try{const st=document.querySelector('.canvas-wrap .status');if(!st)return;let el=document.getElementById('sShort');
    if(!el){el=document.createElement('span');el.id='sShort';el.style.cssText='color:#ee2b2b;font-weight:700;margin-left:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';const h=document.getElementById('sHint');h&&h.parentNode===st?h.after(el):st.insertBefore(el,st.firstChild)}
    el.textContent=sc.nets.size?'⚠ Short circuit: '+sc.names.join(', ')+' (red wires)':'';el.title=sc.nets.size?shortMsg(sc):''}catch(_){}}
function draw(){const SC=shortCircuit(S.P);scene.innerHTML=drawScene(S.M,{sel:S.sel,selW:S.selW,selNet:S.selNet,short:SC.nets});drawOver();showShort(SC);
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
/* typing a model name key by key (R, RE, RED, RED_L ...) used to leave one auto-made .model line per keystroke:
   drop the previous auto-made line when it is untouched (still the default body) and no other part uses that name */
function dropAutoModel(M,p,old){const D=SYMS[p.t];if(!D||!D.mdl||!old)return;const nm=(p.v||'').split(/\s+/)[0];if(!nm||old.toLowerCase()===nm.toLowerCase())return;
  if(M.parts.some(q=>SYMS[q.t]&&SYMS[q.t].mdl&&(q.v||'').split(/\s+/)[0].toLowerCase()===old.toLowerCase()))return;
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),re=new RegExp('^\\.model\\s+'+esc(old)+'\\s+'+esc(D.mdl)+'\\s*$','i');
  const i=M.dirs.findIndex(d=>re.test(d.trim()));if(i>=0)M.dirs.splice(i,1)}
function mutate(fn,key,keep){const now=Date.now();if(!(key&&key===S.lastKey&&now-S.lastT<900)){S.hist.push(JSON.stringify(S.M));if(S.hist.length>120)S.hist.shift()}S.fut=[];S.lastKey=key||'';S.lastT=now;fn();afterEdit(keep)}
/* ---------- automatic initial conditions (.ic) ----------
   * every capacitor gets a start voltage:  .ic v(node)=value
       value = the capacitor's own IC= if it has one;
               else, in a circuit with active parts (transistor, op-amp, 555, gate ...) the DC operating-point voltage (bias point);
               else 0 V (passive circuit: you see the capacitor charge from empty).
     A capacitor with no grounded side (floating) gets IC=value on its own line, because .ic can only name a node.
     A capacitor inside a .subckt gets IC=0 on its own line.
   * an inductor gets  IC=0  on its own line only when it needs one: its DC operating-point current is not zero, so without
     it the transient would just start from that steady state.  (ngspice has no ".ic i(L1)=", inductor current is the IC= of L.)
   * .tran gets  uic  so ngspice really starts from these values.
   Existing .ic nodes / IC= values are never overwritten, running it twice changes nothing. */
function autoIC(text){
  text=String(text==null?'':text);const P=parse(text);if(P.errs.length)return text;
  const ls=text.replace(/\r\n?/g,'\n').replace(/\s+$/,'').split('\n'),icOf=e=>{const q=/\bic\s*=\s*([^\s;$]+)/i.exec(e.tail||'');return q?q[1]:null};
  const caps=P.els.filter(e=>e.k==='C'),inds=P.els.filter(e=>e.k==='L');
  /* capacitors written inside .subckt blocks (P.els only has the top level) */
  const subC=[];{let d=0;ls.forEach((l,i)=>{const t=l.trim();if(/^\.subckt\b/i.test(t)){d++;return}if(/^\.ends\b/i.test(t)){d=Math.max(0,d-1);return}
    if(d>0&&/^c\S*\s/i.test(t)&&!/\bic\s*=/i.test(t))subC.push(i)})}
  if(!caps.length&&!inds.length&&!subC.length)return text;
  const have=new Set();P.dirs.forEach(d=>{if(/^\.ic\b/i.test(d)){const re=/v\(\s*([^)\s]+)\s*\)/gi;let q;while((q=re.exec(d)))have.add(gnd(q[1]))}});
  const addTail=(li,v)=>{const m=/^(.*?)(\s*[;$].*)?$/.exec(ls[li]);ls[li]=m[1].replace(/\s+$/,'')+' IC='+v+(m[2]||'');return true};
  const setIC=(e,v)=>addTail(e.line+e.span-1,v);
  /* DC operating point: bias values for active circuits, and the inductors that carry a DC current */
  const active=P.els.some(e=>'QMEGBXD'.includes(e.k));let X=null,CC=null;
  if(active||inds.length){try{const R={errs:[],warn:[]};CC=compile(parse(text),R);if(!R.errs.length){X=op(CC,{g:{},sc:1})}}catch(_){X=null}}
  const vOf=n=>{if(!X||!CC||n==='0')return 0;const i=CC.idx[n];return i==null?0:X[i]},
    fmt=v=>Math.abs(v)<1e-6?'0':String(+v.toPrecision(4));
  const add=[],seen=new Set();let edited=false;
  caps.forEach(e=>{
    const a=gnd(e.nodes[0]),b=gnd(e.nodes[1]),iv=icOf(e);if(a==='0'&&b==='0')return;
    const dv=active&&X?fmt(vOf(a)-vOf(b)):'0';
    if(a!=='0'&&b!=='0'){if(iv==null)edited=setIC(e,dv);return}
    const raw=b==='0'?e.nodes[0]:e.nodes[1],n=gnd(raw);if(have.has(n)||seen.has(n))return;seen.add(n);
    let v=iv!=null?iv:dv;if(iv!=null&&a==='0'&&v!=='0')v=v[0]==='-'?v.slice(1):'-'+v;   /* + side is the 2nd node: v(n) = -IC */
    add.push(`v(${raw})=${v}`)});
  subC.forEach(i=>{edited=addTail(i,'0')});
  if(inds.length&&X){const need=new Set();CC.devs.forEach(d=>{if(d.t==='L'&&Math.abs(X[d.k])>1e-9)need.add(String(d.nm).toLowerCase())});
    inds.forEach(e=>{if(icOf(e)==null&&need.has(String(e.n).toLowerCase()))edited=setIC(e,'0')})}
  if(add.length){
    const rows=[];for(let i=0;i<add.length;i+=6)rows.push('.ic '+add.slice(i,i+6).join(' '));
    let at=ls.findIndex(l=>/^\s*\.(op|dc|ac|tran)\b/i.test(l));
    if(at<0)at=ls.findIndex(l=>/^\s*\.control\b/i.test(l));if(at<0)at=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));if(at<0)at=ls.length;
    ls.splice(at,0,'* Initial conditions (auto): capacitor start voltages, used with uic',...rows)}
  const inPlay=add.length>0||edited||have.size>0||P.els.some(e=>(e.k==='C'||e.k==='L')&&icOf(e)!=null);
  if(inPlay)for(let i=0;i<ls.length;i++)if(/^\s*\.?tran\b/i.test(ls[i])&&!/\buic\b/i.test(ls[i])){const m=/^(.*?)(\s*[;$].*)?$/.exec(ls[i]);ls[i]=m[1].replace(/\s+$/,'')+' uic'+(m[2]||'')}
  const out=ls.join('\n')+(/\n$/.test(text)?'\n':'');return out===text?text:out}
/* If the netlist has an AC source (AC mag), .ac and .tran are required: add whichever is missing before .end */
function autoAnalyses(text){
  const P=parse(text);if(P.errs.length)return text;
  const srcs=P.els.filter(e=>(e.k==='V'||e.k==='I')&&spec(e.val).acm);
  if(!srcs.length)return text;
  const has=k=>P.dirs.some(d=>new RegExp('^\\.'+k+'(\\s|$)','i').test(d));
  const add=[];
  if(!has('ac'))add.push('.ac dec 20 10 100k');
  if(!has('tran')){
    let f=0;const a=P.dirs.map(d=>d.trim().split(/\s+/)).find(t=>t[0].toLowerCase()==='.ac');
    if(a){const f0=num(a[3]),f1=num(a[4]);if(f0>0&&f1>0)f=Math.sqrt(f0*f1)}
    if(!(f>0)){for(const e of P.els){const w=(e.k==='V'||e.k==='I')&&spec(e.val).w;if(w&&/^(sin|tri|saw)$/.test(w.t)&&w.a[2]>0){f=w.a[2];break}}}
    if(!(f>0))f=1000;
    f=+f.toPrecision(1);const tf=+(5/f).toPrecision(2),ts=+(tf/500).toPrecision(2);
    add.push('.tran '+eng(ts,true)+' '+eng(tf,true));
  }
  if(!add.length)return text;
  const ls=text.replace(/\s+$/,'').split('\n'),ei=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));
  ei>=0?ls.splice(ei,0,...add):ls.push(...add);
  return ls.join('\n')}
function ctlBlockOf(text){const ls=String(text||'').split('\n'),ci=ls.findIndex(l=>/^\s*\.control\b/i.test(l)),ei=ci<0?-1:ls.findIndex((l,i)=>i>ci&&/^\s*\.endc\b/i.test(l));return ci>=0&&ei>ci&&ctlLines(text).length?ls.slice(ci,ei+1):null}
function writeText(t,fresh){t=autoIC(autoAnalyses(t));
  if(!fresh&&!ctlLines(t).length){const keep=ctlBlockOf(src.value);if(keep){const ls=t.replace(/\s+$/,'').split('\n'),end=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));end>=0?ls.splice(end,0,...keep):ls.push(...keep);t=ls.join('\n')}}
  src.value=t;S.P=parse(t);S.sig=sigOf(S.P);gutter();showErrs(S.P)}
function afterEdit(keep){SIMLIVE=false;stopAnim(true);const X=extract(S.M);S.M.wires.forEach(w=>{const g=X.segs.find(s=>s.w===w);if(g&&g.net)w.net=g.net});
  writeText(genNetlist(S.M));draw();updUndo();if(keep)codePreview();else inspect();schedSim()}
function normPts(pts){const o=[];pts.forEach(q=>{if(!o.length||o[o.length-1][0]!==q[0]||o[o.length-1][1]!==q[1])o.push([q[0],q[1]])});
  for(let i=o.length-2;i>0;i--){const a=o[i-1],b=o[i],c=o[i+1];if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1]))o.splice(i,1)}return o.length>1?o:null}
function addPart(k,gx,gy,v){mutate(()=>{const D=SYMS[k];let val=v!=null?v:D.def;
    const pre=D.pre||'';let n=k==='GND'?'':k==='LBL'?'':newName(pre);if(k==='LBL'){let i=1;while(S.M.parts.some(p=>p.t==='LBL'&&p.v==='net'+i))i++;val='net'+i}
    const p={id:uid(S.M),t:k,n,v:val==null?'':val,x:gx,y:gy,r:S.gr,m:S.gm};S.M.parts.push(p);ensureModel(S.M,p);S.sel=new Set([p.id]);S.selW=null});needRun()}
function delSel(){if(S.selW){mutate(()=>{S.M.wires=S.M.wires.filter(w=>w!==S.selW);S.selW=null;S.selNet=null});return}
  if(!S.sel.size)return;mutate(()=>{S.M.parts=S.M.parts.filter(p=>!S.sel.has(p.id));S.sel.clear()})}
function dupSel(){if(!S.sel.size)return;mutate(()=>{const ns=new Set();[...S.sel].forEach(id=>{const p=S.M.parts.find(q=>q.id===id);if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=uid(S.M);c.x+=3;c.y+=3;if(SYMS[c.t].pre)c.n=newName(SYMS[c.t].pre);S.M.parts.push(c);ns.add(c.id)});S.sel=ns});needRun()}
function attach(ids){const pk=new Map();S.M.parts.filter(p=>ids.has(p.id)).forEach(p=>partPins(p).forEach(q=>pk.set(K(q.x,q.y),{p,name:q.name,ox:q.ox,oy:q.oy})));
  const att=[];S.M.wires.forEach(w=>{const a=w.pts[0],b=w.pts[w.pts.length-1],ka=pk.get(K(a[0],a[1])),kb=pk.get(K(b[0],b[1]));if(ka||kb)att.push({w,o:w.pts.map(q=>q.slice()),a:ka,b:kb})});return att}

 function transformSel(fn){
  if(!S.sel.size)return false;

  mutate(()=>{
    S.M.parts
      .filter(p=>S.sel.has(p.id))
      .forEach(fn);
  });
  return true;
}
  /*function transformSel(fn){if(!S.sel.size)return;mutate(()=>{const att=attach(S.sel);S.M.parts.filter(p=>S.sel.has(p.id)).forEach(fn);
  const pos=(t)=>{const pp=partPins(t.p).find(q=>q.name===t.name);return pp};
  att.forEach(t=>{const A=t.a&&pos(t.a),B=t.b&&pos(t.b),o=t.o,n=o.length;
    if(A&&B){const na=[A.x,A.y],nb=[B.x,B.y];t.w.pts=[na,...lr(na,nb,A.ox!==0)]}
    else if(A){const na=[A.x,A.y];t.w.pts=[na,...lr(na,o[n-1],A.ox!==0)]}
    else{const nb=[B.x,B.y];t.w.pts=[o[0],...lr(o[0],nb,B.ox===0)]}
    t.w.pts=normPts(t.w.pts)||t.w.pts});S.M.wires=S.M.wires.filter(w=>w.pts.length>1)})}*/

const rotSel=()=>{if(S.tool==='place'){S.gr=(S.gr+1)%4;drawOver();return}if(transformSel(p=>{if(p.t!=='GND'||true)p.r=(p.r+1)%4})!==false)needRun()};
const mirSel=()=>{if(S.tool==='place'){S.gm^=1;drawOver();return}if(transformSel(p=>{p.m=p.m?0:1})!==false)needRun()};
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
/* ---- Buzzer: frequency helpers + soft WebAudio tone (sounds only while a simulation runs and |V| across it > ~1 V) ---- */
const BZ_DEF=800;
const bzF=v=>{const m=/\bf\s*=\s*([\d.]+(?:e[-+]?\d+)?)\s*(k|meg)?\b/i.exec(String(v||''));if(!m)return BZ_DEF;let f=+m[1];if(m[2]&&/^k$/i.test(m[2]))f*=1e3;return f>=20&&f<=20000?Math.round(f):BZ_DEF};
const bzSet=(v,f)=>{const t=String(v||'').replace(/\s*\bf\s*=\s*\S+/ig,'').trim();return(t||'400')+' f='+Math.round(f)};
const BZ=(()=>{
  let ctx=null,master=null,lp=null,muted=false,voices=new Map(),fans=new Map(),nbuf=null,envs=null,envR=null,lastFr=0;
  const VMAX=0.11;                                   /* per-buzzer peak gain: quiet and comfortable */
  const mk=()=>{if(ctx)return ctx;const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;
    try{ctx=new A();master=ctx.createGain();master.gain.value=muted?0:0.9;lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3200;lp.Q.value=0.5;lp.connect(master);master.connect(ctx.destination)}catch(e){ctx=null}return ctx};
  const wake=()=>{const c=mk();if(c&&c.state==='suspended')c.resume()};
  ['pointerdown','pointerup','mousedown','keydown','click','change','touchstart','touchend'].forEach(ev=>document.addEventListener(ev,wake,true));   /* any first click / tap / key unlocks the browser audio */
  const voice=id=>{let v=voices.get(id);if(v)return v;const c=mk();if(!c)return null;
    const g=c.createGain();g.gain.value=0;const o1=c.createOscillator(),o2=c.createOscillator(),g2=c.createGain();
    o1.type='sine';o2.type='sine';g2.gain.value=0.16;o1.connect(g);o2.connect(g2);g2.connect(g);g.connect(lp);o1.start();o2.start();
    v={o1,o2,g,env:0,f:0,lvl:0};voices.set(id,v);return v};
  const drop=(id,v)=>{try{v.g.gain.setTargetAtTime(0,ctx.currentTime,0.03);setTimeout(()=>{try{v.o1.stop();v.o2.stop();v.g.disconnect()}catch(e){}},300)}catch(e){}voices.delete(id)};
  const silence=()=>{if(!ctx)return;voices.forEach(v=>{try{v.g.gain.setTargetAtTime(0,ctx.currentTime,0.03)}catch(e){}});voices.forEach(v=>{v.lvl=0;v.env=0});fans.forEach(v=>{try{v.g.gain.setTargetAtTime(0,ctx.currentTime,0.05);v.h.gain.setTargetAtTime(0,ctx.currentTime,0.05)}catch(e){}})};
  /* Fan: soft airflow (band-passed noise) + low motor hum. Speed s (0..1) comes from live-effects.js (FX.get): the higher the voltage,
     the faster the blades, the louder and higher the airflow sound. It spins up / down smoothly with the blades. */
  const fanVoice=id=>{let v=fans.get(id);if(v)return v;const c=mk();if(!c)return null;
    if(!nbuf){nbuf=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const d=nbuf.getChannelData(0);let b=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;b=0.985*b+0.15*w;d[i]=b*3}}   /* brown-ish noise: soft, not hissy */
    const n=c.createBufferSource();n.buffer=nbuf;n.loop=true;const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=300;bp.Q.value=0.7;
    const g=c.createGain();g.gain.value=0;n.connect(bp);bp.connect(g);g.connect(lp);n.start();
    const o=c.createOscillator();o.type='sine';o.frequency.value=70;const h=c.createGain();h.gain.value=0;o.connect(h);h.connect(lp);o.start();
    v={n,bp,g,o,h};fans.set(id,v);return v};
  const fanDrop=(id,v)=>{try{v.g.gain.setTargetAtTime(0,ctx.currentTime,0.05);v.h.gain.setTargetAtTime(0,ctx.currentTime,0.05);setTimeout(()=>{try{v.n.stop();v.o.stop();v.g.disconnect();v.h.disconnect()}catch(e){}},500)}catch(e){}fans.delete(id)};
  const fst=new Map();   /* fan id -> {k: signed speed -1..1, a: blade angle, w: wind angle} */
  const FAN_V=12;   /* fan sound follows the ABSOLUTE voltage across the fan: about 1 V starts it, 12 V = full speed */
  let RS=null;   /* result of the CIRCUIT (window.CR(): power switch + netlist), not of the Run / Stop buttons */
  const live=()=>{RS=window.CR?window.CR():((RES&&RES.op&&RES.C&&!(RES.errs&&RES.errs.length))?RES:null);return !!(RS&&RS.op&&RS.C&&!(RS.errs&&RS.errs.length))};
  /* envelope of |V| across each buzzer for every transient frame: max over one period of any SIN/TRI/SAW source (so 50 Hz mains
     drives a steady tone, not a 100 Hz flutter) while slow beeps from PULSE / 555 / switches keep their on-off timing */
  function build(){
    if(envR===RS&&envs)return envs;envR=RS;envs=new Map();
    try{const C=RS.C,bz=[];C.devs.forEach(d=>{if(d.t==='R'&&/^(rbuz|rfan)/i.test(d.nm))bz.push(d)});
      let f=0;C.devs.forEach(d=>{if((d.t==='V'||d.t==='I')&&d.s&&d.s.w&&/^(sin|tri|saw)$/.test(d.s.w.t)&&d.s.w.a[2]>0)f=Math.max(f,d.s.w.a[2])});
      const arr=fr=>bz.forEach(d=>{const V=(x,i)=>i<0?0:x[i],a=new Float32Array(fr.length);fr.forEach((x,i)=>{a[i]=Math.abs(V(x,d.a)-V(x,d.b))});
        let W=1;if(RS.tran&&fr===RS.tran.X&&f>0&&RS.tran.t.length>1){const h=RS.tran.t[1]-RS.tran.t[0];W=Math.max(1,Math.min(600,Math.ceil(1/f/h)))}
        const e=new Float32Array(a.length);if(W<=1)e.set(a);else{const dq=[];for(let i=0;i<a.length;i++){while(dq.length&&a[dq[dq.length-1]]<=a[i])dq.pop();dq.push(i);while(dq[0]<=i-W)dq.shift();e[i]=a[dq[0]]}}
        envs.set(String(d.nm).toLowerCase()+(fr===(RS.tran&&RS.tran.X)?'|t':fr===(RS.dc&&RS.dc.X)?'|d':'|o'),e)});
      if(RS.tran&&RS.tran.X)arr(RS.tran.X);if(RS.dc&&RS.dc.X)arr(RS.dc.X);
    }catch(e){envs=new Map()}
    return envs}
  function volt(p){           /* instantaneous envelope of |V| across this buzzer on the frame now on screen */
    const d=RS.C.devs.find(q=>String(q.nm).toLowerCase()===String(p.n).toLowerCase());if(!d)return 0;
    const V=(x,i)=>i<0?0:x[i],sel=window.FXSEL||{k:'op',i:-1},E=build();
    if(sel.k==='tran'&&RS.tran&&RS.tran.X[sel.i]){const e=E.get(String(p.n).toLowerCase()+'|t');return e?e[sel.i]:Math.abs(V(RS.tran.X[sel.i],d.a)-V(RS.tran.X[sel.i],d.b))}
    if(sel.k==='dc'&&RS.dc&&RS.dc.X[sel.i]){return Math.abs(V(RS.dc.X[sel.i],d.a)-V(RS.dc.X[sel.i],d.b))}
    const x=RS.op.x;return Math.abs(V(x,d.a)-V(x,d.b))}
  function vnow(p){            /* signed instantaneous voltage across this part on the frame now on screen */
    const d=RS.C.devs.find(q=>String(q.nm).toLowerCase()===String(p.n).toLowerCase());if(!d)return 0;
    const V=(x,i)=>i<0?0:x[i],sel=window.FXSEL||{k:'op',i:-1};let x=RS.op.x;
    if(sel.k==='tran'&&RS.tran&&RS.tran.X[sel.i])x=RS.tran.X[sel.i];else if(sel.k==='dc'&&RS.dc&&RS.dc.X[sel.i])x=RS.dc.X[sel.i];
    return V(x,d.a)-V(x,d.b)}
  /* Blades + wind follow the same absolute-voltage speed. This loop is registered AFTER live-effects.js, so it runs after it in every frame and wins. */
  function fanVis(){requestAnimationFrame(fanVis);if(!fst.size)return;const lv=live();let parts;try{parts=S.M.parts}catch(e){return}
    document.querySelectorAll('#scene [data-fx]').forEach(el=>{const r=el.getAttribute('data-role');if(r!=='rotor'&&r!=='wind'&&r!=='blur')return;
      const id=el.getAttribute('data-fx'),st=fst.get(id);if(!st||(!lv&&!st.k))return;
      const q=parts.find(z=>String(z.id)===String(id)),mg=q&&q.m?-1:1,k=Math.abs(st.k);
      if(r==='rotor')el.setAttribute('transform','rotate('+(mg*st.a).toFixed(1)+')');
      else if(r==='blur')el.setAttribute('opacity',(k*0.35).toFixed(3));
      else{el.setAttribute('opacity',Math.min(1,k*1.4).toFixed(3));el.setAttribute('transform','rotate('+(mg*st.w).toFixed(1)+')')}})}
  {const go=()=>setTimeout(()=>requestAnimationFrame(fanVis),0);if(document.readyState==='complete')go();else addEventListener('load',go)}   /* after live-effects.js has registered its own frame loop */
  let lt=0;
  function frame(now){requestAnimationFrame(frame);lastFr=now;const dt=Math.min(0.05,(now-lt)/1000||0);lt=now;
    let parts;try{parts=S.M.parts.filter(p=>p.t==='BUZ')}catch(e){return}
    const on=live()&&!muted,seen=new Set();
    parts.forEach(p=>{seen.add(p.id);
      let t=0;if(live()){try{t=volt(p)}catch(e){t=0}}
      const v=on?voice(p.id):voices.get(p.id);
      let lvl=0;
      if(v){v.env+= (t-v.env)*(1-Math.exp(-dt/0.012));           /* short smoothing, no clicks */
        lvl=v.env>1?Math.min(1,0.45+0.55*(v.env-1)/9):0;v.lvl=lvl;
        const f=bzF(p.v);if(f!==v.f&&ctx){v.f=f;v.o1.frequency.setTargetAtTime(f,ctx.currentTime,0.02);v.o2.frequency.setTargetAtTime(2*f,ctx.currentTime,0.02)}
        if(ctx)v.g.gain.setTargetAtTime(on?lvl*VMAX:0,ctx.currentTime,0.015)}
      else if(live()&&!muted)lvl=t>1?Math.min(1,0.45+0.55*(t-1)/9):0;   /* audio not allowed yet: still animate the waves */
      document.querySelectorAll('#scene [data-fx="'+p.id+'"]').forEach(el=>{const r=el.getAttribute('data-role');const m=/^wave(\d)$/.exec(r||'');if(!m)return;
        const k=+m[1],ph=(now/260-k*0.9),o=lvl>0?lvl*(0.35+0.65*Math.max(0,Math.sin(ph*2))):0;el.setAttribute('opacity',o.toFixed(2))})});
    voices.forEach((v,id)=>{if(!seen.has(id))drop(id,v)});
    let fp;try{fp=S.M.parts.filter(p=>p.t==='FAN')}catch(e){fp=[]}const fs=new Set();
    fp.forEach(p=>{fs.add(p.id);
      let st=fst.get(p.id);if(!st){st={k:0,a:0,w:0};fst.set(p.id,st)}
      /* signed speed target from the ABSOLUTE voltage across the fan: starts at about 0.8 V (so 1.5 V already turns it), then rises gradually to full speed at 12 V */
      let tg=0;if(live()){try{const env=volt(p),vi=vnow(p),mag=env>0.8?Math.pow(Math.min(1,(env-0.8)/(FAN_V-0.8)),0.6):0;tg=(Math.abs(vi)<1e-3?1:Math.sign(vi))*mag}catch(e){tg=0}}
      st.k+=(tg-st.k)*(1-Math.exp(-dt/(Math.abs(tg)>Math.abs(st.k)?0.5:0.3)));if(Math.abs(st.k)<0.004)st.k=0;
      st.a=(((st.a+st.k*1100*dt)%360)+360)%360;st.w=(((st.w+st.k*240*dt)%360)+360)%360;
      const k=muted?0:Math.abs(st.k),v=(k>0.01)?fanVoice(p.id):fans.get(p.id);if(!v||!ctx)return;const t=ctx.currentTime;
      v.bp.frequency.setTargetAtTime(150+650*k,t,0.08);v.bp.Q.value=0.7+0.4*k;
      v.g.gain.setTargetAtTime(k>0.01?0.022+0.115*Math.pow(k,1.2):0,t,0.08);     /* audible from the first turn, gently louder and higher, never harsh */
      v.o.frequency.setTargetAtTime(50+100*k,t,0.08);v.h.gain.setTargetAtTime(0.02*k,t,0.08)});
    fst.forEach((_,id)=>{if(!fs.has(id))fst.delete(id)});
    fans.forEach((v,id)=>{if(!fs.has(id))fanDrop(id,v)})}
  requestAnimationFrame(frame);
  setInterval(()=>{if(performance.now()-lastFr>400)silence()},300);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)silence()});
  return{
    beep(f,sec){const c=mk();if(!c||muted)return;wake();const o=c.createOscillator(),g=c.createGain(),o2=c.createOscillator(),g2=c.createGain(),t=c.currentTime;
      o.type='sine';o.frequency.value=f;o2.type='sine';o2.frequency.value=2*f;g2.gain.value=0.16;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(VMAX,t+0.02);g.gain.setValueAtTime(VMAX,t+sec);g.gain.linearRampToValueAtTime(0,t+sec+0.05);
      o.connect(g);o2.connect(g2);g2.connect(g);g.connect(lp);o.start(t);o2.start(t);o.stop(t+sec+0.1);o2.stop(t+sec+0.1)},
    mute(m){muted=!!m;if(master)master.gain.value=muted?0:0.9;if(muted)silence()},
    get muted(){return muted},get fan(){return fst}}})();
{const b=document.getElementById('bSound');if(b){const ic=()=>{b.innerHTML=BZ.muted?'<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i><span class="snd"> Muted</span>':'<i class="fa-solid fa-volume-high" aria-hidden="true"></i><span class="snd"> Sound</span>';b.setAttribute('aria-pressed',BZ.muted?'true':'false')};ic();b.onclick=()=>{BZ.mute(!BZ.muted);ic()}}}
function codePreview(){const c=$('#fCode'),p=S.M.parts.find(q=>S.sel.has(q.id));if(c&&p)c.textContent=lineOf(p)}
function inspect(){const P=$('#pProp'),ids=[...S.sel],M=S.M;
  if(S.selW){const n=S.selW.net||'';P.innerHTML=`<div class="ph"><div><b>Wire</b><small>${S.selW.pts.length-1} segment(s)</small></div></div><div class="field">Net name<input value="${esc(n)}" disabled></div><div class="row">${RES&&RES.tr&&RES.tr.some(t=>t.name==='v('+n+')')?'<button id="bProbe">Plot v('+esc(n)+')</button>':''}<button id="bDelW">Delete wire</button></div><p class="hint">Net names come from your netlist. Add a <b>Net label</b> part to name a net yourself.</p>`;return}
  if(!ids.length){P.innerHTML=`<div class="field">Circuit title<input id="fTitle" value="${esc(M.title||'')}"></div>
    ${S.desc?`<p class="hint" style="margin:0 0 12px">${esc(S.desc)}</p>`:''}
    <div class="empty"><h3>Nothing selected</h3>Click a part to edit its properties.<br>Changes are written to the NGspice netlist instantly.</div>`;return}
  if(ids.length>1){P.innerHTML=`<div class="ph"><div><b>${ids.length} parts selected</b></div></div><div class="row"><button id="bRot">Rotate</button><button id="bMir">Mirror</button></div><div class="row"><button id="bDup">Duplicate</button><button id="bDel">Delete</button></div>`;return}
  const p=M.parts.find(q=>q.id===ids[0]);if(!p){P.innerHTML='';return}const D=SYMS[p.t],two=!!D.pre;
  const vl={R:'Resistance',C:'Capacitance',L:'Inductance',V:'Source value',I:'Source value',D:'Model',Q:'Model',M:'Model / W L',E:'Gain',G:'Transconductance',X:'Subcircuit',RSW:'Contact resistance (≤1 Ω = ON, 1G = OFF)',RSWM:'Contact resistance (≤1 Ω = ON, 1G = OFF)',XSW:'Subcircuit: DPDT_A = position A, DPDT_B = position B',XT:'Transformer subcircuit (XFMR_<primary>TO<secondary>)',XK:'Relay subcircuit (RELAY_<coil V>V)',S:'Switch model (.model … SW)',RFUSE:'Rated current (A): the fuse blows above it',RBULB:'Filament resistance (Ω)',RFAN:'Winding resistance (Ω)',RBUZ:'Coil resistance (Ω)  +  f=<Hz> (tone)',VAM:'Internal 0 V source: reads current pin 1 → 2',RVM:'Input impedance: reads V(pin 1) − V(pin 2)'}[D.pre]||'Value';
  P.innerHTML=`<div class="ph">${iconSVG(p.t,64,p.v)}<div><b>${esc(p.n||D.name)}</b><small>${esc(D.name)}</small></div></div>
  ${two?`<div class="field">Reference<input id="fN" value="${esc(p.n)}"></div>`:''}
  ${p.t==='GND'?'<p class="hint">All ground symbols are node 0.</p>':`<div class="field">${p.t==='LBL'?'Net name':vl}<input id="fV" value="${esc(p.v)}" spellcheck="false" autocomplete="off" ${p.t==='AM'?'readonly':''}></div>`}
  ${p.t==='FUSE'?`${p.bn?'<div class="row"><button id="bFuse">🔧 Replace fuse (reset)</button></div>':''}<p class="hint">Set only the rated current (for example 5 or 10 A). When the current is higher than the rating the fuse blows and the circuit opens; the fuse itself stays on the board - press Replace fuse to use it again. Netlist form: RFUSE1 a b 10m I=5</p>`:''}
  ${p.t==='FAN'?`<p class="hint">Fan sound: while a simulation runs, the blades start turning at about 1 V (1.5 V already moves them) and speed up gradually with voltage; a soft airflow sound follows, gently louder and higher. Use the Sound button in the top bar to mute.</p>`:''}
  ${p.t==='BUZ'?`<div class="field">Sound frequency (Hz)<input id="fHz" type="number" min="100" max="8000" step="50" value="${bzF(p.v)}"></div><div class="row"><button id="bBeep">🔊 Test sound</button></div><p class="hint">Default 800 Hz = soft, comfortable tone. The buzzer sounds while a simulation is running and the voltage across it is above about 1 V. Netlist form: RBUZ1 a b 400 f=800</p>`:''}
  ${PRE[D.pre]&&(D.pre==='V'||D.pre==='I')?`<div class="field">Preset<select id="fP"><option value="">choose waveform…</option>${PRE[D.pre].map(v=>`<option>${esc(v)}</option>`).join('')}</select></div>`:''}
  ${ALT[p.t]?`<div class="field">Symbol<select id="fS">${ALT[p.t].map(k=>`<option value="${k}" ${k===p.t?'selected':''}>${SYMS[k].name}</option>`).join('')}</select></div>`:''}
  <div class="row"><button id="bRot">⟳ Rotate</button><button id="bMir">⇋ Mirror</button></div><div class="row"><button id="bDup">Duplicate</button><button id="bDel">Delete</button></div>
  ${two?`<div class="field" style="margin-top:10px">NGspice line</div><code class="code" id="fCode">${esc(lineOf(p))}</code>`:''}`}
$('#pProp').addEventListener('input',e=>{const id=e.target.id,p=S.M.parts.find(q=>S.sel.has(q.id));
  if(id==='fTitle'){mutate(()=>{S.M.title=e.target.value},'title',true);return}
  if(!p)return;
  if(id==='fHz'&&p.t==='BUZ'){const f=Math.max(100,Math.min(8000,+e.target.value||800));mutate(()=>{p.v=bzSet(p.v,f)},'f'+p.id,true);const fv=$('#fV');if(fv)fv.value=p.v;BZ.beep(f,0.25);return}
  if(id==='fV'&&p.t==='BUZ'){const fh=$('#fHz');setTimeout(()=>{if(fh&&document.activeElement!==fh)fh.value=bzF(p.v)},0)}
  if(id==='fV'){const oldNm=(p.v||'').split(/\s+/)[0];mutate(()=>{p.v=e.target.value;ensureModel(S.M,p);dropAutoModel(S.M,p,oldNm)},'v'+p.id,true)}
  else if(id==='fN'){const v=e.target.value.trim();if(v&&!S.M.parts.some(q=>q!==p&&q.n.toLowerCase()===v.toLowerCase()))mutate(()=>{p.n=v},'n'+p.id,true)}
  else if(id==='fP'&&e.target.value){mutate(()=>{p.v=e.target.value},'p'+p.id,true);$('#fV').value=p.v;e.target.value=''}
  else if(id==='fS')mutate(()=>{p.t=e.target.value;if(SYMS[p.t].sub)p.v=SYMS[p.t].def;ensureModel(S.M,p)});});
$('#pProp').addEventListener('click',e=>{const id=e.target.id;
  if(id==='bRot')rotSel();else if(id==='bMir')mirSel();else if(id==='bDel')delSel();else if(id==='bDup')dupSel();else if(id==='bDelW')delSel();
  else if(id==='bFuse'){const q=S.M.parts.find(z=>S.sel.has(z.id));if(q)mutate(()=>{q.bn=0});}
  else if(id==='bProbe')probe(S.selW.net);else if(id==='bBeep'){const q=S.M.parts.find(z=>S.sel.has(z.id));if(q)BZ.beep(bzF(q.v),0.5)}});
/* ---------- netlist panel ---------- */
/* ---- NGspice syntax highlighter (overlay <pre> behind a transparent textarea) ---- */
const HL_KW=/\b(dc|ac|sin|pulse|pwl|tri|saw|noise|exp)(?=[\s(]|$)/gi,HL_TY=/\b(npn|pnp|nmos|pmos|d|njf|pjf)(?=[\s(]|$)/gi;
function hlGen(s){return esc(s).replace(/([A-Za-z_]\w*)(?==)|(\b(?:dc|ac|sin|pulse|pwl|tri|saw|noise|exp)\b(?=[\s(]|$))|(\b(?:npn|pnp|nmos|pmos)\b(?=[\s(]|$))|(-?\b\d*\.?\d+(?:e[-+]?\d+)?(?:meg|mil|[tgkmunpf])?[A-Za-z]*)|([()=,])/gi,(m,a,b,c,d,f)=>a?`<span class="p">${a}</span>`:b?`<span class="k">${b}</span>`:c?`<span class="q">${c}</span>`:d?`<span class="x">${d}</span>`:`<span class="u">${f}</span>`)}
function hlLine(l){
  if(/^\s*[*;]/.test(l))return`<span class="c">${esc(l)}</span>`;
  let m=/^(\s*)(\.\w+)(.*)$/.exec(l);
  if(m&&/^\.title$/i.test(m[2]))return esc(m[1])+`<span class="d">${esc(m[2])}</span><span class="ttl">${esc(m[3])}</span>`;
  if(m){let r=m[3];if(/^\.model$/i.test(m[2])){const q=/^(\s+)(\S+)(\s+)(\w+)(.*)$/.exec(r);if(q)return esc(m[1])+`<span class="d">${esc(m[2])}</span>`+esc(q[1])+`<span class="n">${esc(q[2])}</span>`+esc(q[3])+`<span class="q">${esc(q[4])}</span>`+hlGen(q[5])}
    return esc(m[1])+`<span class="d">${esc(m[2])}</span>`+hlGen(r)}
  m=/^(\s*)\+(.*)$/.exec(l);if(m)return esc(m[1])+'<span class="u">+</span>'+hlGen(m[2]);
  m=/^(\s*)(\S+)(.*)$/.exec(l);if(!m)return esc(l);
  const L=m[2][0].toUpperCase(),cls='RCL'.includes(L)?'e1':'VI'.includes(L)?'e2':'DQMJ'.includes(L)?'e3':'EGFH'.includes(L)?'e4':'e5',toks=m[3].split(/(\s+)/);
  let np=L==='X'?toks.filter(t=>t&&!/^\s+$/.test(t)).length-1:(NP[L]||2),out=esc(m[1])+`<span class="${cls}">${esc(m[2])}</span>`,seen=0,rest='';
  toks.forEach(t=>{if(!t||/^\s+$/.test(t)){(seen<np?out+=t:rest+=t);return}
    if(seen<np){seen++;out+=`<span class="${t==='0'||/^gnd$/i.test(t)?'g':'n'}">${esc(t)}</span>`}else rest+=t});
  return out+hlGen(rest)}
function syncScroll(){const h=$('#hl'),g=$('#gut');h.scrollTop=src.scrollTop;h.scrollLeft=src.scrollLeft;g.scrollTop=src.scrollTop}
function highlight(){const bad=new Set(((S.P&&S.P.errs)||[]).map(x=>x.n));
  $('#hl').innerHTML=src.value.split('\n').map((l,i)=>bad.has(i)?`<span class="lerr">${hlLine(l)||' '}</span>`:hlLine(l)).join('\n')+'\n';syncScroll()}
function gutter(){const n=src.value.split('\n').length;$('#gut').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');highlight()}
src.addEventListener('scroll',syncScroll);['keyup','click','focus','select','touchmove'].forEach(ev=>src.addEventListener(ev,()=>requestAnimationFrame(syncScroll)));
function showErrs(P){setTimeout(highlight,0);$('#nerr').innerHTML=(P.errs.length?P.errs.map(x=>`<div class="er">Line ${x.n+1}: ${esc(x.m)}</div>`).join(''):`<div class="ok">✓ ${P.els.length} elements · ${P.dirs.filter(d=>/^\.(op|dc|ac|tran)/i.test(d)).length} analyses</div>`)+P.warn.map(w=>`<div class="wn">⚠ ${esc(w)}</div>`).join('')}
function onText(auto){SIMLIVE=false;stopAnim(true);if(auto){const t2=autoIC(autoAnalyses(src.value));if(t2!==src.value){const c=src.selectionStart,sT=src.scrollTop,sL=src.scrollLeft;src.value=t2;try{src.setSelectionRange(c,c)}catch(_){}src.scrollTop=sT;src.scrollLeft=sL}}
  const P=parse(src.value);S.P=P;gutter();showErrs(P);if(P.errs.length){schedSim();return}
  const sg=sigOf(P);
  if(sg===S.sig&&S.M.parts.length){P.els.forEach(e=>{const p=S.M.parts.find(q=>q.n===e.n);if(p)p.v=e.k==='V'||e.k==='I'?e.val:e.tail});S.M.dirs=P.dirs.slice();S.M.notes=P.notes;S.M.title=P.title}
  else{S.M=buildFromNetlist(P);S.sig=sg;S.sel.clear();S.selW=null;S.selNet=null;S.hist=[];S.fut=[];if(!S.touched)fit()}
  draw();updUndo();inspect();schedSim()}
let txT;src.addEventListener('input',()=>{clearTimeout(txT);gutter();txT=setTimeout(()=>onText(false),200)});
/* + Analysis -> ".control plot / print": inserts the run / plot / print block. The traces are the ones ticked in the
   simulation window (or v(in) v(out) / the first nodes before any run), so the checkboxes keep driving these lines. */
function ctlTraceList(){
  let names=[];
  if(RES&&RES.tr){const k=(TAB!=='op'&&RES[TAB])?TAB:['tran','ac','dc'].find(q=>RES[q]);
    if(k&&SEL[k]&&SEL[k].size)names=RES.tr.filter(t=>SEL[k].has(t.name)).map(t=>t.name);
    if(!names.length)names=RES.tr.filter(t=>t.k==='v').slice(0,2).map(t=>t.name)}
  if(!names.length){const P=S.P,nets=[];((P&&P.els)||[]).forEach(e=>(e.nodes||[]).forEach(n=>{n=String(n).toLowerCase();if(n!=='0'&&n!=='gnd'&&!nets.includes(n))nets.push(n)}));
    const pick=['in','out'].filter(n=>nets.includes(n));(pick.length?pick:nets.slice(0,2)).forEach(n=>names.push('v('+n+')'));
    if(!names.length)names=['v(in)','v(out)']}
  return names.join(' ')}
/* returns the lines with the run / plot / print block added (inside an existing .control block, or as a new one before .end); null when it is already there */
function ctlInsert(ls,vec){
  const body=['  plot '+vec,'  print '+vec,'  * You can update simulation using checkbox'],
    ci=ls.findIndex(l=>/^\s*\.control\b/i.test(l)),ei=ci<0?-1:ls.findIndex((l,i)=>i>ci&&/^\s*\.endc\b/i.test(l));
  if(hasCtl(ls.join('\n')))return null;
  if(ci>=0&&ei>ci)ls.splice(ei,0,...body);
  else{const end=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l)),blk=['.control','run',...body,'.endc'];end>=0?ls.splice(end,0,...blk):ls.push(...blk)}
  return ls}
function addCtlBlock(){
  const ls=ctlInsert(src.value.replace(/\s+$/,'').split('\n'),ctlTraceList());
  if(!ls){toast('A plot / print line already exists in the .control block','info');return}
  src.value=ls.join('\n');PLOTSIG=null;onText(true)}
/* + Analysis -> ".title": puts  .title <circuit title>  on the first line (the title shown in Properties) */
function addTitleLine(){
  const ls=src.value.replace(/\s+$/,'').split('\n');
  if(ls.some(l=>/^\s*\.title\b/i.test(l))){toast('A .title line already exists','info');return}
  let t=String((S.P&&S.P.title)||(S.M&&S.M.title)||'').replace(/\s+/g,' ').trim()||'Circuit';
  const fi=ls.findIndex(l=>l.trim());
  if(fi>=0&&/^\s*\*/.test(ls[fi])){t=ls[fi].replace(/^\s*\*+\s*/,'').trim()||t;ls[fi]='.title '+t}   /* old "* title" comment -> .title */
  else ls.unshift('.title '+t);
  src.value=ls.join('\n');onText(true)}
/* typing a bare ".title" and pressing Enter / Tab fills in the circuit title from Properties */
src.addEventListener('keydown',e=>{if((e.key!=='Enter'&&e.key!=='Tab')||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
  const v=src.value,c=src.selectionStart,a=v.lastIndexOf('\n',c-1)+1;let b=v.indexOf('\n',c);if(b<0)b=v.length;
  if(!/^\s*\.title\s*$/i.test(v.slice(a,b)))return;
  const t=String((S.P&&S.P.title)||(S.M&&S.M.title)||'').replace(/\s+/g,' ').trim()||'Circuit',ln='.title '+t;
  e.preventDefault();src.value=v.slice(0,a)+ln+v.slice(b);const p=a+ln.length;try{src.setSelectionRange(p,p)}catch(_){}
  onText(false)});
/* + Analysis -> ".ic initial conditions": capacitors get  .ic v(node)=value  (own IC= or 0), .tran gets uic, an inductor that needs it gets IC=0.
   With no capacitor / inductor in the circuit a  .ic v(<first node>)=0  line is inserted for you to edit. */
function addIcLines(){
  const t0=src.value,t1=autoIC(t0);
  if(t1!==t0){src.value=t1;onText(true);toast('.ic initial conditions added','info');return}
  const P=S.P;
  if(P&&P.els.some(e=>e.k==='C'||e.k==='L')){toast('Initial conditions (.ic) are already in the netlist','info');return}
  const nets=[];((P&&P.els)||[]).forEach(e=>(e.nodes||[]).forEach(n=>{n=String(n);if(gnd(n)!=='0'&&!nets.includes(n))nets.push(n)}));
  const pick=nets.find(n=>/^out$/i.test(n))||nets[0]||'out',ls=t0.replace(/\s+$/,'').split('\n');
  let at=ls.findIndex(l=>/^\s*\.(op|dc|ac|tran)\b/i.test(l));if(at<0)at=ls.findIndex(l=>/^\s*\.control\b/i.test(l));if(at<0)at=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));if(at<0)at=ls.length;
  ls.splice(at,0,`.ic v(${pick})=0`);
  for(let i=0;i<ls.length;i++)if(/^\s*\.?tran\b/i.test(ls[i])&&!/\buic\b/i.test(ls[i]))ls[i]=ls[i].replace(/\s+$/,'')+' uic';
  src.value=ls.join('\n');onText(true)}
$('#addan').onchange=ev=>{const k=ev.target.value;ev.target.value='';if(!k)return;if(k==='subckt'||k==='model'||k==='comment'){window.InsDlg&&InsDlg.open(k);return}if(k==='title'){addTitleLine();return}if(k==='ctl'){addCtlBlock();return}if(k==='ic'){addIcLines();return}const vs=S.P.els.find(x=>x.k==='V'),
  L={op:'.op',dc:`.dc ${vs?vs.n:'V1'} 0 5 0.1`,ac:'.ac dec 20 10 100k',tran:'.tran 10u 5m'}[k],ls=src.value.replace(/\s+$/,'').split('\n');
  if(k==='ac'&&vs&&vs.span===1&&!/\bac\b/i.test(vs.val))ls[vs.line]=`${vs.n} ${vs.nodes.join(' ')} ${vs.tail||vs.val} AC 1`.replace(/\s+/g,' ');
  const ei=ls.findIndex(l=>/^\s*\.end\s*$/i.test(l));ei>=0?ls.splice(ei,0,L):ls.push(L);src.value=ls.join('\n');if(k!=='op')TAB=k;onText(true)};
$('#bCopy').onclick=async e=>{try{await navigator.clipboard.writeText(src.value)}catch(_){src.select();document.execCommand('copy')}e.target.textContent='Copied ✓';setTimeout(()=>e.target.textContent='Copy',1200)};
function selTab(p){document.querySelectorAll('.stabs button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));$('#pProp').hidden=p!=='prop';$('#pNet').hidden=p!=='net';if(p==='net')gutter()}
document.querySelector('.stabs').onclick=e=>{const b=e.target.closest('button');if(b)selTab(b.dataset.p)};

/* ---------- animated simulation (Run keeps looping until Stop) + graph zoom ---------- */
const animLen=()=>ANIM.k==='tran'?RES.tran.t.length:ANIM.k==='ac'?RES.ac.f.length:RES.dc.xs.length;
const animPick=()=>(TAB!=='op'&&RES[TAB])?TAB:(['tran','ac','dc'].find(k=>RES[k])||'op');
function paintPlot(el,idx){
  const pl=PL[el.dataset.id];if(!pl||!pl.X)return;
  const svg=el.querySelector('svg');if(!svg)return;
  const g=svg.dataset.geom.split(',').map(Number),Tp=g[4],ph=g[5],xs=pl.xs,st=Math.max(1,Math.ceil(idx/1200));
  svg.querySelectorAll('path.ln').forEach(p=>{const ys=pl.series[+p.dataset.i].ys;let d='';
    for(let i=0;i<=idx;i+=st){const v=ys[i];if(isFinite(v))d+=(d?'L':'M')+pl.X(xs[i]).toFixed(1)+' '+pl.Y(v).toFixed(1)}
    const v=ys[idx];if(st>1&&idx%st&&isFinite(v))d+='L'+pl.X(xs[idx]).toFixed(1)+' '+pl.Y(v).toFixed(1);
    p.setAttribute('d',d)});
  const px=pl.X(xs[idx]);svg.querySelector('.ph').setAttribute('d',`M${px} ${Tp}V${Tp+ph}`);
  svg.querySelector('.dots').innerHTML=pl.series.map(q=>isFinite(q.ys[idx])?`<circle cx="${px}" cy="${pl.Y(q.ys[idx])}" r="3.6" fill="${q.c}" stroke="var(--panel)" stroke-width="1.2"/>`:'').join('');
  const rd=el.querySelector('.rd');if(rd)rd.innerHTML=`<span>${eng(xs[idx])}</span>`+pl.series.map(q=>`<span style="color:${q.c}">${esc(q.name)} = ${eng(q.ys[idx])}</span>`).join('')}
function paintAll(idx){document.querySelectorAll('#out .plot').forEach(e=>paintPlot(e,idx))}
function animLabel(idx,f){const k=ANIM.k;let t='';
  if(k==='tran')t='t = '+eng(RES.tran.t[idx])+'s';else if(k==='ac')t='f = '+eng(RES.ac.f[idx])+'Hz';
  else t=RES.dc.src+' = '+eng(RES.dc.xs[idx])+(RES.dc.cur?'A':'V');
  $('#aTime').textContent=t;$('#aBar').style.width=(f*100).toFixed(1)+'%'}
function animBtns(){$('#bStopSim').disabled=!(ANIM.on||SIMLIVE);document.querySelector('.dock').classList.toggle('live',ANIM.on)}
function animFrame(now){
  if(!ANIM.on)return;
  const dur=8000/ANIM.spd;let f=(now-ANIM.t0)/dur;
  if(f>=1){ANIM.t0=now;f=0}                      /* loop forever until Stop */
  ANIM.f=f;const n=animLen(),idx=Math.min(n-1,Math.max(0,Math.round(f*(n-1))));ANIM.idx=idx;
  paintAll(idx);animLabel(idx,f);
  ANIM.raf=requestAnimationFrame(animFrame)}
function startAnim(K){
  cancelAnimationFrame(ANIM.raf);
  if(!RES||!RES.op)return;
  if(K==='op'){ANIM.on=false;animBtns();TAB='op';showTab();return}
  ANIM.k=K;ANIM.spd=+$('#aSpd').value||1;TAB=K;ANIM.on=true;ANIM.idx=0;ANIM.t0=performance.now();
  animBtns();showTab();animLabel(0,0);ANIM.raf=requestAnimationFrame(animFrame)}
function stopAnim(silent){
  if(!ANIM.on)return;
  cancelAnimationFrame(ANIM.raf);ANIM.on=false;ANIM.idx=null;
  $('#aTime').textContent='';$('#aBar').style.width='0';animBtns();
  if(!silent&&RES)showTab()}
$('#bRunSim').onclick=()=>{{const t2=autoIC(src.value);if(t2!==src.value){src.value=t2;onText(false)}}runSimUI();SIMLIVE=!!(RES&&RES.op&&!(RES.errs&&RES.errs.length));animBtns();if(RES&&RES.op)startAnim(animPick())};
$('#bStopSim').onclick=()=>{SIMLIVE=false;stopAnim();animBtns()};
$('#aSpd').onchange=()=>{const f=ANIM.on?ANIM.f:0;ANIM.spd=+$('#aSpd').value||1;if(ANIM.on)ANIM.t0=performance.now()-f*8000/ANIM.spd};
animBtns();
/* graph zoom: wheel = zoom at cursor, drag = pan, double-click = reset, buttons ＋ － Reset */
const zclamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let zRaf=0;
function zoomShow(){$('#zLbl').textContent=ZOOM.zx>1||ZOOM.zy>1?'×'+(+ZOOM.zx.toFixed(1)):'';$('#out').classList.toggle('zoomed',ZOOM.zx>1||ZOOM.zy>1);
  if(!zRaf)zRaf=requestAnimationFrame(()=>{zRaf=0;if(RES)showTab()})}
function zoomBy(k,fx,fy){fx=fx==null?.5:fx;fy=fy==null?.5:fy;
  const nx=zclamp(ZOOM.zx*k,1,1000),ny=zclamp(ZOOM.zy*k,1,1000),ux=ZOOM.wx+fx/ZOOM.zx,uy=ZOOM.wy+fy/ZOOM.zy;
  ZOOM.zx=nx;ZOOM.zy=ny;ZOOM.wx=zclamp(ux-fx/nx,0,1-1/nx);ZOOM.wy=zclamp(uy-fy/ny,0,1-1/ny);zoomShow()}
function zoomReset(quiet){ZOOM.zx=ZOOM.zy=1;ZOOM.wx=ZOOM.wy=0;if(quiet){const l=$('#zLbl');if(l)l.textContent='';const o=$('#out');if(o)o.classList.remove('zoomed')}else zoomShow()}
$('#zIn').onclick=()=>zoomBy(1.4);$('#zOut').onclick=()=>zoomBy(1/1.4);$('#zReset').onclick=()=>zoomReset();
const plotPos=(e,s)=>{const r=s.getBoundingClientRect(),g=s.dataset.geom.split(',').map(Number),vb=s.viewBox&&s.viewBox.baseVal&&s.viewBox.baseVal.width?s.viewBox.baseVal:{width:720,height:230};
  return{r,L:g[0],pw:g[1],Tp:g[4],ph:g[5],W:vb.width,H:vb.height,fx:zclamp(((e.clientX-r.left)/r.width*vb.width-g[0])/g[1],0,1),fy:zclamp(1-((e.clientY-r.top)/r.height*vb.height-g[4])/g[5],0,1)}};
$('#out').addEventListener('wheel',e=>{const s=e.target.closest('svg[data-geom]');if(!s)return;e.preventDefault();
  const q=plotPos(e,s);zoomBy(e.deltaY<0?1.25:.8,q.fx,q.fy)},{passive:false});
/* ---- value window (tooltip) + mouse / touch gestures: hover or touch = read all traces, drag = pan / box-zoom, pinch = zoom ---- */
let ZM=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)?'cur':'pan';
const tipEl=document.createElement('div');tipEl.id='tip';document.body.appendChild(tipEl);
const zboxEl=document.createElement('div');zboxEl.id='zbox';document.body.appendChild(zboxEl);
function setZM(m){ZM=m;document.querySelectorAll('.zoomctl [data-zm]').forEach(b=>b.classList.toggle('on',b.dataset.zm===m))}
document.querySelector('.zoomctl').addEventListener('click',e=>{const b=e.target.closest('[data-zm]');if(b)setZM(b.dataset.zm)});
setZM(ZM);
function hideTip(){CUR.i=null;const t=document.getElementById('tip');if(t)t.style.display='none';document.querySelectorAll('#out .xh').forEach(x=>x.setAttribute('d',''));document.querySelectorAll('#out .cdots').forEach(x=>{x.innerHTML=''})}
const fracOf=(q,cx,cy)=>({fx:zclamp(((cx-q.r.left)/q.r.width*q.W-q.L)/q.pw,0,1),fy:zclamp(1-((cy-q.r.top)/q.r.height*q.H-q.Tp)/q.ph,0,1)});
function idxAt(s,cx){const pl=PL[s.parentNode.dataset.id],q=plotPos({clientX:cx,clientY:0},s),g=s.dataset.geom.split(',').map(Number),
    f=zclamp(((cx-q.r.left)/q.r.width*q.W-g[0])/g[1],0,1),xv=pl.xlog?Math.pow(10,g[2]+f*(g[3]-g[2])):g[2]+f*(g[3]-g[2]),xs=pl.xs;
  let a=0,b=xs.length-1;while(b-a>1){const m=(a+b)>>1;xs[m]<xv?a=m:b=m}return Math.abs(xs[a]-xv)<Math.abs(xs[b]-xv)?a:b}
function paintCursor(i){document.querySelectorAll('#out .plot').forEach(el=>{
  const pl=PL[el.dataset.id],svg=el.querySelector('svg');if(!pl||!pl.X||!svg||i>=pl.xs.length)return;
  const g=svg.dataset.geom.split(',').map(Number),px=pl.X(pl.xs[i]),inx=px>=g[0]&&px<=g[0]+g[1];
  svg.querySelector('.xh').setAttribute('d',inx?`M${px} ${g[4]}V${g[4]+g[5]}`:'');
  svg.querySelector('.cdots').innerHTML=inx?pl.series.map(q=>{const y=pl.Y(q.ys[i]);return isFinite(q.ys[i])&&y>=g[4]&&y<=g[4]+g[5]?`<circle cx="${px}" cy="${y}" r="4" fill="${q.c}" stroke="var(--panel)" stroke-width="1.5"/>`:''}).join(''):'';
  const rd=el.querySelector('.rd');if(rd)rd.innerHTML=`<span>${eng(pl.xs[i])}</span>`+pl.series.map(q=>`<span style="color:${q.c}">${esc(q.name)} = ${eng(q.ys[i])}${esc(q.u||'')}</span>`).join('')})}
function showTip(i,cx,cy,touch){
  const els=[...document.querySelectorAll('#out .plot')],tip=document.getElementById('tip');if(!els.length)return;
  const id0=els[0].dataset.id,p0=PL[id0];if(!p0||i>=p0.xs.length)return;const x=p0.xs[i];let hd;
  if(id0==='tr')hd='t = '+eng(x)+'s';else if(id0==='am'||id0==='ap')hd='f = '+eng(x)+'Hz';
  else{const m=/^(\S+)\s*\((.)\)/.exec(p0.xl||'');hd=(m?m[1]:'x')+' = '+eng(x)+(m?m[2]:'')}
  const rows=new Map();
  els.forEach(el=>{const pl=PL[el.dataset.id];if(!pl)return;pl.series.forEach(q=>{const v=q.ys[i],t=isFinite(v)?eng(v)+(q.u||''):'–';if(!rows.has(q.name))rows.set(q.name,{c:q.c,v:[]});rows.get(q.name).v.push(t)})});
  tip.innerHTML=`<div class="th">${esc(hd)}</div>`+[...rows].map(([n,r])=>`<div class="r"><i style="background:${r.c}"></i>${esc(n)}<b>${esc(r.v.join('  '))}</b></div>`).join('');
  tip.style.display='block';
  const w=tip.offsetWidth,h=tip.offsetHeight;let lx=cx+16,ly=cy+16;if(touch){lx=cx-w/2;ly=cy-h-26}
  if(lx+w>innerWidth-6)lx=cx-w-16;if(lx<6)lx=6;if(ly+h>innerHeight-6)ly=cy-h-16;if(ly<6)ly=6;
  tip.style.left=lx+'px';tip.style.top=ly+'px'}
function cursorFrom(s,cx,cy,touch){const i=idxAt(s,cx);CUR.i=i;paintCursor(i);showTip(i,cx,cy,touch)}
const svgUnder=(cx,cy)=>{const el=document.elementFromPoint&&document.elementFromPoint(cx,cy);return el&&el.closest?el.closest('#out svg[data-geom]'):null};
$('#out').addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||e.buttons||G)return;const s=e.target.closest('svg[data-geom]');if(s)cursorFrom(s,e.clientX,e.clientY,false);else hideTip()});
$('#out').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!G)hideTip()});
let G=null,PINCH=null;const PT=new Map();
$('#out').addEventListener('pointerdown',e=>{
  const s=e.target.closest('svg[data-geom]');if(!s){hideTip();return}
  if(e.pointerType==='mouse'&&e.button!==0)return;
  PT.set(e.pointerId,{x:e.clientX,y:e.clientY});const q=plotPos(e,s);
  if(PT.size>=2){const[a,b]=[...PT.values()];PINCH={q,d0:Math.hypot(a.x-b.x,a.y-b.y)||1,zx:ZOOM.zx,zy:ZOOM.zy,wx:ZOOM.wx,wy:ZOOM.wy,f0:fracOf(q,(a.x+b.x)/2,(a.y+b.y)/2)};G={t:'pinch'};hideTip();return}
  const mode=ZM==='box'?'box':(ZM==='pan'&&(ZOOM.zx>1||ZOOM.zy>1))?'pan':'cur';
  G={t:mode,x:e.clientX,y:e.clientY,q,wx:ZOOM.wx,wy:ZOOM.wy,moved:false,touch:e.pointerType!=='mouse'};
  if(mode==='cur')cursorFrom(s,e.clientX,e.clientY,G.touch);
  if(e.pointerType==='mouse')e.preventDefault()});
window.addEventListener('pointermove',e=>{
  if(PT.has(e.pointerId))PT.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(!G||G.t==='none')return;
  if(G.t==='pinch'){if(PT.size<2||!PINCH)return;const[a,b]=[...PT.values()],P=PINCH,k=Math.hypot(a.x-b.x,a.y-b.y)/P.d0,nx=zclamp(P.zx*k,1,1000),ny=zclamp(P.zy*k,1,1000),f1=fracOf(P.q,(a.x+b.x)/2,(a.y+b.y)/2);
    ZOOM.zx=nx;ZOOM.zy=ny;ZOOM.wx=zclamp(P.wx+P.f0.fx/P.zx-f1.fx/nx,0,1-1/nx);ZOOM.wy=zclamp(P.wy+P.f0.fy/P.zy-f1.fy/ny,0,1-1/ny);zoomShow();return}
  const dx=e.clientX-G.x,dy=e.clientY-G.y;if(Math.hypot(dx,dy)>5)G.moved=true;
  if(G.t==='pan'){hideTip();const q=G.q;
    ZOOM.wx=zclamp(G.wx-dx/(q.pw*q.r.width/q.W)/ZOOM.zx,0,1-1/ZOOM.zx);ZOOM.wy=zclamp(G.wy+dy/(q.ph*q.r.height/q.H)/ZOOM.zy,0,1-1/ZOOM.zy);zoomShow()}
  else if(G.t==='box'&&G.moved){hideTip();const st=zboxEl.style;st.display='block';st.left=Math.min(G.x,e.clientX)+'px';st.top=Math.min(G.y,e.clientY)+'px';st.width=Math.abs(dx)+'px';st.height=Math.abs(dy)+'px'}
  else if(G.t==='cur'){const s=svgUnder(e.clientX,e.clientY);if(s)cursorFrom(s,e.clientX,e.clientY,G.touch)}});
function endPtr(e){PT.delete(e.pointerId);if(!G)return;
  if(G.t==='pinch'){if(PT.size<2){PINCH=null;G=PT.size?{t:'none'}:null}return}
  if(PT.size)return;
  const g=G;G=null;zboxEl.style.display='none';
  if(g.t==='box'&&g.moved){const a=fracOf(g.q,g.x,g.y),b=fracOf(g.q,e.clientX,e.clientY),pxw=Math.abs(e.clientX-g.x),pxh=Math.abs(e.clientY-g.y);
    if(pxw>=10){const xa=Math.min(a.fx,b.fx),xb=Math.max(a.fx,b.fx),nz=zclamp(ZOOM.zx/Math.max(xb-xa,1e-4),1,1000),st=ZOOM.wx+xa/ZOOM.zx;ZOOM.zx=nz;ZOOM.wx=zclamp(st,0,1-1/nz)}
    if(pxh>=10){const ya=Math.min(a.fy,b.fy),yb=Math.max(a.fy,b.fy),nz=zclamp(ZOOM.zy/Math.max(yb-ya,1e-4),1,1000),st=ZOOM.wy+ya/ZOOM.zy;ZOOM.zy=nz;ZOOM.wy=zclamp(st,0,1-1/nz)}
    zoomShow()}
  else if(!g.moved&&g.touch&&g.t!=='cur'){const s=svgUnder(e.clientX,e.clientY);if(s)cursorFrom(s,e.clientX,e.clientY,true)}}
window.addEventListener('pointerup',endPtr);window.addEventListener('pointercancel',endPtr);
$('#out').addEventListener('dblclick',e=>{if(e.target.closest('svg[data-geom]'))zoomReset()});
/* ---------- examples, files, export ---------- */
function loadText(t,desc){zoomReset(true);S.desc=desc||'';S.touched=false;S.sig='';src.value=t;S.pickTab=true;onText(true);fit()}
const topic=$('#topic'),exsel=$('#exsel');
if(window.SWX)TOPICS.push(SWX.relayTopic(exNet));   /* relay examples */
/* ---- Transformer Circuits: 8 real-life examples (each has its own power switch RSWM1 in series with the mains / source) ---- */
TOPICS.push((()=>{
  const DM='.model 1N4007 D(Is=2.52n N=1.75)',ZM='.model BZX5V6 D(Is=1n N=1 Bv=5.6 Ibv=5m)',QM='.model 2N2222 NPN(Is=1e-14 Bf=200)';
  const MAINS='V1 vsw 0 SIN(0 325 50)',SW='RSWM1 vsw ac 1m';
  const E=(n,title,desc,lines)=>({n,title,desc,net:exNet(lines)});
  return{topic:'Transformer Circuits (8 real-life examples)',items:[
    E(1,'Mains step-down transformer: 230 V to 11.5 V lamp',
      'The most common transformer job: a 20:1 transformer brings the 230 V / 50 Hz mains (325 V peak) down to 11.5 V RMS (16 V peak) for a 12 V / 6 W lamp (doorbell, garden light, halogen supply). The secondary is in phase with the primary (dots) and the lamp current is 20 times larger than the primary current. Plot v(ac), v(sec) and i(RBULB1).',
      ['* Mains step-down transformer 230 V to 11.5 V',MAINS,SW,'XT1 ac 0 sec 0 XFMR_20TO1','RBULB1 sec 0 24','.tran 0.1m 60m uic']),
    E(2,'Travel voltage converter: 115 V / 60 Hz to 230 V (step-up 1:2)',
      'A 1:2 step-up transformer lets a 230 V appliance (here a 100 W lamp, 529 ohm) run from 115 V / 60 Hz American mains. Secondary voltage = 2 x primary voltage (163 V peak in, 326 V peak out), while the primary current is twice the load current. Plot v(ac), v(sec), i(RBULB1).',
      ['* Travel voltage converter 115 V to 230 V (1:2)','V1 vsw 0 SIN(0 163 60)',SW,'XT1 ac 0 sec 0 XFMR_1TO2','RBULB1 sec 0 529','.tran 0.1m 50m uic']),
    E(3,'Isolation transformer 1:1: touching one wire is harmless',
      'A 1:1 isolation transformer (workshop bench, medical equipment) has a floating secondary: there is no return path to earth. SW1 connects a body (1 kohm) to one secondary wire, yet the body current i(RBODY) stays zero, while the 230 V lamp keeps lighting normally. Without the transformer the same touch would send a dangerous current to earth. Click SW1 to connect / disconnect the body.',
      ['* Isolation transformer 1:1 (floating secondary)',MAINS,SW,'XT1 ac 0 s1 s2 XFMR_1TO1','RBULB1 s1 s2 529','RSW1 s1 body 1m','RBODY body 0 1k','.tran 0.1m 60m uic']),
    E(4,'Half-wave rectifier DC adapter (transformer + diode + capacitor)',
      'Cheap wall adapter: a 20:1 transformer gives 11.5 V AC, one diode lets only the positive half-cycles through and the 1000 uF capacitor fills the gaps, so the output is about 14-16 V DC with a 50 Hz ripple (one pulse per cycle, which is why the ripple is large). Plot v(sec), v(out), i(RL1).',
      ['* Half-wave rectifier adapter',MAINS,SW,'XT1 ac 0 sec 0 XFMR_20TO1','D1 sec out 1N4007','C1 out 0 1000u IC=0','RL1 out 0 100',DM,'.tran 0.1m 200m uic']),
    E(5,'Bridge rectifier linear power supply (unregulated DC)',
      'The classic bench supply front end: transformer, four-diode bridge (D1-D4) and a 2200 uF reservoir capacitor. Both half-cycles are used, so the ripple is at 100 Hz and much smaller than in the half-wave circuit. Output = secondary peak (16 V) minus two diode drops, about 14 V DC. Plot v(s1), v(s2), v(out).',
      ['* Bridge rectifier power supply',MAINS,SW,'XT1 ac 0 s1 s2 XFMR_20TO1','D1 s1 out 1N4007','D2 s2 out 1N4007','D3 0 s1 1N4007','D4 0 s2 1N4007','C1 out 0 2200u IC=0','RL1 out 0 47',DM,'.tran 0.1m 200m uic']),
    E(6,'Dual +/-15 V supply from a centre-tapped transformer',
      'Op-amp and audio amplifiers need a positive and a negative rail. A centre-tapped 10:1 secondary (each half 11.5 V RMS) has its tap as the 0 V reference; a bridge feeds two reservoir capacitors in series, giving about +15 V and -15 V around the tap. Plot v(s1), v(pos), v(neg).',
      ['* Dual +/-15 V supply, centre-tapped transformer',MAINS,SW,'XT1 ac 0 s1 0 s2 XFMR_CT_10TO1','D1 s1 pos 1N4007','D2 s2 pos 1N4007','D3 neg s1 1N4007','D4 neg s2 1N4007','C1 pos 0 1000u IC=0','C2 0 neg 1000u IC=0','RL1 pos 0 150','RL2 0 neg 150',DM,'.tran 0.1m 200m uic']),
    E(7,'Regulated 5 V supply: transformer + bridge + zener pass transistor',
      'Transformer, bridge and 1000 uF capacitor give about 14 V of rippling DC (v(raw)). A 5.6 V zener fixes the base of the pass transistor Q1, whose emitter follows at one Vbe lower: a steady 4.9 V output (v(reg)) that hardly moves with the ripple. Plot v(raw), v(z), v(reg).',
      ['* Regulated 5 V supply',MAINS,SW,'XT1 ac 0 s1 s2 XFMR_20TO1','D1 s1 raw 1N4007','D2 s2 raw 1N4007','D3 0 s1 1N4007','D4 0 s2 1N4007','C1 raw 0 1000u IC=0','R1 raw z 330','DZ1 0 z BZX5V6','Q1 raw z reg 2N2222','RL1 reg 0 100','C2 reg 0 100u IC=0',DM,ZM,QM,'.tran 0.1m 200m uic']),
    E(8,'Microphone input transformer (1:2): low-Z mic to high-Z preamp',
      'A 200 ohm microphone (20 mV peak, 1 kHz) feeds a 1:2 transformer in front of a 10 kohm preamp input. The transformer doubles the voltage (+6 dB, noise-free passive gain) and presents the preamp load to the mic as 10k / 4 = 2.5 kohm, a better match than connecting the mic directly. Plot v(mic), v(ac), v(pre).',
      ['* Microphone input transformer 1:2','VMIC vsw 0 SIN(0 20m 1k)','RSWM1 vsw mic 1m','RMIC1 mic ac 200','XT1 ac 0 pre 0 XFMR_1TO2','RIN1 pre 0 10k','.tran 20u 5m uic'])
  ]}})());

/* ---- Buzzer Circuits: 5 real-life examples (RBUZn = buzzer; soft 800 Hz tone by default, change it with f=<Hz> or in Properties) ---- */
TOPICS.push((()=>{
  const QM='.model 2N2222 NPN(Is=1e-14 Bf=200)';
  const E=(n,title,desc,lines)=>({n,title,desc,net:exNet(lines)});
  return{topic:'Buzzer Circuits (5 real-life examples)',items:[
    E(1,'Doorbell buzzer from a mains transformer (push button)',
      'A 20:1 transformer turns 230 V mains into 11.5 V AC for a 12 V doorbell buzzer. The push button SW1 is ON, so the buzzer sounds a soft 700 Hz tone and its sound waves pulse on the schematic. Click SW1 to release the button (silence). Select the buzzer and change Sound frequency in Properties to hear another pitch. Plot v(ac), v(sec), i(RBUZ1).',
      ['* Doorbell buzzer from a mains transformer','V1 vsw 0 SIN(0 325 50)','RSWM1 vsw ac 1m','XT1 ac 0 sec 0 XFMR_20TO1','RSW1 sec b 1m','RBUZ1 b 0 100 f=700','.tran 0.1m 60m uic']),
    E(2,'Push-button buzzer on a 12 V battery',
      'The simplest buzzer circuit: battery, push button SW1 and a 12 V / 30 mA buzzer (400 ohm). With SW1 ON the buzzer sounds at the default comfortable 800 Hz. Click SW1 to switch it off. Plot v(vcc), v(b), i(RBUZ1).',
      ['* Push-button buzzer on a 12 V battery','V1 vsw 0 DC 12','RSWM1 vsw vcc 1m','RSW1 vcc b 1m','RBUZ1 b 0 400 f=800','.op','.dc V1 0 12 0.5']),
    E(3,'Transistor-driven buzzer: 3.3 V logic beeps a 5 V buzzer',
      'A microcontroller pin (3.3 V pulse, 0.25 s on every 0.5 s) cannot supply the buzzer current, so NPN transistor Q1 switches it from the 5 V rail. The buzzer beeps twice a second at 900 Hz. Plot v(in), v(c), i(RBUZ1).',
      ['* Transistor-driven buzzer','V1 vsw 0 DC 5','RSWM1 vsw vcc 1m','VIN in 0 PULSE(0 3.3 0.1 1m 1m 0.25 0.5)','RB1 in b 2.2k','Q1 c b 0 2N2222','RBUZ1 vcc c 120 f=900',QM,'.tran 5m 2 uic']),
    E(4,'555 beeper: smoke-alarm style intermittent beep',
      'A 555 astable (about 1.9 Hz) drives Q1, which turns the 12 V buzzer on and off: a repeating beep-beep at 1000 Hz like a smoke detector or reversing alarm. Change C1 or R2 for a faster or slower beep, or the buzzer frequency for a different pitch. Plot v(out), v(c), i(RBUZ1).',
      ['* 555 beeper with buzzer','V1 vsw 0 DC 12','RSWM1 vsw vcc 1m','X1 0 trig out vcc ctrl trig disch vcc NE555','R1 vcc disch 1k','R2 disch trig 3.3k','C1 trig 0 100u IC=0','C2 ctrl 0 10n','RB1 out b 2.2k','Q1 c b 0 2N2222','RBUZ1 vcc c 400 f=1000',QM,'.tran 5m 3 uic']),
    E(5,'Burglar alarm: normally-closed door and window loop',
      'Door switch SW1 and window switch SW2 are in series and hold the base of Q1 at 0 V while both are closed: silent. Click SW1 or SW2 OFF (door or window opened) and R1 feeds the base, Q1 conducts and the buzzer sounds. A cut wire raises the alarm too (fail-safe). Plot v(b), v(c), i(RBUZ1).',
      ['* Burglar alarm with normally-closed loop','V1 vsw 0 DC 12','RSWM1 vsw vcc 1m','R1 vcc b 4.7k','RSW1 b w 1m','RSW2 w 0 1m','Q1 c b 0 2N2222','RBUZ1 vcc c 400 f=800',QM,'.op','.dc V1 0 12 0.5'])
  ]}})());
{let _n=0;TOPICS.forEach(t=>t.items.forEach(it=>{it.n=++_n}))}   /* one continuous 1..N numbering, no gaps */
/* every example of every topic carries the  .control / run / plot / print  block (traces = what the simulation shows by default) */
const EX_PLOT={"Voltage divider":"v(in) v(out)","Series resistors":"v(1) v(2) v(3)","Parallel resistors":"v(in)","Loaded voltage divider":"v(vcc) v(mid)","Wheatstone bridge":"v(top) v(a) v(b)","Superposition with two sources":"v(1) v(2) v(3)","Current source feeding a resistor network":"v(1) v(2)","R-2R ladder DAC (3 bit, code 101)":"v(n2) v(n1) v(n0)","Delta network with loads":"v(a) v(b) v(c)","Maximum power transfer":"v(1) v(2)","RC charge and discharge (square wave)":"v(in) v(out)","Slow RC (τ = 1 ms with 10 kΩ and 100 nF)":"v(in) v(out)","RL step response":"v(in) v(out)","RC differentiator":"v(in) v(out)","RC integrator (square wave to triangle)":"v(in) v(out)","Series RLC, underdamped":"v(in) v(a) v(b)","Series RLC, overdamped":"v(in) v(a) v(b)","Series RLC, critically damped":"v(in) v(a) v(b)","Parallel RLC ringing (current impulse)":"v(n)","Two-stage RC network":"v(in) v(a) v(b)","Capacitor charged through a Thevenin divider":"v(in) v(a)","Charge sharing between two capacitors":"v(in) v(a) v(b)","RC low-pass (fc ≈ 1.59 kHz)":"v(in) v(out)","RC high-pass":"v(in) v(out)","RL low-pass":"v(in) v(out)","RL high-pass":"v(in) v(out)","Series RLC band-pass (Q = 10)":"v(in) v(a) v(out)","Series LC notch (band-stop)":"v(in) v(out) v(m)","Parallel LC resonant band-pass":"v(in) v(out)","Second-order LC low-pass":"v(in) v(out)","Second-order CL high-pass":"v(in) v(out)","Twin-T notch filter (fn ≈ 1.59 kHz)":"v(in) v(a) v(out) v(b)","Wien bridge network (peak gain 1/3 at 1.59 kHz)":"v(in) v(a) v(out)","Two-stage RC low-pass (−40 dB/dec)":"v(in) v(a) v(out)","Three-stage RC phase-shift network":"v(in) v(a) v(b) v(out)","Lead network":"v(in) v(out)","Lag network":"v(in) v(out) v(m)","Pi (C-L-C) filter between 50 Ω terminations":"v(src) v(in) v(out)","Diode forward I-V curve":"v(in) v(a)","Reverse-biased diode":"v(in) v(a)","Half-wave rectifier (no filter)":"v(in) v(out)","Half-wave rectifier with filter capacitor":"v(in) v(out)","Full-wave bridge rectifier":"v(a) v(b) v(p)","Center-tapped full-wave rectifier":"v(a) v(b) v(out)","Positive clipper (limits at about +0.7 V)":"v(in) v(out)","Bidirectional clipper (±0.7 V)":"v(in) v(out)","Biased clipper (limits near 2.7 V)":"v(in) v(ref) v(out)","Diode clamper (DC restorer)":"v(in) v(out)","Voltage doubler":"v(in) v(a) v(out)","Three series diodes as a voltage reference":"v(in) v(a) v(b) v(c)","Diode AND gate":"v(vcc) v(a) v(b) v(y)","Diode OR gate":"v(a) v(b) v(y)","LED with current-limiting resistor":"v(1) v(a)","Low-drop versus standard silicon diode":"v(in) v(a) v(b)","Fixed-bias common emitter (supply sweep)":"v(vcc) v(b) v(c)","BJT output characteristics (Ib = 20 µA)":"v(b) v(c)","Voltage-divider bias with emitter resistor":"v(vcc) v(b) v(c) v(e)","BJT as a saturated switch":"v(vcc) v(in) v(b) v(c)","Emitter follower":"v(vcc) v(in) v(e)","Common-emitter amplifier: frequency response":"v(vcc) v(in) v(b) v(c)","Common-emitter amplifier: transient":"v(vcc) v(in) v(b) v(c)","Common-base amplifier":"v(vcc) v(in) v(e) v(b)","BJT current mirror":"v(vcc) v(c1) v(out)","Differential pair":"v(vcc) v(vee) v(in1) v(in2)","Darlington emitter follower":"v(vcc) v(b) v(e1) v(e)","PNP common-emitter stage":"v(vcc) v(b) v(c)","Complementary push-pull follower (crossover distortion)":"v(vcc) v(vee) v(in) v(out)","Constant-current source with diode reference":"v(vcc) v(b) v(m) v(c)","NMOS transfer characteristic":"v(vdd) v(g) v(d)","NMOS output characteristic (Vgs = 3 V)":"v(g) v(d)","Common-source stage with gate-voltage sweep":"v(vdd) v(g) v(d)","Common-source amplifier: transient":"v(vdd) v(g) v(d)","Common-source amplifier: frequency response":"v(vdd) v(in) v(g) v(d)","Source follower":"v(vdd) v(in) v(s)","NMOS inverter with resistive load":"v(vdd) v(in) v(out)","CMOS inverter transfer curve":"v(vdd) v(in) v(out)","CMOS inverter transient with load capacitor":"v(vdd) v(in) v(out)","NMOS current mirror":"v(vdd) v(g) v(out)","NMOS differential pair":"v(vdd) v(s) v(in1) v(in2)","NMOS pass transistor with capacitive load":"v(in) v(g) v(out)","VCVS amplifier (gain 10)":"v(in) v(out)","VCCS transconductance stage":"v(in) v(out)","Inverting amplifier (gain −10)":"v(in) v(inv) v(out)","Non-inverting amplifier (gain 10)":"v(in) v(out) v(inv)","Voltage follower (buffer)":"v(in) v(out)","Summing amplifier":"v(inv) v(out)","Difference amplifier":"v(inv) v(out)","Op-amp integrator":"v(in) v(inv) v(out)","Op-amp differentiator":"v(in) v(x) v(inv) v(out)","Active low-pass filter (fc ≈ 1 kHz, gain −1)":"v(in) v(inv) v(out)","Active high-pass filter (fc ≈ 1 kHz, gain −1)":"v(in) v(a) v(inv) v(out)","Sallen-Key low-pass (Butterworth, fc ≈ 1.6 kHz)":"v(in) v(a) v(b) v(out)","Exponentially damped sine":"v(in)","Square wave through an RC low-pass (harmonic filtering)":"v(in) v(out)","Arbitrary PWL stimulus":"v(in) v(out)","Two series sine sources (100 Hz beat)":"v(a) v(b)","Bridge rectifier with reservoir capacitor (ripple)":"v(a) v(b) v(p)","Series-pass regulator (LED reference)":"v(vin) v(b) v(out)","Third-order Butterworth LC low-pass (fc = 1 kHz, 50 Ω)":"v(src) v(in) v(out)","LC delay line (4 sections, Z0 ≈ 32 Ω)":"v(src) v(a) v(b) v(c)","555 astable LED blinker (1.4 s)":"v(vcc) v(disch) v(trig) v(ctrl)","555 astable 1 kHz clock":"v(vcc) v(disch) v(trig) v(ctrl)","555 astable with 50 % duty (diode steering)":"v(vcc) v(disch) v(trig) v(ctrl)","555 monostable one-shot (≈11 ms)":"v(vcc) v(trg) v(cap) v(ctrl)","555 Schmitt trigger":"v(vcc) v(in) v(ctrl) v(out)","555 PWM via control voltage":"v(vcc) v(ctrl) v(disch) v(trig)","555 bistable (set / reset latch)":"v(vcc) v(set) v(rst) v(ctrl)","CMOS inverter from MOSFETs (transfer curve)":"v(vdd) v(in) v(out)","NOT gate (CMOS inverter cell)":"v(vdd) v(a) v(y)","Buffer (two inverters)":"v(vdd) v(a) v(y)","AND gate":"v(vdd) v(a) v(b) v(y)","NAND gate":"v(vdd) v(a) v(b) v(y)","OR gate":"v(vdd) v(a) v(b) v(y)","NOR gate":"v(vdd) v(a) v(b) v(y)","XOR gate":"v(vdd) v(a) v(b) v(y)","XNOR gate":"v(vdd) v(a) v(b) v(y)","3-input NAND gate":"v(vdd) v(a) v(b) v(c)","3-input NOR gate":"v(vdd) v(a) v(b) v(c)","3-input AND gate":"v(vdd) v(a) v(b) v(c)","3-input OR gate":"v(vdd) v(a) v(b) v(c)","Half adder (XOR + AND)":"v(vdd) v(a) v(b) v(sum)","Full adder (2 XOR + 2 AND + OR)":"v(vdd) v(a) v(b) v(c)","SR latch from two NOR gates":"v(vdd) v(s) v(r) v(q)","555 clock gated by an AND gate":"v(vdd) v(disch) v(trig) v(ctrl)","Triangle wave through an RC low-pass":"v(in) v(out)","Sawtooth wave into a diode clipper":"v(in) v(out)","Noise source through an RC low-pass":"v(in) v(out)","Noisy sine cleaned by an RC filter":"v(a) v(in) v(out)"};
Object.assign(EX_PLOT,{'LED in DC source':'v(1) v(2) v(a)','LED in AC source':'v(in) v(2) v(a)','Bulb in DC source':'v(1) v(2)','Bulb in AC source':'v(in) v(2)','Fan in DC source':'v(1) v(2)','Fan in AC source':'v(in) v(2)','Fan, LED, Bulb in DC source':'v(1) v(2) v(a)','Fan, LED, Bulb in AC source':'v(in) v(2) v(a)','Short circuit (wire loop across the battery)':'v(a)'});
if(window.SWX)Object.assign(EX_PLOT,SWX.plots);
Object.assign(EX_PLOT,{'Doorbell buzzer from a mains transformer (push button)':'v(ac) v(sec) i(RBUZ1)','Push-button buzzer on a 12 V battery':'v(vcc) v(b) i(RBUZ1)','Transistor-driven buzzer: 3.3 V logic beeps a 5 V buzzer':'v(in) v(c) i(RBUZ1)','555 beeper: smoke-alarm style intermittent beep':'v(out) v(c) i(RBUZ1)','Burglar alarm: normally-closed door and window loop':'v(b) v(c) i(RBUZ1)'});
Object.assign(EX_PLOT,{'Mains step-down transformer: 230 V to 11.5 V lamp':'v(ac) v(sec) i(RBULB1)','Travel voltage converter: 115 V / 60 Hz to 230 V (step-up 1:2)':'v(ac) v(sec) i(RBULB1)','Isolation transformer 1:1: touching one wire is harmless':'v(ac) v(s2) i(RBODY) i(RBULB1)','Half-wave rectifier DC adapter (transformer + diode + capacitor)':'v(sec) v(out) i(RL1)','Bridge rectifier linear power supply (unregulated DC)':'v(s1) v(s2) v(out)','Dual +/-15 V supply from a centre-tapped transformer':'v(s1) v(pos) v(neg)','Regulated 5 V supply: transformer + bridge + zener pass transistor':'v(raw) v(z) v(reg)','Microphone input transformer (1:2): low-Z mic to high-Z preamp':'v(mic) v(ac) v(pre)'});
function exVec(it){
  if(EX_PLOT[it.title])return EX_PLOT[it.title];
  try{const P=parse(it.net),nets=[];P.els.forEach(e=>(e.nodes||[]).forEach(n=>{n=String(n).toLowerCase();if(n!=='0'&&n!=='gnd'&&!nets.includes(n))nets.push(n)}));
    const pick=['in','out'].filter(n=>nets.includes(n));return(pick.length?pick:nets.slice(0,2)).map(n=>'v('+n+')').join(' ')||'v(in) v(out)'}catch(_){return'v(in) v(out)'}}
/* every example starts with the two comment lines
     * Circuit title name
     * Author Md. Anisur Rahman
   and still gets a  .title Circuit title  card line right after them */
const EX_AUTHOR='* Author Md. Anisur Rahman';
TOPICS.forEach(t=>t.items.forEach(it=>{const ls=String(it.net).replace(/^\uFEFF/,'').split('\n');
  if(ls.some(l=>/^\s*\*\s*Author\b/i.test(l)))return;
  let fi=ls.findIndex(l=>l.trim());if(fi<0){ls.length=0;fi=0}
  const first=(ls[fi]||'').trim(),hasT=ls.some(l=>/^\s*\.title\b/i.test(l));
  let title,add=[];
  if(/^\*/.test(first)){title=first.replace(/^\*+\s*/,'').trim()||it.title;ls[fi]='* '+title;add=[EX_AUTHOR];if(!hasT)add.push('.title '+title);ls.splice(fi+1,0,...add)}
  else{const tm=/^\.title\b\s*(.*)$/i.exec(first);title=(tm&&tm[1].trim())||it.title;
    if(tm){ls.splice(fi,0,'* '+title,EX_AUTHOR)}
    else{add=['* '+title,EX_AUTHOR];if(!hasT)add.push('.title '+title);ls.splice(fi,0,...add)}}
  it.net=ls.join('\n')}));
TOPICS.forEach(t=>t.items.forEach(it=>{const ls=ctlInsert(String(it.net).replace(/\s+$/,'').split('\n'),exVec(it));if(ls)it.net=ls.join('\n')+'\n'}));
/* every example with a capacitor carries .ic (+ uic on .tran); an inductor that needs it carries IC=0 */
/* every example gets a power switch (RSWM1) in series with its main supply: OFF = simulation stopped, ON = simulation runs */
if(window.SWX)TOPICS.forEach(t=>t.items.forEach(it=>{it._orig=it.net;it.net=SWX.addMaster(it.net)}));
/* every example starts with its power switch OFF (RSWM... = 1G): the user turns it ON to run the simulation */
TOPICS.forEach(t=>t.items.forEach(it=>{it.net=String(it.net).split('\n').map(l=>/^\s*RSWM\w*\s/i.test(l)?l.replace(/(\S+)(\s*)$/,(m,v,sp)=>/^1m$/i.test(v)?'1G'+sp:m):l).join('\n')}));
TOPICS.forEach(t=>t.items.forEach(it=>{it.net=autoIC(it.net)}));
TOPICS.forEach((t,i)=>topic.add(new Option(`${i+1}. ${t.topic} (${t.items.length})`,i)));
function fillEx(){exsel.innerHTML=TOPICS[topic.value].items.map(it=>`<option value="${it.n}">${it.n}. ${esc(it.title)}</option>`).join('')}
function loadSel(){const it=TOPICS[topic.value].items.find(x=>x.n==exsel.value);if(it)loadText(it.net,it.desc)}
topic.onchange=()=>{fillEx();loadSel()};exsel.onchange=loadSel;
$('#bNew').onclick=()=>{SIMLIVE=false;stopAnim(true);S.M=newModel();S.sel.clear();S.selW=null;S.hist=[];S.fut=[];S.desc='';S.touched=false;writeText(genNetlist(S.M),true);draw();inspect();fit();RES=null;showTab()};
$('#bOpen').onclick=()=>$('#fileIn').click();
$('#fileIn').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
  /* Open: normalise the text (BOM, CRLF/CR), load it, then ALWAYS run the simulation right away (even if Auto-run is off) so every analysis in the file (.op .dc .ac .tran) is computed and the right result tab is shown */
  r.onload=()=>{const t=String(r.result).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    clearTimeout(simT);clearTimeout(txT);stopAnim(true);RES=null;TAB='op';
    loadText(t,'Loaded from '+f.name);
    clearTimeout(simT);clearTimeout(txT);S.pickTab=true;runSimUI();SIMLIVE=!!(RES&&RES.op&&!(RES.errs&&RES.errs.length));animBtns()};
  r.readAsText(f);e.target.value=''};
const dl=(name,blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800)};
const fname=()=>((S.M.title||'circuit').replace(/[^\w-]+/g,'_').slice(0,40)||'circuit');
$('#bCir').onclick=()=>dl(fname()+'.cir',new Blob([src.value],{type:'text/plain'}));
/* Export: circuit + simulation window (graphs / legend / tables) in ONE image */
const EXLIGHT=Object.assign({'--grid':'#c3d0de','--grid2':'#e6edf4','--panel':'#fff','--code':'#f3f6fa','--line':'#d9e2ec'},LIGHT);
const exFix=t=>t.replace(/var\((--[\w-]+)\)/g,(m,k)=>EXLIGHT[k]||'#000');
const EXFONT='Inter,Segoe UI,Helvetica,Arial,sans-serif',EXMONO='ui-monospace,Menlo,Consolas,monospace';
/* Reads what is currently shown in the Simulation window (#out) and redraws it as static SVG, width cw. Returns {h,body} or null */
function simBlock(cw){
  const o=$('#out');if(!RES||!RES.op||!o||!o.innerHTML.trim())return null;
  const names={op:'Operating point',dc:'DC sweep',ac:'AC analysis',tran:'Transient analysis'};
  let y=0,s=`<text x="0" y="16" font-size="15" font-weight="700" fill="#14263a">Simulation \u2013 ${names[TAB]||''}</text>`;y+=30;
  const lg=[...o.querySelectorAll('.chips label.tr')].filter(l=>l.querySelector('input')&&l.querySelector('input').checked);
  if(lg.length){let lx=0,ly=y;
    lg.forEach(l=>{const t=l.textContent.trim(),sw=l.querySelector('i'),w=t.length*7+36;
      if(lx>0&&lx+w>cw){lx=0;ly+=20}
      s+=`<rect x="${lx}" y="${ly-3}" width="14" height="5" rx="2.5" fill="${sw&&sw.style.background||'#888'}"/><text x="${lx+20}" y="${ly+3}" font-size="12" fill="#14263a">${esc(t)}</text>`;lx+=w});
    y=ly+20}
  const ser=new XMLSerializer();
  o.querySelectorAll('.plot > svg').forEach(sv=>{
    const c=sv.cloneNode(true),vb=sv.viewBox.baseVal;
    c.querySelectorAll('.xh,.ph,.dots,.cdots').forEach(n=>n.remove());
    /* animation repaints the curves frame by frame (and loops), so rebuild every curve from the complete data */
    const pl=PL[sv.parentNode&&sv.parentNode.dataset.id];
    if(pl&&pl.X)c.querySelectorAll('path.ln').forEach(p=>{const q=pl.series[+p.getAttribute('data-i')];if(!q)return;let d='';
      q.ys.forEach((v,i)=>{if(isFinite(v))d+=(d?'L':'M')+pl.X(pl.xs[i]).toFixed(1)+' '+pl.Y(v).toFixed(1)});p.setAttribute('d',d)});
    const h=cw*vb.height/vb.width;
    c.removeAttribute('style');c.removeAttribute('data-geom');
    c.setAttribute('x',0);c.setAttribute('y',y);c.setAttribute('width',cw);c.setAttribute('height',h);
    s+=exFix(ser.serializeToString(c));y+=h+10});
  if(!o.querySelector('.plot')&&!o.querySelector('table')){const hn=o.querySelector('p.hint');if(hn){s+=`<text x="0" y="${y+14}" font-size="12" fill="#62768b">${esc(hn.textContent.trim())}</text>`;y+=24}}
  o.querySelectorAll('table').forEach(tb=>{
    const rows=[...tb.rows].map(r=>[...r.cells].map(c=>c.textContent.trim()));if(!rows.length)return;
    const n=Math.max(...rows.map(r=>r.length)),cwid=[];
    for(let j=0;j<n;j++)cwid[j]=Math.max(...rows.map(r=>(r[j]||'').length))*7.4+26;
    rows.forEach((r,i)=>{let x=0;r.forEach((t,j)=>{const right=j>0,tx=right?x+cwid[j]-10:x+4;
      s+=`<text x="${tx}" y="${y+14}" text-anchor="${right?'end':'start'}" font-size="12" font-family="${EXMONO}" ${i===0?'font-weight="700" fill="#62768b"':'fill="#14263a"'}>${esc(t)}</text>`;x+=cwid[j]});
      s+=`<path d="M0 ${y+20.5}H${cwid.reduce((a,b)=>a+b,0)}" stroke="#d9e2ec"/>`;y+=21});
    y+=14});
  return y>30?{h:y,body:s}:null}
function svgString(){const b=bounds();if(!b)return null;const p=3,x=(b.x0-p)*U,y=(b.y0-p)*U,w=(b.x1-b.x0+2*p)*U,h=(b.y1-b.y0+2*p)*U;
  const inner=exFix(drawScene(S.M,{pins:false})),defs=window.RC?RC.defs():'';
  const sim0=simBlock(Math.max(w,720));
  if(!sim0)return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" font-family="${EXFONT}">${defs}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${inner}</svg>`;
  const pad=24,cw=Math.max(w,720),W=cw+2*pad,sim=sim0;let Y=pad;
  const title=(S.M.title&&S.M.title!=='circuit')?' \u2013 '+esc(S.M.title):'';
  let o=`<text x="${pad}" y="${Y+16}" font-size="15" font-weight="700" fill="#14263a">Circuit${title}</text>`;Y+=28;
  o+=`<svg x="${pad+(cw-w)/2}" y="${Y}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${defs}${inner}</svg>`;Y+=h+14;
  o+=`<path d="M${pad} ${Y}H${W-pad}" stroke="#c3d0de" stroke-width="1.5"/>`;Y+=16;
  o+=`<g transform="translate(${pad} ${Y})">${sim.body}</g>`;Y+=sim.h+pad;
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Y}" width="${W}" height="${Y}" font-family="${EXFONT}"><rect width="${W}" height="${Y}" fill="#fff"/>${o}</svg>`}
function toast(msg,kind){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','alert');document.body.appendChild(t)}
  t.textContent=msg;t.classList.toggle('info',kind==='info');t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),kind==='info'?4500:3200)}
/* After the circuit is changed by Rotate / Flip / adding a component (palette click, drag-drop, Duplicate), the old result no longer
   matches the schematic: tell the user to press Run (simulation panel or the NGSpice code tab). Cleared by the next run (showTab rewrites #simst). */
const RUN_MSG='Please Run Simulation or NGSpice Code';
function needRun(){try{const st=document.getElementById('simst');if(st)st.innerHTML=`<span class="wn">⚠ ${RUN_MSG}</span>`;toast(RUN_MSG,'info')}catch(e){}}
/* Download is allowed only after a successful run of the CURRENT netlist; the graph/legend/tables are read live, so ticking/unticking traces (checkboxes) or re-running is always reflected */
function exReady(){const o=$('#out'),ok=RES&&RES.op&&!(RES.errs&&RES.errs.length)&&RUNSIG!==null&&RUNSIG===simSig($('#src').value)&&o&&o.innerHTML.trim();
  if(!ok)toast('Please Run Simulation First, then Download Image.');return !!ok}
$('#bSvg').onclick=()=>{if(!exReady())return;const s=svgString();if(s)dl(fname()+'.svg',new Blob([s],{type:'image/svg+xml'}))};
$('#bPng').onclick=()=>{if(!exReady())return;const s=svgString();if(!s)return;const m=/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(s),k=Math.min(2,8000/Math.max(+m[1],+m[2])),w=Math.round(+m[1]*k),h=Math.round(+m[2]*k),img=new Image();
  img.onload=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);c.toBlob(bl=>dl(fname()+'.png',bl))};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s)};
/* ---------- chrome ---------- */
$('#bUndo').onclick=undo;$('#bRedo').onclick=redo;$('#tRot').onclick=rotSel;$('#tMir').onclick=mirSel;$('#tDel').onclick=delSel;
$('#tFit').onclick=()=>{S.touched=false;fit()};$('#tZi').onclick=()=>zoom(.8);$('#tZo').onclick=()=>zoom(1.25);
document.querySelectorAll('.tools [data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#bTheme').onclick=()=>{const r=document.documentElement,d=getComputedStyle(r).colorScheme==='dark';r.dataset.theme=d?'light':'dark'};
(function(){const sp=$('#split'),ct=document.querySelector('.center');let on=false;
  sp.addEventListener('pointerdown',e=>{on=true;sp.setPointerCapture(e.pointerId)});
  sp.addEventListener('pointermove',e=>{if(!on)return;const r=ct.getBoundingClientRect();ct.classList.remove('min','big');$('#dockB').textContent='⤢';ct.style.setProperty('--dockH',Math.max(100,Math.min(r.height-260,r.bottom-e.clientY))+'px');setVB()});
  sp.addEventListener('pointerup',()=>{on=false;if(!S.touched)fit()})})();
/* ---------- drag-to-resize: Components panel + Properties / Editable NGSpice panel ---------- */
(function(){
  const work=document.querySelector('.work'),pal=document.querySelector('.palette'),side=document.querySelector('.side');
  const hP=$('#rzPal'),hS=$('#rzSide');if(!work||!pal||!side||!hP||!hS)return;
  const stacked=()=>matchMedia('(max-width:1100px)').matches;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MINW=150,MINC=300,MINH=120;
  function relayout(){setVB();if(!S.touched)fit();gutter()}
  let raf=0;const soft=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;setVB()})};
  function attach(h,panel,side_){
    let st=null;
    h.addEventListener('pointerdown',e=>{
      if(e.button!==undefined&&e.button!==0&&e.pointerType==='mouse')return;
      e.preventDefault();const r=panel.getBoundingClientRect(),w=work.getBoundingClientRect();
      st={x:e.clientX,y:e.clientY,w:r.width,h:r.height,ww:w.width};
      try{h.setPointerCapture(e.pointerId)}catch(_){}
      h.classList.add('drag');document.body.classList.add('rzing');
    });
    h.addEventListener('pointermove',e=>{
      if(!st)return;
      if(stacked()){
        // single-column layout: the panel grows / shrinks in height
        const dy=e.clientY-st.y,nh=clamp(st.h+(side_==='right'?-dy:dy),MINH,Math.max(MINH,innerHeight*1.6));
        panel.style.setProperty(side_==='right'?'--sideH':'--palH',nh+'px');
      }else{
        const dx=e.clientX-st.x,other=side_==='right'?pal.getBoundingClientRect().width:side.getBoundingClientRect().width;
        const maxW=Math.max(MINW,st.ww-other-MINC-40);
        const nw=clamp(st.w+(side_==='right'?-dx:dx),MINW,maxW);
        work.style.setProperty(side_==='right'?'--sideW':'--palW',nw+'px');
      }
      soft();
    });
    const end=e=>{if(!st)return;st=null;h.classList.remove('drag');document.body.classList.remove('rzing');try{h.releasePointerCapture(e.pointerId)}catch(_){}relayout()};
    h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
    // double-click / double-tap = back to default size
    h.addEventListener('dblclick',()=>{
      if(side_==='right'){work.style.removeProperty('--sideW');side.style.removeProperty('--sideH')}
      else{work.style.removeProperty('--palW');pal.style.removeProperty('--palH')}
      setTimeout(relayout,30);
    });
    // keyboard: arrow keys nudge the size
    h.addEventListener('keydown',e=>{
      const k=e.key;if(!/^Arrow(Left|Right|Up|Down)$/.test(k))return;e.preventDefault();
      const step=e.shiftKey?60:20,r=panel.getBoundingClientRect();
      if(stacked()){
        const d=(k==='ArrowDown'?1:k==='ArrowUp'?-1:0)*step;if(!d)return;
        panel.style.setProperty(side_==='right'?'--sideH':'--palH',clamp(r.height+(side_==='right'?-d:d),MINH,innerHeight*1.6)+'px');
      }else{
        const d=(k==='ArrowRight'?1:k==='ArrowLeft'?-1:0)*step;if(!d)return;
        const other=side_==='right'?pal.getBoundingClientRect().width:side.getBoundingClientRect().width,
          maxW=Math.max(MINW,work.getBoundingClientRect().width-other-MINC-40);
        work.style.setProperty(side_==='right'?'--sideW':'--palW',clamp(r.width+(side_==='right'?-d:d),MINW,maxW)+'px');
      }
      relayout();
    });
  }
  attach(hP,pal,'left');attach(hS,side,'right');
  // keep the schematic viewBox correct whenever the canvas changes size (panel drag, window resize, rotate phone)
  if(window.ResizeObserver){new ResizeObserver(()=>soft()).observe(document.getElementById('cv'))}
  addEventListener('resize',()=>{
    // drop inline sizes that no longer fit the window
    const w=work.getBoundingClientRect().width;
    const pw=parseFloat(work.style.getPropertyValue('--palW'))||0,sw=parseFloat(work.style.getPropertyValue('--sideW'))||0;
    if(pw+sw+MINC+40>w){work.style.removeProperty('--palW');work.style.removeProperty('--sideW')}
    soft();
  });
})();
const toggleDock=()=>{const ct=document.querySelector('.center');ct.style.removeProperty('--dockH');ct.classList.remove('big');$('#dockB').textContent='⤢';ct.classList.toggle('min');$('#dockT').textContent=ct.classList.contains('min')?'▴':'▾';setTimeout(()=>{setVB();if(!S.touched)fit()},220)};
const toggleBig=()=>{const ct=document.querySelector('.center');ct.style.removeProperty('--dockH');ct.classList.remove('min');$('#dockT').textContent='▾';ct.classList.toggle('big');$('#dockB').textContent=ct.classList.contains('big')?'⤡':'⤢';setTimeout(()=>{setVB();if(!S.touched)fit()},220)};
$('#dockB').onclick=toggleBig;$('#dockT').onclick=toggleDock;$('#split').addEventListener('dblclick',toggleDock);
addEventListener('resize',()=>{setVB();if(!S.touched)fit()});
/* ---------- start ---------- */
buildPalette();selTab('prop');
topic.value=0;fillEx();exsel.value=1;
const it0=TOPICS[0].items.find(x=>x.n===1);loadText(it0.net,it0.desc);setTool('select');updUndo();
