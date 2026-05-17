# AscultiCor / SonoCardia Project Book Table of Contents

AI-Powered Cardiac Auscultation and Real-Time Monitoring Platform

This document is the master thesis/book plan for the CardioSense project. It follows the graduation-project style of `docs/Grad.pdf`, but reorganizes the chapters around the five team workstreams so each team can write its own consecutive block:

- AI
- Frontend and Backend
- IoT and Hardware
- Cloud and DevOps
- n8n Automation

The book still starts with shared foundation chapters and ends with shared evaluation, limitations, conclusion, references, and appendices.

Important hardware note: the final documented design should use ESP32-WROOM-32, AD8232 for ECG, and MAX9814 analog microphone for PCG. Older INMP441 references should be treated only as historical or alternative design notes, not as the final hardware implementation.

Important chart note: use Nano Banana Pro for conceptual diagrams and polished explanatory figures. Do not use it to invent exact numeric charts. Confusion matrices, training curves, accuracy/F1 charts, latency graphs, and performance plots should be generated from real validation data or from existing project artifacts.

---

## Preliminary Pages

### Cover Page

Include the university name, faculty/department, project title, team member table, supervisors, academic year, and project logo or a clean biomedical cover image.

Recommended title:

**AscultiCor / SonoCardia: AI-Powered Cardiac Auscultation and Real-Time Monitoring Platform**

What to write:

- University and faculty information.
- Graduation project title.
- Team members and IDs.
- Supervisors and teaching assistants.
- Academic year.
- A short subtitle: "Real-time ECG and PCG acquisition, AI classification, clinical dashboard, and automated reporting."

### Abstract

What to write:

- Introduce cardiovascular disease and the need for accessible cardiac monitoring.
- Explain that the project combines ECG and PCG sensing using an ESP32 device.
- Summarize the active workstreams: IoT and Hardware, AI, Frontend and Backend, n8n Automation, and Cloud and DevOps.
- Summarize the cloud pipeline: MQTT broker, FastAPI inference service, Supabase backend, Next.js dashboard, n8n automation, and deployment layer.
- Summarize the AI layer: PCG heart sound classification, murmur severity analysis, and ECG arrhythmia classification.
- State that the system is a monitoring and decision-support prototype, not a final medical diagnostic device.

### Acknowledgements

What to write:

- Thank supervisors, university, faculty, families, colleagues, and anyone who supported hardware testing, model training, deployment, automation, or documentation.

### Table of Contents

Use the detailed team-grouped TOC in this document.

### List of Figures

Include all system diagrams, team responsibility maps, hardware diagrams, firmware diagrams, AI model diagrams, workflow diagrams, screenshots, deployment diagrams, charts, and validation figures.

### List of Tables

Include team responsibilities, hardware BOM, pin mapping, software stack, MQTT topic reference, database table reference, model comparison, API endpoint reference, workflow reference, security controls, test scenarios, and environment variable reference.

### List of Abbreviations

Recommended abbreviations:

| Abbreviation | Meaning |
| --- | --- |
| ADC | Analog-to-Digital Converter |
| AI | Artificial Intelligence |
| API | Application Programming Interface |
| BPM | Beats Per Minute |
| CNN | Convolutional Neural Network |
| ECG | Electrocardiogram |
| ERD | Entity Relationship Diagram |
| GPIO | General Purpose Input/Output |
| JWT | JSON Web Token |
| LLM | Large Language Model |
| MQTT | Message Queuing Telemetry Transport |
| PCG | Phonocardiogram |
| PHI | Protected Health Information |
| RLS | Row Level Security |
| SNR | Signal-to-Noise Ratio |
| TLS | Transport Layer Security |
| UI | User Interface |
| XGBoost | Extreme Gradient Boosting |

---

# Main Objectives By Team Workstream

Use this section to divide the book fairly between the team members. Each team should write its own consecutive part, then the final editor should unify formatting, voice, references, figure numbers, and cross-chapter transitions.

| Team Workstream | Main Objective In The Project | Consecutive Book Part | Primary Chapters |
| --- | --- | --- | --- |
| IoT and Hardware | Build the physical sensing device, implement firmware, capture ECG/PCG signals, run preflight checks, and publish data through MQTT. | Part I | Chapters 4, 5, 6 |
| AI | Build the signal-processing, dataset preparation, model training, validation, and deployed inference layer. | Part II | Chapters 7, 8, 9, 10, 11 |
| Frontend and Backend | Build the dashboard, Supabase data model, API routes, session workflow, patient/device/report/alert/admin features, and role-based access. | Part III | Chapters 12, 13, 14, 15 |
| n8n Automation | Build workflow automation, LLM report processing, clinical/device alerts, daily digests, enrichment, and escalation flows. | Part IV | Chapters 16, 17 |
| Cloud and DevOps | Deploy, secure, monitor, and operate the system using Docker, NGINX, cloud VM, environment configuration, backups, and production controls. | Part V | Chapters 18, 19 |

Suggested table in the final book:

- Table 1.1: Team workstreams, main objectives, consecutive book parts, and chapter ownership.

Suggested figure:

- Figure 1.3: Team workstream responsibility map.

---

# Detailed Table of Contents

## Shared Foundation Chapters

These chapters should be written collaboratively before the team-specific parts. They explain the project to the reader before the book moves into individual workstreams.

---

## Chapter 1: Introduction

Primary writers: all teams, with final editing by one document owner.

### 1.1 Background

What to write:

- Explain the importance of cardiovascular monitoring.
- Introduce auscultation, heart sounds, ECG, and PCG.
- Explain why remote and AI-assisted monitoring can help students, clinicians, and engineers analyze cardiac signals.

Suggested figure:

- Figure 1.1: Cardiac monitoring concept overview.

### 1.2 Problem Statement

What to write:

- Manual auscultation depends heavily on clinician experience.
- ECG and PCG signals are often analyzed separately.
- Low-cost hardware can be noisy and difficult to integrate into cloud systems.
- Real-time monitoring requires reliable acquisition, communication, processing, storage, visualization, automation, and deployment.

### 1.3 Project Objectives

What to write:

- Present the project objectives as five team workstreams.
- IoT and Hardware objective: build the ESP32 sensing device, wire ECG/PCG sensors, implement firmware sampling, buffering, preflight checks, provisioning, and MQTT publishing.
- AI objective: design preprocessing, prepare datasets, train/evaluate models, deploy model artifacts, and explain prediction outputs.
- Frontend and Backend objective: build user workflows, API routes, Supabase integration, dashboard pages, reports, sessions, patients, devices, alerts, admin features, and access control.
- n8n Automation objective: automate report processing, clinical/device alerts, digests, enrichment, operations checks, and escalation workflows.
- Cloud and DevOps objective: package, deploy, secure, monitor, and maintain the complete system using Docker, NGINX, cloud VM, Supabase, Mosquitto, and environment configuration.
- End with the shared objective: integrate all workstreams into one real-time cardiac monitoring platform.

Suggested table:

- Table 1.1: Team workstreams, main objectives, consecutive book parts, and chapter ownership.

### 1.4 Team Workstreams And Responsibilities

What to write:

- Explain that the project is divided into five major workstreams: IoT and Hardware, AI, Frontend and Backend, n8n Automation, and Cloud and DevOps.
- For each workstream, describe its deliverables, interfaces with other teams, final artifacts, and how it contributes to the complete platform.
- Explain handoff points:
  - IoT and Hardware publishes device data through MQTT.
  - AI consumes recordings and produces predictions.
  - Frontend and Backend stores sessions and displays results.
  - n8n Automation processes reports and alert workflows.
  - Cloud and DevOps deploys, secures, and monitors the full system.

Suggested figure:

- Figure 1.3: Team workstream responsibility map.

### 1.5 Project Scope

What to write:

- Included: hardware acquisition, firmware, MQTT, backend, AI models, web dashboard, automation, reporting, deployment, and testing.
- Excluded: final medical approval, certified clinical diagnosis, mobile app documentation, and large-scale hospital integration.

### 1.6 Proposed Solution Overview

What to write:

- Describe the full system in one page.
- Use a simple block diagram from sensors to dashboard and automation.

Suggested figure:

- Figure 1.2: High-level AscultiCor / SonoCardia system overview.

### 1.7 Project Contributions

What to write:

- Dual ECG/PCG acquisition using low-cost hardware.
- Real-time MQTT streaming.
- Multi-model AI inference pipeline.
- Multi-tenant Supabase database and dashboard.
- Device management, reports, alerts, and automation.
- Deployable full-stack architecture.

### 1.8 Book Organization

What to write:

