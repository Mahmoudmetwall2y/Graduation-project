# Quickstart: Testing Frontend WebSockets

1.  **Boot the Stack:**
    ```bash
    docker-compose up -d --build
    ```
    Ensure Mosquitto, Inference, and Frontend are running.

2.  **Verify WS Port:**
    ```bash
    curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:9001
    ```
    Should expect an HTTP 400 (Bad Request) from Mosquitto acknowledging the WS listener.

3.  **Simulate Edge Data:**
    Trigger the Python simulation script to flood `sensors/mock-uuid-1/ecg` with arrays.
    
4.  **Observe React UI:**
    Open `http://localhost:3000`. Open Chrome DevTools -> Network -> WS. You should see a persistent connection to `9001` receiving ~2 payloads per second, replacing the 30-second network tab polling.
