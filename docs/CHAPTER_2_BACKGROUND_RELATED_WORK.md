# Chapter 2: Background and Related Work

## 2.1 Medical Background

This chapter establishes the medical and engineering concepts required to understand the AscultiCor design. It first explains the cardiac cycle, electrocardiography, and phonocardiography, then reviews signal-acquisition constraints, artificial-intelligence approaches, remote-monitoring architectures, and comparable research systems. The purpose is not to provide clinical training or diagnostic guidance. It is to identify the physiological events represented by the signals, the assumptions made by computational methods, and the gap addressed by the proposed platform.

### 2.1.1 Cardiac Anatomy and the Cardiac Cycle

The heart is a muscular pump divided into right and left sides, each containing an atrium and a ventricle. The right side receives deoxygenated systemic venous blood and pumps it through the pulmonary circulation. The left side receives oxygenated pulmonary venous blood and pumps it into the systemic circulation. Four valves maintain predominantly unidirectional flow: the tricuspid valve between the right atrium and ventricle, the pulmonary valve between the right ventricle and pulmonary artery, the mitral valve between the left atrium and ventricle, and the aortic valve between the left ventricle and aorta [5].

Cardiac activity is commonly described as a repeating cycle of electrical activation, mechanical contraction, pressure change, valve movement, and blood flow. During ventricular diastole, ventricular pressure is relatively low and the atrioventricular valves are open, allowing ventricular filling. Atrial contraction contributes to late filling. Ventricular depolarization then initiates systole. Rising ventricular pressure closes the mitral and tricuspid valves and, once ventricular pressure exceeds arterial pressure, opens the aortic and pulmonary valves for ejection. Ventricular repolarization is followed by relaxation; declining ventricular pressure closes the semilunar valves, after which the atrioventricular valves open and a new filling period begins.

This sequence creates the relationship between ECG and PCG used throughout the project. Electrical activation normally precedes the associated mechanical event. The QRS complex is followed by ventricular contraction and the first heart sound, while ventricular repolarization and the end of ejection occur around the transition toward the second heart sound. The relationship is not a fixed point-to-point mapping because electrical conduction, electromechanical delay, valve dynamics, loading conditions, and signal-transmission paths vary. Nevertheless, observing both modalities can provide a richer temporal description than either signal alone.

The first heart sound, S1, is associated primarily with closure and tensioning of the mitral and tricuspid valve apparatus at the beginning of ventricular systole. The second heart sound, S2, is associated primarily with closure of the aortic and pulmonary valves near the end of systole. Physiological splitting can occur because right- and left-sided valve events are not perfectly simultaneous. S3 and S4 are lower-frequency sounds associated with ventricular filling and atrial contraction; their interpretation depends on age and clinical context. Murmurs are longer-duration acoustic phenomena produced by turbulent or otherwise disturbed blood flow. They may be described by timing, location, radiation, shape, intensity, pitch, and quality, but acoustic evidence alone does not establish an anatomical diagnosis.

> **Figure 2.1 placeholder — Cardiac cycle and multimodal timing.** Show one cycle with simplified atrial and ventricular electrical activation, ventricular pressure, valve states, ECG P–QRS–T morphology, and PCG S1/S2 events on a shared horizontal time axis. The figure must be conceptual and must not imply exact universal timings.

### 2.1.2 ECG Morphology and Rhythm Abnormalities

An electrocardiogram measures voltage differences created by cardiac electrical activity as observed through electrodes on the body surface. The measured waveform depends on lead orientation, electrode placement, anatomy, respiration, conductivity, and the electrical axis of the heart. A standard clinical ECG uses twelve leads to observe the heart from multiple projections [6]. AscultiCor instead uses a low-cost single-lead configuration suitable for rhythm-oriented prototype analysis; this narrower view cannot reproduce the diagnostic coverage of a clinical twelve-lead system.

The P wave represents atrial depolarization. The PR interval includes propagation from the atria through the atrioventricular conduction system. The QRS complex represents ventricular depolarization, and the ST segment and T wave are associated with phases of ventricular repolarization. Heart rate can be estimated from consecutive R-wave intervals when QRS detections are reliable. Rhythm analysis also considers regularity, atrial activity, beat morphology, and relationships between waves. Signal-processing algorithms frequently use QRS complexes because their energy and relatively sharp morphology make them more detectable than lower-amplitude components.

