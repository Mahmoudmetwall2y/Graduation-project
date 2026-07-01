# Appendix A: Hardware Bill of Materials and Pin Mapping

This appendix provides the construction reference for the delivered MAX9814-based prototype. Component substitutions must be reviewed against voltage, pin, noise, charging, protection, and firmware assumptions. The prototype is for education and research and is not medically isolated.

**Table A.1 — Principal hardware bill of materials**

| Item | Function | Critical selection note |
|---|---|---|
| ESP32-WROOM-32 board/module | Sampling, buffering, Wi-Fi, MQTT, control | 3.3 V logic; ADC1 pins used during Wi-Fi |
| AD8232 module | Single-lead ECG analog front end | Three-electrode interface and lead-off outputs |
| MAX9814 module | Analog PCG microphone amplification | Final design uses analog output and AGC; not INMP441 |
| USB Type-C input | Charging and bench power | Correct connector resistors and protected routing required |
| TP4056 stage | Single-cell Li-ion charging | Charge current must match the selected cell and thermal design |
| DW01A and FS8205 | Cell protection and disconnect | Verify over-charge, over-discharge, and over-current response |
| AO3401 and SS34 | Load-sharing power path | Check polarity, voltage drop, and source transition |
| 3.3 V regulator | Sensor and ESP32 rail | Must tolerate Wi-Fi current transients with acceptable ripple |
| Decoupling capacitors | Local and bulk energy storage | 0.1 µF local ceramic and 10 µF bulk parts near sensitive loads |
| Electrodes and chest coupling | Patient/signal interface | Single-use electrodes and mechanically stable acoustic contact |

**Table A.2 — Final ESP32 pin mapping**

| Source | Signal | ESP32 connection | Firmware use |
|---|---|---|---|
| AD8232 | VCC / GND | 3.3 V / common ground | Regulated analog supply and reference |
| AD8232 | OUT | GPIO32 / ADC1_CH4 | ECG samples |
| AD8232 | LO+ | GPIO34 | Positive lead-off indicator |
| AD8232 | LO− | GPIO35 | Negative lead-off indicator |
| MAX9814 | VCC / GND | 3.3 V / common ground | Regulated analog supply and reference |
| MAX9814 | OUT | GPIO33 / ADC1_CH5 | PCG samples |
| MAX9814 | GAIN | Ground | Nominal maximum-gain configuration |
| MAX9814 | A/R | Floating/default | Default AGC attack/release behavior |
| Status indicator | LED with resistor | GPIO2 | Connection, streaming, and error feedback |

# Appendix B: PCB Bring-Up and Manufacturing Reference

Fabrication files, schematic exports, placement views, and the final board revision should be inserted here after the PCB team freezes them. The checklist below is the minimum evidence to store with each manufactured revision; it does not replace electrical-safety assessment.

**Table B.1 — PCB release and bring-up checklist**

| Stage | Required check | Evidence to retain |
|---|---|---|
| Schematic | Net names, polarity, connector pinout, component values | Dated schematic PDF and review sign-off |
| Layout | Analog/digital separation and continuous return paths | Top/bottom copper and placement exports |
| Radio | ESP32 antenna keep-out and enclosure clearance | Dimensioned layout screenshot |
| Power-off inspection | Shorts, orientation, solder bridges, continuity | Inspection record and resistance checks |
| Current-limited power-up | USB-only and battery-only startup | Bench-supply voltage/current log |
| Regulation | 3.3 V minimum, maximum, startup, and ripple | Oscilloscope captures with probe bandwidth stated |
| Charging | Charge current, termination, and temperature | Battery specification and thermal/current log |
| Load sharing | USB insertion/removal while operating | Rail and source-transition waveforms |
| Analog quality | ECG/PCG baseline noise during Wi-Fi activity | Raw captures and measurement conditions |
| Functional I/O | GPIO32/33 sampling, lead-off pins, status LED | Firmware test log keyed to board revision |
| Endurance | Representative repeated-session operation | Runtime, resets, errors, and battery result |
| Release | Gerber, drill, BOM, placement, firmware, and revision match | Immutable release archive and hashes |

