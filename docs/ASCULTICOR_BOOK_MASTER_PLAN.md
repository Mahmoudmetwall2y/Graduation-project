# AscultiCor Graduation Book Master Plan

Working title: **AscultiCor: An AI-Powered IoT Platform for ECG and PCG Acquisition, Analysis, and Remote Cardiac Monitoring**

This plan follows the six-chapter structure requested by the project supervisor while preserving the multilevel hierarchy and front-matter style of `Grad.pdf`. The book presents an engineering research prototype and clinical decision-support platform, not a certified diagnostic device.

Current drafting status: Chapters 1–6 and Appendices A–H are integrated into the working Word book. Chapter 4 uses the real XGBoost evaluation plots, four delivered ECG case-study figures, and six delivered CNN confusion matrices from `new-models`. All three model slots are active. CNN case studies remain pending from the AI team and will be inserted later without changing the current aggregate results. Chapter 5 converts the remaining evidence gaps into a prioritized hardware, AI, application, automation, cloud, security, and clinical-validation roadmap. Chapter 6 contains 25 unique IEEE-style references with complete in-text citation coverage. The appendices provide the hardware/BOM and pin map, PCB bring-up checklist, MQTT contract, database/API reference, current model summary, n8n inventory, release gate, and acceptance-test matrix. The final abstract, approval and declaration pages, table of contents, list of figures, list of tables, and abbreviations are included; personal and university placeholders still require team-approved details.

Template delivery status: the complete manuscript is also generated directly from `Graduation Book Template - New.docx` as `docs/AscultiCor_Graduation_Book_Template_Filled.docx`. This version preserves the template's official Letter geometry, page frame, title-page behavior, branded header/footer shapes, academic-year element, and page-number field.

## Target Length

| Book block | Target pages |
| --- | ---: |
| Preliminary pages | 9-11 |
| Chapter 1: Introduction and Project Objectives | 9-11 |
| Chapter 2: Background and Related Work | 17-20 |
| Chapter 3: System Design and Implementation | 49-55 |
| Chapter 4: Results and Discussion | 18-22 |
| Chapter 5: Conclusion and Future Work | 5-7 |
| Chapter 6: References | 4-6 |
| Appendices | 5-8 |
| **Total** | **116-130** |

The estimate assumes an 11-point Times New Roman body font, 1.15-1.5 line spacing, justified paragraphs, standard margins, numbered captions, and only technically useful figures and tables.

## Preliminary Pages

- Cover page
- Approval/signature page
- Declaration
- Dedication (optional)
- Acknowledgements
- Abstract
- Table of Contents
- List of Figures
- List of Tables
- List of Abbreviations

## Detailed Multilevel Table of Contents

# Chapter 1: Introduction and Project Objectives

## 1.1 Background and Motivation

### 1.1.1 Cardiovascular Disease and the Need for Accessible Monitoring
### 1.1.2 Cardiac Auscultation and Electrocardiography
### 1.1.3 Role of IoT, Artificial Intelligence, and Cloud Platforms

## 1.2 Problem Statement

### 1.2.1 Clinical and Accessibility Challenges
### 1.2.2 Engineering and Integration Challenges

## 1.3 Aim of the Project

## 1.4 Project Objectives

### 1.4.1 IoT and Hardware Objectives
### 1.4.2 Artificial Intelligence Objectives
### 1.4.3 Frontend and Backend Objectives
### 1.4.4 n8n Automation Objectives
### 1.4.5 Cloud and DevOps Objectives

## 1.5 Project Scope and Boundaries

### 1.5.1 Included Scope
### 1.5.2 Excluded Scope and Medical Disclaimer

## 1.6 Proposed Solution Overview

## 1.7 Main Contributions

## 1.8 Book Organization

# Chapter 2: Background and Related Work

## 2.1 Medical Background

### 2.1.1 Cardiac Anatomy and the Cardiac Cycle
### 2.1.2 ECG Morphology and Rhythm Abnormalities
### 2.1.3 Heart Sounds, Murmurs, and PCG

## 2.2 Biomedical Signal Acquisition and Processing

### 2.2.1 ECG Acquisition Principles
### 2.2.2 PCG Acquisition Principles
### 2.2.3 Noise, Motion Artifacts, and Signal Quality

## 2.3 Artificial Intelligence for Cardiac Signals