- Explain that Chapters 1-3 are shared foundation chapters.
- Explain that Chapters 4-6 are owned by IoT and Hardware.
- Explain that Chapters 7-11 are owned by AI.
- Explain that Chapters 12-15 are owned by Frontend and Backend.
- Explain that Chapters 16-17 are owned by n8n Automation.
- Explain that Chapters 18-19 are owned by Cloud and DevOps.
- Explain that Chapters 20-22 are shared final evaluation and conclusion chapters.

---

## Chapter 2: Medical And Technical Background

Primary writers: AI team, with support from IoT and Hardware for signal-acquisition context.

### 2.1 The Human Heart And Cardiac Cycle

What to write:

- Explain chambers, valves, blood flow, systole, and diastole.
- Connect the cardiac cycle to heart sounds and ECG waves.

Suggested figure:

- Figure 2.1: Heart anatomy and cardiac cycle.

### 2.2 Heart Sounds And PCG

What to write:

- Explain S1, S2, S3, and S4.
- Explain murmurs and abnormal sounds.
- Explain PCG as a recorded representation of auscultation.

Suggested figure:

- Figure 2.2: PCG waveform with S1 and S2 labels.

### 2.3 ECG Basics

What to write:

- Explain P wave, QRS complex, T wave, rhythm, and heart rate.
- Explain how ECG can reveal rhythm abnormalities.

Suggested figure:

- Figure 2.3: ECG waveform with P, QRS, and T labels.

### 2.4 Murmurs And Arrhythmias

What to write:

- Explain common murmur characteristics: timing, shape, grading, pitch, quality, and location.
- Explain common arrhythmia categories at a high level.
- Keep medical statements educational and cite sources.

### 2.5 Biomedical Signal Processing Challenges

What to write:

- Discuss noise, motion artifacts, baseline drift, clipping, sensor placement, sampling rates, and signal quality checks.

### 2.6 AI In Biomedical Signals

What to write:

- Explain why machine learning is useful for pattern recognition in ECG and PCG.
- Briefly introduce XGBoost, CNNs, and BiLSTMs.

### 2.7 Medical Disclaimer

What to write:

- State that the platform is an educational engineering prototype and clinical decision-support system.
- State that it does not replace diagnosis by qualified healthcare professionals.

---

## Chapter 3: Overall System Architecture And Team Responsibilities

Primary writers: Frontend and Backend team, Cloud and DevOps team, and IoT and Hardware team. All teams should review because this chapter connects the complete system.

### 3.1 System Overview

What to write:

- Explain the complete system from sensor acquisition to dashboard visualization and automation.
- Show how all team parts integrate.

Suggested figure:

- Figure 3.1: Overall system architecture.

### 3.2 Stakeholders And Users

What to write:

- Admin: manages organization, devices, users, settings, and audit.
- Clinician/operator: starts sessions and reviews results.
- Read-only user: views dashboards and reports.
- Device: sends signals and status updates.
- Automation worker: processes reports and alerts.

### 3.3 Functional Requirements

What to write:

- Device creation and bootstrap.
- ECG and PCG acquisition.
- Session start/stop control.
- Live waveform display.
- AI prediction storage.
- Patient and session management.
- Reports, alerts, audit logs, saved views, and automated workflows.

### 3.4 Non-Functional Requirements

What to write:

- Security, privacy, latency, reliability, maintainability, deployability, observability, and clear clinical disclaimers.

### 3.5 Technology Stack

What to write:

- Firmware: Arduino/C++ for ESP32.
- Communication: MQTT and Mosquitto.
- Backend/inference: FastAPI and Python.
- Database/auth/storage: Supabase.
- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Automation: n8n and LLM report generation.
- Deployment: Docker Compose, NGINX, cloud VM.

Suggested table:

- Table 3.1: Software and technology stack.

### 3.6 End-To-End Data Flow

What to write:

- Explain device provisioning, session command, data streaming, buffering, model inference, storage, dashboard rendering, report generation, and alert automation.

Suggested figure:

- Figure 3.2: End-to-end session data flow.

### 3.7 Integration Boundaries Between Teams

What to write:

- IoT and Hardware exposes MQTT messages and device telemetry.
- AI exposes model artifacts and inference outputs.
- Frontend and Backend exposes dashboard workflows, API routes, and Supabase data.
- n8n Automation consumes backend endpoints and report queues.
- Cloud and DevOps provides deployment, networking, secrets, and monitoring.

Suggested figure:

- Figure 3.3: Integration boundaries between team workstreams.

---

# Part I: IoT And Hardware

This part should be written as one continuous section by the IoT and Hardware team. It should cover the physical device, sensors, firmware, signal acquisition, provisioning, and MQTT device behavior.

---

## Chapter 4: Hardware Design

Primary writers: IoT and Hardware team.

### 4.1 Hardware Objective

What to write:

- Explain the IoT and Hardware team objective: create a low-cost device capable of capturing ECG and PCG signals and sending them to the cloud in real time.

### 4.2 Hardware Components

What to write:

- ESP32-WROOM-32 as the main microcontroller.
- AD8232 module for ECG acquisition.
- MAX9814 analog microphone module for PCG acquisition.
- Jumper wires, power source, electrodes, microphone placement, and optional enclosure.

Suggested table:

- Table 4.1: Hardware bill of materials.

### 4.3 Sensor Selection

What to write:

- Explain why AD8232 is used for ECG.
- Explain why MAX9814 is used for PCG in the final design.
- Mention INMP441 only as an earlier or alternative microphone option, not as the final documented hardware.

### 4.4 Wiring And Pin Mapping

What to write:

- AD8232:
  VCC to 3.3V, GND to GND, OUT to GPIO32, LO+ to GPIO34, LO- to GPIO35.
- MAX9814:
  VCC to 3.3V, GND to GND, OUT to GPIO33, GAIN to GND, A/R floating.
- Status LED:
  GPIO2.

Suggested figure:

- Figure 4.1: ESP32, AD8232, and MAX9814 wiring diagram.

Suggested table:

- Table 4.2: ESP32 pin mapping.

### 4.5 Physical Assembly And Placement

What to write:

- Explain electrode placement, microphone placement, cable stability, enclosure ideas, and safe handling.
- Add real photos if available.

Suggested figure:

- Figure 4.2: Prototype assembly photo or rendered hardware layout.

### 4.6 Hardware Limitations

What to write:

- Discuss analog noise, electrode placement, microphone contact, power stability, ADC resolution, and clinical-grade limitations.

---

## Chapter 5: Firmware Design

Primary writers: IoT and Hardware team.

### 5.1 Firmware Objective

What to write:

- Explain that the firmware controls WiFi, bootstrap, MQTT, session commands, ECG/PCG acquisition, buffering, preflight checks, metadata publishing, data streaming, heartbeat, and device status.

### 5.2 Firmware Architecture

What to write:

- Explain firmware setup, WiFi connection, bootstrap, MQTT connection, and main loop.
- Explain the separation between ECG sampling, PCG sampling, and MQTT publishing.

Suggested figure:

- Figure 5.1: Firmware architecture overview.

### 5.3 Sampling Strategy

What to write:

- ECG is sampled at 500 Hz.
- PCG is sampled around 22.05 kHz.
- Explain ADC conversion, millivolt conversion, buffers, and chunk sizes.

### 5.4 Hardware Timers And Buffers

What to write:

- Explain ECG hardware timer sampling GPIO32.
- Explain PCG timer sampling GPIO33.
- Explain PCG multi-buffering and how the main loop publishes chunks without blocking acquisition.

Suggested figure:

- Figure 5.2: Firmware timing and buffering architecture.

### 5.5 Signal Quality Preflight

What to write:

- Explain why the device checks signal quality before streaming.
- Mention amplitude, clipping, lead-off detection, and basic quality indicators.

### 5.6 Serial Provisioning And Local Storage

What to write:

- Explain serial commands for WiFi, device ID, device secret, bootstrap URL, status, help, and reboot.
- Explain how credentials are stored locally.

Suggested table:

- Table 5.1: Firmware serial command reference.

### 5.7 LED States And Device Feedback

What to write:

- Explain the status LED behavior for booting, WiFi, MQTT, streaming, error, and preflight states.

### 5.8 Firmware Failure Cases

What to write:

- Discuss WiFi failure, MQTT disconnect, invalid bootstrap credentials, preflight failure, buffer overflow risk, and session timeout.

---

## Chapter 6: MQTT Communication And Device Management

Primary writers: IoT and Hardware team for device behavior and MQTT publishing; Frontend and Backend team for bootstrap APIs and dashboard integration.

### 6.1 MQTT Communication Objective

What to write:

- Explain why MQTT is used for IoT streaming and control.
- Explain broker, publisher, subscriber, topics, payload types, retained status, and real-time behavior.

### 6.2 MQTT Topic Hierarchy

What to write:

- Use the topic root:
  `org/{org_id}/device/{device_id}`.
