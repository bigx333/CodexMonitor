# Refactor Action Plan

Read when: planning medium/large architecture changes, remote-mode reliability work, contract hardening.

## Scope

- Stabilize remote thread/workspace routing.
- Reduce contract drift across frontend/Tauri/daemon.
- Reduce runtime parsing risk (`any`, loose JSON).
- Hardening for remote auth + transport.
- Improve maintainability of thread/message orchestration.

## Phase 0: Guardrails First (P0)

### TODO List

- [x] `R0.1` Add remote multi-workspace sub-agent routing regression suite.
  - Deliverable: failing tests for known bad paths, then green with fix.
  - Files: `src-tauri/src/backend/app_server.rs`, `src/features/threads/hooks/useThreads.integration.test.tsx`
  - Effort: `M`
  - Risk: `Low`
  - Depends on: none

- [x] `R0.2` Add RPC parity test (frontend command names vs Tauri handler vs daemon RPC).
  - Deliverable: CI test that fails on command drift.
  - Files: `src/services/tauri.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc/*`
  - Effort: `M`
  - Risk: `Low`
  - Depends on: none

- [x] `R0.3` CI rust quality gates (`cargo fmt --check`, `cargo clippy -D warnings`).
  - Deliverable: CI jobs + passing baseline.
  - Files: `.github/workflows/ci.yml`
  - Effort: `S`
  - Risk: `Low`
  - Depends on: none

- [x] `R0.4` Virtualization hardening pass (already implemented; now correctness/perf checks).
  - Deliverable: tests and guardrails for dynamic heights, collapse/expand, bottom-anchor scrolling.
  - Files: `src/features/messages/components/Messages.tsx`, `src/features/messages/components/Messages.test.tsx`
  - Effort: `S-M`
  - Risk: `Med`
  - Depends on: none

### Checkpoint `CP0`

- [x] `CP0.A` All `R0.*` merged.
- [ ] `CP0.B` `npm run test`, `npm run typecheck`, `cd src-tauri && cargo test && cargo check` green in CI.
- [ ] `CP0.C` No known remote thread mis-routing repro left open.

## Phase 1: Contract + Type Hardening (P0/P1)

### TODO List

- [ ] `R1.1` Type-hardening pass for frontend RPC boundaries (`invoke<any>` reduction). (in progress)
  - Deliverable: typed wrappers for highest-risk calls (`threads`, `turn`, `account`, `apps`, `prompts`).
  - Files: `src/services/tauri.ts`, `src/features/*/hooks/*`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `R0.2`

- [ ] `R1.2` Replace long app-server event `if` chain with handler registry + decoders.
  - Deliverable: one route table; per-method decoder; centralized casing normalization.
  - Files: `src/features/app/hooks/useAppServerEvents.ts`, `src/utils/appServerEvents.ts`, `src/features/threads/utils/threadNormalize.ts`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `R1.1`

- [x] `R1.3` Remove low-value parser duplication in event hub wrappers.
  - Deliverable: reduced boilerplate; no duplicate method hubs.
  - Files: `src/services/events.ts`
  - Effort: `S`
  - Risk: `Low`
  - Depends on: `R1.2`

### Checkpoint `CP1`

- [ ] `CP1.A` Event route table/decoder coverage includes all currently supported methods.
- [ ] `CP1.B` `any` usage reduced on prioritized boundary paths.
- [ ] `CP1.C` No behavior regression in thread/message event flows.

## Phase 2: Structural Refactors (P1)

### TODO List

- [ ] `R2.1` Decompose `MainApp` into bounded orchestration modules.
  - Deliverable: `src/App.tsx` reduced to composition shell + feature orchestrators.
  - Files: `src/App.tsx`, `src/features/app/orchestration/*`, `src/features/app/hooks/*`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `CP1`

- [ ] `R2.2` Thread lifecycle state-machine extraction (send/queue/steer/review/interrupt).
  - Deliverable: explicit state transitions + isolated reducer/state machine tests.
  - Files: `src/features/threads/hooks/useThreads.ts`, `src/features/threads/hooks/useThreadMessaging.ts`, `src/features/threads/hooks/useThreadActions.ts`, `src/features/threads/hooks/useThreadsReducer.ts`
  - Effort: `L`
  - Risk: `High`
  - Depends on: `R1.2`, `R2.1`

- [ ] `R2.3` App-server transport hot-path lock optimization.
  - Deliverable: fewer lock/clone passes per event, measured throughput improvement.
  - Files: `src-tauri/src/backend/app_server.rs`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `CP0`

- [ ] `R2.4` Split oversized tests into domain suites.
  - Deliverable: smaller files, shared fixtures, easier triage.
  - Files: `src/features/settings/components/SettingsView.test.tsx`, `src/features/threads/hooks/useThreadActions.test.tsx`, `src/features/threads/hooks/useThreads.integration.test.tsx`
  - Effort: `S-M`
  - Risk: `Low`
  - Depends on: `CP1`

### Checkpoint `CP2`

- [ ] `CP2.A` Thread lifecycle transitions documented and tested.
- [ ] `CP2.B` `src/App.tsx` reduced substantially; no lost behavior.
- [ ] `CP2.C` Perf delta captured for app-server event routing path.

## Phase 3: Security Hardening (P0/P1)

### TODO List

- [ ] `R3.1` Migrate remote tokens from settings JSON to OS credential store.
  - Deliverable: migration path + fallback handling + token redaction in logs.
  - Files: `src-tauri/src/storage.rs`, `src-tauri/src/types.rs`, `src/features/settings/components/SettingsView.tsx`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `CP1`

- [ ] `R3.2` Remote transport hardening (TLS/mTLS or strict trusted-channel contract + enforcement).
  - Deliverable: explicit security model and validation at connect/auth boundaries.
  - Files: `src-tauri/src/remote_backend/tcp_transport.rs`, `src-tauri/src/remote_backend/mod.rs`, `src-tauri/src/remote_backend/transport.rs`
  - Effort: `L`
  - Risk: `High`
  - Depends on: `R3.1`

- [ ] `R3.3` Command-exec policy hardening for remote mode (`run_bang_command` observability + guardrails).
  - Deliverable: tighter policy checks + auditable events.
  - Files: `src-tauri/src/shared/codex_core.rs`, `src/features/threads/hooks/useThreadMessaging.ts`
  - Effort: `M`
  - Risk: `Med`
  - Depends on: `CP2`

### Checkpoint `CP3`

- [ ] `CP3.A` Remote token storage no longer plaintext.
- [ ] `CP3.B` Transport/auth hardening validated in integration tests.
- [ ] `CP3.C` Remote command execution policy documented and tested.

## Dependency Map (Quick)

- `CP0` -> `R1.1`, `R2.3`
- `R0.2` -> `R1.1`
- `R1.1` -> `R1.2`
- `R1.2` -> `R1.3`, `R2.2`
- `CP1` -> `R2.1`, `R2.4`, `R3.1`
- `R2.1` + `R1.2` -> `R2.2`
- `CP2` -> `R3.3`
- `R3.1` -> `R3.2`

## Execution Cadence

- Weekly checkpoint review against `CP0`..`CP3`.
- Each `R*` item ships as small PR slices (test-first when possible).
- No phase advance until prior checkpoint complete.
