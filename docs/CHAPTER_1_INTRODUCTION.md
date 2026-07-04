# Chapter 1: Introduction and Project Objectives

## 1.1 Background and Motivation

### 1.1.1 Cardiovascular Disease and the Need for Accessible Monitoring

Cardiovascular diseases remain the leading cause of death worldwide. The World Health Organization estimates that 19.8 million people died from cardiovascular diseases in 2022, accounting for approximately 32% of global deaths, with more than three quarters of these deaths occurring in low- and middle-income countries [1]. This burden makes early observation, appropriate referral, and continuous follow-up important public-health and engineering goals. Although advanced cardiac investigations are available in specialized hospitals, access to experienced clinicians and diagnostic equipment is uneven. Primary-care facilities, educational clinics, and remote communities may depend on intermittent examinations, manual record keeping, or equipment that cannot share data with a wider care team.

Two of the most established non-invasive methods for observing cardiac activity are electrocardiography and auscultation. An electrocardiogram (ECG) represents the electrical activity associated with cardiac depolarization and repolarization. It provides information about rhythm, beat morphology, and conduction. Cardiac auscultation, meanwhile, evaluates the mechanical and acoustic events of the cardiac cycle. When heart sounds are captured electronically, the resulting signal is called a phonocardiogram (PCG). ECG and PCG describe different but complementary aspects of the same physiological process: the ECG reflects electrical excitation, while the PCG reflects mechanical events such as valve closure and turbulent flow.

In routine practice these modalities are often acquired using separate instruments and interpreted in separate workflows. Manual auscultation is inexpensive and widely used, but its interpretation depends strongly on training, hearing, examination conditions, and clinician experience. A systematic review of auscultation for valve disease reported considerable variation in diagnostic performance across settings and studies [2]. Conventional ECG devices provide objective waveforms, yet many systems are not designed for low-cost wireless acquisition, synchronized PCG capture, remote visualization, or automated engineering analysis. These limitations motivate an integrated platform that can collect both signals, preserve their context, analyze them consistently, and present the results through an accessible interface.

AscultiCor was conceived as a response to this integration problem. It combines a portable sensing device, embedded firmware, wireless messaging, artificial-intelligence models, a multi-user web application, workflow automation, and cloud deployment. The platform is intended to demonstrate how a complete Internet of Things (IoT) pipeline can connect body-surface signals to a structured digital record and decision-support interface. Its purpose is educational and research-oriented: it supports signal review and prioritization but does not replace a qualified clinician or a certified medical device.

### 1.1.2 Cardiac Auscultation and Electrocardiography

The first and second heart sounds, commonly denoted S1 and S2, are associated mainly with closure of the atrioventricular and semilunar valves. Additional sounds and murmurs may arise from altered flow, valve abnormalities, or other physiological conditions. A digital PCG preserves the temporal and spectral structure of these events and allows computer-based preprocessing, feature extraction, and classification. Public initiatives such as the PhysioNet/Computing in Cardiology Challenge 2016 helped establish reproducible benchmarks for normal-versus-abnormal heart-sound classification and provided recordings collected across heterogeneous clinical and non-clinical environments [3].

The ECG is normally described by the P wave, QRS complex, and T wave. Their timing and morphology provide evidence related to atrial activation, ventricular depolarization, and ventricular repolarization. Automated ECG analysis is valuable because long recordings can contain intermittent rhythm changes that are difficult to inspect manually. The MIT-BIH Arrhythmia Database has long served as a reference dataset for developing and comparing arrhythmia-detection algorithms [4]. However, a trained model is only one component of a usable monitoring system. Real deployment also requires reliable acquisition, synchronized metadata, secure identity, data transport, storage, visual review, failure handling, and traceable results.

AscultiCor treats ECG and PCG as coordinated inputs rather than isolated demonstrations. The hardware captures a single-lead ECG through an AD8232 analog front end and chest sounds through a MAX9814 microphone amplifier. An ESP32-WROOM-32 samples these analog channels at rates appropriate to each modality, performs preflight checks, and publishes session data over MQTT. This design allows the project to study the full path from a noisy physical measurement to a reviewable digital result.