- Explain:
  `status`, `control`, `session/{session_id}/meta`, `session/{session_id}/pcg`, `session/{session_id}/ecg`, and `session/{session_id}/heartbeat`.

Suggested figure:

- Figure 6.1: MQTT topic tree.

Suggested table:

- Table 6.1: MQTT topic reference.

### 6.3 Device Bootstrap

What to write:

- Explain dashboard device creation.
- Explain device ID, device secret, bootstrap URL, organization ID, MQTT username, and MQTT password.
- Explain why the secret should be shown once and protected.

Suggested figure:

- Figure 6.2: Device bootstrap and provisioning sequence.

### 6.4 Runtime Status And Heartbeat

What to write:

- Explain online/offline status, firmware version, RSSI, heap memory, streaming flag, and timestamps.

### 6.5 Session Command Flow

What to write:

- Explain how the dashboard starts a session.
- Explain how the API publishes MQTT control commands.
- Explain how the device acknowledges by streaming metadata and signal data.

Suggested figure:

- Figure 6.3: Session start sequence diagram.

### 6.6 Reliability And Failure Handling

What to write:

- Discuss MQTT disconnects, stale devices, preflight failure, timeouts, incomplete sessions, cooldowns, and retry behavior.

---

# Part II: Artificial Intelligence

This part should be written as one continuous section by the AI team. It should explain the signal-processing pipeline, datasets, model design, model training, validation, artifacts, and real-time inference behavior.

---

## Chapter 7: Signal Processing And Dataset Preparation

Primary writers: AI team.

### 7.1 AI Objective

What to write:

- Explain that the AI team objective is to convert raw ECG and PCG signals into useful predictions through preprocessing, feature extraction, trained models, and validation.

### 7.2 AI Layer Overview

What to write:

- Explain the three-model design:
  Model 1 for PCG heart sound state, Model 2 for murmur severity, Model 3 for ECG arrhythmia.

Suggested figure:

- Figure 7.1: Three-lane machine learning pipeline.

### 7.3 Datasets

What to write:

- PCG classification data: PASCAL and PhysioNet/CinC heart sound datasets.
- Murmur severity data: CirCor DigiScope dataset.
- ECG arrhythmia data: MIT-BIH Arrhythmia and PTB-related ECG data where applicable.
- Explain dataset limitations and class imbalance.

Suggested table:

- Table 7.1: Dataset summary.

### 7.4 PCG Preprocessing

What to write:

- Explain bandpass filtering, normalization, padding/cropping, feature extraction, and quality considerations.
- Mention features such as MFCC, delta MFCC, chroma, mel statistics, RMS, spectral contrast, flatness, and tonnetz.

Suggested figure:

- Figure 7.2: PCG preprocessing and feature extraction pipeline.

### 7.5 ECG Preprocessing

What to write:

- Explain ECG filtering, baseline correction, normalization, windowing, sample-rate handling, and signal quality concerns.

Suggested figure:

- Figure 7.3: ECG preprocessing pipeline.

### 7.6 Data Augmentation And Class Imbalance

What to write:

- Explain augmentation approaches such as noise, time stretch, pitch shift, signal shift, scaling, and baseline variation where used.
- Explain balancing strategies such as SMOTE, class weights, or sampling.

### 7.7 Preprocessing Versioning

What to write:

- Explain why preprocessing versions matter.
- Document the preprocessing version used by training and inference so the deployed models receive compatible inputs.

---

## Chapter 8: Model 1 - PCG Heart Sound Classification

Primary writers: AI team.

### 8.1 Model 1 Objective

What to write:

- Explain that Model 1 classifies PCG heart sound recordings into high-level states such as normal, murmur, artifact, and extra heart sounds where used.

### 8.2 Input And Output

What to write:

- Input: processed PCG audio features.
- Output: predicted class, confidence, and label mapping.

### 8.3 Feature Extraction

What to write:

- Explain the handcrafted feature vector and why these acoustic features are useful for heart sound classification.

### 8.4 XGBoost Classifier

What to write:

- Explain why XGBoost is suitable for structured feature vectors.
- Explain training, scaling, label encoding, and model artifact saving.

Suggested figure:

- Figure 8.1: Model 1 XGBoost classification pipeline.

### 8.5 Training And Validation

What to write:

- Include training setup, dataset split, balancing, hyperparameter tuning, and validation method.
- Use real metrics only.

Suggested figures:

- Figure 8.2: Model 1 confusion matrix.

### 8.6 Model 1 Limitations

What to write:

- Discuss dataset mismatch, noisy PCG recordings, class imbalance, and limited clinical generalization.

---

## Chapter 9: Model 2 - Murmur Severity Classification

Primary writers: AI team.

### 9.1 Model 2 Objective

What to write:

- Explain that Model 2 analyzes murmur-related PCG characteristics and predicts severity-style descriptors.

### 9.2 Input And Output

What to write:

- Input: PCG recordings converted to log-mel spectrograms.
- Output heads: murmur timing, shape, grading, pitch, quality, location, and murmur presence.

### 9.3 Log-Mel Spectrogram Preparation

What to write:

- Explain waveform-to-spectrogram conversion, fixed input shape, and valve recording aggregation where applicable.

### 9.4 CNN Architecture

What to write:

- Explain convolution blocks, shared dense representation, dropout/regularization, and multi-output heads.

Suggested figure:

- Figure 9.1: Model 2 CNN architecture.

### 9.5 Training And Validation

What to write:

- Explain class balancing, sample weights, training callbacks, validation split, and evaluation method.
- Use real metrics only.

Suggested figures:

- Figure 9.2: Model 2 validation confusion matrices.

### 9.6 Model 2 Limitations

What to write:

- Discuss murmur label complexity, class imbalance, valve recording differences, and need for expert review.

---

## Chapter 10: Model 3 - ECG Arrhythmia Classification

Primary writers: AI team.

### 10.1 Model 3 Objective

What to write:

- Explain that Model 3 classifies ECG windows into arrhythmia-related beat classes and maps results into clinically meaningful categories.

### 10.2 Input And Output

What to write:

- Input: filtered and normalized ECG windows.
- Output: beat class, mapped AAMI category, confidence, and heart-rate estimate where available.

### 10.3 ECG Windowing

What to write:

- Explain sample rate, window size, overlap/step size, beat-centered windows where applicable, and baseline correction.

### 10.4 BiLSTM Architecture

What to write:

- Explain why recurrent layers can model time-series dependencies.
- Explain BiLSTM layers, dense output, label encoding, and saved artifacts.

Suggested figure:

- Figure 10.1: Model 3 BiLSTM ECG classification pipeline.

### 10.5 Training And Validation

What to write:

- Include dataset split, augmentation, balancing, metrics, confusion matrix, and classification report.
- Use real metrics from the latest validation run, not stale training logs.

Suggested figures:

- Figure 10.2: Model 3 confusion matrix.
- Figure 10.3: Model 3 training curves.

### 10.6 Model 3 Limitations

What to write:

- Discuss ECG signal quality, dataset mismatch, sample-rate differences, arrhythmia class imbalance, and clinical validation requirements.

---

## Chapter 11: Real-Time AI Inference Pipeline

Primary writers: AI team for preprocessing/model inference; Frontend and Backend team for service integration and Supabase writes.

### 11.1 Inference Service Objective

What to write:

- Explain that the inference service receives live MQTT data, buffers recordings, computes live metrics, runs models, stores predictions, and updates session status.

### 11.2 FastAPI Service Overview

What to write:

- Explain service startup, health endpoint, model loading, MQTT handler startup, CORS, security headers, and internal-token protected endpoints.

### 11.3 MQTT Ingestion

What to write:

- Explain subscriptions to status, metadata, PCG, ECG, and heartbeat topics.
- Explain message parsing and validation.

### 11.4 Session Buffering

What to write:

- Explain how PCG and ECG chunks are buffered per session.
- Explain buffer size limits and stale session handling.

Suggested figure:

- Figure 11.1: Inference service lifecycle.

### 11.5 Live Metrics And Waveforms

What to write:

- Explain how the service computes live waveform previews, heart rate, RMS, peak values, quality metrics, and stores live metrics.

### 11.6 Finalization And Prediction

What to write:

- Explain how completed PCG and ECG streams are finalized.
- Explain recording upload, prediction creation, murmur severity insertion, and session status updates.

### 11.7 Model Artifact Reference

What to write:

- Explain saved model files, encoders, scalers, configuration files, and how the inference service loads them.

Suggested table:

- Table 11.1: Model artifact reference.

### 11.8 Error Handling

What to write:

- Explain preflight failures, incomplete recordings, timeouts, storage failures, model failures, and audit logging.

---

# Part III: Frontend And Backend

This part should be written as one continuous section by the Frontend and Backend team. It should cover Supabase, APIs, dashboard workflows, session management, reports, alerts, admin tools, and user-facing behavior.

