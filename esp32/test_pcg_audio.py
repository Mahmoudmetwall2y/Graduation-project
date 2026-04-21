# ============================================================
# test_pcg_audio.py — Record PCG using HeartSoundCapture and
#                      serve the result as a downloadable WAV.
#
# Self-contained: upload as main.py to auto-run after boot.
# boot.py handles WiFi, this script handles recording + serving.
# Uses the SAME capture code as pcg_capture.py (array.array,
# busy-wait timing) so the recording is identical to production.
# ============================================================

import time
import struct
import socket
import gc
import os


def run():
    """Record PCG, build WAV, serve HTTP."""

    gc.collect()
    print("Free RAM: {} bytes".format(gc.mem_free()))

    # ── Record directly (same as pcg_capture but no list() conversion) ──
    import machine
    import array
    from config import MIC_PIN, MIC_SAMPLE_RATE

    adc = machine.ADC(machine.Pin(MIC_PIN))
    adc.atten(machine.ADC.ATTN_11DB)
    adc.width(machine.ADC.WIDTH_12BIT)

    rate = MIC_SAMPLE_RATE   # 4000
    duration = 5
    total = rate * duration  # 20000
    interval_us = 1_000_000 // rate

    # Pre-allocate array (2 bytes/sample = 40KB for 20000)
    gc.collect()
    print("Free RAM before alloc: {} bytes".format(gc.mem_free()))
    samples = array.array('H', (0 for _ in range(total)))

    print("Recording {}s at {} Hz ({} samples)...".format(duration, rate, total))
    print("Position mic on chest now! Starting in 3s...")
    time.sleep(3)
    print("GO!")

    led = machine.Pin(2, machine.Pin.OUT)
    led.value(1)

    start = time.ticks_us()
    for i in range(total):
        samples[i] = adc.read()
        target = start + (i + 1) * interval_us
        while time.ticks_us() < target:
            pass
        if (i + 1) % rate == 0:
            print("  {}s / {}s".format((i + 1) // rate, duration))

    elapsed = time.ticks_diff(time.ticks_us(), start)
    led.value(0)

    actual_rate = total / (elapsed / 1_000_000)
    print("Done! Actual rate: {:.0f} Hz".format(actual_rate))
    print("Min: {}, Max: {}".format(min(samples), max(samples)))

    # ── Build WAV directly from array (no list conversion) ──
    print("Building WAV...")
    gc.collect()

    # DC offset
    dc_sum = 0
    for i in range(total):
        dc_sum += samples[i]
    dc = dc_sum / total

    # Peak
    max_abs = 1.0
    for i in range(total):
        v = samples[i] - dc
        a = v if v > 0 else -v
        if a > max_abs:
            max_abs = a
    print("DC: {:.1f}  Peak: {:.1f}".format(dc, max_abs))

    data_size = total * 2
    wav_name = '/pcg_test.wav'
    try:
        os.remove(wav_name)
    except:
        pass

    wf = open(wav_name, 'wb')

    # 44-byte WAV header
    hdr = bytearray(44)
    hdr[0:4] = b'RIFF'
    struct.pack_into('<I', hdr, 4, 36 + data_size)
    hdr[8:12] = b'WAVE'
    hdr[12:16] = b'fmt '
    struct.pack_into('<I', hdr, 16, 16)
    struct.pack_into('<H', hdr, 20, 1)
    struct.pack_into('<H', hdr, 22, 1)
    struct.pack_into('<I', hdr, 24, rate)
    struct.pack_into('<I', hdr, 28, rate * 2)
    struct.pack_into('<H', hdr, 32, 2)
    struct.pack_into('<H', hdr, 34, 16)
    hdr[36:40] = b'data'
    struct.pack_into('<I', hdr, 40, data_size)
    wf.write(hdr)

    # Write PCM in chunks directly from array
    wb = bytearray(256)
    i = 0
    while i < total:
        bp = 0
        end = min(i + 128, total)
        for j in range(i, end):
            v = samples[j] - dc
            sv = int(v / max_abs * 32000)
            if sv > 32767: sv = 32767
            if sv < -32768: sv = -32768
            struct.pack_into('<h', wb, bp, sv)
            bp += 2
        wf.write(wb[:bp])
        i = end
    wf.close()

    # Free the array
    del samples
    gc.collect()

    # Verify
    fsize = os.stat(wav_name)[6]
    expected = 44 + data_size
    print("WAV file: {} bytes (expected {})".format(fsize, expected))
    if fsize != expected:
        print("WARNING: Size mismatch!")
    if fsize < 50:
        print("ERROR: WAV file too small!")
        return

    # ── Serve via HTTP ──
    import network
    wlan = network.WLAN(network.STA_IF)
    ip = wlan.ifconfig()[0] if wlan.isconnected() else '0.0.0.0'

    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('0.0.0.0', 80))
    srv.listen(2)
    print("\n" + "=" * 45)
    print("  Download: http://{}".format(ip))
    print("  File size: {} bytes".format(fsize))
    print("  Ctrl+C to stop server")
    print("=" * 45)

    try:
        while True:
            cl, addr = srv.accept()
            try:
                # Consume full request
                cl.settimeout(2)
                req = b''
                try:
                    while b'\r\n\r\n' not in req:
                        d = cl.recv(512)
                        if not d:
                            break
                        req += d
                except:
                    pass

                print("Client {} connected".format(addr))

                # Skip favicon requests
                if b'favicon' in req:
                    cl.write(b'HTTP/1.0 404 Not Found\r\n\r\n')
                    cl.close()
                    continue

                # Send headers + file
                hdr_str = (
                    'HTTP/1.0 200 OK\r\n'
                    'Content-Type: audio/wav\r\n'
                    'Content-Length: {}\r\n'
                    'Content-Disposition: attachment; filename="pcg_test.wav"\r\n'
                    'Connection: close\r\n\r\n'
                ).format(fsize)
                cl.write(hdr_str.encode())

                sent = 0
                f = open(wav_name, 'rb')
                while True:
                    chunk = f.read(512)
                    if not chunk:
                        break
                    cl.write(chunk)
                    sent += len(chunk)
                f.close()
                print("Sent {}/{} bytes".format(sent, fsize))
            except Exception as e:
                print("HTTP error: {}".format(e))
            finally:
                try:
                    cl.close()
                except:
                    pass
    except KeyboardInterrupt:
        print("Server stopped.")
    finally:
        srv.close()


# ── Auto-run when used as main.py ──
print("[PCG Test] Waiting 3s for WiFi to stabilise...")
time.sleep(3)
run()
