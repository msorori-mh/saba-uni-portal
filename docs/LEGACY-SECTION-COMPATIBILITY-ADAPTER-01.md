# LEGACY-SECTION-COMPATIBILITY-ADAPTER-01

## Contract

Historical `course_sections` remain the source of record. The adapter provides
a read-only delivery-group-compatible projection with:

- `source_kind = legacy_course_section`;
- a stable namespaced ID derived only from `course_sections.id`;
- explicit source table, primary key, mapping kind, and observed section code;
- exactly one authoritative study-system evidence value;
- exactly one authoritative component evidence value.

The projection succeeds only for an unambiguous one-to-one mapping. Missing or
multiple study systems/components fail closed. Missing relational identity also
fails closed.

## Non-inference rules

`section_code` is an opaque historical label. The adapter records it as
provenance but never parses it for study system, component type, cohort,
program, level, ownership, or authorization. Callers must obtain system and
component evidence from reviewed authoritative relations and must authorize the
underlying exact section before adapting it.

This contract does not merge sibling sections and does not infer cohort
membership from matching labels, programs, or levels.

## Boundaries

- No row is inserted, updated, deleted, merged, or backfilled.
- No schema, SQL, migration, RLS, production, deployment, or
  `student_visible` change is included.
- The adapter does not activate or implement future delivery-group persistence.
- Future consumers must translate this compatibility shape explicitly rather
  than making this module depend on interfaces being developed independently.
