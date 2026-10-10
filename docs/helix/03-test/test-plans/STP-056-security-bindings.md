---
ddx:
  id: STP-056
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-056
      kind: informed_by
    - id: TD-056
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# STP-056: security-bindings

## Story Reference

**User Story:** [[US-056]] **Technical Design:** [[TD-056]]
**Solution Design:** [[SD-008]] **Project Test Plan:** TP-001.

## Scope and Objective

All P0 criteria in this story must have exercising evidence. The machine-readable
case inventory is `../security/cases.json`; plans are not passing executions.
Spikes supply qualified feasibility evidence only. No deferred or missing native
case can be represented as a pass.

## Acceptance Criteria Test Mapping

| AC ID | Named tests | Asserted behavior | Citation | Primary layer |
| --- | --- | --- | --- | --- |
| US-056-AC1 | pg-raw.B01, pg-raw.B02, pg-raw.B03, pg-raw.B13 | Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. | `@covers US-056-AC1` required in exercising test | native integration |
| US-056-AC2 | truss.B01, truss.B02, truss.B03, truss.B13 | Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. | `@covers US-056-AC2` required in exercising test | native integration |
| US-056-AC3 | delta-raw.B01, delta-raw.B02, delta-raw.B03, delta-raw.B13 | Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. | `@covers US-056-AC3` required in exercising test | native integration |
| US-056-AC4 | ashlar.B01, ashlar.B02, ashlar.B03, ashlar.B13 | Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. | `@covers US-056-AC4` required in exercising test | native integration |
| US-056-AC5 | pg-raw.B04, pg-raw.B05, pg-raw.B06, pg-raw.B14, truss.B04, truss.B05, truss.B06, truss.B14, delta-raw.B04, delta-raw.B05, delta-raw.B06, delta-raw.B14, ashlar.B04, ashlar.B05, ashlar.B06, ashlar.B14 | Direct tables, child homes, property bags, raw retained bytes, files and alternate query endpoints cannot bypass admitted policy. | `@covers US-056-AC5` required in exercising test | native integration |
| US-056-AC6 | pg-raw.B07, pg-raw.B08, truss.B07, truss.B08, delta-raw.B07, delta-raw.B08, ashlar.B07, ashlar.B08 | Original null, absence, redaction and transform differ; forbidden property never escapes bag/retained carrier. | `@covers US-056-AC6` required in exercising test | native integration |
| US-056-AC7 | pg-raw.B09, pg-raw.B15, truss.B09, truss.B15, delta-raw.B09, delta-raw.B15, ashlar.B09, ashlar.B15 | Unsupported path/mask/history/composition cannot install report-mode weakening; prior protected profile remains. | `@covers US-056-AC7` required in exercising test | native integration |
| US-056-AC8 | pg-raw.B10, truss.B10, delta-raw.B10, ashlar.B10 | Authorization can consult hidden Assignment facts; ordinary direct/list/count/diagnostic paths disclose none. | `@covers US-056-AC8` required in exercising test | native integration |
| US-056-AC9 | pg-raw.B11, truss.B11, delta-raw.B11, ashlar.B11 | Change owner/grant/membership/routine/policy/column mapping after qualification; admission detects and refuses. | `@covers US-056-AC9` required in exercising test | native integration |
| US-056-AC10 | pg-raw.B12, pg-raw.B16, truss.B12, truss.B16, delta-raw.B12, delta-raw.B16, ashlar.B12, ashlar.B16 | Pin exact engine/build/model/policy/mapping/source/actual-role and per-case outcomes; missing or fabricated receipt refuses. | `@covers US-056-AC10` required in exercising test | native integration |

## Executable Proof

Run `bun docs/helix/02-design/spikes/security/acceptance.ts` for the release gate.
It must reject missing commands, nonpassing evidence and incomplete coverage.
Per-backend procedures in `../security/` specify original-role execution and
scenario expansions. Named cases currently without commands are implementation
obligations, explicitly not executable proof. Formal and native spike receipts
are under `../../04-build/evidence/security/` with scope limits.

## Data and Setup

