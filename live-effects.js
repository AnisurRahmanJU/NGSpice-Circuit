/* live-effects.js — makes Bulb, LED, Fan and the Ammeter / Voltmeter come alive while a simulation runs.
   Load AFTER ngspice.js.  Everything is OFF (no light, no wind, blank meter) until Run is pressed, and OFF again after Stop or any edit.
   Bulb / Fan strength = voltage across the part relative to the largest source voltage in the circuit.
   LED brightness = LED current (about 10 mA = full).  Meters read the solver result of the frame that is on screen. */
(function () {
  'use strict';
  const KIND = { BULB: 'b', FAN: 'f', LED: 'l', AM: 'a', VM: 'v' }, vals = new Map();
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
  window.FX = { get: (p) => { const v = vals.get(p.id); return v ? { l: v.l, a: v.a, s: Math.abs(v.s), sd: v.s, t: v.t, w: v.w } : { l: 0, a: 0, s: 0, sd: 0, t: '', w: 0 }; } };
  let last = 0, rvR = null, rv = 12, dvR = null, dv = null;
  const live = () => typeof SIMLIVE !== 'undefined' && SIMLIVE && RES && RES.op && RES.C && !(RES.errs && RES.errs.length);
  /* A circuit driven only by plain DC sources (no SIN/PULSE/PWL/AC source) and with no C / L / 555 is in steady state:
     the Run animation loops .tran / .dc frames from the start (t = 0, or the swept source going 0 -> max), which made a
     DC-powered Bulb / LED / Fan / meter fade in and out. For such circuits we always use the steady DC operating point. */
  let sdR = null, sd = false;
  function steady() {
    if (sdR !== RES) {
      sdR = RES; sd = false;
      try {
        sd = !RES.C.devs.some((d) => {
          if (d.t === 'C' || d.t === 'L') return true;
          if ((d.t === 'V' || d.t === 'I') && d.s && (d.s.w || d.s.acm)) return true;
          return false;
        }) && !(RES.C.t555 && RES.C.t555.length);
      } catch (e) { sd = false; }   /* any surprise -> old behaviour, never switch the lights off */
    }
    return sd;
  }
  /* true when any V / I source is AC / SIN / PULSE / PWL. Such a source reverses polarity by itself every cycle, so an LED
     in that circuit is SUPPOSED to be forward-biased (ON) and reverse-biased (OFF) in turn: it blinks, and the
     "reverse-biased / Flip" warning must never be shown for it (it used to flicker on and off with every half-cycle). */
  let acR = null, acV = false;
  function acDriven() {
    if (acR !== RES) {
      acR = RES; acV = false;
      try { acV = RES.C.devs.some((d) => (d.t === 'V' || d.t === 'I') && d.s && (d.s.w || d.s.acm)); } catch (e) { acV = false; }
    }
    return acV;
  }
  /* AC / SIN / PULSE / PWL driven circuit: the lamps must blink even when the netlist has no .tran
     (only .op / .dc / .ac) or the Run animation is on another tab. Use the .tran result when there is one,
     otherwise run a small hidden .tran (about 4 periods of the source) and loop it on our own 8 s clock. */
  let tvR = null, tvF = null;
  function frames() {
    if (tvR !== RES) {
      tvR = RES; tvF = null;
      try {
        let f = 0, tv = false;
        RES.C.devs.forEach((d) => {
          if ((d.t !== 'V' && d.t !== 'I') || !d.s || !(d.s.w || d.s.acm)) return;
          tv = true; const w = d.s.w;
          if (w && /^(sin|tri|saw)$/.test(w.t) && w.a[2] > 0) f = f ? Math.min(f, w.a[2]) : w.a[2];
          else if (w && w.t === 'pulse' && w.a[6] > 0) f = f ? Math.min(f, 1 / w.a[6]) : 1 / w.a[6];
        });
        if (tv) {
          if (RES.tran && RES.tran.X && RES.tran.X.length > 1) tvF = RES.tran.X;
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
    if (steady() && RES.op.x) return RES.op.x;
    const fr = frames();
    if (fr) {
      if (ANIM.on && ANIM.k === 'tran' && RES.tran && fr === RES.tran.X && ANIM.idx != null && fr[ANIM.idx]) return fr[ANIM.idx];
      return fr[Math.min(fr.length - 1, Math.floor(((performance.now() % 8000) / 8000) * fr.length))];
    }
    if (ANIM.on && ANIM.idx != null) {
      if (ANIM.k === 'tran' && RES.tran && RES.tran.X[ANIM.idx]) return RES.tran.X[ANIM.idx];
      if (ANIM.k === 'dc' && RES.dc && RES.dc.X[ANIM.idx]) return RES.dc.X[ANIM.idx];
    }
    return RES.op.x;
  }
  function rated() {
    if (rvR !== RES) {
      rvR = RES; let m = 0;
      RES.C.devs.forEach((d) => {
        if (d.t !== 'V' || !d.s) return;
        let k = Math.abs(d.s.dc || 0); const w = d.s.w, a = w ? w.a.map((x) => Math.abs(x) || 0) : [];
        if (w) k = w.t === 'pwl' ? Math.max(0, ...a.filter((_, i) => i % 2)) : w.t === 'pulse' ? Math.max(a[0] || 0, a[1] || 0) : (a[0] || 0) + (a[1] || 0) * (w.t === 'noise' ? 3 : 1);
        m = Math.max(m, k);
      });
      if (RES.dc && !RES.dc.cur) RES.dc.xs.forEach((v) => { m = Math.max(m, Math.abs(v)); });
      rv = m > 0.01 ? m : 12;
    }
    return rv;
  }
  function dev(n) {
    if (dvR !== RES) { dvR = RES; dv = new Map(); RES.C.devs.forEach((d) => dv.set(String(d.nm).toLowerCase(), d)); }
    return dv.get(String(n).toLowerCase());
  }
  function target(p, x, R) {
    const d = dev(p.n), k = KIND[p.t]; if (!d) return null;
    const V = (i) => (i < 0 ? 0 : x[i]);
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
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    let parts; try { parts = S.M.parts; } catch (e) { return; }
    const on = live(), x = on ? cur() : null, R = on ? rated() : 12;
    const ease = (c, g, tr, tf) => c + (g - c) * (1 - Math.exp(-dt / (g > c ? tr : tf)));
    parts.forEach((p) => {
      const k = KIND[p.t]; if (!k) return;
      let v = vals.get(p.id); if (!v) { v = { l: 0, a: 0, s: 0, t: '', w: 0 }; vals.set(p.id, v); }
      const t = on ? target(p, x, R) : null, ok = t != null && isFinite(t);
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
        case 'pwr': el.setAttribute('fill', v.t ? '#46ff7a' : '#1b3a25'); break;
      }
    });
  }
  requestAnimationFrame(frame);
})();