Arrhythmia is a broad term for abnormal cardiac rhythm or conduction. Computational ECG datasets often organize individual beats into research classes such as normal, supraventricular ectopic, ventricular ectopic, fusion, paced, or unclassifiable beats. These labels are useful for algorithm evaluation but should not be confused with a complete clinical interpretation. A single short segment may not contain an intermittent abnormality, and one detected abnormal beat does not define the patient's overall condition. Moreover, morphology differs between leads and individuals. A model trained on a specific lead configuration and acquisition system can experience domain shift when applied to another sensor.

The MIT-BIH Arrhythmia Database is widely used for beat-classification research. It contains annotated ambulatory ECG recordings selected from long-term Holter recordings, with most records including a modified limb lead II and a second chest lead [4]. Its expert annotations and 360 Hz digitization rate make it valuable for reproducible experiments. At the same time, it is an older, modest-sized, deliberately challenging dataset. Patient-independent splitting, class imbalance, record selection, and mapping from original annotations to broader classes materially affect reported performance. These factors are central to the evaluation strategy discussed later in this book.

> **Figure 2.2 placeholder — Simplified ECG morphology.** Present a clean single cardiac cycle labeled P wave, PR interval, QRS complex, ST segment, T wave, and R–R interval. Add a note that morphology and intervals vary and that the illustration is not a diagnostic reference.

### 2.1.3 Heart Sounds, Murmurs, and PCG

Phonocardiography converts cardiac acoustic vibrations into a waveform that can be stored and processed [7]. Unlike an ordinary audio recording, a useful PCG must preserve the low-frequency and transient content of heart sounds while controlling environmental noise, friction, and handling artifacts. The acoustic signal changes substantially with auscultation location. The traditional aortic, pulmonary, tricuspid, and mitral areas emphasize different structures and flow paths; consequently, location metadata is important when interpreting recordings or training a model.

A normal PCG commonly contains S1 and S2 separated by systolic and diastolic intervals. Murmurs may occupy part or all of systole or diastole. Descriptive characteristics include early, middle, late, or continuous timing; crescendo, decrescendo, diamond, or plateau shape; low, medium, or high pitch; and qualities such as blowing, harsh, or musical. These descriptors are not always consistently labeled, and inter-observer disagreement can occur. Signal quality further complicates annotation because breathing, speech, clothing movement, poor contact, and ambient sounds can resemble or obscure cardiac events.

The PhysioNet/Computing in Cardiology Challenge 2016 created an influential benchmark for classifying short PCG recordings as normal or abnormal, with an additional concept of recordings that cannot be confidently evaluated [3]. The data were gathered from heterogeneous clinical and non-clinical sources, which makes the benchmark useful for studying robustness. The later CirCor DigiScope dataset added pediatric screening recordings from multiple auscultation locations and structured murmur descriptions including timing, shape, pitch, grade, and quality [9]. These resources support reproducible research but also illustrate the difficulty of transferring a model across populations, devices, recording protocols, and label definitions.

AscultiCor's registry separates broad heart-sound screening from detailed murmur characterization. The enabled XGBoost classifier first identifies Artifact, Murmur, or Normal recordings. When Murmur is detected, the active PyTorch CNN analyzes mel-spectrogram input and returns six characteristic heads: timing, shape, grading, pitch, quality, and location. This gated design prevents detailed murmur attributes from being presented when the broad classifier does not detect a murmur. Chapter 4 reports the delivered confusion matrices for the active CNN while treating older artifacts under `models/model*` as historical only.

> **Figure 2.3 placeholder — PCG cycle and murmur timing.** Show S1 and S2 with systolic and diastolic intervals, then separate stylized examples of systolic and diastolic murmur envelopes. Do not attach disease names or measured amplitudes.

**Table 2.1 — Complementary characteristics of ECG and PCG**

| Characteristic | ECG | PCG |
| --- | --- | --- |
| Primary physical phenomenon | Body-surface electrical potential differences | Chest-wall acoustic and mechanical vibrations |
| Typical events | P wave, QRS complex, T wave | S1, S2, additional sounds and murmurs |
| Main prototype sensor path | Electrodes and AD8232 analog front end | Chest-coupled microphone and MAX9814 amplifier |
| AscultiCor capture rate | 500 Hz before inference resampling | Approximately 22.05 kHz target rate |
| Frequent artifacts | Baseline wander, mains interference, muscle activity, lead motion | Ambient sound, breathing, friction, speech, poor acoustic coupling |
| Main project use | Rhythm- and beat-oriented analysis | Heart-sound state and murmur-characteristic analysis |
| Important limitation | Single lead does not replace a twelve-lead ECG | Acoustic output depends strongly on location and coupling |

## 2.2 Biomedical Signal Acquisition and Processing

### 2.2.1 ECG Acquisition Principles

