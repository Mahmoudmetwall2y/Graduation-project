# Chapter 4: Results and Discussion

This chapter evaluates the delivered AscultiCor prototype using only evidence that can be traced to repository artifacts or to repeatable checks executed against the current project workspace. The chapter deliberately distinguishes a saved experimental result from a successful static software check, a partially completed integration check, and a test that still requires physical hardware or a configured production environment. This distinction is essential because AscultiCor combines sensing hardware, embedded firmware, machine-learning models, a web application, automation workflows, and cloud services. A strong result in one layer does not prove that the complete clinical workflow is valid.

The most extensive quantitative package belongs to the phonocardiogram XGBoost classifier. Its stored evaluation package includes cross-validation summaries, learning curves, a threshold sweep, a held-out confusion matrix, receiver-operating-characteristic curves, a murmur precision–recall curve, feature importance, and recall grouped by source dataset. The active murmur-characterization CNN adds six delivered confusion matrices for timing, shape, grading, pitch, quality, and location. The delivered single-lead ECG model includes four visual case-study outputs and serialized metadata, but it does not yet include an aggregate held-out confusion matrix or machine-readable evaluation report. The ECG figures are therefore discussed as qualitative execution evidence rather than proof of population-level accuracy. CNN case studies are also still being prepared; only its aggregate matrix evidence is reported here.

## 4.1 Evaluation Methodology

### 4.1.1 Experimental Environment

The evaluation was performed from the project workspace containing the firmware, inference service, Next.js application, Supabase migrations, n8n workflows, deployment definitions, and model artifacts. The saved PCG results were produced by the AI training workflow and stored beside the exported XGBoost classifier and scaler. The ECG case figures were stored beside the delivered Keras artifact and label metadata. Software checks were executed against the same codebase used to generate this book. Consequently, the chapter evaluates the state of the repository at book-generation time rather than an assumed future release.

The available environment could execute Python syntax compilation and Node.js checks. It did not contain the `pytest` package, Docker, physical AscultiCor hardware, or configured public Supabase environment variables. Those absences constrain what can be claimed. For example, successful Python byte-code compilation shows that the inference modules are syntactically valid, but it does not prove that the model service can connect to MQTT, load every dependency, or complete an end-to-end session. Likewise, the frontend compiled its application code successfully before the production build stopped during page prerendering because the two public Supabase variables were intentionally absent from the local shell.

### 4.1.2 Evidence Classes and Acceptance Criteria

Four evidence classes were used to prevent ambiguous statements such as “the system was tested” from hiding different levels of assurance.

**Table 4.1: Evidence classes used in this chapter**

| Evidence class | Meaning | Permitted conclusion |
|---|---|---|
| Verified artifact | A saved plot, matrix, model, metadata file, or report is present and internally readable | The artifact exists and its displayed result can be reported with its stated scope |
| Repeatable static check | A compiler, linter, type checker, parser, or repository script was run successfully | The checked source satisfies that tool under the recorded environment |
| Blocked or failed check | A check started but could not complete, or it detected a concrete defect | The blocking condition or defect is reported; no success is claimed |
| Pending evidence | Required measurements, logs, aggregate metrics, or physical tests are absent | The test and acceptance criterion are retained as future validation work |

For AI results, aggregate metrics are accepted only when the evaluated split and class definitions are identifiable. Selected examples are not converted into an accuracy percentage. For hardware, signal quality requires recorded waveforms or numerical measures such as signal-to-noise ratio, clipping rate, packet loss, timing error, voltage stability, or battery runtime. A schematic or firmware implementation is design evidence, not measurement evidence. For web and cloud components, linting and compilation are reported separately from configured-service integration. For clinical interpretation, all results remain engineering-prototype evidence and do not establish safety, diagnostic effectiveness, or medical-device compliance.

**Table 4.2: Current verification matrix**

| Workstream | Check or artifact | Result | Evidence class |
|---|---|---|---|
| PCG AI | Held-out XGBoost plots and confusion matrix | Available and analyzed | Verified artifact |
| ECG AI | Four single-lead case-study figures and Keras metadata | Available; aggregate metrics absent | Verified artifact with limited scope |
| Severity CNN | PyTorch checkpoint, six confusion matrices, and registry integration | Active; matrix evidence available, case studies pending | Verified artifact and repeatable integration check |
| Inference | Python compilation of `inference/app` | Passed | Repeatable static check |
| Inference tests | Complete model-registry suite | 17 of 17 tests passed, including delivered CNN checkpoint compatibility | Repeatable integration check |
| Frontend | TypeScript type check | Passed | Repeatable static check |
| Frontend | ESLint | Passed with no warnings or errors | Repeatable static check |
| Frontend | Next.js production build | Source compiled; prerender failed without Supabase public variables | Partially completed check |
| Database | Security smoke script | Failed on duplicate migration number 025 | Failed check |
| n8n | Eight workflow JSON files | Present; execution histories absent | Verified artifact, runtime pending |
| Deployment | Docker Compose runtime validation | Docker unavailable in the evaluation environment | Blocked check |
| Hardware | Live ECG/PCG, power, and packet measurements | No measurement package supplied | Pending evidence |

## 4.2 IoT and Hardware Results

### 4.2.1 ECG and PCG Acquisition Quality

