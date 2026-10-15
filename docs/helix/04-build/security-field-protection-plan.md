---
ddx:
  id: umf.plan.security-field-protection
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: CONTRACT-063
      kind: informed_by
    - id: TD-056
      kind: informed_by
    - id: TD-057
      kind: informed_by
    - id: TD-079
      kind: informed_by
    - id: STP-056
      kind: informed_by
    - id: STP-057
      kind: informed_by
    - id: SEC-PG-RAW
      kind: informed_by
    - id: SEC-DELTA-RAW
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# Row/attribute security, masking and tokenization: PostgreSQL 18 and Unity Catalog plan

Owner direction (2026-10-13): plan row-level security, attribute-level (column)
security, data masking and tokenization as a UMF shared extension, qualified
first on PostgreSQL 18 and Unity Catalog (Delta relational), without precluding
later reuse of the same definitions in Truss (PostgreSQL graph profile) and
Ashlar (Delta graph profile). This plan sequences build work only. Product
meaning stays in FEAT-008/CONTRACT-062; binding/evidence admission stays in
CONTRACT-063; exact tests stay in STP-056/057 and `03-test/security/`.
Upstream amendments this plan needs are listed in §Proposed upstream
amendments; the owner directed their application on 2026-10-14 (see §Owner
direction and applied amendments).

## Owner direction and applied amendments — 2026-10-14

On 2026-10-14 the owner directed the build-out of this plan. Slice B-SFP-000
(this amendment) applied proposals P-A..P-G to the governing artifacts in
authority order and recorded the following decisions:

- **Q10 accepted.** The consumer-owned Unity Catalog protected write path
  (B-SFP-017) is in scope. It remains unqualified until native evidence exists;
  without it `unity-delta-raw` cannot be `qualified` (CONTRACT-063).
- **Q13 resolved as an enlarged single gate (recorded assumption).** The
  P-cases were added to `cases.json` rather than to a separate protection gate,
  following the risk response below. The gate now holds 145 required cases:
  the original 132 plus 13 P-cases, all `not-run`. The 26 accepted cases keep
  their status, so the current state is 26 accepted of 145 required with 119
  open (118 `not-run`, pg-raw.B10 `counterexample-found`); the historical
  26/132 figure is unchanged for its dated checkpoints. No case is retired or
  promoted. `tools/security/validate-evidence.py` now expects 145 cases.
- **Final P-case mapping (P-F).** New IDs exist only for obligations no
  existing case owns; the rest are procedural expansions recorded in
  `03-test/security/{pg-raw,delta-raw}.md`:

| Plan label | Case ID or expansion | AC |
| --- | --- | --- |
| PG P01 column-privilege withhold | pg-raw.P01 | US-056-AC6 |
| PG P02 barrier-view transforms | pg-raw.P02 | US-056-AC6 |
| PG P03 disclosure-profile query use | pg-raw.P03 (weakened-barrier control stays a B08 expansion) | US-056-AC6 |
| PG P04 mask write-back | pg-raw.P04 | US-057-AC1 |
| PG P05 virtual generated column | pg-raw.P05 | US-056-AC7 |
| PG P06 privileged bypass matrix | expansion of pg-raw.B04/B05/B14 (no case ID) | US-056-AC5 |
| PG P07 Anonymizer archive | pg-raw.P07 | US-056-AC7 |
| PG P08 tokenization stand-in | pg-raw.P08 (dump/replica propagation also expands L10) | US-056-AC6 |
| UC P01 view withhold vs NULL mask | delta-raw.P01 | US-056-AC7 |
| UC P02 mask UDF transforms | delta-raw.P02 | US-056-AC6 |
| UC P03 masked-column operators | delta-raw.P03 | US-056-AC6 |
| UC P04 invisible-row INSERT | delta-raw.P04 | US-057-AC1 |
| UC P05 time travel/clone/share | expansion of delta-raw.L08/L10 (no case ID) | US-057-AC4/AC6 |
| UC P06 direct-access matrix | expansion of delta-raw.B04 (no case ID) | US-056-AC5 |
| UC P07 ABAC archive and `EXCEPT` | delta-raw.P07 | US-056-AC7 |
| UC P08 tokenization stand-in | delta-raw.P08 | US-056-AC6 |

- **Applied where.** P-A/P-B/P-C: FEAT-008 SEC-13/14/15. P-D: CONTRACT-062
  §Field protection catalog. P-E: CONTRACT-063 §Field protection receipt
  members and PG 18/UC citations. P-F: STP-056/057, `pg-raw.md`,
  `delta-raw.md`, `cases.json`. P-G: SD-008 §Field protection decisions.
- **Still open after this amendment (M0 residue).** Semantic cases S13–S25
  are named here but not allocated in STP-079/US-079 or `cases.json`; draft
  2020-12 schema text for `spec/extensions/security-protection/` does not
  exist; the committed `acceptance.json` predates the amended `cases.json`
  digest and must be re-executed by the next slice that runs the gate; the
  token ceiling is still unknown. `validate-evidence.py` also still expects
  criterion IDs `US-055-AC*` while the plan uses `US-079-AC*` (pre-existing,
  outside this slice; recorded, not fixed); 91 of its freshness checks already
  failed on the unmodified origin/main tree in the authoring environment, and
  `formal.json` pins the CONTRACT-062/063 bytes, so its freshness check fails
  until the Z3 conditional proofs are replayed against the amended contracts
  (B-SFP-003 or the next formal replay; the authoring environment had no Z3).
  Continuation state is in `evidence/security/field-protection/CONTINUATION.json`.

## Scope

