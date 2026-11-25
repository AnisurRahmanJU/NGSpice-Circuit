/* dmm.js — Digital Multimeter (DMM) part.  Load AFTER ngspice.js and BEFORE live-effects.js.

   The DMM is registered from here (SYMS.DMM + palette entry + small hooks); ngspice.js is NOT edited.

   Look      : handheld meter - yellow holster, 4-digit 7-segment LCD (DC / AC / AUTO / unit / OL), rotary dial,
               three jacks (A, VΩ, COM) and two probe leads (red = pin 1, black = pin 2).
   Dial      : click a dial label (or the knob itself, Shift+click = back) on the canvas, or use the Mode list in the Properties panel.
               OFF | V~ (AC volts) | V⎓ (DC volts) | Ω (resistance) | A⎓ (DC amps) | A~ (AC amps)
   Netlist   : the dial position decides the SPICE element, so the netlist is always valid NGspice and survives a re-parse:
                 DC volts   RDMMDV1 a b 10meg      (high-impedance voltmeter, reads V(a) - V(b))
                 AC volts   RDMMAV1 a b 10meg      (same circuit, reads the AC RMS value)
                 DC amps    VDMMDA1 a b DC 0       (0 V source = ideal ammeter, reads the current a -> b)
                 AC amps    VDMMAA1 a b DC 0       (same circuit, reads the AC RMS value)
                 Ohms       IDMMO1  a b DC 1u      (1 µA test current, reads V / 1 µA)
                 OFF        RDMMOF1 a b 1G         (open circuit)
   Readings  : computed in live-effects.js from the solver result (window.DMM.fmt turns the number into LCD text).
   Safety    : live-effects.js burns the DMM (like the Ammeter / Voltmeter) when 10 000 A or more passes through it. */
