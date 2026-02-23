## AscultiCor Professionalization Plan

This plan includes all suggested improvements. Each item lists scope, priority, and dependencies. I will implement step-by-step, starting with quick wins before larger architectural changes.

### Phase 0: Foundations (Quick Wins)
1. Patient management (MVP)
   - Add `patients` table (id, name, dob, sex, mrn, notes, created_at)
   - Link sessions to patients (`sessions.patient_id`)
   - UI: Patient list + select in session creation
   - Dependencies: Supabase migration, frontend forms
   - Status: Completed (2026-02-23)
2. Clinical notes & annotations
   - Add `session_notes` table (id, session_id, author_id, note, created_at)
   - UI: Notes panel in session details
   - Status: Completed (2026-02-23)
3. Session timeline
   - UI timeline using session status changes, predictions, device events
   - Requires minimal backend if using existing timestamps
   - Status: Completed (2026-02-23)
4. Better empty/error states
   - Add contextual recovery actions (check MQTT, create device, retry)
   - Status: Completed (2026-02-23)
5. Real-time indicators
   - Show live badge for streaming + heartbeat freshness
   - Status: Completed (2026-02-23)
6. A11y + keyboard navigation
   - Modal focus traps, aria labels, keyboard shortcuts
   - Status: Completed (2026-02-23)
7. Motion/layout polish
   - Staggered list skeletons, consistent header spacing
   - Status: Completed (2026-02-23)

### Phase 1: Analytics & Controls
8. Advanced filtering + saved views
   - Filters for sessions: device, patient, status, date range, prediction label
   - Save filters per user in `saved_views`
   - Status: Completed (2026-02-23)
9. KPI consistency
   - Add metrics cards: sessions last 24h, avg inference latency, offline devices >1h
   - Status: Completed (2026-02-23)
10. Performance polish
   - Replace polling with Supabase realtime for sessions & predictions
   - Status: Completed (2026-02-23)

### Phase 2: Reporting & Governance
11. Export enhancements
   - PDF + CSV including patient/device metadata and clinician notes
   - Add “reviewed by” signature block
   - Status: Completed (2026-02-23)
12. Audit log
   - `audit_logs` table (actor, action, entity, metadata, timestamp)
   - UI viewer for admins
   - Status: Completed (2026-02-23)
13. Organization roles & permissions
   - Roles: admin, clinician, readonly
   - UI guardrails + RLS policies
   - Status: Completed (2026-02-23)
14. Model version tracking
   - Display model version, changelog, model notes in UI
   - Status: Completed (2026-02-23)

### Phase 3: Advanced Clinical Workflows
15. Alert rules + notifications
   - Configurable thresholds, email/webhook
   - Status: Partially completed (2026-02-23) — added in-app alerts inbox + resolve
16. Session replay
   - Store waveform segments and allow replay with markers
   - Status: Completed (2026-02-23) — replay recent live_metrics snapshots
17. Data retention & de-identification
   - Retention policy per org, anonymized export
   - Status: Partially completed (2026-02-23) — org settings + de-identified exports

### Execution Notes
- I will implement Phase 0 items first, one by one.
- Each item will include DB migrations (if needed), API updates, and UI changes.
- Each step will be committed as a discrete change set and documented here.