---

## Chapter 12: Supabase Database And Backend Services

Primary writers: Frontend and Backend team, with Cloud and DevOps support for managed services and production configuration.

### 12.1 Backend Objective

What to write:

- Explain that the backend objective is to manage users, organizations, devices, patients, sessions, recordings, predictions, reports, alerts, and audit logs.

### 12.2 Supabase Overview

What to write:

- Explain Supabase Auth, PostgreSQL, Row Level Security, and Storage.

### 12.3 Multi-Tenant Data Model

What to write:

- Explain organizations as the top-level tenant boundary.
- Explain profiles, devices, patients, sessions, recordings, predictions, murmur severity, live metrics, alerts, notes, LLM reports, and audit logs.

Suggested figure:

- Figure 12.1: Supabase ERD.

### 12.4 Authentication And Roles

What to write:

- Explain user authentication.
- Explain organization membership.
- Explain admin, clinician/operator, and read-only access patterns.

### 12.5 Storage Design

What to write:

- Explain how recordings are stored in Supabase Storage.
- Explain PCG WAV files, ECG binary recordings, and metadata rows.

### 12.6 Database Migrations

What to write:

- Summarize the purpose of migrations: initial schema, device management, professional hardening, patients, notes, saved views, roles, settings, LLM retry fields, patient email, device MQTT credentials, and patient MRN generation.

Suggested table:

- Table 12.1: Migration map and purpose.

### 12.7 Audit Logging

What to write:

- Explain why audit logs matter for device creation, session commands, errors, reports, and security events.

---

## Chapter 13: API Routes And Session Management

Primary writers: Frontend and Backend team.

### 13.1 API Objective

What to write:

- Explain that API routes connect authenticated users, devices, sessions, live data, reports, and automation workflows.

### 13.2 Device APIs

What to write:

- Explain device listing, device creation, one-time bootstrap details, device status, device deletion, and role checks.

### 13.3 Bootstrap API

What to write:

- Explain device secret validation, organization lookup, MQTT credential delivery, and security expectations.

### 13.4 Session Start API

What to write:

- Explain session authorization, capture duration validation, MQTT command publishing, acknowledgement waiting, and timeout handling.

### 13.5 Live Session APIs

What to write:

- Explain live JSON polling, SSE streaming, waveform previews, no-store behavior, and fallback preview generation.

### 13.6 Summary And Report APIs

What to write:

- Explain session summary, report queueing, report retrieval, and patient-safe output.

### 13.7 n8n Workflow API Integration

What to write:

- Explain how automation routes are protected and how workflows interact with backend data.

Suggested table:

- Table 13.1: Backend API endpoint summary.

---

## Chapter 14: Web Dashboard And User Interface

Primary writers: Frontend and Backend team.

### 14.1 Frontend Objective

What to write:

- Explain that the frontend objective is to provide a professional dashboard for device monitoring, patient/session management, live signals, AI results, reports, alerts, admin tools, and settings.

### 14.2 Frontend Technology Stack

What to write:

- Explain Next.js, React, TypeScript, Tailwind CSS, Supabase client usage, Recharts, icons, PDF export, and UI components.

### 14.3 Authentication And Layout

What to write:

- Explain login, protected pages, top bar, theme provider, toast provider, and error boundary.

### 14.4 Main Dashboard

What to write:

- Explain device statistics, online devices, predictions, latency, recent sessions, live ECG/PCG panels, and 3D heart visualization.

Suggested figure:

- Figure 14.1: Main dashboard screenshot.

### 14.5 Device Management UI

What to write:

- Explain device list, device creation, one-time bootstrap credentials, device details, status, and deletion.

Suggested figure:

- Figure 14.2: Device management workflow.

### 14.6 Patient And Session UI

What to write:

- Explain patient CRUD, new session flow, session filters, saved views, patient selection, notes, and capture duration.

Suggested figure:

- Figure 14.3: New session workflow.

### 14.7 Live Session View

What to write:

- Explain live waveform monitor, polling/SSE behavior, session progress, model cards, and recording previews.

Suggested figure:

- Figure 14.4: Live session waveform display.

### 14.8 UI Limitations And Improvements

What to write:

- Discuss possible UI improvements: accessibility, mobile responsiveness, better empty states, richer filtering, and clinical workflows.

---

## Chapter 15: Reports, Patients, Devices, Alerts, And Admin Features

Primary writers: Frontend and Backend team.

### 15.1 Feature Objective

What to write:

- Explain that this chapter documents the user-facing workflows that make the platform usable in practice.

### 15.2 Patient Management

What to write:

- Explain patient creation, editing, identifiers, email field where available, patient-session relationship, and privacy concerns.

### 15.3 Device Management

What to write:

- Explain device lifecycle from creation to bootstrap, live status, telemetry, and deletion.

### 15.4 Session Management

What to write:

- Explain session creation, filtering, saved views, notes, status transitions, summaries, and live monitoring.

### 15.5 Reports

What to write:

- Explain session summaries, model outputs, PDF export, report generation, and patient-safe wording.

### 15.6 Alerts

What to write:

- Explain device alerts, clinical alerts, resolving alerts, and dashboard notification patterns.

### 15.7 Admin And Audit Features

What to write:

- Explain admin page, audit logs, role restrictions, settings, retention, and de-identification options.

Suggested figure:

- Figure 15.1: Dashboard feature map.

---

# Part IV: n8n Automation

This part should be written as one continuous section by the n8n Automation team. It should cover automated report processing, alerts, device health checks, digests, workflow security, and escalation.

---

## Chapter 16: LLM Report Generation

Primary writers: n8n Automation team, with Frontend and Backend support for report APIs.

### 16.1 Report Automation Objective

What to write:

- Explain that the automation objective is to reduce manual follow-up by queueing, processing, storing, and notifying report outputs.

### 16.2 LLM Report Queue

What to write:

- Explain report queue, requested user, rate limits, retries, internal token, provider selection, and demo fallback.
- Explain that reports are AI-assisted summaries and must not replace clinical judgement.

Suggested figure:

- Figure 16.1: LLM report generation workflow.

### 16.3 Report Content

What to write:

- Explain how reports can include patient/session metadata, model predictions, signal quality, observations, and recommendations for clinician review.

### 16.4 LLM Safety And Limitations

What to write:

- Explain disclaimers, avoiding definitive diagnosis, checking model outputs, and protecting sensitive data.

### 16.5 Report Failure Handling

What to write:

- Explain retry behavior, failed report state, provider errors, rate limits, and audit logging.

---

## Chapter 17: n8n Workflows, Alerts, Digests, And Escalation

Primary writers: n8n Automation team, with Cloud and DevOps support for deployment/security.

### 17.1 n8n Workflow Overview

What to write:

- Explain n8n as workflow automation.
- Summarize workflows for pending reports, clinical alerts, device health, daily digest, recording summary enrichment, operations monitoring, and alert escalation.

Suggested figure:

- Figure 17.1: n8n automation workflow map.

### 17.2 Clinical Alert Workflow

What to write:

- Explain how prediction results and session data can trigger clinical alert notifications.

### 17.3 Device Health Workflow

What to write:

- Explain how stale devices, offline devices, weak signal, or repeated failures can generate operational alerts.

### 17.4 Daily Digest Workflow

What to write:

- Explain how daily summaries can combine sessions, reports, alerts, and device status.

### 17.5 Recording Summary Enrichment

What to write:

- Explain how automation can enrich summaries after recordings are complete.

### 17.6 Operations Monitoring And Escalation

What to write:

- Explain escalation logic, repeated alert handling, workflow logs, and notification channels.

### 17.7 Automation Security

What to write:

- Explain internal tokens, rate limits, least privilege, and avoiding exposure of sensitive patient information.

Suggested table:

- Table 17.1: n8n workflow reference.

---

# Part V: Cloud And DevOps

This part should be written as one continuous section by the Cloud and DevOps team. It should cover security, privacy, deployment, operations, monitoring, backups, and production readiness.

---

## Chapter 18: Security, Privacy, And Compliance

Primary writers: Cloud and DevOps team, with Frontend and Backend support for authentication/RLS and IoT and Hardware support for device security.

### 18.1 Security Objective

What to write:

- Explain that the security objective is to protect patient data, isolate organizations, secure devices, protect service-role credentials, and audit sensitive actions.

### 18.2 Authentication And Authorization

What to write:

- Explain Supabase Auth, user profiles, organization membership, roles, and route protection.

### 18.3 Row Level Security

What to write:

- Explain organization-scoped RLS policies and why service-role access is restricted to backend services.

Suggested figure:

- Figure 18.1: Security and organization isolation model.

### 18.4 Device Security

What to write:

- Explain device secrets, bootstrap flow, MQTT username/password, credential rotation considerations, and TLS/VPN recommendations.

