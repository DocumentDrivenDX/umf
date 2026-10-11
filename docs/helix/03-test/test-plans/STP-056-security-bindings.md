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


### Actual installed role routes: logical, semantic and native controls

For US-056-AC5/AC9/AC10, keep the fixed invoker policy separate from baseline
correspondence. Native tests must demonstrate direct and indirect INHERIT FALSE /
SET TRUE routes while direct effective UPDATE remains false, actual SET ROLE
registry writes, ADMIN-only self-grant escalation, before/after-reset denial and
exact revocation restoration. Identical unsafe comparison packets still refuse;
MEMBER-only without SET/ADMIN/INHERIT can match a fresh scoped baseline. Require
all eleven sections, exact Boolean fields and self-role OID correspondence.
An exact aggregate row budget succeeds; minus-one refuses at the final role read.

Run `tools/security/truss-role-transition-proof.py` from the exact repository root
with Z3 4.15.4. The [current source-qualified run](../../04-build/evidence/security/truss-role-guard-formal/ddff3684-cae4-4029-bd7a-4ac7cb518b5b/proof.json)
requires5 UNSAT violations,3 SAT populations and3 SAT erasures,32 actual-expression
truth vectors,29 original native inventory predicate replays and11 saved formula
byte digests. Independently replay every SMT result and verify source/preimage/
formula hashes. Refuse unsupported source tails, filtered iteration, foreign
columns, changed original pins or early success returns outside the selected tail.
Previous receipts remain historical rather than repinned to changed producers.

Complete native rows, authentic current SET/ADMIN facts and finite immutable fold
inputs are explicit analysis premises. Neither this proof nor successful native
fixture effects qualify the full protected cut, production authentication,
arbitrary mutator closure or complete backend operations. These controls augment
the original132-case plan without replacing or promoting any required case.


### Truss SCRAM authentication and session lifetime — 2026-10-10

[Direct-main integration evidence](../../04-build/evidence/security/truss-scram-authentication/integration.json) records Truss main
`bb5eb75a018e068c281c565ae49e9a50825ee400`. The separately installed combined wheel matches53 source,
owner-asset and typing files, passes328 tests and212 Python boundary imports.
The original PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 Unix-socket SCRAM fixture passes82 observations across31 inventories,
with21 frozen source/preimage pins. Native authentication log entries bind the
ordinary role and SCRAM method to its backend PID. Wrong credentials and missing
roles refuse28P01. NOLOGIN changes inventory qualification and refuses new
sessions28000, but two established authenticated sessions remain usable.
Restoring LOGIN allows a fresh connection. Thus authentication establishes a
connection identity; login permission alone cannot revoke current operation
authority or retire existing sessions. Protected admission must independently
establish current authority at its coherent cut.

Four failure controls cover receipt/stderr secret redaction, an unwritable receipt
sink, continued connection cleanup and cluster cleanup after failures. Astra ultra
feedback was applied and the captured helper bytes execute directly. The final
read-only review verifies current pins and preserves the qualification boundary.
Historical Truss development evidence retains its original source hashes.

This supplies component evidence for US-056-AC5/AC9/AC10. It does not prove
production/TLS authentication, native protected ontology mapping, complete
collection/current cuts, PA01/PA02 completion, seven semantic operation bodies
or complete backend acceptance. Historical acceptance remains26/132; every
original required case remains governed by the existing plan and the goal stays
active. No source-derived formal theorem gains native/temporal premises merely
from this fixture's success.


### Native elevation routes outside the registered namespace — 2026-10-10

[Verified direct-main integration](../../04-build/evidence/security/truss-definer-routes/integration.json) records Truss
`71ba19f8373657cca34085250819220efd5ea79c`. The fixed invoker observer now requires a twelfth census
section enumerating native EXECUTE-accessible SECURITY DEFINER routines across
all schemas. Schema USAGE is retained independently and cannot filter the census.
Any nonempty census refuses even against an identical unsafe baseline; legacy
eleven-section packets refuse. This is a conservative profile-specific rule.
Protected registered definer chains require a distinct admitted profile; UMF
logical semantics do not prohibit all definers.

The PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes97 observations across35 inventories with21 frozen
inputs. An ordinary session with no direct UPDATE right invokes an external
PUBLIC-executable definer owned by a distinct nonlogin role. The actual committed
row UPDATE changes xmin, independently observed, while logical revision remains
unchanged. Original and matching unsafe baselines refuse. Revoking EXECUTE removes
the route; revoking only schema USAGE retains and refuses it. Native prepared-call
revalidation in this fixed fixture returns42501 with unchanged xmin; it does not
demonstrate a surviving write or prove behavior of every retained statement.

Astra identified and verified fixes for the schema-USAGE filter and replayed
packet budgets skipping empty final-section columns. Exact80164-unit budget
passes;80163 and80076 refuse. Native final-section row overflow refuses. The
separately installed wheel matches53 source/owner/typing files and passes334
tests; Python boundary checks pass212 imports. Exact source/preimage, test,
wheel/log/native digests and the read-only Astra review are retained. Owner
historical attempts preserve earlier pins and two rejected prepared-call
predictions instead of being repinned to the final producer.

This advances US-056-AC5/AC9/AC10 and Truss PA01/PA02 component evidence.
It is not complete installed call closure: operator/type/extension routes,
trigger/default/RLS paths, indirect resolution, protected capture, current
authority cuts and seven semantic operation bodies remain unqualified. Earlier
source-derived role proofs retain their historical source scope; no fresh
whole-program, SQL or temporal refinement proof follows. No original required
case is promoted; acceptance remains26/132 and the full goal remains active.


### Operator-backed hidden definer and source-derived guard laws — 2026-10-10

[Native integration](../../04-build/evidence/security/truss-operator-routes/integration.json) records Truss main
`f48975262c74317940329c4f70bd193db81b68fa`. A native operator invokes a SECURITY DEFINER
implementation in a distinct function schema to which the ordinary caller has
no USAGE. The caller also lacks direct UPDATE, but the operator commits a row
UPDATE whose changed xmin is independently observed. The merged census retains
that hidden function and refuses an identical unsafe baseline. Revoking function
EXECUTE then returns42501 with unchanged xmin; scoped correspondence and operator
removal restore the baseline. The proposed EXECUTE-ignoring operator bypass was
not observed. No thirteenth inventory section or new permission semantics is
introduced: this validates an actual route covered by the existing conservative
function census.

The fixed PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes107 observations across38 inventories with21 frozen
inputs. The unchanged separately installed53-source wheel passes336 tests,
including original-native operator packet regressions. The read-only Astra review
verifies the native source/preimage and wheel pins. Library source remains the
reviewed71ba19f8 implementation; no unchanged owner build is attributed as new
implementation.

[Source-derived analysis](../../04-build/evidence/security/truss-definer-census-formal/cfa978ae-c2c9-4fef-b244-4495aab10da9/proof.json) recognizes the complete exact
census SQL subset and extracts the actual final three Python classifier
statements. Three UNSAT violation queries show the selected hidden executable
definer cannot be filtered by schema access, a nonempty census cannot match and
an earlier refusal cannot clear. Three SAT controls populate a safe empty
profile, the hidden operator witness and a namespace-filter-erasure leak. All six
SMT byte digests replay independently. Sixty-four Boolean vectors execute the
extracted actual tail;38 original native inventory tail replays preserve refusal
when the census is nonempty. The role-route fold is retained, without replacing
the full classifier with a handwritten policy implementation.

Complete faithful immutable native rows and effective privilege facts are explicit
analysis premises. This is a recognized-filter and pure-tail proof, not native SQL
semantics, full Python ingress/admission, authenticated producer, dependency
closure, temporal-cut or protected-publication refinement. Operator
support/selectivity/planner, type/extension and trigger/default/RLS paths remain
required. The actual protected capture/writer protocol and seven semantic bodies
remain open. This augments US-056-AC5/AC9/AC10 component evidence without
promoting any original requirement. Full acceptance remains26/132 and the goal
stays active.


