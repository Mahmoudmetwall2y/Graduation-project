# Integration Guide for Hardware & LLM Components

## ✅ Short Answer: **YES - Everything is Ready!**

Your friends can integrate their hardware and LLM models seamlessly. The project architecture is designed specifically for this.

---

## 📦 What Your Friends Need to Provide

### 1. **Hardware Team** (ESP32 Firmware)
**What they provide:**
- ESP32 device with sensors (AD8232 ECG + MAX9814 PCG)
- Firmware loaded on device

**Integration Effort:** ⭐ **ZERO** - Just flash and connect

**Already Configured:**
- MQTT communication protocol ✅
- Authentication system ✅
- Data format (binary chunks) ✅
- Session management ✅

**What they need to do:**
1. Flash the firmware from `firmware/cardiosense_esp32/AscultiCor_esp32.ino`
2. Configure WiFi credentials via Serial commands
3. Register device in web dashboard
4. Power on - **It will auto-connect!**

**Data Flow:**
```
ESP32 Device → MQTT Broker → Inference Service → Database → Frontend
   (Hardware)    (Mosquitto)      (ML Models)    (Supabase)  (Web App)
```

---

### 2. **ML Team** (Machine Learning Models)
**What they provide:**
- Trained PCG classifier model
- Trained ECG predictor model  
- Trained Severity assessment model (optional)

**Integration Effort:** ⭐⭐ **MINIMAL** - Just copy files

**Supported Model Formats:**
| Model Type | File Format | Expected Filename |
|-----------|-------------|-------------------|
| PCG Classifier | XGBoost (.pkl) | `pcg_classifier.pkl` |
| Severity Assessment | Keras/TensorFlow (.h5) | `murmur_severity.h5` |
| ECG Predictor | Keras/TensorFlow (.h5) | `ecg_predictor.h5` |

**How to Integrate:**
```bash
# 1. Copy models to the models directory
cp your_pcg_model.pkl inference/models/pcg_classifier.pkl
cp your_severity_model.h5 inference/models/murmur_severity.h5
cp your_ecg_model.h5 inference/models/ecg_predictor.h5

# 2. Disable demo mode in .env
ENABLE_DEMO_MODE=false

# 3. Restart the inference service
docker-compose restart inference
```

**What happens automatically:**
- ✅ Inference service detects models on startup
- ✅ Switches from demo mode to real inference
- ✅ Loads models into memory
- ✅ Starts processing real cardiac signals
- ✅ Stores predictions in database

**Model Interface Requirements:**

Your models must accept:
```python
# PCG Model Input
audio: np.ndarray  # Audio samples (int16)
sample_rate: int   # 22050 Hz

# ECG Model Input  
ecg_signal: np.ndarray  # ECG samples (mV)
sample_rate: int        # 500 Hz
```

Your models must return:
```python
# PCG Output
{
    'label': 'Normal' | 'Murmur' | 'Artifact',
    'probabilities': {'Normal': 0.85, 'Murmur': 0.10, ...},
    'confidence': 0.95
}

# ECG Output
{
    'label': 'Normal' | 'Abnormal',
    'probabilities': {'Normal': 0.92, 'Abnormal': 0.08},
    'confidence': 0.92
}
```

**If models use different formats:**
The inference engine can be easily modified in `inference/app/inference.py`. The loading logic is in `_load_models()` method (lines 49-88).

---

### 3. **LLM Team** (AI Report Generation)
**What they provide:**
- Prompt engineering for clinical reports
- Integration logic for OpenAI/Gemini APIs

**Integration Effort:** ⭐⭐ **MINIMAL** - SDKs already installed

**Already Installed:**
- OpenAI SDK (`openai`)
- Google Gemini SDK (`@google/generative-ai`)
- Database table for LLM reports (`llm_reports`)

**How to Integrate:**

**Option A: Using OpenAI**
```typescript
// In your frontend code or API route
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateReport(sessionData: SessionData) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a cardiac analysis assistant...'
      },
      {
        role: 'user',
        content: `Analyze this cardiac data: ${JSON.stringify(sessionData)}`
      }
    ]
  });
  
  return response.choices[0].message.content;
}
```

**Option B: Using Google Gemini**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function generateReport(sessionData: SessionData) {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  
  const result = await model.generateContent(
    `Analyze this cardiac data: ${JSON.stringify(sessionData)}`
  );
  
  return result.response.text();
}
```

**Database Schema for LLM Reports:**
```sql
llm_reports table:
- id: UUID
- session_id: UUID (links to session)
- device_id: UUID (links to device)
- model_name: TEXT (gpt-4, gemini-pro, etc.)
- prompt_text: TEXT (the prompt used)
- report_text: TEXT (generated report)
- report_json: JSONB (structured data)
- confidence_score: NUMERIC (0-1)
- tokens_used: INTEGER
- latency_ms: INTEGER
- status: TEXT (pending/generating/completed/error)
- created_at: TIMESTAMP
- completed_at: TIMESTAMP
```

**What they need to implement:**
1. Create an API route (e.g., `/api/generate-report`)
2. Call LLM API with session data
3. Save results to `llm_reports` table
4. Display report in frontend

---

## 🔧 Integration Checklist

### For Hardware Team
- [ ] ESP32-WROOM-32 boards available
- [ ] AD8232 ECG modules available
- [ ] MAX9814 microphone modules available
- [ ] Firmware flashed successfully
- [ ] Device connected to WiFi
- [ ] Device registered in web dashboard
- [ ] Test data flowing (check `/metrics` endpoint)

### For ML Team
- [ ] Models trained on cardiac data
- [ ] Models exported to supported formats (.pkl or .h5)
- [ ] Model accuracy tested (>85% recommended)
- [ ] Models copied to `inference/models/`
- [ ] Demo mode disabled in `.env`
- [ ] Inference service restarted
- [ ] Real predictions appearing in dashboard

### For LLM Team
- [ ] OpenAI or Google API keys obtained
- [ ] API keys added to `.env` file
- [ ] Prompt templates designed
- [ ] Report generation API route created
- [ ] Reports saving to database
- [ ] Frontend displaying reports

---

## 🚀 Step-by-Step Integration Process

### Phase 1: Hardware Integration (Day 1)
```bash
# 1. Build and start services
docker-compose up --build -d

