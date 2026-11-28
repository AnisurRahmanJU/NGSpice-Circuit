/* dmm-examples.js — "Measurement tools in circuits" topic (topic 18): 8 examples: the Digital Multimeter (dmm.js) and the separate Ammeter / Voltmeter parts.
   Load AFTER ngspice.js and dmm.js (index.html does it).  Nothing in ngspice.js has to change: this file adds the topic to
   TOPICS, gives the examples the same header / .control block / OFF power switch / auto .ic as every other example, and
   adds the topic to the Topic drop-down.

   The DMM is chosen by the NAME of its netlist element (see dmm.js):
        RDMMDV1 a b 10meg   DC volts  (V=)        RDMMAV1 a b 10meg   AC volts (V~)
        VDMMDA1 a b DC 0    DC amps   (A=)        VDMMAA1 a b DC 0    AC amps  (A~)
        VDMMOH1 a b DC 0.4  resistance (Ohm)      red probe = first node, black probe (COM) = second node

   Examples (numbers continue after the last existing example):
        Voltage measurement in circuit      DC volts across the supply and across one resistor
        Current measurement in circuit      DC amps: the meter is placed IN SERIES (total current and one branch)
        Resistance measurement in circuit   Ohm: an unpowered circuit, the reading is the equivalent of all parallel paths
        Inductance measurement in circuit   AC volts + AC amps at 1 kHz:  L = V / (2 pi f I)
        Capacitance measurement in circuit  AC volts + AC amps at 1 kHz:  C = I / (2 pi f V)
        Ammeter and voltmeter: Ohm law      Ammeter (VAMn, in series) + Voltmeter (RVMn, in parallel): R = V / I
        Ammeter in each branch              Kirchhoff current law (parallel branches)
        Voltmeter across each resistor      Kirchhoff voltage law (series resistors)                                       */