Use Clients/Projects/Staff ownership/assignment fixtures; duplicate labels,
reversed endpoints, null/absence, multiple owners, private bags, historical owner
changes and complete/incomplete fact cuts. Disposable native installations and
independent expected outcomes are mandatory. Do not reuse compiler predicates
as the expected-result oracle.

## Edge Cases and Failure Modes

Unknown security meaning refuses interpretation while preserving source.
Collection uncertainty refuses before output. False permits add no masks;
protected output without disposition refuses. Native inventory/authority drift
invalidates prior evidence. Old snapshots cannot adopt new authority generations.

## Build Handoff

1. Implement declared typed contract and independent oracle tests.
2. Bind exact native profiles and execute positive/bypass controls.
3. Exercise lifecycle barriers and publish source-qualified evidence.
4. Require 100% P0 cases and stable AC citations before story acceptance.

Done requires actual assertions, matching command/source receipts and no skipped
required cases. Compiler/native profile gaps remain open rather than assumed.

## Ordered owner result-declaration controls

SPIKE-010 and the actual private Weft requirement inventory govern this next
component implementation. All controls below are P0. The pure direct-field
checker now has partial component execution evidence recorded below; the full
controls, including runtime/native observations, remain open. They supplement
B07/B08/B09 and US-056-AC6/AC7; they do
not replace or accept any of the original required backend cases.

Use actual source-admitted public compiler contexts and independently authored
expected declarations. Invoke the pure owner declaration checker in
the registration callback; the final public compiler response must still refuse
lowering. A successful declaration check never grants execution or publication.

| Control | Expected observation |
| --- | --- |
| R01 ordered aliases | Two aliases of one source field produce two distinct output positions/names, despite one deduplicated projection dependency. Swapped/missing/extra columns refuse. |
| R02 revision and namespace | Exact document/revision/module/element lineage and model domain pass. Same local field ID in another revision/document/module, or a scalar-family replacement, refuses. |
| R03 protected defaults | A protected projected field with no conservative disclosed outcome refuses; no invented Original outcome. Unprotected default retains Original. |
| R04 complete permit union | Every scoped permit disclosure is retained, including false-condition sources. Omitting a late mask or using another target/action's rule refuses declaration correspondence. Runtime false permits still contribute no mask. |
| R05 exact transform classes | Numerically equivalent exact token spellings coalesce under the admitted domain; different values, output fields, domains or versions remain distinct. Floating-point coercion cannot identify classes. |
| R06 all class sources | A shared transform outcome retains every exact rule/target/field source in its class. Missing, duplicate, unrelated or misqualified sources refuse. |
| R07 distinct transformations | All conservative classes appear in the declaration; conflicting simultaneously true classes still refuse runtime disclosure. The declaration cannot pick one convenient class. |
| R08 withheld precedence | Withheld remains declared alongside potential transforms/original. A native row with active Withheld must disclose no original/transform value even when those outcomes are listed. |
| R09 null and absence | No missing column/property or SQL NULL can fabricate Absent/Withheld. An absent outcome needs independently admitted presence semantics; unsupported presence selections refuse. Typed literal null stays distinct from absence metadata. |
| R10 aggregate requirements | COUNT and SUM remain explicit owner outputs with every scan/action/operator obligation. The initial direct-field checker refuses unresolved aggregate contracts; no silent omission or inherited source-field mask/domain. |
| R11 bounded issuance | Excess outcome/source counts, identifier bytes, work or literal-normalization budgets refuse before checked output issuance; no accepted prefix. |
| R12 ownership and freshness | Caller-constructed declarations cannot replace owner requirements. Changed source/profile/binding and attempted context/inventory substitution refuse before checker dispatch or fail external compilation. |

Retain separate evidence for declaration correspondence and runtime/native cells.
R08/R09 require actual ordinary-role native observations before their B07/B08
criteria pass. Model envelopes and a pure checker cannot prove installed masks,
absence codecs, current authority, private-fact completeness or final release.

### Astra implementation review refinements

The owner checker must retain the output's actual scan occurrence internally:
two self-join outputs can have identical revision-qualified sourceFields yet
different policy evaluation scopes. Transformed value domains reference the
transform's outputField, which may differ from the projected input field.
Normalized numeric coefficients alone cannot identify transforms across domains:
integer 1 and decimal 0.1 at scale one can share a coefficient. R05 must exercise
that collision while preserving exact output-domain identity.

