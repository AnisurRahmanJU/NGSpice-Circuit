/* circuit-state.js — separates the CIRCUIT from the SIMULATION OUTPUT.  Load AFTER ngspice.js, BEFORE electronflow.js.

   CIRCUIT   (power switch + netlist)  -> electron flow, Bulb / LED / Fan / Buzzer / meters, relay armature
   OUTPUT    (Run / Stop buttons)      -> graphs, tables, status line, animation of the graph only

   * The circuit is "alive" whenever it is runnable (no netlist error) and its power switch (RSWM) is ON.
     Run / Stop do NOT change that: after Stop the electrons keep flowing and the lamps keep glowing.
   * Any switch only changes the circuit. It never turns the simulation output ON or OFF (ON / OFF buttons do that).
   * Power switch (RSWM) OFF -> the circuit is dead (no flow, lamps dark).  An SPST / DPDT switch in POWER MODE (name RSWPn / XSWPn) does the same.
   * SPST switch (RSW) / DPDT switch OFF -> works like the Power switch: the circuit is dead when nothing can flow any more (a switch in series with the
     supply; a transformer that only draws magnetising current counts as nothing flowing). If current still flows through another path (burglar-alarm loop, selector switch, relay start / stop button)
     the circuit stays alive and simply shows what the open switch does (the alarm sounds).
   * ON pressed while a switch is OFF -> "Switch is OFF, turn the switch ON to run the simulation."
   * SimuScope / VirtuScope buttons: ON = run the simulation output, OFF = stop it.

   window.CR()   -> the solver result that describes the circuit right now (null = dead / not runnable / still computing)
   window.CIRC   -> { off(), MSG, keep(), stopOutput(), rerun }                                                     */
