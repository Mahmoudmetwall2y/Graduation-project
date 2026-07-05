import threading

from app.mqtt_handler import SessionBuffer


def make_buffer() -> SessionBuffer:
    return SessionBuffer(
        session_id="session-id",
        org_id="org-id",
        device_id="device-id",
        modality="pcg",
        config={"sample_rate_hz": 22050, "format": "pcm_s16le"},
    )


def test_session_buffer_finalization_can_only_be_claimed_once():
    buffer = make_buffer()

    assert buffer.begin_finalization() is True
    assert buffer.begin_finalization() is False
    assert buffer.ended is True


def test_session_buffer_finalization_is_thread_safe():
    buffer = make_buffer()
    barrier = threading.Barrier(8)
    results = []

    def claim():
        barrier.wait()
        results.append(buffer.begin_finalization())

    threads = [threading.Thread(target=claim) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert results.count(True) == 1
    assert results.count(False) == 7


def test_first_live_flush_waits_for_a_renderable_batch():
    buffer = make_buffer()
    threshold = int(buffer.sample_rate * 0.35)

    assert buffer.should_request_live_flush(512) is False
    assert buffer.should_request_live_flush(threshold - 1) is False
    assert buffer.should_request_live_flush(threshold) is True