(function () {
  'use strict';
  if (typeof TOPICS === 'undefined' || typeof exNet !== 'function') return;     /* ngspice.js not loaded */

  var TOPIC_NAME = 'Measurement tools in circuits';
  if (TOPICS.some(function (t) { return t.topic === TOPIC_NAME; })) return;     /* already added */

  var E = function (title, desc, lines, plot) { return { title: title, desc: desc, net: exNet(lines), plot: plot }; };

  var items = [
    E('Voltage measurement in circuit',
      'A 12 V supply feeds R1 = 1 k, R2 = 2.2 k and R3 = 1 k in series. A voltmeter is always connected IN PARALLEL with the part it measures. ' +
      'DMM1 (dial V=) is across the supply and reads 12 V. DMM2 (dial V=) is across R2 and reads 6.29 V, because the current is 12 V / 4.2 k = 2.86 mA and ' +
      'V(R2) = 2.86 mA x 2.2 k. Turn the power switch ON. The red probe goes to the higher voltage, otherwise the reading is negative. ' +
      'The meter has 10 Mohm input resistance, so it hardly changes the circuit. Plot v(in), v(a), v(b).',
      ['* Voltage measurement in circuit', 'V1 vsw 0 DC 12', 'RSWM1 vsw in 1m',
       'R1 in a 1k', 'R2 a b 2.2k', 'R3 b 0 1k',
       'RDMMDV1 in 0 10meg', 'RDMMDV2 a b 10meg',
       '.tran 1m 50m'],
      'v(in) v(a) v(b)'),

    E('Current measurement in circuit',
      'An ammeter is connected IN SERIES: the circuit must be opened and the meter put in the gap. DMM1 (dial A=) is in series with the supply and reads the ' +
      'TOTAL current 17.45 mA. DMM2 (dial A=) is in series with the 2.2 k branch only and reads 5.45 mA (12 V / 2.2 k); the 1 k branch takes the other 12 mA. ' +
      'The red probe is on the side where the current comes from. An ammeter has almost no resistance, so never put it across a source (the meter burns at 100 A). ' +
      'Turn the power switch ON. Plot v(in), v(a), i(VDMMDA1), i(VDMMDA2).',
      ['* Current measurement in circuit', 'V1 vsw 0 DC 12', 'RSWM1 vsw in 1m',
       'VDMMDA1 in a DC 0',
       'R1 a 0 1k', 'R2 a c 2.2k', 'VDMMDA2 c 0 DC 0',
       '.tran 1m 50m'],
      'v(in) v(a) v(c) i(VDMMDA1) i(VDMMDA2)'),

    E('Resistance measurement in circuit',
      'The circuit has NO supply: a resistance meter (dial Ohm) puts its own 0.4 V test voltage on the part and measures the test current, so R = 0.4 V / I. ' +
      'The switch RSWM1 is the meter power switch: turn it ON to measure. R4 is marked 4.7 k, but the meter reads 2.53 k: in circuit R4 is in parallel with the path ' +
      'R2 + R3 = 5.5 k (R1 hangs on the side and does not count), 4.7 k || 5.5 k = 2.53 k. To read the real 4.7 k, lift one end of R4 out of the circuit (delete the wire to node b). ' +
      'Never measure resistance in a powered circuit. Plot v(b).',
      ['* Resistance measurement in circuit', 'VDMMOH1 vsw 0 DC 0.4', 'RSWM1 vsw b 1m',
       'R1 a b 1k', 'R2 b c 2.2k', 'R3 c 0 3.3k', 'R4 b 0 4.7k',
       '.tran 1m 50m'],
      'v(b) v(vsw)'),

    E('Inductance measurement in circuit',
      'A basic DMM has no inductance range, so L is found with an AC test at 1 kHz (5 V RMS source, 100 ohm protection resistor). DMM1 (dial A~) is in series and reads the ' +
      'current 42.3 mA RMS. DMM2 (dial V~) is across the inductor and reads 2.66 V RMS. The inductive reactance is XL = V / I = 62.9 ohm, so ' +
      'L = XL / (2 x pi x f) = 2.66 / (2 x pi x 1000 x 0.0423) = 10 mH. Turn the power switch ON. Plot v(in), v(b), i(VDMMAA1).',
      ['* Inductance measurement in circuit', 'V1 vsw 0 SIN(0 7.071 1k)', 'RSWM1 vsw in 1m',
       'R1 in a 100', 'VDMMAA1 a b DC 0', 'L1 b 0 10m',
       'RDMMAV1 b 0 10meg',
       '.tran 20u 20m'],
      'v(in) v(b) i(VDMMAA1)'),

    E('Capacitance measurement in circuit',
      'A basic DMM has no capacitance range, so C is found with an AC test at 1 kHz (5 V RMS source, 100 ohm protection resistor). DMM1 (dial A~) is in series and reads the ' +
      'current 26.6 mA RMS. DMM2 (dial V~) is across the capacitor and reads 4.23 V RMS. The capacitive reactance is XC = V / I = 159 ohm, so ' +
      'C = I / (2 x pi x f x V) = 0.0266 / (2 x pi x 1000 x 4.23) = 1 uF. Turn the power switch ON. Plot v(in), v(b), i(VDMMAA1).',
      ['* Capacitance measurement in circuit', 'V1 vsw 0 SIN(0 7.071 1k)', 'RSWM1 vsw in 1m',
       'R1 in a 100', 'VDMMAA1 a b DC 0', 'C1 b 0 1u IC=0',
       'RDMMAV1 b 0 10meg',
       '.tran 20u 20m uic'],
      'v(in) v(b) i(VDMMAA1)'),

    E('Ammeter and voltmeter: Ohm law, R = V / I',
      'The Ammeter (A) is put IN SERIES to measure current and the Voltmeter (V) is put IN PARALLEL to measure voltage. A 10 V supply drives R1 = 470 ohm. ' +
      'The ammeter reads 21.3 mA and the voltmeter reads 10 V, so R = V / I = 10 V / 21.3 mA = 470 ohm (Ohm law). The ammeter has 0 ohm and the voltmeter 10 Mohm, ' +
      'so neither changes the circuit. Turn the power switch ON. Plot v(in), v(a), i(VAM1).',
      ['* Ammeter and voltmeter: Ohm law, R = V / I', 'V1 vsw 0 DC 10', 'RSWM1 vsw in 1m',
       'VAM1 in a DC 0', 'R1 a 0 470', 'RVM1 a 0 10meg',
       '.tran 1m 50m'],
      'v(in) v(a) i(VAM1)'),

    E('Ammeter in each branch: total current is the sum of branch currents',
      'Kirchhoff current law. A 12 V supply feeds three parallel branches R1 = 1 k, R2 = 2.2 k and R3 = 3.3 k. Ammeters VAM2, VAM3 and VAM4 are in series with the branches and read ' +
      '12.0 mA, 5.45 mA and 3.64 mA. Ammeter VAM1 is in series with the supply and reads the total 21.1 mA, which is the sum of the three branch currents. ' +
      'The voltmeter RVM1 across the parallel group reads 12 V (every branch has the same voltage). Turn the power switch ON. Plot v(a), i(VAM1), i(VAM2), i(VAM3), i(VAM4).',
      ['* Ammeter in each branch: total current is the sum of branch currents', 'V1 vsw 0 DC 12', 'RSWM1 vsw in 1m',
       'VAM1 in a DC 0',
       'VAM2 a b DC 0', 'R1 b 0 1k',
       'VAM3 a c DC 0', 'R2 c 0 2.2k',
       'VAM4 a d DC 0', 'R3 d 0 3.3k',
       'RVM1 a 0 10meg',
       '.tran 1m 50m'],
      'v(a) i(VAM1) i(VAM2) i(VAM3) i(VAM4)'),

    E('Voltmeter across each resistor: voltage drops add up to the supply',
      'Kirchhoff voltage law. A 12 V supply feeds R1 = 1 k, R2 = 2.2 k and R3 = 3.3 k in series. The ammeter VAM1 reads the one series current 1.85 mA. ' +
      'Voltmeters RVM1, RVM2 and RVM3 are across R1, R2 and R3 and read 1.85 V, 4.06 V and 6.09 V. Their sum is 12 V, the same as voltmeter RVM4 across the supply. ' +
      'The biggest resistor takes the biggest voltage drop. Turn the power switch ON. Plot v(in), v(a), v(b), v(c), i(VAM1).',
      ['* Voltmeter across each resistor: voltage drops add up to the supply', 'V1 vsw 0 DC 12', 'RSWM1 vsw in 1m',
       'VAM1 in a DC 0',
       'R1 a b 1k', 'R2 b c 2.2k', 'R3 c 0 3.3k',
       'RVM1 a b 10meg', 'RVM2 b c 10meg', 'RVM3 c 0 10meg', 'RVM4 in 0 10meg',
       '.tran 1m 50m'],
      'v(in) v(a) v(b) v(c) i(VAM1)')
  ];

  /* ---- the same steps ngspice.js gives every other example ---- */
  var EXA = typeof EX_AUTHOR === 'string' ? EX_AUTHOR : '* Author Md. Anisur Rahman';
  var last = 0; TOPICS.forEach(function (t) { t.items.forEach(function (it) { if (it.n > last) last = it.n; }); });

  items.forEach(function (it, i) {
    it.n = last + 1 + i;                                                         /* continuous numbering */
    if (typeof EX_PLOT === 'object') EX_PLOT[it.title] = it.plot;                /* default plot traces */
    delete it.plot;
    var ls = String(it.net).split('\n'), fi = ls.findIndex(function (l) { return l.trim(); });
    var title = (ls[fi] || '').replace(/^\*+\s*/, '').trim() || it.title;
    ls.splice(fi + 1, 0, EXA, '.title ' + title);                                /* title + author lines */
    it.net = ls.join('\n');
    try {                                                                        /* .control / run / plot / print block */
      var c = typeof ctlInsert === 'function' ? ctlInsert(String(it.net).replace(/\s+$/, '').split('\n'), typeof exVec === 'function' ? exVec(it) : it.plot) : null;
      if (c) it.net = c.join('\n') + '\n';
    } catch (e) { /* keep the plain netlist */ }
    it.net = String(it.net).split('\n').map(function (l) {                      /* the power switch starts OFF (1G) */
      return /^\s*RSWM\w*\s/i.test(l) ? l.replace(/(\S+)(\s*)$/, function (m, v, sp) { return /^1m$/i.test(v) ? '1G' + sp : m; }) : l;
    }).join('\n');
    try { if (typeof autoIC === 'function') it.net = autoIC(it.net); } catch (e) { /* keep */ }
  });

  TOPICS.push({ topic: TOPIC_NAME, items: items });

  /* ---- Topic drop-down ---- */
  try {
    var sel = document.getElementById('topic');
    if (sel) sel.add(new Option((TOPICS.length) + '. ' + TOPIC_NAME + ' (' + items.length + ')', TOPICS.length - 1));
  } catch (e) { /* ignore */ }
})();
