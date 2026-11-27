/* live-effects.js — makes Bulb, LED, Fan and the Ammeter / Voltmeter / DMM (dmm.js) come alive while a simulation runs, and BURNS / short-circuits them when overloaded
   (Ammeter and Voltmeter short-circuit at 10000 A, the DMM at 100 A, LED max current from Properties (15 - 30 mA, default 20 mA), Bulb (max V / W / A), Fan and Buzzer (max V / A) from Properties (defaults 12 V, 2.4 W, 200 mA), capacitors Vmax (default 50 V) / fmax (default 90 kHz) from Properties, electrolytic reverse polarity, inductor below its min frequency (default 10 Hz) / low-reactance (<= 2 ohm or DC) inductor short circuit, fuse blows, fire + char; wires + red / - green).
   Load AFTER ngspice.js.  Everything follows the CIRCUIT: dark / blank while the power switch is OFF or the netlist is not runnable, alive otherwise
   (the Run / Stop buttons only control the simulation output and do not change it).
   Bulb / Fan strength = voltage across the part relative to the largest source voltage in the circuit.
   LED brightness = LED current (about 10 mA = full).  Meters read the solver result of the frame that is on screen. */
(function () {
  'use strict';
  const KIND = { BULB: 'b', FAN: 'f', LED: 'l', AM: 'a', VM: 'v', DMM: 'd' }, vals = new Map();
  /* LED forward voltage by colour (V) at about 10 mA. Colour = word in the LED model name (RED_LED, BLUE_LED ...). */
  const VF = window.LED_VF = { red: 1.8, orange: 2.0, yellow: 2.1, amber: 2.1, green: 2.2, blue: 3.2, white: 3.2 };
  /* glow colour of the schematic LED by colour word (same palette as the realistic LED) */
  const LED_GLOW = { red: '#ff3b30', green: '#34c759', blue: '#2f7bff', yellow: '#ffd60a', orange: '#ff9500', white: '#f2f4f7', amber: '#ffb000' };
  const ledKey = (s) => { s = String(s || '').toLowerCase(); return Object.keys(VF).find((k) => s.indexOf(k) >= 0) || null; };
  /* voltage / current / threshold of one LED in solver vector x; vf = table value when the model really has that
     knee (so the glow follows the colour), otherwise the model's own knee (so a mismatched model never goes dark) */
  function ledInfo(p, d, x) {
    const V = (i) => (i < 0 ? 0 : x[i]), v = V(d.a) - V(d.b), vt = 0.02585 * d.nf;
    const i = d.is * (Math.exp(Math.min(v / vt, 80)) - 1), key = ledKey(p.v);
    const vfm = vt * Math.log(0.01 / d.is);
    const vf = key && Math.abs(vfm - VF[key]) <= 0.5 ? VF[key] : vfm;
    return { v, i, vf, key, tab: key ? VF[key] : null };
  }
  window.FX = { get: (p) => { const v = vals.get(p.id); return v ? { l: v.l, a: v.a, s: Math.abs(v.s), sd: v.s, t: v.t, w: v.w, u: v.u || '' } : { l: 0, a: 0, s: 0, sd: 0, t: '', w: 0, u: '' }; } };
  let last = 0, rvR = null, rv = 12, dvR = null, dv = null;
  /* RS = solver result of the CIRCUIT (window.CR(), independent of Run / Stop). Refreshed at the start of every frame. */
  let RS = null;
  const live = () => !!(RS && RS.op && RS.C && !(RS.errs && RS.errs.length));
  /* A circuit driven only by plain DC sources (no SIN/PULSE/PWL/AC source) and with no C / L / 555 is in steady state:
     the Run animation loops .tran / .dc frames from the start (t = 0, or the swept source going 0 -> max), which made a
     DC-powered Bulb / LED / Fan / meter fade in and out. For such circuits we always use the steady DC operating point. */
  let sdR = null, sd = false;
  function steady() {
    if (sdR !== RS) {
      sdR = RS; sd = false;
      try {
        sd = !RS.C.devs.some((d) => {
          if (d.t === 'C' || d.t === 'L') return true;
          if ((d.t === 'V' || d.t === 'I') && d.s && (d.s.w || d.s.acm)) return true;
          return false;
        }) && !(RS.C.t555 && RS.C.t555.length);
      } catch (e) { sd = false; }   /* any surprise -> old behaviour, never switch the lights off */
    }
    return sd;
  }
  /* true when any V / I source is AC / SIN / PULSE / PWL. Such a source reverses polarity by itself every cycle, so an LED
     in that circuit is SUPPOSED to be forward-biased (ON) and reverse-biased (OFF) in turn: it blinks, and the
     "reverse-biased / Flip" warning must never be shown for it (it used to flicker on and off with every half-cycle). */
  let acR = null, acV = false;
  function acDriven() {
    if (acR !== RS) {
      acR = RS; acV = false;
      try { acV = RS.C.devs.some((d) => (d.t === 'V' || d.t === 'I') && d.s && (d.s.w || d.s.acm)); } catch (e) { acV = false; }
    }
    return acV;
  }
  /* AC / SIN / PULSE / PWL driven circuit: the lamps must blink even when the netlist has no .tran
     (only .op / .dc / .ac) or the Run animation is on another tab. Use the .tran result when there is one,
     otherwise run a small hidden .tran (about 4 periods of the source) and loop it on our own 8 s clock. */
  let tvR = null, tvF = null, tvP = 8000, tvOne = false;
  /* Self-oscillating circuit on a plain DC supply (555 beeper, multivibrator, relaxation oscillator): no AC source, but the
     .tran result keeps swinging up and down until its end. A one-way settling (RC charging) does NOT count. */
  function oscillates(X) {
    try {
      const n = X.length, a = Math.floor(n * 0.4), m = X[a].length, step = Math.max(1, Math.floor((n - a) / 300));
      for (let j = 0; j < m; j++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = a; i < n; i += step) { const v = X[i][j]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (!(hi - lo > 0.3)) continue;
        const up = lo + 0.7 * (hi - lo), dn = lo + 0.3 * (hi - lo); let hiSt = null, cr = 0;
        for (let i = a; i < n; i += step) { const v = X[i][j]; if (v >= up) { if (hiSt === false) cr++; hiSt = true; } else if (v <= dn) { if (hiSt === true) cr++; hiSt = false; } }
        if (cr >= 2) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  function frames() {
    if (tvR !== RS) {
      tvR = RS; tvF = null; tvP = 8000; tvOne = false;
      try {
        if (window.PB1 && window.PB1(RS) !== null) { tvF = RS.tran.X; tvOne = true; return tvF; }   /* push-button circuit: play the transient once from the press */
        let f = 0, tv = false;
        RS.C.devs.forEach((d) => {
          if ((d.t !== 'V' && d.t !== 'I') || !d.s || !(d.s.w || d.s.acm)) return;
          tv = true; const w = d.s.w;
          if (w && /^(sin|tri|saw)$/.test(w.t) && w.a[2] > 0) f = f ? Math.min(f, w.a[2]) : w.a[2];
          else if (w && w.t === 'pulse' && w.a[6] > 0) f = f ? Math.min(f, 1 / w.a[6]) : 1 / w.a[6];
        });
        if (!tv && RS.tran && RS.tran.X && RS.tran.X.length > 8 && oscillates(RS.tran.X)) {
          tvF = RS.tran.X;                                         /* play the oscillation in real time (looped), up to 8 s long */
          const T = RS.tran.t[RS.tran.t.length - 1];
          tvP = T >= 1 && T <= 8 ? T * 1000 : 8000;
        }
        if (tv) {
          if (RS.tran && RS.tran.X && RS.tran.X.length > 1) tvF = RS.tran.X;
          else {
            const stop = f ? 4 / f : 1, P = S.P, P2 = Object.assign(Object.create(Object.getPrototypeOf(P)), P, { dirs: P.dirs.concat(['.tran ' + (stop / 800).toExponential(3) + ' ' + stop.toExponential(3)]) });
            const R2 = runSim(P2);
            if (R2 && R2.tran && R2.tran.X && R2.tran.X.length > 1 && !(R2.errs && R2.errs.length)) tvF = R2.tran.X;
          }
        }
      } catch (e) { tvF = null; }
    }
    return tvF;
  }
  function cur() {
    window.FXSEL = { k: 'op', i: -1 };   /* which solver frame is on screen (read by switch-ui.js for relay contacts) */
    if (steady() && RS.op.x) return RS.op.x;
    const fr = frames();
    if (fr) {
      if (ANIM.on && ANIM.k === 'tran' && RS.tran && fr === RS.tran.X && ANIM.idx != null && fr[ANIM.idx]) { window.FXSEL = { k: 'tran', i: ANIM.idx }; return fr[ANIM.idx]; }
      const ix = tvOne ? Math.min(fr.length - 1, Math.floor(window.PB1(RS) * fr.length)) : Math.min(fr.length - 1, Math.floor(((performance.now() % tvP) / tvP) * fr.length));
      if (RS.tran && fr === RS.tran.X) window.FXSEL = { k: 'tran', i: ix };
      return fr[ix];
    }
    if (ANIM.on && ANIM.idx != null) {
      if (ANIM.k === 'tran' && RS.tran && RS.tran.X[ANIM.idx]) { window.FXSEL = { k: 'tran', i: ANIM.idx }; return RS.tran.X[ANIM.idx]; }
      if (ANIM.k === 'dc' && RS.dc && RS.dc.X[ANIM.idx]) { window.FXSEL = { k: 'dc', i: ANIM.idx }; return RS.dc.X[ANIM.idx]; }
    }
    return RS.op.x;
  }
  function rated() {
    if (rvR !== RS) {
      rvR = RS; let m = 0;
      RS.C.devs.forEach((d) => {
        if (d.t !== 'V' || !d.s || /^vdmmoh/i.test(d.nm)) return;   /* the DMM ohm test source is not a circuit supply */
        let k = Math.abs(d.s.dc || 0); const w = d.s.w, a = w ? w.a.map((x) => Math.abs(x) || 0) : [];
        if (w) k = w.t === 'pwl' ? Math.max(0, ...a.filter((_, i) => i % 2)) : w.t === 'pulse' ? Math.max(a[0] || 0, a[1] || 0) : (a[0] || 0) + (a[1] || 0) * (w.t === 'noise' ? 3 : 1);
        m = Math.max(m, k);
      });
      if (RS.dc && !RS.dc.cur) RS.dc.xs.forEach((v) => { m = Math.max(m, Math.abs(v)); });
      rv = m > 0.01 ? m : 12;
    }
    return rv;
  }
  function dev(n) {
    if (dvR !== RS) { dvR = RS; dv = new Map(); RS.C.devs.forEach((d) => dv.set(String(d.nm).toLowerCase(), d)); }
    return dv.get(String(n).toLowerCase());
  }
  function target(p, x, R) {
    const d = dev(p.n), k = KIND[p.t]; if (!d) return null;
    const V = (i) => (i < 0 ? 0 : x[i]);
    if (k === 'd') return null;   /* the DMM is read by dmmRead() below (it has DC / AC-RMS modes) */
    if (k === 'a') return d.t === 'V' ? x[d.k] : null;
    const v = V(d.a) - V(d.b);
    if (k === 'v') return v;
    if (k === 'l') { if (d.t !== 'D') return null; const vt = 0.02585 * d.nf; return d.is * (Math.exp(Math.min(v / vt, 80)) - 1); }
    /* Fan = DC motor: the sign of the voltage decides the direction (v > 0 clockwise, v < 0 anticlockwise) */
    return k === 'f' ? v / R : Math.abs(v) / R;
  }
  function fm(v, u) {
    if (!isFinite(v)) return '---';
    const a = Math.abs(v); if (a < 1e-12) return '0.00 ' + u;
    const P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    const q = P.find((z) => a >= z[0] * 0.9995) || P[7], x = v / q[0];
    return x.toFixed(Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2) + ' ' + q[1] + u;
  }
  /* ---------- DMM reading (dmm.js): DC = average, AC = true RMS of the AC part, V = across the probes, A = through the DMM ---------- */
  let dsR = null, dsM = new Map();
  function dmmStat(p, d, fr, amps) {
    if (dsR !== RS) { dsR = RS; dsM = new Map(); }
    const key = p.id + '|' + d.nm + '|' + (amps ? 'A' : 'V') + '|' + fr.length; let r = dsM.get(key); if (r) return r;
    const tm = RS.tran && fr === RS.tran.X && RS.tran.t && RS.tran.t.length === fr.length ? RS.tran.t : null;
    const val = (row) => (amps ? (row[d.k] || 0) : ((d.a < 0 ? 0 : row[d.a]) - (d.b < 0 ? 0 : row[d.b])));
    let sw = 0, s1 = 0, s2 = 0; const st = Math.max(1, Math.floor(fr.length / 4000));
    for (let i = 0; i < fr.length; i += st) {
      const j = Math.min(fr.length - 1, i + st), w = tm ? Math.max(0, tm[j] - tm[i]) || 1e-30 : 1, y = val(fr[i]);
      sw += w; s1 += w * y; s2 += w * y * y;
    }
    const mean = sw ? s1 / sw : 0;
    r = { mean, ac: Math.sqrt(Math.max(0, (sw ? s2 / sw : 0) - mean * mean)) };
    dsM.set(key, r); return r;
  }
  function dmmRead(p, x) {
    const D = window.DMM, blank = { t: '', u: '' };
    if (!D || !x) return blank;
    const m = D.mode(p), I = D.info[m]; if (!I || !I.kind) return blank;     /* dial on OFF: blank display */
    const d = dev(p.n); if (!d) return blank;
    const amps = I.kind === 'A' || I.kind === 'R';                            /* A and Ω read the current through the DMM's source element */
    if (amps ? d.t !== 'V' : d.t !== 'R') return blank;                       /* name and element do not agree (edited by hand) */
    const V = (i) => (i < 0 ? 0 : x[i]), inst = amps ? (x[d.k] || 0) : V(d.a) - V(d.b), fr = frames();
    let v;
    if (I.kind === 'R') {                                                     /* ohms: R = test voltage / test current (open circuit = OL) */
      const vt = Math.abs((d.s && d.s.dc) || 0.4), i = Math.abs(fr ? dmmStat(p, d, fr, true).mean : inst);
      return D.format(m, i < 1e-12 ? Infinity : vt / i);
    }
    if (I.ac) v = fr ? dmmStat(p, d, fr, amps).ac : 0;                       /* AC-coupled: a steady DC circuit reads 0 */
    else v = fr ? dmmStat(p, d, fr, amps).mean : inst;
    return D.format(m, v);
  }
  /* Flip the LED itself, in place: its anode / cathode names swap but every pin stays where it is, so no wire moves
     or is added (p.fl is handled in ngspice.js partPins / drawPart). The netlist is regenerated and Run is pressed. */
  function flipLed(name) {
    try {
      const pt = S.M.parts.find((q) => String(q.n).toLowerCase() === String(name).toLowerCase());
      if (!pt) return;
      mutate(() => { pt.fl = pt.fl ? 0 : 1; });
      setTimeout(() => { const r = document.getElementById('bRunSim'); if (r) r.click(); }, 60);
    } catch (e) { /* ignore */ }
  }
  /* ====================================================================================================================
     BURN-OUT, FIRE, SHORT CIRCUIT and WIRE COLOURS
     Limits:  LED max current set in Properties (15 - 30 mA, default 20 mA) | Bulb (Max voltage, Max power, Max current), Fan and Buzzer (Max voltage, Max current) set in Properties, defaults 12 V / 2.4 W / 200 mA (a buzzer on an AC source is rated in RMS: 12 V / 200 mA RMS = 17 V / 283 mA peak) | Capacitor / Electrolytic: Vmax (default 50 V) and fmax (default 90 kHz) set in Properties; electrolytic NO reverse polarity | Inductor: burns on an AC source below fmin (default 10 Hz, rated 60 Hz) |
              Capacitor / electrolytic: frequency above fmax = burn | Inductor: reactance
              <= 2 ohm (or DC) and current > 1 A = reactance so low it is a short circuit | Fuse: blows above its rated
              current (the fuse part stays, only the circuit opens) | any source that has to deliver 20 A or more = short circuit. | Ammeter / Voltmeter: 10000 A, DMM: 100 A through the meter = short circuit (burns, stays open).
     A part that is overloaded heats up (smoke, sparks), then burns (flames, black char) and stays burnt = open circuit
     (p.bn = 1, genNetlist writes it as an open circuit; Undo brings it back).  Wires: + terminal red, - terminal green;
     a short circuit never colours a wire red - it shows fire instead.
     ==================================================================================================================== */
  const LIM = { led: 0.020, bulbV: 12, bulbI: 0.2, fanV: 12, fanI: 0.2, buzV: 12, buzI: 0.2, indOhm: 2, indI: 1, shortI: 20, meterI: 10000 };
  const TAU = { LED: 0.35, BULB: 1.0, FAN: 1.0, BUZ: 1.0, C: 0.6, Cp: 0.6, L: 1.0, FUSE: 0.12, V: 1.0, AM: 0.1, VM: 0.1, DMM: 0.1 };   /* a meter at 10000 A shorts almost at once */
  const NAME = { LED: 'LED', BULB: 'Bulb', FAN: 'Fan', BUZ: 'Buzzer', C: 'Capacitor', Cp: 'Electrolytic capacitor', L: 'Inductor', FUSE: 'Fuse', V: 'Source', AM: 'Ammeter', VM: 'Voltmeter', DMM: 'DMM' };
  const heat = new Map(), burnAt = new Map(), why = new Map();
  const NS = 'http://www.w3.org/2000/svg', U10 = 10;
  /* a burnt part is an open circuit in the netlist (so the rest of the circuit behaves as if it were removed) */
  (function hookNetlist() {
    try {
      const orig = window.genNetlist; if (typeof orig !== 'function' || orig.fxHooked) return;
      const g = function (M) {
        let t = orig(M);
        try {
          const bad = M.parts.filter((p) => p.bn && p.t !== 'FUSE');   /* a blown FUSE is written by ngspice.js itself */
          if (bad.length) {
            const by = new Map(bad.map((p) => [String(p.n), p]));
            t = t.split('\n').map((l) => {
              const tk = l.split(' '), p = by.get(tk[0]); if (!p || tk.length < 3) return l;
              return (p.t === 'BULB' || p.t === 'FAN' || p.t === 'BUZ') ? tk[0] + ' ' + tk[1] + ' ' + tk[2] + ' 1G' : 'R_' + tk[0] + ' ' + tk[1] + ' ' + tk[2] + ' 1G';
            }).join('\n');
          }
        } catch (e) { /* keep the plain netlist */ }
        return t;
      };
      g.fxHooked = true; window.genNetlist = g;
    } catch (e) { /* ignore */ }
  })();
  /* ---------- drive frequency of the circuit (from its V sources) ---------- */
  let fqR = null, fq = { max: 0, min: 0 };
  function freqs() {
    if (fqR !== RS) {
      fqR = RS; fq = { max: 0, min: 0 };
      try {
        let mx = 0, mn = Infinity;
        RS.C.devs.forEach((d) => {
          if (d.t !== 'V' || !d.s || !d.s.w) return;
          const w = d.s.w; let f = 0;
          if (/^(sin|tri|saw)$/.test(w.t)) f = w.a[2]; else if (w.t === 'pulse' && w.a[6] > 0) f = 1 / w.a[6];
          if (f > 0 && isFinite(f)) { mx = Math.max(mx, f); mn = Math.min(mn, f); }
        });
        fq = mx > 0 ? { max: mx, min: mn } : { max: 0, min: 0 };   /* no AC source = DC = 0 Hz */
      } catch (e) { /* DC */ }
    }
    return fq;
  }
  /* ---------- is this part overloaded right now?  -> { r: severity (>1 = over), m: reason } ---------- */
  function check(p, x) {
    const d = dev(p.n); if (!d) return null;
    const V = (i) => (i < 0 ? 0 : x[i]);
    if (p.t === 'LED' && d.t === 'D') {
      const i = ledInfo(p, d, x).i;
      const li = window.RAT.ledLim(p.v);   /* Max current from Properties: 15 - 30 mA, default 20 mA */
      return i > li * 1.005 ? { r: i / li, m: 'LED current ' + fm(i, 'A') + ' is above the ' + fm(li, 'A') + ' limit' } : null;
    }
    if ((p.t === 'BULB' || p.t === 'FAN' || p.t === 'BUZ') && d.t === 'R') {
      const v = Math.abs(V(d.a) - V(d.b)), i = v * d.g;
      /* limits come from the Properties panel (Max voltage / Max current in the part value; bulb power = V x I is calculated); defaults 12 V, 200 mA */
      const ll = window.RAT.loadLim(p.t, p.v);
      let lv = ll.vmax, li = ll.imax, lp = ll.pmax || 0, ac = false;
      /* a buzzer (mains doorbell, AC alarm) is rated in RMS: on an AC source its peak may be sqrt(2) higher, like the fan limit of 12 V DC */
      if (p.t === 'BUZ' && acDriven()) { ac = true; lv *= Math.SQRT2; li *= Math.SQRT2; }
      const lim = (peak, rms, u) => ac ? fm(peak, u) + ' peak (' + fm(rms, u) + ' RMS)' : fm(peak, u);
      if (v > lv * 1.005) return { r: v / lv, m: NAME[p.t] + ' voltage ' + fm(v, 'V') + ' is above the ' + lim(lv, ll.vmax, 'V') + ' limit' };
      if (i > li * 1.005) return { r: i / li, m: NAME[p.t] + ' current ' + fm(i, 'A') + ' is above the ' + lim(li, ll.imax, 'A') + ' limit' };
      if (lp && v * i > lp * 1.005) return { r: v * i / lp, m: NAME[p.t] + ' power ' + fm(v * i, 'W') + ' is above the ' + fm(lp, 'W') + ' limit' };
      return null;
    }
    if ((p.t === 'C' || p.t === 'Cp') && d.t === 'C') {
      /* ratings come from the Properties panel (Vmax / fmax in the part value); defaults 50 V and 90 kHz */
      const v = V(d.a) - V(d.b), f = freqs().max, cl = window.RAT.capLim(p.v);
      if (Math.abs(v) > cl.vmax * 1.005) return { r: Math.abs(v) / cl.vmax, m: 'Voltage ' + fm(Math.abs(v), 'V') + ' is above the ' + cl.vmax + ' V limit' };
      if (p.t === 'Cp' && v < -0.7) return { r: 2, m: 'Reverse polarity (the + pin must be at the higher voltage)' };
      if (f > cl.fmax * 1.0001) return { r: Math.min(4, f / cl.fmax + 1), m: 'Frequency ' + fm(f, 'Hz') + ' is above the ' + window.RAT.fmtHz(cl.fmax) + ' limit' };
      return null;
    }
    if (p.t === 'L' && d.t === 'L') {
      const i = Math.abs(x[d.k] || 0), f = freqs().min, il = window.RAT.indLim(p.v);
      const xl = 2 * Math.PI * f * d.l;
      /* AC source slower than the minimum frequency (default 10 Hz): reactance too low, the inductor burns */
      if (f > 0 && f < il.fmin * 0.9999) return { r: Math.min(4, il.fmin / f + 1), m: 'Frequency ' + fm(f, 'Hz') + ' is below the ' + window.RAT.fmtHz(il.fmin) + ' minimum (rated ' + window.RAT.fmtHz(il.frat) + ')' };
      return ((f === 0 || xl <= LIM.indOhm) && i > LIM.indI) ? {
        r: i / LIM.indI,
        m: 'Short circuit: at ' + (f ? fm(f, 'Hz') : 'DC') + ' reactance is only ' + fm(xl, 'Ω') + ', current ' + fm(i, 'A')
      } : null;
    }
    if (p.t === 'FUSE' && d.t === 'R' && !p.bn) {
      const i = Math.abs(V(d.a) - V(d.b)) * d.g, rt = fuseA(p.v);
      return i > rt * 1.005 ? { r: 3 + i / rt, m: 'Current ' + fm(i, 'A') + ' is above the ' + rt + ' A rating' } : null;
    }
    /* Ammeter / Voltmeter: 10000 A, DMM: 100 A through the meter = short circuit (the meter burns, fire + char, and stays open) */
    if (p.t === 'AM' || p.t === 'VM' || p.t === 'DMM') {
      const i = d.t === 'V' ? Math.abs(x[d.k] || 0) : Math.abs(V(d.a) - V(d.b)) * (d.g || 0);
      const lim = p.t === 'DMM' && window.DMM && window.DMM.maxA ? window.DMM.maxA() : LIM.meterI;   /* DMM: 100 A (real life), Ammeter / Voltmeter: 10000 A */
      return i >= lim ? { r: i / lim, m: 'Short circuit: ' + NAME[p.t] + ' has to pass ' + fm(i, 'A') + ' (limit ' + lim + ' A)' } : null;
    }
    if (p.t === 'V' && d.t === 'V') {
      const i = Math.abs(x[d.k] || 0);
      return i >= LIM.shortI ? { r: i / LIM.shortI, m: 'Short circuit: the source has to deliver ' + fm(i, 'A') } : null;
    }
    return null;
  }
  /* ---------- fire / smoke / char layer (own <g> inside the schematic svg, never wiped by redraws) ---------- */
  let fxG = null; const fxEl = new Map();
  function layerFx() {
    if (fxG && fxG.parentNode) return fxG;
    const svg = document.getElementById('svg'); if (!svg) return null;
    if (!document.getElementById('fxStyle')) {
      const st = document.createElement('style'); st.id = 'fxStyle';
      st.textContent = '@keyframes fxFl{0%,100%{transform:scale(1,1)}25%{transform:scale(.82,1.22)}50%{transform:scale(1.12,.88)}75%{transform:scale(.9,1.14)}}' +
        '@keyframes fxSm{0%{transform:translate(0,0) scale(.5);opacity:0}15%{opacity:.55}100%{transform:translate(var(--dx,6px),-58px) scale(2.5);opacity:0}}' +
        '@keyframes fxSp{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}' +
        '@keyframes fxGl{0%,100%{opacity:.35}50%{opacity:.6}}' +
        '.fxf{transform-box:fill-box;transform-origin:50% 100%;animation:fxFl .5s infinite ease-in-out}' +
        '.fxs{transform-box:fill-box;transform-origin:50% 50%;animation:fxSm 2.4s infinite ease-out}' +
        '.fxk{animation:fxSp .7s infinite ease-out}.fxg{animation:fxGl .6s infinite ease-in-out}';
      document.head.appendChild(st);
    }
    fxG = document.createElementNS(NS, 'g'); fxG.setAttribute('id', 'fxFire'); fxG.setAttribute('pointer-events', 'none');
    fxG.innerHTML = '<defs><radialGradient id="fxGlow"><stop offset="0" stop-color="#ffb300" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0"/></radialGradient></defs>';
    svg.appendChild(fxG); return fxG;
  }
  const FL = 'M0 0C-9-2-12-14-5-24C-5-17-1-15 0-20C1-26-2-29 1-36C8-28 12-16 9-8C8-3 4 0 0 0Z';
  function flame(dx, s, dl) {
    return '<g transform="translate(' + dx + ' 0) scale(' + s + ')"><g class="fxf" style="animation-delay:' + dl + 's;animation-duration:' + (0.4 + (dl * 3 % 0.3)).toFixed(2) + 's">' +
      '<path d="' + FL + '" fill="#ff5a00"/><path d="' + FL + '" transform="scale(.66)" fill="#ffb000"/><path d="' + FL + '" transform="scale(.34)" fill="#fff4b0"/></g></g>';
  }
  const puff = (dx, dl, c, r) => '<circle cy="-8" r="' + (r || 6) + '" fill="' + (c || '#555') + '" class="fxs" style="--dx:' + dx + 'px;animation-delay:' + dl + 's"/>';
  const spark = (a, dl) => '<circle r="1.7" fill="#ffd54a" class="fxk" style="--dx:' + (Math.cos(a) * 26).toFixed(0) + 'px;--dy:' + (-12 - Math.abs(Math.sin(a)) * 30).toFixed(0) + 'px;animation-delay:' + dl + 's"/>';
  /* level 1 = smoke only (overheating), 2 = sparks + small flames, 3 = big fire, 4 = smouldering after the fire */
  function fireSVG(lv, w) {
    let s = '', n = Math.max(3, Math.min(7, Math.round(w / 14)));
    if (lv >= 3) s += '<ellipse cy="-8" rx="' + (w * 0.8) + '" ry="22" fill="url(#fxGlow)" class="fxg"/>';
    if (lv === 4) return puff(-4, 0, '#444') + puff(5, 1.2, '#555');
    if (lv >= 2) { for (let i = 0; i < n; i++) s += flame(((i / (n - 1)) - 0.5) * w * 0.7, lv >= 3 ? 0.8 + 0.5 * Math.sin(i * 2.1 + 1) ** 2 : 0.45, i * 0.11); for (let i = 0; i < 6; i++) s += spark(i * 1.05 + 0.2, i * 0.12); }
    for (let i = 0; i < (lv >= 3 ? 4 : lv === 2 ? 3 : 2); i++) s += puff((i % 2 ? 1 : -1) * (4 + i * 3), i * 0.55, lv >= 3 ? '#333' : '#666');
    return s;
  }
  function setFx(key, x, y, lv, w) {
    const g = layerFx(); if (!g) return;
    let e = fxEl.get(key);
    if (lv <= 0) { if (e) { e.g.remove(); fxEl.delete(key); } return; }
    const wq = Math.round(w / 8) * 8;
    if (!e) { e = { g: document.createElementNS(NS, 'g'), lv: -1, w: 0 }; g.appendChild(e.g); fxEl.set(key, e); }
    if (e.lv !== lv || e.w !== wq) { e.lv = lv; e.w = wq; e.g.innerHTML = fireSVG(lv, wq); }
    e.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
  }
  function setChar(key, p) {
    const g = layerFx(); if (!g) return;
    const b = partBox(p), x0 = b[0] * U10 - 3, y0 = b[1] * U10 - 3, w = (b[2] - b[0]) * U10 + 6, h = (b[3] - b[1]) * U10 + 6, sig = [x0, y0, w, h].join();
    let e = fxEl.get(key);
    if (!e) { e = { g: document.createElementNS(NS, 'g'), sig: '' }; g.insertBefore(e.g, g.firstChild ? g.children[1] || null : null); fxEl.set(key, e); }
    if (e.sig !== sig) {
      e.sig = sig;
      const cx = x0 + w / 2, cy = y0 + h / 2;
      e.g.innerHTML = '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="7" fill="#0b0b0b" opacity=".78"/>' +
        '<path d="M' + (cx - w * 0.3) + ' ' + (cy - h * 0.35) + 'L' + (cx - 2) + ' ' + cy + 'L' + (cx - w * 0.12) + ' ' + (cy + h * 0.3) + 'M' + (cx + 4) + ' ' + (cy - h * 0.3) + 'L' + (cx + w * 0.22) + ' ' + (cy + h * 0.05) + '" fill="none" stroke="#6a5a4a" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>' +
        '<circle cx="' + (cx - w * 0.22) + '" cy="' + (cy + h * 0.2) + '" r="3" fill="#2b2b2b"/><circle cx="' + (cx + w * 0.25) + '" cy="' + (cy - h * 0.2) + '" r="2.2" fill="#2b2b2b"/>';
    }
  }
  /* ---------- wires: + red, - green, short circuit = fire (never red) ---------- */
  const RED = '#e53935', GRN = '#2e9e46', HOT = '#ff9f1c', SOOT = '#2e2a27';
  let wDirty = true, wObs = null, wNet = [], wObj = [], pol = null, polR = null, polK = '', shortNets = new Set(), shortNm = [];
  function polarity() {
    const key = RS ? 'o' : 'x';
    if (pol && polR === RS && polK === key && !wDirty) return pol;
    polR = RS; polK = key;
    const P = { pos: new Set(), neg: new Set(), v: null, mid: null };
    try {
      const X = extract(S.M);
      /* Only the voltage source (+ red / - green) claims polarity. Every other part (resistor, capacitor, inductor, fuse, switches, LED,
         bulb, fan ...) follows the circuit polarity: the node voltage decides red or green. */
      const POLAR = { V: 1 }, src = { pos: new Set(), neg: new Set() };
      S.M.parts.forEach((p) => {
        if (!POLAR[p.t]) return;
        const a = X.pin[p.id + '.1'], b = X.pin[p.id + '.2'];
        if (a != null) { P.pos.add(String(a).toLowerCase()); if (p.t === 'V') src.pos.add(String(a).toLowerCase()); }
        if (b != null) { P.neg.add(String(b).toLowerCase()); if (p.t === 'V') src.neg.add(String(b).toLowerCase()); }
      });
      /* Colour of every net: ONLY a source + terminal is red; every other wire is green (negative). A part WITHOUT polarity
         (resistor, capacitor, inductor, fuse, bulb, SPST / DPDT / power switch) passes the colour through: red on one side makes
         both sides red, green on one side makes both green; red on one side and green on the other keeps one red and one green.
         A net that gets both colours (or none) falls back to the node voltage. */
      const col = new Map(), put = (n, c) => { n = String(n).toLowerCase(); const o = col.get(n); if (o == null) { col.set(n, c); return true; } if (o !== c && o !== 'x') { col.set(n, 'x'); } return false; };
      P.pos.forEach((n) => put(n, 'p')); P.neg.forEach((n) => put(n, 'n'));
      const NP = { R: 1, C: 1, L: 1, FUSE: 1, BULB: 1, SW: 1, SWM: 1, PBTN: 1, DPDT: 1 }, links = [];
      S.M.parts.forEach((p) => {
        if (!NP[p.t]) return;
        const nets = {}; partPins(p).forEach((q) => { const n = X.pin[p.id + '.' + q.name]; if (n != null) nets[q.name] = String(n).toLowerCase(); });
        const names = Object.keys(nets), grp = {};
        names.forEach((nm) => { const g = /^[ABC]([12])$/.test(nm) ? nm[1] : '0'; (grp[g] = grp[g] || []).push(nets[nm]); });
        Object.keys(grp).forEach((g) => { if (grp[g].length > 1) links.push(grp[g]); });
      });
      for (let it = 0, ch = true; ch && it < 50; it++) {
        ch = false;
        links.forEach((L) => {
          const have = L.map((n) => col.get(n)).filter((c) => c === 'p' || c === 'n');
          if (have.length === 1) L.forEach((n) => { if (col.get(n) == null) { col.set(n, have[0]); ch = true; } });
          else if (have.length > 1 && have.some((c) => c !== have[0])) { /* red on one side, green on the other: each keeps its own */ }
          else if (have.length > 1) L.forEach((n) => { if (col.get(n) == null) { col.set(n, have[0]); ch = true; } });
        });
      }
      P.col = col;
      /* the node voltages decide the nets that are not directly on a source terminal (DC circuits only) */
      if (RS && RS.op && RS.op.x && !acDriven()) {
        const nv = (n) => (n === '0' ? 0 : RS.C.idx[n] != null ? RS.op.x[RS.C.idx[n]] : null);
        let hi = -Infinity, lo = Infinity;
        src.pos.forEach((n) => { const v = nv(n); if (v != null) hi = Math.max(hi, v); });
        src.neg.forEach((n) => { const v = nv(n); if (v != null) lo = Math.min(lo, v); });
        if (isFinite(hi) && isFinite(lo) && hi - lo > 1e-6) { P.v = nv; P.mid = (hi + lo) / 2; }
      }
      wNet = []; wObj = [];
      S.M.wires.forEach((w) => { const sg = X.segs.find((s) => s.w === w); wNet.push(sg && sg.net != null ? String(sg.net).toLowerCase() : null); wObj.push(w); });
    } catch (e) { /* keep defaults */ }
    pol = P; wDirty = false; return P;
  }
  function wireColour(i, orig) {
    const w = wObj[i], n = wNet[i];
    if (w && w.ch) return SOOT;
    if (orig === '#ee2b2b' || (n != null && shortNets.has(n))) return HOT;   /* short circuit: hot wire + fire, not red */
    if (n == null) return null;
    const P = pol, c = P.col && P.col.get(n);
    if (c === 'p') return RED;   /* wire on a source + terminal (and through resistor / fuse / switch ... from it) */
    return GRN;                  /* every other wire (component to component, source - terminal) is negative = green */
    if (P.v) { const v = P.v(n); if (v != null) return v >= P.mid ? RED : GRN; }
    return null;
  }
  function paintWires() {
    const sc = document.getElementById('scene'); if (!sc) return;
    if (!wObs) { wObs = new MutationObserver(() => { wDirty = true; }); wObs.observe(sc, { childList: true }); }
    polarity();
    const n = wObj.length;
    for (let i = 0; i < n; i++) {
      const el = sc.children[i]; if (!el || el.tagName.toLowerCase() !== 'path') continue;
      if (el.dataset.fo == null) el.dataset.fo = el.getAttribute('stroke') || '';
      const o = el.dataset.fo; if (o === 'var(--accent)') continue;   /* selected wire / net keeps its highlight */
      const c = wireColour(i, o) || o;
      if (el.getAttribute('stroke') !== c) el.setAttribute('stroke', c);
    }
  }
  /* ---------- status bar message ---------- */
  let bmsg = '';
  function say(t) {
    if (t === bmsg) return; bmsg = t;
    try {
      const st = document.querySelector('.canvas-wrap .status'); if (!st) return;
      let el = document.getElementById('sBurn');
      if (!el) { el = document.createElement('span'); el.id = 'sBurn'; el.style.cssText = 'color:#ff8a1f;font-weight:700;margin-left:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%'; const a = document.getElementById('sShort') || document.getElementById('sHint'); a && a.parentNode === st ? a.after(el) : st.insertBefore(el, st.firstChild); }
      el.textContent = t; el.title = t;
    } catch (e) { /* hint only */ }
    try {   /* the built-in short-circuit text talks about red wires: fire instead */
      const sh = document.getElementById('sShort');
      if (sh && /red wires/.test(sh.textContent)) { sh.textContent = sh.textContent.replace('(red wires)', '(fire!)'); sh.style.color = '#ff8a1f'; sh.title = sh.title.replace('the wires of the loop are red', 'the loop catches fire'); }
    } catch (e) { /* ignore */ }
  }
  /* ---------- burn one part (stays on the board, open circuit; the fuse only opens) ---------- */
  function burn(p, reason, wires) {
    if (p.bn) return;
    burnAt.set(p.id, performance.now()); why.set(p.id, reason); heat.delete(p.id);
    try {
      mutate(() => { p.bn = 1; if (wires) S.M.wires.forEach((w, i) => { if (wNet[i] != null && wires.has(wNet[i])) w.ch = 1; }); });
    } catch (e) { p.bn = 1; }
    /* the simulation output (SimuScope / VirtuScope) stops as soon as something burns; ON cannot start it again until the problem is fixed */
    setTimeout(() => { try { const i = blockInfo(); if (i) { if (window.CIRC) window.CIRC.stopOutput(); scopeMsg(i, true); } } catch (e) { /* ignore */ } }, 60);
  }
  function burnStep(dt, parts, on, x) {
    const now = performance.now(), msgs = [], alive = new Set();
    /* 1. short circuit: a wire (or nothing) across a source - the solver refuses it, so it is found here */
    let SC = { nets: new Set(), names: [] };
    try { SC = shortCircuit(S.P); } catch (e) { /* none */ }
    shortNets = new Set([...SC.nets].map((n) => String(n).toLowerCase())); shortNm = SC.names.map((n) => String(n).toLowerCase());
    polarity();
    /* 2. every part */
    parts.forEach((p) => {
      const S0 = SYMS[p.t]; if (!S0 || !TAU[p.t]) return;
      alive.add(p.id);
      let ck = null;
      if (!p.bn) {
        if (p.t === 'V' && shortNm.indexOf(String(p.n).toLowerCase()) >= 0) ck = { r: 2, m: 'Short circuit: the wire across ' + p.n + ' has no resistance' };
        else if ((p.t === 'AM' || p.t === 'DMM') && shortNm.indexOf(String(p.n).toLowerCase()) >= 0) ck = { r: 4, m: 'Short circuit: ' + p.n + ' is joined straight across a source (no resistance, unlimited current)' };
        else if (on && x) ck = check(p, x);
        const h0 = heat.get(p.id) || 0;
        const h = ck ? h0 + dt / TAU[p.t] * Math.min(4, ck.r) : Math.max(0, h0 - dt * 0.4);
        if (h > 0) heat.set(p.id, h); else heat.delete(p.id);
        if (ck) why.set(p.id, ck.m);
        if (h >= 1) { burn(p, ck.m, (p.t === 'V' || p.t === 'AM' || p.t === 'DMM') && shortNets.size && shortNm.indexOf(String(p.n).toLowerCase()) >= 0 ? shortNets : null); }
      }
    });
    /* 3. effects (positions follow the part) */
    parts.forEach((p) => {
      if (!TAU[p.t]) return;
      const b = partBox(p), cx = (b[0] + b[2]) / 2 * U10, by = (b[1] + b[3]) / 2 * U10 + 8, w = (b[2] - b[0]) * U10, key = 'p' + p.id;
      let lv = 0; const h = heat.get(p.id) || 0;
      if (p.bn) {
        const t0 = burnAt.get(p.id), age = t0 == null ? 1e9 : now - t0;
        lv = p.t === 'FUSE' ? (age < 1500 ? 3 : age < 5000 ? 1 : 0) : age < 8000 ? 3 : 4;
        if (p.t !== 'FUSE') setChar('c' + p.id, p);
        const m = why.get(p.id); if (m) msgs.push('🔥 ' + p.n + ' (' + NAME[p.t] + ') ' + (p.t === 'FUSE' ? 'blown: ' : 'burned out: ') + m);
        else if (p.t !== 'FUSE') msgs.push('🔥 ' + p.n + ' (' + NAME[p.t] + ') burned out');
      } else if (h > 0.6) { lv = 2; msgs.push('⚠ ' + p.n + ' is overheating: ' + (why.get(p.id) || '')); } else if (h > 0.25) { lv = 1; msgs.push('⚠ ' + p.n + ' is getting hot: ' + (why.get(p.id) || '')); }
      if (!p.bn) { const e = fxEl.get('c' + p.id); if (e) { e.g.remove(); fxEl.delete('c' + p.id); } }
      setFx(key, cx, by, lv, Math.max(w, 28));
    });
    /* fire on the wires of a short circuit */
    if (shortNets.size) {
      let n = 0;
      try {
        const X = extract(S.M), seen = new Set();
        X.segs.forEach((sg) => {
          if (n >= 4 || sg.net == null || !shortNets.has(String(sg.net).toLowerCase()) || seen.has(sg.w)) return;
          seen.add(sg.w); n++;
          setFx('w' + n, (sg.a[0] + sg.b[0]) / 2 * U10, (sg.a[1] + sg.b[1]) / 2 * U10, 3, 30);
        });
      } catch (e) { /* ignore */ }
      for (let i = n + 1; i <= 4; i++) setFx('w' + i, 0, 0, 0, 0);
      msgs.unshift('🔥 SHORT CIRCUIT: ' + SC.names.join(', ') + ' - fire!');
    } else for (let i = 1; i <= 4; i++) if (fxEl.has('w' + i)) setFx('w' + i, 0, 0, 0, 0);
    /* forget parts that are gone / un-burnt (Undo, delete, new circuit) */
    [...fxEl.keys()].forEach((k) => { const id = k.slice(1); if ((k[0] === 'p' || k[0] === 'c') && !alive.has(id)) { fxEl.get(k).g.remove(); fxEl.delete(k); } });
    [...heat.keys()].forEach((id) => { if (!alive.has(id)) heat.delete(id); });
    [...burnAt.keys()].forEach((id) => { const q = parts.find((z) => z.id === id); if (!q || !q.bn) { burnAt.delete(id); why.delete(id); } });
    paintWires();
    say(msgs.slice(0, 3).join('   ') + (msgs.length > 3 ? '   (+' + (msgs.length - 3) + ' more)' : ''));
  }
  /* ---------- after a burn / short circuit the simulation cannot be switched ON: the workspace blurs and says why ---------- */
  function blockInfo() {
    let sh = false, names = [], reasons = [], fuses = 0;
    try { sh = shortCircuit(S.P).nets.size > 0; } catch (e) { sh = false; }
    /* a blown FUSE counts like a burnt bulb / fan / LED: the simulation cannot be switched ON until it is replaced (Replace fuse) or Undo */
    try { S.M.parts.forEach((p) => { if (p.bn) { names.push(p.n); if (p.t === 'FUSE') fuses++; if (/short/i.test(why.get(p.id) || '')) sh = true; reasons.push(p.n + (p.t === 'FUSE' ? ' (Fuse): blown - ' + (why.get(p.id) || 'current above its rating') : ': ' + (why.get(p.id) || 'burned out'))); } }); } catch (e) { /* ignore */ }
    return (sh || names.length) ? { sh, names, reasons, onlyFuse: fuses > 0 && fuses === names.length } : null;
  }
  function showBlock(info) {
    const w = document.querySelector('.canvas-wrap'); if (!w) return;
    let o = document.getElementById('fxBlock');
    if (!o) {
      o = document.createElement('div'); o.id = 'fxBlock';
      o.style.cssText = 'position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(10,10,12,.35);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px)';
      o.innerHTML = '<div style="max-width:min(460px,86%);background:var(--panel,#fff);color:var(--ink,#222);border:2px solid #ff8a1f;border-radius:14px;padding:18px 22px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.45)">' +
        '<div style="font-size:34px;line-height:1">🔥</div><div id="fxBT" style="font-size:20px;font-weight:800;color:#ff8a1f;margin:6px 0"></div>' +
        '<div id="fxBD" style="font-size:13px;line-height:1.5;margin-bottom:12px"></div>' +
        '<button id="fxBOk" style="padding:6px 22px;border-radius:8px;border:1px solid #ff8a1f;background:#ff8a1f;color:#fff;font-weight:700;cursor:pointer">OK</button></div>';
      w.appendChild(o);
      o.querySelector('#fxBOk').onclick = () => { o.style.display = 'none'; };
    }
    o.querySelector('#fxBT').textContent = info.sh ? 'Short Circuit Detected' : info.onlyFuse ? 'Blown Fuse Detected' : 'Burnt Component Detected';
    o.querySelector('#fxBD').innerHTML = (info.sh ? 'The circuit has a short circuit. ' : '') + 'The simulation cannot be switched ON.<br>' +
      info.reasons.slice(0, 4).map((r) => r.replace(/[<>&]/g, '')).join('<br>') + '<br>' +
      (info.onlyFuse && !info.sh ? 'Select the fuse and press <b>Replace fuse</b> (or <b>Undo</b>), then press ON again.' : '<b>Undo</b>, delete or replace the burnt part (a blown fuse: <b>Replace fuse</b>), or remove the short, then press ON again.');
    o.style.display = 'flex';
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('#bRunSim,#bRunNet,#bRun') : null; if (!b) return;
    const info = blockInfo(); if (!info) return;
    ev.stopImmediatePropagation(); ev.preventDefault(); showBlock(info); scopeMsg(info, true);
  }, true);
  /* ---------- the same burn message inside the SimuScope / VirtuScope output (status line + output area) ----------
     A blown fuse is announced exactly like a burnt bulb / fan / LED / capacitor / inductor / source: orange text in the scope status
     line as soon as the part burns (also while the output is ON), and - when ON is pressed - in the output area as well. */
  function scopeText(info) {
    const head = info.sh ? '🔥 Short circuit' : info.onlyFuse ? '🔥 Blown fuse' : '🔥 Burnt component';
    return head + ': ' + info.reasons.slice(0, 3).map((r) => r.replace(/[<>&]/g, '')).join(' | ') + (info.reasons.length > 3 ? ' ...' : '');
  }
  function scopeMsg(info, press) {
    try {
      const t = scopeText(info), st = document.getElementById('simst'), o = document.getElementById('out');
      if (st && !(st.firstChild && st.firstChild.className === 'fxs' && st.textContent === t)) {
        st.innerHTML = '<span class="fxs wn" style="color:#ff8a1f;font-weight:700"></span>'; st.firstChild.textContent = t; st.title = t;
      }
      if (press) {
        const live = (typeof SIMLIVE !== 'undefined' && SIMLIVE) || (typeof RES !== 'undefined' && RES);
        if (o && !live) { o.innerHTML = '<p class="empty" style="color:#ff8a1f;font-weight:700"></p>'; o.firstChild.textContent = t + '. The simulation cannot be switched ON.'; }
        try { const nw = performance.now(); if (typeof toast === 'function' && (scopeMsg.lt == null || nw - scopeMsg.lt > 2500)) { scopeMsg.lt = nw; toast(t, 'info'); } } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }
  /* Nothing can start the simulation output while a part is burnt / blown or a short circuit exists (ON button, Run, auto-run after an edit):
     the output stays OFF and the burn message is shown instead. Undo / Replace fuse / delete the part, then press ON again. */
  (function guardRun() {
    const o = window.runSimUI; if (typeof o !== 'function' || o.fxGuard) return;
    const g = function () {
      const info = blockInfo();
      if (info) { try { if (window.CIRC) window.CIRC.stopOutput(); } catch (e) { /* ignore */ } scopeMsg(info, true); return; }
      return o.apply(this, arguments);
    };
    g.fxGuard = true; window.runSimUI = g;
  })();
  setInterval(() => {
    try {
      const info = blockInfo(), st = document.getElementById('simst');
      if (info) scopeMsg(info, false);
      else if (st && st.firstChild && st.firstChild.className === 'fxs') { st.innerHTML = ''; st.title = ''; }   /* problem gone (Undo / Replace fuse / delete) */
    } catch (e) { /* ignore */ }
  }, 300);
  /* the message goes away by itself once the problem is gone (Undo, delete, new circuit) */
  setInterval(() => { try { const o = document.getElementById('fxBlock'); if (o && o.style.display !== 'none' && !blockInfo()) o.style.display = 'none'; } catch (e) { /* ignore */ } }, 500);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    let parts; try { parts = S.M.parts; } catch (e) { return; }
    RS = (window.CR ? window.CR() : ((typeof RES !== 'undefined' && RES && RES.op && RES.C && !(RES.errs && RES.errs.length)) ? RES : null));   /* circuit alive (power switch ON, netlist runnable) - not tied to Run / Stop */
    const on = live(), x = on ? cur() : null, R = on ? rated() : 12;
    const ease = (c, g, tr, tf) => c + (g - c) * (1 - Math.exp(-dt / (g > c ? tr : tf)));
    parts.forEach((p) => {
      const k = KIND[p.t]; if (!k) return;
      let v = vals.get(p.id); if (!v) { v = { l: 0, a: 0, s: 0, t: '', w: 0, u: '' }; vals.set(p.id, v); }
      const t = on && !p.bn ? target(p, x, R) : null, ok = t != null && isFinite(t);
      if (k === 'b') { const r = ok ? t * t : 0; v.l = ease(v.l, r < 0.003 ? 0 : 1 - Math.exp(-3.4 * r), 0.25, 0.12); if (v.l < 0.004) v.l = 0; }
      else if (k === 'l') {
        let g = ok && t > 2e-5 ? 1 - Math.exp(-t / 0.004) : 0;
        if (g > 0) { const d = dev(p.n); if (d && d.t === 'D') { const L = ledInfo(p, d, x); g *= Math.max(0, Math.min(1, (L.v - (L.vf - 0.5)) / 0.25)); } }
        v.l = ease(v.l, g, 0.03, 0.05); if (v.l < 0.004) v.l = 0;
      }
      else if (k === 'f') {
        /* signed speed: + = clockwise, - = anticlockwise. DC: steady (battery or fan flipped = other direction).
           AC: the polarity reverses every half-cycle, so the DC fan runs both ways (clockwise <-> anticlockwise). */
        const m = ok ? Math.sign(t) * Math.max(0, Math.min(1, (Math.abs(t) - 0.12) / 0.88)) : 0;
        v.s += (m - v.s) * (1 - Math.exp(-dt / (Math.abs(m) > Math.abs(v.s) ? 0.5 : 0.3)));
        if (Math.abs(v.s) < 0.01) v.s = 0;
        v.a = (((v.a + v.s * 1100 * dt) % 360) + 360) % 360; v.w = (((v.w + v.s * 240 * dt) % 360) + 360) % 360;
      }
      else if (k === 'd') { const r = on && !p.bn ? dmmRead(p, x) : { t: '', u: '' }; v.t = r.t; v.u = r.u; }
      else v.t = ok ? fm(t, k === 'a' ? 'A' : 'V') : '';
    });
    /* an LED that is reverse-biased (battery / source the wrong way round) can never glow: say so in the status bar,
       with a one-click button that swaps the two nodes of the DC source in the netlist */
    try {
      const sh = document.getElementById('sHint');
      if (sh) {
        let bad = null, srcN = null, low = null;
        if (on && !acDriven()) {   /* AC circuit: LED blinks on its own, no warning, no Flip button */
          parts.forEach((p) => {
            if (p.t !== 'LED') return;
            const d = dev(p.n); if (!d || d.t !== 'D') return;
            const L = ledInfo(p, d, x);
            if (L.v < -0.5) { if (!bad) bad = p.n; }
            else if (!low && L.key && L.v > 0.3 && L.i < 3e-4 && L.v < L.tab - 0.15) low = { n: p.n, key: L.key, v: L.v, vf: L.tab };
          });
          if (bad) srcN = bad;
        }
        if (bad) {
          const key = bad + '|' + srcN;
          if (sh.dataset.rvk !== key) {
            if (sh.dataset.rv == null) sh.dataset.rv = sh.textContent;
            sh.dataset.rvk = key; sh.textContent = '⚠ LED is reverse-biased, so it cannot glow. '; sh.style.color = 'var(--err, #d64545)'; sh.style.fontWeight = '600';
            if (srcN) {
              const bt = document.createElement('button');
              bt.textContent = 'Flip LED'; bt.title = 'Flip the LED in place (anode / cathode swap, wires stay as they are)';
              bt.style.cssText = 'margin-left:6px;padding:2px 10px;border-radius:6px;border:1px solid #f0a000;background:#fff3d6;color:#7a4b00;font-weight:600;cursor:pointer';
              bt.onclick = () => flipLed(srcN);
              sh.appendChild(bt);
            } else sh.appendChild(document.createTextNode('Rotate / mirror the source (+ toward the resistor) or the LED.'));
          }
        } else if (low) {
          const key = 'low|' + low.n + '|' + low.key + '|' + low.v.toFixed(1);
          if (sh.dataset.rvk !== key) {
            if (sh.dataset.rv == null) sh.dataset.rv = sh.textContent;
            sh.dataset.rvk = key; sh.style.color = ''; sh.style.fontWeight = ''; sh.textContent = '⚠ ' + low.n + ' (' + low.key + ' LED) needs about ' + low.vf + ' V forward voltage but gets only ' + low.v.toFixed(1) + ' V: raise the supply voltage';
          }
        } else if (sh.dataset.rv != null) { sh.textContent = sh.dataset.rv; sh.style.color = ''; sh.style.fontWeight = ''; delete sh.dataset.rv; delete sh.dataset.rvk; }
      }
    } catch (e) { /* hint only */ }
    try { burnStep(dt, parts, on, x); } catch (e) { /* effects must never stop the frame loop */ }
    document.querySelectorAll('#scene [data-fx]').forEach((el) => {
      const v = vals.get(el.dataset.fx); if (!v) return;
      const o = (n) => el.setAttribute('opacity', n.toFixed(3));
      /* A flipped (mirrored) fan is DRAWN mirror-imaged, which would reverse the blades on screen a second time.
         The polarity is already handled by the netlist (v sign), so undo the mirror here: the screen direction then follows
         the electrical polarity only (fan flipped alone = other way round, battery AND fan flipped = back to clockwise). */
      const pm = (el.dataset.role === 'rotor' || el.dataset.role === 'wind') ? parts.find((q) => String(q.id) === el.dataset.fx) : null, mg = pm && pm.m ? -1 : 1;
      /* Schematic LED: its glow is drawn yellow, so recolour it here to the LED's own colour (RED_LED -> red, BLUE_LED -> blue ...).
         The realistic LED already draws its own colour; its triangle path is different, so it is left alone. */
      if (el.dataset.role === 'ledhalo' || (el.dataset.role === 'ledlit' && el.getAttribute('d') === 'M-8-12V12L8 0Z')) {
        const lp = parts.find((q) => String(q.id) === el.dataset.fx), lk = (lp && ledKey(lp.v)) || 'yellow';
        if (el.dataset.fxk !== lk) {
          el.dataset.fxk = lk;
          el.setAttribute('fill', el.dataset.role === 'ledhalo' ? 'url(#rc-halo-' + lk + ')' : (LED_GLOW[lk] || LED_GLOW.yellow));
        }
      }
      switch (el.dataset.role) {
        case 'halo': case 'lit': case 'fil': case 'ledhalo': case 'ledlit': case 'ledrays': o(v.l); break;
        case 'ledcore': o(v.l * 0.85); break;
        case 'rotor': el.setAttribute('transform', 'rotate(' + (mg * v.a).toFixed(1) + ')'); break;
        case 'blur': o(Math.abs(v.s) * 0.35); break;
        case 'wind': o(Math.min(1, Math.abs(v.s) * 1.4)); el.setAttribute('transform', 'rotate(' + (mg * v.w).toFixed(1) + ')'); break;
        case 'txt': if (el.textContent !== v.t) el.textContent = v.t; break;
        case 'seg': if (window.SEG7) SEG7.fill(el, v.t); break;
        case 'dmmu': if (el.textContent !== (v.u || '')) el.textContent = v.u || ''; break;
        case 'pwr': el.setAttribute('fill', v.t ? '#46ff7a' : '#1b3a25'); break;
      }
    });
  }
  requestAnimationFrame(frame);
})();
