# AscultiCor Implementation Plan — Next Steps

## Goal
Move from a working baseline to production-grade reliability, observability, and operational safety.

## Phase 1 (Current PR)
1. Add concurrency guard to scheduled LLM queue workflow to prevent overlapping runs.
2. Add queue observability endpoint (`GET /api/llm?action=queue-stats`) for operational monitoring.
3. Update CI schema sanity checks to include the latest migration (`005_llm_queue_retries.sql`).

## Phase 2
1. Add minimal integration tests for async queue flow:
   - queue creation
   - internal processor auth
   - retry/backoff transition
2. Add failure alerts for scheduler workflow (GitHub Actions failure notifications).

## Phase 3
1. Replace in-memory rate limiting with shared store (Redis) in inference service.
2. Add dashboard cards for queue health (pending, retrying, errors, oldest pending).

## Phase 4
1. Add runbook for token rotation and queue incident handling.
2. Add branch protection policy requiring CI checks and PR review.

## Success Criteria
- No overlapping scheduled queue processors.
- Queue backlog and failures visible without direct DB access.
- CI sanity checks always include the latest schema changes.
