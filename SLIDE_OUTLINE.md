## Slide Outline (8–10 slides)

1. **Title**
   - Project name, team, advisor, date

2. **Problem Statement**
   - Remote cardiac monitoring is hard and expensive
   - Need real-time, accessible, and reliable tools

3. **Solution Overview**
   - AscultiCor: IoT + MQTT + ML + Web dashboard
   - End-to-end pipeline from device to clinician

4. **Architecture**
   - Diagram: ESP32 -> MQTT -> Inference -> Supabase -> Web UI
   - Mention auth + RLS

5. **Live Demo Flow**
   - Device creation
   - Session start
   - Live waveforms
   - Predictions

6. **ML + Inference**
   - PCG and ECG pipelines
   - Demo mode and how real models plug in

7. **Security + Reliability**
   - RLS, audit logs, internal tokens
   - MQTT auth + rate limiting

8. **Results**
   - Screenshots: live waveform, predictions, reports
   - Performance/latency if available

9. **Limitations**
   - Demo-mode ML/LLM
   - External vulnerabilities pending audit fix

10. **Future Work**
   - Deploy real ML models
   - Production LLM reporting
   - Mobile app / clinician dashboard enhancements

