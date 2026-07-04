# Chapter (16): LLM Report Generation

## Report Automation Objective:

The LLM report generation layer was designed to reduce the amount of manual follow-up required after a cardiac recording session is completed. In the AscultiCor platform, raw ECG and PCG data are acquired by the embedded device, processed by the inference layer, stored in Supabase, and reviewed through the clinical dashboard. However, model predictions alone are not always easy for a non-specialist reader to interpret. The purpose of the report automation workflow is therefore to transform stored session results into a readable educational summary that can be reviewed by a clinician, student, or supervisor.

The objective of this chapter is not to present the LLM report as a certified medical report. Instead, the report generation module is documented as an assistive layer that organizes available information from the system. It queues report requests, processes them asynchronously, stores the generated text and structured metadata, and can notify the linked patient or fallback team inbox when the report is ready. This makes the dashboard workflow smoother while keeping final interpretation under human responsibility.

From an automation perspective, the report system has four main goals. First, it must protect the user experience by avoiding long waits in the browser. Second, it must protect the backend from repeated report requests by applying duplicate checks and rate limits. Third, it must preserve traceability by storing report status, prompt text, model name, model version, retry counts, latency, token estimates, and error messages. Fourth, it must provide safe fallback behavior so that demonstrations can continue even when the external LLM provider is not configured or temporarily unavailable.

The report generation feature also acts as a bridge between the frontend/backend team and the n8n automation team. The dashboard creates a pending report through the application API. The n8n workflow later calls an internal processing endpoint that claims pending reports, generates or falls back to a template report, updates Supabase, and returns email payloads that n8n can deliver through a Gmail node. This separation keeps sensitive database and provider logic inside the backend while allowing n8n to orchestrate scheduling and notification delivery.

## LLM Report Queue

The report queue is implemented around the `llm_reports` table and the `/api/llm` route in the Next.js backend. When a user clicks the LLM report action in the dashboard, the browser sends the session identifier and device identifier to the API. The route validates the required fields, checks that both identifiers follow UUID format, verifies that the user is authenticated, and retrieves the user's organization profile. This prevents a user from creating reports for sessions outside their organization.

After authentication, the system applies a database-backed rate limit. The current implementation limits each user to ten pending or generating reports per hour within the same organization. This limit is important because report generation can consume external provider quota and can also create operational load if a user repeatedly clicks the report button. By counting active report rows in the database, the limit works across multiple application instances rather than only inside one server process.

The queue also prevents duplicate work. If a completed report already exists for the session, the API returns the existing completed report. If a pending or generating report already exists, the API returns that queued row with an accepted response. Only when no suitable report exists does the backend insert a new pending row. The new row stores the organization, session, device, requesting user, generated prompt text, selected provider name, initial status, retry count, maximum retry count, and retry scheduling fields.

The internal processing endpoint is exposed through the same route using the `process-pending` action. Unlike normal user requests, this operation requires an internal token in the `x-internal-token` header. The token is read from `INTERNAL_API_TOKEN`, and the endpoint refuses to run if the token is missing or incorrect. This makes the processing endpoint suitable for n8n or cron-style automation without exposing report processing to ordinary public clients.

When the processor runs, it selects the oldest pending reports, limited to a small batch of three. Reports with a future `next_retry_at` value are skipped until their retry time arrives. Each eligible report is claimed atomically by changing its status from `pending` to `generating` only if it is still pending. This design prevents two workers from processing the same report at the same time. After a report is claimed, the backend loads the related session with predictions, murmur severity outputs, device name, and patient email information.

[Insert Figure 16.1 here: LLM report generation workflow]

Figure 16.1: LLM report generation workflow. The figure should show the dashboard creating a pending report, Supabase storing the queue row, n8n calling the internal processing endpoint, the backend selecting either Claude or the demo template, Supabase storing the completed report, and n8n sending the notification email.

## Report Content

The report content is generated from the available session context rather than from raw user text. The prompt can include session metadata, device information, PCG classification, ECG classification, model confidence values, murmur severity outputs, and any related signal quality information available in the session record. This keeps the report grounded in project data and avoids asking the language model to invent findings that were not produced by the platform.