### 2.3.1 Traditional Feature-Based Methods
### 2.3.2 Deep Learning Methods
### 2.3.3 Evaluation Metrics and Clinical Caution

## 2.4 IoT and Remote Patient Monitoring Systems

## 2.5 Web, Cloud, and Workflow Automation in Healthcare

## 2.6 Review of Previous Research and Comparable Systems

### 2.6.1 Automated Heart-Sound Classification
### 2.6.2 ECG Arrhythmia Classification
### 2.6.3 Digital Stethoscopes and Low-Cost Monitoring Devices
### 2.6.4 Integrated ECG-PCG Systems
### 2.6.5 Remote Dashboards and Clinical Alert Platforms

## 2.7 Comparative Analysis and Research Gap

## 2.8 Chapter Summary

# Chapter 3: System Design and Implementation

## 3.1 Overall System Architecture

### 3.1.1 Stakeholders and User Roles
### 3.1.2 Functional Requirements
### 3.1.3 Non-Functional Requirements
### 3.1.4 Technology Stack
### 3.1.5 End-to-End Data Flow

## 3.2 IoT and Hardware Workstream

### 3.2.1 Hardware Objectives and Design Requirements
### 3.2.2 Hardware Components
#### 3.2.2.1 ESP32-WROOM-32
#### 3.2.2.2 AD8232 ECG Analog Front End
#### 3.2.2.3 MAX9814 PCG Microphone Module
#### 3.2.2.4 Auxiliary Components and Patient Interface
### 3.2.3 Sensor Selection Rationale
### 3.2.4 Wiring and Pin Mapping
### 3.2.5 Custom Printed Circuit Board and Power Management
#### 3.2.5.1 PCB Integration and Signal Integrity
#### 3.2.5.2 Battery Charging and Protection
#### 3.2.5.3 Load-Sharing Power Path
#### 3.2.5.4 Decoupling and Hardware Noise Mitigation
### 3.2.6 Physical Assembly, Electrode Placement, and Acoustic Coupling
### 3.2.7 Firmware Architecture
#### 3.2.7.1 Dual-Rate Sampling and Hardware Timers
#### 3.2.7.2 Buffering and Chunk Formation
#### 3.2.7.3 Signal-Quality Preflight
#### 3.2.7.4 Provisioning, NVS Storage, and Device Feedback
### 3.2.8 MQTT Communication and Device Management
#### 3.2.8.1 Topic Hierarchy and Payload Contract
#### 3.2.8.2 Device Bootstrap and Credentials
#### 3.2.8.3 Session Commands, Status, and Heartbeats
#### 3.2.8.4 Reliability and Failure Handling
### 3.2.9 IoT and Hardware Limitations

## 3.3 Artificial Intelligence Workstream

### 3.3.1 AI Objectives and Pipeline Overview
### 3.3.2 Datasets and Data Governance
### 3.3.3 PCG Preprocessing and Feature Engineering
### 3.3.4 ECG Preprocessing, Resampling, and Windowing
### 3.3.5 Model 1: XGBoost Heart-Sound Classification
### 3.3.6 Model 2: AuscultICor v26 Single-Lead ECG Classification
### 3.3.7 Model 3: PyTorch CNN Murmur Characterization
### 3.3.8 Training, Validation, and Class-Imbalance Handling
### 3.3.9 FastAPI Real-Time Inference Service
### 3.3.10 Model Registry, Artifacts, and Failure Handling
### 3.3.11 AI Limitations and Responsible Use

## 3.4 Frontend and Backend Workstream

### 3.4.1 Application Objectives and Architecture
### 3.4.2 Supabase Data Model and Multi-Tenant Design
### 3.4.3 Authentication, Roles, and Row-Level Security
### 3.4.4 Storage, Migrations, and Audit Logging
### 3.4.5 API Routes and Session Lifecycle
### 3.4.6 Patient and Device Management
### 3.4.7 Live ECG/PCG Visualization
### 3.4.8 Predictions, Reports, Alerts, and Administration
### 3.4.9 User-Interface Design and Accessibility
### 3.4.10 Frontend and Backend Limitations

## 3.5 n8n Automation Workstream

### 3.5.1 Automation Objectives and Architecture
### 3.5.2 LLM Report Queue and Processing
### 3.5.3 Clinical Alert Workflow
### 3.5.4 Device-Health Monitoring Workflow
### 3.5.5 Daily Digest and Recording Enrichment
### 3.5.6 Operations Monitoring and Escalation
### 3.5.7 Automation Security, Retries, and Failure Handling
### 3.5.8 LLM Safety and Automation Limitations

