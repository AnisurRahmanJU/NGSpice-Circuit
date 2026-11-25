/* circuit-state.js — separates the CIRCUIT from the SIMULATION OUTPUT.  Load AFTER ngspice.js, BEFORE electronflow.js.

   CIRCUIT   (power switch + netlist)  -> electron flow, Bulb / LED / Fan / Buzzer / meters, relay armature
   OUTPUT    (Run / Stop buttons)      -> graphs, tables, status line, animation of the graph only

   * The circuit is "alive" whenever it is runnable (no netlist error) and its power switch (RSWM) is ON.
     Run / Stop do NOT change that: after Stop the electrons keep flowing and the lamps keep glowing.
   * Any switch only changes the circuit. It never turns the simulation output ON or OFF (ON / OFF buttons do that).
   * Power switch (RSWM) OFF -> the circuit is dead (no flow, lamps dark).
   * SPST switch (RSW) / DPDT switch OFF -> the circuit is dead when nothing can flow any more (a switch in series with the
     supply). If current still flows through another path (burglar-alarm loop, selector switch, relay start / stop button)
     the circuit stays alive and simply shows what the open switch does (the alarm sounds).
   * ON pressed while a switch is OFF -> "Switch is OFF, turn the switch ON to run the simulation."
   * SimuScope / VirtuScope buttons: ON = run the simulation output, OFF = stop it.

   window.CR()   -> the solver result that describes the circuit right now (null = dead / not runnable / still computing)
   window.CIRC   -> { off(), MSG, keep(), stopOutput(), rerun }                                                     */
(function () {
  'use strict';
  const $id = (i) => document.getElementById(i);
  const MSG = 'Switch is OFF, turn the switch ON to run the simulation.';
  const closed = (p) => !(num(p && p.v) > 1);
  /* switches: Power switch (RSWM) open, SPST switch (RSW) open, DPDT in its OFF position */
  const swmOff = () => { try { return S.M.parts.some((p) => p.t === 'SWM' && !closed(p)); } catch (e) { return false; } };
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
        const rows = [R.op.x];
        const X = R.tran && R.tran.X; if (X && X.length) { const st = Math.max(1, Math.floor(X.length / 400)); for (let i = 0; i < X.length; i += st) rows.push(X[i]); }
        outer: for (const x of rows) for (const d of vs) if (Math.abs(x[d.k]) > 1e-7) { q = false; break outer; }
      }
    } catch (e) { q = false; }
    qcache.set(R, q); return q;
  }
  /* dead circuit = Power switch OFF, or an SPST / DPDT switch OFF that leaves nothing flowing */
  const off = () => {
    if (swmOff()) return true;
    if (!othOff()) return false;
    const R = raw(); return !!(R && quiet(R));
  };
  function CR() {
    try {
      if (swmOff()) return null;                                 /* no power: nothing flows, nothing glows */
      const R = raw();
      if (R && othOff() && quiet(R)) return null;               /* switch open and nothing flows */
      return R;
    } catch (e) { return null; }
  }
  window.CR = CR;

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

  window.CIRC = { off, MSG, keep() { try { if (okRes(RES) && RUNSIG !== null) cache = { key: RUNSIG, R: RES }; } catch (e) { /* ignore */ } }, stopOutput, rerun: false };
  window.fullStopSim = stopOutput;   /* kept for older callers: Stop = output only */
})();
