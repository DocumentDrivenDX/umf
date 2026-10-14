---
ddx:
  id: SD-008
  type: solution-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# SD-008: Shared security

## Scope

Feature FEAT-008 implements FR-46 through an independently versioned extension.
Governing authorities: CONTRACT-001/040/041/042, current architecture and concerns.
CONTRACT-062/063 own exact semantics, bindings and evidence admission.

## Requirements Mapping

| Requirements | Design owner | Verification |
| --- | --- | --- |
| SEC-01–03 | Policy package, resolver and typed expression validator | US-079-AC1–3/9 |
| SEC-04 | Complete-fact admission and independent evaluator | US-079-AC4–6 |
| SEC-05 | Disclosure/query-use obligation checker | US-079-AC7–8 |
| SEC-06–08 | Binding admission and native adapters | US-056-AC1–7/9 |
| SEC-09 | Protected mutation profiles | US-057-AC1 |
| SEC-10 | Current-authority coordinator and propagation profiles | US-057-AC2–8 |
| SEC-11 | Private observation/public disclosure separation | US-056-AC8 |
| SEC-12 | Evidence runner and acceptance gate | US-079-AC10, US-056-AC10 |
| SEC-13 | Protection transform catalog (`umf.security.protection` 0.1.0, proposed) and disclosure-profile query-use validator | Planned S13–S20 (STP-079 allocation pending); pg-raw.P02/P03, delta-raw.P02/P03 (`not-run`) |
| SEC-14 | Tokenization/encryption obligation model, `reverseAction`, custody and propagation declarations | Planned S21–S23 (STP-079 allocation pending); pg-raw.P08, delta-raw.P08 and L10 expansions (`not-run`) |
| SEC-15 | Write-admission extension: mask write-back refusal and tokenized-field mutation | Planned S24–S25 (STP-079 allocation pending); pg-raw.P04, delta-raw.P04 (`not-run`) |

## Solution Approaches

| Approach | Benefit | Limitation | Selection |
| --- | --- | --- | --- |
| External decision engine per resource | Reusable request authorization | Collection filtering, transaction authority and direct SQL need additional native enforcement | Optional adapter |
| Fetch then filter | Simple prototype | Hidden data crosses the application boundary; counts/paging/aggregates change | Reject as protected native profile |
| Typed policy IR plus native compilation | Shared meaning, set-based enforcement and inspectable obligations | Requires strict subset qualification per backend | Selected |

IR means intermediate representation. A small pure TypeScript evaluator supplies
executable meaning and a test oracle; it is not a mandatory production service.
Weft owns logical query lowering. Native installers remain backend-owned; UMF
does not acquire database connections or transaction execution.

Existing engine adoption is a spike decision. Cedar provides schema-based policy
validation and request evaluation, but ontology joins/disclosure/collection
enforcement need verified mappings. OPA (Open Policy Agent) provides partial
evaluation for data filtering; only a faithful bounded subset may be used.
Neither language becomes the canonical UMF meaning without conformance.
Sources: https://docs.cedarpolicy.com/policies/validation.html and
https://www.openpolicyagent.org/docs/filtering/partial-evaluation

## Domain Model

Ontology entity/field/association identity is independent of storage. Policy
scopes select types/actions; permits grant, requirements constrain and forbids
exclude. Subject attributes and assignment facts have explicit issuer/cut
provenance. Complete-fact admission precedes evaluation. Physical privileges
remain native representations; they are not inferred logical permissions.

Clients own Projects; Staff assignments link Staff to Projects; resources have
explicit ownership. Every ownership path/quantifier is authored. A Client link
does not grant sibling Project access. Assignment observation can be private.
Flat Employee/Company/junction mappings and node/edge mappings retain the same
logical association identity, endpoints and attributes.

## System Decomposition

1. Policy package: structural schema, source retention and vocabulary registration.
2. Resolver/validator: qualified identities, action scopes, expression types,
   finite dependency closure and unknown-content admission.
3. Independent evaluator: tri-state meaning and composed disclosure obligations.
4. Compiler integration: policy expression/obligation IR passed through qualified
   Weft APIs; no duplicate SQL parser or consumer-owned compiler fork.
5. Binding installers: PostgreSQL roles/RLS/protected surfaces; Unity Catalog
   grants, filters/masks or qualified dynamic views. Each consumer admits inventory.
6. Authority coordinator: admission guard held through final operation release;
   revocation acknowledges after drain. All participant paths must be enumerated.
7. Conformance/evidence: independent expected outcomes, actual-role executions,
   formal proofs and immutable source/version receipts.

Compiler/installer signatures require a separately reviewed owner interface
before production integration. CONTRACT-062 defines document/meaning surfaces;
CONTRACT-063 defines binding admission. This design does not invent a Weft API.

## Formal and Physical Proof Strategy

Use Z3, a satisfiability-modulo-theories solver, to search for counterexamples to
composition safety, mandatory restrictions, indeterminate refusal, write-state
conjunction, revocation ordering and logical/flat/graph decision correspondence.
Initial correspondence uses finite two-Staff/two-Project/three-resource relations.
Physical invariants (bijection, typed endpoints, complete extraction, trusted
subject and current cut) are explicit assumptions, independently tested natively.

