# Data Model

This feature strictly consumes existing database schemas (Supabase `sessions`, `predictions`, `live_metrics`) but groups them logically in the frontend.

## Frontend UI DTO: DetailedReportContext

Aggregates all API calls into a unified data structure passed through the report components:

```typescript
interface HierarchicalReport {
  sessionMeta: {
    id: string;
    patientId: string;
    duration: number;
    patientName: string;
  };
  model1State: {
    // Current Cardiac State (e.g. ECQ Arrhythmia, PCG Murmur Presence)
    status: string;
    confidence: number;
    rawTimelineData: Waveform[];
  };
  model2Functional: {
    // Secondary characteristics (e.g. Murmur Severity, Timing info)
    severity: string;
    timing: string;
  };
  model3Prognosis: {
    // Risk assessment and predictive trajectory
    riskScore: number;
    trajectory: string;
    confidence: number;
  };
}
```