(function () {
  'use strict';
  if (typeof SYMS === 'undefined' || typeof Object.assign !== 'function') return;

  /* ---------------------------------------------------------------- modes */
  const ORDER = ['off', 'acv', 'dcv', 'ohm', 'dca', 'aca'];
  const ANG = { off: -135, acv: -81, dcv: -27, ohm: 27, dca: 81, aca: 135 };            /* dial angle (deg, 0 = up) */
  const PRE = { off: 'RDMMOF', acv: 'RDMMAV', dcv: 'RDMMDV', ohm: 'IDMMO', dca: 'VDMMDA', aca: 'VDMMAA' };
  const DEF = { off: '1G', acv: '10meg', dcv: '10meg', ohm: 'DC 1u', dca: 'DC 0', aca: 'DC 0' };
  const TITLE = { off: 'OFF', acv: 'AC volts', dcv: 'DC volts', ohm: 'Resistance', dca: 'DC amps', aca: 'AC amps' };
  const NAMERX = [['off', /^rdmmof(\d|_|$)/i], ['acv', /^rdmmav(\d|_|$)/i], ['dcv', /^rdmmdv(\d|_|$)/i],
    ['ohm', /^idmmo(\d|_|$)/i], ['dca', /^vdmmda(\d|_|$)/i], ['aca', /^vdmmaa(\d|_|$)/i]];
  /* dial mode of a part name; null = not a DMM name */
  const modeName = (n) => { n = String(n || ''); for (const [m, rx] of NAMERX) if (rx.test(n)) return m; return null; };
  /* part (or part name) -> mode; a DMM without a recognised name (palette icon) shows the DC volts range */
  const mode = (p) => modeName(p && typeof p === 'object' ? p.n : p) || 'dcv';

  /* ---------------------------------------------------------------- reading -> LCD text ("digits|unit") */
  const PFX = { V: [['m', 1e-3], ['', 1]], A: [['µ', 1e-6], ['m', 1e-3], ['', 1]], 'Ω': [['', 1], ['k', 1e3], ['M', 1e6]] };
  const FS = { V: 1000, A: 10, 'Ω': 6e7 };                                                  /* full scale: above it the LCD says OL */
  const baseOf = (m) => (m === 'ohm' ? 'Ω' : m === 'dcv' || m === 'acv' ? 'V' : 'A');
  function fmt(p, v) {
    const m = mode(p); if (m === 'off' || !isFinite(v)) return '';
    const b = baseOf(m), a = Math.abs(v), list = PFX[b];
    if (a > FS[b]) return 'OL|' + (b === 'Ω' ? 'MΩ' : b);
    if (m !== 'ohm' && a < (b === 'V' ? 5e-6 : 5e-9)) return '0.000|' + b;                  /* noise floor reads zero */
    let out = null;
    for (let i = 0; i < list.length && !out; i++) {
      const x = a / list[i][1], last = i === list.length - 1;
      const s = x.toFixed(last && x >= 1000 ? 0 : x < 10 ? 3 : x < 100 ? 2 : 1);
      if (parseFloat(s) < 1000 || last) out = s + '|' + list[i][0] + b;
    }
    return (v < 0 && parseFloat(out) !== 0 ? '-' : '') + out;
  }
  /* what the LCD shows while there is no reading (leads in the air, circuit not running) */
  function idle(p) {
    const m = mode(p); if (m === 'off') return '';
    return m === 'ohm' ? 'OL|MΩ' : '0.000|' + baseOf(m);
  }

  /* ---------------------------------------------------------------- 7-segment LCD */
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', O: 'abcdef', L: 'def', '-': 'g' };
  const DW = 10, DH = 19, DT = 2;                                                           /* digit width, height, thickness */
  function digit(ch, x, y, ghost) {
    const hh = DH / 2, t = DT, r = (a, b, w, h) => `<rect x="${(x + a).toFixed(2)}" y="${(y + b).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx=".5"/>`;
    const sg = {
      a: r(t * 0.8, 0, DW - t * 1.6, t), b: r(DW - t, t * 0.8, t, hh - t * 1.4), c: r(DW - t, hh + t * 0.6, t, hh - t * 1.4),
      d: r(t * 0.8, DH - t, DW - t * 1.6, t), e: r(0, hh + t * 0.6, t, hh - t * 1.4), f: r(0, t * 0.8, t, hh - t * 1.4), g: r(t * 0.8, hh - t / 2, DW - t * 1.6, t)
    };
    const on = ghost ? 'abcdefg' : (SEG[ch] || '');
    return on.split('').map((k) => sg[k]).join('');
  }
  /* LCD content for part p and text s ("digits|unit"). Blank when the dial is on OFF or the meter is burnt. */
  function lcd(p, s) {
    const m = mode(p); if (m === 'off' || (p && p.bn)) return '';
    const parts = String(s || idle(p)).split('|'), num = parts[0] || '', unit = parts[1] || '';
    const neg = num[0] === '-', ds = []; let dot = -1;
    num.replace('-', '').split('').forEach((c) => { if (c === '.') dot = ds.length - 1; else ds.push(c); });
    const X0 = -27, STEP = 13, Y0 = -49, first = 4 - Math.min(4, ds.length);
    let g = '<g transform="skewX(-5)">';
    let ghost = '', lit = '';
    for (let i = 0; i < 4; i++) ghost += digit('8', X0 + i * STEP, Y0, true);                /* unlit segments, like a real LCD */
    ds.slice(0, 4).forEach((c, i) => { lit += digit(c, X0 + (first + i) * STEP, Y0); });
    g += `<g fill="#14201a" opacity=".07">${ghost}</g><g fill="#14201a">${lit}</g>`;
    if (neg) g += `<rect x="${X0 - 6}" y="${Y0 + DH / 2 - 1}" width="5" height="2" fill="#14201a"/>`;
    if (dot >= 0 && dot < 4) g += `<circle cx="${X0 + (first + dot) * STEP + DW + 1.8}" cy="${Y0 + DH - 0.8}" r="1.2" fill="#14201a"/>`;
    g += '</g>';
    const mono = 'font-family="ui-monospace,Menlo,Consolas,monospace" fill="#14201a" font-weight="700"';
    g += `<text x="34" y="${Y0 + DH - 1}" text-anchor="end" font-size="8" ${mono}>${esc(unit)}</text>`;
    g += `<text x="-33" y="-52" font-size="5.2" ${mono}>${m === 'acv' || m === 'aca' ? 'AC' : m === 'ohm' ? '' : 'DC'}</text>`;
    if (m === 'acv' || m === 'aca') g += `<path d="M-23-53.6q1.2-2 2.4 0t2.4 0" fill="none" stroke="#14201a" stroke-width=".7"/>`;
    g += `<text x="-2" y="-52" text-anchor="middle" font-size="4.6" ${mono}>AUTO</text>`;
    return g;
  }

  /* ---------------------------------------------------------------- drawing */
  const JX = { A: -26, V: 0, C: 26 }, JY = 40;                                              /* jack positions */
  function dialLabel(mo, x, y, id) {
    const c = '#222a33', f = 'font-family="system-ui,Segoe UI,Arial,sans-serif" font-weight="700" fill="' + c + '"';
    const hit = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.6" fill="#000" fill-opacity="0.001"${id ? ` data-dmm="${id}:${mo}"` : ''} style="cursor:pointer"/>`;
    const T = (t, dx, dy, s) => `<text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="middle" font-size="${s || 6}" ${f}>${t}</text>`;
    const dcSym = (dx, dy) => `<path d="M${(x + dx - 3).toFixed(1)} ${(y + dy).toFixed(1)}h6M${(x + dx - 3).toFixed(1)} ${(y + dy + 1.6).toFixed(1)}h1.4M${(x + dx - 0.7).toFixed(1)} ${(y + dy + 1.6).toFixed(1)}h1.4M${(x + dx + 1.6).toFixed(1)} ${(y + dy + 1.6).toFixed(1)}h1.4" stroke="${c}" stroke-width=".7" fill="none"/>`;
    let g = '';
    if (mo === 'off') g = T('OFF', 0, 2.2, 5.6);
    else if (mo === 'acv') g = T('V~', 0, 2.2);
    else if (mo === 'dcv') g = T('V', -1.2, 0.6) + dcSym(0.5, 2);
    else if (mo === 'ohm') g = T('Ω', 0, 2.4, 7.4);
    else if (mo === 'dca') g = T('A', -1.2, 0.6) + dcSym(0.5, 2);
    else g = T('A~', 0, 2.2);
    return g + hit;
  }
  function draw(p) {
    const id = p && p.id ? p.id : '', m = mode(p), f = (window.FX && id && FX.get(p)) || { t: '' };
    const CX = 0, CY = 6, ang = ANG[m];
    const ink = 'font-family="system-ui,Segoe UI,Arial,sans-serif" font-weight="700"';
    /* probe leads: the red plug moves to the A jack for the two current ranges */
    const amps = m === 'dca' || m === 'aca', rx = amps ? JX.A : JX.V;
    let g = `<defs><linearGradient id="dmmFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset="1" stop-color="#b9bfc8"/></linearGradient>` +
      `<radialGradient id="dmmKnob" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#5a616c"/><stop offset="1" stop-color="#23272e"/></radialGradient></defs>`;
    /* leads (under the body so only the tails show) */
    g += `<path d="M${rx} ${JY + 3}C${rx} 54 -30 50 -30 60" fill="none" stroke="#7a0f0b" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="M${rx} ${JY + 3}C${rx} 54 -30 50 -30 60" fill="none" stroke="#e5352f" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M${JX.C} ${JY + 3}C${JX.C} 54 30 50 30 60" fill="none" stroke="#000" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="M${JX.C} ${JY + 3}C${JX.C} 54 30 50 30 60" fill="none" stroke="#2b2f36" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="-30" cy="60" r="3" fill="#e5352f" stroke="#7a0f0b" stroke-width="1"/><circle cx="30" cy="60" r="3" fill="#2b2f36" stroke="#000" stroke-width="1"/>`;
    /* holster + face */
    g += `<rect x="-48" y="-78" width="96" height="132" rx="12" fill="#f4b400" stroke="#6b4f00" stroke-width="1.6"/>` +
      `<rect x="-45" y="-75" width="90" height="126" rx="10" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>` +
      `<rect x="-42" y="-72" width="84" height="120" rx="8" fill="url(#dmmFace)" stroke="#6d737c" stroke-width="1"/>` +
      `<text x="-37" y="-65" font-size="5" fill="#3a424c" ${ink}>NGSPICE</text><text x="37" y="-65" text-anchor="end" font-size="4.6" fill="#3a424c" ${ink}>TRUE-RMS DMM</text>`;
    /* LCD */
    g += `<rect x="-38" y="-61" width="76" height="40" rx="3" fill="#15181d" stroke="#050607" stroke-width="1"/>` +
      `<rect x="-35" y="-58" width="70" height="34" rx="2" fill="#c5d3b0" stroke="#0b0d10" stroke-width=".8"/>` +
      `<rect x="-35" y="-58" width="70" height="7" rx="2" fill="#fff" fill-opacity=".10"/>` +
      `<g${id ? ` data-fx="${id}" data-role="dmmlcd"` : ''} data-s="${esc(f.t || '')}">${lcd(p, f.t)}</g>`;
    /* dial: static labels + hit targets, rotating knob */
    g += `<circle cx="${CX}" cy="${CY}" r="21" fill="#9aa1ab" fill-opacity=".35" stroke="#7b828c" stroke-width=".8"/>`;
    ORDER.forEach((mo) => {
      const a = ANG[mo] * Math.PI / 180, lr = 26;
      g += dialLabel(mo, CX + lr * Math.sin(a), CY - lr * Math.cos(a), id);
    });
    let ticks = '';
    for (let i = 0; i < 24; i++) ticks += `<path transform="rotate(${i * 15})" d="M0-17.4V-15.2" stroke="#0e1014" stroke-width="1.1"/>`;
    g += `<g transform="translate(${CX} ${CY})"><g transform="rotate(${ang})"${id ? ` data-dmm="${id}:next" style="cursor:pointer"` : ''}>` +
      `<circle r="17" fill="url(#dmmKnob)" stroke="#0b0d10" stroke-width="1.2"/>${ticks}` +
      `<circle r="12" fill="#2d3138" stroke="#0e1014" stroke-width=".8"/>` +
      `<path d="M0-16.6L-3.2-6.5H3.2Z" fill="#fff"/><path d="M0-6.5V0" stroke="#fff" stroke-width="1.2" stroke-opacity=".0"/></g></g>`;
    /* jacks */
    const jack = (x, lab, red, plugged) => `<circle cx="${x}" cy="${JY}" r="4.6" fill="${red === 2 ? '#1b1d22' : '#2b2f36'}" stroke="#0b0d10" stroke-width="1"/>` +
      `<circle cx="${x}" cy="${JY}" r="2.2" fill="#050607"/>` +
      (plugged ? `<circle cx="${x}" cy="${JY}" r="3.4" fill="${red ? '#e5352f' : '#2b2f36'}" stroke="#000" stroke-width=".8"/><circle cx="${x}" cy="${JY}" r="1.3" fill="#d8dce2"/>` : '') +
      `<text x="${x}" y="${JY - 6.4}" text-anchor="middle" font-size="5" fill="#2a313a" ${ink}>${lab}</text>`;
    g += jack(JX.A, '10A', 0, false) + jack(JX.V, 'VΩ', 0, false) + jack(JX.C, 'COM', 2, false);
    g += `<circle cx="${rx}" cy="${JY}" r="3.4" fill="#e5352f" stroke="#7a0f0b" stroke-width=".8"/><circle cx="${rx}" cy="${JY}" r="1.3" fill="#e8ebef"/>` +
      `<circle cx="${JX.C}" cy="${JY}" r="3.4" fill="#2b2f36" stroke="#000" stroke-width=".8"/><circle cx="${JX.C}" cy="${JY}" r="1.3" fill="#9aa1ab"/>`;
    return g;
  }

  /* ---------------------------------------------------------------- register the part (ngspice.js is not edited) */
  Object.assign(SYMS, {
    DMM: {
      pre: PRE.dcv, fmt: 'two', pins: [['1', -3, 6], ['2', 3, 6]], bb: [-5, -8, 5, 7], ib: [-50, -80, 50, 70], def: DEF.dcv,
      name: 'Digital multimeter', cat: 'Measurement',
      lbl: (p) => TITLE[mode(p)],
      draw
    }
  });

  /* netlist -> part type: RDMMDV1 / RDMMAV1 / VDMMDA1 / VDMMAA1 / IDMMO1 / RDMMOF1 are DMMs */
  (function hookType() {
    try {
      const orig = window.typeFor; if (typeof orig !== 'function' || orig.dmmHooked) return;
      const t = function (e, mods) { return e && modeName(e.n) ? 'DMM' : orig.apply(this, arguments); };
      t.dmmHooked = true; window.typeFor = t;
    } catch (e) { /* ignore */ }
  })();

  /* component list: DMM goes under Measurement, right after the Voltmeter */
  function addPalette() {
    try {
      if (typeof PAL === 'undefined') return;
      if (!PAL.some((q) => q.k === 'DMM')) {
        const i = PAL.findIndex((q) => q.k === 'VM');
        PAL.splice(i < 0 ? PAL.length : i + 1, 0, { k: 'DMM', g: 'Measurement' });
      }
      if (typeof buildPalette === 'function') { const s = document.getElementById('psearch'); buildPalette(s ? s.value : ''); }
    } catch (e) { /* palette only */ }
  }
  addPalette(); window.addEventListener('load', addPalette);

  /* ---------------------------------------------------------------- dial -> netlist (the element name + value follow the dial) */
  function setMode(p, mo) {
    if (!p || ORDER.indexOf(mo) < 0 || (mode(p) === mo && modeName(p.n))) return;
    mutate(() => { p.n = newName(PRE[mo]); p.v = DEF[mo]; });
    try { if (typeof needRun === 'function') needRun(); } catch (e) { /* ignore */ }
  }
  /* click on the dial: a label jumps to that range, the knob steps to the next one (Shift = previous) */
  (function hookDial() {
    const svgEl = document.getElementById('svg'); if (!svgEl) return;
    svgEl.addEventListener('pointerdown', (ev) => {
      try {
        if (ev.button != null && ev.button !== 0) return;
        const t = ev.target && ev.target.closest ? ev.target.closest('[data-dmm]') : null; if (!t) return;
        const k = t.getAttribute('data-dmm').split(':'), p = S.M.parts.find((q) => q.id === k[0]); if (!p || p.t !== 'DMM') return;
        const cur = ORDER.indexOf(mode(p));
        const to = k[1] === 'next' ? ORDER[(cur + (ev.shiftKey ? -1 : 1) + ORDER.length) % ORDER.length] : k[1];
        setMode(p, to);
      } catch (e) { /* ignore */ }
    }, true);
  })();

  /* Properties panel: Mode list; the reference name follows the dial, so it is read-only */
  (function hookInspector() {
    try {
      const orig = window.inspect; if (typeof orig !== 'function' || orig.dmmHooked) return;
      const w = function () {
        const r = orig.apply(this, arguments);
        try {
          const P = document.getElementById('pProp'), ids = [...S.sel]; if (!P || ids.length !== 1) return r;
          const p = S.M.parts.find((q) => q.id === ids[0]); if (!p || p.t !== 'DMM') return r;
          const fn = document.getElementById('fN'); if (fn) { fn.readOnly = true; fn.title = 'The name follows the dial position'; }
          const fv = document.getElementById('fV'), host = fv ? fv.closest('.field') : null;
          const lab = { off: 'OFF', acv: 'V~  AC volts', dcv: 'V⎓  DC volts', ohm: 'Ω  Resistance', dca: 'A⎓  DC amps', aca: 'A~  AC amps' }, cm = mode(p);
          const box = document.createElement('div'); box.className = 'field';
          box.innerHTML = 'Dial position<select id="fDmm">' + ORDER.map((m) => '<option value="' + m + '"' + (m === cm ? ' selected' : '') + '>' + lab[m] + '</option>').join('') + '</select>';
          if (host) host.parentNode.insertBefore(box, host); else P.appendChild(box);
          if (host) {
            const L = { off: 'Open circuit (1G)', acv: 'Input impedance (reads the AC RMS voltage)', dcv: 'Input impedance (reads V(pin 1) − V(pin 2))', ohm: 'Test current (reads resistance: pin 1 to pin 2)', dca: 'Internal 0 V source: reads current pin 1 → 2', aca: 'Internal 0 V source: reads the AC RMS current' }[cm];
            host.firstChild.nodeValue = L;
            if (cm === 'dca' || cm === 'aca') fv.readOnly = true;
          }
          const hint = document.createElement('p'); hint.className = 'hint';
          hint.textContent = 'Click the dial on the canvas to change the range. Red probe = pin 1 (VΩ jack, A jack on the amp ranges), black probe = pin 2 (COM). Ammeter ranges go in series; voltage and resistance ranges go across the part. 10 000 A or more through the meter burns it.';
          P.appendChild(hint);
        } catch (e) { /* panel only */ }
        return r;
      };
      w.dmmHooked = true; window.inspect = w;
      document.getElementById('pProp').addEventListener('change', (e) => {
        if (!e.target || e.target.id !== 'fDmm') return;
        const p = S.M.parts.find((q) => S.sel.has(q.id)); if (p && p.t === 'DMM') setMode(p, e.target.value);
      });
    } catch (e) { /* ignore */ }
  })();

  window.DMM = { mode, modeName, fmt, idle, lcd, ORDER, PRE, DEF, setMode, LIMIT_A: 10000 };
})();