### 1.1.3 Role of IoT, Artificial Intelligence, and Cloud Platforms

IoT architecture enables a small embedded device to participate in a larger clinical-information workflow. In AscultiCor, the physical device is provisioned with an organization and device identity. It receives session commands, reports its status, and publishes signal chunks and heartbeat messages through a topic hierarchy that preserves organization, device, and session context. This separation is important because physiological data without trustworthy identity and timing cannot be safely associated with a patient session.

Artificial intelligence provides a second layer of value. The current runtime registry enables three model paths: a YAMNet-assisted, feature-based XGBoost heart-sound classifier; the single-lead, multi-input AuscultICor ECG network; and a PyTorch multi-head CNN for murmur characterization. The CNN uses four mel-spectrogram channels representing the aortic, mitral, pulmonary, and tricuspid auscultation positions and returns timing, shape, grading, pitch, quality, and location outputs. The enabled models do not issue a medical diagnosis. They produce structured prediction outputs that can assist review, support comparison between recordings, and demonstrate how trained artifacts are integrated into a live inference service.

The cloud and application layers turn model output into a usable workflow. A FastAPI service consumes MQTT messages, buffers session data, applies preprocessing, invokes the appropriate model, and persists results. Supabase provides authentication, relational data, storage, row-level security, and audit information. A Next.js dashboard manages devices, patients, sessions, waveforms, predictions, reports, alerts, and administrative views. n8n workflows process queued reports, device-health events, digests, enrichment steps, and escalations. Docker Compose and NGINX package and expose the services in a reproducible deployment. Together, these layers form a complete engineering system rather than a collection of disconnected prototypes.

> **Figure 1.1 placeholder — AscultiCor concept overview.** Use a simple five-stage, nontechnical user story: ECG/PCG sensing, compact AscultiCor device, secure transfer, one black-box analysis platform, and authorized review. Do not expose internal services, model branches, algorithms, or deployment architecture. Use the prompt supplied in `ASCULTICOR_BOOK_MASTER_PLAN.md`.

## 1.2 Problem Statement

### 1.2.1 Clinical and Accessibility Challenges

The central clinical challenge addressed by this project is not the absence of individual cardiac-measurement technologies; it is the gap between affordable acquisition and a coherent digital workflow. Acoustic stethoscopes are accessible but do not automatically preserve signals for comparison, remote review, or algorithmic analysis. ECG instruments preserve electrical data but may be costly, stationary, or isolated from PCG measurements and cloud applications. In settings with limited specialist availability, this fragmentation can delay the identification of recordings that deserve closer review.

Signal interpretation also varies. Heart sounds are affected by auscultation location, patient anatomy, breathing, ambient sound, contact pressure, and examiner experience. Surface ECG is affected by electrode placement, skin impedance, mains interference, muscle activity, baseline wander, and motion. Low-cost acquisition increases these challenges because the sensors, analog-to-digital converter, enclosure, and power system cannot match the specifications of regulated clinical equipment. A useful prototype must therefore acknowledge noise explicitly, reject unusable sessions when possible, and preserve enough context for a reviewer to understand the result.

The project must further avoid the common error of presenting an AI score as an autonomous diagnosis. Predictions are conditional on dataset quality, preprocessing, class balance, sensor characteristics, and the population represented during training. A technically responsible solution must show uncertainty and limitations, retain the underlying waveform, and state that final interpretation belongs to a qualified healthcare professional.

### 1.2.2 Engineering and Integration Challenges

Building an end-to-end platform introduces several coupled engineering problems. First, ECG and PCG require substantially different sampling rates. The firmware must preserve timing while handling high-frequency PCG acquisition, lower-frequency ECG acquisition, network communication, device control, and local status indication. Second, wireless transport can fail or become congested. The system needs bounded buffers, explicit session states, heartbeat messages, reconnection behavior, and validation of message identity.