The IoT implementation contains concrete acquisition logic for the AD8232 ECG channel and MAX9814 PCG channel, including timer-driven sampling, lead-off awareness, buffering, device preflight, and session metadata. Chapter 3 established these mechanisms from the firmware and hardware sources. However, the repository does not currently include a controlled hardware test package containing raw reference recordings, oscilloscope captures, electrode-placement conditions, acoustic coupling conditions, or a comparison against a calibrated acquisition device. Acquisition quality is therefore pending rather than failed.

The minimum evidence needed to close this result is straightforward. For ECG, the team should retain several unedited recordings showing recognizable morphology, input saturation behavior, lead-off transitions, and noise under stationary and motion conditions. For PCG, the package should include chest-position annotations, raw and filtered waveforms, amplitude distributions, and examples of environmental and handling noise. Each recording should identify the device, firmware release, session identifier, sampling configuration, duration, and whether the trace was used for tuning. This metadata prevents polished figures from becoming disconnected from the actual prototype.

No signal-to-noise ratio or diagnostic waveform claim is made at this stage. In particular, a visible QRS-like waveform on the dashboard would demonstrate data flow but would not alone validate amplitude accuracy, bandwidth, electrical safety, or clinical fidelity. The MAX9814 is an automatic-gain microphone amplifier, so gain adaptation can also alter the envelope of a cardiac sound. Evaluation must therefore consider both whether heart sounds are visible and whether the acquisition path preserves the features consumed by the deployed PCG preprocessing pipeline.

### 4.2.2 Sampling, Packet Delivery, and Session Reliability

The firmware is designed around a 500 Hz ECG stream and an approximately 22.222 kHz PCG stream, with buffered binary MQTT transport and session-finalization behavior. This is a sound implementation target, but no captured packet log or timed multi-session trial is stored with the project. Exact sampling error, buffer-overflow frequency, MQTT packet loss, reconnect recovery time, and successful-session ratio cannot yet be reported.

A defensible reliability experiment should run repeated sessions under at least three network conditions: stable local Wi-Fi, constrained bandwidth or added latency, and a forced disconnect followed by reconnection. The device-side sample count, broker-side received count, inference-side reconstructed count, and stored recording length should then be reconciled. Acceptance should be expressed before the experiment, not chosen after observing results. Suggested engineering targets are zero silent buffer overruns, explicit marking of incomplete recordings, monotonic sequence handling, and deterministic session finalization. Numerical packet-loss and timing thresholds should be approved by the supervisors after the team observes realistic prototype behavior.

### 4.2.3 PCB and Power Evaluation

The custom PCB and power-management section is incorporated in Chapter 3. Its design includes USB Type-C input, TP4056 charging, lithium-ion protection through DW01A and FS8205 devices, a load-sharing path using an AO3401 P-channel MOSFET and SS34 Schottky diode, a regulated 3.3 V rail, decoupling, test points, and layout separation between noise-sensitive analog sections and digital circuitry. These details demonstrate design completeness, but the supplied documents do not include board bring-up measurements.

Before the board can be described as validated, the team should record USB-only, battery-only, charging, and source-transition tests. Required measurements include the regulated rail at idle and during Wi-Fi transmission, peak and average current, charger temperature, battery protection response, rail ripple near the ECG and PCG circuits, and operating duration under a representative session schedule. The ESP32 antenna region and analog traces should also be inspected for radio-frequency interference while MQTT transmission is active. Until those measurements are added, this subsection documents an implemented design awaiting electrical characterization, not a proven medical power subsystem.

**Table 4.3: Hardware evidence required for final acceptance**

| Test | Recorded output | Current status |
|---|---|---|
| ECG stationary and motion recordings | Raw waveform, filtered waveform, lead-off events, clipping and noise notes | Pending |
| PCG chest-position recordings | Raw waveform, filtered waveform, coupling position, ambient-noise notes | Pending |
| Timer accuracy | Expected and measured sample counts over a known duration | Pending |
| MQTT integrity | Published, received, missing, duplicate, and reordered chunks | Pending |
| Reconnect recovery | Disconnect time, reconnect time, session outcome, data-gap annotation | Pending |
| 3.3 V rail stability | Minimum, maximum, ripple, and measurement bandwidth | Pending |
| Battery endurance | Battery specification, load profile, runtime, cutoff behavior | Pending |
| Charge and load sharing | Transition waveforms and component temperatures | Pending |

> **Figure 4.16 Placeholder — Hardware Validation Test Bench:** Insert a non-numeric explanatory diagram of the physical validation setup. It must show the prototype, ECG/PCG signal sources or controlled patient-interface setup, oscilloscope or logic analyzer, MQTT packet capture, regulated-rail probes, and a measurement log linked by session identifier. Do not add simulated readings.

## 4.3 Artificial Intelligence Results

### 4.3.1 PCG XGBoost Classification Results

The active PCG model classifies three labels: Artifact, Murmur, and Normal. Its input combines 200 traditional signal features with a 1,024-dimensional YAMNet embedding, producing the 1,224-feature vector expected by both the serialized scaler and classifier. The saved training program uses stratified five-fold processing over pooled training data, class balancing, and a murmur-aware decision threshold. The following results are based on the figures supplied with the final artifact; raw per-example predictions were not included, so independent recomputation of every curve was not possible.

Figure 4.1 first compares the training and validation accuracies across the five folds and places the final held-out test accuracy on the same chart.

