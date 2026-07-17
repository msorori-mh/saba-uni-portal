# Dependency Graph

```mermaid
flowchart TD
  Q[Dynamic queue activation] --> C[Integration audit]
  Q --> F[Flutter contract audit]
  C --> B[Student-to-cohort binding audit]
  B --> R[Cohort current-term course read model]
  R --> E[Individual academic exceptions]
  R --> U[Student current-term courses UI]
  R --> T[Timetable consumption]
  B --> M[Course-material audience]
  T --> L[Lecture execution monitoring]
  C --> S[Legacy section compatibility adapter]
  F --> FB[Flutter backend consumption implementation tasks]

  W[B1 free workflows draft 08] --> REL[Reviewed atomic caller release evidence]
  REL --> MIG[B1 sequential migrations]
  W --> MIG
  MIG --> ACL[B1 ACL cutover]
  ACL --> VIS[Separate activation and student_visible]
```

Production nodes `REL`, `MIG`, `ACL`, and `VIS` remain fail-closed and require the
specific approvals and verification gates recorded in the project runbook.