### 18.5 API And Application Security

What to write:

- Explain rate limiting, CORS, security headers, internal tokens, environment variables, and input validation.

### 18.6 Privacy And Data Retention

What to write:

- Explain PHI handling, de-identification options, retention settings, audit logs, and backups.

### 18.7 Incident Response

What to write:

- Explain how to respond to leaked keys, compromised devices, suspicious audit events, and exposed patient data.

Suggested table:

- Table 18.1: Security control checklist.

---

## Chapter 19: Deployment, Docker, NGINX, Cloud VM, And Operations

Primary writers: Cloud and DevOps team.

### 19.1 DevOps Objective

What to write:

- Explain that the DevOps objective is to make the platform reproducible, deployable, secure, observable, and maintainable.

### 19.2 Local Development Environment

What to write:

- Explain environment variables, Docker Compose, frontend service, inference service, Mosquitto, Supabase connection, n8n, and local testing.

### 19.3 Docker Compose Architecture

What to write:

- Explain container responsibilities and service communication.

Suggested figure:

- Figure 19.1: Local Docker Compose deployment.

### 19.4 Cloud VM Deployment

What to write:

- Explain cloud VM, NGINX reverse proxy, TLS, managed Supabase, n8n, Mosquitto, and public/private network boundaries.

Suggested figure:

- Figure 19.2: Cloud deployment architecture.

### 19.5 Environment Variables

What to write:

- Document variable names and purpose only.
- Do not include real secret values.

Suggested table:

- Table 19.1: Environment variable reference.

### 19.6 Monitoring And Logs

What to write:

- Explain service logs, health endpoints, MQTT connection status, model load status, device last seen timestamps, workflow logs, and audit logs.

### 19.7 Backup And Maintenance

What to write:

- Explain database backups, storage backups, credential rotation, deployment updates, workflow backup, and model artifact versioning.

### 19.8 Production Checklist

What to write:

- Include TLS, secure MQTT, RLS checks, service-role protection, rate limits, backups, monitoring, device credential policy, workflow token protection, and clinical disclaimer.

---

# Part VI: Final Evaluation

These chapters are shared. Each team should write its own evidence and limitations first, then the final editor should merge them into one consistent evaluation and conclusion.

---

## Chapter 20: Testing, Validation, And Results

Primary writers: all teams. Each team should write its own validation subsection, then combine the results into one final testing chapter.

### 20.1 Testing Strategy

What to write:

- Explain firmware testing, MQTT testing, backend testing, AI validation, dashboard testing, automation testing, deployment validation, and end-to-end testing.

Suggested figure:

- Figure 20.1: Testing and validation workflow.

### 20.2 IoT And Hardware Validation

What to write:

- Include sensor wiring tests, serial provisioning tests, ECG/PCG sampling checks, MQTT publishing tests, preflight behavior, signal quality tests, and hardware limitations.

### 20.3 AI Validation

What to write:

- Include dataset validation, preprocessing checks, model metrics, confusion matrices, classification reports, and model limitations.

Suggested figures:

- Figure 20.2: Model 1 confusion matrix.
- Figure 20.3: Model 2 validation results.
- Figure 20.4: Model 3 confusion matrix.
- Figure 20.5: Training curves.

### 20.4 Frontend And Backend Validation

What to write:

- Include API route tests, dashboard workflow checks, session creation, patient/device management, reports, alerts, and role-based access tests.

### 20.5 n8n Automation Validation

What to write:

- Include workflow execution tests, internal-token checks, report queue processing, alert generation, daily digest, escalation logic, and failure/retry behavior.

### 20.6 Cloud And DevOps Validation

What to write:

- Include Docker startup, cloud deployment checks, NGINX routing, TLS, health endpoints, environment validation, backup/monitoring checks, and production readiness.

### 20.7 End-To-End Testing

What to write:

- Explain how a session flows through MQTT, inference, Supabase, dashboard, reports, automation, and deployment checks.
- Include expected database rows and dashboard outputs.

Suggested figures:

- Figure 20.6: End-to-end latency chart.
- Figure 20.7: Session success/failure summary.

### 20.8 Test Case Matrix

What to write:

- List test cases, expected result, actual result, responsible team, evidence, and status.

Suggested tables:

- Table 20.1: Test case matrix.
- Table 20.2: Team validation responsibility matrix.

### 20.9 Discussion Of Results

What to write:

- Explain what worked well, what failed, what was fixed, and what needs improvement.

---

## Chapter 21: Limitations And Future Work

Primary writers: all teams. Each team should document limitations and future improvements for its own subsystem.

### 21.1 IoT And Hardware Limitations

What to write:

- Discuss analog noise, electrode placement, microphone placement, enclosure design, power stability, ADC limitations, and clinical-grade sensor limitations.

### 21.2 AI Limitations

What to write:

- Discuss dataset limitations, model generalization, class imbalance, ECG model limitations, PCG noise, and need for medical validation.

### 21.3 Frontend And Backend Limitations

What to write:

- Discuss UI improvements, accessibility, mobile responsiveness, richer filtering, clinical workflows, report polish, and API hardening.

### 21.4 n8n Automation Limitations

What to write:

- Discuss workflow reliability, notification routing, LLM safety, report review, alert fatigue, and retry policies.

### 21.5 Cloud And DevOps Limitations

What to write:

- Discuss cloud dependency, network reliability, MQTT security setup, storage costs, monitoring depth, backup policy, and production compliance requirements.

### 21.6 Future Improvements

What to write:

- Better enclosure and PCB.
- Better signal conditioning.
- Larger clinical datasets.
- FHIR/HL7 integration.
- Managed IoT broker.
- More robust clinician review workflow.
- Model version tracking and rollback.
- Better alert rules and report validation.
- Production monitoring and incident response improvements.

Suggested figure:

- Figure 21.1: Future work roadmap.

### 21.7 Ethical Considerations

What to write:

- Discuss responsible AI, privacy, bias, explainability, and clinician oversight.

---

## Chapter 22: Conclusion

Primary writers: all teams, with final editing by one document owner.

### 22.1 Project Summary

What to write:

- Summarize the complete platform and how the team parts work together.

### 22.2 Achieved Objectives

What to write:

- Match objectives from Chapter 1 to implemented features in each team part.

### 22.3 Team Contributions

What to write:

- Summarize the contribution of IoT and Hardware, AI, Frontend and Backend, n8n Automation, and Cloud and DevOps.

### 22.4 Final Remarks

What to write:

- Emphasize engineering value, educational value, and future clinical potential.

---

## References

What to include:

- Cardiovascular and auscultation references.
- ECG and PCG signal processing references.
- PASCAL/PhysioNet/CinC, CirCor, MIT-BIH, and PTB dataset references.
- ESP32, AD8232, and MAX9814 documentation.
- MQTT and Mosquitto references.
- Supabase, FastAPI, Next.js, TensorFlow/Keras, XGBoost, n8n, Docker, and NGINX references.
- Security and privacy references.

---

## Appendices

### Appendix A: Team Contribution Matrix

Include workstream, members, responsibility, chapters, deliverables, and evidence.

### Appendix B: Hardware Bill Of Materials

Include final hardware list, estimated cost, purpose, and notes.

### Appendix C: Wiring And Pin Mapping

Include detailed pin table and wiring diagram.

### Appendix D: Firmware Serial Commands

Include provisioning commands, status commands, reboot commands, and expected responses.

### Appendix E: MQTT Topic And Payload Reference

Include topic names, direction, payload type, example JSON, and notes.

### Appendix F: AI Model Artifact Reference

Include model file names, encoders, scalers, configuration files, preprocessing version, and expected input/output.

### Appendix G: Database Schema Reference

Include key tables, important columns, relationships, and RLS notes.

### Appendix H: API Endpoint Reference

Include route, method, authentication, input, output, and purpose.

### Appendix I: n8n Workflow Reference

Include workflow name, trigger, API endpoint, input, output, retry behavior, and owner.

### Appendix J: Environment Variable Reference

Include variable names and descriptions only. Never include real values.

### Appendix K: Deployment Commands

Include Docker Compose commands, migration commands, device bootstrap instructions, and cloud deployment notes.

### Appendix L: Testing And Troubleshooting

Include common firmware, MQTT, AI, dashboard, Supabase, n8n, and deployment problems.

### Appendix M: Screenshots And Generated Figures

Include final UI screenshots, generated diagrams, exact chart images, and hardware photos.

---

# Suggested Tables

