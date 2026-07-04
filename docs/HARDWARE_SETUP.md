# Hardware Setup

Required hardware:

- ESP32-WROOM-32 development board
- AD8232 ECG sensor
- MAX9814 microphone amplifier for PCG/heart sounds
- USB data cable
- ECG electrodes and safe low-voltage power source

Recommended wiring:

| Module | Signal | ESP32 |
| --- | --- | --- |
| AD8232 | OUTPUT | GPIO 32 |
| AD8232 | LO+ | GPIO 34 |
| AD8232 | LO- | GPIO 35 |
| AD8232 | 3.3V | 3V3 |
| AD8232 | GND | GND |
| MAX9814 | OUT | GPIO 33 |
| MAX9814 | VDD | 3V3 |
| MAX9814 | GND | GND |
| Status LED | onboard | GPIO 2 |

Power notes:

- Use 3.3V sensor logic.
- Keep analog wires short.
- Avoid noisy USB chargers and loose breadboard grounds.

Signal-quality notes:

- AD8232 lead-off must be false for clean ECG.
- Place the MAX9814 close to the stethoscope head and isolate it from hand noise.
- Poor signal quality may be caused by wiring, lead placement, microphone placement, or environmental noise.

Safety disclaimer: AscultiCor is for educational and research use only. AI results are not medical diagnoses.