### Protected caller capture: post-elevation information loss — 2026-10-10

[Native observability evidence](../../04-build/evidence/security/truss-capture-observability/533c90f6-3dbe-4d7d-ae83-484617149b4a/native.json) passes10
observations on PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5. In one physical connection and transaction, direct and unregistered
wrapper paths enter the same privileged function. Their original effective actors
differ; the nine post-elevation fields are identical: session person, effective
writer owner, role setting, database, backend PID, xid, session-role OID, writer
role OID and entry-routine OID. The wrapper explicitly captures its actor in
PLpgSQL before entering the writer; direct host capture precedes its native call.
This avoids relying on SQL target-expression evaluation order.

[Formal equal-input analysis](../../04-build/evidence/security/truss-capture-observability-formal/4b3dbd6b-1c44-49f6-8480-0e84fd4c6a69/proof.json) retains two
UNSAT separation attempts for arbitrary deterministic decisions over that exact
tuple, including equal extra state. A SAT population shows that adding a distinct
trusted pre-entry actor can distinguish the paths. This does not authenticate an
added caller label or implement capture. The formulas do not prove all PostgreSQL
protocols impossible: unequal history/nonce/state, trusted host original-call
custody, native frame/stack evidence and additional provenance remain outside
the equal-input premise. No HMAC/signature primitive is implemented or proved.

PA02's protected realization therefore must name the independently trusted
pre-elevation provenance or qualified original-call restriction that enforces
the registered chain. Sealing only these post-elevation fields cannot recover
the missing actor; same-entry OID/xid/PID binding alone cannot classify these
paths. One-use custody must remain, but refusing a second invocation is distinct
from establishing the original caller of a first invocation. The accepted trusted
embedding host can supply original call facts under Truss ADR-008 only through
qualified exclusive physical-connection custody and protected carriers. Native
SQL arguments do not themselves authenticate Python object identity. Preserve
the existing invoker elevation guard; neither writer-owner substitution nor
caller-supplied JSON/GUC fields is an implementation shortcut.

Required protocol tests now include this collision witness, independently
authenticated pre-entry capture, a forged added actor, copied public context,
first-use submission through a different wrapper, same/different native attempt,
transaction and connection, and native plus trusted-host one-use custody across
savepoint rollback. Original PA-N01–PA-N12 and all132 required cases remain
required; this supplies US-056-AC5/AC9/AC10 design evidence only. The fixture
uses local trust actors and synthetic routine/role names, no actual Truss registry
or business effects, and no authenticated subject/production capture qualification.
PA02 and full backend acceptance remain open at26/132. Earlier cleanup failure
and preliminary SQL-expression-order run retain their original sources; the
final receipt alone qualifies the explicit capture order.


### Trusted-host protected capture candidate — 2026-10-10

The [native candidate receipt](../../04-build/evidence/security/truss-protected-capture-candidate/90e12409-3a54-466f-8184-2a54c961669d/native.json) retains23 matching observations on
PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15 and pg8000 1.31.5.
Original source bytes, seven source pins and actual installed routine OIDs,
owners, settings and complete definitions accompany the receipt. The earlier
19-observation run and preliminary23 run remain historical; the final run
adds same-transaction absence checks, original frozen AdmissionCustody execution
and guaranteed sanitized failure reporting even if the receipt sink fails.
Two retained subprocess controls exercise secret-bearing exceptions with writable
and unwritable evidence sinks; both suppress secret text and exception chaining.

This implements an isolated physical candidate for the PA02 prerequisite:
an INVOKER query captures native person/actor OIDs, database, backend PID and
xid before elevation. A separately privileged trusted registrar inserts a
private random 32-byte capability bound to those facts, original attempt and
exact synthetic payload. The fixed host dispatch invokes an INVOKER gate and
DEFINER writer; the writer atomically consumes the matching capability before
inserting the synthetic effect. Ordinary callers cannot read capabilities,
write effects directly, create routines in the candidate schema, or inherit
writer/registrar roles. The wrapper gate refuses elevated acting identities.
The capability is never public context or included in retained evidence.