**Governing Artifacts**:
- [FEAT-008](../01-frame/features/FEAT-008-shared-security.md) SEC-01..SEC-12; [PRD](../01-frame/prd.md) FR-46 and the Extensions and Partial Participation subsystem (FR-4/5/22/27/34); [cross-cutting requirements](../01-frame/cross-cutting-requirements.md) NFR-8/9/10 (extension isolation, distinguishable identifiers, version-aware semantics), NFR-25 (vendor extension preservation), NFR-32 (no embedded code execution).
- [FEAT-005](../01-frame/features/FEAT-005-core-ideals.md) IDEAL-02/03/05: author assertions separate from native classification; strict/report projection; admission separate from native equivalence.
- [SD-008](../02-design/solution-designs/SD-008-shared-security.md); [CONTRACT-062](../02-design/contracts/CONTRACT-062-security-semantics.md) (disposition algebra, query-use modes, constant transform 0.1.0); [CONTRACT-063](../02-design/contracts/CONTRACT-063-security-enforcement.md) (BindingReceipt, obligations, NativeInventory, fresh execution gate); [CONTRACT-001](../02-design/contracts/CONTRACT-001-core-envelope.md) (unknown extension preservation); [CONTRACT-042](../02-design/contracts/CONTRACT-042-physical-binding.md) (logical/physical separation); [ADR-002](../02-design/adr/ADR-002-bun-development-runtime.md).
- [TD-056](../02-design/technical-designs/TD-056-security-bindings.md), [TD-057](../02-design/technical-designs/TD-057-security-lifecycle.md), [TD-079](../02-design/technical-designs/TD-079-security-semantics.md).
- [Test plan](../03-test/test-plan.md), [STP-056](../03-test/test-plans/STP-056-security-bindings.md), [STP-057](../03-test/test-plans/STP-057-security-lifecycle.md), [STP-079](../03-test/test-plans/STP-079-security-semantics.md), [pg-raw procedures](../03-test/security/pg-raw.md), [delta-raw procedures](../03-test/security/delta-raw.md), [truss](../03-test/security/truss.md), [ashlar](../03-test/security/ashlar.md), [cases.json](../03-test/security/cases.json) (145 required cases since 2026-10-14: the original 132 plus 13 `not-run` P-cases; 26 accepted per the [evidence README](evidence/security/README.md), which does not date the tally; cite the receipt/commit at execution).
- Existing execution evidence: [implementation plan — shared security execution goal](implementation-plan.md#shared-security-execution-goal-2026-10-08) and `evidence/security/`.

### What already exists (extend, do not duplicate)

| Capability | Where | Status |
| --- | --- | --- |
| Row-level meaning: permit/require/forbid rules, correlated `exists` over associations, strong-Kleene composition | `umf.security` 0.1.0, `src/extensions/security/{policy,logic,evaluate}.ts`, `spec/extensions/security/schema.json` | Implemented; S01–S12 pass in Bun and Chromium |
| Attribute-level meaning: per-field `protected/unprotected`, dispositions `original/withheld/transformed`, query-use modes `disclosed/original-authorized/prohibited` per operator | CONTRACT-062 §Disclosure and query use; `disclosure.ts`, `umf.security.disclosure/0.1.0` transport | Implemented; only transform is `constant/0.1.0` (`schema.json#/$defs/disposition` constrains `transform` to `const "constant"`) |
| Write-state admission (original/proposed/field mutation) | `write.ts`, `evaluateSecurityWrite` | Implemented semantically; native L01/L02 accepted on PostgreSQL 17.9 raw |
| Native PostgreSQL raw evidence | pg-raw.B01–B07, B11, B13–B16, L01, L02 on PostgreSQL 17.9 | Accepted at authored stable cuts; B08 `not-run`; B10 `counterexample-found`. The formal weakened-threshold control is `tools/security/prove-mask-query.py` (Z3, not native); `original-use-hidden-carrier-counterexample.json` is the native hidden-carrier counterexample |
| Unity Catalog | `delta-raw.*` 30 cases `not-run`; `databricks-actors.json` reports zero distinct non-installer identities | Not started natively |
| Masking beyond constant, generalization, hashing, tokenization, encryption | none | Not designed; CONTRACT-062 says other transforms are "preservation-only until separately qualified" |

### In scope

1. A new independently versioned extension, proposed id `umf.security.protection` 0.1.0 ("field protection"), defining a named transform catalog (mask, generalize, hash, tokenize, encrypt) with declared reversibility, information-disclosure profile, determinism, allowed query use and storage/vault obligations. `withhold` stays a disposition in `umf.security`, not a transform.
2. A minor revision of `umf.security` (proposed 0.2.0) whose `transformed` disposition may reference a protection-catalog transform by `{vocabulary,transform,version}` in addition to the retained `constant/0.1.0`. Unknown transforms remain preserved and block interpretation.
3. PostgreSQL 18 relational binding profile `umf.security.binding.postgresql-raw/0.2.0` (new PG major; the accepted 17.9 fixtures are not reused as PG18 evidence). All 14 accepted pg-raw cases (B01–B07, B11, B13–B16, L01, L02) are replayed on PG 18; any not replayed is listed as "not qualified on 18" in the 0.2.0 receipt.
4. Unity Catalog Delta relational binding profile `umf.security.binding.unity-delta-raw/0.1.0`.
5. Forward-compatibility constraints so Truss and Ashlar bind the same policy/protection definitions through their own mappings.
6. Evidence, qualification wording and counterexample corpus for the above.

### Non-goals

- Production grants, live deployment, replacing database-native administration (FEAT-008 out of scope).
- Implementing a token vault, key management, encryption at rest or detokenization services. UMF declares and preserves obligations; vault/KMS integration is consumer-owned.
- Recursive ownership, arbitrary policy code, external engines (Cedar/OPA) as canonical meaning.
- Claiming Truss or Ashlar qualification from raw-table evidence (SEC-06).
- Weakening any existing accepted case or the 132-case gate; this plan adds cases, it does not retire any.
- Core promotion of any security concept (CONTRACT-040 gate is separate).

## Shared Constraints

- SEC-01/NFR-10: protection semantics are an independently versioned extension; `umf.security` and `umf.security.protection` pin exact versions together in a policy; unknown versions preserve but block interpretation.
- SEC-02: policies and transforms target qualified logical `{documentId,moduleId,elementId}` fields; native carriers (PG table/column/view/routine, UC catalog.schema.table.column/UDF) live only in binding mappings. Raw-table paths use no graph vocabulary (no node/edge/property terms in `postgresql-raw` or `unity-delta-raw` mappings).
- SEC-04: a transform never authorizes; missing, unknown or untrusted facts are `indeterminate`, never "mask instead".
- SEC-05: canonical null, original absence, withheld and transformed remain distinct on every transport; lossy SQL NULL alone cannot carry "withheld" (CONTRACT-062). Column-privilege refusal (PG 42501) is a whole-statement refusal, not a per-cell `withheld` disposition, and must be reported as such.
- SEC-07/08: enforcement claims need an independent oracle compared against native filters, write effects and disclosed values at an actual ordinary identity; report-mode translation never installs weaker protection; unsupported obligation = no admission.
- SEC-09: write admission needs original and proposed states. Where a backend offers read-side-only mechanisms, writes are `unsupported` for that backend profile unless a consumer-owned protected write path is itself qualified.
- SEC-10: tokenized/encrypted stored data, deterministic joinability, format preservation, key/vault ownership, history/snapshots/exports and revocation propagation are declared obligations in receipts.
- SEC-11/12: private authorization facts (Assignment, token vault membership, key custody) must not leak through diagnostics; every claim names versions, subset, fingerprints and evidence (CONTRACT-063 EvidenceCase).
- CONTRACT-062 "Canonical data is never overwritten by a read mask": every binding must refuse or prove impossible a *mask write-back*. Semantic rule (P-C): changing a field requires an `original` read disposition on that field for the subject, or an explicitly declared blind-write permission; comparing the proposed value to the reader's mask output is neither necessary nor sufficient. Native column-`UPDATE` denial is defense in depth for direct SQL only, because it does nothing inside `SECURITY DEFINER`/application-mediated write routines.
- ADR-002: all semantic, validation, transform-catalog and SQL-text-generation code is browser-compatible TypeScript with no `Bun.*`/Node globals; native drivers, containers and CLIs stay under `tools/`, `tests/**/native` and scripts. Chromium parity is a gate for every public operation.
- NFR-32: transform definitions are data; UMF never executes authored UDF/SQL bodies. Pure reference implementations exist only for transforms whose output is fully determined by declared parameters (constant, generalize, format-preserving redaction); keyed/vault transforms are declared, not executed, by UMF.
- Concern `Bounded processing and security`: transform catalogs, parameter sizes, generated SQL length and oracle fixture sizes carry explicit bounds and refusal outcomes.

## Capability model: per-backend subsets, not a least common denominator

Risk: accepting only what every backend can enforce would reduce UMF to the weakest profile (Unity Catalog, read-side only) and be useless on PostgreSQL. This plan avoids that as follows.

- **Meaning is the superset.** Policy and protection documents express everything the semantics support (row rules, write authority, transforms, query use, custody). Authoring is never limited to what one backend can do.
- **Capability is per binding profile.** Each profile publishes a supported/refused subset per logical obligation in its receipt. PostgreSQL 18 is qualified on its own subset and is not held back by Unity Catalog; Unity Catalog is qualified on its own, narrower subset. Cross-backend claims are made only for the explicitly named intersection.
- **Refusal is the floor, not the ceiling.** A backend that cannot enforce an obligation natively either refuses it (SEC-08) or routes it through a separately qualified consumer-owned path (see B-SFP-017). It never silently weakens it.
- **Useful states per backend are named up front:** PG18 = row read/write, column withhold, view-based mask/generalize/hash; UC = row read, view-based withhold, mask UDFs; UC writes need B-SFP-017 or stay `unsupported`.
- **Gate consequence:** under CONTRACT-063 a profile with a required positive case it cannot pass (UC `L01/L02`) cannot be `qualified`. The plan therefore reports UC read-side evidence as `candidate`/`unsupported` unless B-SFP-017 passes L01/L02; Q10 was accepted on 2026-10-14, so B-SFP-017 is in scope and unqualified until evidence.

## Extension data model

### Layering (what is core, what is extension)

| Layer | Owns | Versioned by |
| --- | --- | --- |
| Core 0.8.0 envelope | Records, Fields, Keys, literal carriers, unknown-content preservation (CONTRACT-001/040/049) | core |
| `umf.security` 0.1.0 → proposed 0.2.0 | Ontology, rules (row-level meaning), per-field protection class, dispositions, query-use modes, write/time semantics | extension |
| `umf.security.protection` 0.1.0 (new) | Named transform catalog, disclosure profiles, tokenization/encryption obligations, parameter domains, reference evaluators for pure transforms | extension |
| Binding profiles (CONTRACT-063) | Physical mapping, native constructs accepted/refused, receipts | per backend profile |
| Native archives | Raw PG `pg_policy`/ACL/SECURITY LABEL rows, UC `ROW FILTER`/`MASK`/policy DDL text | opaque, preserved, never authority |

No core member is added. Core promotion of "protected field" or "transform" is out of scope.

### `umf.security.protection` 0.1.0 (proposed shape; CONTRACT-062 amendment owns the normative text)

A protection document is `{vocabulary:"umf.security.protection", version:"0.1.0", id, revision, transforms:[Transform], native?}`. `Transform` is:

| Member | Shape | Rules |
| --- | --- | --- |
| `id`, `version` | strings | Unique in document; referenced from `umf.security` dispositions as `{vocabulary,transform,version}` |
| `kind` | `mask` \| `generalize` \| `hash` \| `tokenize` \| `encrypt` | Closed in 0.1.0; unknown kinds preserved, block interpretation |
| `inputDomain`, `outputDomain` | qualified Field refs declaring exact literal domains | Output may differ from canonical type; must survive disclosure encoding (CONTRACT-062) |
| `determinism` | `deterministic` \| `random` \| `keyed-deterministic` | Deterministic/keyed-deterministic preserves equality classes; random does not |
| `reversibility` | `none` \| `keyed` \| `vault` | `keyed`/`vault` require a `custody` block and a separate `reverseAction` (detokenize/decrypt) action id |
| `disclosureProfile` | set of retained properties: `equality`, `order`, `prefix(n)`, `suffix(n)`, `length`, `format`, `nullity`, `range(bucket)`, `cardinality` | Drives allowed query use; absent property means not retained. Authored, but `determinism` is a fact: `deterministic`/`keyed-deterministic` always implies `equality` retained regardless of what is authored, so an under-declared profile cannot admit `join`/`group` as if equality were hidden |
| `queryUse` | per operator (`predicate`,`order`,`group`,`join`,`aggregate`): `disclosed` \| `original-authorized` \| `prohibited` | Omission = `prohibited`. `disclosed` is admissible only if the effective retained properties (authored `disclosureProfile` ∪ properties implied by `determinism`) include what the operator depends on (e.g. `join` needs `equality`); the validator refuses otherwise, and receipts report implied leakage even when not authored |
| `parameters` | typed constants using existing literal carriers | Bounded (max 32, each literal max 4,096 UTF-16 units) |
| `custody` (tokenize/encrypt) | `{owner, vaultRef?, keyRef?, formatPreserving, storageEffect:"stored-transformed", propagation:{history,snapshots,exports,feeds,caches}}` | Declares consumer-owned obligations; UMF validates presence and shape only |
| `function` (mask) | function class: `constant`, `partial`, `fixed-length-redact`, `regex-replace(declared pattern)`, `null-out` | `null-out` is still `transformed` (it discloses a typed null distinct from canonical null in disposition metadata) |

Open design note: `generalize` includes `range-bucket`, `truncate-date`, `prefix-only`; `hash` requires `algorithm` + `salt custody` (`none`/`keyed`); unsalted hash is admitted only with `disclosureProfile` including `equality` and a mandatory warning obligation (dictionary attack) in the receipt.

Preservation: unknown members/transforms/kinds survive `read/writeProtectionSource` round trips; `inspectProtectionCatalog` reports valid/complete separately; `requireProtectionInterpretation` refuses incomplete closure. Migration `umf.security` 0.1.0 → 0.2.0 is additive (constant references unchanged); rollback 0.2.0 → 0.1.0 refuses when a non-constant transform is referenced (rollback must not broaden access; CONTRACT-062 §Precedence).

### Tokenization as a separate concern

Tokenization changes stored data; masking changes disclosed data. Both share the security vocabulary (protected field, disposition, query use, actions) but tokenization adds:

- `storageEffect:"stored-transformed"`: the canonical physical carrier holds tokens; the "original" value lives in a consumer-owned vault. The `original` disposition keeps its CONTRACT-062 meaning, the stored canonical value, which for a tokenized field is the token. Recovering plaintext is a distinct `reversed` disposition obtained only through a separate `reverseAction` evaluated as its own exact action. Disclosure transport carries `storageEffect` per field so a consumer can tell a token from a plaintext value.
- Joinability: `deterministic` tokens preserve equality across tables sharing one vault/key; `random` tokens break joins. Query-use admission reads this from `determinism`+`disclosureProfile`, never from the backend.
- Format preservation (`formatPreserving:true`) must declare the preserved format as a facet so validators and downstream projections do not misclassify tokens as real values.
- SEC-10 propagation: history, snapshots (Delta time travel, PG dumps), exports, feeds and caches carry tokens; revocation of detokenize authority must be declared for each; key rotation/vault re-keying is an authority-generation change (CONTRACT-063 generation advancement).
- Enforcement: UMF never calls a vault. Every tokenize/encrypt obligation is `unverified` in a receipt until a backend profile supplies evidence (SEC-08); until then the field is admitted as *declared-tokenized, enforcement unqualified*.

## Binding design: PostgreSQL 18 (`postgresql-raw/0.2.0`)

Sources inspected 2026-10-13: [Row Security Policies (18)](https://www.postgresql.org/docs/18/ddl-rowsecurity.html), [CREATE POLICY (18)](https://www.postgresql.org/docs/18/sql-createpolicy.html), [GRANT (18)](https://www.postgresql.org/docs/18/sql-grant.html), [Release notes 18](https://www.postgresql.org/docs/18/release-18.html) (18.0 released 2025-09-25), [PostgreSQL Anonymizer docs](https://postgresql-anonymizer.readthedocs.io/en/latest/) and [INSTALL](https://postgresql-anonymizer.readthedocs.io/en/latest/INSTALL/).

| Logical obligation | Native construct | Mapping | Refused / unqualified |
| --- | --- | --- | --- |
| Row read eligibility (permit/require/forbid, `exists` over Assignment/Ownership) | `CREATE POLICY ... FOR SELECT USING (...)` with `ENABLE` + `FORCE ROW LEVEL SECURITY`; require/forbid compile to `AS RESTRICTIVE`, permits to permissive (docs: permissive OR, restrictive AND; "If there are no PERMISSIVE policies, then access is denied") | Same lowering already exercised on 17.9 (fixed-search-path private owner helper, three-valued existence CASE) | Policies referencing `pg_temp`/mutable search path; leakproof-sensitive predicates; any policy using `current_user` without the qualified subject binding |
| Row write authority (SEC-09) | `WITH CHECK` on INSERT/UPDATE; UPDATE/DELETE also pass SELECT `USING` (CREATE POLICY Table 300); `RETURNING` rows must satisfy SELECT policies (error, never silent) | Original state = `USING`, proposed state = `WITH CHECK`; separate ownership/policy-change actions remain application-mediated (L01/L02 pattern) | `ON CONFLICT DO UPDATE` and `MERGE` paths until separately exercised; PG18 `RETURNING old/new` until the old-image disclosure case passes |
| Attribute withhold | Column privileges `GRANT SELECT (col...)`; whole-table `SELECT` must be absent (docs: a user may select a column "if they hold that privilege for either the specific column or its whole table"; a table-level grant is unaffected by column revoke) | Withheld fields are never granted at column level; inventory asserts no table-level SELECT for ordinary roles | Any profile where an ordinary role holds table-level SELECT on a table with withheld columns |
| Attribute mask / generalize / hash | No native column mask. Accepted mechanism 0.2.0: owner-held `security_barrier` view (or `SECURITY DEFINER` function with fixed `search_path`) projecting the transform expression; base table SELECT not granted to ordinary roles (B07/B08 pattern) | Transform expression generated from the catalog; receipt pins view definition, owner, options and dependency closure (CONTRACT-063 original-value source correspondence) | PostgreSQL Anonymizer (`SECURITY LABEL ... 'MASKED WITH FUNCTION ...'`): preserved as native archive only. Its [support page](https://postgresql-anonymizer.readthedocs.io/en/latest/support/) lists the 3.x line for PostgreSQL 14 to 18, so availability is not the reason; the reasons are the superuser install/preload and that its dynamic masking role model is not independently qualified. Virtual generated columns (new PG18 default) as mask carriers: PG 18 docs state they keep privileges separate from base columns but are "only fully secure" if the expression uses leakproof functions, not system-enforced, and are limited to built-in functions; refused until tested (Q4) |
| Query use on masked fields | Barrier view excludes original column; separate view grants `original-authorized` use to the separately permitted role; predicate on masked expression only where `disclosureProfile` admits | B08 is `not-run`; P03 authors a fresh native weakened-barrier control. The Z3 SAT control in `prove-mask-query.py` is the formal counterpart only | `LEAKPROOF`-marked user functions over masked columns; planner statistics/EXPLAIN exposure (B10 family) |
| Tokenization | None native. Stored tokens are ordinary columns; detokenize is a consumer routine outside UMF | Receipt records `storageEffect`, vault owner, propagation declarations; obligations `unverified` | Any positive enforcement claim without a qualified consumer detokenize profile |
| Mask write-back | `WITH CHECK` cannot compare the proposed value to "the value the writer saw". Semantic rule (P-C) lives in `evaluateSecurityWrite`/the write routine: no `original` read disposition (or declared blind write) means no field mutation | Column `UPDATE` grants absent for roles whose read disposition is `transformed`/`withheld` is a defense-in-depth negative control for direct SQL only | Profiles where a masked reader also holds `UPDATE` on the masked column |
| Privileged bypass (SEC-07) | Superuser, `BYPASSRLS`, table owner without FORCE; `pg_read_all_data` grants table SELECT (it does not bypass RLS but defeats column-privilege withhold and no-table-SELECT barrier views); `row_security=off` only errors for non-bypass roles (a refusal witness, not a bypass) | Negative controls: excluded admin actually sees everything (B14); ordinary roles cannot reach them (B05); NativeInventory asserts ordinary roles are not members of `pg_read_all_data` and lists excluded holders | — |
| History (SEC-10) | Logical/physical dumps (`pg_dump --no-policies` exists in 18), replication of generated columns, PITR | Declared propagation only; dumps are consumer-owned | Any claim that masks apply to dumps/replicas |

PostgreSQL 18 specifics to carry into tests: `RETURNING old/new` (old image visibility under column privileges and SELECT policies), virtual generated columns reading masked base columns, `AFTER` triggers now run as the role active at queue time (affects any trigger-based audit/propagation), OAuth `pg_hba` method (subject binding source, not UMF scope), default data checksums (no security semantics). None of these appears in the 18 release notes as an RLS or column-privilege semantic change; the RLS note is only `pg_dump --no-policies`.

Fixture: disposable PostgreSQL 18.x container (exact minor pinned at execution), ordinary SCRAM logins over TCP, excluded installer/assessor identities, the existing Clients/Projects/Staff/Assignment/Ownership/Resource corpus plus a `Resource.salary`-style masked field, a tokenized `Resource.contactToken` field with a stand-in vault table owned by an excluded role, and a hashed join key.

## Binding design: Unity Catalog Delta relational (`unity-delta-raw/0.1.0`)

Sources inspected 2026-10-13: [Row filters and column masks](https://docs.databricks.com/aws/en/tables/row-and-column-filters), [Filters and masks overview](https://docs.databricks.com/aws/en/data-governance/unity-catalog/filters-and-masks/), [ABAC overview](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/), [ABAC requirements and limitations](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/requirements), [ABAC time travel](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/time-travel), [Dynamic views](https://docs.databricks.com/aws/en/views/dynamic). The AWS, Azure and GCP copies of the filter/mask page differ (the Azure/GCP copies omit the time-travel and clone restrictions); this plan uses the AWS wording and requires the executing workspace's cloud copy to be re-read at execution time.

| Logical obligation | Native construct | Mapping | Refused / unqualified |
| --- | --- | --- | --- |
| Row read eligibility | Table-level row filter: SQL UDF bound by `ALTER TABLE ... SET ROW FILTER f ON (cols)`; "evaluates each row at query time"; only one distinct filter may resolve per user/table | UDF body generated from the normalized rule tree with subject binding via `current_user()`/`session_user()`/`is_account_group_member()` (dynamic-view docs recommend `is_account_group_member()` for account-level groups; `is_member()` is Hive-compat and refused) | Views (docs: "You cannot apply row-level security or column masks to a view"); managed Iceberg; Iceberg REST/Unity REST/Delta Lake API access; path-based access; DBR < 12.2; dedicated compute below 16.3 for writes |
| Row write authority (SEC-09) | None equivalent to `WITH CHECK`. Filters constrain which existing rows UPDATE/DELETE/MERGE can see; INSERT of an invisible row is not prevented by a read filter (docs describe only MERGE restrictions and write support by DBR version; no write-side predicate is documented) | Proposed-state check is **unsupported** at the native layer; write actions must route through a consumer-owned protected write path or be refused. Report exactly as `unsupported` in the receipt, never as "enforced by filter" | All L01/L02 positive claims at the native SQL surface; MERGE on policies with nesting/aggregation/window/limit/non-deterministic functions; DELETE/UPDATE/MERGE on partition-column policies below DBR 17.2 |
| Attribute withhold | No column-level GRANT. Options: (a) column mask UDF returning a constant/`NULL`; (b) protected view omitting the column with no base-table SELECT | (b) is the only faithful `withheld` carrier: (a) returns a typed value indistinguishable from canonical NULL to any direct SQL client, and a side-channel transport does not change what the native surface discloses | (a) is refused for `unity-delta-raw`; any profile mapping `withheld` to a NULL-returning mask |
| Attribute mask / generalize / hash | Column mask UDF bound by `ALTER TABLE ... ALTER COLUMN c SET MASK m [USING COLUMNS (...)]`; one mask per column; return type must match/cast to column type; masks may take other columns as inputs | Transform catalog compiles to UDF body when `outputDomain` castable to the column type; otherwise refuse (no typed output-domain change at the native layer) | Masks on columns referenced by generated columns; filter/mask UDFs referencing other filtered/masked tables; circular dependencies; Python UDF masks (performance guidance only; not a correctness refusal) |
| Query use on masked fields | Native: predicates/joins/aggregates in user queries run over the masked value (expected; **to be verified empirically**, see Q6); no native `original-authorized` channel except a second table/view with a different mask resolution | `original-authorized` maps to a separately granted object (view) with no mask; `prohibited` cannot be natively expressed for a column the user can select at all → refuse the profile or withhold the column | Any claim that UC enforces `prohibited` on a visible masked column |
| ABAC policies (`CREATE POLICY ... ROW FILTER / COLUMN MASK ... MATCH COLUMNS HAS TAG`) | Tag-driven, defined above table owners ("table owners can't override or remove them"); quotas (50 per table, 100 per schema/catalog, 20 principals per policy, 3 column conditions); only one distinct resolution per user/table/column else access is blocked | Preserved as native archive; interpretation optional in 0.1.0; `EXCEPT` principals must be enumerated as privileged exclusions in NativeInventory ("Exempted principals see unfiltered, unmasked data") | Release status not stated on the inspected pages for row-filter/column-mask policies (metastore-level and DENY are Beta; Azure copy says Public Preview) → status recorded as *unverified* until confirmed at execution |
| History / time travel (SEC-10) | "Time travel isn't supported with table-level row filters or column masks"; ABAC time travel is Beta (DBR 19+, managed Delta with catalog commits, column mapping on both versions, not on dedicated compute; fails closed when the policy column is missing) | L07/L08: historical reads under table-level filters/masks are `unsupported`; ABAC time-travel profile is a separate candidate requiring its own receipt | Any historical-read positive claim under table-level mechanisms |
| Derived copies / exports (SEC-10) | Deep/shallow clones unsupported on filtered/masked tables; OpenSharing providers cannot share them (recipients can apply their own); materialized views/streaming tables are expected to carry the refresh identity's filtered/masked data (**not found on the inspected pages; verify at execution**); AI Search indexes cannot be created from tables with row filters or column masks (a refusal, not a bypass) | L10: declare clone/share/MV/index behavior per receipt; MV/ST refresh identity must be in `EXCEPT` or the copy is declared permanently transformed | — |
| Privileged bypass (SEC-07) | Owners/`MANAGE` can drop filters; `EXCEPT` principals; metastore admins; filter/mask UDF owner | Negative controls as in B14/B05 | — |
| Tokenization | None native; same as PostgreSQL. Delta Sharing/clone/time travel propagate stored tokens | Declared obligations only | — |

Direct/alternate access controls (B04): SQL warehouse, standard cluster, dedicated cluster (DBR ≥ 16.3 writes), path access, Delta Lake API, Iceberg REST, Unity REST, Delta Sharing. Each must be exercised or explicitly listed as unavailable-not-passed.

Subject binding: UMF `subject` identity maps to a UC principal via a trusted Staff↔principal table or account group; `current_user()`/`session_user()` return email-style identifiers whose stability must be qualified (Q7).

## Truss / Ashlar forward-compatibility constraints

- Policy and protection documents stay storage-agnostic (SEC-02). The same `umf.security` 0.2.0 + `umf.security.protection` 0.1.0 revisions must be bindable by `postgresql-raw`, `truss-postgresql`, `unity-delta-raw` and `ashlar-delta` profiles without edits; CI asserts a shared fixture digest (see B-SFP-016), since `cases.json` carries no policy input member.
- Transform identity is logical (`{vocabulary,transform,version}` + qualified field); native carrier identity (view name, UDF name, OID, UC function path) lives only in receipts. Truss/Ashlar may carry one logical field in a shared property bag; the protection catalog therefore never assumes one-column-per-field (CONTRACT-063: "One physical bag may hold many logical fields").
- No graph terminology in raw profiles; no relational terminology forced into graph profiles. Association endpoints bind through the existing security association binding proposal ([security-association-binding.proposal.md](../02-design/contracts/security-association-binding.proposal.md)), not through table/column names.
- Query-use admission is derived from the catalog and the Weft query profile (`weft.security.query-profile/0.1.0`); UMF introduces no competing designation (CONTRACT-062 §Query-action profile boundary).
- Tokenization custody declarations are backend-neutral (vault/key refs are opaque strings with owner), so Ashlar publication snapshots and Truss history homes can declare propagation using the same members.
- The reference transform evaluator and SQL-text generators are separate modules; Truss/Ashlar compilers consume the normalized transform tree (extension of `weft.security.logical-ir`), not PG/UC SQL text.
- Ashlar-specific: **Assumption, pending the Ashlar profile:** Ashlar is Delta on Unity Catalog and may enforce through UC table-level filters/masks, in which case it inherits the `unity-delta-raw` limits (no time travel with table-level filters/masks, no clones, no Delta/Iceberg/path access, read-side-only enforcement). `ashlar.md` also describes publication-pinned bags, serving copies and separate current-authority vs historical snapshots, so its enforcement surface may instead be its own publication/serving layer, in which case these limits do not automatically transfer. Ashlar retained snapshots and publication copies are SEC-10 propagation targets; the UC refusals in M4 are therefore written as reusable refusal records keyed by logical obligation, not by raw table, so the Ashlar binding can cite them. Node/edge targets map to logical entity/relationship targets with no new policy members.
- Negative constraint: raw-profile evidence closes raw cases only; the plan adds no `truss.*`/`ashlar.*` cases and promotes none.

## Implementation Slices

Boundary gate first: the existing browser-build and strict typecheck gates (`tsconfig.json`, Chromium replays under `tools/security/browser.ts`) are the boundary command set; new modules under `src/extensions/security/protection/` must not import from `tools/`, `tests/` or Bun/Node globals (negative import control added in B-SFP-001).

| Slice | Story / Area | Governing Artifacts | Depends On | Validation Gate | Notes |
| --- | --- | --- | --- | --- | --- |
| B-SFP-001 | Boundary + catalog scaffold | ADR-002, CONTRACT-001, SEC-01 | None | `bun test tests/security/protection/`, strict typecheck, browser build without host globals; import-boundary negative test | `spec/extensions/security-protection/{package,schema}.json`, `read/write/inspect/require` APIs, unknown-content round trip |
| B-SFP-002 | `umf.security` 0.2.0 disposition reference + migration/rollback | CONTRACT-062, SEC-01/05 | B-SFP-001 | Existing S01–S12 still pass; new S13 (reference resolution), S14 (unknown transform blocks interpretation, preserves source), S15 (rollback refuses non-constant) in Bun+Chromium | Additive schema change; `constant/0.1.0` unchanged |
| B-SFP-003 | Transform validation: domains, disclosureProfile→queryUse admissibility, bounds | CONTRACT-062 §Disclosure, SEC-05 | B-SFP-002 | S16 (join needs equality), S17 (random tokenize prohibits join/group), S18 (parameter bounds refuse), Z3 conditional proof `prove-protection-query-use.py` with SAT weakened control | Mirrors existing `prove-mask-query.py` style |
| B-SFP-004 | Pure reference evaluators (constant, partial, fixed-length, generalize buckets, date truncate) + disclosure transport 0.2.0 | CONTRACT-062, SEC-05 | B-SFP-003 | S19 exact outputs vs independent Python oracle; S20 null/absent/withheld/transformed distinct on transport; Chromium parity | No hashing/tokenize execution in UMF beyond declared SHA-256 via WebCrypto for the unsalted-hash oracle only |
| B-SFP-005 | Tokenization/encryption obligation model | SEC-10, CONTRACT-063 obligations | B-SFP-003 | S21 custody shape/owner required; S22 `reverseAction` distinct from read/original actions; S23 propagation declarations required for history/snapshots/exports/feeds/caches; receipt renders `unverified` | No vault calls |
| B-SFP-006 | Write admission extension: mask write-back and tokenized-field mutation | SEC-09, CONTRACT-062 writes | B-SFP-004/005 | S24 `evaluateSecurityWrite` refuses field mutation when the subject lacks an `original` read disposition on the field and no blind-write permission is declared (including values that happen to equal the mask output); S25 tokenized field mutation requires vault-write action; Chromium parity | Semantic only |
| B-SFP-007 | PostgreSQL 18 fixture + native oracle port | pg-raw prerequisites, CONTRACT-063 gate protocol | B-SFP-004 | Replay all 14 accepted pg-raw cases (B01–B07, B11, B13–B16, L01, L02, including B04/B05/B06 bypass controls and the B16 performance budget) on PG 18.x container with new receipts; failures recorded, nothing inherited from 17.9; any case not replayed is listed as not qualified on 18 | Pins image digest, server_version, client build |
| B-SFP-008 | PG18 attribute withhold/mask/generalize/hash binding | SEC-05/07/08, pg-raw.B07/B08 | B-SFP-007 | New cases pg-raw.P01 (column-privilege withhold = 42501, no table SELECT), P02 (barrier-view masks match oracle per actor), P03 (generalize/hash disclosureProfile vs native predicate/join behavior incl. weakened-barrier counterexample), P04 (mask write-back refused by `evaluateSecurityWrite`/routine; absent UPDATE privilege as direct-SQL negative control; RETURNING old/new control), P05 (virtual generated column over masked base refused/qualified) | Extends, does not replace, B08 |
| B-SFP-009 | PG18 privileged-bypass, direct-access and Anonymizer archive controls | SEC-07/11, pg-raw.B04/B05/B14/B10 | B-SFP-008 | P06 (superuser/BYPASSRLS/owner/`row_security=off`/`pg_read_all_data` bypass visible only to excluded roles), P07 (SECURITY LABEL anon rules preserved as archive; interpretation refused; receipt obligation `unverified`), B10 remains counterexample-found | Anonymizer 3.x supports PG 14–18 per its support page; P07 either installs it (superuser, preload) or uses authored labels without the extension, stated as a design choice |
| B-SFP-010 | PG18 tokenization stand-in | SEC-10, pg-raw.L10 | B-SFP-005/008 | P08 (stored tokens + excluded-owner vault; detokenize routine not reachable by ordinary roles; deterministic token join matches oracle; dump/replica propagation declared) | Obligation evidence, not vault qualification |
| B-SFP-011 | Unity Catalog preflight: two distinct ordinary identities, isolated catalog/schema, compute tuple | delta-raw prerequisites, `databricks-actors.json` | None (external) | `databricks-actors.py` reports `identities-available`; receipt pins workspace, DBR/warehouse versions, cloud doc copy hash | **Hard external blocker today** (zero non-installer actors) |
| B-SFP-012 | UC row filter + withhold-by-view + mask UDF generation (browser-compatible SQL text) | SEC-02/05 | B-SFP-004 | Generated DDL/UDF text checked in Chromium against oracle fixtures; no native execution | Needs no UC identities |
| B-SFP-012a | UC native execution of generated filters/views/masks | SEC-02/05, delta-raw.B01/B03/B07 | B-SFP-012, B-SFP-011 | delta-raw.B01, B03, B07, B13 executed natively; new P01 (view-based withhold vs NULL-mask control), P02 (mask UDF outputs match oracle per actor), P03 (predicate/join on masked column observed and compared to disclosureProfile) | Q7 (UDF execution authority) must already be answered at M3 |
| B-SFP-013 | UC refusals: writes, time travel, clones, sharing, path/API access, MERGE limits, ABAC EXCEPT | SEC-07/08/09/10, delta-raw.B04/B09/L01/L07/L08/L10 | B-SFP-012a | P04 (INSERT of invisible row succeeds natively → profile reports writes `unsupported`; consumer write path or refusal), P05 (time travel/clone/share refused or declared), P06 (path/Delta API/Iceberg REST/dedicated compute access matrix), P07 (ABAC policy archive preserved; EXCEPT principals inventoried), B14 (owner/MANAGE bypass) | Each refusal is a safety witness, not a positive case |
| B-SFP-014 | UC tokenization stand-in + propagation declarations | SEC-10 | B-SFP-005/012a | P08 analogous to PG P08 using a vault table in an excluded schema; time-travel/clone propagation of tokens observed | — |
| B-SFP-017 | **In scope (Q10 accepted 2026-10-14; unqualified until evidence):** consumer-owned protected write path for UC (service applies `evaluateSecurityWrite` to original and proposed state before `MERGE`; ordinary identities have no direct write grant) | SEC-09/12, delta-raw.L01/L02 | B-SFP-006, B-SFP-012a | delta-raw.L01/L02 pass through the write path at an ordinary identity; direct-write bypass attempts refused; path itself carries its own receipt | Without this slice UC write obligations stay `unsupported` and UC cannot be `qualified` |
| B-SFP-015 | Receipts, qualification wording, cases.json/STP amendments, evidence README | SEC-12, CONTRACT-063 | all above | `bun docs/helix/02-design/spikes/security/acceptance.ts` with the amended plan; `tools/security/validate-evidence.py`; Astra/independent review of receipts | P-cases were added on 2026-10-14 (gate is 145 cases); this slice binds their runners and re-executes the gate, whose committed receipt predates the amended plan |
| B-SFP-016 | Forward-compat assertion | SEC-02/06 | B-SFP-002 | Define one shared fixture policy/protection artifact with a recorded digest; assert each backend's oracle fixture references that digest (independent of `cases.json`); raw mappings contain no graph vocabulary (lint over mapping JSON) | No truss/ashlar case executed |

Case identity note: P-cases are only for obligations no existing required case owns. Where an existing ID already owns the obligation (B07 null/absence/transform distinctness, B08 query-use, B04/B05/B14 bypass, L08 historical reads, L10 propagation) that ID is extended through the repo's procedural-expansion mechanism instead of a duplicate; §Owner direction and applied amendments lists the final mapping applied on 2026-10-14 (the slice labels P06 and UC P05/P06 above are expansions, not case IDs). The `P` prefix is only for new cases and is distinct from proposals P-A..P-G (read case IDs with their `pg-raw.`/`delta-raw.` prefix).

Ordering rationale: meaning before carriers (B-SFP-001–006 are backend-free and browser-testable); PG18 before UC because the oracle, driver and container tooling exist and the UC identity blocker is external; UC generation (B-SFP-012) can proceed in parallel with PG18 native work once B-SFP-004 lands, but UC native execution (B-SFP-012a) waits on B-SFP-011.

## Phased milestones

| Milestone | Entry criteria | Exit criteria |
| --- | --- | --- |
| M0 Upstream alignment | This plan reviewed; owner decides on proposals P-A..P-G below, including Q10 (UC write path). **Entered 2026-10-14: owner directed the build-out, P-A..P-G applied, Q10 accepted** | CONTRACT-062 amendment drafted (transform catalog, 0.2.0 disposition, tokenization obligations); FEAT-008 SEC-13..15 accepted or explicitly deferred; STP-056/057 and `cases.json` amended with P-case IDs. **Met 2026-10-14 except the residue listed in §Owner direction (S13–S25 allocation, schema text, gate re-execution, token ceiling)** |
| M1 Portable semantics | M0 exit; failing S13–S25 written | B-SFP-001–006 green in Bun and Chromium; Z3 proofs with SAT controls retained; no host globals in browser bundle |
| M2 PostgreSQL 18 raw qualification | M1 exit; PG 18.x image pinned | B-SFP-007–010; all 14 replayed accepted cases and P01–P08 pass with fresh receipts (or are listed as not qualified on 18); B10 stays counterexample-found unless closed independently; PG18 counterexample corpus retained |
| M3 Unity Catalog preflight | Two independent ordinary identities and an isolated catalog provisioned by the owner | `identities-available` receipt; compute/table tuple pinned; cloud doc copy re-read and hashed; **Q7 observed with an ordinary identity (filter/mask UDF can read a private mapping table without granting it to the querying user), else the UC row-level design is refused before any generation code is used** |
| M4 Unity Catalog raw qualification | M1 and M3 exits | B-SFP-012–014 (and B-SFP-017 if Q10 accepted); delta-raw B01/B03/B07/B13/B14 and P01–P08 executed; writes/time travel/clone/share reported `unsupported`/refused. Profile status is `candidate`/`unsupported` (read-side evidence, no qualification statement) unless B-SFP-017 passes L01/L02; no stand-in substitutes for UC |
| M5 Receipts and claims | M2 and M4 exits (M4 may trail; M5 publishes per backend) | B-SFP-015/016; qualification statements per §Qualification claims wording; evidence README and implementation-plan execution section updated |

If M3 cannot be reached, M4 remains `not-run` and the plan records a Unity Catalog stand-in decision explicitly: local Delta/Spark without Unity Catalog **cannot** exercise row filters or column masks and is therefore not an acceptable qualification stand-in; it may be used only for Delta token-propagation observation (P08 subset) labeled as such.

## Evidence and test strategy

- Independent native oracle: for every case, authored per-actor expected rows, per-cell dispositions and exact transformed values are computed by an independent Python oracle (`tests/security/native/*-oracle.json` pattern) from the catalog definition, never from UMF's evaluator. Native results (PG rows via the host pg adapter, UC rows via the SQL warehouse/REST statement API at the ordinary identity) are compared byte-exact; numeric/binary values never pass through JS Number.
- Three comparison axes per case (SEC-07): native filter (rows), native write effect (committed state and RETURNING), native disclosed value (cells + disposition transport).
- Real backends: PostgreSQL 18.x disposable container with ordinary SCRAM TCP logins; Unity Catalog real workspace with two independent ordinary identities. No synthetic substitute closes a required case.
- Browser compatibility (ADR-002): catalog validation, disposition transport decode, reference evaluators and generated SQL/UDF text replayed in real Chromium with zero external requests and no host globals; versions recorded.
- Privileged bypass and direct access: PG superuser/BYPASSRLS/owner/`row_security=off`/`pg_read_all_data`/dump; UC owner/MANAGE/`EXCEPT`/metastore admin/path/Delta API/Iceberg REST/Unity REST/dedicated compute/Delta Sharing/clone/AI Search. Each is either a passing negative control or an explicit unavailable-not-passed entry.
- Counterexample corpus (retained, mandatory negative controls): mask write-back; join/group on deterministic hash or token leaking equality classes; weakened barrier applying the original threshold (existing B08); NULL-returning UC mask indistinguishable from canonical NULL; UC INSERT of an invisible row; UC time travel/clone exposing pre-mask data or stored tokens; PG `RETURNING old` exposing a pre-update value under column privileges; MV/ST refresh under a filtered identity permanently narrowing data; hidden malformed carrier interference (existing).
- Formal: Z3 conditional checks for query-use admissibility (disclosureProfile ⇒ allowed operator) and tokenization propagation closure, each with SAT weakened controls; proofs state premises and close no native case.
- Gate: CONTRACT-063 fresh execution protocol; `not-run`/`blocked`/timeout never passes; receipts pin engine builds, DBR/warehouse versions, cloud doc copy hash, image digests, source digests and actual ordinary actor.

## Qualification claims wording

Every published claim uses this form; anything else is a drafting error:

> `umf.security.protection` 0.1.0 with `umf.security` 0.2.0 is qualified on **<backend, exact version/build, compute tuple>** for the subset **<transform kinds, scalar domains, operators, actions>** under the authored **<fixture id, revision>** at a **stable authority/data cut**, evidenced by **<case ids, receipt paths, source digests, actor>**. Not qualified: **<explicit list: writes, time travel, clones, sharing, diagnostics closure, concurrent authority, vault enforcement, graph profiles>**.

Tokenization and encryption are always "declared and preserved; enforcement unqualified" until a consumer profile supplies vault/key evidence. Unity Catalog write-side obligations are "unsupported at the native SQL surface" unless a consumer-owned protected write path (B-SFP-017) is itself qualified. Without L01/L02 passing, no `qualified` statement is published for `unity-delta-raw`; only read-side evidence is described, in the same form with the unqualified list.

## Execution Contract

The owner authorizes implementation separately from plan readiness. Execute slices in order through their gates; M3 is an external provisioning step the owner performs. Stop for: Unity Catalog identity/catalog provisioning (the P-A..P-G decision and Q10 were taken on 2026-10-14; B-SFP-002 may proceed against CONTRACT-062 §Field protection catalog) (blocks B-SFP-011+), any finding that an accepted 17.9 case fails on PG18 (record, do not patch the oracle to pass), and any proposed change to the 132-case gate semantics. Token range and usage basis: **unknown**; no prior plan in this repository records a token basis, and the owner has not supplied a ceiling. Record actual usage per slice in the continuation record and set the ceiling at M0; reaching it requires a disposition, not an automatic increase (`workflows/references/work-item-first.md`).

## Continuation Evidence

Record under `evidence/security/field-protection/CONTINUATION.json`: plan revision, completed slice IDs with receipt paths, remaining slices, decisions on P-A..P-G, blockers (UC identities, PG18 Anonymizer availability), next action. On resume, reconcile with `git diff`, `bun test tests/security/`, and `tools/security/validate-evidence.py` before continuing.

## Optional Tracking

None selected. No tracker is configured for this repository (04-build README); use one work item per milestone only if the owner later selects a tracker.

## Validation Plan

- [ ] Failing S13–S25 and P-case runners exist before implementation of each slice.
- [ ] All existing security tests (S01–S12, accepted pg-raw cases) still pass; no accepted case is weakened.
- [ ] Strict typecheck, schema/package audit and browser build pass; Chromium replay for every public operation.
- [ ] CONTRACT-062/063, FEAT-008, STP-056/057, `cases.json`, evidence README and implementation-plan execution section updated for behavior changes.
- [ ] Independent review (Astra or equivalent) of receipts and counterexample corpus before any qualification statement is published.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| Unity Catalog ordinary identities never provisioned | H: M4 impossible | We keep delta-raw cases `not-run`, publish PG18 claims alone, and record the blocker in the receipt README; no stand-in claims | Nothing to roll back |
| UC filter/mask UDF privilege semantics (who reads the Assignment table) differ from assumption | H: row filter leaks or fails | We verify in B-SFP-011 with a private mapping table and an ordinary identity before generating any filter; refuse the profile if the UDF cannot read private facts without granting them to the user | Drop generated filter; table remains ungranted |
| Mask write-back possible on a backend | H: canonical data corrupted | We enforce the semantic rule in the write routine (needs `original` read disposition or declared blind write); absent column UPDATE (PG) / `unsupported` writes (UC) are defense-in-depth obligations; P04 negative control | Revoke UPDATE grants; receipt invalidated |
| Deterministic hash/token leaks equality classes through joins | M: inference | We derive equality leakage from `determinism` and refuse `join/group` accordingly; unsalted hash carries a mandatory warning obligation | Change catalog to `random`/`prohibited`; re-admit |
| PostgreSQL Anonymizer interpretation not qualified | L: P07 narrower | Anonymizer 3.x supports PG 18 per its support page; we still preserve SECURITY LABEL text as archive only and interpretation stays refused | None |
| PG18 `RETURNING old/new` or virtual generated columns expose masked/withheld values | M | We add P04/P05 controls; refuse virtual-generated mask carriers until qualified | Drop view/column; prior barrier view retained |
| Docs for UC differ across cloud copies or change | M: stale refusal list | We hash and date the inspected page per receipt and re-read at execution | Re-run affected P-cases |
| Scope creep into vault/KMS implementation | M | Custody members are declarations; any executable vault code is out of scope by this plan | Delete code; obligations remain `unverified` |
| New cases change the 132-case gate semantics | M | Applied 2026-10-14: P-cases added through the STP/cases.json amendment; the gate is 145 cases, no case retired, the 26 accepted statuses unchanged; the committed gate receipt must be re-executed | Revert amendment |

## Exit Criteria

Plan readiness: scope, ordered slices, shared constraints and verification gates are defined above. Execution is complete only when:

- [ ] `umf.security.protection` 0.1.0 and `umf.security` 0.2.0 validate, preserve unknowns, migrate/roll back and evaluate pure transforms identically in Bun and Chromium (S13–S25).
- [ ] PostgreSQL 18 raw profile: replayed B/L cases and P01–P08 pass with fresh receipts; counterexample corpus retained; qualification statement published in the required wording.
- [ ] Unity Catalog raw profile: either the read-side delta-raw B-cases and P01–P08 pass natively with refusals documented and profile status stated as `candidate`/`unsupported`, or, if B-SFP-017 is accepted and L01/L02 pass, the profile is `qualified` for its stated subset; if the external blocker persists, it is recorded and no UC claim is made.
- [ ] Tokenization obligations are declared, preserved and rendered `unverified` in receipts for both backends; no enforcement claim.
- [ ] Forward-compat assertion (B-SFP-016) passes; no graph vocabulary in raw mappings; no truss/ashlar case promoted.
- [ ] Canonical documents updated and independent review complete.

## Proposed upstream amendments (applied 2026-10-14 by owner direction)

| ID | Target | Proposal | Why upstream | Status |
| --- | --- | --- | --- | --- |
| P-A | FEAT-008 | Add SEC-13: "Masking transforms are named, versioned catalog entries with declared determinism, reversibility, information-disclosure profile and per-operator query use; unknown transforms are preserved and block interpretation." | New requirement, not restatement of SEC-05 | Applied 2026-10-14 (FEAT-008 SEC-13) |
| P-B | FEAT-008 | Add SEC-14: "Tokenization/encryption are field-protection declarations that change stored data; detokenization/decryption are separate privileged actions; joinability, format preservation, key/vault custody and propagation into history, snapshots, exports, feeds and caches are declared obligations; enforcement is unqualified until a consumer profile supplies evidence." | New requirement; SEC-10 covers propagation only generically | Applied 2026-10-14 (FEAT-008 SEC-14) |
| P-C | FEAT-008 | Add SEC-15 (or extend SEC-09): "Mutating a field requires an `original` read disposition on it for the subject or an explicitly declared blind-write permission; bindings must refuse or prove impossible any path that writes a transformed or withheld value back as canonical." | Write-side consequence of masking not stated in SEC-09 | Applied 2026-10-14 as SEC-15 (SEC-09 unchanged) |
| P-D | CONTRACT-062 | Normative text for the protection catalog, the 0.2.0 disposition reference, disclosureProfile→queryUse admissibility rules, reverse actions, and the statement that column-privilege refusal is a statement-level outcome, not a `withheld` cell | Contract owns meaning | Applied 2026-10-14 (§Field protection catalog and 0.2.0 disposition reference; proposed, unimplemented) |
| P-E | CONTRACT-063 | Receipt members for `storageEffect`, custody owner/vault/key refs, propagation declarations, `unverified` tokenization obligations; replace the PG 17 RLS link with the PG 18 page; add UC filter/mask/ABAC limitation citations with inspection dates | Contract owns receipts | Applied 2026-10-14 (§Field protection receipt members; Non-Normative Notes cite PG 18 and the UC pages inspected 2026-10-13) |
| P-F | STP-056/057, `03-test/security/{pg-raw,delta-raw}.md`, `cases.json` | Add new P-cases only for obligations no existing case owns; extend B07/B08/B04/B05/B14/L10 by procedural expansion; add P01–P08 per raw backend with AC coverage (US-056-AC5/6/7, US-057-AC1/4/6); pin PG 18.x and UC compute/DBR prerequisites; note cloud doc-copy divergence | Test plan owns exact cases | Applied 2026-10-14: 13 new cases (7 pg-raw, 6 delta-raw), expansions of B04/B05/B14/B07/B08/L08/L10; S13–S25 allocation to STP-079 still open |
| P-G | SD-008 | Record the decision that PG masking uses owner-held barrier views (not Anonymizer) and that UC writes are read-side-only, with the consumer-owned protected write path as the only positive route | Design decision record | Applied 2026-10-14 (SD-008 §Field protection decisions) |

## Open questions and unknowns

1. **Q1 Package split.** One extension (`umf.security.protection`) for masking and tokenization, or two? This plan assumes one shared catalog with `kind` discriminators; splitting later is a versioned change.
2. **Q2 `withhold` placement.** Kept as a `umf.security` disposition. Should the catalog also allow a `withhold` *transform* for backends that can only express it as a NULL-returning mask? Current answer: no; map to view-omission or refuse.
3. **Q3 PG 18 minor and image.** Which 18.x minor/build and container image does the owner want pinned? Anonymizer 3.x lists PG 14–18 support; the remaining question is whether P07 installs it.
4. **Q4 PG virtual generated columns.** Can a `SELECT` column privilege on a virtual generated column be granted while the base column is denied, and does the planner evaluate the base column under the user's privileges? PG 18 docs say virtual generated columns keep separate privileges but are secure only with leakproof built-in functions (not enforced); the planner/base-column interaction remains unverified; P05 decides.
5. **Q5 PG `RETURNING old`.** Does `RETURNING old.col` honor column-level `SELECT` privileges and SELECT policies on the pre-image exactly as documented for new rows? Unverified; P04 decides.
6. **Q6 UC predicate semantics on masked columns.** Do user predicates/joins/aggregates evaluate over the masked or the original value, and does the plan (EXPLAIN) or error path leak original values? Not stated in the inspected docs; must be observed before any disclosureProfile claim on UC.
7. **Q7 UC UDF execution authority (M3 exit prerequisite).** Under whose privileges do row-filter/mask UDFs read a private mapping table (Assignment)? If the querying user needs SELECT on it, the private-fact requirement (SEC-11) fails; alternatives (owner-executed views) must be tested.
8. **Q8 UC subject identity stability.** `current_user()`/`session_user()` return email-style strings; is that mapping stable under renames/SCIM changes, and should the binding require account-group membership instead?
9. **Q9 UC ABAC release status.** Row-filter/column-mask ABAC policies' GA/Preview status is not stated on the inspected AWS pages (Azure copy says Public Preview). Interpreting ABAC in 0.1.0 depends on this.
10. **Q10 UC writes.** Will the owner accept "writes unsupported at the native SQL surface" for Unity Catalog, or should a consumer-owned protected write path (e.g., a service applying `evaluateSecurityWrite` before `MERGE`) be designed and qualified in this plan? Recommendation: accept B-SFP-017, since without it UC cannot be `qualified` under CONTRACT-063 and UC row-level protection would be read-only in practice. **Accepted 2026-10-14:** B-SFP-017 is in scope and unqualified until evidence.
11. **Q11 Hash salt custody.** Where does salt/key custody for `keyed-deterministic` hashes live, and is unsalted hashing admissible at all for PII-class fields? Plan admits it only with a mandatory warning obligation.
12. **Q12 Detokenize as action vs disposition.** Is detokenization best modeled as a separate action id (this plan) or as an `original` disposition with an extra permission? Affects Weft query-profile designation.
13. **Q13 Gate arithmetic.** Adding P-cases changes the 132-case total; does the owner want a separate protection gate or an enlarged single gate? **Resolved 2026-10-14 as an enlarged single gate of 145 cases (recorded assumption following the owner's direction to add P-cases to `cases.json`); a separate protection gate was not selected.**
14. **Q14 Truss/Ashlar property bags.** When several logical fields share one physical bag, can a per-field mask be expressed natively at all (PG JSONB view projection yes; UC column mask on a STRUCT/MAP column unknown)? Forward-compat constraint only; verification deferred to those profiles.
15. **Q15 Performance.** FEAT-008 asks for overhead at 1k/100k/1M; UDF masks on UC and barrier views on PG need the B16-style runtime; no SLA is invented.


## Execution checkpoint — B-SFP-001 source foundation (2026-10-14)

B-SFP-001 is **in progress**, not complete. Internal
`src/extensions/security/protection/source.ts` provides bounded source read/write
using the existing core JSON/YAML preservation profile. Unknown versions, future
transform shapes and opaque native SQL text round-trip as data. No catalog
package/schema, inspector, typed interpretation, transform evaluator or public
SDK registration is supplied by this checkpoint.

The planned conservative import-boundary negative controls now reject imports
outside library/spec sources, host/package imports and selected host/dynamic-code
names. This is a source guard, not arbitrary JavaScript noninterference. The
initial compiler-API harness failed against installed TypeScript 7; the corrected
guard uses Bun's import scanner. Real Chromium source round-trips and strict
library/tool typechecks pass. [Evidence](evidence/security/protection-source-20261014/receipt.json)
retains both the original harness failure and passing runs.

Remaining B-SFP-001 work includes the catalog wire schema/package and full
read/write/inspect/require surface; S13–S25 allocation/initial refusal runners and
the downstream semantics remain required. The latest retained full gate recorded 26 accepted of 145 required at its
original source pins. This governing-text addition changes the S12 contract
pin; that old full-gate result is not current for the new sources. No case is
added, retired or promoted by this preliminary source checkpoint.


## Execution checkpoint — complete semantic allocation (2026-10-15 UTC)

US-079-AC11..AC16 now own the accepted protection-catalog/reference, query
disclosure, pure output, custody/reversal and write-admission requirements.
STP-079 and cases.json allocate S13..S25 to those exact criteria plus browser
parity. All 13 remain not-run without exercising runners. The required gate is
now 158 cases (original132 + native P13 + semantic13), covering34 criteria.
Existing145 cases and all their required flags/statuses/assertions are preserved.
This supersedes the earlier145-case current tally and unallocated-S13..S25
residue; historical receipts retain their original145-case scope.

The current evidence validator already used US-079; the earlier stale-US-055
residue text described a historical state and is no longer a current defect.
Allocation controls now distinguish unknown US-079-AC17 from newly required
AC11..AC16. This amendment is test/requirements allocation, not implementation
or support evidence. B-SFP-001 and all downstream unimplemented slices remain
open. Fresh gate results and scope are retained with this checkpoint.


## Execution checkpoint — B-SFP-001 catalog envelope (2026-10-15)

B-SFP-001 remains **in progress**. The independently versioned structural
package at `spec/extensions/security-protection/` now describes the catalog
envelope and transform identity subset only. Internal `catalog.ts` inspects
exact vocabulary/version, nonempty catalog/transform identities, the 256-entry
bound and duplicate exact `{id,version}` pairs. It snapshots source through core
JSON controls, retains unknown payload/native content, and never normalizes
Unicode or uses concatenated labels as identity. Its `valid` result qualifies
only that structural subset; `complete` is always false and
`requireProtectionInterpretation` always refuses interpretation. No public root export
or S13–S25 acceptance promotion is made.

Six focused tests,137 existing security tests, strict library/tool typechecking,
13 real Chromium controls and66 package registrations pass. Four isolated source
controls distinguish the original implementation from removal of duplicate
checking, removal of the transform-count bound and accidental admission of an
unimplemented catalog. These are component observations, not formal or native
proof. The initial red run proves only that the module was absent, not a
behavioral regression. Evidence: `evidence/security/protection-catalog-20261015/`.

Before complete interpretation, specify the nested wire representation of typed
parameters and parameterized disclosure properties (`prefix(n)`, `suffix(n)`,
`range(bucket)`), function-specific parameters, hash salt custody and propagation
declarations under CONTRACT-062. Their accepted semantic requirements remain
unchanged; the scaffold deliberately leaves those payloads opaque rather than
inventing executable meaning. Then implement full catalog/domain validation and
bind the original S13–S25 runners, including Bun/Chromium parity and independent
oracles. The shared gate remains26 accepted of158 with132 missing bindings; this
component does not change its governing plan or promote a case.


## Execution checkpoint — B-SFP-001 wire/boundary scaffold (2026-10-15)

The B-SFP-001 **wire/boundary scaffold exit is met**. This completes its package,
schema, preservation, inspection/refusal and boundary work; it does not complete
any S13–S25 acceptance criterion or admit transform interpretation. CONTRACT-062
now specifies named typed parameters, tagged disclosure properties, hash salt
custody and stored custody/propagation wire declarations. The reproducible
`scripts/security-protection-schema.py` generator reuses the original core
literal schema. Exact parameter names, canonical literal bounds and unknown
member paths are checked. A private4,000,000-unit cumulative key/string text
ledger runs after the core JSON snapshot and before schema regex/encoding; it
is not a total snapshot allocation/CPU theorem.

The public UMF entry exports source read/write, package metadata, inspection and
`requireProtectionInterpretation`. `valid` qualifies wire shape/local bounds;
`complete` remains false and interpretation always refuses. No native role,
permission, custody verification or compiler profile is inferred from metadata.
Known functions still need function-specific parameters, immutable core domain
closure and actual selected query dependency validation under later slices.

142 security tests,11 focused tests, strict types,34 Chromium controls from the
actual root browser bundle,66 package registrations and389 schema compilation
checks pass. Five wire mutation variants and four envelope variants require
exact intended named test failures. Independent review passed143 wire and14
public-entry controls on pinned final sources. The initial intermediate schema
compile/setup failures are not behavioral proof. Evidence:
`evidence/security/protection-wire-20261015/`.

Next is B-SFP-002: the additive security0.2 reference carrier and loss-aware
migration/rollback. Full transform interpretation remains B-SFP-003–006 work;
all13 semantic protection cases and native protection cases remain unqualified.
The full shared gate remains required; no narrower release criterion replaces it.


## Execution checkpoint — B-SFP-002 in progress (2026-10-15)

The canonical security0.2 wire package preserves the existing record/relationship
prototype grammar and adds exact catalog pins/references. Immutable source
migration preserves every body member and refuses classification drift or
unrepresentable rollback. Exact source lookup returns retained snapshot indices,
not domain or permission authority. The public legacy-body access embedding
requires the existing0.1 typed closure and preserves the original0.2 revision;
stale host cuts refuse. It does not activate general0.2 or protection functions.

S15 is now bound to an independently authored oracle and reviewed fresh runner.
All149 oracle controls pass identically in Bun1.4.2 and Chromium153.0.8010.12;
the full gate accepts its304 observations. The assertion, coverage and other157
cases are unchanged. The whole gate now accepts27 of158 required cases;131
missing bindings remain. Earlier26 cases still pass, including the original
PostgreSQL17.9 subset, not a new PostgreSQL18 qualification.

156 security unit tests, strict types,22 public-root Bun/Chromium controls,
four mutation variants with exact intended failures,67 package registrations,
390 schema compilations and the actual standard built package smoke pass.
Eleven conditional Z3 queries prove frame/guard properties over immutable maps
and the shared legacy outcome function (sixUNSAT/fiveSAT); executable refinement,
all0.2 semantics and native admission are not proved. Review harness setup and
expectation mistakes are retained separately from passing implementation evidence.

B-SFP-002 remains in progress: S13 still needs qualified core-domain reference
closure and S14 its full reviewed unknown-transform runner. Then finish function,
disclosure/query and physical obligations through the remaining planned slices.
The freshness validator reports203 checks/88 failures, the same failing IDs as
the prior88-failure baseline; this is not a passing release gate. Evidence and
selected-source custody: `evidence/security/policy-v2-20261015/`.


## Execution checkpoint — B-SFP-002 exit met (2026-10-15)

B-SFP-002 is complete within its declared reference/migration/preservation scope:
S01–S12 still pass, and S13–S15 now have reviewed fresh runner bindings accepted
by the original whole158-case gate. New S13 resolves all exact catalog and policy
Field occurrences against immutable core0.8 closures; S14 preserves unknown and
native JSON-compatible content through JSON/YAML and refuses unknown meaning.
The independent oracle passes111 S13 and54 S14 expectations per runtime, with228
and114 matching governed observations in Bun1.4.2/Chromium153.0.8010.12. Only the
two cases' runner bindings changed; their assertions/coverage and other156 rows
are unchanged.

The whole gate accepts29 cases and reports129 missing bindings. All earlier27
cases still pass; the original PostgreSQL17.9 native subset remains the qualified
version, not PostgreSQL18. All162 security tests (2193 assertions), strict types,
391 schema compilations,67 package registrations and the standard built package
smoke pass. Six source mutation variants require exact intended failures.
Eleven conditional Z3 guard/reference checks pass (sixUNSAT/fiveSAT); these assume
core validation and map/snapshot correctness and do not prove executable/native
refinement or source authenticity.

This slice does not complete a protection interpreter, validate parameter values
or domain compatibility, infer record-type provenance, validate an ontology,
qualify a function/query or grant access. Known core definitions may still lack
literal/function semantics. B-SFP-003 must now implement transform-specific
applicability, typed parameter validation and effective disclosure/query-use
admission against actual compiler-derived dependencies. Remaining slices and all
backend cases remain required. Evidence:
`evidence/security/protection-domains-20261015/`.


## Execution checkpoint — B-SFP-003 conditional semantics (2026-10-15)

B-SFP-003 remains in progress. Generic typed parameter/range-bucket declarations
now use the original core literal checker. Conditional query property comparison
retains exact selected source and supplied dependency assumptions; join/group
require equality, order requires order, deterministic declarations report implied
same-scope equality, omitted modes prohibit, and random-token disclosed join/group
refuse even with authored equality. Original-authorized mode remains a separate
action requirement. Compatibility never grants authority or attests actual
compiler dependencies. Deterministic equality permits collisions.

S16/S17/S18 now have reviewed fresh Bun1.4.2/Chromium153.0.8010.12 bindings. The
independent oracle has272 expectations per runtime; whole-gate observations are
276/76/214 respectively, including a fresh S17 actual guard-removal control with
10 exact failures in each runtime. All original assertions, coverage, layers and
timeouts remain unchanged. S13/S14 add the new nested Field-index dependency.
The complete158-case gate accepts32 cases; all earlier29 still pass, and126
required bindings remain missing. This supersedes the preceding29/129 tally.

All171 security tests (2279 assertions), strict types, the actual standard built
ESM/declaration smoke,391 schema compilations and67 package registrations pass.
Five query mutation variants and six domain mutation variants discriminate exact
named failures. Eighteen independently replayed conditional Z3 checks retain
eight UNSAT laws and ten SAT countermodels (including collisions, key-scope
differences and false dependency provenance); no executable/native refinement
theorem is claimed. Freshness validation reports208 checks/88 failures, exactly
the prior failed-ID set. The release gate remains open.

Remaining B-SFP-003 work includes transform-specific function names/arity,
parameter/input/output applicability and actual compiler-derived query
dependencies. B-SFP-004 onward and every backend acceptance case remain required.
The original native accepted subset remains PostgreSQL17.9; separately retained
PG18 bridge identity components do not establish current authorization, guarded
permits or protected selector/seal composition. Evidence:
`evidence/security/protection-query-20261015/`.


## Execution checkpoint — pure reference functions/S19 (2026-10-15)

The reference evaluator now implements every original S19 class: constant,
partial, fixed-length-redact, prefix-only, exact integer/fixed-scale-decimal
range-bucket and explicitly selected Gregorian date truncation. Supplemental
null-out is distinct transformed null. Signatures are closed and typed; every
present input and output is independently checked against its own exact selected
Field domain. Native/keyed/vault and unqualified regex code never execute.
Constant and null propagation cannot bypass invalid input, signatures or output
constraints. Short partial masks intentionally expose whole short inputs, and
zero-count string operations intentionally emit empty strings; no confidentiality
or cryptographic irreversibility follows.

CONTRACT-066 and `adapters/gregorian-date.ts` provide the separately governed
`umf-gregorian-date/1.0.0` recipe. It is explicitly selected by the transform's
calendar parameter, preserves source and does not change ordinary core temporal
validation/defaults/Keys or infer a timezone/native calendar. This completes the
value-profile dependency for the date reference subset; it does not qualify a
native date codec. Exact policy input/output Fields must match the selected
transform domains; equal family labels do not prove applicability.

The original unchanged S19 runner freshly regenerates the independent Python
fixture bytes before actual public-root Bun/Chromium replay. There are459
fixtures (260 positive/199 refusals) plus the146097-date400-year digest. Ten
wire-valid hash/token/encrypt declarations still refuse with the non-pure recipe
cause; four field-substitution controls and thirty independent decimal readiness
controls support applicability. The fresh whole158-case gate accepts33 cases,
including928 S19 observations; all earlier32 still pass. Required unbound cases
remain125. This supersedes the preceding32/126 tally.

All184 related tests (2390 assertions), strict types, the actual built ESM and
declarations,391 schema compilations and67 package registrations pass. Eight
actual source-mutation variants distinguish input/output, selected-domain,
signature, floor, overlap and calendar guards. Nineteen independent conditional
Z3 checks retain16UNSAT laws and3SAT controls; they do not prove complete parser,
TypeScript, compiler or native refinement. Freshness validation reports209checks
and88failures, exactly the prior failed-ID set; the overall release gate remains
failed/open. Evidence: `evidence/security/protection-functions-20261015/`.

B-SFP-003 remains open for complete property-fact/compiler admission; B-SFP-004
remains open for S20 disposition transport. Every other required backend and
protection case remains required. The next semantic step is exact0.2 transport
for canonical null/absence/withheld/transformed null/changed domain/stored-token
identity; current native Subject/action/owner/source authorization and guarded
permit/selector/seal composition remain the next physical boundary.


## Catalog disclosure transport qualification — 2026-10-15

CONTRACT-062's separate0.2 codec now retains canonical null, absence, withholding,
transformed null, changed output domains and original stored token/ciphertext.
Canonical stored columns name the actual storage-transform output Field; a
pre-storage domain never overrides original-value checking. Presentation outputs
have their own exact selected policy/transform domains. All supplied pins and
column metadata validate even with empty/withheld rows. Unknown meaning refuses
atomically while bounded source remains preserved. Encoding/decoding is JSON/YAML
through the portable root API; the legacy0.1 transport is unchanged.

The fresh unchanged158-case gate accepts34 cases, including358 S20 observations;
all earlier33 cases pass. Required missing bindings remain124. The independent
Python corpus has160 fixtures (38 positive/122 refused) and175 observations per
runtime, with Bun1.4.2/Chromium153.0.8010.12 parity. Finite date/container/refinement,
stored original token/ciphertext, exact16,384-cell bounds, shared budgets, source
preservation and serialization-limit controls are included. The first whole-gate
attempt had a B11 Docker exec timeout; its full receipt/log remain retained.
Unchanged B11 then passed in9.886s, followed by this fresh whole-gate replay.
No timeout, assertion, coverage, layer or required case was relaxed.

All189 related tests (2583 assertions), strict types, standard built ESM/types,
391 schemas and67 registrations pass. Ten actual source-mutation variants detect
precise missing guards. Conditional Z3 analysis retains10UNSAT laws and5SAT
countermodels; it assumes executable refinement and proves no native permission,
source authenticity or storage custody. Astra's source-pinned independent review,
oracle adoption, both-runtime checks and exact sources are retained in
`evidence/security/protection-disclosure-20261015/` from the HELIX build root.
Freshness validation reports210 checks/88 failures, the same failed-ID set
as the preceding baseline. The overall gate remains failed/open.

B-SFP-004's declared S19/S20 implementation exits are met; its complete upstream
B-SFP-003 property-fact/compiler dependency remains open. S21-S25 and all remaining
native/backend/lifecycle cases remain required. Transport success never evaluates
row policy conditions, proves actual transform execution or grants read/reverse/
write permission. Existing qualified raw native cases remain PostgreSQL17.9;
separate Truss18.6 component evidence does not promote the raw18 profile.

Owner Git inventory verifies Truss remote mainb77cf1f0 and Weft remote mainc0c6449
(including the reviewed placeholder patch/receipt). Temporary native checkout
`.git` files are missing; preserve primary dirty work and repair/recreate managed
checkout metadata before native edits. Next: full property/compiler admission,
S21-S25 and original anchor/store/program/nonce/fullxid guarded current-authority,
selector and seal composition. No required work is removed and the goal stays active.


## S21-S23 declared obligation verification — 2026-10-15

The fresh unchanged158-case gate accepts all37 bound cases: S01-S23 and the
previous14 raw-native cases. The121 other required bindings remain missing,
so the overall gate remains failed/open. S21/S22/S23 respectively retain150/186/152
matching observations, with71/89/72 independent Python-authored checks in each
Bun/Chromium runtime plus parity, source-custody and browser controls. All
assertions, criteria, layers, deadlines and required IDs remain unchanged.

Exhaustive authored action purposes are checked against the exact ontology pin;
reverse/vault-write purposes remain exclusive while explicit reverse policy
grants remain legal. Hash algorithm/salt, effective unsalted equality and the
mandatory dictionary warning, complete token/encrypt custody, all five propagation
channels, unused transforms, original stored token/cipher transport and atomic
source-preserving refusal are covered. Every obligation remains unverified;
complete:false and authority:false are retained. Actual operation-owner profile
compatibility, source authentication, permission and native custody/propagation
are not qualified by these tests.

All200 related tests (2932 assertions), strict types, build,392 schemas and67
packages pass. Thirteen actual-source controls reproduce exact named assertion
failures when guards are removed. Root conditional logic analysis records8UNSAT
laws/9SAT countermodels; independent design analysis records10UNSAT/6SAT, with
explicit owner-compatibility premises and no program/native refinement theorem.
Astra reviewed the complete original declaration assertions and independent
expectations; two oracle/harness corrections, the conservative source-word guard
failure, wrapper type failure and interrupted gate remain retained. See
`evidence/security/protection-obligations-20261015/` from the HELIX build root.

B-SFP-005's declared-model S21-S23 exits are met. Its full upstream B-SFP-003
compiler/property dependency, S24/S25, all remaining backend/lifecycle cases and
original current-authority/native composition remain required. No vault calls,
crypto execution, native reversal or permission are introduced. The goal remains
active. Existing raw-native qualification remains PostgreSQL17.9.


## Actual legacy write guard correction — 2026-10-15

The admitted0.1 evaluateSecurityWrite now requires a trusted versioned
readProtection component. It checks exact Field-bound blind grants or composed
original read disposition in every selected state, preserves original null and
canonical absence, and refuses omitted legacy bindings. Mutation grants remain
independent. Capture reuses the original scoped resolver and discards partial
results atomically. Original state budgets are strictly checked before a single
operation allowance is partitioned across all possible calls in both update
states; the comparison ledger remains separately bounded.

Actual baseline counterexamples and ten failing-before regression tests were
retained before implementation. All210 related tests (2983 assertions), strict
types and browser build pass. Independent Python fixtures specify42 exact
decisions, replayed identically in Bun1.4.2 and Chromium153.0.8010.12 through the
public API; a fresh root replay retains92 matching observations. Thirteen actual
source controls reproduce exact named assertion failures. Conditional formal
analysis retains19 queries (11UNSAT/8SAT), including a weak per-state-budget
countermodel; this is not implementation/native refinement. Astra independently
reviews source, old-HEAD reproduction, exact expectations and budget algebra.

The fresh original158-case gate still accepts all37 bound cases, with121
required bindings missing. Assertions, criteria, layers, deadlines and command
bindings are unchanged; only relevant source fingerprints were added. S24/S25
remain required and unbound: this necessary admitted-legacy correction does not
substitute for full catalog-aware disposition and exact vault-write admission.
Full0.2 interpretation, actual owner-purpose compatibility, current authority and
all native/backend/lifecycle work remain required; the goal stays active.
See `evidence/security/write-protection-20261015/` from the HELIX build root.

### Shared source/type/condition prerequisites — 2026-10-15

The full catalog-aware program path requires exact source-domain typing and a
shared immutable source closure before rule-by-target compilation. This increment
admits nullable scalar attributes/typed constants while preserving non-null Keys,
and resolves DTO/domain-only constant/output and explicitly allowlisted context
Fields from the exact pinned closure without inventing live Record membership.

Private core-source handles capture complete valid immutable detached documents.
Issued ontology roots share those sources with association checks and cache entity
indexes across target scopes. Public transport remains detached. Compact condition
IR reuses the original scoped encoder, rebases exact association indices and binds
consumption to the original ordered issued table and entity scope. Copies,
residual expressions, missing declarations and hostile descriptors refuse. No
root API, native permit, fact coverage, aggregate resource theorem or full0.2
interpretation is added. Source sharing removes repeated retained source copies;
future program compilation must still charge rule-target expansion before work.

Strict types, browser build and221 security/date tests (3063 assertions) pass.
Independent review and original158-case gate receipts are retained under
`evidence/security/candidate-domain-closure-20261015/`. Conditional Boolean
judgment analysis separates domain membership, context allowance, Key nullability
and compact table/scope correspondence; it is not implementation refinement or
native proof. The full catalog compiler, Record/graph fact runtime, graph-aware
write comparisons, actual vault-write authorization and all backend acceptance
work remain required. S24/S25 remain required and unbound; the goal stays active.

Astra Ultra independently captured39 selected final source pins and replayed128
observations in Bun and actual Chromium with full parity, zero external requests
and no page errors. Seven single-guard mutants and one explicitly paired
core/candidate Key weakening fail at the exact independently expected rows. The
single candidate-Key weakening survives because the original core Key validator
still rejects it; this redundant defense and a corrected mutation selector setup
failure are retained. The eleven conditional queries replay as8UNSAT/3SAT.
No actionable blocker remains within this prerequisite scope. The historical89
observation review excludes the later source-sharing refactor and stays separate.

The first full gate run is retained separately: a late contract custody paragraph
caused observed source drift (including S17's own source-custody refusal). It is
not used as final current evidence. The complete unchanged gate is rerun after
all production source and governing contract edits are frozen.

The final frozen158-case run accepts all37 bound cases with121 missing required
bindings and no unexpected runner failures. All34 acceptance criteria remain
allocated; every original assertion, command, timeout and required status is
unchanged. Freshness remains213 checks with the same88 failing IDs as the prior
increment. Four governed security artifacts validate; the global implementation
plan retains its pre-existing two blockers/twelve warnings. No stale historical
receipt was patched into qualification. See the increment's `receipt.json`.

### Canonical0.2 logical source compiler — 2026-10-15

The private `catalog-program-candidate.ts` now compiles actual canonical0.2
policy/catalog/ontology/core sources, retaining their original version and exact
pins. It constructs one immutable shared source closure, caches target scopes,
and emits compact lexically scoped conditions per actual rule-target pair.
Genuine unpinned policies use null catalog input and retain inline constants;
no legacy rewrite, synthetic catalog or invented rule is used.

All actual unused pure definitions are checked directly by transform index through
the existing recipe checker. Parameters and every recipe share a private work/text
budget and Field index. Unsupported wire-valid regex recipes refuse the entire
program; partial definition results clear. Non-pure declarations retain exact
source-domain/action-purpose obligations as unverified and never execute crypto
or vault code. Actual output refinements remain input-dependent.

Before per-target helpers run, source/expanded AST, target count, repeated
condition text and conservative typed descriptor costs are charged. Original
condition/inline literals consume a second compiler-owned normalization ledger
shared across all target scopes. Independent review reproduced a short-exponent
normalization counterexample before this correction; its source and observed
result are retained. The original explicit bindings remain frozen beside their
typed effects. Selected pure-function APIs keep their existing selected-rule
requirements. Source index/classification caches depend on original issued
immutable identity, retaining conflict checks for independently captured sources.

This is a logical source program, not a runtime decision or authority credential.
All source-program handles are process-local and complete:false/authority:false;
public0.2 interpretation remains closed. Actual Record/graph facts and independent
coverage, current native authority, graph-aware write comparison, exact owner
profiles/read/blind/vault grants and all fullS24/S25 assertions remain required.
See `evidence/security/catalog-program-20261015/` for scoped execution evidence.

The final security/date regression passes229 tests (3110 assertions); strict types
and browser build pass. The unchanged158-case gate accepts all37 bound cases,
allocates all34 criteria and retains121 missing required bindings, with no
unexpected execution failure. Evidence freshness remains213 checks with the same88
failing IDs as the preceding increment. Four governed security artifacts validate;
the global plan's pre-existing two blockers/twelve warnings remain unchanged.

Conditional formal analysis retains9 queries (3UNSAT/6SAT): unbounded declaration
index rebasing under exact-lookup/inverse assumptions, component text-charge
algebra and shared-ledger versus per-target-reset controls. It does not prove
executable compiler refinement, core validation cost, total runtime resources,
source authenticity, fact coverage or native authority. No required test case is
retired, weakened or promoted by this source compiler increment.

Astra Ultra independently replayed699 controls in both Bun and actual Chromium
(111 new compiler,128 source/scope,460 pure-function), with full parity, zero
external requests/page errors and no host-global leakage. Seven actual source
weakenings fail exactly the independently expected rows; the original control
passes. Nineteen repository tests (127 assertions) and the9 conditional queries
also replay. All61 selected source pins stay stable and the full cases.json is
byte-identical to7a940678. The pre-correction numeric witness and final weakened/
corrected comparison are retained. No actionable blocker remains within this
private compiler scope; full runtime/native authority andS24/S25 stay unqualified.


### Canonical action kernel execution increment (2026-10-15)

The private catalog runtime evaluates actual issued programs using original typed
Record Keys, independent graph incidence coverage and effective source
dispositions. Its result remains incomplete and non-authoritative. It does not
render Cells or grant backend permissions. The flat/graph opaque-reference
compatibility correction preserves source metadata and rejects record-type
semantics; its failing preimage is retained. Astra's resource multiplication
witness led to charging every disposition traversal before work.

Execution evidence is retained in `evidence/security/catalog-runtime-20261015/`.
The remaining goal includes pure collection rendering with shared runtime
budgets, catalog-aware original read/blind-write/vault checks, exact owner/native
profiles and all required backend cases. No full S24/S25 admission is claimed.


### Atomic collection rendering increment (2026-10-15)

The private canonical collection renderer consumes the issued catalog program and
uses a single snapshot plus fresh shared action/render ledgers. It filters deny
rows, refuses whole batches on U/conflict/failure, preserves inline constant
independence and original/null/absence/withheld semantics, and executes only
compiler-issued pure recipes over present inputs. Exact owner read roles and
source purposes remain separate from actual policy grants. Output framing,
references and Gregorian profile context are retained and budgeted.

Evidence belongs in `evidence/security/catalog-collection-20261015/`. The remaining
goal includes query-use/compiler lineage, catalog-aware graph before/after write
checks, original-read/blind/vault permissions, native owner/current-authority
profiles and all unbound acceptance cases. No full S24/S25 admission is claimed.


### Catalog-aware multi-target write increment (2026-10-15)

The private catalog transaction guard compares complete original/proposed typed
cuts, lists every changed Record and fixes ownership to original association
sources. Each raw m2m or graph witness Record has independent mutation admission;
owned incidence changes additionally require listed owner anchors. Opaque endpoint
multisets preserve parallel counts without treating per-cut IDs as Record Keys.
Subject/context/profile stability, conservative empty-inventory create/delete
checks and one shared operation ledger span the entire comparison and permission
phase. Every changed Field needs normal mutation permission plus actual original
visibility or an explicit Field-bound blind grant; stored transformed carriers
also need the selected declared vault-write action in every required state.

Evidence belongs in `evidence/security/catalog-write-20261015/`, including the
missing-vault and nullable-value failing preimages. S24/S25 can advance only on
fresh independent full semantic assertions and real browser parity. The result
remains incomplete and non-authoritative. Native guarded consumers, physical
statement/effect closure, current-authority custody, query lineage and all remaining
backend cases keep the overall implementation goal active.


### PostgreSQL 18 native implementation increment (2026-10-15)

Begin M2/B-SFP-007–008 with P01 on image
`postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336`
(PostgreSQL18.6). The column-privilege runner observes real SCRAM identities,
complete statement refusals and permitted null/text rows, plus excluded-installer
privilege weakening/restoration controls. Its retained inventory binds actual
native ACLs and source bytes. This does not replay other B/L/P cases on18, qualify
Truss/Ashlar, install a general compiler or close native current-authority and
lifecycle custody. M2 remains open until its entire required scope is evidenced.


### Additive PostgreSQL 18 replay of existing native cases (2026-10-15)

M2/B-SFP-007 replays the original fourteen accepted raw cases B01–B07, B11,
B13–B16 and L01/L02 using separate sources under
`tests/security/native/pg18-replay/`. Exact PostgreSQL18.6 image/server/client
builds are observed afresh. All original17.9 runners, oracles and individual
receipts remain byte-identical; prior evidence and the mechanical mapping are
retained under `evidence/security/pg18-replay-20261015/`. Only execution/source/
evidence bindings change. Every original assertion, criterion and timeout remains.

The replay retains the original actual driver paths (Bun SQL for B05; inventoried
pg8.16.3 and original Truss runtime for identity/scale/writes), immutable hash
collision strings and expected hash, all1k/100k/1M scale populations/plans and
1ms timeout/recovery vectors, and all original read/write/field/effect/journal
expectations. Engine declarations change only in additive18 oracles. A version
upgrade never changes expected data to match an observed failure. Single-statement
permission/timeout/domain errors require exit3, empty stdout and exact native
primary SQLSTATE; intentional multi-error recovery retains its distinct protocol.
Native image qualification precedes SQL. Ownership-checked container and anonymous
volume cleanup precedes receipt publication; inventory digests include cleanup.

This is fresh engine-version evidence for the declared original fixed vectors.
It does not complete M2 or any full backend profile: additional field-protection
procedures, remaining P/B/L cases, native current-authority/effect custody and
actual Truss/Ashlar/Delta consumers remain required. Never infer18 evidence from
an old17.9 receipt. The full158-case gate remains authoritative for actual execution.


### PostgreSQL18 projection expression prerequisite — 2026-10-15

B-SFP-008 now has a private closed SQL expression compiler for the named mask,
regex, exact bucket/date and SHA256 provider subsets. Independent Python/native
PostgreSQL18.6 evidence passes210 vectors, with hostile search-path/literal and
rounded-division controls; Bun refusal tests pass129 assertions and strict types
pass. Conditional Z3 coefficient analysis retains three UNSAT laws and a SAT
weakened algorithm. Review corrections qualify native operators and preserve
explicit precedence and fail-closed cleanup/source custody. See
`evidence/security/pg18-projection-expressions-20261015/` for exact scope and failures.

This is only a P02 prerequisite: no catalog binding, owner-held view, ordinary
actor or disclosure transport is admitted. Numeric values are compared as exact
rationals, not P02 byte-exact transport. P02 remains required/unbound and the
full gate remains40 accepted/118 unbound; no previous acceptance or backend
support claim changes. Native guard/fullxid and actual protected consumers remain
open, and the overall security goal remains active.


### PostgreSQL18 authored catalog barrier-view projection — 2026-10-15

B-SFP-008 implements the original `pg-raw.P02` / `US-056-AC6` assertion with a
private closed catalog-to-view compiler and an independent Python transport
oracle. Thirteen authored Resource Fields cover pure masks, bounded regex,
exact integer/decimal buckets, Gregorian date truncation and SHA256. Original
core closure/pins and catalog/physical bindings are retained. Native input CHECK
constraints prevent implicit rounding; static whole-domain bounds require every
admitted output to fit its authored domain before SQL is emitted.

Fresh PostgreSQL18.6 evidence uses owner-held security_barrier views with FORCE
RLS, SCRAM ordinary identities, no effective table/column base SELECT, complete
42501 refusals and unchanged canonical storage. Five rounds include Unicode,
nulls, exact large coefficients, date/bucket extremes, distinct Field carriers
and independently different null signatures. The final prebinding run passes93
observations/260 typed Cells; actual acceptance is established separately by the
full governed gate. Assertions, criterion allocation and the60s case budget remain
unchanged. See `evidence/security/pg18-catalog-projection-20261015/` for selected
source/runtime pins, inventories, owned cleanup, review and retained failures.

Seven conditional UNSAT bounds and two SAT weakened-premise witnesses qualify
mathematical floor/length/escaping assumptions, not executable refinement or
native authority. The private JSON disclosure transport retains input/output
Field references, transform identity and separate canonical/disclosed-only
storage enums. Core pins remain in its compiled closure context. It does not
claim general security0.2 Cell lineage or policy-permission compilation; row
eligibility remains the separately qualified fixed raw SESSION_USER membership
profile. Unsupported providers, query-use meanings and native domains refuse.

P03 query-property closure, P04 protected writes, P05 generated carriers, other
P cases, current-authority/guard lifecycle and actual Truss/Ashlar/Delta consumers
remain open. M2 and the overall security goal remain active.

The fresh full158-case gate accepted P02 and all previous40 accepted cases:
41 accepted/117 required unbound across34 criteria. It exits1 solely because
those117 implementations remain absent. Evidence validation has217 checks and
88 failed IDs, exactly the prior failed-ID set; its new `fresh-case-pg-raw.P02`
check passes. These scoped results do not qualify the whole backend or complete
the security goal.