Only transformed wire outcomes currently carry dispositionSources. Original and
Withheld provenance must remain in the complete owner rule inventory; the checker
must not invent undeclared wire members. R09 must retain a null constant as
Transformed(null), never turn normalized-literal None into Absent or Withheld.
R11 must test the actual 256-outcome wire limit: 256 distinct scoped transforms
plus conservative unprotected Original yields 257 and must refuse atomically.
The checker requires exact semantic outcome coverage, rejecting extra classes,
duplicate classes/IDs and omissions. One unsupported expression, including an
unresolved aggregate beside valid direct-field columns, blocks complete checking.

Conservative Original remains required for unprotected defaults even when every
authored permit transforms the field. Protected Original needs an explicit scoped
permit. A declared Withheld never removes potential transform classes: it may be
false for another row. Validate closed contract version/encoding and collection/
text limits before normalization, then charge aggregate literal/provenance/output
work and bytes so individually bounded masks cannot amplify retained memory.

### Partial component execution — 2026-10-10

Actual Rust owner verification passes 63 library and 55 security-admission tests.
The direct-field checker exercises ordered repeated aliases and source/domain
revision mutations; complete false-permit transform provenance; equivalent exact
integer spellings and distinct values; Withheld alongside retained transform
classes; optional Original presence refusal; the 256/257-outcome boundary; and
COUNT refusal both alone and after a valid field. Short exponent tokens are
charged for normalized numeric payload. Isolated wrong literal, unknown element
and Record-domain mutations require LOWERING-UNSUPPORTED while source custody
checks retain their diagnostics. The public compiler still refuses lowering.

These observations partially cover R01/R02/R04–R12; they do not close the table
or any backend case. Self-join scope distinctions, explicit integer/decimal
coefficient collisions, null-transform controls, protected missing outcomes and
full collection/budget mutations still need dedicated correspondence cases.
Runtime presence/cells, active-mask behavior and ordinary-role native release
remain unqualified. Astra's scoped installed-source review retains eleven
reviewed artifact pins and audits all 408 admission pins; it explicitly attributes
the Rust execution to the parent rather than claiming independent execution.
Receipt: `owner-result-checker-astra-review.json`.

### Protected default and null transformation control — 2026-10-10

The source-admitted owner regression now exercises a protected optional salary
with no disclosure and with an explicit constant null disclosure. Neither admits
an invented Original result. The explicit null declaration passes as
Transformed(null); replacing it with Absent or Withheld refuses the exact
LOWERING-UNSUPPORTED diagnostic. Both configurations reach the actual owner
callback and finish with the public backend-required refusal. Actual owner
verification passes 63 library and 56 security-admission tests. This adds
component observations for R03/R09, not runtime/native presence qualification.
Dedicated self-join scope and integer/decimal coefficient-collision controls
still remain, along with complete runtime/physical/backend obligations.

### Runtime batch parser foundation — 2026-10-10

The private owner JSON reader now accepts explicit byte/depth/value-node bounds
for a future cell consumer. Three actual Rust tests verify UTF8 and whitespace
byte accounting, root-depth-one and scalar/container counts, exact limits and
one-over refusal, nested escaped duplicate names and malformed JSON. Ordinary
request parsing preserves its original limits. Verification passes 66 library
and 56 security-admission tests. These are parser component observations only.
Production cell limits (32MiB/depth64/1000000 nodes), rows/domain/hash/constant
checks and atomic selection/release still require an actual consumer and dedicated
end-to-end tests. Raw-entry allocation is bounded by the input byte limit rather
than a constant-memory bound. No original backend case closes.

### Pure cell correspondence component — 2026-10-10