Third, AI preprocessing during deployment must match the preprocessing used during training. Differences in sampling rate, filtering, normalization, feature order, window length, or label encoding can make an apparently loaded model produce invalid results. Fourth, the web application must isolate organizations and roles while providing convenient clinical workflows. Device registration, patient records, session ownership, waveform storage, predictions, reports, and alerts must be related without exposing data between tenants.

Fifth, automation and deployment introduce operational risks. Report generation can fail, external language-model providers can be unavailable, workflows can be duplicated, and alerts can be sent repeatedly. Secrets must not be embedded in source code or browser bundles. Services require health checks, structured logs, controlled network exposure, backups, and repeatable release procedures. AscultiCor therefore addresses a system-integration problem: how to construct an affordable cardiac-monitoring prototype whose hardware, data, AI, application, automation, and infrastructure layers agree on explicit interfaces.

The project problem can be stated formally as follows:

> **How can a low-cost, portable, and modular platform acquire ECG and PCG signals, transmit them reliably, analyze them using multiple machine-learning models, and present traceable results and alerts through a secure web and cloud workflow while remaining clear about prototype and clinical limitations?**

## 1.3 Aim of the Project

The aim of AscultiCor is to design, implement, and evaluate an integrated IoT and artificial-intelligence platform for synchronized cardiac-signal acquisition, remote monitoring, automated analysis, structured reporting, and operational alerting. The platform connects an ESP32-based ECG/PCG sensing device to a secure web application through MQTT, a real-time inference service, a multi-tenant backend, workflow automation, and a containerized deployment environment.

The engineering aim is broader than achieving a single model accuracy value. Success requires that a session can progress coherently from device provisioning to signal capture, inference, persistence, visualization, report processing, and alerting. Each result must remain associated with its organization, device, patient, and session. The platform should be sufficiently modular for individual components to be tested and improved without rewriting the complete system.

## 1.4 Project Objectives

The project was divided into five workstreams with clear ownership and integration boundaries. Table 1.1 summarizes the responsibility of each workstream.

**Table 1.1 — Team workstreams and principal objectives**

| Team workstream | Principal objective | Main outputs |
| --- | --- | --- |
| IoT and Hardware | Build the physical sensing device, firmware, ECG/PCG capture, preflight checks, and MQTT transport. | ESP32 firmware, sensor integration, PCB/power design, provisioning and topic contract. |
| Artificial Intelligence | Build the signal-processing, dataset, model-training, validation, and deployed inference layers. | Three enabled model pipelines, versioned artifacts, per-head evaluation evidence, and FastAPI inference. |
| Frontend and Backend | Build the user application, data model, APIs, session workflow, and role-based access. | Next.js dashboard, Supabase schema, storage, API routes, RLS and audit features. |
| n8n Automation | Automate reports, alerts, digests, enrichment, monitoring, and escalation. | Versioned n8n workflows, queue processing, retry and escalation logic. |
| Cloud and DevOps | Package, deploy, secure, monitor, back up, and operate the system. | Docker Compose, NGINX, Mosquitto, environment strategy, cloud VM runbooks. |

### 1.4.1 IoT and Hardware Objectives

The IoT and Hardware workstream aims to build a compact dual-modality acquisition device around the ESP32-WROOM-32. Its objectives are to integrate the AD8232 ECG analog front end and MAX9814 acoustic module; configure deterministic ECG and PCG sampling; detect poor electrode contact; buffer and frame signals without blocking the network stack; provision device credentials; and publish data, metadata, status, and heartbeats through a defined MQTT hierarchy. The workstream also develops a custom printed circuit board and power-management path using battery charging, protection, load sharing, and local decoupling to improve portability and signal stability.

### 1.4.2 Artificial Intelligence Objectives

The AI workstream aims to prepare reproducible ECG and PCG preprocessing pipelines, document the datasets and labels, address class imbalance, and train models for complementary analysis tasks. It compares a feature-based XGBoost approach with neural architectures for acoustic and electrical signals. A further objective is to deploy the trained artifacts behind a FastAPI service that consumes real sessions rather than remaining in a training notebook. Model configuration, label encoders, scalers, and failure behavior must be versioned with the model so that inference remains consistent with validation.