## 3.6 Cloud and DevOps Workstream

### 3.6.1 Deployment Objectives and Environment Strategy
### 3.6.2 Docker Compose Architecture
### 3.6.3 Mosquitto and NGINX Configuration
### 3.6.4 Cloud Virtual Machine Deployment
### 3.6.5 Secrets and Environment Configuration
### 3.6.6 Security, Privacy, and Tenant Isolation
### 3.6.7 Logging, Health Checks, Monitoring, and Backups
### 3.6.8 Release and Production Controls
### 3.6.9 Cloud and DevOps Limitations

## 3.7 Cross-Team Integration

### 3.7.1 Interface Contracts
### 3.7.2 End-to-End Session Sequence
### 3.7.3 Error Propagation and Recovery
### 3.7.4 Chapter Summary

# Chapter 4: Results and Discussion

## 4.1 Evaluation Methodology

### 4.1.1 Experimental Environment
### 4.1.2 Test Scenarios and Acceptance Criteria

## 4.2 IoT and Hardware Results

### 4.2.1 ECG and PCG Acquisition Quality
### 4.2.2 Sampling, Packet Delivery, and Session Reliability
### 4.2.3 Power and PCB Evaluation

## 4.3 Artificial Intelligence Results

### 4.3.1 PCG XGBoost Metrics and Curves
### 4.3.2 Single-Lead ECG Case Studies
### 4.3.3 Murmur-Characterization CNN Results
### 4.3.4 Model Comparison, Error Analysis, and Reproducibility

## 4.4 Frontend and Backend Results

### 4.4.1 Functional and Role-Based Access Tests
### 4.4.2 Live Session and API Performance
### 4.4.3 Usability Evidence

## 4.5 n8n Automation Results

### 4.5.1 Workflow Success, Retry, and Escalation Tests
### 4.5.2 Report Generation and Alert Latency

## 4.6 Cloud and DevOps Results

### 4.6.1 Deployment and Availability
### 4.6.2 Security and Isolation Tests
### 4.6.3 Resource Utilization and Recovery Tests

## 4.7 End-to-End Results

### 4.7.1 Complete Session Walkthrough
### 4.7.2 Latency Budget
### 4.7.3 Requirements Traceability

## 4.8 Discussion

### 4.8.1 Interpretation of Findings
### 4.8.2 Comparison with Related Work
### 4.8.3 Limitations, Threats to Validity, and Clinical Caution

# Chapter 5: Conclusion and Future Work

## 5.1 Project Summary
## 5.2 Achievement of Objectives
## 5.3 Main Engineering Contributions
## 5.4 Current Limitations
## 5.5 Future Work
### 5.5.1 Hardware and PCB Improvements
### 5.5.2 AI and Dataset Improvements
### 5.5.3 Application and Automation Improvements
### 5.5.4 Cloud, Security, and Clinical Validation
## 5.6 Final Remarks

# Chapter 6: References

Use IEEE numeric citation style, with each source cited in the text in order of first appearance. Prefer peer-reviewed papers, official dataset pages, standards, component datasheets, and official framework documentation. Avoid blogs where a primary source exists.

# Appendices

## Appendix A: Hardware Bill of Materials and Pin Mapping
## Appendix B: PCB Schematics and Manufacturing Views
## Appendix C: MQTT Topics and Payloads
## Appendix D: Database Schema and API Endpoint Reference
## Appendix E: Model Configurations and Detailed Metrics
## Appendix F: n8n Workflow Inventory
## Appendix G: Deployment and Environment Checklist
## Appendix H: Test Case Matrix

## Required Tables

Keep only tables that support a decision, specification, comparison, or result:

1. Team workstreams and responsibilities.
2. Functional and non-functional requirements.
3. Technology stack and rationale.
4. Hardware bill of materials.
5. ESP32 pin mapping.
6. PCB power-management components.
7. MQTT topics and payloads.
8. Dataset summary and class distribution.
9. Model architecture/hyperparameter summary.
10. Supabase core entities and relationships.
11. API endpoint summary.
12. n8n workflow summary.
13. Security-control matrix.
14. Test-case and requirements-traceability matrix.
15. Per-model performance results.
16. End-to-end latency and reliability results.