Actual owner-context cell checking now rechecks declaration/source correspondence,
retained exact contract bytes/hash and full structural equality before accepting
a closed batch envelope. Both JSON inputs use 32MiB/depth64/1000000-node limits,
rows cap at4096 and exact ordered column width. Tests reach source-admitted
contexts and exercise valid/empty batches, wrong/missing/extra columns, unknown
outcome and wrong tags, missing/extra value members, null/domain mismatch,
contract byte/hash/object mismatch, nested duplicate contract/batch keys,
equivalent exact numeric tokens, distinct valid constants, refined signed64
overflow, value on Withheld and Transformed(null) versus another valid value.
Owner verification passes 66 library and 57 security-admission tests.

This is a pure unit-returning correspondence method, not authorized policy
selection or a checked/releasable batch. Production boundary tests at32MiB,
depth64,1000000 nodes and4096 rows, complete aggregate work exhaustion, native
codec/source correspondence, ordinary-role mask evaluation/current authority and
atomic final release remain required. The method does not admit Scalar result
domains outside the direct-field owner slice. No backend case closes.

Astra's cell-budget feedback is implemented: runtime literal/normalized-payload
ledger exhaustion returns WFT-LIMIT in result phase, preserving declaration
coverage errors before cell work. The actual two-column batch test admits one
and three rows of independently valid one-million-byte strings, then refuses
four rows (eight cells) on the aggregate sixteen-million-byte ledger while JSON
remains below32MiB. Both smaller whole batches pass; refusal returns no partial
result. Production exact byte/depth/node/row boundaries remain separate tests.

### Original native string-cell inspection link — 2026-10-10

The PostgreSQL17.9 original-use probe now builds an experimental owner inspection
example, freezing selected crate/vendor/spec/fixture/config and installed Rust
bin/lib inputs before Cargo and verifying them afterward before capturing the
produced binary. Cargo registry/dependency artifact cache, platform linker/SDK and environment
remain explicit trusted fixture premises; this is not hermetic build attestation.
Exact selected file inventory and all four Cargo config-presence states are
rechecked after build, before native acquisition and at the final check.

For predicate/order/join populated and empty samples, an ordinary SCRAM-role
query captures binary psql stdout, including trailing LF. Exact bytes/hash and
strict UTF8 decoded text are retained. The bridge receives that exact text and
a fresh admitted compiler request, derives ordered Original direct-field
declarations from the owner outputs, encodes string cells and calls the actual
cell checker. It returns counts/hashes and releasedRows0; compilation still
refuses backend activation. Null and wrong-width mutations require parsed exact
WFT-SECURITY-CELL-INSPECTION/input diagnostics and empty stdout.

This links six original fixture samples to string-cell interpretation. It does
not admit protected projections, numeric/aggregate native codecs, selection
truth, all-key/fact populations, coherent live cuts or guarded release. It does
not close B07/B08/B09 or any original backend case.

### Conditional owner cell selection — 2026-10-10

The owner now conditionally checks supplied per-row scan/action/rule truths
against its complete source-bound inventory and existing composition fold.
Each required scan/action must Permit. Ordered cells then match the selected
Original/Withheld or exact constant transform for that output's actual scan.
Tests run actual admitted single-scan and self-join contexts: raw and masked
positives, Withheld precedence even with competing masks, wrong potential
outcomes, unknown/failed require/no permit/forbid/conflicting masks, missing and
foreign scope entries, and swapping distinct self-join truth scopes while field
identities and cell domains still match. Additional isolated controls cover a
failing admitted secondary original-use action while primary actions Permit, a
valid first row followed by a failing second-row fold, and selection-ledger
exhaustion after valid declaration and 4096 small-cell checks. Owner verification passes66 library
and58 security-admission tests.

These truths remain caller-supplied simulation inputs and can include assignments
that actual source conditions cannot jointly realize. The control is conditional
fold/selection correspondence, not condition evaluation, authenticated facts,
row provenance or permission to release. Empty batches grant no query permission.
Original-action query-wide guards, actual condition/correlation evaluation,
original-value correspondence/current authority/native final release remain
required. The ledger charges ontology bytes before each composition, supplied
rule IDs, initial field references and selected transform literals/normalized
payloads. Other policy/model inspection and active-mask normalization remain
outside that ledger; composition CPU/allocation is not fully bounded. No case closes.


### Conditional evaluated owner facts — 2026-10-10

