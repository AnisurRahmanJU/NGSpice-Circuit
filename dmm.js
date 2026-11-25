/* dmm.js — Digital Multimeter (DMM) part.  Load AFTER ngspice.js and live-effects.js.  Nothing is added to ngspice.js:
   this file registers the part (SYMS.DMM), the palette entry, the netlist / parser hooks, the live LCD and the inspector control.

   LOOK      handheld meter: yellow body in a dark boot, 7-segment LCD, rotary dial (OFF / DCV / ACV / Ω / DCA / ACA),
             red V·Ω·A jack (pin 1) and black COM jack (pin 2) with their cables (the body stays upright when the part is rotated).  Click a dial label (or the knob = next position)
             to turn the dial.  The same body is used in Schematic and Realistic view.
   NETLIST   the dial decides what the meter IS in the circuit (the element name follows the dial, so the netlist stays valid):
               OFF / Ω   RDMMn a b 1G        open circuit (Ω: the meter measures the circuit with every source switched off)
               DCV / ACV RDMMn a b 10meg     10 Mohm input, like a real DMM
               DCA / ACA VDMMn a b DC 0      0 V source = ideal ammeter, current flows from pin 1 (red) to pin 2 (COM)
   READING   auto-ranging, 4 digits.  DC reads the steady value (or the mean of a repeating AC waveform), AC reads true RMS of the
             AC part, Ω solves the circuit with every source off and a 1 mA test current.  OL = over range / open.
   BURN-OUT  a DMM (like the Ammeter and Voltmeter) is destroyed when 10000 A or more passes through it, or when it is
             connected straight across a source (see live-effects.js: LIM.meterI, burn / short-circuit logic).            */