## Figure Policy

- Use real screenshots, measured waveforms, model plots, confusion matrices, and training curves whenever the figure represents project evidence.
- Use generated figures only for explanatory architecture, data-flow, sequence, and conceptual medical diagrams.
- Never generate or redraw numeric results with invented values.
- Every figure must be introduced in the text, numbered, captioned, and discussed after it appears.

## Gemini Figure Prompts

### Complete Figure Audit

| Figure(s) | Required source | Action |
| --- | --- | --- |
| 1.1–1.3 | Explanatory project diagrams | Generate from the three prompts below. Figures 1.2 and 1.3 were added during the final audit. |
| 2.1–2.5 | Conceptual medical/background diagrams | Generate from the five prompts below; keep them non-diagnostic and non-numeric. |
| 3.1–3.3 | Architecture, sequence, and hardware-interface diagrams | Generate from the three prompts below. |
| 3.4(a)–3.4(b) | Original project schematics | Use the supplied images. Do not generate replacements. |
| 3.5–3.11 | Firmware, AI, application, automation, deployment, and recovery diagrams | Generate from the seven prompts below. |
| 4.1–4.9 | XGBoost result images | Use the real files under `new-models/Xgboost/figures`. Do not generate replacements. |
| 4.10–4.13 | ECG case-study panels | Use the real files under `new-models/ecg_mitbih_single_lead`. Do not generate replacements. |
| 4.14–4.15 | CNN confusion-matrix panels | Use the six real files under `new-models/CNN`. Do not generate replacements. |
| 4.16–4.17 | Validation setup and evidence timeline | Generate from the two prompts below, leaving measurement fields empty. |
| 5.1 | Future-work roadmap | Generate from the prompt below. |

There are 21 Gemini-generated explanatory figures in the current plan. All project-result plots, confusion matrices, case-study panels, and PCB schematics remain original evidence images.

### Figure 1.1: AscultiCor Concept Overview

Create a simple publication-quality concept illustration for the opening chapter of the AscultiCor graduation book. Tell one clear left-to-right user story using no more than five visual stages: a person with three ECG electrodes and a chest-coupled PCG sensor; a compact AscultiCor sensing device; secure wireless transfer; one generic analysis-and-storage platform; and an authorized reviewer receiving waveforms, a report, or an alert. Treat the platform as a single black box labeled “AscultiCor analysis platform”—do not show internal services, databases, training stages, model branches, model names, algorithms, or deployment components. The purpose is to communicate the project idea to a non-specialist, not to document the architecture. White background, flat academic vector style, dark navy and teal accents, restrained red only for cardiac traces, minimal text, 16:9 landscape. Do not show diagnoses, patient identifiers, performance values, Bluetooth, autonomous clinical decisions, or invented security versions.

### Figure 1.2: Team Workstream Responsibility Map

Create a publication-quality academic responsibility-flow diagram for the AscultiCor graduation project on a white background. Use five clearly separated horizontal swimlanes in this exact order: IoT and Hardware; AI; Frontend and Backend; n8n Automation; Cloud and DevOps. In the IoT and Hardware lane show physical sensing, firmware, ECG/PCG capture, preflight checks, and MQTT publication. In the AI lane show signal processing, dataset preparation, training, validation, and three active inference models. In the Frontend and Backend lane show the dashboard, Supabase data model, API routes, session workflow, and role-based access. In the n8n Automation lane show report processing, device/clinical alerts, daily digests, enrichment, and escalation. In the Cloud and DevOps lane show Docker, NGINX, Linux cloud VM, security, monitoring, backups, and production controls. Add concise interface contracts between adjacent lanes: waveform plus metadata, structured prediction JSON, persisted session/report state, workflow events, and deployment configuration. Use navy and teal accents with muted red only for fault paths. Do not add names, percentages, performance claims, or decorative icons.

### Figure 1.3: AscultiCor Functional Scope and System Boundary

