/* switch-ui.js — Switches & relays: behaviour on the canvas.  Load AFTER ngspice.js, electronflow.js and live-effects.js.

   * click a Switch / Power switch / DPDT switch on the canvas to toggle it (drag still moves it)
   * EVERY switch (Power switch, Switch, DPDT, relay inputs) acts on the CIRCUIT only: electron flow, lamps / LEDs / fan /
     buzzer / meters follow it at once. A switch never turns the simulation output ON or OFF.
   * The simulation output (graphs) is controlled only by the ON / OFF buttons of the SimuScope / VirtuScope bar.
     ON pressed while a Power switch is OFF -> "Switch is OFF, turn the switch ON to run the simulation." (output stays OFF)
   * other switches / relay inputs re-run the simulation at once when it was running, so you see the effect live
   * relay armature moves with the contact state of the solver frame on screen
   * "Realistic" drawings for the new parts                                                                       */
(function () {
  'use strict';
  const $id = (i) => document.getElementById(i);
  const closed = (p) => !(num(p && p.v) > 1);
  const isSw = (p) => p && (p.t === 'SW' || p.t === 'SWM' || p.t === 'DPDT');
  const CRs = () => (window.CR ? window.CR() : ((typeof RES !== 'undefined' && RES && RES.op && RES.C && !(RES.errs && RES.errs.length)) ? RES : null));
  const live = () => !!CRs();                                   /* circuit alive: power switch ON + runnable netlist */
  const isLong = (p) => /mode\s*=\s*long/i.test(String(p && p.v));   /* push button option: Long press (push once = stays pressed) */
  const dpdtOff = (p) => /_o\s*$/i.test(String(p.v));
  /* dead circuit (see circuit-state.js): Power switch OFF, or SPST / DPDT OFF with nothing flowing any more */
  const masterOff = () => (window.CIRC ? window.CIRC.off() : S.M.parts.some((p) => p.t === 'SWM' && !closed(p)));
  const MSG = 'Switch is OFF or not connected, turn the switch ON / connect it to run the simulation.';
  const outputOn = () => (typeof SIMLIVE !== 'undefined' && SIMLIVE) || (typeof ANIM !== 'undefined' && ANIM.on);

  /* ---------- solver switch states of the frame on screen ---------- */
  window.SWSTATE = {
    apply(kind, idx) {
      const R = CRs();
      if (!R || !R.C || !R.C.sws || !R.C.sws.length) return;
      let a = null;
      if (kind === 'tran' && R.tran && R.tran.SW) a = R.tran.SW[idx];
      else if (kind === 'dc' && idx >= 0 && R.dc && R.dc.SW) a = R.dc.SW[idx];
      if (!a && R.op) a = R.op.SW;
      if (a) R.C.sws.forEach((d, i) => { d.on = !!a[i]; });
    }
  };

  /* ---------- power switch gate (pressing ON of the simulation) ---------- */
  const OPENMSG = 'Disconnected wire found please connect wire in circuit';
  let userClick = false;
  function showOff(msg, quiet) {
    msg = msg || MSG;
    try { const st = $id('simst'); if (st) st.innerHTML = '<span class="wn">' + msg + '</span>'; const o = $id('out'); if (o) o.innerHTML = '<p class="empty">' + msg + '</p>'; if (!quiet) toast(msg, 'info'); } catch (e) { /* ignore */ }
  }
  /* The simulation output cannot be STARTED while a power switch is OFF: say why and leave the output OFF.
     (Electron flow / lamps are switched by the circuit itself through window.CR(), not here.) */
  function offGuard(announce) {
    if (window.CIRC && window.CIRC.rerun) return false;   /* rerun = refresh of an output that is already ON */
    const sw = masterOff(), op = !sw && !!(window.CIRC && window.CIRC.open && window.CIRC.open());
    if (!sw && !op) return false;
    try { if (window.CIRC) window.CIRC.stopOutput(); } catch (e) { /* ignore */ }
    if (announce !== false) showOff(op ? OPENMSG : MSG, op && !userClick);
    return true;
  }
  /* a switch was turned ON again: remove the "Switch is OFF" text (the output itself is not touched) */
  function clearOffText() {
    try {
      const st = $id('simst'), o = $id('out');
      if (st && (st.textContent.indexOf(MSG) >= 0 || st.textContent.indexOf(OPENMSG) >= 0)) st.innerHTML = '';
      if (o && (o.textContent.indexOf(MSG) >= 0 || o.textContent.indexOf(OPENMSG) >= 0)) o.innerHTML = '';
    } catch (e) { /* ignore */ }
  }
  window.SWUI = { offGuard, masterOff };

  /* While a power switch is OFF the simulation cannot be started (ON button, auto-run timer ...).
     Exception: an output that is ALREADY ON is refreshed after a switch click (CIRC.rerun), so it stays ON and shows the new circuit. */
  const runSimUI0 = window.runSimUI;
  if (typeof runSimUI0 === 'function') {
    window.runSimUI = function () {
      if (offGuard()) return;
      return runSimUI0.apply(this, arguments);
    };
  }
  /* the "Run" button of the NGSpice code tab keeps a copy of the original function: route it through the guard too */
  { const br = $id('bRun'); if (br) br.onclick = () => window.runSimUI(); }
  /* a real click on ON is never a refresh */
  { const rb = $id('bRunSim'); if (rb) rb.addEventListener('click', (e) => { if (window.CIRC && e.isTrusted) window.CIRC.rerun = false; userClick = !!e.isTrusted; setTimeout(() => { userClick = false; }, 400); }, true); }
  const runNow = () => {
    const b = $id('bRunSim'); if (!b) return;
    setTimeout(() => { if (window.CIRC) window.CIRC.rerun = true; try { b.click(); } finally { if (window.CIRC) window.CIRC.rerun = false; } }, 30);
  };

  /* ---------- unused switch / relay library lines are removed from the netlist ---------- */
  function prune(M) {
    const used = new Set(M.parts.filter((q) => SYMS[q.t] && SYMS[q.t].order).map((q) => String(q.v).trim().split(/\s+/)[0].toUpperCase()));
    M.dirs = M.dirs.filter((d) => { const m = /^\.subckt\s+(DPDT_[ABO]|RELAY2?_\d+V|XFMR_(?:CT_)?\d+TO\d+)\b/i.exec(d); return m ? used.has(m[1].toUpperCase()) : true; });
    M.dirs = M.dirs.filter((d) => { const m = /^\.model\s+RLY(\d+)_(NO|NC)\b/i.exec(d); if (!m) return true; return [...used].some((u) => new RegExp('^RELAY2?_' + m[1] + 'V$').test(u)); });
  }

  /* ---------- toggle ---------- */
  function setState(p, on, quiet) {
    if (p.t === 'SWM' && window.resetLatches) window.resetLatches();
    const was = outputOn();                       /* simulation output ON before this click? (an edit always resets it) */
    const h0 = S.hist.length;
    mutate(() => {
      if (p.t === 'DPDT') p.v = on === 'O' ? 'DPDT_O' : (on === true || on === 'B') ? 'DPDT_B' : 'DPDT_A';
      else p.v = (on ? '1m' : '1G') + (p.t === 'PBTN' && isLong(p) ? ' mode=long' : '');
      prune(S.M);
    });
    if (quiet) while (S.hist.length > h0) S.hist.pop();   /* push button presses are not undo steps */
    /* The switch changed the CIRCUIT (flow / lamps follow by themselves). The output keeps the state the user gave it:
       ON stays ON (refreshed for the new circuit), OFF stays OFF. */
    if (!masterOff()) clearOffText();
    if (was) runNow();
  }
  const toggle = (p) => setState(p, p.t === 'DPDT' ? (dpdtOff(p) ? 'A' : /_b\s*$/i.test(String(p.v)) ? 'O' : 'B') : !closed(p));   /* DPDT: A -> B -> OFF -> A */

  let down = null, held = null, holdT = null, latched = false, ignoreUp = false;
  const LONG_MS = 1500;   /* Long press: hold the button for 1.5 s and it stays pressed */
  const release = () => {
    const id = held; held = null; if (holdT) { clearTimeout(holdT); holdT = null; }
    if (id == null) return;
    if (latched) { latched = false; return; }                 /* it was held 1.5 s: stays pressed until the next push */
    const p = S.M.parts.find((q) => q.id === id); if (p && !closed(p)) return;
    if (p) setState(p, false, true);
  };
  $id('svg').addEventListener('pointerdown', (e) => {
    down = null;
    if (e.button !== 0 || e.shiftKey || e.altKey || S.tool !== 'select' || S.wire) return;
    const [wx, wy] = toWorld(e);
    if (pinAt(wx, wy, 7)) return;
    const p = partAt(wx, wy);
    if (p && p.t === 'PBTN') {
      if (isLong(p) && closed(p)) { setState(p, false, true); ignoreUp = true; return; }   /* Long press mode: pushing a latched button releases it */
      held = p.id; latched = false; if (!closed(p)) setState(p, true, true);                 /* closed while held (normal push) ... */
      if (isLong(p)) holdT = setTimeout(() => { holdT = null; latched = true; }, LONG_MS);   /* ... and still closed after 1.5 s = latched ON */
      return;
    }
    if (isSw(p)) down = { id: p.id, x: e.clientX, y: e.clientY };
  }, true);
  addEventListener('pointerup', (e) => {
    if (ignoreUp) { ignoreUp = false; return; }
    if (held != null) { release(); return; }
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const p = S.M.parts.find((q) => q.id === d.id);
    if (p) toggle(p);
  });
  addEventListener('pointercancel', release);
  addEventListener('blur', release);

  /* ---------- inspector additions ---------- */
  const baseInspect = window.inspect;
  window.inspect = function () {
    baseInspect.apply(this, arguments);
    try {
      const ids = [...S.sel]; if (ids.length !== 1 || S.selW) return;
      const p = S.M.parts.find((q) => q.id === ids[0]); if (!p) return;
      const P = $id('pProp'), head = P.querySelector('.ph'); let h = '';
      if (p.t === 'PBTN') {
        const lg = isLong(p), on = closed(p);
        h = `<div class="field">Push button type</div><div class="row"><button id="pbNormal" style="${lg ? '' : 'background:#1f8fe0;color:#fff'}">Normal push</button><button id="pbLong" style="${lg ? 'background:#1f8fe0;color:#fff' : ''}">Long press (1.5 s)</button></div>
          <p class="hint">${lg ? 'Long press: a short push works like a normal push. Hold it for 1.5 s and it stays pressed (ON); push it again to release it.' : 'Normal push: closed only while you hold it down on the canvas, opens when you let go.'} It must be wired into the circuit; a loose button stops the circuit.${lg ? ' Now: <b>' + (on ? 'PRESSED' : 'released') + '</b>.' : ''}</p>`;
      } else if (p.t === 'SW' || p.t === 'SWM') {
        const on = closed(p);
        h = `<div class="field">Switch position</div><div class="row"><button id="swOn" style="${on ? 'background:#1a9d55;color:#fff' : ''}">● ON (closed)</button><button id="swOff" style="${on ? '' : 'background:#d64545;color:#fff'}">OFF (open)</button></div>
          <p class="hint">${p.t === 'SWM' ? 'Power switch: OFF cuts the circuit (no electron flow, lamps dark). The ON / OFF buttons of the simulation control the output.' : 'Click the switch on the canvas to toggle it. OFF cuts the circuit: no electron flow, no simulation.'}</p>`;
      } else if (p.t === 'DPDT') {
        const o = dpdtOff(p), b = !o && /_b\s*$/i.test(String(p.v)), a = !o && !b;
        h = `<div class="field">Switch position</div><div class="row"><button id="swA" style="${a ? 'background:#1f8fe0;color:#fff' : ''}">A (up)</button><button id="swB" style="${b ? 'background:#d6791a;color:#fff' : ''}">B (down)</button><button id="swO" style="${o ? 'background:#d64545;color:#fff' : ''}">OFF (open)</button></div>
          <p class="hint">Click the switch on the canvas to cycle A, B, OFF. OFF cuts the circuit: no electron flow, no simulation.</p>`;
      } else if (p.t === 'RLY' || p.t === 'RLY2') {
        const cur = (/(\d+)V$/i.exec(String(p.v)) || [])[1] || '12';
        h = `<div class="field">Coil voltage<select id="rlyV">${[5, 6, 9, 12, 24].map((v) => `<option value="${v}" ${String(v) === cur ? 'selected' : ''}>${v} V (coil ${RLY_V[v][0]} Ω)</option>`).join('')}</select></div>
          <p class="hint">Pulls in at 75 % of the rated voltage, drops out at 25 %. Plot <b>i(${esc(p.n)}.RCOIL)</b> for the coil current.</p>`;
      }
      else if (p.t === 'XFMR' || p.t === 'XFMRC') {
        const ct = p.t === 'XFMRC', L = (ct ? XF_CT : XF_RATIOS), cur = String(p.v).toUpperCase();
        h = `<div class="field">Turns ratio (primary : secondary)<select id="xfR">${L.map(([a, b]) => { const n = 'XFMR_' + (ct ? 'CT_' : '') + a + 'TO' + b; return `<option value="${n}" ${n === cur ? 'selected' : ''}>${a} : ${b}${ct ? ' (centre-tapped)' : ''}</option>`; }).join('')}</select></div>
          <p class="hint">Two coupled inductors (k = 0.995) with winding resistance. Dots: P1 and S1 are in phase.</p>`;
      }
      if (h && head) head.insertAdjacentHTML('afterend', h);
    } catch (e) { /* inspector extras are optional */ }
  };
  $id('pProp').addEventListener('click', (e) => {
    const id = e.target.id, p = S.M.parts.find((q) => S.sel.has(q.id)); if (!p) return;
    if ((id === 'pbNormal' || id === 'pbLong') && p.t === 'PBTN') {
      const lg = id === 'pbLong'; if (lg === isLong(p)) return;
      mutate(() => { p.v = '1G' + (lg ? ' mode=long' : ''); }); if (window.resetLatches) window.resetLatches(); return;
    }
    if (id === 'swOn') setState(p, true); else if (id === 'swOff') setState(p, false);
    else if (id === 'swA') setState(p, 'A'); else if (id === 'swB') setState(p, 'B'); else if (id === 'swO') setState(p, 'O');
  });
  $id('pProp').addEventListener('change', (e) => {
    if (e.target.id === 'xfR') {
      const q = S.M.parts.find((z) => S.sel.has(z.id)); if (!q) return;
      const w = outputOn();
      mutate(() => { q.v = e.target.value; prune(S.M); });
      if (w && !masterOff()) runNow();
      return;
    }
    if (e.target.id !== 'rlyV') return;
    const p = S.M.parts.find((q) => S.sel.has(q.id)); if (!p) return;
    const was = outputOn();
    mutate(() => { p.v = (p.t === 'RLY2' ? 'RELAY2_' : 'RELAY_') + e.target.value + 'V'; prune(S.M); });
    if (was && !masterOff()) runNow();
  });

  /* ---------- relay armature animation ---------- */
  const ease = {};
  let cacheR = null, map = null, last = 0;
  let RS = null;
  const swIdx = (n) => { if (cacheR !== RS) { cacheR = RS; map = new Map(); if (RS && RS.C && RS.C.sws) RS.C.sws.forEach((d, i) => map.set(String(d.nm).toLowerCase(), i)); } return map.get(n.toLowerCase()); };
  function snap() {
    const sel = window.FXSEL || { k: 'op', i: -1 };
    if (sel.k === 'tran' && RS.tran && RS.tran.SW && RS.tran.SW[sel.i]) return RS.tran.SW[sel.i];
    if (sel.k === 'dc' && RS.dc && RS.dc.SW && RS.dc.SW[sel.i]) return RS.dc.SW[sel.i];
    return RS.op.SW;
  }
  window.RLYX = { t: (p) => ease[p.id] || 0 };
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    try {
      RS = CRs();
      const on = !!RS, sn = on ? snap() : null;
      S.M.parts.forEach((p) => {
        if (p.t !== 'RLY' && p.t !== 'RLY2') return;
        let tg = 0;
        if (sn) { const s = p.t === 'RLY2' ? '1' : '', a = swIdx(p.n + '.snop' + s), b = swIdx(p.n + '.snon' + s); tg = ((a != null && sn[a]) || (b != null && sn[b])) ? 1 : 0; }
        const c = ease[p.id] || 0; ease[p.id] = c + (tg - c) * (1 - Math.exp(-dt / 0.03));
        if (Math.abs(ease[p.id] - tg) < 0.01) ease[p.id] = tg;
      });
      document.querySelectorAll('#scene [data-rly]').forEach((el) => {
        const t = ease[el.dataset.rly] || 0;
        switch (el.dataset.rrole) {
          case 'arm': el.setAttribute('transform', 'rotate(' + (+el.dataset.rot * t).toFixed(1) + ' ' + el.dataset.px + ' ' + el.dataset.py + ')'); break;
          case 'coil': el.setAttribute('opacity', (t * 0.55).toFixed(2)); break;
          case 'ind': el.setAttribute('fill', t > 0.5 ? '#46ff7a' : '#1d3b27'); break;
        }
      });
    } catch (e) { /* animation only */ }
  }
  requestAnimationFrame(loop);

  /* ---------- Realistic view drawings ---------- */
  if (window.RC) {
    const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const lead = (d) => `<path d="${d}" fill="none" stroke="#7d848e" stroke-width="3.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#dfe4ea" stroke-width="1.4" stroke-linecap="round"/>`;
    const T = (x, y, s, sz, c, a) => `<text x="${x}" y="${y}" text-anchor="${a || 'middle'}" font-size="${sz}" font-weight="700" fill="${c}" stroke="none" font-family="ui-monospace,Menlo,Consolas,monospace">${X(s)}</text>`;
    const lug = (x, y) => `<circle cx="${x}" cy="${y}" r="3.3" fill="#d9a441" stroke="#6a4d10" stroke-width=".9"/>`;
    const rv = (p) => { const m = /(\d+)V$/i.exec(String(p.v)); return m ? m[1] : '12'; };
    /* laminated iron core with two copper windings */
    const xf = (p, ct) => {
      const h = ct ? 34 : 26, y1 = ct ? -30 : -20, y2 = -y1, cu = (x, n) => Array.from({ length: n }, (_, i) => { const y = -h + 6 + i * ((2 * h - 12) / (n - 1)); return `<ellipse cx="${x}" cy="${y.toFixed(1)}" rx="7" ry="2.6" fill="none" stroke="#8a4a14" stroke-width="3"/><ellipse cx="${x}" cy="${y.toFixed(1)}" rx="7" ry="2.6" fill="none" stroke="#e29a49" stroke-width="1.8"/>`; }).join('');
      return lead(`M-40 ${y1}H-18M-40 ${y2}H-18M40 ${y1}H18M40 ${y2}H18` + (ct ? 'M40 0H18' : '')) +
        `<rect x="-26" y="${-h - 4}" width="52" height="${2 * h + 8}" rx="2" fill="#9aa3ad" stroke="#3b4048" stroke-width="1.2"/><rect x="-5" y="${-h - 4}" width="10" height="${2 * h + 8}" fill="#6b727b"/>` +
        cu(-15, ct ? 9 : 7) + cu(15, ct ? 9 : 7) + T(0, h + 12, String(p.v).replace(/^XFMR_/, '').replace('TO', ':'), 5.5, '#2a2f36') + T(-20, -h - 7, '•', 8, '#d64545') + T(20, -h - 7, '•', 8, '#d64545');
    };
    const D = {
      SW(p) {
        const on = closed(p);
        return lead('M-30 0H-16M16 0H30') + '<rect x="-16" y="-10" width="32" height="20" rx="4" fill="#2d333b" stroke="#050607" stroke-width="1.2"/><rect x="-12" y="-6" width="24" height="12" rx="3" fill="#1b1f24"/>' +
          `<path d="M0 3L${on ? 7 : -7} -16" stroke="#c9ced6" stroke-width="4.6" stroke-linecap="round"/><path d="M0 3L${on ? 7 : -7} -16" stroke="#8d95a0" stroke-width="1.4" stroke-linecap="round"/><circle cx="${on ? 7 : -7}" cy="-16" r="3.6" fill="${on ? '#1a9d55' : '#d64545'}" stroke="#222" stroke-width=".8"/>` +
          lug(-16, 0) + lug(16, 0) + T(0, 8.3, on ? 'ON' : 'OFF', 5.2, on ? '#7dffb0' : '#ff9a9a');
      },
      PBTN(p) {
        const on = closed(p), cy = on ? -2 : -9;
        return lead('M-30 0H-16M16 0H30') + '<rect x="-16" y="-8" width="32" height="16" rx="3" fill="#2d333b" stroke="#050607" stroke-width="1.2"/>' +
          `<rect x="-5" y="${cy - 3}" width="10" height="${-1 - cy + 4}" fill="#8d95a0" stroke="#222" stroke-width=".6"/><ellipse cx="0" cy="${cy - 4}" rx="9" ry="4.6" fill="${on ? '#a02222' : '#e04848'}" stroke="#300" stroke-width="1"/><ellipse cx="-2.4" cy="${cy - 5.4}" rx="4" ry="1.6" fill="rgba(255,255,255,.38)"/>` +
          lug(-16, 0) + lug(16, 0) + T(0, 6, on ? 'PRESSED' : isLong(p) ? 'LONG' : 'PUSH', 4.2, '#cfe0ff');
      },
      SWM(p) {
        const on = closed(p);
        return lead('M-30 0H-17M17 0H30') + `<rect x="-17" y="-13" width="34" height="26" rx="3.5" fill="#23262b" stroke="#050607" stroke-width="1.2"/><rect x="-12" y="-9" width="24" height="18" rx="2.5" fill="${on ? '#2fbf6b' : '#c0392b'}" stroke="#000" stroke-width=".8"/>` +
          `<path d="M-12 ${on ? -9 : 9}L12 ${on ? -3 : 3}V${on ? 9 : -9}H-12Z" fill="rgba(0,0,0,.18)"/>` + T(0, 3, on ? 'I' : 'O', 9, '#fff') + lug(-17, 0) + lug(17, 0);
      },
      DPDT(p) {
        const o = dpdtOff(p), b = !o && /_b\s*$/i.test(String(p.v)), ly = o ? 0 : b ? 24 : -24;
        return lead('M-40-20H-26M-40 20H-26M40-30H26M40-10H26M40 10H26M40 30H26') +
          '<rect x="-26" y="-36" width="52" height="72" rx="5" fill="#9aa3ad" stroke="#3b4048" stroke-width="1.2"/><rect x="-22" y="-32" width="44" height="64" rx="3" fill="#b8c0c9"/>' +
          '<circle cx="0" cy="0" r="9" fill="#6b727b" stroke="#2a2f36" stroke-width="1"/>' + `<path d="M0 0L0 ${ly}" stroke="#d0d5dc" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="${ly}" r="5" fill="${b ? '#d6791a' : '#1f8fe0'}" stroke="#222" stroke-width="1"/>` +
          [-20, 20].map((y) => lug(-26, y)).join('') + [-30, -10, 10, 30].map((y) => lug(26, y)).join('') + T(-12, -26, 'DPDT', 5.5, '#2a2f36') + T(0, 33, o ? 'OFF' : b ? 'B' : 'A', 6, '#2a2f36');
      },
      SVC() {
        return lead('M0-30V-14M0 14V30M-30-10H-14M-30 10H-14') + '<rect x="-16" y="-16" width="32" height="32" rx="3" fill="#2a3a5a" stroke="#0a1020" stroke-width="1.2"/>' + T(0, -3, 'SW', 8, '#cfe0ff') + T(0, 8, 'V-ctrl', 4.6, '#9fb6e0');
      },
      XFMR(p) { return xf(p, false); },
      XFMRC(p) { return xf(p, true); },
      RLY(p) {
        const v = rv(p), id = p.id ? ` data-rly="${p.id}" data-rrole="ind"` : '';
        return lead('M-40-30H-30M-40 30H-30M40-30H30M40 0H30M40 30H30') + '<rect x="-30" y="-38" width="60" height="76" rx="3" fill="#2f6db5" stroke="#0b2a4d" stroke-width="1.4"/><rect x="-30" y="-38" width="60" height="76" rx="3" fill="url(#rc-gloss)"/>' +
          T(0, -24, 'SRD-' + v + 'VDC', 6.2, '#fff') + T(0, -16, 'SL-C', 6, '#dce9f9') + T(0, 4, '10A 250VAC', 5.2, '#dce9f9') + T(0, 12, '10A 30VDC', 5.2, '#dce9f9') + T(0, 26, p.n || 'K1', 6.5, '#fff') +
          `<circle${id} cx="-22" cy="-30" r="2.6" fill="#1d3b27" stroke="#000" stroke-width=".6"/>` + T(-24, -22, 'COIL', 4.4, '#cfe0f5', 'start') + T(26, -33, 'NC', 4.4, '#cfe0f5', 'end') + T(26, -3, 'COM', 4.4, '#cfe0f5', 'end') + T(26, 36, 'NO', 4.4, '#cfe0f5', 'end');
      },
      RLY2(p) {
        const v = rv(p), id = p.id ? ` data-rly="${p.id}" data-rrole="ind"` : '';
        return lead('M-40-30H-30M-40 30H-30M40-70H30M40-40H30M40-10H30M40 10H30M40 40H30M40 70H30') + '<rect x="-30" y="-80" width="60" height="160" rx="3" fill="#2a2d33" stroke="#050607" stroke-width="1.4"/><rect x="-30" y="-80" width="60" height="160" rx="3" fill="url(#rc-gloss)"/>' +
          '<rect x="-22" y="-14" width="44" height="28" rx="2" fill="#d9822b"/>' + T(0, -2, 'DPDT ' + v + 'VDC', 5.2, '#2a1500') + T(0, 8, p.n || 'K1', 6, '#2a1500') +
          `<circle${id} cx="-22" cy="-70" r="2.8" fill="#1d3b27" stroke="#000" stroke-width=".6"/>` + T(-24, -60, 'COIL', 4.4, '#cfd4dc', 'start');
      }
    };
    const has0 = RC.has, draw0 = RC.draw;
    RC.has = (k) => !!D[k] || has0(k);
    RC.draw = (p) => (D[p.t] ? D[p.t](p) : draw0(p));
  }
})();