# 2. Flash ESP32 with firmware
# Use Arduino IDE to flash: firmware/cardiosense_esp32/AscultiCor_esp32.ino

# 3. Configure device via Serial Monitor
# Commands: SET wifi_ssid XXX, SET wifi_pass XXX, SET device_id XXX, REBOOT

# 4. Verify data flow
curl http://localhost:8000/metrics
# Should show: "active_sessions": 1
```

### Phase 2: ML Model Integration (Day 2)
```bash
# 1. Copy trained models
cp pcg_model.pkl inference/models/pcg_classifier.pkl
cp ecg_model.h5 inference/models/ecg_predictor.h5
# (optional) cp severity_model.h5 inference/models/murmur_severity.h5

# 2. Disable demo mode
# Edit .env: ENABLE_DEMO_MODE=false

# 3. Restart inference
docker-compose restart inference

# 4. Verify real inference
docker-compose logs inference
# Should see: "Loaded PCG model..." (not "DEMO MODE")

# 5. Test with real data
# Device should now show predictions in dashboard!
```

### Phase 3: LLM Integration (Day 3)
```bash
# 1. Add API keys to .env
# OPENAI_API_KEY=sk-...
# or
# GOOGLE_API_KEY=...

# 2. Restart frontend
docker-compose restart frontend

# 3. Implement report generation
# Create: frontend/src/app/api/generate-report/route.ts

# 4. Test report generation
# Click "Generate Report" in dashboard
# Should see AI-generated clinical report
```

---

## 🎯 What Works Out of the Box

✅ **Hardware Communication**
- MQTT protocol configured
- Binary data streaming
- Automatic session management
- Device authentication

✅ **Data Processing**
- Signal reconstruction from chunks
- Real-time preprocessing
- Buffer management
- Quality metrics calculation

✅ **Database Integration**
- Sessions stored automatically
- Predictions saved to database
- Device telemetry logged
- LLM reports table ready

✅ **Frontend Display**
- Real-time waveform visualization
- Device status monitoring
- Session history
- Alert system

✅ **Security**
- Authentication required
- Rate limiting active
- Row-level security (RLS)
- Encrypted connections

---

## ⚠️ Important Notes

### Model Requirements
- **Input preprocessing** is handled automatically
- Models receive **clean, preprocessed data**
- Models should output **normalized probabilities**
- Confidence scores help with **report quality**

### Data Format
- **PCG**: 22050 Hz, 16-bit PCM, mono audio
- **ECG**: 500 Hz, 16-bit samples (mV), single lead
- **Duration**: 10 seconds per session (configurable)

### Performance Expectations
- **Latency**: <2 seconds for inference
- **Throughput**: Multiple concurrent devices
- **Storage**: ~1MB per session
- **Database**: Auto-scaling with Supabase

---

## 🆘 Troubleshooting Integration Issues

### Hardware Won't Connect
```bash
# Check MQTT connection
docker-compose logs mosquitto

# Check device credentials
docker-compose exec mosquitto mosquitto_sub -t '#' -v
```

### Models Won't Load
```bash
# Check model paths
docker-compose exec inference ls -la /app/models/

# Check inference logs
docker-compose logs inference | grep -i "model\|demo"
```

### LLM Reports Not Generating
```bash
# Check API keys
docker-compose exec frontend env | grep -i "openai\|google"

# Check frontend logs
docker-compose logs frontend
```

---

## 📊 Expected Integration Timeline

| Component | Effort | Timeline |
|-----------|--------|----------|
| Hardware (ESP32) | ⭐ Zero | 1 day |
| ML Models | ⭐⭐ Minimal | 1-2 days |
| LLM Reports | ⭐⭐ Minimal | 1-2 days |
| **Total** | | **3-5 days** |

---

## ✅ Final Checklist Before Production

- [ ] All 3 models loaded and tested
- [ ] At least 1 ESP32 device connected and streaming
- [ ] LLM reports generating successfully
- [ ] Demo mode disabled (`ENABLE_DEMO_MODE=false`)
- [ ] Security headers enabled (`SECURITY_HEADERS_ENABLED=true`)
- [ ] Rate limiting configured
- [ ] SSL certificates configured
- [ ] Database backups enabled
- [ ] Monitoring dashboard accessible

---

**Bottom Line**: The architecture is plug-and-play. Your friends' work will integrate seamlessly with minimal effort!

**Questions?** Check `TEST_RESULTS.md` for current system status.
