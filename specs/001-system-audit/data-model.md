# Data Model: Real-Time Predictions

## Entity: `PredictionPayload`
This is the live JSON object transmitted over MQTT `sensors/+/predictions`.

### Fields
*   `device_id` (String): Unique identifier of the transmitting ESP32.
*   `timestamp` (ISO-8601 String): Ingestion timestamp.
*   `ecg_arrhythmia` (String): Predicted class (e.g., 'Normal beat', 'Premature Ventricular Contraction').
*   `pcg_sound` (String): Classification ('Normal', 'Abnormal', 'Artifact').
*   `pcg_severity` (Object): 6-head CNN severity array.
    *   `AS` (String): Aortic Stenosis Severity ('Mild', 'Moderate', 'Severe', 'None').
    *   `MR` (String): Mitral Regurgitation Severity ... etc.
*   `confidence_score` (Float): Softmax probability of the primary classification.

## Validations
*   `device_id` must match registered UUIDs in the `devices` table.
*   Latencies between Edge `timestamp` and React render must be logged.