# Appendix C: MQTT Topics and Payload Contract

Every topic is scoped by organization and device using `org/{org_id}/device/{device_id}`. Session streams append `session/{session_id}`. Binary ECG and PCG payloads are signed 16-bit chunks; their interpretation depends on the accompanying session metadata and firmware version.

**Table C.1 — MQTT topic contract**

| Topic suffix | Direction | Payload | QoS | Retained |
|---|---|---|---:|---|
| `/status` | ESP32 to broker | JSON device status | 1 | Yes |
| `/control` | Backend to ESP32 | JSON start, stop, or control command | 1 | No |
| `/session/{session_id}/meta` | ESP32 to broker | JSON preflight and lifecycle event | 1 | No |
| `/session/{session_id}/heartbeat` | ESP32 to broker | JSON runtime heartbeat | 0 | No |
| `/session/{session_id}/ecg` | ESP32 to broker | Raw signed 16-bit ECG samples | 0 | No |
| `/session/{session_id}/pcg` | ESP32 to broker | Raw signed 16-bit PCG samples | 0 | No |

**Table C.2 — Required metadata groups**

| Message | Important fields or meanings |
|---|---|
| Status | status, IP, RSSI, firmware version, mode, Wi-Fi, MQTT, free heap, streaming |
| Control | command, session identifier, authorized duration/options, correlation context |
| Preflight | ECG leads connected, ECG signal present, PCG signal present, clipping, reason |
| Start metadata | modality rates, sample representation, firmware/device/session identity |
| Heartbeat | connection state, streaming state, counters, overflow/drop evidence, uptime |
| Finalization | final event, partial-buffer state, sample/chunk totals, error or stop reason |

The current firmware targets 500 Hz ECG acquisition and approximately 22,222 Hz PCG acquisition. Metadata must preserve the actual source rate even when downstream PCG processing resamples to 22,050 Hz. QoS 0 streaming requires application-level counters and explicit incomplete-session handling; reconnection must not silently convert missing data into a complete recording.

# Appendix D: Database Entities and API Reference

Organization ownership is the principal tenant boundary. Browser clients use authenticated user sessions and row-level policies; service-role credentials and internal tokens remain server-side.

**Table D.1 — Core data entities**

| Entity | Purpose and principal relationship |
|---|---|
| `organizations` | Tenant root for users and operational records |
| `profiles` | Auth-user extension containing organization and role |
| `patients` | Organization-scoped patient information referenced by sessions |
| `devices` | Physical identity, provisioning, telemetry, and organization ownership |
| `sessions` | Capture lifecycle linking patient, device, organization, and creator |
| `recordings` | ECG/PCG object metadata and private storage path |
| `predictions` | Versioned model and preprocessing output linked to a session |
| `live_metrics` | Low-rate authorized waveform and quality updates |
| `llm_reports` | Report request, queue, retry, result, and requester state |
| `device_alerts` | Clinical-review or operational conditions and resolution state |
| `audit_logs` | User, organization, entity, action, and metadata trace |

**Table D.2 — Principal server API routes**

| Route | Methods | Purpose |
|---|---|---|
| `/api/devices` | GET, POST | List organization devices or perform controlled creation |
| `/api/devices/{id}` | GET, PATCH, DELETE | Inspect or manage one authorized device |
| `/api/device/bootstrap` | POST | Validate bootstrap secret and return scoped broker configuration |
| `/api/device/provision` | POST | Coordinate device provisioning |
| `/api/sessions/{id}/start` | POST | Authorize a session and publish its MQTT command |
| `/api/sessions/{id}/live` | GET | Return authorized live metrics and waveform frames |
| `/api/sessions/{id}/stream` | GET | Return server-sent session updates |
| `/api/sessions/{id}/summary` | GET | Return session, recording, prediction, and report summary |
| `/api/llm` | GET, POST | Queue reports or process protected report batches |
| `/api/n8n/workflows` | POST | Execute internal-token workflow actions |
| `/api/health` | GET | Return minimal public or protected detailed health |