Surface ECG potentials are small relative to many environmental interference sources. A practical acquisition chain therefore requires electrodes with stable contact, a high-input-impedance differential amplifier, strong common-mode rejection, controlled bandwidth, and an analog-to-digital converter with an appropriate input range. Electrode–skin impedance changes with preparation, adhesive quality, perspiration, movement, and recording duration. Imbalance between electrode impedances converts common-mode interference into differential error, reducing the benefit of the instrumentation amplifier.

The AD8232 used by AscultiCor integrates functions intended for single-lead biopotential conditioning. Its output is sampled by an ESP32 ADC channel, while the LO+ and LO− signals allow firmware to identify disconnected or poorly attached leads. Lead-off detection is valuable because a disconnected input can still produce a varying waveform that a naïve algorithm might process. The project uses a preflight stage so that obvious contact failures can stop a session before data are interpreted.

Sampling rate determines the highest representable frequency and affects time resolution. A rate that is too low aliases higher-frequency content, while an unnecessarily high rate increases buffer, storage, transmission, and processing requirements. AscultiCor firmware captures ECG at 500 Hz. The delivered ECG artifact expects 125 Hz input, so inference resamples the captured waveform before creating fixed-length windows. This conversion must include explicit metadata and controlled preprocessing; simply reinterpreting 500 Hz samples at the model rate would change apparent durations and waveform morphology.

Digital preprocessing commonly includes removal of baseline drift, suppression of high-frequency noise, normalization, segmentation around detected beats, and rejection of corrupted intervals. Each operation can alter diagnostically relevant morphology if applied aggressively. Zero-phase offline filtering avoids phase displacement but may not be suitable for causal live processing. Normalization can stabilize model input while removing absolute-amplitude information. The correct pipeline therefore depends on the model task and must be identical during training and deployment.

### 2.2.2 PCG Acquisition Principles

PCG acquisition begins with mechanical coupling between the chest wall and a sensing element. Conventional electronic stethoscopes may use microphones, piezoelectric elements, or accelerometers with designed acoustic chambers. AscultiCor uses a MAX9814 analog microphone amplifier in a stethoscope-like interface. The module includes automatic gain control, which helps avoid severe amplitude variation but also changes the signal envelope according to its attack and release behavior. This is useful for prototype robustness yet must be documented because model input is no longer the untouched chest-wall pressure waveform.

The PCG sampling rate is much higher than the ECG rate because the signal is treated as audio and because general audio feature-extraction libraries commonly expect standardized rates such as 22,050 Hz. Most cardiac energy is concentrated far below the Nyquist limit of that rate, but oversampling simplifies anti-aliasing, preserves transient structure, and supports mel-spectrogram and spectral-feature computation. It also creates the dominant data volume in a dual-signal session. Firmware must therefore move PCG samples into chunks without delaying ECG acquisition or exhausting memory.

PCG preprocessing can include removal of DC offset, band-limiting, amplitude normalization, resampling, segmentation, time-frequency transformation, and feature extraction. Handcrafted approaches compute features such as mel-frequency cepstral coefficients, spectral centroid, spectral bandwidth, roll-off, zero-crossing rate, and temporal statistics. Deep-learning approaches frequently use raw segments, spectrograms, or log-mel representations. A spectrogram exposes the evolution of frequency energy over time, making it suitable for convolutional architectures, but window size and hop length trade temporal resolution against frequency resolution.

Accurate segmentation into S1, systole, S2, and diastole can improve interpretability and permit phase-specific features. Springer et al. developed a widely referenced hidden semi-Markov approach for heart-sound segmentation that models cardiac-state duration and observations [13]. Other systems avoid explicit segmentation and let a neural network learn directly from fixed-duration windows. The latter reduces dependency on a separate segmenter, but it may require more data and makes failure analysis more difficult.

### 2.2.3 Noise, Motion Artifacts, and Signal Quality

Biomedical signals are non-stationary and strongly affected by the measurement interface. Noise should not be treated as a single additive component. It includes sensor noise, quantization error, electromagnetic interference, power-supply ripple, radio-frequency coupling, electrode movement, muscle activity, respiration, ambient sound, and software artifacts such as dropped or duplicated samples. Different sources require different controls.

Hardware layout is the first control boundary. Sensitive analog traces should be short and separated from digital switching nodes and the ESP32 antenna. Stable regulation and local decoupling reduce supply modulation during Wi-Fi current bursts. Mechanical strain relief prevents cable movement from reaching electrodes and the acoustic sensor. At the firmware layer, deterministic timers, bounded buffers, monotonically increasing counters, and session metadata help distinguish biological changes from transport failures. At the analysis layer, quality checks and artifact-aware preprocessing can reject unusable intervals rather than forcing a prediction.

