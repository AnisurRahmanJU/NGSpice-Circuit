# 100 NGspice Code for Circuit Simulator

Every netlist below uses only what your JS engine supports. Paste one into the editor (or add it to the `EX` object) and use the **Operating point / DC / AC / Transient** tabs.

## What the engine supports

| Feature | Supported |
|---|---|
| Elements simulated | `R C L V I D Q M E G` |
| Elements drawn only | `S F H B T K X` (not simulated, so not used here) |
| Analyses | `.op` `.dc` (one source) `.ac dec/oct/lin` `.tran` |
| Waveforms | `DC`, `AC mag [phase]`, `SIN(vo va freq td theta phase)`, `PULSE(v1 v2 td tr tf pw per)`, `PWL(t v t v ...)` |
| Models | `D(Is N)`, `NPN/PNP(Is Bf Br)`, `NMOS/PMOS(Vto Kp Lambda)`, MOS size as `W= L=` on the element line |
| Suffixes | `f p n u m k meg g t` |

Models used throughout:

```css
.model DX D(Is=1e-14 N=1)
.model QN NPN(Is=1e-14 Bf=200)
.model QP PNP(Is=1e-14 Bf=100)
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)
```

## Topics

| # | Topic |
|---|---|
| 1–10 | DC resistor circuits |
| 11–22 | Transient: RC, RL, RLC |
| 23–38 | AC frequency response and filters |
| 39–54 | Diodes and rectifiers |
| 55–68 | BJT circuits |
| 69–80 | MOSFET circuits |
| 81–92 | Controlled sources and op-amp circuits |
| 93–96 | Source waveforms |
| 97–100 | Applications |

---

# 1. DC Resistor Circuits

### 1. Voltage divider
Plot `v(out)` in the DC tab: it is exactly half the input.
```css
* Voltage divider
V1 in 0 DC 10
R1 in out 1k
R2 out 0 1k
.op
.dc V1 0 10 1
.end
```

### 2. Series resistors
Current is identical through all three; check `i(R1)`, `i(R2)`, `i(R3)`.
```css
* Series resistors
V1 1 0 DC 12
R1 1 2 1k
R2 2 3 2.2k
R3 3 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 3. Parallel resistors
Branch currents add up to the source current.
```css
* Three parallel branches
V1 in 0 DC 12
R1 in 0 1k
R2 in 0 2.2k
R3 in 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 4. Loaded voltage divider
Compare `v(mid)` with and without `RL`.
```css
* Loaded voltage divider
V1 vcc 0 DC 12
R1 vcc mid 10k
R2 mid 0 10k
R3 mid 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 5. Wheatstone bridge
`R4` is slightly off balance, so the bridge detector `Rg` sees a small voltage.
```css
* Wheatstone bridge
V1 top 0 DC 10
R1 top a 1k
R2 top b 1k
R3 a 0 1k
R4 b 0 1.1k
Rg a b 10k
.op
.dc V1 0 10 1
.end
```

### 6. Superposition with two sources
```css
* Superposition: two voltage sources
V1 1 0 DC 10
V2 3 0 DC 5
R1 1 2 1k
R2 2 0 2k
R3 3 2 1k
.op
.dc V1 0 10 1
.end
```

### 7. Current source feeding a resistor network
```css
* Current source network
I1 0 1 DC 1m
R1 1 0 4.7k
R2 1 2 1k
R3 2 0 2.2k
.op
.dc I1 0 2m 0.1m
.end
```

### 8. R-2R ladder DAC (3 bit, code 101)
Expected output: 5 V × 5/8 = 3.125 V at `n2`.
```css
* R-2R ladder DAC, code 101
Vb2 b2 0 DC 5
Vb1 b1 0 DC 0
Vb0 b0 0 DC 5
R2b b2 n2 20k
R1b b1 n1 20k
R0b b0 n0 20k
Rt n0 0 20k
Ra n0 n1 10k
Rb n1 n2 10k
.op
.end
```

### 9. Delta network with loads
```css
* Delta resistor network with loads
V1 a 0 DC 10
R1 a b 1k
R2 b c 1k
R3 c a 1k
R4 b 0 2.2k
R5 c 0 2.2k
.op
.dc V1 0 10 1
.end
```

### 10. Maximum power transfer
Power in `RL` is highest when `RL = Rs` (see the P column in the operating-point table).
```css
* Maximum power transfer RL = Rs
Vs 1 0 DC 10
R1 1 2 50
R2 2 0 50
.op
.dc Vs 0 10 1
.end
```

---

# 2. Transient: RC, RL, RLC

### 11. RC charge and discharge (square wave)
Time constant is 1 ms.
```css
* RC charge/discharge
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 1u
.tran 20u 10m
.end
```

### 12. Slow RC (τ = 1 ms with 10 kΩ and 100 nF)
```css
* RC time constant 1 ms
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 10k
C1 out 0 100n
.tran 20u 10m
.end
```

### 13. RL step response
Time constant L/R = 0.1 ms. Plot `i(L1)`.
```css
* RL step response
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 100
L1 out 0 10m
.tran 5u 1m
.end
```

### 14. RC differentiator
```css
* RC differentiator
V1 in 0 PULSE(0 5 0 1n 1n 1m 2m)
C1 in out 10n
R1 out 0 10k
.tran 5u 4m
.end
```

### 15. RC integrator (square wave to triangle)
```css
* RC integrator
V1 in 0 PULSE(-1 1 0 1n 1n 50u 100u)
R1 in out 100k
C1 out 0 10n
.tran 0.5u 1m
.end
```

### 16. Series RLC, underdamped
Overshoot and ringing at about 1.6 kHz.
```css
* Series RLC underdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 10
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 17. Series RLC, overdamped
```css
* Series RLC overdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 1k
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 18. Series RLC, critically damped
R = 2·√(L/C) = 200 Ω.
```css
* Series RLC critically damped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 200
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 19. Parallel RLC ringing (current impulse)
```css
* Parallel RLC impulse response
I1 0 n PULSE(0 1m 0 1n 1n 20u 1)
R1 n 0 100
L1 n 0 1m
C1 n 0 1u
.tran 1u 2m
.end
```