# Appendix E: Model Configuration and Evaluation Summary

Only the `new-models` registry state is current. Artifacts under legacy `models/model*` paths are historical and must not be substituted into the runtime or this evidence table.

**Table E.1 — Current model slots**

| Slot | State | Artifact and input contract | Output and evidence status |
|---|---|---|---|
| PCG XGBoost | Enabled | XGBoost plus scaler; 200 traditional features and 1,024 YAMNet features | Artifact, Murmur, Normal; aggregate held-out plots available |
| ECG AuscultICor v26 SL | Enabled | Keras model; 125 Hz, 500-sample ECG input, nine RR features, context input | Normal, SVEB, VEB, Fusion, Unknown plus experimental auxiliary outputs; four selected cases available |
| Murmur-characterization CNN | Enabled | PyTorch `best_model.pkl`; four AV/MV/PV/TV mel channels of `128 × 216` | Timing, shape, grading, pitch, quality, location; six matrices available |

**Table E.2 — Verified PCG held-out results**

| Measure | Result | Interpretation boundary |
|---|---:|---|
| Test examples | 1,651 | Based on supplied confusion matrix |
| Accuracy | 83.65% | Pooled result, not clinical accuracy |
| Murmur precision | 64.60% | Normal-to-Murmur false positives remain material |
| Murmur recall | 82.33% | 76 of 430 Murmur examples were classified Normal |
| Murmur F1-score | 72.39% | Derived from the supplied held-out matrix |
| Murmur ROC AUC | 0.915 | Ranking measure, not one fixed operating point |
| Murmur average precision | 0.831 | Supplied precision–recall plot |

The stored threshold-sweep plot marks 0.243, while current training and inference source uses 0.254. The release must select one versioned threshold and regenerate the matrix before final model freeze. The ECG case figures are qualitative examples, not an aggregate accuracy result.

**Table E.3 — CNN matrix-derived evaluation summary**

| Head | Matrix examples | Accuracy | Macro F1-score |
|---|---:|---:|---:|
| Timing | 895 | 97.09% | 98.36% |
| Shape | 895 | 96.65% | 91.08% |
| Grading | 895 | 95.87% | 93.84% |
| Pitch | 895 | 96.31% | 94.74% |
| Quality | 895 | 95.98% | 97.91% |
| Location | 895 | 95.42% | 96.46% |

These values were derived from the six delivered confusion-matrix images. Raw predictions, split provenance, and runtime CNN test cases are not yet included.

# Appendix F: n8n Workflow Inventory

Raw ECG and PCG samples do not pass through n8n. Workflows coordinate asynchronous application actions and require protected internal routes, configured credentials, bounded retries, and recorded execution outcomes.

**Table F.1 — Exported n8n workflows**

| ID | Workflow | Trigger | Main outcome |
|---:|---|---|---|
| 00 | Connectivity Check | Manual | Frontend, inference, Supabase, and notification check |
| 01 | Process Pending LLM Reports | Scheduled/manual | Completed, retrying, or failed report rows |
| 02 | Clinical Alert Notifications | Scheduled/manual | Deduplicated review notifications |
| 03 | Device Health Monitoring | Scheduled/manual | Offline, RSSI, heap, error, and recovery state |
| 04 | Daily Digest | Daily/manual | Twenty-four-hour operational summary |
| 05 | Recording Summary Enrichment | Scheduled/manual | Device/day summary upsert |
| 06 | Operations Monitoring | Scheduled/manual | Service or queue warning notification |
| 07 | Alert Escalation | Scheduled/manual | One-time escalation metadata and notification |

For every workflow, the final evidence package should retain the execution identifier, input record, action, retry count, final state, and user-visible effect. LLM output remains assistive text requiring review and must not modify model probabilities or create an autonomous diagnosis.

# Appendix G: Deployment and Release Checklist