Signal-quality assessment is particularly important in AI pipelines because a model generally produces an output for any numeric tensor of the expected shape. Confidence values do not prove that the input represents valid physiology. A corrupted input can be far outside the training distribution while still receiving a high softmax probability. AscultiCor therefore uses device preflight checks, retains waveform evidence, marks demo-mode output, and treats model results as advisory. Future versions should add dedicated signal-quality models and calibrated out-of-distribution detection.

**Table 2.2 — Major acquisition challenges and mitigation layers**

| Challenge | Observable effect | Primary mitigation | Residual risk |
| --- | --- | --- | --- |
| Poor ECG electrode contact | Flat, saturated, drifting, or intermittent ECG | Skin preparation, adhesive electrodes, lead-off preflight | Marginal contact may pass a binary lead-off check |
| Patient movement and muscle activity | Baseline displacement and high-frequency transients | Stable placement, strain relief, quality filtering | Motion can resemble abnormal beat morphology |
| Ambient and handling sound | PCG masking and impulsive artifacts | Acoustic interface, quiet environment, controlled handling | AGC may amplify background noise during weak contact |
| Wi-Fi current bursts and digital switching | Repeated analog spikes or reference-voltage movement | PCB separation, regulated supply, 0.1 µF and 10 µF decoupling | Internal ESP32 ADC non-linearity remains |
| Sampling-rate mismatch | Time-scale distortion and incompatible model windows | Explicit metadata and validated resampling | Resampling cannot recover information lost at acquisition |
| Packet loss or duplication | Missing or repeated waveform segments | Sequence/session metadata, bounded buffering, heartbeat monitoring | QoS and reconnection cannot guarantee perfect continuity |
| Dataset-to-device domain shift | Reduced real-world model performance | Multi-source data, device-specific validation, cautious UI language | Clinical generalization remains unproven |

## 2.3 Artificial Intelligence for Cardiac Signals

### 2.3.1 Traditional Feature-Based Methods

Traditional biomedical-signal classifiers separate feature engineering from statistical learning. For ECG, features may include R–R intervals, QRS width, waveform amplitudes, derivatives, wavelet coefficients, morphology templates, and heart-rate variability measures. For PCG, features may include interval durations, band energy, entropy, spectral peaks, cepstral coefficients, and time-frequency summaries. A classifier such as logistic regression, support vector machine, random forest, or gradient-boosted trees maps these features to labels.

Feature-based systems remain valuable for constrained devices and moderate-sized datasets. Their input dimension is smaller than a raw waveform, training can be efficient, and feature importance can provide partial interpretability. XGBoost combines many decision trees sequentially so that later trees focus on residual errors. Regularization, tree depth, learning rate, row sampling, and feature sampling control complexity. AscultiCor uses an XGBoost model for broad PCG classification because spectral and cepstral descriptors provide a compact representation and the resulting artifact is lightweight enough for a modest inference service.

The central weakness of feature engineering is that the chosen features encode assumptions. A useful murmur signature may be lost if the frequency bands, window length, or summary statistic are poorly selected. Correlated or scale-sensitive features can destabilize some classifiers. Feature computation during deployment must exactly reproduce training order, scaling, padding, and missing-value behavior. The scaler and label encoder are therefore model artifacts, not optional conveniences.

### 2.3.2 Deep Learning Methods

Deep-learning models learn hierarchical representations from waveforms or time-frequency inputs. One-dimensional convolutional neural networks identify local motifs and can expand their receptive field through depth, dilation, or pooling. Two-dimensional CNNs applied to spectrograms learn joint time-frequency patterns. Recurrent architectures such as long short-term memory networks model ordered dependencies, while bidirectional LSTMs use both earlier and later context within a completed window. Attention and transformer-based methods can assign different importance to time steps, though they commonly require larger datasets and careful regularization.

For ECG, Hannun et al. trained a deep neural network on 91,232 single-lead ambulatory ECGs from 53,549 patients and evaluated twelve rhythm classes against cardiologist consensus [10]. Ribeiro et al. later demonstrated large-scale deep learning on more than two million labeled twelve-lead ECG examinations for six abnormalities [11]. These studies show the potential of deep representation learning, but their scale, hardware, labels, and validation environments differ greatly from a graduation prototype. Their results cannot be transferred numerically to AscultiCor.

For PCG, convolutional models commonly operate on spectrograms or learned audio embeddings. Deep residual networks have been combined with cepstral or spectral representations [14]. Clinical digital-stethoscope research has also evaluated murmur detection against expert annotation and echocardiography. Chorba et al. trained a deep-learning system using digital-stethoscope recordings and prospectively tested it on recordings from four auscultation positions [12]. Such studies emphasize the importance of clinical reference standards and acquisition protocols, not only cross-validation on a public dataset.

