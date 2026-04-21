import machine
import time

led = machine.Pin(33, machine.Pin.OUT)
print("[TEST] Blinking GPIO33 — 1s on / 1s off. Press Ctrl+C to stop.")

while True:
    led.value(1)
    print("GPIO33 ON")
    time.sleep(1)
    led.value(0)
    print("GPIO33 OFF")
    time.sleep(1)