### 20. Two-stage RC network
```css
* Two-stage RC low-pass step
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 1u
.tran 20u 10m
.end
```

### 21. Capacitor charged through a Thevenin divider
Final value is the divider voltage, not the supply.
```css
* Capacitor charging via divider
V1 in 0 DC 10
R1 in a 10k
R2 a 0 10k
C1 a 0 1u
.tran 50u 50m
.end
```

### 22. Charge sharing between two capacitors
```css
* Coupled RC stages
V1 in 0 PULSE(0 5 0 1n 1n 10m 20m)
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 2u
.tran 50u 20m
.end
```

---

# 3. AC Frequency Response and Filters

### 23. RC low-pass (fc ≈ 1.59 kHz)
```css
* RC low-pass
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 50 10 1meg
.end
```

### 24. RC high-pass
```css
* RC high-pass
V1 in 0 AC 1
C1 in out 100n
R1 out 0 1k
.ac dec 50 10 1meg
.end
```

### 25. RL low-pass
fc = R/(2πL) ≈ 1.59 kHz.
```css
* RL low-pass
V1 in 0 AC 1
L1 in out 10m
R1 out 0 100
.ac dec 50 10 1meg
.end
```

### 26. RL high-pass
```css
* RL high-pass
V1 in 0 AC 1
R1 in out 100
L1 out 0 10m
.ac dec 50 10 1meg
.end
```

### 27. Series RLC band-pass (Q = 10)
Output is taken across `R1`.
```css
* Series RLC band-pass
V1 in 0 AC 1
L1 in a 10m
C1 a out 1u
R1 out 0 10
.ac dec 100 100 100k
.end
```

### 28. Series LC notch (band-stop)
```css
* LC notch at 1.59 kHz
V1 in 0 AC 1
R1 in out 100
L1 out m 10m
C1 m 0 1u
.ac dec 100 100 100k
.end
```

### 29. Parallel LC resonant band-pass
```css
* Parallel resonant band-pass
V1 in 0 AC 1
R1 in out 1k
L1 out 0 10m
C1 out 0 1u
.ac dec 100 100 100k
.end
```

### 30. Second-order LC low-pass
```css
* Second-order LC low-pass
V1 in 0 AC 1
L1 in out 10m
C1 out 0 1u
R1 out 0 50
.ac dec 50 100 100k
.end
```

### 31. Second-order CL high-pass
```css
* Second-order high-pass
V1 in 0 AC 1
C1 in out 1u
L1 out 0 10m
R1 out 0 100
.ac dec 50 100 100k
.end
```