(function () {
  'use strict';
  if (typeof SYMS === 'undefined' || typeof PAL === 'undefined') return;

  /* ---------------------------------------------------------------- modes */
  const MODES = {
    OFF: { pre: 'RDMM', v: '1G',    lab: 'OFF', ang: -120 },
    DCV: { pre: 'RDMM', v: '10meg', lab: 'DCV', ang: -72 },
    ACV: { pre: 'RDMM', v: '10meg', lab: 'ACV', ang: -24 },
    OHM: { pre: 'RDMM', v: '1G',    lab: 'Ω',   ang: 24 },
    DCA: { pre: 'VDMM', v: 'DC 0',  lab: 'DCA', ang: 72 },
    ACA: { pre: 'VDMM', v: 'DC 0',  lab: 'ACA', ang: 120 }
  };
  const ORDER = ['OFF', 'DCV', 'ACV', 'OHM', 'DCA', 'ACA'];
  const NAMES = { OFF: 'OFF', DCV: 'DC voltage (V=)', ACV: 'AC voltage (V~, RMS)', OHM: 'Resistance (Ω)', DCA: 'DC current (A=)', ACA: 'AC current (A~, RMS)' };
  const modeOf = (p) => {
    if (p && p.dm && MODES[p.dm]) return p.dm;
    const n = String((p && p.n) || '');
    if (/^v/i.test(n)) return 'DCA';
    return num(p && p.v) >= 1e9 ? 'OFF' : 'DCV';
  };
  const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------------------- 7-segment LCD */
  const SG = { a: [2, 0, 6, 1.8], g: [2, 8.1, 6, 1.8], d: [2, 16.2, 6, 1.8], f: [0, 1.6, 1.8, 6.6], b: [8.2, 1.6, 1.8, 6.6], e: [0, 9.8, 1.8, 6.6], c: [8.2, 9.8, 1.8, 6.6] };
  const CH = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', 'O': 'abcdef', 'L': 'def', ' ': '' };
  const SLOT = [-22, -8, 6, 20], DY = -60, INK = '#0e1a10';
  const rect = (x, y, w, h) => 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'z';
  function segPath(ch, ox, oy) {
    const on = CH[ch] || '', A = [], B = [];
    Object.keys(SG).forEach((k) => { const s = SG[k], r = rect((s[0] + ox).toFixed(1), (s[1] + oy).toFixed(1), s[2], s[3]); (on.indexOf(k) >= 0 ? A : B).push(r); });
    return { on: A.join(''), off: B.join('') };
  }
  /* r = { s: '12.34' | 'OL' | '----', raw: bool (dashes are digits), u: unit, ann: 'DC' | 'AC' | '', auto: bool, blank: bool } */
  function lcdSVG(r) {
    let on = '', off = '', dp = '', neg = false;
    const slots = [], dps = {};
    if (!r.blank) {
      for (const ch of String(r.s || '')) {
        if (ch === '-' && !r.raw && slots.length === 0) neg = true;
        else if (ch === '.') { if (slots.length) dps[slots.length - 1] = true; }
        else slots.push(ch);
      }
    }
    const n = Math.min(4, slots.length), pad = 4 - n;
    for (let i = 0; i < 4; i++) {
      const ch = i < pad ? ' ' : slots[i - pad], sp = segPath(r.blank ? ' ' : ch, SLOT[i], DY);
      on += sp.on; off += sp.off;
      if (!r.blank && i >= pad && dps[i - pad]) dp += '<circle cx="' + (SLOT[i] + 11.6) + '" cy="' + (DY + 17.2) + '" r="1.15" fill="' + INK + '"/>';
    }
    const sg = segPath(neg ? '-' : ' ', -35, DY), sgOff = rect(-35 + 2, DY + 8.1, 6, 1.8);   /* minus sign slot */
    on += sg.on;
    const g = '<g transform="translate(-5.4 0) skewX(-6)"><path d="' + off + sgOff + '" fill="' + INK + '" opacity=".07"/><path d="' + on + '" fill="' + INK + '"/>' + dp + '</g>';
    const t = (x, y, s, o) => '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.a || 'start') + '" font-size="' + (o.s || 6) + '" font-weight="700" fill="' + INK + '" font-family="ui-monospace,Menlo,Consolas,monospace">' + esc2(s) + '</text>';
    return g + (r.blank ? '' : t(-38, -58, r.ann || '', { s: 6.5 }) + t(-38, -33, r.auto ? 'AUTO' : '', { s: 5 }) + t(37, -33, r.u || '', { a: 'end', s: 8 }));
  }

  /* ---------------------------------------------------------------- reading engine */
  const READ = new Map();                 /* part id -> latest reading (so a redraw starts with the right digits) */
  const BLANK = { blank: true, k: 'blank' };
  function fmtVal(v, unit, o) {
    o = o || {};
    const a = Math.abs(v);
    let P = o.ohm ? [[1e6, 'M'], [1e3, 'k'], [1, '']] : [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
    if (o.ohm) { /* big first */ } else if (a >= 1e3) P = [[1e3, 'k'], [1, '']].concat(P.slice(1));
    let q = P.find((z) => a >= z[0] * 0.99995);
    if (!q) q = a < 1e-9 || o.ohm ? [1, ''] : P[P.length - 1];
    if (a < 1e-9) q = [1, ''];
    let m = v / q[0], d = Math.abs(m) < 10 ? 3 : Math.abs(m) < 100 ? 2 : 1;
    if (o.ohm && q[0] === 1 && a < 10) d = 2;
    let s = m.toFixed(d);
    if (Math.abs(+s) >= 10 && d === 3) s = m.toFixed(2); else if (Math.abs(+s) >= 100 && d === 2) s = m.toFixed(1);
    if (Math.abs(+s) >= 1000 && q[0] !== 1e6 && P.indexOf(q) > 0) { const up = P[P.indexOf(q) - 1]; m = v / up[0]; s = m.toFixed(3); q = up; }
    if (+s === 0) s = s.replace('-', '');
    return { s, u: q[1] + unit };
  }
  const mk = (s, u, ann, extra) => Object.assign({ s, u, ann, auto: true, k: s + '|' + u + '|' + ann }, extra || {});
  const OL = (u, ann) => mk('OL', u, ann);

  /* statistics of a repeating waveform: time-weighted mean and RMS over a WHOLE number of periods at the end of the run
     (the first period is skipped: start-up).  Without a known period / time axis the second half of the frames is used. */
  const stCache = new WeakMap();
  function stat(frames, key, fn, t, T) {
    let m = stCache.get(frames); if (!m) { m = new Map(); stCache.set(frames, m); }
    if (m.has(key)) return m.get(key);
    const n = frames.length; let i0 = Math.floor(n / 2);
    if (t && t.length === n && T > 0) {
      const tEnd = t[n - 1], tot = Math.floor((tEnd - t[0]) / T + 1e-6), k = Math.max(1, tot - 1), tS = tEnd - k * T;
      if (tot >= 1) { i0 = 0; while (i0 < n - 1 && t[i0] < tS - T * 1e-6) i0++; }
    }
    let sw = 0, s1 = 0; const val = [], wt = [];
    for (let i = i0; i < n; i++) {
      const w = i === i0 ? (t && i + 1 < n ? t[i + 1] - t[i] : 1) : (t ? t[i] - t[i - 1] : 1), v = fn(frames[i]), ww = w > 0 ? w : 1e-12;
      val.push(v); wt.push(ww); sw += ww; s1 += v * ww;
    }
    const mean = sw ? s1 / sw : 0; let q = 0; for (let i = 0; i < val.length; i++) q += (val[i] - mean) * (val[i] - mean) * wt[i];
    const r = { mean, rms: sw ? Math.sqrt(q / sw) : 0 }; m.set(key, r); return r;
  }

  /* Ω: the circuit with every V / I source switched off, 1 mA pushed through the meter pins, R = V / I (cached per netlist) */
  const ohmCache = new Map();
  function ohmValue(p) {
    const src = document.getElementById('src'), key = (src ? src.value : '') + '|' + p.n;
    const c = ohmCache.get(p.id);
    if (c && c.key === key) return c.val;
    let val = Infinity;
    try {
      const P = S.P, me = P && !(P.errs && P.errs.length) ? P.els.find((e) => e.n === p.n) : null;
      if (me) {
        const els = P.els.filter((e) => e !== me).map((e) => (e.k === 'V' || e.k === 'I' ? Object.assign({}, e, { val: 'DC 0', tail: 'DC 0' }) : e));
        els.push({ k: 'I', n: 'IDMMOHM', pins: me.pins.slice(), nodes: (me.nodes || me.pins).slice(), val: 'DC 1m', tail: 'DC 1m', np: 2 });
        const P2 = Object.assign(Object.create(Object.getPrototypeOf(P)), P, { els, dirs: ['.op'], errs: [], warn: [] });
        const R = runSim(P2);
        if (R && R.op && R.C && R.op.x && !(R.errs && R.errs.length)) {
          const V = (n) => (n === '0' ? 0 : R.C.idx[n] != null ? R.op.x[R.C.idx[n]] : NaN);
          const r = (V(me.pins[1]) - V(me.pins[0])) / 1e-3;
          if (isFinite(r)) val = Math.abs(r);
        }
      }
    } catch (e) { val = Infinity; }
    ohmCache.set(p.id, { key, val });
    return val;
  }

  function read(p, Q) {
    if (p.bn) return { blank: true, burnt: true, k: 'burnt' };
    const mode = modeOf(p);
    if (mode === 'OFF') return BLANK;
    if (mode === 'OHM') {
      const r = ohmValue(p);
      if (!isFinite(r) || r >= 6e7) return OL('Ω', '');
      const f = fmtVal(r, 'Ω', { ohm: true }); return mk(f.s, f.u, '');
    }
    const volt = mode === 'DCV' || mode === 'ACV', ac = mode === 'ACV' || mode === 'ACA', unit = volt ? 'V' : 'A', ann = ac ? 'AC' : 'DC';
    if (!Q || !Q.live()) {
      let dead = false; try { dead = !!(window.CIRC && window.CIRC.off()); } catch (e) { dead = false; }
      return dead ? mk('0.000', unit, ann) : mk('----', unit, ann, { raw: true });
    }
    const d = Q.dev(p.n), x = Q.x();
    if (!d || !x) return mk('----', unit, ann, { raw: true });
    const V = (i) => (i < 0 ? 0 : x[i]);
    const fn = d.t === 'V' ? (xx) => xx[d.k] : (xx) => (xx[d.a < 0 ? 0 : d.a] === undefined ? 0 : (d.a < 0 ? 0 : xx[d.a]) - (d.b < 0 ? 0 : xx[d.b]));
    const fr = Q.frames();
    let v;
    if (fr) {
      const st = stat(fr, p.id + '|' + d.t, fn, Q.times && Q.times(), Q.period && Q.period()); v = ac ? st.rms : st.mean;
      if (ac ? st.rms < 1e-3 * Math.abs(st.mean) : Math.abs(st.mean) < 1e-3 * st.rms) v = 0;   /* below the meter's resolution */
    }
    else { v = ac ? 0 : (d.t === 'V' ? x[d.k] : V(d.a) - V(d.b)); }
    if (!isFinite(v)) return OL(unit, ann);
    if (volt && Math.abs(v) >= (ac ? 750 : 1000)) return OL(unit, ann);
    if (!volt && Math.abs(v) >= 1e4) return OL(unit, ann);
    const f = fmtVal(v, unit); return mk(f.s, f.u, ann);
  }

  /* ---------------------------------------------------------------- the part */
  function body(p) {
    const id = p && p.id ? p.id : '', mode = modeOf(p || {}), burnt = !!(p && p.bn), r = (id && READ.get(id)) || BLANK;
    const A = (a) => a * Math.PI / 180, cx = 0, cy = 8;
    let g = '';
    /* the meter body is ALWAYS drawn upright (the part's rotation / mirror is undone), only the two cables follow the pins */
    const rr = (p && p.r) | 0, mm = p && p.m ? 1 : 0;
    const pin = (dx) => { const q = rot(mm ? -dx : dx, 0, rr); return [q[0] * 10, q[1] * 10]; };
    const P1 = pin(-9), P2 = pin(9);
    g += cable([-20, 54], P1, 92, '#c0282d', '#5a0d11') + cable([20, 54], P2, 80, '#1b1d21', '#000');
    g += '<rect x="-54" y="-80" width="108" height="148" rx="15" fill="#2c3037" stroke="#07080a" stroke-width="1.4"/>';
    g += '<rect x="-48" y="-74" width="96" height="136" rx="10" fill="' + (burnt ? '#6b5a22' : '#f0be1b') + '" stroke="#8a6a00" stroke-width="1"/>';
    g += '<rect x="-44" y="-71" width="88" height="5" rx="2.5" fill="#fff" opacity=".28"/>';
    /* LCD */
    g += '<rect x="-43" y="-68" width="86" height="40" rx="4" fill="#15181d"/><rect x="-40" y="-65.5" width="80" height="35" rx="2.5" fill="' + (burnt ? '#59604f' : '#a9c29b') + '" stroke="#05070a" stroke-width="1"/>';
    g += '<g data-dmm-lcd="' + id + '">' + lcdSVG(r) + '</g>';
    g += '<rect x="-40" y="-65.5" width="80" height="12" rx="2.5" fill="#fff" opacity=".07" pointer-events="none"/>';
    /* dial */
    g += '<circle cx="0" cy="' + cy + '" r="40" fill="#e6ae12" opacity=".0" pointer-events="none"/>';
    ORDER.forEach((m) => {
      const a = A(MODES[m].ang), lx = cx + 31 * Math.sin(a), ly = cy - 31 * Math.cos(a), on = m === mode;
      g += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 2.4).toFixed(1) + '" text-anchor="middle" font-size="' + (on ? 7 : 6.2) + '" font-weight="800" fill="' + (on ? '#b3141b' : '#3a2e00') + '" font-family="ui-monospace,Menlo,Consolas,monospace" pointer-events="none">' + MODES[m].lab + '</text>';
      if (id) g += '<circle data-dmm-set="' + m + '" data-dmm-id="' + id + '" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="8" fill="#000" opacity="0" style="cursor:pointer"><title>' + esc2(NAMES[m]) + '</title></circle>';
    });
    g += '<circle cx="0" cy="' + cy + '" r="19.5" fill="#16181c" stroke="#000" stroke-width="1"/>';
    for (let i = 0; i < 28; i++) { const a = i * 2 * Math.PI / 28; g += '<path d="M' + (19.4 * Math.sin(a)).toFixed(1) + ' ' + (cy - 19.4 * Math.cos(a)).toFixed(1) + 'L' + (16.8 * Math.sin(a)).toFixed(1) + ' ' + (cy - 16.8 * Math.cos(a)).toFixed(1) + '" stroke="#3b4048" stroke-width="1.5"/>'; }
    g += '<g' + (id ? ' data-dmm-knob="1" data-dmm-id="' + id + '" style="cursor:pointer"' : '') + ' transform="translate(0 ' + cy + ') rotate(' + MODES[mode].ang + ')"><circle r="14.5" fill="#2a2e35" stroke="#0a0b0d" stroke-width="1"/><circle r="11" fill="#383d46"/><path d="M0 -15 L3.4 -4 H-3.4 Z" fill="#f4f6f8" stroke="#0a0b0d" stroke-width=".6"/><circle r="3" fill="#15171a"/><title>Click: next function</title></g>';
    /* jacks */
    g += '<text x="-20" y="43" text-anchor="middle" font-size="5" font-weight="700" fill="#3a2e00" font-family="ui-monospace,monospace">V·Ω·A</text><text x="20" y="43" text-anchor="middle" font-size="5" font-weight="700" fill="#3a2e00" font-family="ui-monospace,monospace">COM</text>';
    g += '<circle cx="-20" cy="54" r="6.2" fill="#0b0c0e" stroke="#c0282d" stroke-width="2.2"/><circle cx="-20" cy="54" r="2.6" fill="#555a62"/>';
    g += '<circle cx="20" cy="54" r="6.2" fill="#0b0c0e" stroke="#8a9099" stroke-width="2.2"/><circle cx="20" cy="54" r="2.6" fill="#555a62"/>';
    if (burnt) g += '<path d="M-30 -60L-6 -34L-22 -8L8 20L-4 44" stroke="#111" stroke-width="2" fill="none" opacity=".7"/>';
    return '<g transform="' + (p && p.fl ? 'scale(-1 1) ' : '') + (mm ? 'scale(-1 1) ' : '') + 'rotate(' + (-rr * 90) + ')">' + g + '</g>';
  }
  /* a probe cable from a jack to its pin: runs outside the meter body, corners rounded */
  function cable(J, P, Yc, col, dark) {
    const pts = [[J[0], J[1] + 6]];
    if (P[1] > 70) { const y = Math.max(J[1] + 16, P[1] - 14); pts.push([J[0], y], [P[0], y], P); }
    else if (Math.abs(P[0]) > 60) pts.push([J[0], Yc], [P[0], Yc], P);
    else { const sx = (P[0] || J[0]) < 0 ? -1 : 1, xs = sx * (76 + (Yc - 80)); pts.push([J[0], Yc], [xs, Yc], [xs, P[1]], P); }
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const c = pts[i], a = pts[i - 1], b = pts[i + 1], la = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, lb = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1, r = Math.min(14, la / 2, lb / 2);
      d += 'L' + (c[0] + (a[0] - c[0]) / la * r).toFixed(1) + ' ' + (c[1] + (a[1] - c[1]) / la * r).toFixed(1) + 'Q' + c[0] + ' ' + c[1] + ' ' + (c[0] + (b[0] - c[0]) / lb * r).toFixed(1) + ' ' + (c[1] + (b[1] - c[1]) / lb * r).toFixed(1);
    }
    const e = pts[pts.length - 1]; d += 'L' + e[0] + ' ' + e[1];
    return '<path d="' + d + '" fill="none" stroke="' + dark + '" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + P[0] + '" cy="' + P[1] + '" r="3.6" fill="' + col + '" stroke="' + dark + '" stroke-width="1"/>';
  }

  SYMS.DMM = {
    pre: 'RDMM', fmt: 'two', pins: [['1', -9, 0], ['2', 9, 0]], bb: [-9, -8, 9, 8], ib: [-100, -86, 100, 96],
    def: '10meg', name: 'Multimeter (DMM)', cat: 'Measurement',
    lbl: (p) => MODES[modeOf(p)].lab + (p && p.bn ? ' (burnt)' : ''),
    draw: (p) => body(p)
  };
  if (!PAL.some((q) => q.k === 'DMM')) {
    const i = PAL.findIndex((q) => q.k === 'VM');
    PAL.splice(i < 0 ? PAL.length : i + 1, 0, { k: 'DMM', g: 'Measurement' });
  }

  /* ---------------------------------------------------------------- hooks (netlist <-> parts) */
  const DM = /^[rvi]dmm(\d|_|$)/i;
  (function hook() {
    try {
      const t0 = window.typeFor;
      if (typeof t0 === 'function' && !t0.dmmHook) {
        const t = function (e) { if (e && (e.k === 'R' || e.k === 'V' || e.k === 'I') && DM.test(String(e.n))) return 'DMM'; return t0.apply(this, arguments); };
        t.dmmHook = true; window.typeFor = t;
      }
      const m0 = window.mkParts;
      if (typeof m0 === 'function' && !m0.dmmHook) {
        const m = function (P) {
          const parts = m0.apply(this, arguments);
          try { parts.forEach((p) => { if (p.t !== 'DMM') return; const e = (P.els || []).find((x) => x.n === p.n); p.dm = e && e.k === 'V' ? 'DCA' : (e && num(e.tail) < 1e9 ? 'DCV' : 'OFF'); }); } catch (x) { /* keep defaults */ }
          return parts;
        };
        m.dmmHook = true; window.mkParts = m;
      }
      /* the element name and value always follow the dial (also after Duplicate / Undo), so the netlist is valid */
      const g0 = window.genNetlist;
      if (typeof g0 === 'function' && !g0.dmmHook) {
        const g = function (M) {
          try {
            M.parts.forEach((p) => {
              if (p.t !== 'DMM') return;
              const m = modeOf(p), D = MODES[m];
              p.dm = m; if (p.v !== D.v) p.v = D.v;
              if (String(p.n).toUpperCase().indexOf(D.pre) !== 0) p.n = newName(D.pre);
            });
          } catch (e) { /* ignore */ }
          return g0.apply(this, arguments);
        };
        g.dmmHook = true; window.genNetlist = g;
      }
    } catch (e) { /* ignore */ }
  })();

  function setMode(id, mode) {
    const p = S.M.parts.find((q) => q.id === id); if (!p || !MODES[mode] || modeOf(p) === mode) return;
    mutate(() => { p.dm = mode; p.v = MODES[mode].v; if (String(p.n).toUpperCase().indexOf(MODES[mode].pre) !== 0) p.n = newName(MODES[mode].pre); }, 'dmm' + id);
  }

  /* ---------------------------------------------------------------- dial clicks (before the schematic's own pointer handler) */
  (function dial() {
    const svg = document.getElementById('svg'); if (!svg) return;
    svg.addEventListener('pointerdown', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[data-dmm-set],[data-dmm-knob]') : null;
      if (!t || e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      const id = t.getAttribute('data-dmm-id'), p = S.M.parts.find((q) => q.id === id); if (!p) return;
      const cur = modeOf(p);
      setMode(id, t.hasAttribute('data-dmm-set') ? t.getAttribute('data-dmm-set') : ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
    }, true);
  })();

  /* ---------------------------------------------------------------- inspector: dial selector */
  (function inspector() {
    const P = document.getElementById('pProp'); if (!P) return;
    const sel = () => { try { return S.sel.size === 1 ? S.M.parts.find((q) => S.sel.has(q.id)) : null; } catch (e) { return null; } };
    const inject = () => {
      const p = sel(); if (!p || p.t !== 'DMM') return;
      const m = modeOf(p), ex = document.getElementById('dmmMode');
      if (ex) { if (ex.value !== m && document.activeElement !== ex) ex.value = m; return; }
      const fv = P.querySelector('#fV'); if (!fv) return;
      fv.readOnly = true;
      const f = fv.closest('.field'); if (!f) return;
      const d = document.createElement('div'); d.className = 'field';
      d.innerHTML = 'Dial (function)<select id="dmmMode">' + ORDER.map((k) => '<option value="' + k + '"' + (k === m ? ' selected' : '') + '>' + esc2(NAMES[k]) + '</option>').join('') + '</select>' +
        '<p class="hint">Click a dial label on the meter (or the knob for the next position). Red lead (V·Ω·A) = pin 1, black lead (COM) = pin 2. Volts: connect across the part, 10 MΩ input. Amps: connect in series, the meter is a 0 V source (current flows red → black). Ω: measure with the circuit unpowered (sources are treated as off). <b>10000 A or more through the meter, or the meter straight across a source, burns it out.</b></p>';
      f.before(d);
    };
    new MutationObserver(inject).observe(P, { childList: true });
    P.addEventListener('input', (e) => { if (e.target && e.target.id === 'dmmMode') { e.stopPropagation(); const p = sel(); if (p) setMode(p.id, e.target.value); } }, true);
    inject();
  })();

  /* ---------------------------------------------------------------- live loop */
  function setLCD(id, r) {
    document.querySelectorAll('[data-dmm-lcd="' + id + '"]').forEach((el) => { if (el.dataset.k !== r.k) { el.dataset.k = r.k; el.innerHTML = lcdSVG(r); } });
  }
  function tick() {
    requestAnimationFrame(tick);
    let parts; try { parts = S.M.parts; } catch (e) { return; }
    const Q = window.FXQ, seen = new Set();
    parts.forEach((p) => {
      if (p.t !== 'DMM') return;
      seen.add(p.id);
      let r; try { r = read(p, Q); } catch (e) { r = BLANK; }
      READ.set(p.id, r); setLCD(p.id, r);
    });
    [...READ.keys()].forEach((k) => { if (!seen.has(k)) { READ.delete(k); ohmCache.delete(k); } });
  }
  requestAnimationFrame(tick);

  window.DMM = { MODES, ORDER, modeOf, setMode, read: (p) => read(p, window.FXQ), READ };
  try { const s = document.getElementById('psearch'); buildPalette(s ? s.value : ''); } catch (e) { /* palette only */ }
})();