Create a publication-quality functional-scope diagram for AscultiCor that is deliberately not a system architecture. Draw one large central boundary labeled “AscultiCor educational prototype.” On the left, show only the accepted inputs: single-lead ECG waveform, PCG waveform, device/session metadata, and authenticated user commands. Inside the boundary, use four compact capability labels without technologies or arrows between components: acquire and validate signals; analyze recordings with three active model tasks; store traceable session evidence; coordinate reports and alerts. On the right, show only the produced information objects: live waveform view, structured prediction JSON, persisted session record, reviewable report, and operational/clinical alert record. Beneath the boundary, add a clearly separated “Outside the current scope” strip listing certified diagnosis, emergency response, medical-grade electrical isolation, twelve-lead ECG, production hospital integration, and autonomous treatment decisions. Do not show a patient-to-cloud pipeline, cloud icons, ESP32 internals, MQTT, Supabase, Next.js, FastAPI, n8n, Docker, model architectures, or performance values. White background, restrained navy/teal palette, thin boundary lines, concise academic typography, 16:9 landscape.

### Figure 2.1: Cardiac Cycle and Multimodal Timing

Create a medically cautious educational timeline of one cardiac cycle on a white background. Align five simplified tracks: atrial and ventricular electrical activation, ventricular pressure trend, valve state, an ECG labeled P–QRS–T, and a PCG labeled S1 and S2. Emphasize that electrical activation precedes mechanical events. Use clean vector lines, navy/teal/red accents, readable academic typography, and a small note stating “conceptual timing—not a diagnostic scale.” Do not add numerical intervals or disease labels.

### Figure 2.2: Simplified ECG Morphology

Create a publication-quality single-lead ECG educational diagram showing one clean cardiac cycle with labels for P wave, PR interval, QRS complex, ST segment, T wave, and R–R interval. White background, thin dark-navy axes, restrained red ECG trace, spacious labels, no grid clutter, no diagnostic claims, and a note that morphology varies by patient and lead configuration.

### Figure 2.3: PCG Cycle and Murmur Timing

Create an academic phonocardiogram illustration on a white background. Show S1 and S2 in one normal cycle, clearly mark systole and diastole, and underneath provide separate stylized envelope examples for a generic systolic murmur and generic diastolic murmur. Use teal waveform traces and muted red murmur envelopes. Do not assign disease names, intensity grades, or measured amplitudes.

### Figure 2.4: Cardiac-Signal AI Method Taxonomy

Create a three-branch technical comparison diagram for cardiac-signal machine learning. Branch 1: handcrafted ECG/PCG features to XGBoost or classical classifier. Branch 2: raw one-dimensional waveform to CNN, LSTM, or BiLSTM. Branch 3: waveform to log-mel spectrogram to two-dimensional CNN. For every branch show dataset split, preprocessing, trained artifact, deployment preprocessing, prediction, and human review. White background, IEEE-paper visual style, navy and teal palette, no invented metrics.

### Figure 2.5: Related-Work Landscape and Research Gap

Create a qualitative academic landscape chart with “component depth” on the vertical axis and “end-to-end integration breadth” on the horizontal axis. Place conceptual groups rather than numeric scores: public ECG/PCG datasets, model-only studies, low-cost IoT sensor dashboards, commercial digital stethoscopes, remote-monitoring platforms, and AscultiCor. Show AscultiCor as targeting broad inspectable integration while explicitly labeling it “educational prototype; clinical validation pending.” Do not imply clinical superiority or use performance numbers.

### Figure 3.1: Complete System Architecture

Create a precise layered architecture diagram for “AscultiCor”. From left to right show: patient sensors (AD8232 ECG and MAX9814 PCG), ESP32-WROOM-32 firmware, Wi-Fi and MQTT broker, FastAPI inference service with three active model paths—PCG XGBoost screening, AuscultICor v26 single-lead ECG, and PyTorch multi-head murmur CNN—Supabase authentication/database/storage, Next.js dashboard, n8n automation and LLM report processing, and NGINX/Docker cloud deployment. Show the CNN gated after an XGBoost Murmur result and label its six outputs: timing, shape, grading, pitch, quality, and location. Add arrows for control commands, binary waveform chunks, predictions, reports, and alerts. Use a white background, professional IEEE-paper aesthetic, navy/teal palette, sharp readable labels, no invented metrics.

### Figure 3.2: End-to-End Session Sequence

Create a UML-style sequence diagram for AscultiCor with participants: User Dashboard, Next.js API, Supabase, MQTT Broker, ESP32 Device, FastAPI Inference, and n8n. Show authentication, session creation, MQTT start command, device preflight, start metadata, simultaneous ECG/PCG streaming, buffering, recording finalization, inference, prediction persistence, dashboard update, report queueing, and alert workflow. Include alternative failure branches for authorization denial, preflight failure, device timeout, model unavailable, and report retry. White background, crisp technical typography, landscape orientation.