The current AscultiCor ECG path uses the single-lead AuscultICor network with three inputs: a 500-sample ECG window, nine server-derived R–R/heart-rate-variability statistics, and a forecast-context tensor. Its outputs include an arrhythmia-class head, an experimental risk head, and an auxiliary waveform head. The active murmur-characterization path uses a separate multi-output CNN whose shared representation feeds timing, shape, grading, pitch, quality, and location heads. Multi-output learning can share acoustic representations between related labels, but unequal class support and inconsistent annotation remain important interpretation risks.

> **Figure 2.4 placeholder — Taxonomy of cardiac-signal AI methods.** Compare feature-based pipelines, 1D waveform CNN/RNN pipelines, and 2D spectrogram CNN pipelines. Show training artifacts and deployment preprocessing as part of every branch.

### 2.3.3 Evaluation Metrics and Clinical Caution

Accuracy alone is inadequate when classes are imbalanced. If normal examples dominate, a model can achieve high accuracy while missing clinically important minority classes. Sensitivity or recall measures the fraction of positive examples correctly identified. Specificity measures the fraction of negative examples correctly rejected. Precision measures the fraction of positive predictions that are correct. F1 score is the harmonic mean of precision and recall. Macro averages give each class equal weight, whereas weighted averages are influenced by class frequency. Receiver-operating-characteristic and precision–recall curves examine threshold behavior; precision–recall curves are often more informative when positive cases are rare.

Confusion matrices reveal which labels are mixed. Calibration evaluates whether predicted probabilities correspond to observed frequencies. Confidence intervals describe sampling uncertainty, and repeated or nested validation can expose sensitivity to split selection. Patient-level splitting is essential when several recordings or beats originate from the same person. A random sample-level split can leak patient-specific morphology into both training and test sets, producing an overoptimistic estimate.

External validation is stronger than internal validation because it evaluates a different institution, device, population, or collection period. Prospective validation tests the model inside the intended workflow. AscultiCor has not completed clinical external or prospective validation, so Chapter 4 must report engineering validation without implying regulatory or diagnostic performance. Model outputs are accompanied by waveform context and a disclaimer. This approach aligns with WHO guidance that AI for health should preserve human autonomy, transparency, accountability, inclusiveness, safety, and public benefit [8].

## 2.4 IoT and Remote Patient Monitoring Systems

Remote patient monitoring uses digitally transmitted health information to support observation outside a traditional face-to-face encounter. Reviews describe diverse interventions ranging from manual symptom reporting to wearables, connected clinical devices, portals, and automated alerts [15], [16]. The evidence varies by condition, intervention, adherence, and health-system integration. Consequently, the term remote monitoring should not imply a guaranteed clinical benefit; the device, workflow, response protocol, and target population must be considered together.

An IoT monitoring platform contains several trust boundaries. The sensing node obtains physical measurements. A local or wide-area network transports messages. A broker or gateway routes data. Backend services authenticate actors, persist records, and perform analysis. User applications present state and allow commands. Automation services create notifications or downstream tasks. Operations components monitor the platform itself. Failure at one boundary can propagate—for example, an incorrect device identity can misassociate a valid waveform, while an unavailable alert destination can make a successful model prediction operationally ineffective.

MQTT is well suited to constrained publish–subscribe systems because publishers and subscribers are decoupled by topics. A cardiac device can publish status, metadata, ECG, PCG, and heartbeat messages without knowing which services consume them. Topic design becomes part of the data model. AscultiCor includes organization, device, and session identifiers in its topic hierarchy so that multi-tenant context is explicit. Quality of Service levels control delivery behavior, but higher QoS does not solve every problem: duplicate delivery, stale retained messages, session interruption, and application-level ordering still require explicit handling.

Device provisioning is as important as signal transmission. A device should not contain a universal shared secret or accept arbitrary organization identifiers. The platform needs a bootstrap process that binds a physical device to a database record and obtains scoped broker credentials. Credential rotation, revocation, rate limiting, and secure transport are production concerns. AscultiCor implements a prototype bootstrap and broker access-control design while documenting that public raw MQTT without TLS is inappropriate for clinical deployment.

Remote monitoring also changes human workflow. Alerts should indicate what happened, identify the session, and support acknowledgement or escalation. Excessive sensitivity can create alert fatigue; excessive specificity can miss events. A dashboard should distinguish live state, historical data, algorithmic output, system health, and demo content. AscultiCor uses n8n to demonstrate event processing but does not claim that an automated message constitutes a medical intervention.