For PCG analysis, the report may summarize whether the heart sound model detected a normal recording or a murmur. If the model output includes probability values, the report can mention confidence in a careful way. For ECG analysis, the report may summarize whether the rhythm model detected normal or abnormal patterns. If murmur severity fields are available, the report can include descriptive categories such as location, timing, shape, grading, pitch, and quality. These fields are useful because they convert model outputs into a more organized review format.

The generated report is stored in two forms. The first form is `report_text`, which is the readable Markdown-style report shown to users. The second form is `report_json`, which stores structured information such as summary, findings, recommendations, and confidence values. Storing both representations gives the dashboard flexibility: the text can be displayed directly, while the structured JSON can support future filtering, analytics, or export features.

The implemented demo report contains an educational summary, a findings overview, ECG analysis when available, suggested follow-up steps, limitations, and technical notes. The suggested follow-up section intentionally uses cautious wording such as clinical review, comparison with previous recordings, additional testing if clinically indicated, and correlation with patient history. This wording supports the project goal of decision support without presenting the system as a doctor.

When the Claude provider is configured, the backend sends the generated prompt to the provider through the Anthropic Messages API format. The provider endpoint, API key, and model are controlled by environment variables such as `CLAUDE_BASE_URL`, `CLAUDE_API_KEY`, and `CLAUDE_MODEL`. If the provider call succeeds, the report is saved with model metadata identifying Claude and the configured model version. If the provider is not configured or the call fails, the system falls back to the deterministic demo template so the report workflow can still complete during development and demonstrations.

When a report is saved, the backend records completion time, latency in milliseconds, estimated token usage, average confidence score, and the final model metadata. These fields make the report system observable. For example, the team can later inspect whether reports are slow, whether token usage is unexpectedly high, or whether a provider fallback happened.

## LLM Safety And Limitations

The LLM report layer is intentionally documented as an educational and research aid. The report text includes a medical disclaimer stating that the analysis is not a medical diagnosis and that qualified healthcare professionals must be consulted for medical advice. This disclaimer is not only a user-interface requirement; it is a system requirement because the platform combines experimental hardware, machine-learning models, and automated language generation.

The main safety limitation is that the report can only be as reliable as the data and model outputs provided to it. If a recording is noisy, too short, incorrectly attached, or affected by motion artifacts, the report may summarize results that are themselves uncertain. Similarly, if a model prediction is wrong or has low confidence, the LLM may still produce fluent text. For this reason, the report should avoid definitive diagnostic statements and should repeatedly frame findings as model-assisted observations that require human review.

Sensitive patient information must also be protected. The report workflow should include only the minimum patient context required for the educational summary. API keys, service-role credentials, internal tokens, and raw secrets must never be included in prompts, logs, screenshots, or generated reports. In production-like usage, real patient identifiers should be minimized or replaced with synthetic identifiers unless the team has proper approval and retention policies.

Another limitation is provider dependency. External LLM providers can fail because of network errors, authentication problems, rate limits, model outages, or invalid responses. The fallback template reduces demo risk, but it does not provide the same flexibility as a real LLM. Therefore, the book should document the provider path and the fallback path clearly, and the final project presentation should identify which mode was active during any demonstration.

The report must also avoid inventing values. If a prediction, confidence value, murmur severity field, or patient detail is unavailable, the report should state that the information is unavailable or omit that section. This is especially important in a biomedical project because a polished but unsupported sentence can mislead the reader more than a plain missing-data note.

## Report Failure Handling

The report queue includes explicit failure handling so that temporary errors do not permanently break the workflow. If report processing fails after a row has been claimed, the backend increments `retry_count`, records `last_error_at`, stores the error message, and either schedules another attempt or marks the report as an error. The retry delay uses exponential backoff, beginning with short retry intervals and capping the wait time at one hour. This protects the provider and backend from rapid repeated failures.

Each report row has a maximum retry count, currently initialized to three. If the number of failed attempts remains within the maximum, the row returns to the `pending` state with a `next_retry_at` timestamp. If the retry limit is exceeded, the row is marked as `error`, and the failure can be inspected later through database records, health checks, or operations monitoring. This state model makes report processing transparent rather than silently losing failed work.