### Figure 3.3: Hardware Wiring and Patient Interface

Create a clean academic wiring diagram for the final AscultiCor hardware. Show ESP32-WROOM-32, AD8232 powered from 3.3 V with OUT to GPIO32 and LO+ / LO− to GPIO34 / GPIO35, MAX9814 powered from 3.3 V with OUT to GPIO33, GAIN tied for nominal maximum gain and A/R at default, plus a GPIO2 status LED. Show a three-electrode body interface and a stethoscope-style chest coupling piece. Use the MAX9814 only—do not show INMP441. Add “educational research prototype—not medically isolated.”

### Figure 3.4(a) and Figure 3.4(b): Original Project Schematics — No Gemini Prompt

Use the two original project images supplied as `docs/PCB 1.jpeg` and `docs/PCB 2.jpeg`, copied into the book assets as `assets/figures/figure_3_4a_controller_sensor_schematic.jpg` and `assets/figures/figure_3_4b_power_management_schematic.jpg`. The first shows the ESP32, AD8232, MAX9814, LED, switch, and decoupling connections. The second shows USB Type-C, TP4056 charging, DW01A/FS8205 battery protection, AO3401/SS34 load sharing, and connectors. Do not redraw, regenerate, beautify, or alter their circuit content. These are project evidence images, not AI-generated explanatory figures.

### Figure 3.5: Firmware State Machine and Concurrency Model

Create a professional embedded-firmware state diagram for AscultiCor. Main states: boot, load NVS credentials, provision if needed, connect Wi-Fi, connect MQTT, idle, preflight, streaming, session finalization, cooldown, reconnect, and error. Alongside it show two hardware timer paths: ECG at 500 Hz and PCG at approximately 22,222 Hz, feeding main-loop buffers and binary MQTT publication. Include the four-buffer PCG queue, 500-sample ECG buffer, heartbeats, overflow warning, and partial-buffer flush. White background, navy/teal palette, no source-code screenshot.

### Figure 3.6: AI Training-to-Deployment Architecture

Create a rigorous AI lifecycle diagram for AscultiCor that contains only model-development and inference concerns, not the complete IoT system. Divide the page into two clearly labeled vertical zones. Zone A, “Offline development and validation,” begins with governed ECG and PCG datasets, patient-level train/validation/test splits, three separate training lanes, evaluation, versioned preprocessing assets, and artifact export. Zone B, “Online inference,” begins with a finalized ECG or PCG recording, applies the matching runtime preprocessing, loads artifacts from a read-only model registry through FastAPI, emits structured prediction JSON with model and preprocessing versions, persists the result, and ends at an “authorized human review” box. The three active lanes must be technically exact: PCG XGBoost uses 200 traditional features plus a 1,024-dimensional YAMNet embedding; AuscultICor v26 SL uses a 500-sample single-lead ECG window, nine RR features, and zero forecast context; the PyTorch CNN converts 22,050 Hz PCG into a 128 × 216 mel spectrogram, arranges four ordered AV/MV/PV/TV channels, passes them through five convolution/residual stages and a shared representation, then produces six heads for timing, shape, grading, pitch, quality, and location. Show the CNN runtime branch as conditional on an XGBoost Murmur output. Place legacy artifacts in a small dashed “reference only—not loaded” box. Do not show a patient, electrodes, ESP32 hardware, Wi-Fi, MQTT, cloud icons, dashboard screens, reports, mobile alerts, or the overall application architecture. White background, precise research-paper flowchart style, navy and teal accents, landscape orientation, and no invented performance values.

### Figure 3.7: Active Signal Preprocessing Pipelines

Create a three-lane engineering pipeline. PCG XGBoost lane: actual device rate near 22,222 Hz, resample to 22,050 Hz for a 10-second 20–400 Hz filtered traditional-feature path, and separately resample to 16 kHz for a 3-second YAMNet path; concatenate to 1,224 features and scale. ECG lane: 500 Hz device input, resample to the model target of 125 Hz, 0.5–50 Hz filtering, baseline correction, moving-average denoising, 500-sample windows with 50% overlap, nine RR features, and three model inputs. CNN lane: PCG resampled to 22,050 Hz, z-score normalization, 128-mel spectrogram using 2,048 FFT and 512 hop, pad/crop to 216 frames, then place the recording in its AV/MV/PV/TV channel or show the explicit replication fallback. Label 125 Hz as the delivered ECG model input rate, not MIT-BIH native rate.