## 2.5 Web, Cloud, and Workflow Automation in Healthcare

A browser-based application can make a monitoring platform accessible across common computers without installing specialized software. Modern web frameworks separate server-rendered or server-side operations from interactive client components. This boundary is security-critical: service-role database keys, broker administrator credentials, and internal API tokens must remain on the server. The browser should receive only the data and permissions required for the authenticated user.

Healthcare-oriented data commonly includes identity, measurements, recordings, derived results, notes, and audit events. A relational model is useful because a prediction belongs to a session, a session belongs to a patient and device, and those records belong to an organization. Multi-tenancy requires every access path to preserve that organization boundary. Supabase provides PostgreSQL, authentication, object storage, and row-level security. Row-level policies reduce reliance on each application query remembering a tenant filter, although policy correctness must still be tested.

Waveform storage requires a distinction between summary data and bulk recordings. Small live-metric rows can support responsive dashboards, while completed signal files belong in object storage with time-limited access. Database references should identify the object, checksum, modality, sampling rate, duration, and session. This separation reduces database load and allows storage policies to evolve independently.

Cloud deployment increases availability but expands the attack surface. A reverse proxy should terminate HTTPS, route intended paths, and hide internal services. Containers make dependencies and service boundaries reproducible, but they do not provide security automatically. Images require version control, secrets must be injected safely, health checks must reflect readiness, and backups must be tested. Resource constraints are especially relevant when a web server, inference service, broker, automation engine, and proxy share a small virtual machine.

Workflow automation connects events to repeatable actions. n8n represents triggers, API requests, transformations, conditions, retries, and destinations as versioned workflows. In AscultiCor it handles pending reports, device-health checks, clinical alerts, summaries, enrichment, operational monitoring, and escalation. Automation is useful for asynchronous work that should not block the user request. It also introduces risks: duplicate execution, partial failure, unbounded retries, secret exposure, and non-idempotent actions. Internal endpoints therefore require authentication and workflows must record state transitions.

Language-model report generation deserves separate caution. An LLM can transform structured model outputs and session metadata into readable prose, but it can omit, distort, or invent details. A safe report pipeline constrains the input schema, labels template/demo mode, preserves structured measurements as the source of truth, limits sensitive data, and requires human review. The report should not infer diagnoses that are absent from validated structured outputs.

## 2.6 Review of Previous Research and Comparable Systems

### 2.6.1 Automated Heart-Sound Classification

Early PCG analysis relied on signal segmentation and handcrafted temporal or spectral features. Researchers modeled S1, systole, S2, and diastole explicitly, then derived cycle statistics or classified segments. This approach remains attractive because errors can be traced to segmentation or feature behavior. However, abnormal rhythms, weak sounds, and noise can break assumptions about cycle duration.

The PhysioNet/CinC 2016 Challenge accelerated comparison of normal/abnormal classifiers on a shared heterogeneous corpus [3]. Challenge systems combined segmentation, feature engineering, ensemble classifiers, and neural networks. The benchmark demonstrated that recording quality and source heterogeneity were central problems, not peripheral noise. It also established sensitivity and specificity as paired measures rather than rewarding a single majority-class accuracy.

The CirCor DigiScope dataset extended the problem toward murmur presence and outcome classification in pediatric screening data [9]. It includes multiple auscultation locations and structured murmur descriptions. This supports research on timing and acoustic characteristics, but its pediatric screening population differs from general adult monitoring. A model trained on CirCor should therefore not be described as universally validated.

Recent work uses convolutional and residual architectures on log-mel or cepstral representations [14]. Commercial digital-stethoscope research has progressed toward clinical reference standards. Chorba et al. evaluated automated murmur detection using recordings from four primary auscultation locations and echocardiographic/expert references [12]. These systems demonstrate the value of standardized sensor hardware and prospective data. AscultiCor differs in emphasizing an open, low-cost, end-to-end engineering stack and explicit multi-workstream integration rather than claiming equivalent clinical validation.

### 2.6.2 ECG Arrhythmia Classification

Traditional arrhythmia algorithms detect QRS complexes, calculate intervals, extract morphology, and apply rules or statistical classifiers. Deep networks reduce manual feature design and can learn directly from long segments. Hannun et al. showed strong performance for twelve rhythm classes using a large single-lead ambulatory dataset and cardiologist consensus [10]. Ribeiro et al. demonstrated a residual network trained on a very large twelve-lead telehealth dataset [11]. These studies benefited from data volumes and annotation processes beyond the scope of most academic prototypes.

