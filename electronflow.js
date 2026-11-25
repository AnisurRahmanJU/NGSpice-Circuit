/* electronflow.js — animated electron flow in the wires of the schematic.
 *
 * Load AFTER ngspice.js:   <script src="electronflow.js"></script>
 *
 * How it works
 *  1. For every part, the current entering each pin is taken from the solver
 *     results of the CIRCUIT (window.CR(): independent of the Run / Stop buttons): operating point, DC sweep step, AC (instantaneous) or
 *     transient time step - whichever the simulation animation is showing.
 *  2. Per net, the wire segments are treated as a graph; KCL is solved on a
 *     spanning tree, so every wire segment gets a signed current.
 *  3. Small electron dots drift along each segment. Electrons move AGAINST
 *     conventional current. Speed grows gently with current and is capped
 *     low, so the motion is calm and easy to follow.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Tunable settings (calm by default)
   * ------------------------------------------------------------------ */
  var CFG = {
    minSpeed: 10,      // px/s for the weakest visible current
    maxSpeed: 48,      // px/s for the strongest current  (keep it low!)
    spacing: 14,       // px between electrons along a wire
    radius: 2.5,       // electron dot radius
    threshold: 1e-6,   // only truly (almost) zero current hides the electrons: every wire that carries current shows flow
    multipliers: { slow: 0.5, normal: 1, fast: 1.8 }
  };

  var NS = "http://www.w3.org/2000/svg";
  var enabled = true;
  var speedMode = "normal";
  var layer = null;          // <g id="eflow">
  var geom = null;           // cached wire geometry
  var geomSig = "";
  var flowCache = { key: "", map: null };
  var dots = [];             // per-edge dot state
  var lastT = 0;
  var dirty = true;
  var RS = null;             // solver result of the circuit (window.CR()), refreshed every frame
  var wasOff = false;

  /* ------------------------------------------------------------------ *
   * Small helpers (all guarded: this file must never break the app)
   * ------------------------------------------------------------------ */
  function ok() {
    return typeof S !== "undefined" && RS && RS.op && RS.C &&
      typeof extract === "function" && typeof partPins === "function";
  }
  var key = function (x, y) { return x + "," + y; };

  function modelSig() {
    try {
      return JSON.stringify([
        S.M.parts.map(function (p) { return [p.id, p.t, p.n, p.x, p.y, p.r, p.m]; }),
        S.M.wires.map(function (w) { return w.pts; })
      ]);
    } catch (e) { return ""; }
  }

  /* ------------------------------------------------------------------ *
   * 1. Geometry: split wires into unit edges and group them per net
   * ------------------------------------------------------------------ */
  function buildGeometry() {
    var M = S.M, X = extract(M);
    var pts = new Map();                       // key -> {x,y}
    var addPt = function (x, y) { var k = key(x, y); if (!pts.has(k)) pts.set(k, { x: x, y: y, k: k }); return k; };

    var pinInfo = [];                          // {part, pin, k, net}
    M.parts.forEach(function (p) {
      partPins(p).forEach(function (q) {
        var k = addPt(q.x, q.y);
        pinInfo.push({ part: p, pin: q.name, k: k, net: X.pin[p.id + "." + q.name] });
      });
    });
    M.wires.forEach(function (w) { w.pts.forEach(function (q) { addPt(q[0], q[1]); }); });

    /* split every axis-aligned segment at any point lying on it */
    var edges = [], seen = new Set();
    X.segs.forEach(function (s) {
      var x1 = s.a[0], y1 = s.a[1], x2 = s.b[0], y2 = s.b[1];
      if (x1 !== x2 && y1 !== y2) return;
      var on = [];
      pts.forEach(function (P) {
        if (x1 === x2 ? (P.x === x1 && P.y >= Math.min(y1, y2) && P.y <= Math.max(y1, y2))
                      : (P.y === y1 && P.x >= Math.min(x1, x2) && P.x <= Math.max(x1, x2))) on.push(P);
      });
      on.sort(function (p, q) { return x1 === x2 ? (p.y - q.y) * Math.sign(y2 - y1 || 1) : (p.x - q.x) * Math.sign(x2 - x1 || 1); });
      for (var i = 0; i + 1 < on.length; i++) {
        var a = on[i], b = on[i + 1], id = a.k < b.k ? a.k + "|" + b.k : b.k + "|" + a.k;
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ a: a.k, b: b.k, net: s.net, I: 0 });
      }
    });

    /* net of every point */
    var netOf = new Map();
    edges.forEach(function (e) { netOf.set(e.a, e.net); netOf.set(e.b, e.net); });
    pinInfo.forEach(function (pi) { if (pi.net != null) netOf.set(pi.k, pi.net); });

    /* virtual edges: ground symbols / net labels join distant points of one net */
    var virt = [], firstOfNet = new Map();
    pinInfo.forEach(function (pi) {
      if (pi.part.t !== "GND" && pi.part.t !== "LBL") return;
      var n = pi.net;
      if (firstOfNet.has(n)) virt.push({ a: firstOfNet.get(n), b: pi.k, net: n, virtual: true });
      else firstOfNet.set(n, pi.k);
    });

    return { pts: pts, pinInfo: pinInfo, edges: edges, virt: virt, netOf: netOf, X: X };
  }

  /* ------------------------------------------------------------------ *
   * 2. Device currents (current flowing INTO each device pin, in amps)
   * ------------------------------------------------------------------ */
  function nodeIndex(C, net) {
    if (net == null) return undefined;
    if (net === "0") return -1;
    if (net in C.idx) return C.idx[net];
    var l = String(net).toLowerCase();
    return l in C.idx ? C.idx[l] : undefined;
  }

  /* leaving-current at every node touched by device d for solution vector x */
  function residual(d, x, ctx) {
    var C = RS.C, m = mk(C, false), out = {};
    var V = function (i) { return i < 0 ? 0 : x[i]; };
    try {
      /* remove stale nonlinear-limiting state so the stamp is exact */
      if (d.t === "D") d.v = V(d.a) - V(d.b);
      else if (d.t === "Q") { d.vbe = d.sg * (V(d.bb) - V(d.e)); d.vbc = d.sg * (V(d.bb) - V(d.c)); }

      if (d.t === "I") {                       // independent current source
        var v = srcv(d, ctx.mode, { sc: 1, t: ctx.t, g: ctx.g || {} });
        if (d.a >= 0) out[d.a] = (out[d.a] || 0) + v;
        if (d.b >= 0) out[d.b] = (out[d.b] || 0) - v;
        return out;
      }
      if (d.t === "C") {                       // capacitor: i = C dv/dt
        if (ctx.mode === "tran" && ctx.dvdt) {
          var ic = d.c * ctx.dvdt(d);
          if (d.a >= 0) out[d.a] = ic;
          if (d.b >= 0) out[d.b] = -ic;
        } else if (ctx.mode === "ac" && ctx.w) {
          /* AC: show the capacitor current as part of its in-phase swing */
          var ia = ctx.acI(d);
          if (d.a >= 0) out[d.a] = ia;
          if (d.b >= 0) out[d.b] = -ia;
        }
        return out;
      }
      stampDev(d, m, x, "dc", C, { g: {}, sc: 1 });
      var S2 = m.S;
      for (var i = 0; i < C.nn; i++) {
        var s = -m.b[i];
        for (var j = 0; j < S2; j++) s += m.A[i * S2 + j] * x[j];
        if (Math.abs(s) > 1e-30) out[i] = s;
      }
    } catch (e) { /* device not supported: leave empty */ }
    return out;
  }

  /* true when every V / I source is constant (no SIN / PULSE / PWL / TRI / SAW / NOISE, no AC magnitude) */
  function isDcCircuit() {
    if (RS._efDc !== undefined) return RS._efDc;
    var dc = true;
    RS.C.devs.forEach(function (d) {
      if ((d.t === "V" || d.t === "I") && d.s && (d.s.w || d.s.acm)) dc = false;
    });
    RS._efDc = dc; return dc;
  }

  /* transient frame (index >= 1) where the resistor / source currents are the largest */
  function holdFrame() {
    if (RS._efHold !== undefined) return RS._efHold;
    var X = RS.tran.X, best = 1, bm = -1;
    for (var i = 1; i < X.length; i++) {
      var x = X[i], m = 0, V = function (n) { return n < 0 ? 0 : x[n]; };
      RS.C.devs.forEach(function (d) {
        if (d.t === "R") m += Math.abs((V(d.a) - V(d.b)) * d.g);
        else if (d.t === "V" || d.t === "L") m += Math.abs(x[d.k]);
      });
      if (m > bm * 1.0000001) { bm = m; best = i; }
    }
    RS._efHold = best; return best;
  }

  /* x vector + context for the animation step currently on screen */
  function currentState() {
    /* The electron flow is INDEPENDENT of the simulation animation (start - end - start): it never follows the
       simulation position, it runs by itself non-stop until the Stop Flow button is pressed. */
    var C = RS.C, k = null, idx = null;

    /* The animation is stopped / finished: keep the electrons flowing non-stop (DC: held at the strongest current;
       AC / pulse: endless replay). Hold the transient frame with the strongest wire currents (a charged capacitor would
       otherwise leave the wires at 0 A). Only the Electrons button stops it. AC / pulse circuits are unchanged. */
    if (k === null && RS.tran && RS.tran.X.length > 1) {
      k = "tran";
      if (isDcCircuit()) idx = holdFrame();
      else {
        /* AC / pulse circuit, simulation stopped or ended: replay the transient in a endless loop for the
           electrons only (about 8 s per pass), so the flow never stops and restarts from the beginning */
        var nF = RS.tran.X.length, per = 8 / (CFG.multipliers[speedMode] || 1);
        idx = 1 + Math.min(nF - 2, Math.floor((((performance.now() / 1000) / per) % 1) * (nF - 1)));
      }
    } else if (k === null && RS.ac && RS.ac.re.length && !(RS.tran && RS.tran.X.length > 1)) { k = "ac"; idx = Math.floor(RS.ac.re.length / 2); }
    if (k === "dc" && RS.dc && RS.dc.X[idx]) {
      return { x: RS.dc.X[idx], mode: "dc", idx: idx, sw: { name: RS.dc.src, val: RS.dc.xs[idx] }, key: "dc" + idx };
    }
    if (k === "tran" && RS.tran && RS.tran.X[idx]) {
      var T = RS.tran.t, X = RS.tran.X;
      var p = Math.max(0, idx - 1), dt = (T[idx] - T[p]) || 1;
      var dirs = S.M.dirs.map(function (s) { return s.trim().split(/\s+/); });
      var tr = dirs.filter(function (t) { return t[0].toLowerCase() === ".tran"; })[0] || [];
      var g = { tstep: parseFloat(tr[1]) || 0, tstop: T[T.length - 1] };
      return {
        x: X[idx], mode: "tran", idx: idx, t: T[idx], g: g, key: "tr" + idx,
        dvdt: function (d) {
          var V = function (xx, i) { return i < 0 ? 0 : xx[i]; };
          return ((V(X[idx], d.a) - V(X[idx], d.b)) - (V(X[p], d.a) - V(X[p], d.b))) / dt;
        }
      };
    }
    if (k === "ac" && RS.ac && RS.ac.re[idx]) {
      /* AC: use the real part scaled by a slow 1 Hz-ish visual phase so the
         flow reverses gently instead of flickering */
      var ph = (performance.now() / 1000) * 2 * Math.PI * 0.25;
      var re = RS.ac.re[idx], im = RS.ac.im[idx], xv = new Float64Array(re.length);
      for (var n = 0; n < re.length; n++) xv[n] = re[n] * Math.cos(ph) - im[n] * Math.sin(ph);
      return { x: xv, mode: "ac", idx: idx, w: 1, key: "ac" + idx + ":" + Math.round(ph * 20),
               acI: function (d) {
                 var w = 2 * Math.PI * RS.ac.f[idx];
                 var V = function (a, i) { return i < 0 ? 0 : a[i]; };
                 var vr = V(re, d.a) - V(re, d.b), vi = V(im, d.a) - V(im, d.b);
                 /* i = jwC (vr + j vi) = -wC vi + j wC vr, instantaneous */
                 return d.c * w * (-vi * Math.cos(ph) - vr * Math.sin(ph));
               } };
    }
    return { x: RS.op.x, mode: "dc", idx: -1, key: "op" };
  }

  /* current into every part pin: Map(pinKey -> amps flowing INTO the part) */
  function partPinCurrents(st) {
    var C = RS.C, M = S.M, X = geom.X, res = new Map(), byName = new Map();
    C.devs.forEach(function (d) { byName.set(String(d.nm).toLowerCase(), d); });

    /* swept source value for DC sweeps of current sources */
    var swDev = null;
    if (st.sw) { swDev = byName.get(String(st.sw.name).toLowerCase()); if (swDev) swDev.sw = st.sw.val; }

    var unresolved = [];
    M.parts.forEach(function (p) {
      if (p.t === "GND" || p.t === "LBL") return;
      var d = byName.get(String(p.n || "").toLowerCase());
      var pins = partPins(p);
      if (!d) {
        /* sub-circuit / gate / cell: add up the currents of its flattened devices (named  X1.MP1 ...)  at its pins */
        var pre = String(p.n || "").toLowerCase() + ".", inner = p.n ? C.devs.filter(function (q) { return String(q.nm).toLowerCase().indexOf(pre) === 0; }) : [];
        if (inner.length) {
          var acc = {};
          inner.forEach(function (q) { var rr = residual(q, st.x, st); for (var ni in rr) acc[ni] = (acc[ni] || 0) + rr[ni]; });
          var seenN = new Set(), sm = 0, gp = [];
          pins.forEach(function (q) {
            var n = nodeIndex(C, X.pin[p.id + "." + q.name]), pk = p.id + "." + q.name;
            if (n === undefined) { res.set(pk, 0); return; }
            if (n < 0) { gp.push(pk); return; }
            var v = seenN.has(n) ? 0 : (acc[n] || 0); seenN.add(n); res.set(pk, v); sm += v;
          });
          gp.forEach(function (pk, i) { res.set(pk, i === 0 ? -sm : 0); });
          return;
        }
        pins.forEach(function (q) { unresolved.push(p.id + "." + q.name); }); return;
      }

      var r = residual(d, st.x, st), idxs = pins.map(function (q) { return nodeIndex(C, X.pin[p.id + "." + q.name]); });
      var sum = 0, used = new Set(), gndPins = [];
      pins.forEach(function (q, i) {
        var n = idxs[i], pk = p.id + "." + q.name;
        if (n === undefined) { res.set(pk, 0); return; }
        if (n < 0) { gndPins.push(pk); return; }
        var v = used.has(n) ? 0 : (r[n] || 0); used.add(n);
        res.set(pk, v); sum += v;
      });
      if (gndPins.length) gndPins.forEach(function (pk, i) { res.set(pk, i === 0 ? -sum : 0); });
    });
    if (swDev) delete swDev.sw;

    /* parts the solver does not model (sub-circuits, ICs): balance by KCL
       when they are the only unknown at a node */
    if (unresolved.length) {
      var perNode = new Map();
      res.forEach(function (v, pk) {
        var pp = pk.split("."); var net = X.pin[pk]; if (net == null) return;
        perNode.set(net, (perNode.get(net) || 0) + v);
      });
      var count = new Map();
      unresolved.forEach(function (pk) { var n = X.pin[pk]; count.set(n, (count.get(n) || 0) + 1); });
      unresolved.forEach(function (pk) {
        var n = X.pin[pk];
        res.set(pk, count.get(n) === 1 && n !== "0" ? -(perNode.get(n) || 0) : 0);
      });
    }
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 3. KCL on a spanning tree  ->  signed current on every wire edge
   * ------------------------------------------------------------------ */
  function solveFlows(st) {
    var pin = partPinCurrents(st), inj = new Map();       // injection INTO the wire net
    geom.pinInfo.forEach(function (pi) {
      var v = pin.get(pi.part.id + "." + pi.pin);
      if (v) inj.set(pi.k, (inj.get(pi.k) || 0) - v);     // device draws v, wire supplies v
    });

    var all = geom.edges.concat(geom.virt), adj = new Map();
    all.forEach(function (e, i) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push({ to: e.b, ei: i, sgn: +1 });
      adj.get(e.b).push({ to: e.a, ei: i, sgn: -1 });
    });
    geom.edges.forEach(function (e) { e.I = 0; });

    var vis = new Set(), flow = new Array(all.length).fill(0);
    adj.forEach(function (_, root) {
      if (vis.has(root)) return;
      var order = [], par = new Map(); par.set(root, null); vis.add(root);
      var q = [root];
      while (q.length) {
        var u = q.shift(); order.push(u);
        (adj.get(u) || []).forEach(function (h) {
          if (vis.has(h.to)) return;
          vis.add(h.to); par.set(h.to, { from: u, ei: h.ei, sgn: h.sgn }); q.push(h.to);
        });
      }
      var sub = new Map();
      order.forEach(function (n) { sub.set(n, inj.get(n) || 0); });
      for (var i = order.length - 1; i > 0; i--) {                // leaves -> root
        var n = order[i], pr = par.get(n), s = sub.get(n);
        /* s amps are injected inside this subtree and must leave through
           the tree edge toward the parent; sign it along the edge's a->b */
        flow[pr.ei] = pr.sgn === +1 ? -s : s;
        sub.set(pr.from, sub.get(pr.from) + s);
      }
    });
    /* flow[] is signed along a->b of each edge, conventional current */
    for (var i = 0; i < geom.edges.length; i++) geom.edges[i].I = flow[i] || 0;
  }

  /* ------------------------------------------------------------------ *
   * 4. Rendering
   * ------------------------------------------------------------------ */
  function ensureLayer() {
    var svg = document.getElementById("svg"), scene = document.getElementById("scene");
    if (!svg || !scene) return false;
    if (!layer || !layer.parentNode) {
      layer = document.createElementNS(NS, "g");
      layer.setAttribute("id", "eflow");
      layer.setAttribute("pointer-events", "none");
      scene.parentNode.insertBefore(layer, document.getElementById("over") || scene.nextSibling);
    }
    return true;
  }

  function clearLayer() { if (layer) layer.textContent = ""; dots = []; }

  function rebuildDots() {
    if (!layer) return;
    layer.textContent = ""; dots = [];
    var GU = (typeof U === "number") ? U : 10;
    geom.edges.forEach(function (e) {
      var A = geom.pts.get(e.a), B = geom.pts.get(e.b);
      var x1 = A.x * GU, y1 = A.y * GU, x2 = B.x * GU, y2 = B.y * GU;
      var len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) return;
      var n = Math.max(1, Math.round(len / CFG.spacing)), gap = len / n, els = [];
      for (var i = 0; i < n; i++) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("r", CFG.radius);
        c.setAttribute("class", "electron");
        layer.appendChild(c); els.push(c);
      }
      dots.push({ e: e, x1: x1, y1: y1, ux: (x2 - x1) / len, uy: (y2 - y1) / len, len: len, gap: gap, n: n, els: els, ph: Math.random() * gap });
    });
  }

  function step(dt) {
    var imax = 0;
    geom.edges.forEach(function (e) { imax = Math.max(imax, Math.abs(e.I)); });
    var mult = (CFG.multipliers[speedMode] || 1);
    /* A burnt part / blown fuse / DMM with the dial on OFF is an open circuit (1 Gohm): only nano-amps of leakage remain. Because the speed is relative to the
       strongest wire, that leakage would look like full current. So once something is burnt (or a DMM is OFF), every wire carrying less than 10 uA (voltmeter leakage included) is DEAD:
       its electrons are hidden and do not move at all (no electron flow through a blown fuse or past a burnt part). */
    var burnt = false;
    try {
      burnt = S.M.parts.some(function (q) {
        return q.bn ||                                                          /* burnt part / blown fuse */
               (q.t === "DMM" && window.DMM && window.DMM.mode(q) === "off");   /* DMM dial on OFF = open circuit */
      });
    } catch (e) { burnt = false; }

    dots.forEach(function (d) {
      var I = d.e.I, rel = imax > 0 ? Math.abs(I) / imax : 0, idle = !(rel >= CFG.threshold);
      var dead = burnt && !(Math.abs(I) >= 1e-5);
      if (d.dead !== dead) { d.dead = dead; d.els.forEach(function (c) { c.style.display = dead ? "none" : ""; }); }
      if (dead) return;
      /* EVERY wire shows electrons. A wire with (almost) no current - open branch, transistor gate, charged capacitor,
         or no result yet - keeps a slow, dim drift in its last direction, so the whole circuit always looks alive. */
      if (d.idle !== idle) { d.idle = idle; d.els.forEach(function (c) { c.style.opacity = idle ? ".4" : ""; }); }
      /* electrons travel opposite to conventional current */
      var dir;
      if (idle) dir = d.dir || -1; else { dir = I > 0 ? -1 : 1; d.dir = dir; }
      var speed = idle ? CFG.minSpeed * 0.5 * mult : (CFG.minSpeed + (CFG.maxSpeed - CFG.minSpeed) * Math.sqrt(rel)) * mult;
      d.ph = (d.ph + dir * speed * dt) % d.gap; if (d.ph < 0) d.ph += d.gap;
      for (var i = 0; i < d.n; i++) {
        var s = (d.ph + i * d.gap) % d.len;
        d.els[i].setAttribute("cx", (d.x1 + d.ux * s).toFixed(1));
        d.els[i].setAttribute("cy", (d.y1 + d.uy * s).toFixed(1));
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Main loop
   * ------------------------------------------------------------------ */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    try {
      if (!enabled || !ensureLayer() || typeof S === "undefined" || typeof extract !== "function" || typeof partPins !== "function") {
        if (layer && layer.firstChild) clearLayer(); geom = null; return;
      }
      /* Electron flow follows the CIRCUIT only (power switch + netlist), never the Run / Stop buttons:
         power switch OFF -> no electrons at all; ON -> they flow, also while the simulation output is stopped. */
      if (window.CIRC && window.CIRC.off()) {
        if (layer && layer.firstChild) clearLayer();
        wasOff = true; RS = null; flowCache.key = ""; return;
      }
      if (wasOff) { wasOff = false; dirty = true; }
      RS = (window.CR ? window.CR() : ((typeof RES !== 'undefined' && RES && RES.op && RES.C && !(RES.errs && RES.errs.length)) ? RES : null));
      var haveRes = ok();

      var sig = modelSig();
      if (dirty || !geom || sig !== geomSig) {
        dirty = false;
        geom = buildGeometry(); geomSig = sig; flowCache.key = ""; rebuildDots();
      }
      if (!dots.length) rebuildDots();
      /* no result (netlist error, edit still being solved): idle drift on all wires */
      if (!haveRes) {
        if (flowCache.key !== "none") { flowCache.key = "none"; geom.edges.forEach(function (e) { e.I = 0; }); }
        step(dt); return;
      }
      if (flowCache.res !== RS) { flowCache.res = RS; flowCache.key = ""; }

      var st = currentState();
      if (st.key !== flowCache.key) { flowCache.key = st.key; if (window.SWSTATE) window.SWSTATE.apply(st.mode, st.idx); solveFlows(st); }
      step(dt);
    } catch (err) {
      if (!frame.warned) { frame.warned = true; console.warn("electronflow:", err); }
    }
  }

  /* ------------------------------------------------------------------ *
   * UI: toolbar toggle + speed chooser, styles
   * ------------------------------------------------------------------ */
  function injectStyle() {
    var st = document.createElement("style");
    st.textContent =
      "#eflow .electron{fill:#ffd23f;stroke:#c98a00;stroke-width:.6;opacity:.95}" +
      ":root[data-theme='dark'] #eflow .electron{fill:#ffe066;stroke:#ffb300}" +
      "@media(prefers-color-scheme:dark){:root:not([data-theme='light']) #eflow .electron{fill:#ffe066;stroke:#ffb300}}" +
      ".tools #tEl i{color:#e0a100}.tools #tEl.on i,.tools #tEl.on span{color:#fff}" +
      ".tools #tElSpd{height:auto;min-width:0;padding:3px 4px;font-size:10px;font-weight:600;border:1px solid var(--line);border-radius:6px;background:var(--panel,transparent);color:var(--mut,inherit)}";
    document.head.appendChild(st);
  }

  function injectUI() {
    var tools = document.querySelector(".tools");
    if (!tools || document.getElementById("tEl")) return;
    var sep = document.createElement("i"); sep.className = "sep";
    var b = document.createElement("button");
    b.id = "tEl"; b.className = "on"; b.type = "button";
    b.title = "Electron flow runs non-stop (DC) - click to stop / start it";
    b.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i><span>Stop Flow</span>';
    b.onclick = function () {
      enabled = !enabled; b.classList.toggle("on", enabled);
      b.querySelector("span").textContent = enabled ? "Stop Flow" : "Start Flow";
      if (!enabled) clearLayer(); else dirty = true;
    };
    var sel = document.createElement("select");
    sel.id = "tElSpd"; sel.title = "Electron flow speed"; sel.setAttribute("aria-label", "Electron flow speed");
    [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = speedMode;
    sel.onchange = function () { speedMode = sel.value; };
    var anchor = document.querySelector(".tools .viewsw");
    tools.insertBefore(sep, anchor || null);
    tools.insertBefore(b, anchor || null);
    tools.insertBefore(sel, anchor || null);
  }

  function init() {
    injectStyle(); injectUI();
    var scene = document.getElementById("scene");
    if (scene) new MutationObserver(function () { dirty = true; }).observe(scene, { childList: true });
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* tiny public API */
  window.ElectronFlow = {
    config: CFG,
    enable: function (v) { enabled = v !== false; var b = document.getElementById("tEl"); if (b) b.classList.toggle("on", enabled); if (!enabled) clearLayer(); },
    setSpeed: function (m) { if (CFG.multipliers[m]) speedMode = m; }
  };
})();