Actual native negatives refuse forged/copied public context, a different
connection (even with the private capability), another login route, attempt/input
substitution, unregistered wrapper invocation and direct private access.
The exact native positive effect is inspected in its original transaction.
For this inspection only, the fixture administrator temporarily grants effect
SELECT, immediately revokes it, and verifies the final prohibition. This is
an administrative test observation, not an adopted ordinary read surface.

Native same-transaction reuse refuses, but savepoint rollback restores the
native capability's unused state. The producer independently demonstrates
successful direct native replay after rollback and verifies its actual effect.
The existing original Truss AdmissionCustody ticket refuses that resubmission
and retains one fixed dispatch. Therefore the composed candidate requires
trusted exclusive host dispatch and private carrier custody; its native table
alone does not provide rollback-resistant one-use authorization. This is not
a qualified SQL-only route or protection from a malicious same-credential host.
A changed transaction also refuses the old capability.

The adjacent acceptance-map.json ties all23 observations to original requirement
IDs without marking a complete schedule passed. The adjacent astra-review.json
retains independent review: all three harness findings were fixed and the final
seven pins, installed definitions and failure controls were independently checked.

This advances US-056-AC5/AC10 physical component evidence and PA-N03/04/05/09
schedule development, without promoting them to complete acceptance cases.
Local trust authentication, synthetic registrar inputs and the fixed actor
profile do not establish production authenticated subject mapping, SET ROLE,
current owner authority, generation/configuration checks, complete callable
closure, resource admission or publication. PA01–PA04 and all seven Truss
semantic bodies remain unfinished; the original132-case goal remains26/132.
Next integration must replace synthetic registrar facts with the original
owner authority/artifact and coherent-cut protocol, qualify installed closure
and protect the carrier throughout the registered adapter. No public API or
ordinary registry grants are added to Truss.


### Native current-authority primitive and lock boundary — 2026-10-10

The [final native receipt](../../04-build/evidence/security/truss-protected-capture-candidate/85d31486-2f88-48e5-b492-ec15b9d730f3/native.json) extends the protected capture candidate to39
matching observations. Seven original source pins/preimages and six actual
installed routine identities, owners, settings and complete bodies are retained.
READ COMMITTED is independently observed and explicitly required by the writer.
RR/Serializable refusal is currently source-reviewed, not natively exercised.
The earlier23/33/38 schedules and their preimages remain historical evidence.

A separate non-login authority responsibility owns a private, fixed single-actor
row with permitted/generation fields. Only the writer can execute its private
check helper. The helper locks the selected row FOR SHARE, then checks complete
row presence, permission and exact captured generation before the writer inserts
its synthetic effect. Ordinary authority SELECT/UPDATE/helper execution and
revoker direct UPDATE refuse. The registered revoker routine updates the row;
it is the selected native mutation route in this fixture, not a complete policy
administration or ontology resolver interface.

Actual revocation after capture refuses without effects. A separately issued
capability matching the revoked generation independently isolates permission
false; regrant advances the generation and the earlier capability remains stale.
A fresh matching generation produces an independently inspected original effect.
An independently submitted revoker times out with native55P03 while the writer
retains the authority row lock; authority remains unchanged. After writer rollback,
the same revoker succeeds and advances the generation. This is one bounded native
row-lock schedule, not proof of complete writer participation, fair termination,
deadlock freedom or final publication. PostgreSQL16's documented FOR SHARE
conflicts and transaction/savepoint release rules govern this candidate:
https://www.postgresql.org/docs/16/explicit-locking.html.

