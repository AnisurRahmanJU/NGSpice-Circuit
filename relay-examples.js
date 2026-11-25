/* relay-examples.js — loaded BEFORE ngspice.js
   window.SWX.addMaster(net)       puts a power switch (RSWM1, ON = 1m ohm) in series with the main supply of an example
   window.SWX.relayTopic(exNet)    the "Relay Circuits" topic: 10 real-life relay circuits (each with its own power switch)
   window.SWX.plots                default plot vectors for those examples                                           */
(function () {
  'use strict';
  var isG = function (n) { n = String(n).toLowerCase(); return n === '0' || n === 'gnd'; };

  /* ---------- power switch for every example ---------- */
  function addMaster(net) {
    var lines = String(net).split('\n');
    if (lines.some(function (l) { return /^\s*RSWM\w*\s/i.test(l); })) return net;
    var depth = 0, ctl = false, cand = [];
    lines.forEach(function (l, i) {
      var t = l.trim();
      if (/^\.subckt/i.test(t)) { depth++; return; }
      if (/^\.ends/i.test(t)) { depth = Math.max(0, depth - 1); return; }
      if (depth) return;
      if (/^\.control/i.test(t)) { ctl = true; return; }
      if (/^\.endc/i.test(t)) { ctl = false; return; }
      if (ctl || !t || /^[*.+;]/.test(t)) return;
      var w = t.split(/\s+/);
      if (w.length >= 3) cand.push({ i: i, w: w });
    });
    var oneG = function (c) { return isG(c.w[1]) !== isG(c.w[2]); };
    var src = cand.filter(function (c) { return /^v/i.test(c.w[0]) && !/^vam/i.test(c.w[0]); });
    var sel = src.find(function (c) { return oneG(c) && /^(dc\b|[-+]?[\d.])/i.test(c.w.slice(3).join(' ')); }) ||
      src.find(oneG) ||
      cand.find(function (c) { return /^i/i.test(c.w[0]) && oneG(c); }) ||
      cand.find(function (c) { return /^r/i.test(c.w[0]) && !/^rsw/i.test(c.w[0]) && (!isG(c.w[1]) || !isG(c.w[2])); });
    if (!sel) return net;
    var k = isG(sel.w[1]) ? 2 : 1, orig = sel.w[k], all = lines.join('\n'), nn = 'vsw', q = 0;
    while (new RegExp('(^|\\s)' + nn + '(\\s|$)', 'im').test(all)) nn = 'vsw' + (++q);
    sel.w[k] = nn;
    lines[sel.i] = sel.w.join(' ') + (lines[sel.i].indexOf('+') === 0 ? '' : '');
    lines.splice(sel.i + 1, 0, '* RSWM1 = power switch: ON = 1m ohm, OFF = 1G ohm (OFF also stops the simulation)', 'RSWM1 ' + nn + ' ' + orig + ' 1m');
    return lines.join('\n');
  }

  /* ---------- 10 real-life relay circuits ---------- */
  var DM = ['.model 1N4148 D(Is=2.52n N=1.75)'], QM = '.model 2N2222 NPN(Is=1e-14 Bf=200)';
  var led = function (c, vf) { return '.model ' + c + '_LED D(Is=' + (0.01 * Math.exp(-vf / (2 * 0.02585))).toExponential(2) + ' N=2)'; };

  function relayTopic(exNet) {
    var E = function (n, title, desc, lines) { return { n: n, title: title, desc: desc, net: exNet(lines) }; };
    var items = [
      E(1, 'Relay changeover: two lamps on one SPDT relay',
        'A 12 V SPDT relay K1 swaps power between two lamps. Relay released: the NC lamp is ON. Relay energised (switch SW1 ON): the contact moves and the NO lamp is ON instead. Click SW1 to toggle. The coil current builds up over a few ms, so the contact moves a moment after the switch (see the Time Domain graph).',
        ['* Relay changeover: two lamps on one SPDT relay', 'V1 vsw 0 DC 12', '* RSWM1 = power switch', 'RSWM1 vsw vcc 1m', 'RSW1 vcc ctl 1m', 'XK1 ctl 0 vcc lamp_on lamp_off RELAY_12V',
          'D1 0 ctl 1N4148', 'RBULB1 lamp_on 0 24', 'RBULB2 lamp_off 0 24', DM[0], '.tran 0.5m 40m uic']),
      E(2, 'Transistor relay driver with flyback diode',
        'A 3.3 V logic pulse cannot drive a 30 mA relay coil directly, so NPN Q1 does it. D1 across the coil absorbs the inductive kick when Q1 turns off (and makes the relay release a few ms later). Plot v(c) and i(XK1.RCOIL).',
        ['* Transistor relay driver with flyback diode', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'VIN in 0 PULSE(0 3.3 5m 10u 10u 30m 60m)', 'RB1 in b 4.7k', 'Q1 c b 0 2N2222',
          'XK1 vcc c vcc lamp nc RELAY_12V', 'D1 c vcc 1N4148', 'RBULB1 lamp 0 24', QM, DM[0], '.tran 0.1m 120m uic']),
      E(3, 'Self-latching relay with START / STOP buttons (motor starter)',
        'Classic contactor circuit. A short press of START (S1) energises the DPDT relay; its first contact bridges START (the hold contact) so the coil stays on after the button is released, and its second contact runs the fan. The NC STOP button (S2) breaks the loop at 120 ms and the relay drops out.',
        ['* Self-latching relay with START / STOP buttons', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'VSTART st 0 PULSE(0 5 10m 100u 100u 20m 1)', 'VSTOP sp 0 PULSE(5 0 120m 100u 100u 20m 1)',
          'S2 vcc a sp 0 PB', 'S1 a c st 0 PB', 'XK1 c 0 a c nc1 vcc f nc2 RELAY2_12V', 'D1 0 c 1N4148', 'RFAN1 f 0 120', '.model PB SW(Vt=2.5 Vh=0.5 Ron=0.01 Roff=1G)', DM[0], '.tran 0.5m 200m uic']),
      E(4, 'Motor reversing with a DPDT relay (fan direction)',
        'Two contacts of a DPDT relay swap the fan polarity. Relay released: the fan runs anticlockwise. Switch SW1 ON: the relay pulls in and the fan runs clockwise. Click SW1 to reverse the motor. D1 protects against the coil kick.',
        ['* Motor reversing with a DPDT relay', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'RSW1 vcc ctl 1m', 'XK1 ctl 0 ma vcc 0 mb 0 vcc RELAY2_12V', 'D1 0 ctl 1N4148', 'RFAN1 ma mb 120', DM[0], '.tran 0.5m 40m uic']),
      E(5, 'On-delay timer: RC + transistor + relay',
        'C1 charges slowly through R1. When its voltage is high enough, Q1 conducts and the relay pulls in about 0.7 s after power-on, switching the lamp ON. Change C1 or R1 to change the delay.',
        ['* On-delay timer relay', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'R1 vcc tm 100k', 'C1 tm 0 10u IC=0', 'RB1 tm b 47k', 'Q1 c b 0 2N2222', 'XK1 vcc c vcc lamp nc RELAY_12V', 'D1 c vcc 1N4148',
          'RBULB1 lamp 0 24', QM, DM[0], '.tran 3m 3 uic']),
      E(6, 'Automotive headlight relay (30 mA switch, 10 A lamps)',
        'The dash switch SW1 carries only the coil current (ammeter VAM2, about 30 mA). The relay contacts carry the two 60 W headlamps (ammeter VAM1, about 10 A) straight from the battery, so thin wires and a small switch are enough.',
        ['* Automotive headlight relay', 'V1 vsw 0 DC 12', 'RSWM1 vsw bat 1m', 'RSW1 bat sw 1m', 'VAM2 sw ctl DC 0', 'D1 0 ctl 1N4148', 'XK1 ctl 0 com lamps nc RELAY_12V', 'VAM1 bat com DC 0',
          'RBULB1 lamps 0 2.4', 'RBULB2 lamps 0 2.4', DM[0], '.tran 0.5m 40m uic']),
      E(7, 'Relay switching a 230 V AC lamp from a 12 V DC control',
        'A small 12 V DC circuit (SW1 + coil) controls a 230 V / 50 Hz lamp through the relay contacts. The contacts only see the AC load; the control side stays low voltage and safe. Click SW1 to switch the lamp.',
        ['* Relay switching a 230 V AC lamp from 12 V DC', 'V1 vsw 0 DC 12', 'RSWM1 vsw vdc 1m', 'RSW1 vdc ctl 1m', 'D1 0 ctl 1N4148', 'VAC ac 0 SIN(0 325 50)', 'XK1 ctl 0 ac lamp nc RELAY_12V', 'RBULB1 lamp 0 529', DM[0], '.tran 0.12m 120m uic']),
      E(8, 'Over-voltage cut-out relay (zener + transistor)',
        'The supply sweeps 9 V → 18 V → 9 V. Above about 11.7 V the 11 V zener lets Q1 conduct, the relay energises and its NC contact disconnects the lamp. When the voltage falls again the relay releases and the lamp comes back. Plot v(vin), v(lamp).',
        ['* Over-voltage cut-out relay', 'VIN vsw 0 PWL(0 9 0.3 9 1.2 18 1.8 18 2.7 9 3 9)', 'RSWM1 vsw vin 1m', 'DZ1 zb vin BZX11', 'RB1 zb b 1k', 'RB2 b 0 10k', 'Q1 c b 0 2N2222', 'XK1 vin c vin ok lamp RELAY_12V',
          'D1 c vin 1N4148', 'RBULB1 lamp 0 24', '.model BZX11 D(Is=1n N=1 Bv=11 Ibv=1m)', QM, DM[0], '.tran 5m 3 uic']),
      E(9, 'Door / window alarm with a normally-closed loop',
        'Door switch SW1 and window switch SW2 are in series with the coil. While both are closed the relay is held in and the green LED shows "armed". Click SW1 or SW2 OFF (open door): the relay drops out and its NC contact lights the alarm lamp. Fail-safe: a cut wire also raises the alarm.',
        ['* Door / window alarm with a normally-closed loop', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'RSW1 vcc d1 1m', 'RSW2 d1 coil 1m', 'D1 0 coil 1N4148', 'XK1 coil 0 vcc ok alarm RELAY_12V', 'R1 ok la 1k', 'D2 la 0 GREEN_LED', 'RBULB1 alarm 0 24',
          led('GREEN', 2.2), DM[0], '.tran 0.5m 40m uic']),
      E(10, '555 turn-signal flasher with a relay',
        'A 555 astable (about 1.9 Hz) drives Q1, which clicks the relay on and off. The relay contact flashes the indicator lamp, just like a car turn-signal flasher. Plot v(out) and v(lamp).',
        ['* 555 turn-signal flasher with a relay', 'V1 vsw 0 DC 12', 'RSWM1 vsw vcc 1m', 'X1 0 trig out vcc ctrl trig disch vcc NE555', 'R1 vcc disch 1k', 'R2 disch trig 3.3k', 'C1 trig 0 100u IC=0', 'C2 ctrl 0 10n',
          'RB1 out b 2.2k', 'Q1 c b 0 2N2222', 'XK1 vcc c vcc lamp nc RELAY_12V', 'D1 c vcc 1N4148', 'RBULB1 lamp 0 6.9', QM, DM[0], '.tran 5m 3 uic'])
    ];
    return { topic: 'Relay Circuits (10 real-life examples)', items: items };
  }

  var plots = {
    'Relay changeover: two lamps on one SPDT relay': 'v(ctl) v(lamp_on) v(lamp_off)',
    'Transistor relay driver with flyback diode': 'v(in) v(c) v(lamp) i(XK1.RCOIL)',
    'Self-latching relay with START / STOP buttons (motor starter)': 'v(st) v(sp) v(c) v(f)',
    'Motor reversing with a DPDT relay (fan direction)': 'v(ctl) v(ma) v(mb)',
    'On-delay timer: RC + transistor + relay': 'v(tm) v(c) v(lamp)',
    'Automotive headlight relay (30 mA switch, 10 A lamps)': 'v(ctl) v(lamps) i(VAM1) i(VAM2)',
    'Relay switching a 230 V AC lamp from a 12 V DC control': 'v(ctl) v(ac) v(lamp)',
    'Over-voltage cut-out relay (zener + transistor)': 'v(vin) v(c) v(lamp)',
    'Door / window alarm with a normally-closed loop': 'v(coil) v(ok) v(alarm)',
    '555 turn-signal flasher with a relay': 'v(out) v(c) v(lamp)'
  };
  window.SWX = { addMaster: addMaster, relayTopic: relayTopic, plots: plots };
})();