The processing endpoint returns a summary containing the number of processed, failed, skipped, and total reports. It can also return email payloads when n8n explicitly requests them and the related export flag is enabled. This design allows n8n to use the backend as the source of truth while still handling email delivery through its own Gmail node.

Failure handling is also connected to operations monitoring. The backend exposes queue statistics such as pending count, generating count, error count, retry-ready count, and oldest pending report timestamp. These values allow the automation layer to detect a stuck queue. For example, if the oldest pending report is older than the expected processing window or if a generating report remains active for too long, the operations workflow can notify the team.

In summary, Chapter 16 documents a report system that is asynchronous, token-protected, rate-limited, observable, and cautious in its medical language. The LLM is not treated as an autonomous doctor. It is treated as a structured explanation layer that helps turn model outputs into readable educational reports while preserving human review as the final decision point.

# Chapter (17): n8n Workflows, Alerts, Digests, And Escalation

## n8n Workflow Overview

n8n is used in AscultiCor as the workflow automation layer that coordinates background tasks around the core application. The main application is responsible for authentication, database access, report processing, and clinical dashboard behavior. n8n is responsible for triggering those tasks on schedules or manual execution, collecting returned email payloads, and sending notifications through configured workflow credentials.

The project includes importable workflow templates in the `n8n/workflows` directory. The workflow set contains connectivity checking, pending LLM report processing, clinical alert notifications, device health monitoring, daily digest generation, recording summary enrichment, operations monitoring, and alert escalation. These workflows are generated from `n8n/generate_workflows.py`, which gives the team a reproducible way to rebuild the workflow JSON files if the endpoints or schedules change.

The automation design follows an important boundary rule: n8n should not directly subscribe to raw ECG or PCG MQTT topics. Raw biomedical signal streams are better handled by the firmware, MQTT broker, inference service, and database pipeline. n8n works at the higher operational level, after sessions, predictions, reports, and device status rows already exist. This reduces the risk of exposing raw patient signals to a general automation tool and keeps time-sensitive signal processing out of workflow nodes.

The n8n workflows call internal AscultiCor API endpoints using an internal token. For example, workflow actions under `/api/n8n/workflows` require the `x-internal-token` header. The backend then performs Supabase operations using service-role credentials from server-side environment variables. This keeps privileged database access inside application code rather than scattering database logic across many workflow nodes.

[Insert Figure 17.1 here: n8n automation workflow map]

Figure 17.1: n8n automation workflow map. The figure should show n8n scheduled/manual triggers connected to internal AscultiCor API endpoints, with branches for LLM report processing, clinical alerts, device health, daily digest, summary enrichment, operations monitoring, and escalation. It should also show Supabase, the dashboard, email notifications, and internal token protection.

The workflow import process starts with the connectivity check. After the deployment is running, the teammate opens n8n, creates the Gmail OAuth credential, imports the JSON workflow files, saves each workflow once, assigns the Gmail credential to every send node, and keeps workflows inactive until each manual test passes. This controlled activation sequence prevents multiple background workflows from sending unexpected emails before the team verifies the configuration.

## Clinical Alert Workflow

The clinical alert workflow monitors recent prediction and session records and creates notification alerts when important model or session conditions appear. The current backend action scans predictions created within the recent time window, loads the related session, patient, and device records, and checks for specific clinical conditions. A PCG prediction with the label `Murmur` creates a warning alert. An ECG prediction with the value `Abnormal` creates a warning alert. A session that enters the `error` state creates a critical alert.

Each alert is stored in the `device_alerts` table with device identifier, organization identifier, alert type, severity, message, and metadata. The metadata includes details such as session identifier, prediction identifier, subtype, modality, confidence value, and the workflow source. This metadata is important because it allows the dashboard and future workflows to understand why the alert was created without needing to parse the message text.

The workflow also prevents duplicate unresolved alerts. Before inserting a new alert, the backend searches for an open alert with the same device, subtype, and session. If a matching unresolved alert already exists, the workflow skips creation. This prevents repeated workflow runs from flooding the database and inbox with the same warning.