| Table ID | Location | Title | Content |
| --- | --- | --- | --- |
| Table 1.1 | Chapter 1.3 and Chapter 1.4 | Team Workstreams, Main Objectives, And Chapter Ownership | IoT and Hardware, AI, Frontend and Backend, n8n Automation, Cloud and DevOps |
| Table 3.1 | Chapter 3.5 | Software And Technology Stack | Firmware, communication, backend, database, frontend, automation, deployment |
| Table 4.1 | Chapter 4.2 | Hardware Bill Of Materials | ESP32, AD8232, MAX9814, electrodes, wires, power, enclosure |
| Table 4.2 | Chapter 4.4 | ESP32 Pin Mapping | Sensor pins, GPIO numbers, direction, notes |
| Table 5.1 | Chapter 5.6 | Firmware Serial Command Reference | Command, purpose, example, expected result |
| Table 6.1 | Chapter 6.2 | MQTT Topic Reference | Topic, publisher, subscriber, payload type, purpose |
| Table 7.1 | Chapter 7.3 | Dataset Summary | Dataset, signal type, task, labels, limitations |
| Table 11.1 | Chapter 11.7 | Model Artifact Reference | Model, files, input, output, service usage |
| Table 12.1 | Chapter 12.6 | Migration Map | Migration number, feature, affected tables |
| Table 13.1 | Chapter 13.7 | Backend API Endpoint Summary | Endpoint, method, auth, purpose |
| Table 17.1 | Chapter 17.7 | n8n Workflow Reference | Workflow, trigger, endpoint, output, retry/failure behavior |
| Table 18.1 | Chapter 18.7 | Security Control Checklist | Control, implementation, risk reduced |
| Table 19.1 | Chapter 19.5 | Environment Variable Reference | Variable name, service, purpose, secret/non-secret |
| Table 20.1 | Chapter 20.8 | Test Case Matrix | Test case, responsible team, expected result, actual result, status |
| Table 20.2 | Chapter 20.8 | Team Validation Responsibility Matrix | Team, tests performed, evidence, result, limitations |

---

# Figures And Chart Locations

| Figure ID | Location | Figure Title | Source Type |
| --- | --- | --- | --- |
| Figure 1.1 | Chapter 1.1 | Cardiac Monitoring Concept Overview | Nano Banana Pro |
| Figure 1.2 | Chapter 1.6 | High-Level System Overview | Nano Banana Pro |
| Figure 1.3 | Chapter 1.4 | Team Workstream Responsibility Map | Nano Banana Pro |
| Figure 2.1 | Chapter 2.1 | Heart Anatomy And Cardiac Cycle | Nano Banana Pro or medical reference redrawing |
| Figure 2.2 | Chapter 2.2 | PCG Waveform With S1/S2 | Real signal plot or Nano Banana Pro concept |
| Figure 2.3 | Chapter 2.3 | ECG Waveform With P-QRS-T | Real signal plot or Nano Banana Pro concept |
| Figure 3.1 | Chapter 3.1 | Overall System Architecture | Nano Banana Pro |
| Figure 3.2 | Chapter 3.6 | End-To-End Session Data Flow | Nano Banana Pro |
| Figure 3.3 | Chapter 3.7 | Integration Boundaries Between Team Workstreams | Nano Banana Pro |
| Figure 4.1 | Chapter 4.4 | Hardware Wiring Diagram | Nano Banana Pro |
| Figure 4.2 | Chapter 4.5 | Prototype Assembly Photo Or Hardware Layout | Real photo or Nano Banana Pro |
| Figure 5.1 | Chapter 5.2 | Firmware Architecture Overview | Nano Banana Pro |
| Figure 5.2 | Chapter 5.4 | Firmware Timing And Buffering | Nano Banana Pro |
| Figure 6.1 | Chapter 6.2 | MQTT Topic Tree | Nano Banana Pro |
| Figure 6.2 | Chapter 6.3 | Device Bootstrap Sequence | Nano Banana Pro |
| Figure 6.3 | Chapter 6.5 | Session Start Sequence Diagram | Nano Banana Pro |
| Figure 7.1 | Chapter 7.2 | Three-Lane ML Pipeline | Nano Banana Pro |
| Figure 7.2 | Chapter 7.4 | PCG Preprocessing Pipeline | Nano Banana Pro |
| Figure 7.3 | Chapter 7.5 | ECG Preprocessing Pipeline | Nano Banana Pro |
| Figure 8.1 | Chapter 8.4 | Model 1 XGBoost Pipeline | Nano Banana Pro |
| Figure 8.2 | Chapter 8.5 | Model 1 Confusion Matrix | Real validation output |
| Figure 9.1 | Chapter 9.4 | Model 2 CNN Architecture | Nano Banana Pro |
| Figure 9.2 | Chapter 9.5 | Model 2 Validation Confusion Matrices | Real validation output |
| Figure 10.1 | Chapter 10.4 | Model 3 BiLSTM Pipeline | Nano Banana Pro |
| Figure 10.2 | Chapter 10.5 | Model 3 Confusion Matrix | Real validation output |
| Figure 10.3 | Chapter 10.5 | Model 3 Training Curves | Real training output |
| Figure 11.1 | Chapter 11.4 | Inference Service Lifecycle | Nano Banana Pro |
| Figure 12.1 | Chapter 12.3 | Supabase Database ERD | Nano Banana Pro or database diagram tool |
| Figure 14.1 | Chapter 14.4 | Main Dashboard Screenshot | Real screenshot |
| Figure 14.2 | Chapter 14.5 | Device Management Workflow | Nano Banana Pro or real screenshots |
| Figure 14.3 | Chapter 14.6 | New Session Workflow | Nano Banana Pro or real screenshots |
| Figure 14.4 | Chapter 14.7 | Live Session Waveform Display | Real screenshot |
| Figure 15.1 | Chapter 15.7 | Dashboard Feature Map | Nano Banana Pro |
| Figure 16.1 | Chapter 16.2 | LLM Report Generation Workflow | Nano Banana Pro |
| Figure 17.1 | Chapter 17.1 | n8n Automation Workflow Map | Nano Banana Pro |
| Figure 18.1 | Chapter 18.3 | Security And Organization Isolation | Nano Banana Pro |
| Figure 19.1 | Chapter 19.3 | Local Docker Compose Deployment | Nano Banana Pro |
| Figure 19.2 | Chapter 19.4 | Cloud Deployment Architecture | Nano Banana Pro |
| Figure 20.1 | Chapter 20.1 | Testing And Validation Workflow | Nano Banana Pro |
| Figure 20.2 | Chapter 20.3 | Model 1 Confusion Matrix | Real validation output |
| Figure 20.3 | Chapter 20.3 | Model 2 Validation Results | Real validation output |
| Figure 20.4 | Chapter 20.3 | Model 3 Confusion Matrix | Real validation output |
| Figure 20.5 | Chapter 20.3 | Training Curves | Real training output |
| Figure 20.6 | Chapter 20.7 | End-To-End Latency Chart | Real measured data |
| Figure 20.7 | Chapter 20.7 | Session Success/Failure Summary | Real test summary |
| Figure 21.1 | Chapter 21.6 | Future Work Roadmap | Nano Banana Pro |

---

# Nano Banana Pro Prompts

Use the prompts below exactly, then manually verify labels and technical accuracy before placing the images in the book.

## Prompt 1: Cardiac Monitoring Concept Overview

Location: Figure 1.1, Chapter 1.1.

```text
Create a clean academic biomedical engineering illustration for a graduation thesis. Show a patient being monitored by a low-cost cardiac device that captures ECG and heart sounds, sends data to the cloud, and displays results on a clinician dashboard. Use a white background, soft medical colors, clear lines, and simple labels: Patient, ECG, PCG, IoT Device, Cloud AI, Dashboard. Do not include fake numbers or diagnosis text.
```

## Prompt 2: High-Level AscultiCor / SonoCardia System Overview

Location: Figure 1.2, Chapter 1.6.

```text
Create a high-level system overview diagram titled "AscultiCor / SonoCardia". Show ESP32 cardiac device on the left, MQTT broker in the middle, FastAPI inference service, Supabase database and storage, Next.js clinical dashboard, n8n automation, LLM reporting, and cloud deployment layer. Use simple blocks and arrows. White background, thesis style, readable labels only.
```

## Prompt 3: Team Workstream Responsibility Map

Location: Figure 1.3, Chapter 1.4.

```text
Create a clean graduation thesis responsibility map for the project "AscultiCor / SonoCardia". Put the project name in the center. Around it, show five team workstreams in this order: IoT and Hardware, AI, Frontend and Backend, n8n Automation, Cloud and DevOps. For IoT and Hardware, show ESP32, AD8232 ECG, MAX9814 PCG, firmware, MQTT. For AI, show datasets, preprocessing, models, validation, inference. For Frontend and Backend, show dashboard, APIs, Supabase, patients, sessions, reports. For n8n Automation, show workflows, LLM reports, alerts, daily digest, escalation. For Cloud and DevOps, show Docker, NGINX, cloud VM, security, monitoring. Use a white background, professional academic style, and readable labels only.
```

