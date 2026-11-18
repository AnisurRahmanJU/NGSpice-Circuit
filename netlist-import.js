/* ============================================================
   NETLIST IMPORT — type ngspice code, press "Create Circuit",
   and the schematic is drawn automatically on the canvas.
   Load AFTER script.js:  <script src="netlist-import.js"></script>

   Supported: R, C (IC=), L (IC=), V (DC / SIN / PULSE), I (DC),
              D (diode; LED if name/model contains "led"), S (ON/OFF),
              .model (for LED detection), comments, + continuation.
   Node "0" or "gnd" = ground.

   "Load sample" is now a drop-down menu listing every AniSpice
   code example, grouped by topic.
============================================================ */
(function(){
  if (window.__spiceImportLoaded) return;
  window.__spiceImportLoaded = true;
  document.querySelectorAll('[data-pane="pane-spice"]').forEach((el, i)=>{ if (i > 0) el.remove(); });
  document.querySelectorAll('#pane-spice').forEach((el, i)=>{ if (i > 0) el.remove(); });

  /* ============================================================
     EXAMPLE LIBRARY  (topic -> [ [title, netlist], ... ])
  ============================================================ */
  const DX = '.model DX D(Is=1e-14 N=1)';
  const PUL = 'PULSE(0 5 0 1n 1n 5m 10m)';
  const EXAMPLES = [
    {topic:'Quick Start', items:[
      ['AC sine into RC low-pass', `* AC sine wave (5 V peak, 60 Hz) driving an RC low-pass filter
* Write or Paste your Spice code here and click Create Circuit button
V1 in 0 SIN(0 5 60)
R1 in out 1k
C1 out 0 1u
.tran 100u 50m
.end`],
      ['LED with 5 V AC Source', `* LED with 5 V AC through 470 ohm
* Write or Paste your Spice code here and click Create Circuit button
V1 1 0 SIN(0 5 100 0 0 0)
R1 1 a 470
D1 a 0 LED
.model LED D(Is=1e-18 N=2)
.tran 0.1m 30m
.end`]
    ]},
    {topic:'1. DC Resistor Circuits', items:[
      ['1. Voltage divider', `* Voltage divider
V1 in 0 DC 10
R1 in out 1k
R2 out 0 1k
.op
.dc V1 0 10 1
.end`],
      ['2. Series resistors', `* Series resistors
V1 1 0 DC 12
R1 1 2 1k
R2 2 3 2.2k
R3 3 0 4.7k
.op
.dc V1 0 12 1
.end`],
      ['3. Parallel resistors', `* Three parallel branches
V1 in 0 DC 12
R1 in 0 1k
R2 in 0 2.2k
R3 in 0 4.7k
.op
.dc V1 0 12 1
.end`],
      ['4. Loaded voltage divider', `* Loaded voltage divider
V1 vcc 0 DC 12
R1 vcc mid 10k
R2 mid 0 10k
R3 mid 0 4.7k
.op
.dc V1 0 12 1
.end`],
      ['5. Wheatstone bridge', `* Wheatstone bridge
V1 top 0 DC 10
R1 top a 1k
R2 top b 1k
R3 a 0 1k
R4 b 0 1.1k
Rg a b 10k
.op
.dc V1 0 10 1
.end`],
      ['6. Superposition with two sources', `* Superposition: two voltage sources
V1 1 0 DC 10
V2 3 0 DC 5
R1 1 2 1k
R2 2 0 2k
R3 3 2 1k
.op
.dc V1 0 10 1
.end`],
      ['7. Current source network', `* Current source network
I1 0 1 DC 1m
R1 1 0 4.7k
R2 1 2 1k
R3 2 0 2.2k
.op
.dc I1 0 2m 0.1m
.end`],
      ['8. R-2R ladder DAC (code 101)', `* R-2R ladder DAC, code 101
Vb2 b2 0 DC 5
Vb1 b1 0 DC 0
Vb0 b0 0 DC 5
R2b b2 n2 20k
R1b b1 n1 20k
R0b b0 n0 20k
Rt n0 0 20k
Ra n0 n1 10k
Rb n1 n2 10k
.op
.end`],
      ['9. Delta network with loads', `* Delta resistor network with loads
V1 a 0 DC 10
R1 a b 1k
R2 b c 1k
R3 c a 1k
R4 b 0 2.2k
R5 c 0 2.2k
.op
.dc V1 0 10 1
.end`],
      ['10. Maximum power transfer', `* Maximum power transfer RL = Rs
Vs 1 0 DC 10
R1 1 2 50
R2 2 0 50
.op
.dc Vs 0 10 1
.end`]
    ]},
    {topic:'2. Transient: RC, RL, RLC', items:[
      ['11. RC charge / discharge', `* RC charge/discharge
V1 in 0 ${PUL.replace('5m 10m','5m 10m')}
R1 in out 1k
C1 out 0 1u
.tran 20u 10m
.end`],
      ['12. Slow RC (10k, 100n)', `* RC time constant 1 ms
V1 in 0 ${PUL}
R1 in out 10k
C1 out 0 100n
.tran 20u 10m
.end`],
      ['13. RL step response', `* RL step response
V1 in 0 ${PUL}
R1 in out 100
L1 out 0 10m
.tran 5u 1m
.end`],
      ['14. RC differentiator', `* RC differentiator
V1 in 0 PULSE(0 5 0 1n 1n 1m 2m)
C1 in out 10n
R1 out 0 10k
.tran 5u 4m
.end`],
      ['15. RC integrator', `* RC integrator
V1 in 0 PULSE(-1 1 0 1n 1n 50u 100u)
R1 in out 100k
C1 out 0 10n
.tran 0.5u 1m
.end`],
      ['16. Series RLC underdamped', `* Series RLC underdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 10
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end`],
      ['17. Series RLC overdamped', `* Series RLC overdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 1k
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end`],
      ['18. Series RLC critically damped', `* Series RLC critically damped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 200
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end`],
      ['19. Parallel RLC ringing', `* Parallel RLC impulse response
I1 0 n PULSE(0 1m 0 1n 1n 20u 1)
R1 n 0 100
L1 n 0 1m
C1 n 0 1u
.tran 1u 2m
.end`],
      ['20. Two-stage RC network', `* Two-stage RC low-pass step
V1 in 0 ${PUL}
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 1u
.tran 20u 10m
.end`],
      ['21. Capacitor via Thevenin divider', `* Capacitor charging via divider
V1 in 0 DC 10
R1 in a 10k
R2 a 0 10k
C1 a 0 1u
.tran 50u 50m
.end`],
      ['22. Coupled RC stages', `* Coupled RC stages
V1 in 0 PULSE(0 5 0 1n 1n 10m 20m)
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 2u
.tran 50u 20m
.end`]
    ]},
    {topic:'3. AC Frequency Response & Filters', items:[
      ['23. RC low-pass', `* RC low-pass
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 50 10 1meg
.end`],
      ['24. RC high-pass', `* RC high-pass
V1 in 0 AC 1
C1 in out 100n
R1 out 0 1k
.ac dec 50 10 1meg
.end`],
      ['25. RL low-pass', `* RL low-pass
V1 in 0 AC 1
L1 in out 10m
R1 out 0 100
.ac dec 50 10 1meg
.end`],
      ['26. RL high-pass', `* RL high-pass
V1 in 0 AC 1
R1 in out 100
L1 out 0 10m
.ac dec 50 10 1meg
.end`],
      ['27. Series RLC band-pass', `* Series RLC band-pass
V1 in 0 AC 1
L1 in a 10m
C1 a out 1u
R1 out 0 10
.ac dec 100 100 100k
.end`],
      ['28. Series LC notch', `* LC notch at 1.59 kHz
V1 in 0 AC 1
R1 in out 100
L1 out m 10m
C1 m 0 1u
.ac dec 100 100 100k
.end`],
      ['29. Parallel LC band-pass', `* Parallel resonant band-pass
V1 in 0 AC 1
R1 in out 1k
L1 out 0 10m
C1 out 0 1u
.ac dec 100 100 100k
.end`],
      ['30. Second-order LC low-pass', `* Second-order LC low-pass
V1 in 0 AC 1
L1 in out 10m
C1 out 0 1u
R1 out 0 50
.ac dec 50 100 100k
.end`],
      ['31. Second-order CL high-pass', `* Second-order high-pass
V1 in 0 AC 1
C1 in out 1u
L1 out 0 10m
R1 out 0 100
.ac dec 50 100 100k
.end`],
      ['32. Twin-T notch filter', `* Twin-T notch
V1 in 0 AC 1
R1 in a 10k
R2 a out 10k
C3 a 0 20n
C1 in b 10n
C2 b out 10n
R3 b 0 5k
R4 out 0 1meg
.ac dec 100 10 100k
.end`],
      ['33. Wien bridge network', `* Wien network band-pass
V1 in 0 AC 1
R1 in a 10k
C1 a out 10n
R2 out 0 10k
C2 out 0 10n
.ac dec 100 10 100k
.end`],
      ['34. Two-stage RC low-pass', `* Cascaded RC low-pass
V1 in 0 AC 1
R1 in a 1k
C1 a 0 100n
R2 a out 1k
C2 out 0 100n
.ac dec 50 10 1meg
.end`],
      ['35. Three-stage RC phase shifter', `* Three-stage RC phase shifter
V1 in 0 AC 1
C1 in a 10n
R1 a 0 10k
C2 a b 10n
R2 b 0 10k
C3 b out 10n
R3 out 0 10k
.ac dec 100 10 100k
.end`],
      ['36. Lead network', `* Lead network
V1 in 0 AC 1
R1 in out 10k
C1 in out 10n
R2 out 0 1k
.ac dec 50 10 1meg
.end`],
      ['37. Lag network', `* Lag network
V1 in 0 AC 1
R1 in out 10k
R2 out m 1k
C1 m 0 100n
.ac dec 50 1 100k
.end`],
      ['38. Pi (C-L-C) filter, 50 ohm', `* Pi filter 50 ohm
V1 src 0 AC 1
R1 src in 50
C1 in 0 1u
L1 in out 10m
C2 out 0 1u
R2 out 0 50
.ac dec 50 100 1meg
.end`]
    ]},
    {topic:'4. Diodes & Rectifiers', items:[
      ['39. Diode forward I-V curve', `* Diode forward I-V
V1 in 0 DC 0
R1 in a 100
D1 a 0 DX
${DX}
.op
.dc V1 0 5 0.05
.end`],
      ['40. Reverse-biased diode', `* Diode reverse and forward sweep
V1 in 0 DC -5
R1 in a 1k
D1 a 0 DX
${DX}
.op
.dc V1 -10 5 0.25
.end`],
      ['41. Half-wave rectifier', `* Half-wave rectifier
V1 in 0 SIN(0 5 50)
D1 in out DX
R1 out 0 1k
${DX}
.tran 0.1m 60m
.end`],
      ['42. Half-wave with filter cap', `* Half-wave rectifier with filter
V1 in 0 SIN(0 5 50)
D1 in out DX
C1 out 0 10u
R1 out 0 1k
${DX}
.tran 0.1m 60m
.end`],
      ['43. Full-wave bridge rectifier', `* Full-wave bridge rectifier
V1 a b SIN(0 10 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
R2 p 0 1k
${DX}
.tran 0.1m 60m
.end`],
      ['44. Center-tapped full-wave', `* Center-tapped full-wave rectifier
V1 a 0 SIN(0 10 50)
V2 b 0 SIN(0 10 50 0 0 180)
D1 a out DX
D2 b out DX
R1 out 0 1k
${DX}
.tran 0.1m 60m
.end`],
      ['45. Positive clipper', `* Diode clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
${DX}
.tran 5u 3m
.end`],
      ['46. Bidirectional clipper', `* Bidirectional clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
D2 0 out DX
${DX}
.tran 5u 3m
.end`],
      ['47. Biased clipper', `* Biased clipper
V1 in 0 SIN(0 5 1k)
Vb ref 0 DC 2
R1 in out 1k
D1 out ref DX
${DX}
.tran 5u 3m
.end`],
      ['48. Diode clamper (DC restorer)', `* Diode clamper
V1 in 0 SIN(0 5 1k)
C1 in out 10u
D1 0 out DX
R1 out 0 100k
${DX}
.tran 5u 10m
.end`],
      ['49. Voltage doubler', `* Voltage doubler
V1 in 0 SIN(0 5 1k)
C1 in a 1u
D1 0 a DX
D2 a out DX
C2 out 0 1u
R1 out 0 10k
${DX}
.tran 10u 30m
.end`],
      ['50. Series diode reference', `* Series diode reference
V1 in 0 DC 9
R1 in a 1k
D1 a b DX
D2 b c DX
D3 c 0 DX
${DX}
.op
.dc V1 0 9 0.25
.end`],
      ['51. LED with current-limiting R', `* LED with current-limiting resistor
V1 1 0 SIN(0 5 100 0 0 0)
R1 1 a 330
D1 a 0 LED
.model LED D(Is=1e-18 N=2)
.tran 0.1m 30m
.end`]
    ]},
    {topic:'5. Source Waveforms', items:[
      ['52. Exponentially damped sine', `* Damped sine source
V1 in 0 SIN(0 5 1k 0 500 0)
R1 in 0 1k
.tran 5u 5m
.end`],
      ['53. Square wave into RC filter', `* Square wave into RC filter
V1 in 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 in out 1.6k
C1 out 0 100n
.tran 5u 5m
.end`],
      ['54. Two series sines (beat)', `* Beat between 1 kHz and 1.1 kHz
V1 a 0 SIN(0 1 1k)
V2 b a SIN(0 1 1.1k)
R1 b 0 1k
.tran 10u 20m
.end`]
    ]},
    {topic:'6. Applications', items:[
      ['55. Bridge rectifier + reservoir cap', `* Bridge rectifier with filter cap
V1 a b SIN(0 12 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
C1 p 0 470u
R2 p 0 100
${DX}
.tran 0.1m 100m
.end`],
      ['56. Series-pass regulator', `* Series-pass regulator
Vin vin 0 DC 15
R1 vin b 2.2k
D1 b 0 LED
Q1 vin b out QN
R2 out 0 1k
.model LED D(Is=1e-18 N=2)
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vin 0 15 0.25
.end`],
      ['57. 3rd-order Butterworth LC low-pass', `* 3rd-order Butterworth LC low-pass
V1 src 0 AC 1
R1 src in 50
C1 in 0 3.18u
L1 in out 15.9m
C2 out 0 3.18u
R2 out 0 50
.ac dec 50 100 100k
.end`],
      ['58. LC delay line (4 sections)', `* LC delay line
V1 src 0 PULSE(0 1 0 1u 1u 200u 1m)
R1 src a 32
C1 a 0 1u
L1 a b 1m
C2 b 0 1u
L2 b c 1m
C3 c 0 1u
L3 c d 1m
C4 d 0 1u
R2 d 0 32
.tran 1u 500u
.end`]
    ]}
  ];
  window.SPICE_EXAMPLES = EXAMPLES;
  const SAMPLE = EXAMPLES[0].items[0][1];

  /* ---------- SPICE number parser (1k, 10meg, 4.7u, 1e-6 ...) ---------- */
  function num(s){
    if (s === undefined) return NaN;
    const m = String(s).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµμ]*)/i);
    if (!m) return NaN;
    const n = parseFloat(m[1]), u = m[2].toLowerCase();
    let k = 1;
    if (u.startsWith('meg')) k = 1e6;
    else if (u[0] === 't') k = 1e12;
    else if (u[0] === 'g') k = 1e9;
    else if (u[0] === 'k') k = 1e3;
    else if (u[0] === 'm') k = 1e-3;
    else if (u[0] === 'u' || u[0] === 'µ' || u[0] === 'μ') k = 1e-6;
    else if (u[0] === 'n') k = 1e-9;
    else if (u[0] === 'p') k = 1e-12;
    else if (u[0] === 'f') k = 1e-15;
    return n * k;
  }
  const normNode = n => { n = String(n).toLowerCase(); return (n === '0' || n === 'gnd') ? '0' : n; };

  const LED_COLORS = {
    red:{color:'#e2555a', vf:2.0}, orange:{color:'#f08a3c', vf:2.0}, amber:{color:'#eab24d', vf:2.1},
    yellow:{color:'#f5e663', vf:2.1}, green:{color:'#59c97a', vf:2.2},
    blue:{color:'#4a9ce0', vf:3.0}, white:{color:'#f4f1ea', vf:3.2}
  };

  /* ---------- parser ---------- */
  function parseNetlist(text){
    const warns = [], elems = [], models = {};
    const tm = text.split(/\r?\n/).map(l => l.trim()).find(l => /^\*+\s*\S/.test(l));
    const title = tm ? tm.replace(/^\*+\s*/, '').trim() : '';
    const lines = [];
    text.split(/\r?\n/).forEach(raw=>{
      let l = raw.trim();
      if (!l || l[0] === ';') return;
      if (l[0] === '+' && lines.length) lines[lines.length-1] += ' ' + l.slice(1);
      else lines.push(l);
    });
    lines.forEach((line, idx)=>{
      let comment = '';
      const si = line.indexOf(';');
      if (si >= 0){ comment = line.slice(si+1).toLowerCase(); line = line.slice(0, si).trim(); }
      if (!line) return;
      if (line[0] === '*') return;
      if (line[0] === '.'){
        const t = line.split(/\s+/);
        if (t[0].toLowerCase() === '.model' && t[1]) models[t[1].toLowerCase()] = line.toLowerCase();
        return;
      }
      const tk = line.replace(/[(),]/g, ' ').trim().split(/\s+/);
      const name = tk[0], ch = name[0].toUpperCase();
      if (tk.length < 3){ if (idx > 0) warns.push('Skipped: ' + line); return; }
      const n1 = normNode(tk[1]), n2 = normNode(tk[2]);
      const ic = (line.match(/ic\s*=\s*(\S+)/i) || [])[1];
      const icv = ic !== undefined ? num(ic) : 0;

      if (/^LED/i.test(name) || ch === 'D'){
        const extra = tk.slice(3).map(t => t.toLowerCase());
        const model = extra[0] || '';
        const mline = models[model] || '';
        const colorWord = Object.keys(LED_COLORS).find(w => extra.some(t => t.includes(w)) || mline.includes(w));
        const isLed = /^LED/i.test(name) || extra.some(t => t.includes('led')) || mline.includes('led') || !!colorWord;
        const vfTok = (line.match(/\bvf\s*=\s*([^\s,)]+)/i) || mline.match(/\bvf\s*=\s*([^\s,)]+)/i) || [])[1];
        let vf = vfTok !== undefined ? num(vfTok) : NaN;
        if (isNaN(vf)) vf = isLed ? (LED_COLORS[colorWord || 'red'].vf) : 0.7;
        const params = {vf};
        if (isLed) params.color = LED_COLORS[colorWord || 'red'].color;
        elems.push({name, type: isLed ? 'led' : 'diode', nodes:[n1,n2], params});
      } else if (ch === 'R' && /^RV/i.test(name) && tk.length >= 5){
        const R = num(tk[4]), w = parseFloat((line.match(/wiper\s*=\s*([\d.]+)/i) || [])[1]);
        elems.push({name, type:'potentiometer', nodes:[n1, n2, normNode(tk[3])],
                    params:{resistance: isNaN(R) ? 10000 : R, wiper: isNaN(w) ? 0.5 : w}});
      } else if (/^LAMP/i.test(name) || (ch === 'R' && /\blamp\b/.test(comment))){
        const v = num(tk[3]);
        elems.push({name, type:'lamp', nodes:[n1,n2], params:{resistance: isNaN(v) ? 100 : v}});
      } else if (/^(AM|VAM|VSENSE|VMETER)\d*$/i.test(name) || (ch === 'V' && /ammeter/.test(comment))){
        elems.push({name, type:'ammeter', nodes:[n1,n2], params:{}});
      } else if (ch === 'R' || ch === 'C' || ch === 'L'){
        const v = num(tk[3]);
        if (isNaN(v)){ if (idx > 0) warns.push('Bad value: ' + line); return; }
        if (ch === 'R') elems.push({name, type:'resistor', nodes:[n1,n2], params:{resistance:v}});
        if (ch === 'C') elems.push({name, type:'capacitor', nodes:[n1,n2], params:{capacitance:v, ic:icv||0}});
        if (ch === 'L') elems.push({name, type:'inductor', nodes:[n1,n2], params:{inductance:v, ic:icv||0}});
      } else if (ch === 'V' || ch === 'I'){
        const rest = tk.slice(3), kw = (rest[0] || '').toLowerCase();
        if (ch === 'I'){
          const v = kw === 'dc' ? num(rest[1]) : num(rest[0]);
          elems.push({name, type:'currentsource', nodes:[n1,n2], params:{current: isNaN(v)?0:v}});
          if (kw === 'pulse') warns.push(name + ': current PULSE not supported (set to 0 A).');
        } else if (kw === 'sin'){
          const p = rest.slice(1).map(num);
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'sine', amplitude:p[1]||1, frequency:p[2]||1000, phase:p[5]||0}});
          if (p[0]) warns.push(name + ': DC offset ignored (AC source has no offset).');
        } else if (kw === 'pulse'){
          const p = rest.slice(1).map(num);
          const amp = ((p[1]||0) - (p[0]||0)) / 2, per = p[6];
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'square', amplitude:amp||1, frequency: per>0 ? 1/per : 1000, phase:0}});
          warns.push(name + ': PULSE approximated as a ±square wave.');
        } else if (kw === 'ac'){
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'sine', amplitude:num(rest[1])||1, frequency:1000, phase:0}});
          warns.push(name + ': AC source set to 1 kHz sine.');
        } else {
          const v = kw === 'dc' ? num(rest[1]) : num(rest[0]);
          elems.push({name, type:'battery', nodes:[n1,n2], params:{voltage: isNaN(v)?0:v}});
        }
      } else if (ch === 'S'){
        elems.push({name, type:'switch', nodes:[n1,n2], params:{closed: !/\boff\b/i.test(line)}});
      } else {
        warns.push('Unsupported element: ' + name);
      }
    });
    return {elems, warns, title};
  }

  /* ---------- auto layout + draw ---------- */
  function buildCircuit(text){
    const {elems, warns, title} = parseNetlist(text);
    if (!elems.length) throw new Error('No supported components found.');

    if (!elems.some(e => e.nodes.includes('0'))){
      const g = elems[0].nodes[0];
      elems.forEach(e => e.nodes = e.nodes.map(n => n === g ? '0' : n));
      warns.push('No node 0 found — node "' + g + '" used as ground.');
    }

    stopSim && stopSim();
    circuit.clear(); circuit.title = title;
    state.selection.clear(); state.wireSelection.clear(); state.probes = [];
    sim.lastResult = null; state.history = {t:[], series:{}};

    const GY = 4, SLOT = 6;
    const railIdx = new Map(), taps = new Map();
    const railY = n => n === '0' ? GY : -3 - 2 * railIdx.get(n);
    elems.forEach(e => e.nodes.forEach(n => {
      if (n !== '0' && !railIdx.has(n)) railIdx.set(n, railIdx.size);
    }));
    const tap = (n, x) => { if (!taps.has(n)) taps.set(n, []); taps.get(n).push(x); };

    elems.forEach((e, i)=>{
      const x0 = i * SLOT;
      const c = circuit.addComponent(e.type, x0, 0, 0, e.params);
      c.label = e.name;
      e.nodes.forEach((n, t)=>{
        const T = COMP[e.type].terminals[t];
        const tx = x0 + T.x, ty = T.y;
        circuit.addWire(tx, ty, tx, railY(n));
        tap(n, tx);
      });
    });

    const gx = elems.length * SLOT;
    circuit.addComponent('ground', gx, GY + 1, 0);
    tap('0', gx);

    taps.forEach((xs, n)=>{
      xs = [...new Set(xs)].sort((a,b)=>a-b);
      for (let i = 0; i < xs.length - 1; i++) circuit.addWire(xs[i], railY(n), xs[i+1], railY(n));
    });

    renderAll(); updatePropsPanel(); refreshNetlist(); renderMeters();
    document.getElementById('btn-fit').click();
    return {count: elems.length, warns};
  }

  window.importNetlistText = buildCircuit;

  /* ---------- netlist export ---------- */
  const colorName = hex => (Object.keys(LED_COLORS).find(k => LED_COLORS[k].color === hex) || 'red');
  window.buildNetlistText = buildNetlistText = function(circ){
    const info = extractNodes(circ);
    if (!info.hasGround) return '* ⚠ No ground reference placed.\n* Add a Ground component to solve the circuit.';
    const nd = (c,i) => { const n = nodeOf(info, c.id, i); return n === 0 ? '0' : 'n' + n; };
    const pre = {resistor:'R',lamp:'R',capacitor:'C',inductor:'L',battery:'V',acsource:'V',
                 currentsource:'I',switch:'S',diode:'D',led:'D',potentiometer:'R',ammeter:'V'};
    const lines = ['* Voltra netlist — auto-generated', '* Node 0 = GND', ''], models = new Set();
    circ.components.forEach(c=>{
      if (c.type === 'ground') return;
      const p = pre[c.type] || 'X', num = c.id.replace(/\D/g,'');
      const nm = c.type === 'potentiometer'
        ? (/^RV/i.test(c.label||'') ? c.label : 'RV' + num)
        : ((c.label && (c.label[0].toUpperCase() === p || (c.type === 'led' && /^LED/i.test(c.label)))) ? c.label : p + num);
      const n = [0,1].map(i => nd(c,i)), q = c.params;
      let v = '';
      switch(c.type){
        case 'resistor': v = q.resistance; break;
        case 'lamp': v = q.resistance + ' ; lamp'; break;
        case 'capacitor': v = q.capacitance + (q.ic ? ' IC=' + q.ic : ''); break;
        case 'inductor': v = q.inductance + (q.ic ? ' IC=' + q.ic : ''); break;
        case 'battery': v = 'DC ' + q.voltage; break;
        case 'ammeter': v = 'DC 0 ; ammeter'; break;
        case 'currentsource': v = 'DC ' + q.current; break;
        case 'switch': v = q.closed ? 'ON' : 'OFF'; break;
        case 'acsource': {
          const w = q.waveform || 'sine', T = 1 / Math.max(1e-6, q.frequency);
          v = w === 'square' ? 'PULSE(' + (-q.amplitude) + ' ' + q.amplitude + ' 0 0 0 ' + T/2 + ' ' + T + ')'
                             : 'SIN(0 ' + q.amplitude + ' ' + q.frequency + ' 0 0 ' + (q.phase||0) + ')' + (w === 'sine' ? '' : ' ; ' + w);
          break;
        }
        case 'diode': { const m = 'DMOD' + String(q.vf).replace(/\W/g,''); models.add('.model ' + m + ' D(Vf=' + q.vf + ')'); v = m; break; }
        case 'led':   { const m = 'LED_' + colorName(q.color).toUpperCase(); models.add('.model ' + m + ' D(Vf=' + q.vf + ') ; LED ' + colorName(q.color)); v = m; break; }
        case 'potentiometer':
          lines.push(nm + ' ' + n[0] + ' ' + n[1] + ' ' + nd(c,2) + ' ' + q.resistance + ' wiper=' + q.wiper);
          return;
      }
      lines.push(nm + ' ' + n[0] + ' ' + n[1] + ' ' + v);
    });
    if (models.size) lines.push('', ...models);
    lines.push('', '.op', '.end');
    return lines.join('\n');
  };

  /* ---------- UI: "Create Circuit" tab in the right panel ---------- */
  const css = document.createElement('style');
  css.textContent = `
    #main{grid-template-columns:216px 1fr 340px !important;}
    #spice-in{width:100%; height:250px; resize:vertical; background:var(--bg-3); color:var(--text-0);
      border:1px solid var(--line); border-radius:var(--radius); padding:10px; font-family:var(--mono);
      font-size:11.5px; line-height:1.6; outline:none; white-space:pre; tab-size:4;}
    #spice-in:focus{border-color:var(--teal);}
    .spice-help{font-size:10.5px; color:var(--text-2); line-height:1.6; margin:0 0 10px;}
    .spice-opt{display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-1); margin:10px 0;}
  `;
  document.head.appendChild(css);

  const tab = document.getElementById('tab-spice');
  const pane = document.getElementById('pane-spice');
  if (!tab || !pane) return;

  const input = document.getElementById('spice-in');
  input.value = SAMPLE;

  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rp-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active'); pane.classList.add('active');
  });

  input.addEventListener('keydown', e=>{
    if (e.key === 'Tab'){
      e.preventDefault();
      const s = input.selectionStart;
      input.value = input.value.slice(0, s) + '    ' + input.value.slice(input.selectionEnd);
      input.selectionStart = input.selectionEnd = s + 4;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
      e.preventDefault(); create();
    }
  });
  window.addEventListener('keydown', e=>{ if (e.target === input) e.stopPropagation(); }, true);

  function create(){
    try{
      const r = buildCircuit(input.value);
      r.warns.forEach(w => log(w, 'warn'));
      log('Circuit created from netlist (' + r.count + ' components)', 'ok');
      toast('Circuit created — ' + r.count + ' components');
      if (document.getElementById('spice-autorun').checked) startSim();
    }catch(err){
      toast(err.message, 'err'); log('Netlist error: ' + err.message, 'err');
    }
  }
  document.getElementById('spice-create').addEventListener('click', create);

  /* ---------- examples drop-down (flexible size, grouped by topic) ---------- */
  const btn  = document.getElementById('spice-sample');
  const menu = document.getElementById('ex-menu');
  const lbl  = btn.querySelector('.ex-label');
  document.body.appendChild(menu);   // top-level popup: never clipped, always above the panels
  let lastW = window.innerWidth;
  const DEFAULT_LABEL = '📂 Load example…';

  EXAMPLES.forEach((g, gi)=>{
    const h = document.createElement('div');
    h.className = 'ex-topic'; h.textContent = g.topic;
    menu.appendChild(h);
    g.items.forEach((it, ii)=>{
      const o = document.createElement('div');
      o.className = 'ex-item'; o.textContent = it[0]; o.dataset.g = gi; o.dataset.i = ii;
      menu.appendChild(o);
    });
  });

  function placeMenu(){
    const r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(Math.max(r.width, 270), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    const below = vh - r.bottom - 12, above = r.top - 12;
    const openUp = below < 240 && above > below;
    const maxH = Math.max(160, Math.min(openUp ? above : below, 400));
    menu.style.left = left + 'px';
    menu.style.width = w + 'px';
    menu.style.maxHeight = maxH + 'px';
    if (openUp){ menu.style.top = 'auto'; menu.style.bottom = (vh - r.top + 4) + 'px'; }
    else       { menu.style.bottom = 'auto'; menu.style.top = (r.bottom + 4) + 'px'; }
  }
  function openMenu(){
    menu.hidden = false; btn.classList.add('open'); lastW = window.innerWidth; placeMenu();
    const cur = menu.querySelector('.ex-item.sel'); if (cur) cur.scrollIntoView({block:'nearest'});
  }
  function closeMenu(){ menu.hidden = true; btn.classList.remove('open'); }

  btn.addEventListener('click', e=>{ e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  menu.addEventListener('click', e=>{
    const o = e.target.closest('.ex-item'); if (!o) return;
    const g = +o.dataset.g, i = +o.dataset.i;
    input.value = EXAMPLES[g].items[i][1];
    input.dispatchEvent(new Event('input', {bubbles:true}));   // refresh syntax highlighting
    input.scrollTop = 0;
    menu.querySelectorAll('.ex-item.sel').forEach(x => x.classList.remove('sel'));
    o.classList.add('sel');
    lbl.textContent = EXAMPLES[g].items[i][0];
    closeMenu();
    toast('Loaded: ' + EXAMPLES[g].items[i][0]);
  });
  document.addEventListener('pointerdown', e=>{ if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('keydown', e=>{ if (e.key === 'Escape' && !menu.hidden) closeMenu(); }, true);
  /* phones fire 'resize' (address bar, keyboard) and 'scroll' constantly: only a real width change closes the list */
  window.addEventListener('resize', ()=>{ if (window.innerWidth !== lastW){ lastW = window.innerWidth; closeMenu(); } });

  document.getElementById('spice-clear').addEventListener('click', ()=>{
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
    menu.querySelectorAll('.ex-item.sel').forEach(x => x.classList.remove('sel'));
    lbl.textContent = DEFAULT_LABEL;
    input.focus();
  });
})();