![Figure 4.1: Five-fold training and validation accuracy for the PCG XGBoost model, with final held-out test accuracy.](new-models/Xgboost/figures/01_fold_train_val_accuracy.png)

Validation accuracy is relatively stable across folds and remains below training accuracy. The final held-out accuracy is 83.65%, lower than the approximate validation band shown in the chart. This pattern is consistent with a harder or distribution-shifted test set and means the cross-validation score should not be presented as the deployment accuracy. The held-out result is the more conservative headline value.

Figure 4.2 shows the iterative loss behavior for the training and validation data.

![Figure 4.2: Training and validation log-loss curves for the PCG XGBoost model.](new-models/Xgboost/figures/02_training_curves.png)

Both losses decrease substantially during training, showing that the boosting process learned useful structure. The training loss continues toward a much lower level than the validation loss, leaving a persistent generalization gap. The validation curve does not exhibit an obvious late catastrophic increase, but the gap supports retaining early stopping, external testing, and dataset-stratified analysis rather than interpreting training convergence as proof of broad generalization.

Figure 4.3 examines accuracy as progressively larger fractions of the training data are used.

![Figure 4.3: Learning curve for the PCG XGBoost model.](new-models/Xgboost/figures/03_learning_curve.png)

Held-out performance improves as more samples are introduced while training performance stays close to its ceiling. This combination suggests that additional diverse data may still improve generalization. It also suggests model variance or source-specific cues because the training and held-out curves do not converge. More data should therefore be collected across devices, recording environments, and patient groups rather than only adding near-duplicates from the strongest source.

The training package includes a probability-threshold sweep for the Murmur class, shown in Figure 4.4.

![Figure 4.4: Out-of-fold Murmur threshold sweep used to study the precision–recall trade-off.](new-models/Xgboost/figures/04_threshold_sweep.png)

The figure marks a chosen threshold of 0.243 and a target recall of 90% using pooled out-of-fold predictions. Lowering the Murmur threshold increases sensitivity at the cost of more false-positive murmur decisions; increasing it does the opposite. This operating point is a model-selection decision rather than a universally optimal clinical threshold. Importantly, the current training script and inference implementation use 0.254, while the saved sweep marks 0.243. That discrepancy changes some boundary decisions and must be resolved before freezing the reported configuration. The final release should regenerate its matrix and curves using exactly the threshold used at runtime and store the threshold as versioned model metadata rather than duplicating it in source code.

Figure 4.5 provides the held-out confusion matrix from which the class-level measures in Table 4.4 were derived.

![Figure 4.5: Held-out confusion matrix for Artifact, Murmur, and Normal PCG classes.](new-models/Xgboost/figures/05_confusion_matrix_test.png)

The matrix contains 1,651 examples. All 167 Artifact examples were classified correctly. Among 430 Murmur examples, 354 were detected and 76 were classified as Normal. Among 1,054 Normal examples, 860 were classified correctly and 194 were classified as Murmur. Thus, the dominant error is the Murmur–Normal boundary rather than artifact rejection. The matrix yields an overall accuracy of 83.65%. Murmur recall is 82.33%, while Murmur precision is 64.60%; the lower precision reflects the 194 Normal recordings promoted to Murmur. This may be acceptable for a screening-oriented prototype only if the downstream workflow clearly treats a positive result as a prompt for review rather than a diagnosis.

**Table 4.4: Metrics derived from the held-out PCG confusion matrix**

| Class or average | Precision | Recall | F1-score | Support |
|---|---:|---:|---:|---:|
| Artifact | 100.00% | 100.00% | 100.00% | 167 |
| Murmur | 64.60% | 82.33% | 72.39% | 430 |
| Normal | 91.88% | 81.59% | 86.43% | 1,054 |
| Macro average | 85.49% | 87.97% | 86.27% | 1,651 |
| Weighted F1-score | — | — | 84.15% | 1,651 |
| Overall accuracy | — | — | 83.65% | 1,651 |

Receiver-operating-characteristic curves in Figure 4.6 offer a threshold-independent view of class separability.

![Figure 4.6: One-versus-rest ROC curves for the held-out PCG test set.](new-models/Xgboost/figures/06_roc_curves_test.png)

The reported areas under the curve are 1.000 for Artifact, 0.915 for Murmur, and 0.929 for Normal. The perfect artifact AUC should be interpreted in the context of this particular held-out set; it does not establish perfect rejection of every noise pattern or device artifact. Murmur and Normal both show useful ranking capability, but the operational confusion matrix demonstrates that good AUC does not eliminate the practical threshold trade-off.

Because Murmur is the most safety-relevant positive class in this PCG task, its precision–recall curve is shown separately in Figure 4.7.

![Figure 4.7: Held-out Murmur precision–recall curve for the PCG XGBoost model.](new-models/Xgboost/figures/07_precision_recall_murmur_test.png)

The average precision is 0.831. The marked operating point corresponds approximately to 0.823 recall and 0.645 precision on the held-out set, consistent with the confusion matrix. Precision–recall analysis is especially informative here because the class frequencies are unequal and because false-negative and false-positive consequences differ. Any later clinical study should predefine the acceptable operating point and evaluate it prospectively rather than tuning it on the study endpoint.

Figure 4.8 ranks the learned input dimensions by importance.