### 32. Twin-T notch filter (fn ≈ 1.59 kHz)
```css
* Twin-T notch
V1 in 0 AC 1
R1 in a 10k
R2 a out 10k
C3 a 0 20n
C1 in b 10n
C2 b out 10n
R3 b 0 5k
R4 out 0 1meg
.ac dec 100 10 100k
.end
```

### 33. Wien bridge network (peak gain 1/3 at 1.59 kHz)
```css
* Wien network band-pass
V1 in 0 AC 1
R1 in a 10k
C1 a out 10n
R2 out 0 10k
C2 out 0 10n
.ac dec 100 10 100k
.end
```

### 34. Two-stage RC low-pass (−40 dB/dec)
```css
* Cascaded RC low-pass
V1 in 0 AC 1
R1 in a 1k
C1 a 0 100n
R2 a out 1k
C2 out 0 100n
.ac dec 50 10 1meg
.end
```

### 35. Three-stage RC phase-shift network
The phase plot reaches 180° of lead near 650 Hz (1/(2πRC√6)), where the gain is about 1/29.
```css
* Three-stage RC phase shifter
V1 in 0 AC 1
C1 in a 10n
R1 a 0 10k
C2 a b 10n
R2 b 0 10k
C3 b out 10n
R3 out 0 10k
.ac dec 100 10 100k
.end
```

### 36. Lead network
```css
* Lead network
V1 in 0 AC 1
R1 in out 10k
C1 in out 10n
R2 out 0 1k
.ac dec 50 10 1meg
.end
```

### 37. Lag network
```css
* Lag network
V1 in 0 AC 1
R1 in out 10k
R2 out m 1k
C1 m 0 100n
.ac dec 50 1 100k
.end
```

### 38. Pi (C-L-C) filter between 50 Ω terminations
```css
* Pi filter 50 ohm
V1 src 0 AC 1
R1 src in 50
C1 in 0 1u
L1 in out 10m
C2 out 0 1u
R2 out 0 50
.ac dec 50 100 1meg
.end
```

---

# 4. Diodes and Rectifiers

### 39. Diode forward I-V curve
```css
* Diode forward I-V
V1 in 0 DC 0
R1 in a 100
D1 a 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 5 0.05
.end
```

### 40. Reverse-biased diode
```css
* Diode reverse and forward sweep
V1 in 0 DC -5
R1 in a 1k
D1 a 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 -10 5 0.25
.end
```

