/* switch-ui.js — Switches & relays: behaviour on the canvas.  Load AFTER ngspice.js, electronflow.js and live-effects.js.

   * click a Switch / Power switch / DPDT switch on the canvas to toggle it (drag still moves it)
   * Power switch (RSWM) OFF  -> every simulation is switched off (graphs empty, lamps / LEDs / fan dark, electron flow off)
     Power switch (RSWM) ON   -> the simulation runs
   * other switches / relay inputs re-run the simulation at once when it was running, so you see the effect live
   * relay armature moves with the contact state of the solver frame on screen
   * "Realistic" drawings for the new parts                                                                       */
(function () {
  'use strict';
  const $id = (i) => document.getElementById(i);
  const closed = (p) => !(num(p && p.v) > 1);
  const isSw = (p) => p && (p.t === 'SW' || p.t === 'SWM' || p.t === 'DPDT');
  const live = () => typeof SIMLIVE !== 'undefined' && SIMLIVE && RES && RES.op && RES.C && !(RES.errs && RES.errs.length);
  const masterOff = () => S.M.parts.some((p) => p.t === 'SWM' && !closed(p));
  const MSG = 'Power switch is OFF - Simulation stopped. Turn the switch ON to run the simulation.';

  /* ---------- solver switch states of the frame on screen ---------- */
  window.SWSTATE = {
    apply(kind, idx) {
      if (!RES || !RES.C || !RES.C.sws || !RES.C.sws.length) return;
      let a = null;
      if (kind === 'tran' && RES.tran && RES.tran.SW) a = RES.tran.SW[idx];
      else if (kind === 'dc' && idx >= 0 && RES.dc && RES.dc.SW) a = RES.dc.SW[idx];
      if (!a && RES.op) a = RES.op.SW;
      if (a) RES.C.sws.forEach((d, i) => { d.on = !!a[i]; });
    }
  };

  /* ---------- power switch gate ---------- */
  function offGuard() {
    if (!masterOff()) return false;
    try { if (window.fullStopSim) window.fullStopSim(); } catch (e) { /* ignore */ }
    try { RES = null; SIMLIVE = false; } catch (e) { /* ignore */ }
    try { const st = $id('simst'); if (st) st.innerHTML = '<span class="wn">' + MSG + '</span>'; const o = $id('out'); if (o) o.innerHTML = '<p class="empty">' + MSG + '</p>'; toast(MSG, 'info'); } catch (e) { /* ignore */ }
    return true;
  }
  window.SWUI = { offGuard, masterOff };
  const runNow = () => { const b = $id('bRunSim'); if (b) setTimeout(() => b.click(), 30); };

  /* ---------- unused switch / relay library lines are removed from the netlist ---------- */
  function prune(M) {
    const used = new Set(M.parts.filter((q) => SYMS[q.t] && SYMS[q.t].order).map((q) => String(q.v).trim().split(/\s+/)[0].toUpperCase()));
    M.dirs = M.dirs.filter((d) => { const m = /^\.subckt\s+(DPDT_[AB]|RELAY2?_\d+V|XFMR_(?:CT_)?\d+TO\d+)\b/i.exec(d); return m ? used.has(m[1].toUpperCase()) : true; });
    M.dirs = M.dirs.filter((d) => { const m = /^\.model\s+RLY(\d+)_(NO|NC)\b/i.exec(d); if (!m) return true; return [...used].some((u) => new RegExp('^RELAY2?_' + m[1] + 'V$').test(u)); });
  }

  /* ---------- toggle ---------- */
  function setState(p, on) {
    const was = (typeof SIMLIVE !== 'undefined' && SIMLIVE) || (typeof ANIM !== 'undefined' && ANIM.on);
    mutate(() => {
      if (p.t === 'DPDT') p.v = on ? 'DPDT_B' : 'DPDT_A';
      else p.v = on ? '1m' : '1G';
      prune(S.M);
    });
    if (p.t === 'SWM') { if (closed(p)) runNow(); else offGuard(); }
    else if (was && !masterOff()) runNow();
  }
  const toggle = (p) => setState(p, p.t === 'DPDT' ? !/_b\s*$/i.test(String(p.v)) : !closed(p));

  let down = null;
  $id('svg').addEventListener('pointerdown', (e) => {
    down = null;
    if (e.button !== 0 || e.shiftKey || e.altKey || S.tool !== 'select' || S.wire) return;
    const [wx, wy] = toWorld(e);
    if (pinAt(wx, wy, 7)) return;
    const p = partAt(wx, wy);
    if (isSw(p)) down = { id: p.id, x: e.clientX, y: e.clientY };
  }, true);
  addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const p = S.M.parts.find((q) => q.id === d.id);
    if (p) toggle(p);
  });

  /* ---------- inspector additions ---------- */
  const baseInspect = window.inspect;
  window.inspect = function () {
    baseInspect.apply(this, arguments);
    try {
      const ids = [...S.sel]; if (ids.length !== 1 || S.selW) return;
      const p = S.M.parts.find((q) => q.id === ids[0]); if (!p) return;
      const P = $id('pProp'), head = P.querySelector('.ph'); let h = '';
      if (p.t === 'SW' || p.t === 'SWM') {
        const on = closed(p);
        h = `<div class="field">Switch position</div><div class="row"><button id="swOn" style="${on ? 'background:#1a9d55;color:#fff' : ''}">● ON (closed)</button><button id="swOff" style="${on ? '' : 'background:#d64545;color:#fff'}">○ OFF (open)</button></div>
          <p class="hint">${p.t === 'SWM' ? 'Power switch: OFF stops the whole simulation, ON runs it.' : 'Click the switch on the canvas to toggle it.'}</p>`;
      } else if (p.t === 'DPDT') {
        const b = /_b\s*$/i.test(String(p.v));
        h = `<div class="field">Switch position</div><div class="row"><button id="swA" style="${b ? '' : 'background:#1f8fe0;color:#fff'}">A (up)</button><button id="swB" style="${b ? 'background:#d6791a;color:#fff' : ''}">B (down)</button></div>
          <p class="hint">Click the switch on the canvas to flip both poles together.</p>`;
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
    if (id === 'swOn') setState(p, true); else if (id === 'swOff') setState(p, false);
    else if (id === 'swA') setState(p, false); else if (id === 'swB') setState(p, true);
  });
  $id('pProp').addEventListener('change', (e) => {
    if (e.target.id === 'xfR') {
      const q = S.M.parts.find((z) => S.sel.has(z.id)); if (!q) return;
      const w = typeof SIMLIVE !== 'undefined' && SIMLIVE;
      mutate(() => { q.v = e.target.value; prune(S.M); });
      if (w && !masterOff()) runNow();
      return;
    }
    if (e.target.id !== 'rlyV') return;
    const p = S.M.parts.find((q) => S.sel.has(q.id)); if (!p) return;
    const was = (typeof SIMLIVE !== 'undefined' && SIMLIVE);
    mutate(() => { p.v = (p.t === 'RLY2' ? 'RELAY2_' : 'RELAY_') + e.target.value + 'V'; prune(S.M); });
    if (was && !masterOff()) runNow();
  });

  /* ---------- relay armature animation ---------- */
  const ease = {};
  let cacheR = null, map = null, last = 0;
  const swIdx = (n) => { if (cacheR !== RES) { cacheR = RES; map = new Map(); if (RES && RES.C && RES.C.sws) RES.C.sws.forEach((d, i) => map.set(String(d.nm).toLowerCase(), i)); } return map.get(n.toLowerCase()); };
  function snap() {
    const sel = window.FXSEL || { k: 'op', i: -1 };
    if (sel.k === 'tran' && RES.tran && RES.tran.SW && RES.tran.SW[sel.i]) return RES.tran.SW[sel.i];
    if (sel.k === 'dc' && RES.dc && RES.dc.SW && RES.dc.SW[sel.i]) return RES.dc.SW[sel.i];
    return RES.op.SW;
  }
  window.RLYX = { t: (p) => ease[p.id] || 0 };
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    try {
      const on = live(), sn = on ? snap() : null;
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
      SWM(p) {
        const on = closed(p);
        return lead('M-30 0H-17M17 0H30') + `<rect x="-17" y="-13" width="34" height="26" rx="3.5" fill="#23262b" stroke="#050607" stroke-width="1.2"/><rect x="-12" y="-9" width="24" height="18" rx="2.5" fill="${on ? '#2fbf6b' : '#c0392b'}" stroke="#000" stroke-width=".8"/>` +
          `<path d="M-12 ${on ? -9 : 9}L12 ${on ? -3 : 3}V${on ? 9 : -9}H-12Z" fill="rgba(0,0,0,.18)"/>` + T(0, 3, on ? 'I' : 'O', 9, '#fff') + lug(-17, 0) + lug(17, 0);
      },
      DPDT(p) {
        const b = /_b\s*$/i.test(String(p.v));
        return lead('M-40-20H-26M-40 20H-26M40-30H26M40-10H26M40 10H26M40 30H26') +
          '<rect x="-26" y="-36" width="52" height="72" rx="5" fill="#9aa3ad" stroke="#3b4048" stroke-width="1.2"/><rect x="-22" y="-32" width="44" height="64" rx="3" fill="#b8c0c9"/>' +
          '<circle cx="0" cy="0" r="9" fill="#6b727b" stroke="#2a2f36" stroke-width="1"/>' + `<path d="M0 0L${b ? 0 : 0} ${b ? 24 : -24}" stroke="#d0d5dc" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="${b ? 24 : -24}" r="5" fill="${b ? '#d6791a' : '#1f8fe0'}" stroke="#222" stroke-width="1"/>` +
          [-20, 20].map((y) => lug(-26, y)).join('') + [-30, -10, 10, 30].map((y) => lug(26, y)).join('') + T(-12, -26, 'DPDT', 5.5, '#2a2f36') + T(0, 33, b ? 'B' : 'A', 6, '#2a2f36');
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