[Formal guard analysis](../../04-build/evidence/security/truss-capture-authority-formal/19fe84d8-27c7-4bc7-b323-52ad9fe0223d/proof.json) saves eight independently replayable formulas:
four UNSAT laws and four SAT positive/weakened controls. Positive generation
integers are unbounded in the model. Exact authority-check and writer routine
bodies are recognized, but SQL execution/FOUND/atomic exception behavior and
complete faithful current authority are premises. The held-lock serialization
law explicitly assumes revoker exclusion; it is not derived PostgreSQL semantics.
The stale mutant requires captured<current; advancement requires next>current.
Originally parsed native bytes are frozen, canonical invocation is required,
and saved formula bytes are rechecked before publication. No SQL/Python/compiler
refinement, ontology resolution or publication-drain theorem is asserted.

The adjacent native acceptance-map.json links all39 observations to original
US-056-AC5/AC9/AC10 and PA-N01/03/04/05/07/08/09/11 component schedules without
claiming those complete schedules passed. The two sanitized failure controls
remain passing; new UUID receipts use exclusive creation, preserving reruns.
Astra review findings about independent permission evidence and proof source
custody/directional controls were applied before final qualification.

This supplies a current-authority physical primitive only. Production subject
mapping, original ontology/policy/artifact admission, coherent complete source
cuts, all authority mutation/callable dependencies, resource/family bindings,
protected carrier lifecycle and final release remain required. Savepoint rollback
releases the native authority lock and restores native capability reuse; the
existing host ticket remains burned. This cannot replace durable pending-buffer
custody or L03 revocation/drain. No Truss public API or supported backend profile
is promoted. PA01–PA04, seven semantic bodies and the original132 required cases
remain open at the historical26/132 checkpoint.


## Raw ontology read-admission candidate — 2026-10-10

The retained Weft `natural-count-self-join` logical plan now drives the captured Truss PostgreSQL predicate lowerer in a private raw-table experiment. Exact original lowerer and graph-source bytes are frozen with the bridge; no fresh Rust compilation or production owner-artifact admission is asserted. Staff, Projects, resources, assignments and ownership form five private relational tables. The rule requires an active Staff assignment to the same Project that owns the resource. This is a synthetic read-admission receipt, not authorization to mutate resources.

Final native evidence is `truss-ontology-capture-candidate/a91be6ca-a0de-417d-bc51-aec34faaeb41/native.json` under `docs/helix/04-build/evidence/security/`: 76 observations, 11 source pins, eight installed routine bodies and three complete five-table fact cuts. PostgreSQL 16.15, corrected pgserver 0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun 1.4.2 qualify this run. Alice can obtain RA/RAB receipts; inactive, unrelated, ownerless and unknown resources refuse. Ordinary private-fact access and predicate execution refuse. The selected membership revoker receives 55P03 while the authority lock is held, then succeeds after rollback. Only Alice/A's active flag changes. Independent current authority `[[6,true]]` precedes denial of all six resources after membership revocation, isolating ontology denial from stale-generation or permission-false denial. Two sanitized failure-boundary controls pass; earlier run receipts remain historical.

Formal evidence is `truss-ontology-capture-formal/e48c8318-302b-4b23-8fd4-f4d25c00a167/proof.json`: seven replayable formulas (three UNSAT laws, four SAT positive/weakened controls), 14 source pins and three complete finite-population replays. Typed unbounded relational semantics establish the natural-witness join law and refusal without active assignment or ownership. Erasing active status, project equality or the mandatory rule admits counterexamples. Faithful facts, native keys, subject binding and serialized current authority remain premises; exact source coupling is not a compiler, SQL or Rust refinement proof. Exact ordered cuts, unique observations and one actor/Staff mapping prevent vacuous replay.

Astra ultra independently verified final pins, formulas and seven rejected mutation controls; review receipts are adjacent. The acceptance map ties all 76 observations to original US-056 criteria and PA schedules as component evidence only. Historical acceptance remains 26/132. Actual typed graph execution (AC2), Ashlar/Delta, authenticated production subjects and owner artifacts, coherent complete current cuts, installed callable closure, four-family protected admission, seven Truss semantic bodies, field publication and final publication/drain remain open. No supported public backend profile or complete PA02/L03 qualification is promoted. Next integration must use the same owner artifact across actual typed graph storage and raw tables, with production owner admission and final release obligations.