## Prompt 4: Heart Anatomy And Cardiac Cycle

Location: Figure 2.1, Chapter 2.1.

```text
Create a simple educational medical diagram of the human heart and cardiac cycle for an engineering thesis. Show four chambers, main valves, systole, diastole, and where heart sounds S1 and S2 occur. Use accurate but simplified anatomy, white background, clear labels, no diagnosis claims.
```

## Prompt 5: PCG Waveform With S1 And S2

Location: Figure 2.2, Chapter 2.2.

```text
Create a clean conceptual phonocardiogram waveform diagram. Show repeating heart sound waveform peaks labeled S1 and S2, with systole between S1 and S2 and diastole between S2 and next S1. White background, black waveform, red label for S1, blue label for S2. Do not include numeric clinical values.
```

## Prompt 6: ECG Waveform With P-QRS-T Labels

Location: Figure 2.3, Chapter 2.3.

```text
Create a clean conceptual ECG waveform diagram. Show a normal ECG cycle with labels P wave, QRS complex, T wave, PR interval, ST segment, and R peak. White background, dark waveform, readable academic labels. Do not include fake patient data.
```

## Prompt 7: Overall System Architecture

Location: Figure 3.1, Chapter 3.1.

```text
Create a clean academic system architecture diagram for a graduation thesis titled "AscultiCor / SonoCardia". White background, professional biomedical engineering style. Show AD8232 ECG sensor and MAX9814 PCG microphone connected to ESP32-WROOM-32. The ESP32 sends data over WiFi using MQTT to Mosquitto broker. FastAPI inference service subscribes to MQTT. ML models process ECG and PCG. Supabase stores auth, database rows, and recordings. Next.js dashboard displays live waveforms and reports. n8n and LLM service generate automation and reports. Cloud and DevOps layer provides Docker, NGINX, TLS, monitoring, and deployment. Use clear arrows and only these labels.
```

## Prompt 8: End-To-End Session Data Flow

Location: Figure 3.2, Chapter 3.6.

```text
Create an end-to-end data flow diagram for a cardiac monitoring session. Steps: clinician starts session in dashboard, API publishes MQTT control command, ESP32 runs signal preflight, device publishes ECG and PCG metadata, device streams ECG and PCG chunks, FastAPI buffers signals, ML models generate predictions, Supabase stores recordings and results, dashboard displays live waveform and summary report, n8n automation processes reports and alerts. Use numbered arrows, clean white background, academic style.
```

## Prompt 9: Integration Boundaries Between Team Workstreams

Location: Figure 3.3, Chapter 3.7.

```text
Create an integration-boundaries diagram for a five-team graduation project. Show five horizontal lanes: IoT and Hardware, AI, Frontend and Backend, n8n Automation, Cloud and DevOps. Show handoffs: IoT publishes MQTT data; AI consumes recordings and returns predictions; Frontend and Backend manages Supabase, APIs, dashboard, sessions, and reports; n8n consumes workflow APIs for reports, alerts, digests, and escalation; Cloud and DevOps provides Docker, NGINX, TLS, environment variables, monitoring, and backups. White background, clean arrows, readable labels.
```

## Prompt 10: Hardware Wiring Diagram

Location: Figure 4.1, Chapter 4.4.

```text
Create a hardware wiring diagram for an ESP32-WROOM-32 cardiac monitoring device. Show AD8232 ECG module connected as follows: VCC to 3.3V, GND to GND, OUT to GPIO32, LO+ to GPIO34, LO- to GPIO35. Show MAX9814 microphone connected as follows: VCC to 3.3V, GND to GND, OUT to GPIO33, GAIN to GND, A/R floating. Show status LED on GPIO2. Clean white technical diagram, readable pin labels, no extra components, no invented connections.
```

## Prompt 11: Prototype Assembly Photo-Style Figure

Location: Figure 4.2, Chapter 4.5.

```text
Create a realistic but clean educational hardware prototype illustration for a graduation thesis. Show ESP32-WROOM-32 on a breadboard connected to AD8232 ECG module with electrode leads and MAX9814 microphone module for PCG. Include simple labels for ESP32, AD8232, ECG electrodes, MAX9814, USB power, and status LED. White desk background, neat wiring, no extra sensors, no fake brand names.
```

## Prompt 12: Firmware Architecture Overview

Location: Figure 5.1, Chapter 5.2.

```text
Create a firmware architecture overview for ESP32 cardiac monitoring. Show modules: boot setup, serial provisioning, WiFi connection, HTTPS bootstrap, MQTT connection, control command handler, ECG sampler, PCG sampler, signal preflight, metadata publisher, chunk publisher, heartbeat publisher, status LED, and local credential storage. White background, embedded-systems thesis style.
```

## Prompt 13: Firmware Timing And Buffering Architecture

Location: Figure 5.2, Chapter 5.4.

```text
Create a firmware timing and buffering diagram for ESP32 cardiac acquisition. Show ECG hardware timer sampling GPIO32 at 500 Hz into ECG buffer. Show PCG hardware timer sampling GPIO33 at approximately 22.05 kHz into a multi-buffer queue. Show main loop handling WiFi, MQTT, session control, preflight quality checks, metadata publishing, ECG chunk publishing, PCG chunk publishing, heartbeat publishing, and status LED. White background, embedded-systems style.
```

## Prompt 14: MQTT Topic Tree

Location: Figure 6.1, Chapter 6.2.

```text
Create an MQTT topic tree diagram. Root: org/{org_id}/device/{device_id}. Branches: status, control, session/{session_id}/meta, session/{session_id}/pcg, session/{session_id}/ecg, session/{session_id}/heartbeat. Add small icons for retained status, control command, metadata JSON, binary PCG chunks, binary ECG chunks, and heartbeat JSON. Minimal white background, readable labels.
```

## Prompt 15: Device Bootstrap Sequence

Location: Figure 6.2, Chapter 6.3.

```text
Create a device bootstrap sequence diagram for AscultiCor / SonoCardia. Actors: Admin Dashboard, Supabase/API, ESP32 Device, MQTT Broker. Steps: admin creates device, API generates device ID and secret, dashboard displays one-time bootstrap details, technician enters credentials over serial, ESP32 calls bootstrap endpoint, API validates secret, API returns organization ID and MQTT credentials, ESP32 connects to MQTT and publishes status. White background, academic sequence diagram style.
```

## Prompt 16: Session Start Sequence Diagram

Location: Figure 6.3, Chapter 6.5.

```text
Create a sequence diagram for starting a cardiac recording session. Actors: Clinician Dashboard, Next.js API, MQTT Broker, ESP32 Device, FastAPI Inference, Supabase. Steps: clinician creates session, API publishes start command, MQTT broker delivers command, ESP32 runs preflight, ESP32 publishes start_pcg and start_ecg metadata, ESP32 streams PCG and ECG chunks, FastAPI buffers and analyzes, Supabase stores live metrics and final predictions, dashboard updates session status. Clean thesis style.
```

## Prompt 17: Three-Lane Machine Learning Pipeline

Location: Figure 7.1, Chapter 7.2.

```text
Create a machine learning pipeline diagram with three lanes. Lane 1: PCG audio -> preprocessing -> handcrafted features -> scaler -> XGBoost -> heart sound class. Lane 2: PCG audio -> log-mel spectrogram -> CNN -> murmur timing, shape, grading, pitch, quality, location, and presence. Lane 3: ECG signal -> filtering and windowing -> BiLSTM -> arrhythmia class and AAMI mapping. Professional thesis figure, white background.
```

## Prompt 18: PCG Preprocessing Pipeline

Location: Figure 7.2, Chapter 7.4.

```text
Create a signal preprocessing infographic for PCG. Show raw heart sound waveform, bandpass filter 20-400 Hz, normalize, pad or crop to fixed duration, extract MFCC, delta MFCC, chroma, mel statistics, RMS, spectral contrast, flatness, and tonnetz, then feed the feature vector into a classifier. Clean biomedical signal-processing style, white background.
```

## Prompt 19: ECG Preprocessing Pipeline

Location: Figure 7.3, Chapter 7.5.

```text
Create an ECG preprocessing diagram. Show raw ECG waveform, bandpass filtering 0.5-50 Hz, baseline correction, normalization, overlapping windows, quality check, and prepared ECG segments for model inference. White background, black waveform, clean academic labels.
```

## Prompt 20: Model 1 XGBoost Pipeline

Location: Figure 8.1, Chapter 8.4.

```text
Create a Model 1 pipeline diagram for PCG heart sound classification. Show input PCG WAV, preprocessing, feature extraction, feature scaling, XGBoost classifier, and output labels: normal, murmur, artifact, extra heart sound. Use clean blocks, arrows, white background, and academic style. Do not add performance numbers.
```