MIT-BIH remains useful because it is public, annotated, and reproducible [4]. Many heartbeat-classification studies use it with AAMI-inspired class mappings. Comparisons are difficult when authors use different beat exclusions, patient splits, augmentation, resampling, and test records. Random beat-level splitting is particularly problematic because beats from the same record share morphology and noise. AscultiCor therefore needs to report its exact split method, class mapping, window definition, and patient separation rather than presenting a metric without protocol.

### 2.6.3 Digital Stethoscopes and Low-Cost Monitoring Devices

Digital stethoscopes convert auscultation into recordable and shareable data. Commercial designs often combine a designed chest piece, calibrated acoustic path, noise reduction, and a mobile or cloud application. Some devices incorporate a single ECG channel, demonstrating that combined electrical and acoustic acquisition is practical. Published work on ECG-enabled digital stethoscopes has explored tasks such as reduced ejection-fraction screening, but these studies use controlled hardware and clinical cohorts and are not directly comparable to an ESP32 prototype.

Low-cost research devices prioritize availability, modularity, and learning. ESP32-class microcontrollers provide wireless connectivity and ADC inputs, but internal ADC noise, non-linearity, radio-frequency coupling, and limited medical isolation constrain quantitative accuracy. A breadboard can prove connectivity but introduces unstable wiring and parasitic effects. AscultiCor's custom PCB and power-management design address part of this gap by improving mechanical stability, routing, charging, protection, load sharing, and decoupling while still being explicitly non-clinical.

### 2.6.4 Integrated ECG-PCG Systems

ECG and PCG integration can support temporal alignment between electrical and mechanical events. Research systems have used this relationship for heart-sound segmentation, electromechanical timing, valve-event analysis, and combined classification. The benefit depends on synchronization quality. If signals are captured by independent clocks or transmitted without shared timestamps, apparent delay may reflect the system rather than physiology.

AscultiCor captures both channels under one microcontroller and one session state, which simplifies identity and timing. The rates are different, and the current prototype is not designed for precise clinical measurement of electromechanical intervals. Its integration contribution is operational: one command produces coordinated modalities, metadata, storage, AI outputs, and review. This creates a foundation for later synchronization studies without overstating the present hardware precision.

### 2.6.5 Remote Dashboards and Clinical Alert Platforms

Remote-monitoring research often focuses on a wearable or a clinical outcome, while software architecture is summarized briefly. System prototypes frequently demonstrate sensor-to-cloud transmission and a live graph but omit tenant isolation, provisioning, auditability, model artifact management, workflow retries, and operations. Conversely, mature cloud platforms may rely on proprietary sensors and unavailable inference services.

AscultiCor aims to make the complete chain inspectable. The dashboard is connected to authenticated organizations, patients, devices, and sessions; the inference service consumes the same topic contract used by firmware; automation invokes protected APIs; and deployment files define service boundaries. This breadth is a graduation-project strength, although it reduces the depth possible in clinical validation. The correct comparison is therefore with integrated research platforms, not with a regulated hospital monitor or a model trained on millions of examinations.

**Table 2.3 — Selected related work and relevance to AscultiCor**

| Work | Modality and scale | Main contribution | Limitation relative to AscultiCor's objective |
| --- | --- | --- | --- |
| PhysioNet/CinC 2016 [3] | Heterogeneous short PCG recordings | Shared benchmark for normal/abnormal heart-sound classification | Dataset and challenge, not an end-to-end device/cloud workflow |
| CirCor DigiScope [9] | Multi-location pediatric PCG screening | Murmur presence, outcome, location, and characteristic labels | Population and acquisition protocol differ from the prototype target |
| MIT-BIH Arrhythmia Database [4] | Annotated ambulatory ECG records | Reproducible ECG beat and rhythm research resource | Older, limited cohort and different sensor/lead domain |
| Hannun et al. [10] | 91,232 single-lead ECGs | Large-scale end-to-end rhythm classification | Proprietary-scale clinical data and dedicated acquisition device |
| Ribeiro et al. [11] | More than two million twelve-lead ECG exams | Large-scale residual-network ECG interpretation | Twelve-lead clinical system, not low-cost ECG/PCG IoT integration |
| Chorba et al. [12] | Digital-stethoscope recordings with clinical references | Prospective murmur-detection evaluation | Commercial calibrated hardware and focused clinical task |
| Springer et al. [13] | PCG state segmentation datasets | Robust probabilistic segmentation of cardiac-cycle states | Segmentation component rather than a full monitoring platform |
| AscultiCor | Low-cost ECG and PCG prototype with five software workstreams | Inspectable acquisition-to-dashboard, AI, automation, and deployment integration | Educational prototype without prospective clinical validation |