![Figure 4.8: XGBoost feature-importance ranking for the delivered PCG classifier.](new-models/Xgboost/figures/08_feature_importance.png)

The plot shows that several dimensions contribute more strongly than the remainder, but the exported labels are generic indices such as `feature_47` rather than semantic feature names. As a result, the figure supports model debugging but not physiological interpretation. A final reproducibility package should export the exact ordered feature manifest and indicate which dimensions belong to traditional descriptors and which belong to the YAMNet embedding. Importance should also be complemented by per-example explanation methods and stability checks before it is shown to clinicians.

The source-dataset comparison in Figure 4.9 exposes a material generalization issue that is hidden by the pooled score.

![Figure 4.9: Murmur recall grouped by source dataset for the PCG XGBoost evaluation.](new-models/Xgboost/figures/09_recall_by_dataset.png)

The displayed recall is highest for BUET and PhysioNet and substantially lower for CirCor, which falls below the chart's 90% target line. The exact values should be recovered from a machine-readable evaluation export, but the qualitative conclusion is already clear: performance depends on the data source. Possible causes include population differences, recording hardware, annotation rules, signal duration, acquisition location, and preprocessing. Dataset identity can become an unintended shortcut, so the next evaluation should report patient-disjoint results for every source and include leave-one-dataset-out testing where feasible.

### 4.3.2 Single-Lead ECG Model Case Studies

The delivered ECG artifact is `AuscultICor_v26_SL.keras`. Its metadata specifies a 125 Hz model rate, a 500-sample input window, nine RR-related inputs, five MIT-style beat classes, and a 500-sample forecast output. The classes are Normal, supraventricular ectopic beat (SVEB), ventricular ectopic beat (VEB), Fusion, and Unknown. The model package includes four selected case figures, each combining a classification, an experimental cardiac-risk output, and waveform reconstruction or forecasting views.

The figures are useful for checking that the model can consume a prepared window and produce structured outputs. They are not a random or complete test set: no Normal example is included, and there is no aggregate confusion matrix, per-class support table, patient-disjoint split description, or calibration analysis in the delivered folder. Consequently, “four out of four displayed classifications” must not be translated into 100% model accuracy.

Figure 4.10 shows the selected SVEB case.

