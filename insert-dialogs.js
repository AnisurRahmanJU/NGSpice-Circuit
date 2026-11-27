/* insert-dialogs.js — "+ Analysis" extras: .subckt, .model and * comment (typed by hand or auto-generated from the circuit).
   Load AFTER ngspice.js.  Comments are kept when the schematic is edited (they stay attached to the element / directive below them). */
(function () {
  'use strict';
  const MOD = { D: ['D', 'D', 'Is=1e-14 N=1'], LED: ['LED', 'D', 'Is=1e-18 N=2'], Zener: ['ZEN', 'D', 'Is=1n N=1 Bv=5.1 Ibv=1m'], NPN: ['QN', 'NPN', 'Is=1e-14 Bf=200'], PNP: ['QP', 'PNP', 'Is=1e-14 Bf=100'], NMOS: ['NM', 'NMOS', 'Vto=1 Kp=100u Lambda=0.02'], PMOS: ['PM', 'PMOS', 'Vto=-1 Kp=50u Lambda=0.02'], Switch: ['SW1', 'SW', 'Ron=1 Roff=1meg Vt=0.5 Vh=0.05'] };
  const GUESS = { D: 'D', LED: 'LED', ZEN: 'Zener', QN: 'NPN', QP: 'PNP', MN: 'NMOS', MN4: 'NMOS', MP: 'PMOS', MP4: 'PMOS' };
  const SUB = { blank: ['MYSUB', 'in out gnd', 'R1 in out 1k\nR2 out gnd 1k'], lowpass: ['RCLP', 'in out gnd', 'R1 in out 1k\nC1 out gnd 100n'], divider: ['VDIV', 'in out gnd', 'R1 in out 10k\nR2 out gnd 10k'] };

  function modal(title, html, ok, onOk) {
    const b = document.createElement('div'); b.className = 'dlg-back';
    b.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><h3>${title}</h3><div class="dlg-b">${html}</div><div class="dlg-e"><span class="dlg-m"></span><button class="dc">Cancel</button><button class="run dok">${ok}</button></div></div>`;
    document.body.appendChild(b);
    const q = (s) => b.querySelector(s), close = () => b.remove(), msg = (t) => { q('.dlg-m').textContent = t; };
    q('.dc').onclick = close;
    b.addEventListener('mousedown', (e) => { if (e.target === b) close(); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    q('.dok').onclick = () => { if (onOk(q, msg) !== false) close(); };
    return { q, msg, close };
  }
  /* put lines into the editor: 'pre' = before the analyses, 'top' = after .title, 'cursor', 'end' = before .end */
  function put(lines, where) {
    lines = lines.join('\n').split('\n');
    const ls = src.value.replace(/\s+$/, '').split('\n'), endI = () => { const i = ls.findIndex((l) => /^\s*\.end\s*$/i.test(l)); return i < 0 ? ls.length : i; };
    let at;
    if (where === 'pre') { at = ls.findIndex((l) => /^\s*\.(op|dc|ac|tran|control)\b/i.test(l)); if (at < 0) at = endI(); }
    else if (where === 'top') { let i = ls.findIndex((l) => /^\s*\.title\b/i.test(l)); if (i < 0) { ls.unshift('.title ' + ((S.P && S.P.title) || 'Circuit')); i = 0; } at = i + 1; }
    else if (where === 'cursor') at = Math.min(ls.length, src.value.slice(0, src.selectionStart).split('\n').length - 1);
    else at = endI();
    ls.splice(at, 0, ...lines); src.value = ls.join('\n'); onText(true);
    try { const a = ls.slice(0, at).join('\n').length + (at ? 1 : 0); src.focus(); src.setSelectionRange(a, a + lines.join('\n').length); src.scrollTop = Math.max(0, at - 3) * 20; } catch (_) {}
  }

  /* ---------------- .model ---------------- */
  function dModel() {
    const P = S.P, mods = modsOf(P), need = [];
    P.els.forEach((e) => { if ('DQM'.includes(e.k)) { const m = (e.tail || '').split(/\s+/)[0]; if (m && !mods[m.toLowerCase()] && !need.some((n) => n[0].toLowerCase() === m.toLowerCase())) need.push([m, GUESS[typeFor(e, mods)] || 'D']); } });
    const d = modal('Add .model', `<div class="dlg-chips">${need.length ? 'Used by the circuit but not defined (click to fill): ' + need.map((n, i) => `<button data-i="${i}">${esc(n[0])}</button>`).join('') : '<span class="hint">Every model used by the circuit is already defined.</span>'}</div>
      <label>Type<select id="mT">${Object.keys(MOD).map((k) => `<option>${k}</option>`).join('')}</select></label>
      <label>Model name<input type="text" id="mN"></label><label>Parameters<input type="text" id="mP" spellcheck="false"></label><pre id="mR"></pre>`, 'Insert',
    (q, msg) => {
      const n = q('#mN').value.trim(), t = q('#mT').value, p = q('#mP').value.trim();
      if (!/^[A-Za-z_][\w.$-]*$/.test(n)) { msg('Enter a valid model name'); return false; }
      if (mods[n.toLowerCase()]) { msg('Model “' + n + '” already exists'); return false; }
      put(['.model ' + n + ' ' + MOD[t][1] + '(' + p + ')'], 'pre');
    });
    const q = d.q, T = q('#mT'), N = q('#mN'), Pp = q('#mP'), R = q('#mR');
    const show = () => { R.textContent = '.model ' + (N.value.trim() || '?') + ' ' + MOD[T.value][1] + '(' + Pp.value.trim() + ')'; };
    T.onchange = () => { N.value = MOD[T.value][0]; Pp.value = MOD[T.value][2]; show(); };
    N.oninput = Pp.oninput = show;
    q('.dlg-chips').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const n = need[+b.dataset.i]; T.value = n[1]; T.onchange(); N.value = n[0]; show(); };
    T.onchange();
  }

  /* ---------------- .subckt ---------------- */
  function dSub() {
    const P = S.P, names = Object.keys(CELLS).concat(['NE555']);
    const tpl = (k) => { if (SUB[k]) return SUB[k]; if (k === 'NE555') return ['NE555', NE555_SUB[0].split(/\s+/).slice(2).join(' '), NE555_SUB.slice(1, -1).join('\n')]; const c = CELLS[k]; return [k, c[0], c.slice(1).join('\n')]; };
    const d = modal('Add .subckt', `<label>Template<select id="sT"><option value="blank">Blank (2 resistors)</option><option value="lowpass">RC low-pass</option><option value="divider">Voltage divider</option><optgroup label="Library">${names.map((n) => `<option>${n}</option>`).join('')}</optgroup></select></label>
      <label>Name<input type="text" id="sN"></label><label>Ports (space separated)<input type="text" id="sP"></label>
      <label>Body (one element per line)<textarea id="sB" rows="8" spellcheck="false"></textarea></label><p class="hint" id="sH"></p>`, 'Insert',
    (q, msg) => {
      const n = q('#sN').value.trim(), po = q('#sP').value.trim().split(/\s+/).filter(Boolean), b = q('#sB').value.replace(/\s+$/, '');
      if (!/^[A-Za-z_][\w$-]*$/.test(n)) { msg('Enter a valid subcircuit name'); return false; }
      if (!po.length) { msg('Add at least one port'); return false; }
      if (!b.trim()) { msg('The body is empty'); return false; }
      if (P.dirs.some((x) => new RegExp('^\\.subckt\\s+' + n + '\\s', 'i').test(x))) { msg('Subcircuit “' + n + '” already exists'); return false; }
      const txt = ['.subckt ' + n + ' ' + po.join(' '), b, '.ends ' + n].join('\n'), mo = modsOf(P);
      const ex = libFor([...b.matchAll(/^X\S*\s.*\s(\S+)\s*$/gim)].map((m) => m[1]), P.dirs.concat([txt]));
      if (/\b(NM|PM)\b/.test(b)) CMOS_MODELS.forEach((l) => { if (!mo[l.split(/\s+/)[1].toLowerCase()] && !ex.includes(l)) ex.unshift(l); });
      put(ex.concat([txt]), 'pre');
    });
    const q = d.q, T = q('#sT'), upd = () => { q('#sH').textContent = 'Use it in the circuit with:  X1 ' + q('#sP').value.trim() + ' ' + q('#sN').value.trim(); };
    T.onchange = () => { const t = tpl(T.value); q('#sN').value = t[0]; q('#sP').value = t[1]; q('#sB').value = t[2]; upd(); };
    q('#sN').oninput = q('#sP').oninput = upd; T.onchange();
  }

  /* ---------------- comments ---------------- */
  function scan(ls) {
    let ctl = 0, sub = 0;
    return ls.map((raw) => {
      const s = raw.trim();
      if (ctl) { if (/^\.endc\b/i.test(s)) ctl = 0; return 'ctl'; }
      if (/^\.control\b/i.test(s)) { ctl = 1; return 'ctl'; }
      if (sub) { if (/^\.subckt\b/i.test(s)) sub++; else if (/^\.ends\b/i.test(s)) sub--; return 'sub'; }
      if (!s) return 'blank'; if (s[0] === '*' || s[0] === ';') return 'cm'; if (s[0] === '+') return 'cont';
      if (s[0] === '.') { if (/^\.subckt\b/i.test(s)) { sub = 1; return 'dir'; } return /^\.title\b/i.test(s) ? 'title' : 'dir'; }
      return 'el';
    });
  }
  function describe(e, mods) {
    const T = typeFor(e, mods), a = e.pins[0], b = e.pins[1], g = (x) => (x === '0' ? 'ground' : x), v = (e.tail || '').split(/\s+/)[0], E = (x) => eng(num(x)), n = e.n + ': ';
    switch (T) {
      case 'R': return n + E(v) + 'Ω resistor between ' + g(a) + ' and ' + g(b);
      case 'BULB': return n + 'bulb, ' + E(v) + 'Ω filament between ' + g(a) + ' and ' + g(b) + ' (glows while the simulation runs)';
      case 'FAN': return n + 'fan (DC motor), ' + E(v) + 'Ω winding between ' + g(a) + ' and ' + g(b);
      case 'VM': return n + 'voltmeter across ' + g(a) + ' (+) and ' + g(b) + ' (−), reads V(' + a + ')−V(' + b + ')';
      case 'AM': return n + 'ammeter in series, current flows from ' + g(a) + ' (+) to ' + g(b) + ' (−)';
      case 'C': case 'Cp': return n + E(v) + 'F capacitor between ' + g(a) + ' and ' + g(b);
      case 'L': return n + E(v) + 'H inductor between ' + g(a) + ' and ' + g(b);
      case 'V': case 'I': { const s = spec(e.val), w = s.w, kd = w ? { sin: 'sine', pulse: 'pulse', pwl: 'piecewise-linear', tri: 'triangle', saw: 'sawtooth', noise: 'noise' }[w.t] : (s.acm && !s.dc ? 'AC' : 'DC');
        return T === 'V' ? n + kd + ' voltage source' + (w ? '' : ' ' + eng(s.dc) + 'V') + ', + at ' + g(a) + ', − at ' + g(b) : n + kd + ' current source' + (w ? '' : ' ' + eng(s.dc) + 'A') + ', flows from ' + g(a) + ' to ' + g(b); }
      case 'D': case 'LED': case 'ZEN': return n + (T === 'LED' ? 'LED' : T === 'ZEN' ? 'Zener diode' : 'diode') + ', anode ' + g(a) + ', cathode ' + g(b) + ', model ' + v;
      case 'QN': case 'QP': return n + (T === 'QN' ? 'NPN' : 'PNP') + ' transistor: collector ' + g(a) + ', base ' + g(b) + ', emitter ' + g(e.pins[2]) + ', model ' + v;
      case 'MN': case 'MN4': case 'MP': case 'MP4': return n + (T[1] === 'N' ? 'N' : 'P') + '-channel MOSFET: drain ' + g(a) + ', gate ' + g(b) + ', source ' + g(e.pins[2]) + ', model ' + v;
      case 'OA': return n + 'ideal op-amp: output ' + g(a) + ', + input ' + g(e.pins[2]) + ', − input ' + g(e.pins[3]) + ', gain ' + v;
      case 'EV': return n + 'voltage-controlled voltage source, gain ' + v;
      case 'GV': return n + 'voltage-controlled current source, ' + v + 'S';
      case 'NE555': return n + '555 timer IC';
      default: return n + (T.startsWith('G_') ? 'CMOS ' + SYMS[T].def + ' gate' : e.k === 'X' ? 'subcircuit instance of ' + v : e.k + ' element');
    }
  }
  function dirDesc(s) {
    const t = s.split(/\s+/), k = t[0].toLowerCase();
    if (k === '.op') return 'DC operating point: bias voltage of every node and current of every source';
    if (k === '.dc') return 'DC sweep: ' + t[1] + ' from ' + t[2] + ' to ' + t[3] + ' in steps of ' + t[4];
    if (k === '.ac') return 'AC sweep (' + ({ dec: 'points per decade', oct: 'points per octave', lin: 'linear points' }[(t[1] || '').toLowerCase()] || t[1]) + '): ' + t[2] + ' points, ' + t[3] + 'Hz to ' + t[4] + 'Hz';
    if (k === '.tran') return 'Transient: time step ' + t[1] + ', stop time ' + t[2] + (/\buic\b/i.test(s) ? ', starts from the .ic values (uic)' : '');
    if (k === '.ic') return 'Initial conditions: start voltages of the capacitor nodes';
    if (k === '.model') return 'Device model ' + t[1] + ' (' + (t[2] || '').replace(/\(.*/, '').toUpperCase() + ')';
    if (k === '.subckt') return 'Subcircuit ' + t[1] + ' with ports ' + t.slice(2).join(' ');
    return '';
  }
  function auto(o) {
    let ls = src.value.replace(/\s+$/, '').split('\n'), K = scan(ls);
    const ti = ls.findIndex((l) => l.trim()), isT = ti >= 0 && /^\s*\*/.test(ls[ti]);
    if (o.rep) ls = ls.filter((l, i) => K[i] !== 'cm' || (isT && i === ti));
    K = scan(ls);
    const P = parse(ls.join('\n')), mods = modsOf(P), ins = [], t2 = ls.findIndex((l) => l.trim()), has = (i) => i > 0 && K[i - 1] === 'cm' && !(isT && i - 1 === t2);
    if (o.items) {
      P.els.forEach((e) => { if (!has(e.line)) ins.push([e.line, ['* ' + describe(e, mods)]]); });
      ls.forEach((l, i) => { if (K[i] !== 'dir' || has(i)) return; const t = dirDesc(l.trim()); if (t) ins.push([i, ['* ' + t]]); });
    }
    if (o.head && !ls.some((l) => /^\*\s*Circuit\s*:/i.test(l.trim()))) {
      const cnt = {}, nets = []; P.els.forEach((e) => { const t = typeFor(e, mods); cnt[t] = (cnt[t] || 0) + 1; e.pins.forEach((n) => { if (n !== '0' && !nets.includes(n)) nets.push(n); }); });
      const an = P.dirs.filter((d) => /^\.(op|dc|ac|tran)\b/i.test(d)).map((d) => d.trim()), ti2 = ls.findIndex((l) => /^\s*\.title\b/i.test(l)), bar = '* ----------------------------------------';
      ins.push([ti2 >= 0 ? ti2 + 1 : 0, (ti2 >= 0 ? [] : ['.title ' + P.title]).concat([bar, '* Circuit  : ' + P.title, '* Parts    : ' + P.els.length + ' (' + Object.entries(cnt).map(([k, v]) => k + '×' + v).join(', ') + ')', '* Nodes    : ' + (nets.join(', ') || '-') + ' (0 = ground)', '* Analyses : ' + (an.join(' | ') || 'none'), bar])]);
    }
    ins.sort((a, b) => b[0] - a[0]).forEach(([i, L]) => ls.splice(i, 0, ...L));
    return ls.join('\n');
  }
  function dCom() {
    const d = modal('Add comment', `<div class="rw"><label class="ck"><input type="radio" name="cM" value="a" checked> Auto-generate from circuit</label><label class="ck"><input type="radio" name="cM" value="m"> Type manually</label></div>
      <div id="cA"><label class="ck"><input type="checkbox" id="cH" checked> Header (title, nodes, analyses)</label><label class="ck"><input type="checkbox" id="cI" checked> Describe every component, .model, .subckt and analysis</label><label class="ck"><input type="checkbox" id="cR"> Replace existing comments</label></div>
      <div id="cMn" hidden><label>Comment (one line per row)<textarea id="cT" rows="4" placeholder="Type your comment…"></textarea></label><label>Place at<select id="cW"><option value="top">Top (after .title)</option><option value="cursor">Cursor line</option><option value="end">Bottom (before .end)</option></select></label></div>
      <pre id="cP"></pre>`, 'Insert',
    (q, msg) => {
      if (q('input[name=cM]:checked').value === 'a') { const t = auto(opts(q)); if (t === src.value.replace(/\s+$/, '')) { msg('Nothing to add: comments already exist'); return false; } src.value = t; onText(true); return; }
      const L = man(q); if (!L.length) { msg('Type a comment first'); return false; } put(L, q('#cW').value);
    });
    const q = d.q, opts = (q) => ({ head: q('#cH').checked, items: q('#cI').checked, rep: q('#cR').checked }),
      man = (q) => q('#cT').value.split('\n').filter((l) => l.trim()).map((l) => (/^\s*\*/.test(l) ? l.trim() : '* ' + l.trim())),
      show = () => { const a = q('input[name=cM]:checked').value === 'a'; q('#cA').hidden = !a; q('#cMn').hidden = a; q('#cP').textContent = a ? auto(opts(q)) : man(q).join('\n'); };
    d.q('.dlg-b').addEventListener('input', show); d.q('.dlg-b').addEventListener('change', show); show();
  }
  window.InsDlg = { open: (k) => { try { ({ model: dModel, subckt: dSub, comment: dCom })[k](); } catch (e) { toast('Could not open dialog: ' + e.message); } } };
})();