When an alert is created, the workflow prepares an email notification. The recipient is the linked patient email when available, otherwise the configured fallback team inbox is used. The email includes the alert title, device, session identifier, confidence value when available, a session link, and a reminder that the notification is for workflow review and is not a medical diagnosis.

This workflow is especially useful during demonstrations because it shows the connection between AI outputs and automated follow-up. A murmur or abnormal ECG prediction is not only displayed on the dashboard; it can also trigger a traceable alert row and an external notification. At the same time, the cautious wording keeps the project within its educational and decision-support scope.

## Device Health Workflow

The device health workflow monitors operational conditions for connected devices. It reads from the device status overview and checks whether each device appears offline, has weak Wi-Fi signal, has low free heap memory, or has reported firmware errors. These checks are not clinical diagnoses; they are system reliability checks that help the team understand whether the device pipeline is healthy.

A device is considered offline if it has no recent `last_seen_at` timestamp or if the timestamp is older than the expected freshness window. In the current workflow logic, a device older than five minutes is treated as offline. When this condition is detected, the workflow creates a critical offline alert. If the device later reports fresh telemetry, the unresolved offline alert can be resolved automatically by setting `is_resolved` and `resolved_at`.

The workflow also reads the latest telemetry row for each device. If Wi-Fi RSSI is weaker than the configured threshold, currently below -75 dBm, it creates a warning alert for weak signal. If free heap memory falls below the operational threshold, currently 30000 bytes, it creates a low-memory warning. If the telemetry reports an error count greater than zero, it creates a warning that the device reported errors. Each alert includes metadata identifying the subtype and source.

Device health automation is important because biomedical signal quality depends on the hardware and network layer. A session can fail or produce poor data because the device is offline, the Wi-Fi connection is unstable, or the firmware is under memory pressure. By documenting these checks, the project shows that the automation layer supports not only clinical review but also operational maintenance.

## Daily Digest Workflow

The daily digest workflow summarizes platform activity over the previous twenty-four hours. It collects recent sessions, predictions, unresolved alerts, and device status rows, then calculates high-level operational counts. The digest includes total sessions, completed sessions, error sessions, murmur findings, abnormal ECG findings, unresolved alerts, and offline devices.

If the Claude provider is configured, the workflow backend can request a short operational summary from the LLM. The prompt instructs the model to write a concise operational summary and not to provide medical diagnosis. If the provider is unavailable, the email still includes the raw operational counts and states that the AI summary is unavailable. This mirrors the fallback philosophy used in Chapter 16: automation should continue to provide useful information even when optional AI enhancement is unavailable.

The daily digest is sent to the configured fallback team email. It is useful for supervisors and operators because it gives a compact overview of what happened in the system without requiring them to open every session manually. It also helps identify whether the system is being used regularly and whether unresolved issues are accumulating.

## Recording Summary Enrichment

The recording summary enrichment workflow creates or updates aggregated records in the `device_recording_summaries` table. It scans completed sessions from the recent period, groups them by device and recording date, and calculates totals for sessions, recordings, duration, PCG normal results, PCG murmur results, ECG normal results, ECG abnormal results, and completed LLM reports.

This enrichment step is useful because raw session rows are detailed but not always convenient for overview pages. By maintaining daily device-level summaries, the dashboard can show trends and activity counts without repeatedly recalculating them from every individual session. The summary rows also provide a foundation for future reports, such as device usage statistics, daily quality metrics, or supervisor review dashboards.

The workflow uses an upsert operation keyed by device and recording date. This means running the workflow multiple times updates the same summary rows instead of creating duplicates. The stored `summary_json` identifies the source as n8n summary enrichment and records the generation time, which helps with traceability.

## Operations Monitoring And Escalation

The operations monitoring workflow checks whether core services and queues are healthy. It calls the inference service health endpoint, attempts to read protected inference metrics using the inference internal token, and checks the LLM report queue in Supabase. If the inference service is unreachable, metrics fail, the pending queue is too large, the oldest pending report is too old, or a generating report has been running too long, the workflow prepares an operations alert email.