## 2.7 Comparative Analysis and Research Gap

The literature demonstrates strong results for individual components: annotated ECG and PCG datasets, deep classification models, digital stethoscopes, remote-monitoring interventions, and cloud dashboards. The remaining gap for this project is not that no cardiac classifier or connected sensor exists. The gap is the availability of an affordable, reproducible, and inspectable educational platform that joins dual-modality acquisition to secure identity, live messaging, multiple AI paths, structured backend records, a role-aware web workflow, automation, and deployment operations.

Four observations define this gap. First, model papers often begin with a prepared dataset and end with evaluation metrics. They do not address electrode contact, acoustic coupling, provisioning, packet framing, session state, or storage. Second, device papers often end at signal transmission or a live plot and do not integrate reproducible model artifacts, patient/session relationships, report processing, and role-based access. Third, dashboard prototypes may visualize synthetic or uploaded data rather than a real device command-and-capture path. Fourth, clinical commercial platforms are commonly closed, calibrated, and regulated under conditions that cannot be reproduced in a graduation laboratory.

AscultiCor addresses the engineering intersection of these concerns. The hardware and firmware workstream creates real ECG/PCG sessions. The AI workstream turns completed recordings into structured analysis. The frontend/backend workstream preserves identity, access, and review. The n8n workstream handles asynchronous reports and operational events. The Cloud and DevOps workstream packages, secures, observes, and documents the deployment. Explicit topic, API, schema, model, and environment contracts connect the workstreams.

The platform does not close the clinical evidence gap. It does not prove that its outputs improve outcomes, generalize across populations, or match specialist interpretation. Instead, it creates the technical substrate on which such studies could later be performed. This distinction shapes Chapter 4: results are reported as engineering and dataset-validation evidence, with clear separation between public-dataset performance, prototype-device behavior, demo fallbacks, and measured end-to-end function.

**Table 2.4 — Research gaps and AscultiCor design responses**

| Identified gap | AscultiCor response | Evidence required in this book |
| --- | --- | --- |
| ECG and PCG handled as separate demonstrations | One ESP32 session captures and identifies both modalities | Dual-rate sampling traces, session metadata, synchronized workflow diagram |
| Public-dataset model disconnected from real acquisition | MQTT inference service performs deployment preprocessing and loads versioned artifacts | Training/deployment preprocessing comparison and real-session inference test |
| Sensor-to-cloud prototype without secure domain model | Organization/device/session topic hierarchy plus Supabase tenant relationships | Topic contract, schema, RLS tests, and authorization matrix |
| Dashboard without operational automation | Versioned n8n reports, alerts, health checks, digests, and escalation | Workflow execution evidence, retry tests, and alert-latency measurements |
| Local demonstration without reproducible deployment | Docker Compose, NGINX, environment profiles, health checks, backups, and runbooks | Deployment diagram, resource observations, recovery and security tests |
| AI claims without clinical boundaries | Advisory language, waveform retention, demo-mode labels, limitations, and human review | Screenshots, report disclaimer, error analysis, and threats-to-validity discussion |

> **Figure 2.5 placeholder — Related-work landscape and AscultiCor gap.** Create a two-axis academic map with “component depth” on one axis and “end-to-end integration breadth” on the other. Place dataset/model studies, commercial digital stethoscopes, simple IoT dashboards, remote-monitoring platforms, and AscultiCor conceptually. Do not use scores or imply clinical superiority.

## 2.8 Chapter Summary

This chapter connected cardiac physiology to the two signals acquired by AscultiCor. ECG represents body-surface electrical activity and supports rhythm- and morphology-oriented analysis, while PCG represents acoustic mechanical events and supports heart-sound and murmur analysis. Their complementary value motivates a coordinated acquisition session, but neither a single-lead ECG nor a low-cost microphone constitutes a complete clinical examination.

The signal-processing review showed that measurement quality is determined across hardware, firmware, transport, and analysis. Sampling rates, resampling, filtering, segmentation, feature extraction, normalization, and artifact handling must be documented and reproduced. The AI review distinguished feature-based models from deep waveform and spectrogram methods and emphasized patient-level splitting, imbalance-aware metrics, calibration, and external validation. The systems review explained why identity, authorization, storage, asynchronous workflows, secure deployment, and human review are part of the research problem rather than implementation details.

Related work provides strong foundations but typically emphasizes one part of the chain. AscultiCor's intended contribution is an inspectable educational platform spanning dual-signal hardware, firmware, messaging, multi-model inference, multi-tenant application features, workflow automation, and cloud operations. Chapter 3 now describes how each workstream implemented that architecture and how the interfaces were integrated.