### Figure 3.8: Frontend and Backend Component Architecture

Create a layered web-application architecture diagram for AscultiCor. Show protected Next.js 14 pages and reusable React components in the browser, middleware and server route handlers, Supabase Auth/PostgreSQL/private Storage/Edge Functions, server-side MQTT command publication, FastAPI live/summary data, and internal n8n workflow actions. Show organization-level tenant boundaries and keep service-role keys and internal tokens inside server-only zones.

### Figure 3.9: n8n Automation Workflow Map

Create a professional workflow map with n8n at the center and eight labeled branches: connectivity check, pending report processing, clinical alerts, device-health monitoring, daily digest, recording-summary enrichment, operations monitoring, and alert escalation. Show scheduled/manual triggers, protected internal Next.js APIs, Supabase state, optional LLM provider, email delivery, retries, deduplication, and escalation metadata. Explicitly keep raw ECG and PCG streams outside n8n.

### Figure 3.10: Cloud Deployment and Trust Zones

Create a cloud deployment diagram for AscultiCor on a Linux VPS. Show internet users through HTTPS to NGINX, ESP32 device connectivity, Docker bridge network, Next.js frontend, FastAPI inference, Mosquitto, firmware builder/flasher, n8n, external Supabase, named volumes, and backups. Mark public ports 80/443, internal service ports, loopback-only defaults, TLS boundaries, and the recommendation for MQTT over TLS or a private tunnel. Do not show raw port 1883 as safe for public clinical use.

### Figure 3.11: Cross-Team Fault Detection and Recovery

Create a fault-propagation diagram for AscultiCor with seven columns: acquisition, firmware, MQTT, inference/models, Supabase/application, n8n, and infrastructure. For each column show representative faults, where they are detected, what evidence is stored, whether the action is reject, retry, timeout, degrade, resolve, or escalate, and what the user sees. Use clean academic styling and no invented reliability percentages.

### Figures 4.14 and 4.15: CNN Confusion-Matrix Panels

Use the six real project images under `new-models/CNN`. Figure 4.14 groups timing, shape, and grading. Figure 4.15 groups pitch, quality, and location. Do not redraw, smooth, normalize, or generate replacement numeric matrices.

### Figure 4.16: Hardware Validation Test Bench

Create a publication-quality engineering test-bench diagram for the AscultiCor prototype on a white background. Show the custom PCB with ESP32, AD8232 ECG input, MAX9814 PCG input, battery and USB-C power paths; a safe controlled ECG/PCG signal source or clearly labeled research participant interface; oscilloscope probes on the 3.3 V rail and analog outputs; a logic analyzer or timestamp counter for sampling; an MQTT packet-capture laptop; and a structured measurement log keyed by device ID, firmware version, and session ID. Use navy and teal accents. Do not add measured values, pass marks, clinical claims, or simulated waveforms. Label it “validation setup—results to be measured.”

### Figure 4.17: End-to-End Evidence Timeline

Create a clean academic timeline for one AscultiCor session with these ordered events: dashboard start action, Next.js authorization, Supabase session creation, MQTT command, device preflight, first ECG and PCG chunks, live dashboard update, recording finalization, PCG and ECG inference, prediction persistence, n8n report queue, report completion, and alert delivery when applicable. Place an empty timestamp box and empty duration bracket between relevant events so the team can insert real measured values later. Use a white background, UML-inspired styling, navy/teal palette, and muted red only for failures. Include alternative markers for authorization denial, preflight failure, network interruption, and model unavailable. Do not invent latency numbers.

### Figure 5.1: Future Work Roadmap

Create a three-horizon academic technology roadmap for AscultiCor. Horizon 1: improved enclosure, PCB revision, external high-resolution ADC, stronger automated testing. Horizon 2: larger multi-center datasets, explainable AI, mobile companion app, TLS device transport, Redis-backed queues. Horizon 3: prospective clinical validation, regulatory quality management, interoperability with hospital systems, and a certified medical-device pathway. Use a minimal white-background timeline with navy, teal, and muted red accents; no dates and no exaggerated claims.