(function () {
  'use strict';
  const $id = (i) => document.getElementById(i);
  const MSG = 'Switch is OFF or not connected, turn the switch ON / connect it to run the simulation.';
  const OPENMSG = 'Disconnected wire found please connect wire in circuit';
  const closed = (p) => !(num(p && p.v) > 1);
  /* switches: Power switch (RSWM) open, SPST switch (RSW) open, DPDT in its OFF position */
  /* A switch that is NOT wired into the circuit (loose on the canvas, or only one side connected) breaks the circuit exactly like an OFF
     power switch: no electron flow, no glow, meters read nothing.  Wired = every signal pin of a 2-pin switch / push button shares its net
     with a pin of another part (or ground); a DPDT needs at least one common and one throw wired. */
  const isSwT = (p) => p.t === 'SW' || p.t === 'SWM' || p.t === 'PBTN' || p.t === 'DPDT';
  function looseSwitch() {
    try {
      if (!S.M.parts.some(isSwT)) return false;
      const X = extract(S.M), cnt = new Map();
      S.M.parts.forEach((p) => { if (!SYMS[p.t]) return; partPins(p).forEach((q) => { const n = X.pin[p.id + '.' + q.name]; if (n != null) cnt.set(n, (cnt.get(n) || 0) + 1); }); });
      const con = (p, q) => { const n = X.pin[p.id + '.' + q.name]; return n != null && (n === '0' || cnt.get(n) > 1); };
      return S.M.parts.some((p) => {
        if (!isSwT(p)) return false;
        const pins = partPins(p);
        if (p.t === 'DPDT') {
          const cm = pins.filter((q) => /^c/.test(q.name)).some((q) => con(p, q)), th = pins.filter((q) => /^[ab]/.test(q.name)).some((q) => con(p, q));
          return !(cm && th);
        }
        return !pins.every((q) => con(p, q));
      });
    } catch (e) { return false; }
  }
  /* POWER MODE: an SPST switch (RSWPn) or DPDT switch (XSWPn) in power mode is a Power switch: OFF (SPST open / DPDT in its OFF position)
     cuts the whole circuit, wherever it sits, with no "something else still flows" exception.  The mode is the "P" in the element name. */
  const pwrMode = (p) => !!p && (p.t === 'SW' || p.t === 'DPDT') && /^(rswp|xswp)(\d|_|$)/i.test(String(p.n || ''));
  const pwrOpen = (p) => p.t === 'DPDT' ? /_o\s*$/i.test(String(p.v)) : !closed(p);
  const swmOff = () => { try { return looseSwitch() || S.M.parts.some((p) => (p.t === 'SWM' && !closed(p)) || (pwrMode(p) && pwrOpen(p))); } catch (e) { return false; } };
  const othOff = () => { try { return S.M.parts.some((p) => (p.t === 'SW' && !closed(p)) || (p.t === 'DPDT' && /_o\s*$/i.test(String(p.v)))); } catch (e) { return false; } };
  const srcText = () => { const s = $id('src'); return s ? s.value : ''; };
  const okRes = (R) => !!(R && R.op && R.C && !(R.errs && R.errs.length));

  /* ---------- circuit result (independent of Run / Stop) ---------- */
  let cache = { key: null, R: null }, pend = false;
  function compute(k) {
    let R = null;
    try {
      if (!S.P.errs.length) { R = runSim(S.P); if (!okRes(R)) R = null; if (R) R.fromCircuit = true; }
    } catch (e) { R = null; }
    cache = { key: k, R };
  }
  /* solver result of the netlist exactly as it is now (switches as set), whatever the power state */
  function raw() {
    try {
      const k = simSig(srcText());
      /* the Run result of this very netlist is the circuit result too (graph frame and lamps stay in step) */
      if (okRes(RES) && RUNSIG !== null && RUNSIG === k) { cache = { key: k, R: RES }; return RES; }
      if (cache.key === k) return cache.R;
      /* netlist changed: solve it once the edit settles (dead / idle drift in between) */
      if (!pend) { pend = true; setTimeout(() => { pend = false; try { compute(simSig(srcText())); } catch (e) { /* ignore */ } }, 120); }
    } catch (e) { /* ignore */ }
    return null;
  }
  /* true when no supply drives any current (every V source carries ~0 A in the operating point and in every transient frame) */
  const qcache = new WeakMap();
  function quiet(R) {
    if (qcache.has(R)) return qcache.get(R);
    let q = false;
    try {
      const vs = R.C.devs.filter((d) => d.t === 'V' && d.k != null);
      if (vs.length) {
        q = true;
        if (R.C.devs.some((d) => /^[EGFHBO]$/.test(d.t))) { qcache.set(R, false); return false; }   /* controlled sources / op-amps drive current themselves */
        if (R.ac) { qcache.set(R, false); return false; }   /* AC analysis: small-signal sources drive the circuit even with 0 A at DC */
        const rows = [R.op.x];
        const DX = R.dc && R.dc.X; if (DX && DX.length) { const st = Math.max(1, Math.floor(DX.length / 60)); for (let i = 0; i < DX.length; i += st) rows.push(DX[i]); rows.push(DX[DX.length - 1]); }
        const X = R.tran && R.tran.X; if (X && X.length) { const st = Math.max(1, Math.floor(X.length / 400)); for (let i = 0; i < X.length; i += st) rows.push(X[i]); }
        outer: for (const x of rows) for (const d of vs) if (Math.abs(x[d.k]) > 1e-7) { q = false; break outer; }
      }
    } catch (e) { q = false; }
    qcache.set(R, q); return q;
  }
  /* An AC source that only feeds reactive current (transformer with its secondary open, coil or capacitor and nothing else) delivers no real power:
     its current is 90 degrees away from its voltage (power factor < 0.1).  With an SPST / DPDT switch OFF that is "nothing flows" too, exactly like
     the Power switch OFF - the tiny magnetising current must not keep the electron flow, lamps and buzzer alive. */
  function reactiveOnly(R) {
    try {
      const X = R.tran && R.tran.X; if (!X || X.length < 8) return false;
      const vs = R.C.devs.filter((d) => d.t === 'V' && d.k != null); if (!vs.length) return false;
      const st = Math.max(1, Math.floor(X.length / 600));
      for (const d of vs) {
        let sp = 0, sv = 0, si = 0, n = 0;
        for (let r = 0; r < X.length; r += st) {
          const x = X[r], v = (d.a < 0 ? 0 : x[d.a]) - (d.b < 0 ? 0 : x[d.b]), i = x[d.k];
          sp += v * i; sv += v * v; si += i * i; n++;
        }
        if (!n || sv < 1e-18) continue;                              /* 0 V source (ammeter): same current as its neighbour, judged there */
        const vr = Math.sqrt(sv / n), ir = Math.sqrt(si / n);
        if (ir < 1e-9) continue;                                     /* no current at all */
        if (Math.abs(sp / n) / (vr * ir) > 0.1) return false;        /* real power is delivered: something is really running */
      }
      return true;
    } catch (e) { return false; }
  }
  const idle = (R) => !!(R && (quiet(R) || (othOff() && reactiveOnly(R))));
  /* the circuit result right now; when a switch decides the state it is solved at once (no 120 ms wait where the switch would look half ON) */
  function rawNow() {
    let R = raw();
    if (!R && !S.P.errs.length) { try { const k = simSig(srcText()); compute(k); R = cache.R; } catch (e) { R = null; } }
    return R;
  }
  /* dead circuit = Power switch OFF, or an SPST / DPDT switch OFF that leaves nothing flowing */
  const off = () => {
    if (swmOff()) return true;
    if (!othOff()) return false;
    return idle(rawNow());
  };
  function CR() {
    try {
      if (swmOff()) return null;                                 /* no power: nothing flows, nothing glows */
      const R = othOff() ? rawNow() : raw();
      if (R && idle(R)) return null;                            /* open circuit (switch open, wire cut ...): nothing flows, everything off */
      return R;
    } catch (e) { return null; }
  }
  window.CR = CR;

  /* ---------- 555 latch memory: a circuit with a push button is re-solved from t = 0 on every press / release, so the 555 flip-flop
     state at the end of the last solve is kept and used as the start state of the next one (bistable: the output remembers) ---------- */
  window.Q555 = window.Q555 || {};
  try {
    const rs0 = runSim;
    runSim = function (M) {
      const pb = !!(M && M.els && M.els.some((e) => e.k === 'R' && /^rpb(\d|_|$)/i.test(e.n)));
      const R = rs0.apply(this, arguments);
      try { if (pb && R && R.C && R.C.t555) R.C.t555.forEach((d) => { window.Q555[d.nm] = d.q ? 1 : 0; }); } catch (e) { /* ignore */ }
      return R;
    };
  } catch (e) { /* ignore */ }
  /* push-button circuits: the transient that starts at a press / release is played ONCE (about 2.5 s), then the last frame is held.
     PB1(R) = 0..1 progress of that playback, or null when the circuit has no push button. Works with the scope OFF. */
  const pbSeen = new WeakMap();
  window.PB1 = (R) => {
    try {
      if (!R || !R.tran || !R.tran.X || R.tran.X.length < 2) return null;
      let o = pbSeen.get(R);
      if (!o) { o = { pb: R.C.devs.some((d) => d.t === 'R' && /^rpb/i.test(String(d.nm))), t0: performance.now() }; pbSeen.set(R, o); }
      return o.pb ? Math.min(1, (performance.now() - o.t0) / 2500) : null;
    } catch (e) { return null; }
  };
  window.resetLatches = () => { window.Q555 = {}; };

  /* ---------- the simulation OUTPUT only (graphs, tables, status, animation) ---------- */
  function stopOutput() {
    try { if (okRes(RES) && RUNSIG !== null) cache = { key: RUNSIG, R: RES }; } catch (e) { /* ignore */ }   /* circuit keeps its result */
    try { clearTimeout(simT); } catch (e) { /* ignore */ }
    try { SIMLIVE = false; } catch (e) { /* ignore */ }
    try { if (ANIM.on) stopAnim(true); } catch (e) { /* ignore */ }
    try { RES = null; } catch (e) { /* ignore */ }
    try { showTab(); } catch (e) { /* ignore */ }
    try {
      const o = $id('out'); if (o) o.innerHTML = '';
      const st = $id('simst'); if (st) st.innerHTML = '';
      const t = $id('aTime'); if (t) t.textContent = '';
      const b = $id('aBar'); if (b) b.style.width = '0';
    } catch (e) { /* ignore */ }
    try { draw(); } catch (e) { /* ignore */ }
    try { animBtns(); } catch (e) { /* ignore */ }
  }

  /* open circuit = no switch problem, but nothing can flow (cut wire, missing part): solved right now, not from the async cache */
  const open = () => {
    try {
      if (off()) return false;
      const k = simSig(srcText());
      let R = (okRes(RES) && RUNSIG !== null && RUNSIG === k) ? RES : (cache.key === k ? cache.R : null);
      if (!R && !S.P.errs.length) { compute(k); R = cache.R; }
      /* no current alone is NOT a wiring fault: a capacitor blocks DC (and an inductor + capacitor on DC carries nothing in the .op point).
         Only a source whose two terminals are not joined through the other parts is a real disconnected wire. */
      return !!(R && quiet(R) && !wired(R));
    } catch (e) { return false; }
  };
  /* true when every real supply (V source) has a closed loop through the other parts: capacitors, inductors, diodes, transistors ... all count as
     connections (resistors of 100 Mohm or more, i.e. an OFF switch or a burnt part, do not) */
  function wired(R) {
    try {
      const vs = R.C.devs.filter((d) => d.t === 'V' && d.k != null && d.a !== d.b && !/^(vam|vdmm)/i.test(String(d.nm)) && (Math.abs((d.s && d.s.dc) || 0) > 0 || (d.s && d.s.w)));
      if (!vs.length) return false;
      const nodes = (d) => {
        const ok = (...a) => a.filter((n) => Number.isInteger(n) && n >= -1);
        switch (d.t) {
          case 'R': return d.g > 1e-8 ? ok(d.a, d.b) : [];
          case 'C': case 'L': case 'V': case 'I': case 'D': case 'E': case 'G': return ok(d.a, d.b);
          case 'Q': return ok(d.c, d.bb, d.e);
          default: return ok(d.a, d.b, d.c, d.d, d.e, d.g, d.s, d.bb);
        }
      };
      return vs.every((src) => {
        const par = new Map(), f = (n) => { while (par.has(n) && par.get(n) !== n) { par.set(n, par.get(par.get(n))); n = par.get(n); } return n; };
        const un = (a, b) => { if (!par.has(a)) par.set(a, a); if (!par.has(b)) par.set(b, b); par.set(f(a), f(b)); };
        R.C.devs.forEach((d) => { if (d === src) return; const n = nodes(d); for (let i = 1; i < n.length; i++) un(n[0], n[i]); });
        if (!par.has(src.a)) par.set(src.a, src.a); if (!par.has(src.b)) par.set(src.b, src.b);
        return f(src.a) === f(src.b);
      });
    } catch (e) { return false; }
  }
  const dead = () => { if (off()) return true; try { const R = raw(); return !!(R && idle(R)); } catch (e) { return false; } };
  window.CIRC = { OPENMSG, open, dead, off, MSG, keep() { try { if (okRes(RES) && RUNSIG !== null) cache = { key: RUNSIG, R: RES }; } catch (e) { /* ignore */ } }, stopOutput, rerun: false };
  window.fullStopSim = stopOutput;   /* kept for older callers: Stop = output only */
})();