![Figure 4.10: Delivered ECG case study 2, classified as SVEB with the model's experimental risk and forecast panels.](new-models/ecg_mitbih_single_lead/test_case_2_SL.png)

The figure reports SVEB at 100.0% confidence, a low experimental risk output of 1.7%, and forecast mean absolute error of 0.0037. The very high displayed class confidence describes this input only and should not be interpreted as calibrated certainty. The small forecast error likewise applies to the plotted normalized signal representation and does not prove future clinical-event prediction.

Figure 4.11 presents the selected VEB case.

![Figure 4.11: Delivered ECG case study 3, classified as VEB with the model's experimental risk and forecast panels.](new-models/ecg_mitbih_single_lead/test_case_3_SL.png)

This case reports VEB at 100.0% confidence, a high experimental risk output of 99.4%, and forecast mean absolute error of 0.0151. It demonstrates that the output heads produce distinct responses for the selected input. However, without an independently documented risk-label definition, cohort prevalence, sensitivity, specificity, and calibration curve, the risk percentage must remain an experimental model output and not a patient-level risk estimate.

Figure 4.12 presents the selected Fusion case.

![Figure 4.12: Delivered ECG case study 4, classified as Fusion with the model's experimental risk and forecast panels.](new-models/ecg_mitbih_single_lead/test_case_4_SL.png)

The figure reports Fusion at 100.0% confidence, high experimental risk of 99.8%, and forecast mean absolute error of 0.0038. Fusion beats are a distinct and less common class, making class support and patient-independent evaluation particularly important. A selected correct example shows functional capability but cannot establish robustness under class imbalance.

Figure 4.13 presents the selected Unknown case.

![Figure 4.13: Delivered ECG case study 5, classified as Unknown with the model's experimental risk and forecast panels.](new-models/ecg_mitbih_single_lead/test_case_5_SL.png)

This figure reports Unknown at 100.0% confidence, moderate experimental risk of 53.6%, and forecast mean absolute error of 0.0051. The Unknown class can serve as a rejection category, but its practical meaning depends on how source annotations were mapped. Future evaluation must show which rhythms and signal-quality failures enter this class and how often clinically important beats are rejected rather than assigned a specific label.

**Table 4.5: Scope of the delivered ECG case-study evidence**

| Figure | Displayed class | Displayed confidence | Experimental risk output | Forecast MAE |
|---|---|---:|---:|---:|
| Case 2 | SVEB | 100.0% | Low, 1.7% | 0.0037 |
| Case 3 | VEB | 100.0% | High, 99.4% | 0.0151 |
| Case 4 | Fusion | 100.0% | High, 99.8% | 0.0038 |
| Case 5 | Unknown | 100.0% | Moderate, 53.6% | 0.0051 |

The next ECG release should provide a patient-disjoint evaluation manifest, class counts, confusion matrix, macro and weighted F1-scores, per-class sensitivity and precision, confidence calibration, and failure examples. It should also separate beat classification, signal forecasting, and risk estimation into independently defined tasks. The metadata indicates that the risk head was trained from a mapped and balanced PTB-derived source, whereas beat classification uses a different data source. That multi-source design can be valuable, but it requires precise documentation to avoid implying that beat confidence and cardiac risk have the same label semantics.

### 4.3.3 Murmur-Characterization CNN Results

The third model is active under the `severity_cnn` registry key. The delivered `new-models/CNN/best_model.pkl` file is a PyTorch state dictionary matched strictly to the runtime `MurmurSeverityCNN` architecture. The inference contract accepts four 128 × 216 mel-spectrogram channels ordered AV, MV, PV, and TV and returns six softmax heads. The model is invoked after the broad PCG classifier returns Murmur. Focused artifact tests and the complete model-registry suite both passed in the current workspace; the full suite completed 17 of 17 tests.

The AI team supplied one confusion matrix per output head. Each matrix contains 895 evaluated examples. Because the raw prediction table, split manifest, and evaluation script were not supplied in the CNN folder, the values below were derived directly from the displayed counts and cannot be independently stratified by patient or data source. Figures 4.14 and 4.15 present the unmodified project matrices in a compact multi-panel arrangement.

[[FIGURE_GRID|Figure 4.14: Delivered CNN confusion matrices for (a) systolic timing, (b) systolic shape, and (c) systolic grading.|new-models/CNN/confusion_matrix_timing.png::(a) Timing|new-models/CNN/confusion_matrix_shape.png::(b) Shape|new-models/CNN/confusion_matrix_grading.png::(c) Grading]]

Timing classification contains 869 correct decisions and 26 errors, giving 97.09% matrix accuracy. Most errors are between Early-systolic and Holosystolic: sixteen Holosystolic examples were predicted Early-systolic and seven Early-systolic examples were predicted Holosystolic. Late-systolic and Unknown each have only five examples, so their perfect displayed recall has high sampling uncertainty.

Shape classification contains 865 correct decisions and 30 errors, or 96.65% matrix accuracy. Plateau dominates the set with 555 examples. Crescendo recall is 70.00% on only ten examples, and Unknown recall is 80.00% on five examples. The most visible error is thirteen Decrescendo examples classified as Plateau. These minority supports are important because overall accuracy is strongly influenced by the Plateau class.

Grading contains 858 correct decisions and 37 errors, or 95.87% matrix accuracy. The principal confusion occurs between grade I/VI and grade II/VI: twenty I/VI examples were predicted II/VI and five II/VI examples were predicted I/VI. Grade III/VI recall is 99.13%. The Unknown class again contains only five examples.

[[FIGURE_GRID|Figure 4.15: Delivered CNN confusion matrices for (a) systolic pitch, (b) systolic quality, and (c) murmur location.|new-models/CNN/confusion_matrix_pitch.png::(a) Pitch|new-models/CNN/confusion_matrix_quality.png::(b) Quality|new-models/CNN/confusion_matrix_location.png::(c) Location]]

Pitch contains 862 correct decisions and 33 errors, giving 96.31% matrix accuracy. Most errors involve Medium: eleven Low examples were predicted Medium, while seven Medium examples were predicted High and five were predicted Low. Quality contains 859 correct decisions and 36 errors, or 95.98% matrix accuracy. Its errors are concentrated between Blowing and Harsh, with seventeen Blowing examples predicted Harsh and nineteen Harsh examples predicted Blowing; Musical and Unknown have much smaller supports.

Location contains 854 correct decisions and 41 errors, or 95.42% matrix accuracy across eight labels. The largest error is twenty-three Multiple-valves examples predicted as MV-with-right. MV-with-right precision is therefore lower than the other location classes at approximately 85.06%. The AV class contains ten examples, whereas Multiple-valves contains 435, again requiring caution when comparing per-class percentages.

**Table 4.6: CNN metrics derived from the six delivered confusion matrices**

| Output head | Examples | Accuracy | Macro F1-score | Weighted F1-score |
|---|---:|---:|---:|---:|
| Timing | 895 | 97.09% | 98.36% | 97.10% |
| Shape | 895 | 96.65% | 91.08% | 96.61% |
| Grading | 895 | 95.87% | 93.84% | 95.91% |
| Pitch | 895 | 96.31% | 94.74% | 96.33% |
| Quality | 895 | 95.98% | 97.91% | 95.98% |
| Location | 895 | 95.42% | 96.46% | 95.49% |

These results support the conclusion that the delivered checkpoint learned strong separation on the represented evaluation set. They do not establish performance on AscultiCor MAX9814 recordings, simultaneous four-position examinations, or a prospective clinical population. The current device supplies one recording and a valve-position field; missing channels are floored, or one spectrogram is replicated across channels when position metadata is absent. CNN test cases showing that real runtime behavior are still under preparation and will be inserted when the team delivers them.

### 4.3.4 Model Comparison, Error Analysis, and Reproducibility

The three active AI packages are not directly comparable by a single accuracy number because they solve different tasks and have unequal evidence maturity. XGBoost performs broad PCG state classification, the CNN performs six murmur-characterization tasks, and the ECG network performs beat classification with auxiliary outputs. Table 4.7 therefore compares evidence completeness rather than ranking unlike tasks.

**Table 4.7: AI evidence-completeness comparison**

| Model slot | Task | Aggregate held-out evidence | Case evidence | Deployment state | Principal open issue |
|---|---|---|---|---|---|
| PCG XGBoost | Artifact, Murmur, Normal | Available | Plots available | Active | Threshold mismatch and dataset-dependent recall |
| ECG AuscultICor v26 SL | Five-class beat classification with auxiliary outputs | Not supplied | Four selected non-Normal cases | Active | Aggregate patient-disjoint evaluation missing |
| Severity CNN | Timing, shape, grading, pitch, quality, location | Six 895-example confusion matrices | Runtime cases being prepared | Active | Split/raw predictions and device-domain cases not yet supplied |

Artifact portability is another concern. Loading the XGBoost package in the current environment produced serialization warnings indicating that the model originated from an older XGBoost version. The scaler was serialized with scikit-learn 1.8.0 while the inspection environment used 1.9.0, and a parameter inspection encountered a missing `feature_weights` attribute. The model and scaler still exposed the expected 1,224-feature interface, but these warnings show why production releases should pin library versions and export XGBoost models through its stable native format in addition to any Python pickle.

Reproducibility is incomplete because the stored training script does not appear to generate every supplied evaluation figure, and the folder lacks the raw prediction table used to construct them. The final AI package should contain a single immutable manifest with source commit, dataset hashes or release identifiers, patient split files, preprocessing version, feature order, library versions, random seeds, trained artifact hashes, decision thresholds, raw test predictions, and the script that reproduces every table and plot. This is not administrative overhead; it is the chain connecting a thesis result to the runtime model.

## 4.4 Frontend and Backend Results

### 4.4.1 Functional and Role-Based Access Checks

The frontend TypeScript type check completed successfully, and ESLint completed with no warnings or errors. These results provide useful evidence that the checked application source has coherent static types and satisfies its configured lint rules. They do not execute Supabase authorization policies or verify that every role sees only its permitted data.

The repository security smoke script did detect one release-blocking migration-management defect: two migrations use the numeric prefix `025`, namely the visitor-role migration and the automatic patient-MRN migration. Duplicate sequence numbers can make deployment order ambiguous and must be corrected before a clean database replay. This result is valuable because it converts a latent deployment risk into a specific, fixable issue. The migrations themselves should not be renamed casually on an environment where either file has already been applied; the team must reconcile the deployed migration history and then choose a unique forward sequence.

Role-based access requires runtime tests against a disposable Supabase project. At minimum, visitor, clinician, operator, and administrator identities should attempt allowed and forbidden patient, device, session, report, alert, settings, and audit operations. The result package should save expected status, actual status, database effect, and audit event for each case. Service-role access should be tested only through server-side routes and never exposed to the browser.

### 4.4.2 Build, Live Session, and API Checks

The Next.js production build compiled the source successfully, completed lint and type validation inside the build pipeline, and generated all 21 static-page steps. It then failed while prerendering routes because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were not defined in the evaluation shell. The failure is therefore an environment-configuration block rather than a TypeScript compilation failure. It also reveals that a clear pre-build environment check would produce a shorter and more actionable error than repeated route-level failures.

The Python inference package passed recursive syntax compilation. After the CNN integration, `pytest` and the CPU PyTorch runtime were available and the complete model-registry suite passed all 17 tests. The suite verifies registry definitions, three-model behavior, disabled-model fault tolerance, delivered CNN head sizes, strict checkpoint compatibility, and decoded output structure. This is repeatable integration evidence; it does not replace signal-level or clinical validation.

No synchronized browser, MQTT, inference, and database trace was available to calculate page-load time, command latency, first-sample latency, inference time, report time, or alert latency. Those measures remain pending and are addressed in the end-to-end section.

### 4.4.3 Usability Evidence

The application implements a coherent workflow around patients, devices, sessions, live signals, predictions, reports, alerts, administration, and role-aware navigation. Nevertheless, no formal usability study, task-completion log, or accessibility audit is included in the repository. Screenshots can document appearance but cannot establish ease of use.

A modest formative study would materially improve the graduation evidence. Representative users should complete common tasks such as adding a patient, assigning a device, starting and stopping a session, recognizing a device failure, reviewing AI output, requesting a report, and acknowledging an alert. The team should record completion rate, time, errors, assistance, and qualitative comments. Because the product is not clinically validated, the study should evaluate interface comprehension and workflow usability rather than diagnostic decision quality.

## 4.5 n8n Automation Results

### 4.5.1 Workflow Presence, Retry, and Escalation Checks

Eight exported n8n workflow definitions are present: connectivity checking, pending LLM report processing, clinical-alert notification, device-health monitoring, daily digest generation, recording-summary enrichment, operations monitoring, and alert escalation. Their presence verifies the intended automation coverage and supports import into an n8n instance. It does not show that credentials are configured or that scheduled runs completed successfully.

No n8n execution-history export or controlled failure-injection report was found. Runtime success rate, retry recovery, deduplication, and escalation correctness therefore remain pending. Each workflow should be tested once on its success path and against representative failures such as invalid internal token, unavailable Next.js endpoint, Supabase timeout, rejected email, LLM timeout, malformed response, and repeated trigger. The stored result should link the input record, n8n execution identifier, retry count, state transition, final status, and user-visible effect.

### 4.5.2 Report Generation and Alert Latency

The automation design deliberately keeps raw ECG and PCG streaming outside n8n and uses it for asynchronous orchestration. This separation should reduce pressure on the workflow engine, but no timestamp trace currently measures queue wait, LLM response time, report persistence, notification delivery, or escalation delay. It would be misleading to assign a latency number from configuration alone.

For the final demonstration, timestamps should be captured at queue insertion, workflow pickup, provider request, provider response, database completion, email submission, and acknowledgement. LLM output should also be reviewed for missing data, unsupported claims, inconsistency with structured predictions, and unsafe language. A generated narrative is an assistive summary and must not be treated as an autonomous diagnosis.

## 4.6 Cloud and DevOps Results

### 4.6.1 Deployment and Availability

The repository contains Docker Compose, NGINX, Mosquitto, environment templates, health checks, and operational documentation. Docker was not installed in the current evaluation environment, so the Compose configuration could not be rendered or started. No cloud uptime report, health-check history, or load-test output was supplied. Deployment availability is therefore unverified rather than assumed from the presence of configuration files.

The final infrastructure trial should begin from a clean virtual machine and record every command needed to provision secrets, build images, apply database changes, start services, verify health, and restore after restart. A second operator should be able to repeat the process from documentation alone. This trial should also verify that only intended ports are public, that internal service endpoints reject unauthorized calls, and that device transport is protected by TLS or an approved private network before any sensitive use.

### 4.6.2 Security and Isolation Tests

The architecture includes tenant-aware data design, row-level security, private storage, server-only service credentials, internal tokens, MQTT authentication, NGINX boundaries, and audit logging. These are valuable controls, but configuration intent must be verified in the deployed environment. The duplicate migration identifier detected by the security script is currently the clearest concrete deployment issue.

Required tests include cross-organization reads and writes, direct storage access, expired and modified tokens, internal-route requests without the expected token, MQTT topic access with an unauthorized device identity, secret scanning, dependency review, and audit-log visibility. A clean security test should prove both sides: authorized operations succeed, and equivalent unauthorized operations fail without leaking data.

### 4.6.3 Resource Utilization and Recovery Tests

No measured CPU, memory, disk, network, model-load time, or concurrent-session profile is available. Backup configuration and documented recovery steps should not be called successful recovery until a restore has been performed into a separate environment and the restored records have been reconciled.

A compact engineering benchmark should monitor idle service use, one active session, and multiple concurrent simulated sessions. The test should report dropped MQTT data, request latency, inference queue behavior, storage growth, and service restarts. Recovery trials should include process restart, virtual-machine restart, broker interruption, database unavailability, and restoration from a known backup. These results are important for reliability but remain future evidence.

## 4.7 End-to-End Results

### 4.7.1 Complete Session Walkthrough

The repository contains the components needed for an end-to-end path: authenticated session creation, MQTT device command, preflight, simultaneous ECG and PCG acquisition, binary transport, live display, recording storage, model inference, prediction persistence, report processing, and alerts. A single correlated execution trace covering that complete path was not supplied, and physical-device execution was unavailable during book generation. The end-to-end outcome is therefore not counted as passed.

For the graduation demonstration, the team should capture one successful session and at least four controlled failure sessions: unauthorized start, preflight failure, network interruption, and unavailable model. Every event should carry a shared session identifier. The final evidence can then show that a failure is detected in the correct layer, persisted where appropriate, surfaced to the user, and either recovered or safely terminated.

### 4.7.2 Latency Budget

An end-to-end latency budget cannot be derived from isolated screenshots. The required timeline begins when the user sends the start request and includes API authorization, database creation, MQTT command delivery, device preflight, first sample, dashboard update, recording completion, inference, persistence, report queueing, and notification. Continuous live-display latency and post-session analysis latency should be reported separately because they have different user expectations.

**Table 4.8: End-to-end timing fields to capture**

| Interval | Start event | End event | Current result |
|---|---|---|---|
| Session authorization | Start request received | Authorized session row created | Pending |
| Device command | MQTT command published | Device acknowledgement or start metadata received | Pending |
| First live data | Session start accepted | First ECG and PCG samples visible | Pending |
| Recording finalization | Stop or duration reached | Recording metadata and files finalized | Pending |
| AI analysis | Complete recording available | Structured predictions persisted | Pending |
| Report generation | Report queued | Final report persisted | Pending |
| Alert delivery | Alert condition persisted | Notification provider accepts message | Pending |

> **Figure 4.17 Placeholder — End-to-End Evidence Timeline:** Insert a conceptual timeline connecting the dashboard start action, API authorization, MQTT command, device preflight, first samples, recording finalization, inference, persistence, report generation, and alert delivery. Use empty measurement callouts so real timestamps can be inserted after the final trial.

### 4.7.3 Requirements Traceability

Current evidence supports the conclusion that the major architectural workstreams and their interface contracts have been implemented in source form. Quantitative AI evidence is strongest for PCG classification. Static application quality checks are encouraging, while configured integration, hardware measurement, automation execution, deployment, and full-session performance still require evidence. This traceability result is more informative than a single completion percentage because it identifies exactly where the graduation team should spend its remaining validation time.

## 4.8 Discussion

### 4.8.1 Interpretation of Findings

The PCG XGBoost classifier is the clearest measured outcome of the current project. It achieves 83.65% held-out accuracy and 82.33% Murmur recall on the supplied test matrix. Its Murmur AUC of 0.915 and average precision of 0.831 show useful ranking capability. At the selected operating region, the model finds most murmur examples but generates a meaningful number of false-positive murmur decisions. For a research prototype, this supports presenting the result as a review aid. It does not support autonomous diagnosis or reassurance after a Normal output.

The PCG error pattern is also actionable. Artifact classification is perfect on the delivered set, while Normal and Murmur are confused. Work should therefore focus less on overall accuracy and more on the ambiguous cardiac-sound boundary, dataset shift, recording protocol, calibration, and threshold governance. The lower recall shown for CirCor is especially important: aggregate performance can mask a source on which the model behaves differently.

The ECG model is promising as an integrated multi-output artifact, but the supplied four cases are a demonstration package rather than an evaluation package. The responsible conclusion is that the selected SVEB, VEB, Fusion, and Unknown windows produced the displayed outputs. Aggregate beat-classification effectiveness, risk calibration, and robustness on device-acquired data remain unknown until the AI team exports the full held-out results.

The active CNN has stronger aggregate evidence than the ECG package: all six delivered matrices exceed 95% accuracy on 895 examples. The shape head's lower macro F1-score of 91.08% and 70% Crescendo recall expose the effect of minority classes more clearly than overall accuracy. The deployment approximation from one recorded position to a four-channel input remains the main integration uncertainty. The forthcoming runtime test cases should therefore include known valve positions, missing position metadata, non-murmur gating, and representative errors rather than only successful examples.

Across the broader system, the successful static checks show meaningful engineering discipline. The frontend passes type checking and linting, and the inference code compiles. At the same time, the failed database smoke check, missing runtime variables, unavailable test runner, and unavailable Docker environment reveal release-process gaps. These are not reasons to discard the implementation; they are exactly the kinds of findings that a professional results chapter should surface before a demonstration or deployment.

### 4.8.2 Comparison with Related Work

Chapter 2 showed that many research works optimize a single dataset or subsystem, whereas AscultiCor attempts an inspectable path from multimodal sensing through AI and application workflows to automation and operations. The present results support the integration breadth of that design, but they do not yet prove equivalent depth in every component. The project should therefore be compared to prior work dimension by dimension: dataset and split design for AI, signal fidelity for hardware, latency and reliability for IoT, tenant isolation for the application, and recovery evidence for deployment.

It would be inappropriate to claim superiority over a paper or commercial device using the PCG accuracy alone. Differences in labels, class balance, patients, recording equipment, split policy, and operating threshold can dominate nominal metric differences. Similarly, the ECG screenshots cannot be compared with published aggregate MIT-BIH results. AscultiCor's defensible contribution at this stage is the engineering integration of independently inspectable modules and an honest evidence plan for closing the remaining gaps.

### 4.8.3 Limitations, Threats to Validity, and Clinical Caution

The main internal-validity limitation is incomplete provenance for the AI evaluations. Raw predictions and one reproducible evaluation entry point are absent, and the PCG threshold differs between the saved sweep and current code. The main external-validity risk is dataset and acquisition shift: public recordings, development microphones, electrodes, environments, and patient populations may not represent the final device context. Patient leakage must also be explicitly excluded through saved patient-level splits.

Selected-case bias affects the ECG evidence because only four successful non-Normal examples are supplied, while CNN case studies are not yet delivered. The CNN matrices lack their raw predictions and patient-level split manifest, so leakage and source-stratified behavior cannot be audited from the images alone. Docker services, configured Supabase integration, and physical hardware could not run in the book-generation environment, although the Python model-registry suite now passes. Measurement bias could arise if the same sessions are used both to tune preprocessing and to report performance. Finally, a polished dashboard may make probabilistic outputs appear more certain than the underlying validation warrants.

AscultiCor must remain labeled as an educational research prototype. The hardware has not been shown to meet medical electrical-safety standards, the models have not undergone prospective clinical validation, and the application has not completed a regulated quality process. Predictions and LLM-generated narratives require qualified human review. These cautions do not diminish the project; they define the boundary between a strong graduation prototype and a clinical product.

The immediate evidence priorities are therefore: reconcile and regenerate the PCG thresholded evaluation; export aggregate patient-disjoint ECG metrics; add the CNN split manifest, raw predictions, and runtime test cases; collect traceable ECG and PCG hardware recordings; fix migration numbering; execute the remaining automated and n8n test matrices; and capture one correlated end-to-end session trace. Completing these items would convert the current architecture-heavy evidence into a balanced system validation package.

### 4.8.4 Chapter Summary

This chapter reported the results available without inventing absent measurements. The active PCG XGBoost model has a substantive held-out evaluation, including 83.65% accuracy, 82.33% Murmur recall, 0.915 Murmur AUC, and 0.831 Murmur average precision. Its key concerns are Murmur false positives, dataset-dependent recall, a threshold mismatch, and artifact-version portability. The active CNN provides six 895-example confusion matrices with matrix accuracies from 95.42% to 97.09%; its open evidence needs are raw predictions, split provenance, device-domain validation, and runtime test cases. The ECG model has four useful case-study figures but still requires aggregate evaluation.

The web source passes linting and type checking, while the production build requires configured Supabase variables. Python syntax compilation and all 17 model-registry tests pass. The database smoke test detects duplicate migration numbering. Hardware measurements, automation histories, deployment runtime, and end-to-end timing remain pending. The findings establish a credible engineering prototype and, equally importantly, a precise validation agenda for the final project release.