### 41. Half-wave rectifier (no filter)
```css
* Half-wave rectifier
V1 in 0 SIN(0 5 50)
D1 in out DX
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 42. Half-wave rectifier with filter capacitor
```css
* Half-wave rectifier with filter
V1 in 0 SIN(0 5 50)
D1 in out DX
C1 out 0 10u
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 43. Full-wave bridge rectifier
```css
* Full-wave bridge rectifier
V1 a b SIN(0 10 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
R2 p 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 44. Center-tapped full-wave rectifier
```css
* Center-tapped full-wave rectifier
V1 a 0 SIN(0 10 50)
V2 b 0 SIN(0 10 50 0 0 180)
D1 a out DX
D2 b out DX
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 45. Positive clipper (limits at about +0.7 V)
```css
* Diode clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 46. Bidirectional clipper (±0.7 V)
```css
* Bidirectional clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
D2 0 out DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 47. Biased clipper (limits near 2.7 V)
```css
* Biased clipper
V1 in 0 SIN(0 5 1k)
Vb ref 0 DC 2
R1 in out 1k
D1 out ref DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 48. Diode clamper (DC restorer)
The signal is shifted upward so its negative peaks are clamped at about −0.7 V; compare `v(in)` with `v(out)`.
```css
* Diode clamper
V1 in 0 SIN(0 5 1k)
C1 in out 10u
D1 0 out DX
R1 out 0 100k
.model DX D(Is=1e-14 N=1)
.tran 5u 10m
.end
```

### 49. Voltage doubler
Output approaches about 2·Vpeak minus diode drops.
```css
* Voltage doubler
V1 in 0 SIN(0 5 1k)
C1 in a 1u
D1 0 a DX
D2 a out DX
C2 out 0 1u
R1 out 0 10k
.model DX D(Is=1e-14 N=1)
.tran 10u 30m
.end
```

### 50. Three series diodes as a voltage reference
Output `v(a)` is about 2 V.
```css
* Series diode reference
V1 in 0 DC 9
R1 in a 1k
D1 a b DX
D2 b c DX
D3 c 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 9 0.25
.end
```

### 51. Diode AND gate
```css
* Diode AND gate
Vcc vcc 0 DC 5
Va a 0 PULSE(0 5 0 1n 1n 1m 2m)
Vb b 0 PULSE(0 5 0 1n 1n 2m 4m)
R1 vcc y 1k
D1 y a DX
D2 y b DX
.model DX D(Is=1e-14 N=1)
.tran 20u 4m
.end
```

### 52. Diode OR gate
```css
* Diode OR gate
Va a 0 PULSE(0 5 0 1n 1n 1m 2m)
Vb b 0 PULSE(0 5 0 1n 1n 2m 4m)
D1 a y DX
D2 b y DX
R1 y 0 1k
.model DX D(Is=1e-14 N=1)
.tran 20u 4m
.end
```

### 53. LED with current-limiting resistor
```css
* LED driver
Vs 1 0 DC 5
R1 1 a 330
D1 a 0 LED
.model LED D(Is=1e-18 N=2)
.op
.dc Vs 0 5 0.1
.end
```

### 54. Schottky versus silicon diode
The Schottky (`DS`) conducts at a lower voltage.
```css
* Schottky vs silicon
V1 in 0 DC 0
R1 in a 100
D1 a 0 DS
R2 in b 100
D2 b 0 DX
.model DS D(Is=1e-8 N=1.05)
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 5 0.05
.end
```

---

# 5. BJT Circuits

### 55. Fixed-bias common emitter (supply sweep)
```css
* NPN fixed bias
Vcc vcc 0 DC 12
Rb vcc b 220k
Rc vcc c 2.2k
Q1 c b 0 QN
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vcc 0 12 0.25
.end
```

### 56. BJT output characteristics (Ib = 20 µA)
Plot `i(Vce)` against the swept `Vce`.
```css
* BJT output characteristic
Ib 0 b DC 20u
Vce c 0 DC 5
Q1 c b 0 QN
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vce 0 10 0.1
.end
```

### 57. Voltage-divider bias with emitter resistor
```css
* Voltage-divider bias
Vcc vcc 0 DC 12
R1 vcc b 47k
R2 b 0 10k
Rc vcc c 2.2k
Re e 0 1k
Q1 c b e QN
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vcc 0 12 0.25
.end
```

### 58. BJT as a saturated switch
```css
* BJT switch
Vcc vcc 0 DC 5
Vin in 0 PULSE(0 5 0 1u 1u 1m 2m)
Rb in b 10k
Rc vcc c 1k
Q1 c b 0 QN
.model QN NPN(Is=1e-14 Bf=200)
.tran 10u 4m
.end
```

### 59. Emitter follower
```css
* Emitter follower
Vcc vcc 0 DC 12
Vin in 0 SIN(6 1 1k)
Q1 vcc in e QN
Re e 0 1k
.model QN NPN(Is=1e-14 Bf=200)
.tran 10u 3m
.end
```

### 60. Common-emitter amplifier: frequency response
```css
* CE amplifier AC response
Vcc vcc 0 DC 12
Vin in 0 SIN(0 10m 1k) AC 1
Cin in b 10u
R1 vcc b 47k
R2 b 0 10k
Rc vcc c 2.2k
Re e 0 1k
Ce e 0 100u
Q1 c b e QN
Cout c out 10u
R3 out 0 10k
.model QN NPN(Is=1e-14 Bf=200)
.op
.ac dec 20 1 1meg
.end
```

### 61. Common-emitter amplifier: transient
```css
* CE amplifier transient
Vcc vcc 0 DC 12
Vin in 0 SIN(0 20m 1k)
Cin in b 10u
R1 vcc b 47k
R2 b 0 10k
Rc vcc c 2.2k
Re e 0 1k
Ce e 0 100u
Q1 c b e QN
Cout c out 10u
R3 out 0 10k
.model QN NPN(Is=1e-14 Bf=200)
.tran 10u 5m
.end
```

### 62. Common-base amplifier
```css
* Common-base amplifier
Vcc vcc 0 DC 12
Vin in 0 SIN(0 20m 1k) AC 1
Cin in e 10u
Re e 0 1k
R1 vcc b 47k
R2 b 0 10k
Cb b 0 100u
Rc vcc c 2.2k
Q1 c b e QN
Cout c out 10u
R3 out 0 10k
.model QN NPN(Is=1e-14 Bf=200)
.op
.ac dec 20 10 1meg
.tran 10u 3m
.end
```

### 63. BJT current mirror
```css
* BJT current mirror
Vcc vcc 0 DC 12
R1 vcc c1 10k
Q1 c1 c1 0 QN
Q2 out c1 0 QN
R2 vcc out 4.7k
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vcc 0 12 0.25
.end
```

### 64. Differential pair
Sweep `Vin1` and watch the collector voltages cross.
```css
* BJT differential pair
Vcc vcc 0 DC 12
Vee vee 0 DC -12
Vin1 in1 0 DC 0
Vin2 in2 0 DC 0
Rc1 vcc c1 4.7k
Rc2 vcc c2 4.7k
Q1 c1 in1 e QN
Q2 c2 in2 e QN
Re e vee 10k
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vin1 -0.2 0.2 0.01
.end
```

### 65. Darlington emitter follower
Emitter voltage is about 1.4 V below the base.
```css
* Darlington pair
Vcc vcc 0 DC 12
Vb b 0 DC 5
Q1 vcc b e1 QN
Q2 vcc e1 e QN
Re e 0 1k
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vb 0 10 0.1
.end
```

### 66. PNP common-emitter stage
```css
* PNP common emitter
Vcc vcc 0 DC 12
Rb b 0 220k
Rc c 0 2.2k
Q1 c b vcc QP
.model QP PNP(Is=1e-14 Bf=100)
.op
.dc Vcc 0 12 0.25
.end
```

### 67. Complementary push-pull follower (crossover distortion)
```css
* Push-pull emitter follower
Vcc vcc 0 DC 12
Vee vee 0 DC -12
Vin in 0 SIN(0 5 1k)
Q1 vcc in out QN
Q2 vee in out QP
R1 out 0 1k
.model QN NPN(Is=1e-14 Bf=200)
.model QP PNP(Is=1e-14 Bf=100)
.tran 5u 3m
.end
```

### 68. Constant-current source with diode reference
```css
* BJT current source
Vcc vcc 0 DC 12
R1 vcc b 4.7k
D1 b m DX
D2 m 0 DX
Q1 c b e QN
Re e 0 470
R2 vcc c 1k
.model DX D(Is=1e-14 N=1)
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vcc 0 12 0.25
.end
```

---

# 6. MOSFET Circuits

### 69. NMOS transfer characteristic
```css
* NMOS transfer curve
Vdd vdd 0 DC 5
Vg g 0 DC 0
Rd vdd d 1k
M1 d g 0 0 NM W=20u L=1u
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.op
.dc Vg 0 5 0.05
.end
```

### 70. NMOS output characteristic (Vgs = 3 V)
```css
* NMOS output characteristic
Vg g 0 DC 3
Vds d 0 DC 5
M1 d g 0 0 NM W=20u L=1u
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.op
.dc Vds 0 5 0.05
.end
```

### 71. Common-source stage with gate-voltage sweep
```css
* NMOS common source
Vdd vdd 0 DC 5
Vg g 0 DC 2
Rd vdd d 4.7k
M1 d g 0 0 NM W=10u L=1u
.model NM NMOS(Vto=1 Kp=100u)
.op
.dc Vg 0 5 0.1
.end
```

### 72. Common-source amplifier: transient
```css
* NMOS CS amplifier transient
Vdd vdd 0 DC 10
Vin g 0 SIN(2 0.2 1k)
Rd vdd d 4.7k
M1 d g 0 0 NM W=10u L=1u
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.tran 5u 3m
.end
```

### 73. Common-source amplifier: frequency response
```css
* NMOS CS amplifier AC
Vdd vdd 0 DC 10
Vin in 0 SIN(0 10m 1k) AC 1
Cin in g 100n
R1 vdd g 680k
R2 g 0 320k
Rd vdd d 2.2k
M1 d g 0 0 NM W=10u L=1u
Cout d out 100n
R3 out 0 100k
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.op
.ac dec 20 10 1meg
.end
```

### 74. Source follower
```css
* NMOS source follower
Vdd vdd 0 DC 10
Vin in 0 SIN(5 0.5 1k)
M1 vdd in s 0 NM W=20u L=1u
Rs s 0 4.7k
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.tran 5u 3m
.end
```

### 75. NMOS inverter with resistive load
```css
* NMOS resistive-load inverter
Vdd vdd 0 DC 5
Vin in 0 PULSE(0 5 0 10n 10n 1u 2u)
Rd vdd out 10k
M1 out in 0 0 NM W=10u L=1u
Cl out 0 1p
.model NM NMOS(Vto=1 Kp=100u)
.tran 10n 4u
.end
```

### 76. CMOS inverter transfer curve
Switching threshold is near 2.5 V because the devices are matched.
```css
* CMOS inverter VTC
Vdd vdd 0 DC 5
Vin in 0 DC 0
M1 out in 0 0 NM W=10u L=1u
M2 out in vdd vdd PM W=20u L=1u
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)
.op
.dc Vin 0 5 0.05
.end
```

### 77. CMOS inverter transient with load capacitor
```css
* CMOS inverter switching
Vdd vdd 0 DC 5
Vin in 0 PULSE(0 5 0 100p 100p 5n 10n)
M1 out in 0 0 NM W=10u L=1u
M2 out in vdd vdd PM W=20u L=1u
Cl out 0 100f
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.model PM PMOS(Vto=-1 Kp=50u Lambda=0.02)
.tran 50p 20n
.end
```

### 78. NMOS current mirror
```css
* NMOS current mirror
Vdd vdd 0 DC 5
R1 vdd g 10k
M1 g g 0 0 NM W=10u L=1u
M2 out g 0 0 NM W=10u L=1u
R2 vdd out 4.7k
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.op
.dc Vdd 0 5 0.1
.end
```

### 79. NMOS differential pair
```css
* NMOS differential pair
Vdd vdd 0 DC 5
I1 s 0 DC 200u
Vin1 in1 0 DC 2
Vin2 in2 0 DC 2
Rd1 vdd d1 10k
Rd2 vdd d2 10k
M1 d1 in1 s 0 NM W=10u L=1u
M2 d2 in2 s 0 NM W=10u L=1u
.model NM NMOS(Vto=1 Kp=100u Lambda=0.02)
.op
.dc Vin1 1.5 2.5 0.02
.end
```

### 80. NMOS pass transistor with capacitive load
Output reaches the input voltage while the gate is high, then holds on the capacitor.
```css
* NMOS pass gate
Vin in 0 DC 3
Vg g 0 PULSE(0 5 0 1u 1u 100u 200u)
M1 in g out 0 NM W=10u L=1u
Cl out 0 1n
Rl out 0 1meg
.model NM NMOS(Vto=1 Kp=100u)
.tran 1u 400u
.end
```

---

# 7. Controlled Sources and Op-Amp Circuits

Ideal op-amps are modelled with a high-gain `E` source: `E1 out 0 non-inverting inverting 100000`.

### 81. VCVS amplifier (gain 10)
```css
* VCVS gain of 10
Vin in 0 DC 0 AC 1
E1 out 0 in 0 10
Rl out 0 1k
.op
.dc Vin -1 1 0.1
.ac dec 10 1 1k
.end
```

### 82. VCCS transconductance stage
```css
* VCCS transconductance 2 mS
Vin in 0 DC 0
G1 out 0 in 0 2m
Rl out 0 2k
.op
.dc Vin -1 1 0.1
.end
```

### 83. Inverting amplifier (gain −10)
```css
* Inverting op-amp
Vin in 0 DC 0 AC 1
R1 in inv 1k
Rf inv out 10k
E1 out 0 0 inv 100000
.op
.dc Vin -1 1 0.1
.ac dec 10 1 1k
.end
```

### 84. Non-inverting amplifier (gain 10)
```css
* Non-inverting op-amp
Vin in 0 DC 0.5 AC 1
Rf out inv 9k
Rg inv 0 1k
E1 out 0 in inv 100000
.op
.dc Vin -1 1 0.1
.end
```

### 85. Voltage follower (buffer)
```css
* Voltage follower
Vin in 0 SIN(0 1 1k)
E1 out 0 in out 100000
Rl out 0 1k
.tran 10u 3m
.end
```

### 86. Summing amplifier
Expected output: −(1 V + 2 V) = −3 V.
```css
* Summing amplifier
V1 a 0 DC 1
V2 b 0 DC 2
R1 a inv 10k
R2 b inv 10k
Rf inv out 10k
E1 out 0 0 inv 100000
.op
.end
```

### 87. Difference amplifier
Expected output: 100k/10k × (2 V − 1 V) = 10 V.
```css
* Difference amplifier
V1 a 0 DC 2
V2 b 0 DC 1
R1 a inv 10k
Rf inv out 100k
R3 b np 10k
R4 np 0 100k
E1 out 0 np inv 100000
.op
.end
```

### 88. Op-amp integrator
```css
* Op-amp integrator
Vin in 0 PULSE(-1 1 0 1n 1n 500u 1m)
R1 in inv 10k
C1 inv out 10n
Rf inv out 1meg
E1 out 0 0 inv 100000
.tran 2u 4m
.end
```

### 89. Op-amp differentiator
Triangle input gives a square-wave output.
```css
* Op-amp differentiator
Vin in 0 PWL(0 0 0.5m 1 1m 0 1.5m 1 2m 0)
Rs in x 100
Cin x inv 10n
Rf inv out 10k
E1 out 0 0 inv 100000
.tran 5u 2m
.end
```

### 90. Active low-pass filter (fc ≈ 1 kHz, gain −1)
```css
* Active inverting low-pass
Vin in 0 AC 1
R1 in inv 10k
Rf inv out 10k
Cf inv out 15.9n
E1 out 0 0 inv 100000
.ac dec 50 10 100k
.end
```

### 91. Active high-pass filter (fc ≈ 1 kHz, gain −1)
```css
* Active inverting high-pass
Vin in 0 AC 1
C1 in a 15.9n
R1 a inv 10k
Rf inv out 10k
E1 out 0 0 inv 100000
.ac dec 50 10 100k
.end
```

### 92. Sallen-Key low-pass (Butterworth, fc ≈ 1.6 kHz)
```css
* Sallen-Key low-pass
Vin in 0 AC 1
R1 in a 10k
R2 a b 10k
C1 a out 14.1n
C2 b 0 7.07n
E1 out 0 b 0 1
.ac dec 50 10 100k
.end
```

---

# 8. Source Waveforms

### 93. Exponentially damped sine
```css
* Damped sine source
V1 in 0 SIN(0 5 1k 0 500 0)
R1 in 0 1k
.tran 5u 5m
.end
```

### 94. Square wave through an RC low-pass (harmonic filtering)
```css
* Square wave into RC filter
V1 in 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 in out 1.6k
C1 out 0 100n
.tran 5u 5m
.end
```

### 95. Arbitrary PWL stimulus
```css
* PWL source into RC
V1 in 0 PWL(0 0 1m 0 1.1m 5 3m 5 3.1m 0 5m 0)
R1 in out 1k
C1 out 0 1u
.tran 10u 6m
.end
```

### 96. Two series sine sources (100 Hz beat)
```css
* Beat between 1 kHz and 1.1 kHz
V1 a 0 SIN(0 1 1k)
V2 b a SIN(0 1 1.1k)
R1 b 0 1k
.tran 10u 20m
.end
```

---

# 9. Applications

### 97. Bridge rectifier with reservoir capacitor (ripple)
```css
* Bridge rectifier with filter cap
V1 a b SIN(0 12 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
C1 p 0 470u
R2 p 0 100
.model DX D(Is=1e-14 N=1)
.tran 0.1m 100m
.end
```

### 98. Series-pass regulator (LED reference)
Output stays near 1.2 V once the input is high enough.
```css
* Series-pass regulator
Vin vin 0 DC 15
R1 vin b 2.2k
D1 b 0 LED
Q1 vin b out QN
R2 out 0 1k
.model LED D(Is=1e-18 N=2)
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vin 0 15 0.25
.end
```

### 99. Third-order Butterworth LC low-pass (fc = 1 kHz, 50 Ω)
```css
* 3rd-order Butterworth LC low-pass
V1 src 0 AC 1
R1 src in 50
C1 in 0 3.18u
L1 in out 15.9m
C2 out 0 3.18u
R2 out 0 50
.ac dec 50 100 100k
.end
```

### 100. LC delay line (4 sections, Z0 ≈ 32 Ω)
The pulse arrives about 32 µs later per section.
```css
* LC delay line
V1 src 0 PULSE(0 1 0 1u 1u 200u 1m)
R1 src a 32
C1 a 0 1u
L1 a b 1m
C2 b 0 1u
L2 b c 1m
C3 c 0 1u
L3 c d 1m
C4 d 0 1u
R2 d 0 32
.tran 1u 500u
.end
```