### 1.4.3 Frontend and Backend Objectives

The Frontend and Backend workstream aims to provide an understandable workflow for authenticated users. It manages organizations, profiles, roles, patients, devices, sessions, recordings, live metrics, predictions, reports, alerts, and audit events. The dashboard must support device onboarding, session initiation, live waveform display, historical review, and administration. Supabase row-level security and server-side authorization are used to preserve tenant isolation and restrict privileged operations. The web layer also provides APIs that translate user actions into device commands and structured service requests.

### 1.4.4 n8n Automation Objectives

The n8n workstream aims to convert system events and queued work into dependable operational flows. Its objectives include processing pending language-model reports, producing clinical alert notifications, monitoring stale or unhealthy devices, generating daily summaries, enriching completed recordings, checking system operations, and escalating unresolved events. Workflows must authenticate to internal APIs, avoid uncontrolled repetition, record failures, and support retry behavior. Generated text is treated as explanatory support and must not invent measurements or override structured model outputs.

### 1.4.5 Cloud and DevOps Objectives

The Cloud and DevOps workstream aims to create a reproducible environment for local development and cloud deployment. It packages the frontend, inference service, MQTT broker, and proxy; separates public and internal interfaces; manages domains, TLS termination, environment variables, and secrets; and defines health, logging, backup, and release procedures. The deployment should operate on a modest Linux virtual machine while keeping raw databases and internal service ports inaccessible from the public internet.

> **Figure 1.2 placeholder — Team workstream responsibility map.** Use five horizontal lanes and show the contract passed from each team to the next.

## 1.5 Project Scope and Boundaries

### 1.5.1 Included Scope

The implemented scope includes a portable prototype for single-lead ECG and PCG acquisition; embedded sampling, buffering, preflight validation, provisioning, and status feedback; MQTT-based command and data exchange; three enabled AI inference paths; a real-time inference service; a multi-tenant relational backend; private recording storage; a web dashboard for devices, patients, sessions, reports, alerts, and administration; n8n automation; and a Docker/NGINX cloud deployment strategy. Evaluation includes component-level tests and an end-to-end session path.

The project also includes documentation of known failure modes. These include disconnected electrodes, noisy acoustic coupling, device timeout, broker disconnection, incomplete recordings, model-loading failure, report-provider failure, authorization denial, stale devices, and service degradation. Treating these conditions as part of the scope is necessary because reliability is determined as much by controlled failure as by the nominal demonstration.

### 1.5.2 Excluded Scope and Medical Disclaimer

AscultiCor is not a certified medical device and has not undergone prospective clinical validation, electrical-safety certification, electromagnetic-compatibility testing, or regulatory approval. It is not intended to provide autonomous diagnosis, treatment decisions, or emergency response. The AD8232, MAX9814, ESP32 ADC, prototype enclosure, and current PCB are suitable for an educational prototype but are not substitutes for an isolated medical-grade acquisition chain. Results must therefore be described as algorithmic analysis or decision support and must be reviewed alongside the waveform and clinical context.

The current scope excludes a twelve-lead ECG, echocardiography, continuous hospital telemetry, integration with production electronic-health-record standards, a native mobile application, large-scale fleet management, and population-level clinical claims. It also excludes claims that performance measured on public datasets will transfer unchanged to signals captured by the prototype hardware. That transfer must be evaluated separately with ethically collected and appropriately governed data.

## 1.6 Proposed Solution Overview

The proposed solution follows a layered architecture. At the sensing layer, ECG electrodes feed the AD8232 and a chest-coupled microphone feeds the MAX9814. Their conditioned analog outputs connect to ESP32 ADC1 channels. Firmware uses hardware timing to acquire the two modalities, checks lead status and signal conditions, and packages samples into bounded chunks. Device identity and provisioning information are retained locally so that each publication can be associated with the correct organization and session.