An actual owner-context path now evaluates every required scan/action/rule from
one explicit simulated cut rather than accepting caller truth assignments.
Rows use a closed versioned scan-to-Fact envelope; exact owner scan/target
inventory, finite bounds, source conditions, declared complete dependencies and
same-identity field/absence coherence are checked. Original cells additionally
match their scan fact's exact normalized field value and declared field coverage.
This connects the source-expression and cell-selection components for R01/R02,
R04/R05/R07/R11/R12 and B07/B08/B09 without qualifying native fact authority.

Actual Rust controls cover single scans and self-joins, Original and conditionally
masked outputs, Project/Staff membership, field-value substitution, inactive or
missing associations, incomplete coverage even for empty rows, stale caller
generation, work exhaustion, missing fields, duplicate population identity,
missing/foreign scans, later-row same-identity inconsistency, distinct-scan fact
swaps and valid repeated bag rows. Owner evidence passes66 library and60
security-admission tests. Conditions now evaluate against the supplied facts;
trust/coverage/generation are still caller assertions. This does not establish
native query predicates/join provenance, complete result enumeration, authenticated
facts, query-wide empty-result original-action admission, current native authority
or guarded release. No original backend acceptance case closes.

Astra feedback adds a separate pre-clone metadata ledger for generated truth-map
rule/action/scan IDs. An actual admitted129-rule fixture passes512 repeated fact
rows, then1024 valid small rows refuse that ledger at WFT-SECURITY-EVALUATION/model
before the downstream selection identifier ledger. Declaration/cell checks pass
both inputs. Additional controls isolate missing projected Original values and
coverage, normalized-equivalent versus conflicting scoped/population Resource
assignments, and identical versus differing subject-population assignments.


### Captured native fact correspondence — 2026-10-10

A separate experimental `security_fact_inspection` owner executable consumes
closed compile-request/native-row/cut/scoped-fact texts and calls the actual
evaluated-fact owner API. It emits only hashes/counts/actual scan identities and
releasedRows0. It has no connection, installation, checked batch or release.
The native producer is tools/security/pg-owner-fact-selection.py; retained evidence
is pg-owner-fact-selection.json. It creates an isolated PostgreSQL17.9 raw fixture,
captures privileged complete declared fact populations and ordinary TCP SCRAM
RLS string rows for Alice/Bob single-scan, Cartesian self-join with distinct
scan values and empty queries.
Every declared natural Key matches the independent native mapping. Staff,
Project and Resource census plus Ownership/Assignment tuples match the authored
fixture; exact native bytes and passed cut/row texts are retained. The owner
evaluates source membership and checks normalized Original values against these
captured facts. Each actual output scan is checked against the retained report.

Controls refuse stale/incomplete cuts, inactive membership and substituted
Original values, with exact code/phase and empty stdout. Empty batches still
require complete dependencies and grant no query permission. This adds native
fixture evidence for partial R01/R02/R04/R11/R12 and B07/B08/B09 correspondence,
not a completed backend case. The privileged fact reader is an excluded assessor;
caller trust/generation/coverage and fixed model/native mappings remain premises.
Facts and rows use separate connections: equal before/after native fact bytes
are fixture evidence, not shared MVCC snapshot or general anti-ABA proof. No
production authenticated issuer/census, compatible authority/revocation protocol,
native compiler refinement, new WASM parity or guarded release is qualified.
Selected build inputs/config presence are frozen before Cargo and rechecked;
Cargo dependency cache, platform linker/SDK and environment remain trusted build
premises, not a hermetic-build proof.

Astra review found and independently reproduced positional-array acceptance in
both inspection envelopes and the new nested fact carriers. Both examples now
require object roots. The new evaluated-fact path requires object Cut/ScopedRows,
Fact/FieldValue/Coverage and qualified reference carriers before typed serde
conversion;11 actual owner-context carrier mutations refuse. Legacy pure
simulate_json remains separately scoped. Native producer controls cover the
same nested grammar plus outer example carrier, rather than assuming serde
`deny_unknown_fields` forbids positional sequences. Source execution now uses
helper/plan/oracle/closure bytes frozen before exec and frozen fixture SQL, with
exact producer location and selected build-input guards. Native salary capture
retains JSON kind and exact token, matches authored typed fixture facts and
refuses a transactionally substituted JSON string source before owner dispatch.
Distinct self-join pairs exercise swapped scan facts against unchanged native
row bytes. These controls improve wire/source/correspondence evidence without
promoting any original backend case.