## Prompt 21: Model 2 CNN Architecture

Location: Figure 9.1, Chapter 9.4.

```text
Create a CNN architecture diagram for murmur severity classification. Show PCG recordings converted into log-mel spectrograms, optional valve recording aggregation, convolution blocks labeled 32, 64, 128, 256 filters, shared dense representation, and multiple output heads: timing, shape, grading, pitch, quality, location, murmur present. White background, clean deep-learning architecture style.
```

## Prompt 22: Model 3 BiLSTM ECG Classification Pipeline

Location: Figure 10.1, Chapter 10.4.

```text
Create an ECG arrhythmia classification diagram. Show ECG stream, resampling or alignment to 360 Hz, filtering, 300-sample windows, BiLSTM layers, dense classifier, beat class output, AAMI mapping, and heart rate estimate. White background, readable labels, no fake metrics.
```

## Prompt 23: Inference Service Lifecycle

Location: Figure 11.1, Chapter 11.4.

```text
Create a real-time inference service lifecycle diagram. Show FastAPI startup, model loading, MQTT connection, topic subscriptions, message callbacks, session buffer creation, live waveform metrics, PCG and ECG chunk collection, timeout monitor, storage upload, ML prediction, database insert, audit log, and dashboard update. Use numbered flow arrows and backend-service styling.
```

## Prompt 24: Supabase Database ERD

Location: Figure 12.1, Chapter 12.3.

```text
Create a Supabase database ERD for AscultiCor / SonoCardia. Main tables: organizations, profiles, devices, patients, sessions, recordings, predictions, murmur_severity, live_metrics, session_notes, llm_reports, device_alerts, device_telemetry, device_settings, audit_logs, saved_views, org_settings. Show relationships: organization owns profiles, devices, patients, and sessions; session belongs to device and patient; session has recordings, predictions, live_metrics, notes, and reports; device has telemetry, settings, and alerts. Clean readable ERD, white background.
```

## Prompt 25: Dashboard Workflow

Location: Figure 14.2 and Figure 14.3, Chapter 14.

```text
Create a web dashboard workflow diagram for a clinical IoT monitoring platform. Show login, dashboard overview, device management, patient management, new session, live waveform monitor, AI model cards, reports page, alerts page, admin audit page, and settings page. Use a modern clinical dashboard style, but keep it as a diagram, not a marketing page.
```

## Prompt 26: Dashboard Feature Map

Location: Figure 15.1, Chapter 15.7.

```text
Create a dashboard feature map for AscultiCor / SonoCardia. Show five grouped areas: Patients, Devices, Sessions, Reports, Alerts/Admin. Under Patients show patient records and history. Under Devices show bootstrap, status, telemetry. Under Sessions show new session, live waveform, notes, saved views. Under Reports show PDF export and AI-assisted report. Under Alerts/Admin show alert resolution, audit logs, settings, roles. Clean white background, product documentation style.
```

## Prompt 27: LLM Report Generation Workflow

Location: Figure 16.1, Chapter 16.2.

```text
Create an LLM report generation workflow diagram. Show session completed, predictions stored, user requests report, report queued, rate limit checked, internal worker processes pending report, Claude or demo provider generates report, report saved to database, dashboard displays report, optional notification sent. Add warning label: AI-assisted report for clinician review. Clean white background.
```

## Prompt 28: n8n Automation Workflow Map

Location: Figure 17.1, Chapter 17.1.

```text
Create an automation workflow map for n8n in a cardiac monitoring platform. Show workflows: process pending LLM reports, clinical alert notifications, device health monitoring, daily digest, recording summary enrichment, operations monitoring, and alert escalation. Show API calls protected by internal token. White background, workflow boxes and arrows, professional style.
```

## Prompt 29: Security And Organization Isolation Model

Location: Figure 18.1, Chapter 18.3.

```text
Create a security model diagram for AscultiCor / SonoCardia. Show organization isolation, Supabase Auth, Row Level Security policies, protected API routes, service role only on backend, device bootstrap secret, per-device MQTT credentials, audit logs, rate limiting, TLS, environment secret protection, and n8n internal token protection. Professional cybersecurity architecture style, white background.
```

## Prompt 30: Local Docker Compose Deployment

Location: Figure 19.1, Chapter 19.3.

```text
Create a local Docker Compose deployment diagram. Show containers: Next.js frontend, FastAPI inference service, Mosquitto MQTT broker, NGINX reverse proxy if enabled, optional n8n, and external Supabase cloud. Show internal network connections and ports conceptually. White background, DevOps architecture style.
```

## Prompt 31: Cloud Deployment Architecture

Location: Figure 19.2, Chapter 19.4.

```text
Create a deployment diagram for cloud VM deployment. Show user browser reaching NGINX over HTTPS, NGINX routing to Next.js frontend and FastAPI inference service, internal Mosquitto broker, optional n8n service, managed Supabase cloud for auth database and storage, and ESP32 devices connecting through a secure network path. Mark public and private network boundaries. White background, clean cloud architecture style.
```

## Prompt 32: Testing And Validation Workflow

Location: Figure 20.1, Chapter 20.1.

```text
Create a testing and validation workflow diagram organized by team. Show IoT and Hardware tests: wiring, sampling, MQTT, preflight. Show AI tests: preprocessing, datasets, model metrics, confusion matrices. Show Frontend and Backend tests: APIs, sessions, dashboard, roles. Show n8n Automation tests: reports, alerts, digests, escalation. Show Cloud and DevOps tests: Docker, NGINX, TLS, health checks, monitoring. End with end-to-end session validation. Academic engineering validation style, white background.
```

## Prompt 33: Future Work Roadmap

Location: Figure 21.1, Chapter 21.6.

```text
Create a future work roadmap figure for AscultiCor / SonoCardia organized by team. IoT and Hardware: improved PCB and enclosure, better analog signal conditioning. AI: larger clinical datasets, model versioning and rollback. Frontend and Backend: clinician review workflow, richer reporting, FHIR/HL7 integration. n8n Automation: safer report review, alert escalation tuning. Cloud and DevOps: managed IoT broker, stronger security and compliance, production monitoring. Use a clean timeline style, no fake dates.
```

## Prompt 34: Exact Chart Redraw From Real Data

Location: Figures 8.2, 9.2, 10.2, 10.3, 20.2, 20.3, 20.4, 20.5, 20.6, and 20.7.

Use this only after providing the real chart image or exact numeric values.

```text
Redraw this provided chart exactly for a graduation thesis. Preserve every number, label, axis title, legend, class name, and color meaning exactly as provided. Do not invent missing values. If a value is unclear, leave it blank and mark it as "verify". Use a clean academic style suitable for printing.
```

---

# Exact Numeric Charts To Generate From Real Data

These figures should come from scripts, validation outputs, screenshots, or measured test results rather than Nano Banana Pro invention.

| Chart | Location | How to Produce |
| --- | --- | --- |
| Model 1 confusion matrix | Chapter 8.5 and Chapter 20.3 | Use validation script or saved model validation output |
| Model 2 confusion matrices | Chapter 9.5 and Chapter 20.3 | Use validation script or saved output images |
| Model 3 confusion matrix | Chapter 10.5 and Chapter 20.3 | Use validation script or saved model validation output |
| Training history curves | Chapter 10.5 and Chapter 20.3 | Use saved training history plots where available |
| End-to-end latency chart | Chapter 20.7 | Measure session command, first data received, prediction stored, dashboard update, and automation completion |
| Session success/failure chart | Chapter 20.7 | Count simulator and hardware test outcomes |
| Dashboard screenshots | Chapter 14 and Chapter 15 | Capture real screenshots from the running frontend |
| Hardware photos | Chapter 4 and Appendix B | Use real photos of the assembled device |
| n8n workflow screenshots | Chapter 17 and Appendix I | Use real workflow screenshots or exported workflow diagrams |
| Deployment screenshots | Chapter 19 and Appendix K | Use real server, Docker, health check, and NGINX evidence |

---

# Recommended Writing Order

1. Write Chapter 1 and Chapter 3 first so everyone agrees on objectives, responsibilities, and integration boundaries.
2. IoT and Hardware team writes Chapters 4, 5, and 6 as one continuous part.
3. AI team writes Chapters 7, 8, 9, 10, and 11 as one continuous part.
4. Frontend and Backend team writes Chapters 12, 13, 14, and 15 as one continuous part.
5. n8n Automation team writes Chapters 16 and 17 as one continuous part.
6. Cloud and DevOps team writes Chapters 18 and 19 as one continuous part.
7. Every team contributes its validation evidence to Chapter 20.
8. Every team contributes limitations and future work to Chapter 21.
9. One final editor writes the final Abstract, Chapter 22, References, Appendices, List of Figures, List of Tables, and formatting cleanup.