This checklist reflects the current three-active-model registry. Older instructions that pair three loaded models with the legacy 360 Hz, 300-sample ECG path are obsolete; the active ECG artifact uses the documented 125 Hz, 500-sample contract.

**Table G.1 — Minimum release gate**

| Area | Release requirement | Current book evidence |
|---|---|---|
| Secrets | No committed `.env`; rotate service, MQTT, n8n, and provider secrets | Requires final operator check |
| Database | Resolve duplicate migration number 025 and replay on a disposable database | Blocking issue identified |
| Database security | RLS and private recording storage pass cross-tenant tests | Pending runtime matrix |
| Frontend | Lint, type check, and configured production build pass | Lint/type pass; configured build pending |
| Inference | Pinned dependencies, compilation, registry tests, and artifact hashes pass | Compilation passes; pytest environment pending |
| Models | All three active artifacts load; demo mode remains visibly marked | CNN checkpoint contract and 17 registry tests pass; full runtime trial pending |
| Model evidence | Freeze PCG threshold and add aggregate ECG evaluation | Pending AI-team actions |
| Firmware | Record firmware version, pin map, preflight, sample counters, and finalization | Implementation documented |
| Hardware | Complete PCB bring-up, real-signal, power, and endurance package | Pending measurements |
| MQTT | ACLs restrict topics; device transport uses TLS or approved private network | Production test pending |
| n8n | Import inactive, configure secrets, run success and failure tests | Definitions present; executions pending |
| Deployment | Clean-host Compose start, health checks, restart, load, and restore pass | Docker trial pending |
| Public boundary | Only intended HTTPS entry points exposed; internal services remain private | Configuration review present |
| Demonstration | One successful and controlled-failure session use a common session ID | End-to-end trace pending |

# Appendix H: Test Case and Requirements Traceability Matrix

The matrix distinguishes checks already executed during book preparation from tests that require the final hardware or configured services. A pending result must not be converted to “pass” without retained evidence.

**Table H.1 — Final acceptance test matrix**

| ID | Workstream | Test and acceptance evidence | Status |
|---|---|---|---|
| T-01 | Hardware | Stationary ECG plus lead-off and motion examples with raw data and conditions | Pending |
| T-02 | Hardware | PCG positions plus ambient/handling noise examples with raw data | Pending |
| T-03 | Firmware | Expected versus measured sample counts and no silent overflow | Pending |
| T-04 | MQTT | Published/received chunk reconciliation and explicit incomplete-session result | Pending |
| T-05 | PCG AI | Reproducible held-out report using the exact runtime threshold | Partial; threshold drift remains |
| T-06 | ECG AI | Patient-disjoint confusion matrix, class supports, calibration, and failures | Pending |
| T-07 | CNN AI | Checkpoint, six heads, preprocessing, confusion matrices, registry, and decoding | Active; 17 registry tests pass, runtime cases pending |
| T-08 | Frontend | Type checking and linting complete without errors | Passed |
| T-09 | Frontend | Production build with approved Supabase variables | Pending configuration |
| T-10 | Database | Migration smoke, clean replay, and role/tenant authorization matrix | Failed on duplicate 025; retest required |
| T-11 | Inference | Python compilation and model-registry automated tests | Compilation passed; pytest pending |
| T-12 | n8n | Eight workflows complete success, retry, deduplication, and escalation trials | Pending runtime histories |
| T-13 | Cloud | Clean-host deployment, availability, resource, restart, and restore tests | Pending Docker/cloud environment |
| T-14 | End to end | Correlated start, preflight, streaming, storage, inference, report, and alert trace | Pending physical/configured trial |
| T-15 | Security | Cross-tenant, token, storage, MQTT ACL, secret, and public-port tests | Pending configured environment |
| T-16 | Usability | Representative task completion, errors, assistance, and accessibility review | Pending formative study |

Release acceptance requires the evidence artifact—not only a verbal demonstration—to be linked to the tested source revision, environment, device and firmware revision, model versions, and session identifiers.