The current queue monitoring rules treat more than ten pending LLM reports as a high queue and treat pending or generating reports older than fifteen minutes as suspicious. These values are reasonable for a graduation prototype because reports should normally process quickly in small batches. In a production system, the thresholds could be adjusted based on actual traffic and provider latency.

Alert escalation is a separate workflow that focuses on unresolved critical alerts. It searches for critical device alerts that are still unresolved after thirty minutes. For each qualifying alert, it checks whether the metadata already contains an escalation timestamp. If not, it writes `escalated_at` and `escalation_channel` into the metadata and sends an escalation email. This prevents the same alert from being escalated repeatedly by later workflow runs.

Escalation is important because creating an alert is not enough if nobody acts on it. The workflow adds a second layer of attention for severe conditions such as session errors or offline devices that remain unresolved. The email includes the alert message, device, creation time, session identifier when available, and a link to either the session or device page.

## Automation Security

The automation layer handles sensitive actions, so security is treated as part of the workflow design. n8n is protected with authentication in deployment, and its credentials are stored using the n8n encryption key. Workflow access should be limited to trusted team members because workflows can trigger internal application actions and send emails.

Internal API calls are protected with shared internal tokens. The `/api/n8n/workflows` route checks the `x-internal-token` header before it runs any action. The LLM processing endpoint uses the same internal-token pattern. These tokens should be stored only as environment variables on the server and inside the n8n container. They should not be written in the graduation book, committed to Git, pasted in screenshots, or sent in chat.

Least privilege is also applied at the workflow design level. n8n does not directly process raw ECG or PCG streams. It does not need browser user sessions. It does not expose service-role keys to the client. It calls backend endpoints, and the backend performs the required database operations. This creates a cleaner boundary between automation orchestration and application authority.

The workflows should avoid unnecessary patient details in email content. Where patient emails are used, the message should remain short and should avoid definitive diagnosis. For operational workflows such as device health, daily digest, operations monitoring, and escalation, the fallback team inbox is usually more appropriate than a patient address. The book should document variable names and security controls, but it should not include real API keys, internal tokens, Gmail credentials, service-role keys, or patient records.

Table 17.1: n8n workflow reference.

| Workflow | Trigger | Backend action or endpoint | Main output | Failure and retry behavior |
| --- | --- | --- | --- | --- |
| Connectivity Check | Manual test | Frontend health, inference health, Supabase check | Confirmation email | Keep inactive until health checks and Gmail delivery pass |
| Process Pending LLM Reports | Scheduled or manual | `/api/llm?action=process-pending` | Completed `llm_reports` rows and report-ready emails | Backend retry fields, exponential backoff, error state after maximum retries |
| Clinical Alert Notifications | Scheduled or manual | `/api/n8n/workflows?action=clinical-alerts` | `device_alerts` rows and clinical review emails | Duplicate unresolved alerts are skipped |
| Device Health Monitoring | Scheduled or manual | `/api/n8n/workflows?action=device-health` | Offline, weak signal, low heap, and device error alerts | Offline alerts are resolved when fresh telemetry appears |
| Daily Digest | Daily schedule or manual | `/api/n8n/workflows?action=daily-digest` | Daily operational email | Sends raw counts if AI summary is unavailable |
| Recording Summary Enrichment | Scheduled or manual | `/api/n8n/workflows?action=summary-enrichment` | Upserted `device_recording_summaries` rows | Upsert prevents duplicate daily summaries |
| Operations Monitoring | Scheduled or manual | `/api/n8n/workflows?action=ops-monitoring` | Ops alert email when service or queue issues exist | No email is sent when all monitored conditions are healthy |
| Alert Escalation | Scheduled or manual | `/api/n8n/workflows?action=alert-escalation` | Escalation email and metadata update | `escalated_at` prevents repeated escalation for the same alert |

In conclusion, Chapter 17 documents how n8n turns stored system events into operational workflows. It processes pending reports, alerts users and operators, summarizes daily system behavior, enriches recording summaries, monitors service health, and escalates critical unresolved issues. The automation layer improves project usability while remaining bounded by internal tokens, cautious medical language, and backend-controlled database access.