Unbounded Boolean implication proofs establish only the encoded composition
theorems. Finite relational proofs establish only their stated universe.
No solver proves a database installation from assumed predicates. Every property
needs a satisfiable deliberately weakened counterexample control, preventing
vacuous UNSAT from an inconsistent model. Retain formulas and solver versions.
Formal analysis bounds/proof interpretation are part of the evidence receipt.

The physical spike uses isolated PostgreSQL 17.9 ordinary roles against raw rows
and synthetic typed graph rows. RLS SELECT/INSERT/UPDATE/DELETE, safe field
projection and private assignment observation are independently checked. It
qualifies neither Truss 0.12 nor Ashlar publication enforcement. Databricks needs
actual managed-table, compute, policy and retained-version qualification.

## Security and Performance

Scope excludes database superusers/installers from ordinary-user guarantees;
tests must demonstrate their bypass and exclusion. Definer routines need fixed
trusted resolution, narrow grants and original-caller handling. Shared bags and
retained raw payloads remain inaccessible where field projection is required.
Authorization generation participation and complete facts are admission gates.
Measure overhead at 1k/100k/1M rows, plans and concurrent revocation drain; no
unsupported latency claim. Public semantic code remains browser-compatible.

## Field protection decisions — 2026-10-14

Owner direction (2026-10-14) applies proposal P-G of the
[field-protection plan](../../04-build/security-field-protection-plan.md).
These are design decisions; none is implemented or natively evidenced yet.

1. **Layering.** Row/attribute meaning stays in `umf.security` (proposed minor
   revision 0.2.0, additive). Named transforms (mask, generalize, hash,
   tokenize, encrypt) live in a separate, independently versioned extension,
   proposed `umf.security.protection` 0.1.0. `withhold` remains a `umf.security`
   disposition, not a catalog transform. No core member is added.
2. **PostgreSQL masking carrier.** PostgreSQL mask/generalize/hash dispositions
   bind to owner-held `security_barrier` views (or fixed-`search_path`
   `SECURITY DEFINER` functions) projecting the catalog transform, with no
   base-table SELECT for ordinary roles; the accepted B07/B08 pattern. The
   PostgreSQL Anonymizer extension (`SECURITY LABEL ... MASKED WITH ...`) is
   preserved as native archive only and is not interpreted as protection,
   because its superuser install/preload and dynamic masking role model are not
   independently qualified. Attribute withhold binds to column privileges with
   no table-level SELECT; a 42501 refusal is a whole-statement outcome, not a
   `withheld` cell. Virtual generated columns over masked bases are refused
   until pg-raw.P05 qualifies them. The PostgreSQL 18 profile is a new binding
   version (`postgresql-raw/0.2.0`); 17.9 evidence is not reused as 18 evidence.
3. **Unity Catalog write side.** Unity Catalog table-level row filters and
   column masks are read-side only; no documented write-side predicate exists.
   Native write obligations (delta-raw.L01/L02) are therefore reported
   `unsupported` at the SQL surface. The only positive route is a consumer-owned
   protected write path (plan slice B-SFP-017: a service applying
   `evaluateSecurityWrite` to original and proposed state before `MERGE`, with
   no direct write grant for ordinary identities) that carries its own receipt.
   Q10 is accepted (2026-10-14): B-SFP-017 is in scope and remains unqualified
   until native evidence exists. Without it, `unity-delta-raw` cannot reach
   `qualified` under CONTRACT-063.
4. **Unity Catalog withhold.** `withheld` maps only to a protected view that
   omits the column with no base-table SELECT. A NULL-returning column mask is
   refused as a `withheld` carrier because a direct SQL client cannot
   distinguish it from canonical NULL.
5. **Tokenization.** UMF declares and preserves custody, reversibility,
   determinism and propagation; it never calls a vault or key service. All
   tokenize/encrypt obligations render `unverified` in receipts until a
   consumer profile supplies evidence.
6. **Forward compatibility.** Policy and protection documents stay
   storage-agnostic; Truss and Ashlar bind the same revisions through their own
   mappings. Raw profiles use no graph vocabulary; raw evidence closes raw cases
   only.

Open design questions Q1–Q9, Q11, Q12, Q14 and Q15 remain as listed in the plan.

## Traceability

TD-079/STP-079 own policy authoring and evaluation. TD-056/STP-056 own independent
backend qualification. TD-057/STP-057 own lifecycle schedules. Backend procedures
under `03-test/security/` enumerate actual storage and transport cases. The
implementation plan preserves existing obligations and adds this owner-directed slice.

## Gaps and Risks

Actual Truss current-store installation and Ashlar policy/publication integration
remain native gates. Databricks guard realization and historical ABAC eligibility
must be selected and tested; absence refuses lifecycle qualification. SQL Server
is a future core-admission witness. Full timing/constraint-error noninterference
is not claimed; public diagnostics require a separately tested coarse projection.
Recursive path language and external-engine equivalence remain outside the
initial interpreted subset. Nonconstant transforms are now designed (above) but
remain outside the implemented `umf.security` 0.1.0 subset until the protection
catalog and 0.2.0 disposition reference have Bun, Chromium and native evidence. Production lowering API ownership
must be reconciled before integration, without weakening standalone meaning.