At the communication layer, Mosquitto provides MQTT messaging. The dashboard creates a session and sends a start command through an authenticated server route. The device acknowledges the command, performs its preflight procedure, and publishes metadata followed by ECG and PCG chunks. Heartbeats and status messages provide operational visibility. The topic hierarchy includes organization, device, and session identifiers, enabling the inference service to reconstruct the correct session buffer.

At the intelligence layer, FastAPI subscribes to the relevant topics, validates message context, accumulates signals, calculates live metrics, finalizes recordings, applies modality-specific preprocessing, and invokes the model registry. Structured predictions are written to Supabase and associated with the session. The dashboard reads stored and live data through protected routes and presents waveforms, device state, patient context, model output, reports, and alerts.

At the automation layer, n8n invokes token-protected internal endpoints to process report queues and operational events. At the deployment layer, Docker Compose defines the services and networks while NGINX exposes only intended public routes. Secrets are supplied through environment configuration rather than embedded in code. This layered organization permits each workstream to evolve behind explicit contracts.

> **Figure 1.3 placeholder — AscultiCor functional scope and system boundary.** Show accepted inputs, four high-level capabilities, produced information objects, and an explicit outside-scope strip. Do not draw another patient-to-cloud architecture or expose implementation technologies. Use the prompt in `ASCULTICOR_BOOK_MASTER_PLAN.md`.

## 1.7 Main Contributions

The principal contribution of AscultiCor is the integration of five engineering disciplines into one traceable cardiac-monitoring prototype. Specific contributions include:

1. A low-cost dual-modality acquisition design that combines single-lead ECG and PCG sensing with an ESP32 edge device.
2. A custom PCB and portable power architecture incorporating lithium-ion charging, protection, load sharing, and analog-noise mitigation.
3. A firmware implementation that handles dual-rate acquisition, preflight checks, device provisioning, session control, chunked MQTT transport, and device heartbeats.
4. A registry-driven analysis layer combining YAMNet and engineered PCG features with XGBoost, a multi-input single-lead ECG network, and an active six-head CNN for murmur timing, shape, grading, pitch, quality, and location.
5. A deployed inference path that connects live MQTT sessions to preprocessing, model artifacts, persistent records, and application views.
6. A multi-tenant web and backend design with patients, devices, sessions, recordings, predictions, reports, alerts, roles, row-level security, and audit information.
7. Versioned workflow automation for reports, clinical and device alerts, daily digests, enrichment, monitoring, and escalation.
8. A containerized deployment architecture with public/internal service separation, reverse proxying, health checks, environment management, and operational runbooks.
9. Explicit documentation of prototype boundaries, security risks, data-quality constraints, and the distinction between engineering analysis and clinical diagnosis.

These contributions are best understood as a coherent system. A strong classifier without reliable acquisition would analyze unusable signals; reliable acquisition without secure identity would create ambiguous records; a dashboard without deployment and monitoring would remain a local demonstration. AscultiCor therefore emphasizes the contracts and evidence that connect each component.

## 1.8 Book Organization

The remainder of this book is organized according to the structure approved by the project supervisor. Chapter 2 presents the medical and technical background, reviews relevant research and comparable systems, and identifies the gap addressed by AscultiCor. Chapter 3 provides the complete design and implementation. It begins with the common architecture and then documents the IoT and Hardware, Artificial Intelligence, Frontend and Backend, n8n Automation, and Cloud and DevOps workstreams in consecutive sections before explaining cross-team integration.

Chapter 4 reports evaluation methods, measured results, figures, curves, confusion matrices, functional tests, performance observations, and end-to-end evidence. It distinguishes real measurements from conceptual illustrations and discusses limitations and threats to validity. Chapter 5 concludes the project, evaluates achievement of the stated objectives, and proposes future improvements across hardware, AI, application, automation, infrastructure, security, and clinical validation. Chapter 6 contains the references in IEEE numeric style. Appendices provide specifications and detailed evidence that would interrupt the main narrative, including pin maps, MQTT payloads, schema references, model configurations, workflow inventory, deployment checklists, and test cases.
