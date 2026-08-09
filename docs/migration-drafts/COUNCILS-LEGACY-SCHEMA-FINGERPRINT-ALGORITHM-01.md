# Councils legacy schema fingerprint algorithm 01

This is the forward frozen algorithm reference. It does not claim that the historical evidence originally contained this description.

## Algorithm

The fingerprint is:

```sql
encode(digest(string_agg(line, E'\n' ORDER BY line), 'sha256'), 'hex')
```

using `pgcrypto`. Each participating catalog observation contributes one `line`.

Participating rows are:

- columns for `public.academic_council%` ordinary tables (`relkind = 'r'`);
- constraints, indexes, and non-internal triggers on those tables;
- the five required enums and their labels in `enumsortorder`;
- the 16 allowlisted legacy functions, with normalized definitions;
- the 23 public legacy policies and the two `storage.objects` `acta_%` policies.

Function definitions are normalized by collapsing every whitespace run to one ASCII space and trimming the result. All aggregate input is sorted lexicographically by the complete generated line. Enum labels retain declaration order before they become part of their line. Catalog row prefixes (`table:`, `constraint:`, `index:`, `trigger:`, `enum:`, `function:`, and `policy:`) are part of the input and must not be changed.

## Canonical pin and authority

The canonical production pin is:

`3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9`

When `supabase_migrations.schema_migrations` exists, this pin is the only authority. A set non-empty `councils.fingerprint_expected` or `councils.local_test_fingerprint_mode` causes a HOLD; production runbooks must never override the pin.

## Disposable-only test mode

Outside production-ledger context, an actual fingerprint equal to the canonical pin passes directly. Otherwise, test-only replicas must set:

`councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY'`

They must set `councils.local_test_fingerprint_expected` to the pre-captured digest. Silent self-match is forbidden so mutated catalogs cannot false-pass. The preflight emits `PREFLIGHT_LOCAL_TEST_FINGERPRINT_MODE: LOCAL_TEST_ONLY`. This path is not for production runbooks.

`councils.fingerprint_expected` is deprecated everywhere. If set, it causes a HOLD with guidance to use the explicit `LOCAL_TEST_ONLY` mode in a disposable environment.