### Caller planner diagnostics — original B10 remains open

The pg-private-diagnostics producer now tests ordinary SCRAM caller-enabled
planner/parse/rewrite stderr under the deny-first routine candidate. Actual
private relation OIDs and plan estimate vectors remain observable despite catalog
ACL denial. Unrelated private population changes preserve authorized rows but
alter traces. Final94 observations include guarded exact two-world trace equality,
nonvacuous outer logging, individual setting weakening, restored caller settings
and independent wrapper body/owner/ACL/proconfig inventory. Reviewed helper plan/
oracle/closure and SQL execute from captured bytes.

Future B10 qualification must additionally cover prepared/cached guard mutation,
all reachable observation paths and settings/body drift through actual admission.
See [design annex](../../02-design/spikes/security/pg-planner-observation-v0.1.md).
This is native spike evidence; no original acceptance case is promoted.


## Original-layout native graph witness — 2026-10-10

For US-056-AC2/AC5, execute `python3 tools/security/truss-native-membership-probe.py`
from the repository root with disposable fixture access. The exact original
Truss0.16 owner export and shared independently authored raw membership oracle
are mandatory inputs. TD-056 defines the fixed synthetic mapping and excluded
owner boundary; no original case status is promoted by this component.

Required controls compare complete actor rows and native typed identities;
multiple owners must not duplicate Resources. Inactive assignment, sibling
Client, no owner, wrong relationship decoys and outsider remain denied. Direct
bag/retained/edge reads, mutation and owner-role transition must return42501
without rows. A reversed edge must fail23503 specifically at the endpoint FK,
with independently checked existing objects and absent index collision.
Individually erasing active, ownership-rel, assignment-rel and root-type guards
must expose the recorded counterexamples; restoration must recover every actor's
oracle rows and Resource-only direct RLS types. Copied executable, extra arguments
and wrong working directory must refuse before acquisition. Freeze inputs before
effects, retain SQLSTATE/output/diagnostics, verify source stability and clean up
only the UUID-labelled owned fixture.

The retained final run has110 observations/51 transcripts; three separate custody
controls pass. Prior failed and superseded runs remain diagnostic history with
exact attempt source snapshots. Required follow-on backend tests replace fixture
source enums/field IDs/storage IDs with authentic accepted model/property/key
custody and actual Weft lowering, then exercise missing/ambiguous Staff refusal,
full reachable native inventory, diagnostics and current-authority publication.
No fixed overlay can satisfy those remaining acceptance obligations.


### Unique Staff binding controls

The expanded original-layout producer retains217 native observations. In
addition to the prior membership/bypass matrix, missing or duplicate Staff login
bindings must return42501 without output on evaluated projection and count,
for both nonempty and genuinely empty Resource collections. A valid bound
principal with no Resources must instead return successful empty. Restore every
original actor after each changed world. A matching login on a foreign native
type must not count as Staff. Direct helper execution must remain denied.

Use real ordinary native login `true` to distinguish Boolean JSON `true` from
string JSON `"true"`; only the string may bind. Erase cardinality, projection
preflight and JSON string guards separately to record their failure witnesses,
then restore the original behaviors. Retain outer false-filter/LIMIT0 controls
as unevaluated/no-output observations, never admission or refusal evidence.

Four conditional formal laws retain12 exact SMT assertions; independently replay
all expected solver outcomes and confirm actual source hashes. Native and formal
correspondence is reviewed, not mechanically proved. This matrix supplements
US-056-AC2/AC5/AC7 under CONTRACT-062/063 and does not promote any original case.
Complete backend context/source/fact/cut/publication/diagnostics qualification
remains mandatory before acceptance.

The principal-binding count/preflight formulas are explicit guard-definition
sanity checks; they do not independently model publication or prove SQL ordering.
The final cardinality-erasure control retains JSON string typing. Earlier217
and formal source snapshots remain historical rather than repinned.
