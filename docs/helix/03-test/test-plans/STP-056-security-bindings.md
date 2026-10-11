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


## Original-policy graph/raw population parity — 2026-10-10

A separate installer-only spike now executes the same retained Weft `natural-count-self-join` IR through the frozen actual Truss row-predicate and graph-source modules against the exact captured `qualified-property-layout-0.15.owner-export.sql` object/edge tables. Predecessor IR and both lowerer pins must equal the raw candidate's pins before lowering. The current exported layout bytes, including property declaration modules and definition provenance constraints, are retained; synthetic catalog seeds satisfy those constraints without weakening them. These are fixture assertions, not original catalog staging or authenticated owner metadata.

Final evidence `docs/helix/04-build/evidence/security/truss-ontology-graph-parity/9b5634ec-caf8-4624-9c02-00ed637b3a94/native.json` contains 53 passing observations and nine source pins, SHA256 `e957e0d3de95338d5df53743bd9548fe4fd5ca0d17672894b9d49aed501b1f64`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify this run. Five complete native projected relation populations match the independently retained raw initial cut, and five match the raw final membership-revocation cut. Alice admits RA/RAB initially and none after her assignment is deactivated; Bob admits RB/RAB both before and after Alice's revocation. Both six-resource corpora include ownerless and unknown resources. A deliberately reused native object ID across Staff/Project verifies qualified type incidence rather than untyped ID equality.

The authored host preflight checks all five source-validity programs (including outer Resource), six unique natural-key/login groups and both native edge-incidence/logical-endpoint correspondences. Eleven malformed-source controls refuse with42501: absent or wrong-domain active properties, logical/native endpoint mismatches, duplicate Staff keys or logins, retired resource/association metadata, absent ownership/resource fields and wrong active metadata. The two endpoint controls independently observe all11 validity/uniqueness components true, Assignment incidence false and Ownership incidence true before refusal. This isolates incidence from both native and logical duplicate-key constraints. The exact installed read-receipt routine is retained. Ordinary callers have no object/edge SELECT; the fixture's PostgreSQL-owner definer returns only synthetic booleans.

Earlier failures are retained, including missing synthetic definition-provenance fields and a corruption initially blocked by native edge uniqueness. Final controls use existing ProjectD to isolate incidence. No new theorem is asserted: the prior typed relational laws apply conditionally, while native correspondence evidence does not prove automatic SQL/Rust/compiler refinement. Natural key properties remain fixture-attested and explicitly checked; canonical key-bucket codecs/namespaces, current coherent cuts, authenticated production subjects/owner artifacts, original staging, production role/callable closure, protected four-family admission, concurrent authority participation and final publication/drain remain required. The adjacent acceptance map links all53 observations to US-056-AC1/AC2/AC5/AC10 as components only. Complete typed-graph AC2 and full backend acceptance remain open at26/132; no public supported profile is promoted.

Astra ultra independently verified all53 observations, nine current/preimage pins, exact frozen lowering, complete initial/final fact parity, all13 installed preflight components and both isolated incidence controls. The adjacent review receipt records no remaining blocker within this installer-only scope.


## Composed protected graph read-admission candidate — 2026-10-10

The actual graph predicate and explicit full preflight now run behind the private original-call capture primitive. The original INVOKER entry still requires the actor/captured native tuple; the writer checks its registrar-issued capability, exact original transaction/attempt/resource bytes and READ COMMITTED, then calls its private authority helper. That helper obtains the same authority row FOR SHARE, verifies permission and captured generation, executes all13 authored graph-preflight components separately, and evaluates the original compiled owner predicate before inserting a synthetic read-admission receipt. There are no raw shadow fact tables. Exact captured Truss object/edge layout and frozen lowerer bytes are used; synthetic catalog seeding remains installer-authored, not original catalog admission.

Native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/8ea0b9dd-a0c3-4ecc-b8cb-0d5fbf26998a/native.json` passes135 unique observations with14 source pins, SHA256 `108096e8eb0bace54a4ce709cd44e6ef1b995a4aeb52abd7241f3be9576de7db`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify the run. The captured graph predecessor's IR, bridge, both lowerer modules and layout pins must match before composition. Nine installed protected routine bodies, exact generated SQL and frozen fixture/lowerer code are retained. The private authority role owns the edge table and can read required catalog/object facts; actor and revoker cannot directly read/write graph tables or invoke preflight. No public graph support claim follows from those fixture grants.

Eleven deliberately committed installer corruptions now traverse genuine fresh private capabilities and the original native entry. Every malformed source independently yields preflight false,42501, an unconsumed native capability, zero effects inspected in the actual actor transaction, and restored preflight true. Both endpoint corruptions observe the exact13-component vector isolating Assignment incidence. Authority [[5,true]] is independently observed before these controls. These fault injections deliberately sit outside the admitted mutation closure; they do not prove complete participation or coherent source-cut authority.

The selected membership revoker updates the authority generation before changing the actual graph Assignment edge. An independent revoker receives55P03 while the read-admission writer holds the authority row; all five projected fact populations remain unchanged. After actor rollback the revoker succeeds, only Alice/A's active flag changes, independent authority [[6,true]] is observed, and all six resource admissions refuse. Three complete projected fact cuts are retained. Transaction rollback still restores native capability reuse; the original host custody restriction remains necessary and is independently exercised. This is synthetic read admission, not permission for canonical resource writes or a complete publication protocol.

Formal evidence `truss-graph-capture-formal/c2b4aa2a-f28e-4434-bb0a-ce96071da3a3/proof.json` under the same evidence root saves14 formulas: six UNSAT laws and eight SAT positive/weakened controls, with17 source pins and all three complete population replays. Original typed natural-witness laws are supplemented by an explicit authored conjunction of original capability, current authority, full graph preflight and ontology membership. A positive composed SAT control prevents an always-false conjunction from passing; independently erasing each admission guard yields a counterexample. These are conditional model laws, not automatic SQL/gate extraction, compiler refinement, native snapshot/lock semantics or final publication proofs. Source custody and observed native controls are separate evidence.

Two sanitized failure-boundary controls pass. The adjacent acceptance map links all135 observations to original US-056-AC1/AC2/AC5/AC9/AC10 and PA component schedules without promoting complete cases. Authenticated production subjects/owner artifacts, canonical graph key-bucket and namespace authority, original catalog staging, complete authority/callable closure, coherent source cuts, all four protected admission families, seven Truss semantic bodies, field publication and final release/drain remain required. Full graph AC2/PA02/L03 and the original132-case acceptance plan remain open at26/132. No public Truss backend profile is promoted.

Astra ultra verified all135 observations, fourteen native pins, nine installed bodies and eleven corruption groups, then independently replayed the final fourteen formulas with seventeen source/preimage pins. The always-false composition mutant fails the added positive control. Adjacent review receipts record no remaining landing blocker within the declared experimental scope.


## SCRAM-authenticated graph composition and owner-binding audit — 2026-10-10

The composed graph candidate now authenticates fresh ordinary, registrar and revoker sessions with PostgreSQL SCRAM on its owned Unix socket. Four role secrets are generated only in memory and never retained or included in receipt hashes or exception chains. The original bootstrap postgres session remains an explicitly trusted installer; the exact HBA admits local postgres trust, requires SCRAM for other local sessions and rejects both loopback host families. Reload completion, parsed rules, stored SCRAM-verifier presence (booleans only) and unchanged final rule rows are independently observed. This is an authenticated owned fixture, not a production issuer/Staff/owner mapping or general connection-authority profile.

Final native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/f4186d8d-38ff-461d-9f0c-deefd7b8969f/native.json` passes147 observations with14 current/preimage pins (SHA256 `7cbb71735a60b89f622968eb5426ef6457c826f47914f8dfa0b30b8d1dbb5e4b`). Four wrong-secret attempts and an absent role yield28P01; correctly authenticated sessions independently expose the five expected original native identities, including two distinct connections using the same actor credential. NOLOGIN refuses a fresh actor session with28000 while the existing session still has its original identity. Admission revocation remains an independent current-authority obligation; NOLOGIN alone is not an existing-session revocation mechanism. All135 original graph/protected-capture/authority/corruption controls also pass on these freshly authenticated sessions. SQL, lowerer packet, nine installed protected bodies and complete fact cuts are unchanged from the reviewed135 run. Two sanitized failure controls match the updated producer.

Refreshed formal evidence `truss-graph-capture-formal/0e186858-5aca-40cf-b1a6-53b2e792bbb7/proof.json` under the same evidence root replays14 formulas (six UNSAT/eight SAT),17 source pins and three complete populations, SHA256 `f52b59906718137e426c9b959e0652159a31a872f486b3a7e036cae3e47d5aec`. This rebinds the previously qualified conditional model to the authenticated native run; no SCRAM cryptographic, SQL/compiler or publication theorem is added. Historical135 receipts retain their original source bytes and narrower trust-authentication scope.

The next catalog integration cannot silently rewrite the owner source. The actual frozen Truss declaration collector, executed on the retained original owner document, exposes five keys with unspecified primary roles, zero core relationship declarations and two ontology associations with ordered typed endpoints. Resource's complete required signed64 integer salary declaration is preserved alongside key-only read projections. Current native staging source explicitly requires a Boolean primary selection; its guard is source inspection here, not a performed native refusal. These facts require owner-issued storage key-role choices and relationship bindings with original accepted-binding provenance. Key-only graph projection cannot stand in for complete Record/property catalog staging or field publication.

[Owner-binding audit](../../04-build/evidence/security/truss-owner-binding-audit/9d296d60-1dd6-48cd-bb6e-2b63d7d4778e/audit.json) is located under `docs/helix/04-build/` and passes14 observations with five current/preimage pins, SHA256 `46a649c19af2f370518c27667e45de4177b59e0b954ba6f4a12426809d938f01`. A separately parsed frozen oracle checks the complete post-call document, exact ordered keys, complete Field/reference inventories and full ordered ontology endpoints. Composite-key reversal, integer-width deletion, unknown-extension mutation, omitted Record and omitted Field controls all refuse. The initial eight-observation audit had aliased preservation checks and provides no independent preservation qualification; its receipt remains historical. The twelve-observation correction predates the final completeness controls. No fresh owner validation, original catalog preparation/staging or binding authority is claimed by this audit.

Astra ultra independently verified147 native observations/14 pins, replayed14 formulas/17 pins and verified the final14 audit observations/five pins, including all five mutation/omission controls. Adjacent reviews are clean within their declared scopes. The acceptance map treats authentication as a PA-N01 prerequisite, without claiming SET ROLE coverage, and retains original US-056 component links. Complete owner bindings/authenticated artifact/current-cut/installed-callable and mutation closure, all four families/seven semantic bodies, canonical graph keys and final publication/drain remain required. Complete backend acceptance stays26/132; no supported production profile is promoted.

## Original owner document/native catalog staging — 2026-10-10

The unchanged `natural-count-self-join` owner document now passes genuine original UMF preparation and actual Truss provisional catalog staging on PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2. Retained evidence `docs/helix/04-build/evidence/security/truss-owner-catalog-stage/75408a57-00c9-4054-bffc-ab2a918dfb73/native.json` passes31 observations/697 source pins, SHA256 `bec358feb8942d8a5bea0208f368da2bece80dc7c08c87e9a1ae3cdbf7cefa88`. Executed copied source includes the owner bundle, actual Truss preparation/stager/native SQL/layout, and declared Ajv8.20.0 dependency closure. The private bounded stdio adapter drives one installer transaction; this does not qualify the complete installed public runtime or driver.

Independent native projections verify exactly five original Records, all nine owned Fields with full scalar/nullability/cardinality/facets and accepted-document provenance, five original ordered keys as non-primary, and zero relationships/endpoints. Exact archived source retains absent primary markers, the unowned Field and unknown content. Salary retains its required signed64 facet. A native primary substitution and a composite component reversal each refuse the intended message/55000 from an isolated genuinely new-key prestate with an agreeing successful positive; exact state is restored. The head stays unpublished and rollback removes all staged catalog rows. Passing evidence is emitted only after independently attempted cleanup succeeds.

The first retained run failed in the RPC command-result adapter. Historical13/20/21-observation runs do not independently isolate key guard refusal: their existing-key prestate can also refuse55000. The corrected29 run predates complete native type/relationship checks. These remain historical receipts, not the final qualification. Refreshed post-validation collector/literal guard audit `truss-owner-binding-audit/db1509e7-7399-4d62-8322-a1663e40a614/audit.json` passes14 observations/five pins, SHA256 `cb2b47b065313e8295a0d8e4e08428245ba1f00b358c78365b5f68b9d55c36cc`; its scope remains source inspection and post-validation preservation, separate from the new native spike.

This resolves the extra host primary-marker restriction and qualifies complete original catalog projection for the captured installer-only subset. Original ontology associations still require authenticated owner-issued physical relationship bindings with exact source provenance. Synthetic operation artifacts, trusted installer identity, absent binding/default JSON homes and rollback-only provisional revision are explicit premises. Accepted owner/binding/current-cut authority, canonical key buckets, complete mutation/callable closure, protected semantic bodies and final publication/drain remain open. US-056-AC1/AC2/AC10 gain component evidence; no whole criterion or backend profile is promoted. Historical acceptance remains26/132.

Astra ultra independently audited final31 native observations and all697 current/preimage source hashes with no remaining blocker. Review was read-only, with no native execution; the qualification remains provisional installer staging with rollback.

Catalog-stage source preimages are retained as byte-exact `preimages.zip` bundles next to each receipt. The producer checks every entry against the captured bytes before execution; independent hash verification checks all entries against the receipt source inventory. This compact representation replaces duplicated dependency trees without changing original receipts or source bytes. The earlier58932dc5 run precedes only this archive representation change.

## Ontology association storage binding implementation gate — 2026-10-10

`docs/helix/02-design/contracts/security-association-binding.proposal.md` specifies original ontology/core/binding provenance, explicit binary edge roles, ordered target-key correspondence, physical compatibility, complete source coverage and acceptance-linked positive/negative tests. Current Truss accepted-binding vocabulary covers storage keys only. A new relationship interpretation must be registered and qualified before native relationship creation; absence of core direction/multiplicity/lifecycle cannot be repaired by silently rewriting the owner document. The next implementation must consume original authenticated artifacts and compiler-owned logical predicates, retain same-witness incidence/attributes, and prove complete mutation/current-authority/publication closure. The31-observation installer-only catalog result does not close these gates or promote26/132.

## Conditional association storage compatibility — 2026-10-10

Formal evidence `docs/helix/04-build/evidence/security/association-storage-compatibility/d31be4c0-393e-4209-b775-e6563ac54c83/proof.json` saves12 independently replayed formulas (four UNSAT/eight SAT), five current/preimage source pins, Z3 4.15.4, SHA256 `0c94557e3b6e55545565d04022a66bf73312f5b30e01bfd19c7470883814ce80`. Quantification over every nonnegative participation count proves that complete preservation excludes an inferred positive minimum or finite maximum, with explicit unrestricted positive and separate restrictive-bound counterexamples. Exact distinct binary role selection preserves the same-witness key/attribute predicate in either physical orientation; assuming ontology array order is native direction has a valid-population counterexample. This is an abstract conditional model. It does not extract SQL/compiler semantics, prove lifecycle compatibility, authenticate owners/cuts, establish complete facts/keys or qualify publication. The initial8-formula run had a tautological count check and is superseded by the quantified model.

Implementation must preserve native unrestricted storage compatibility or require an explicit semantic restriction before choosing bounds. Current Truss native relationship carrier requires bounds/lifecycle/direction, while the retained ontology asserts none. No existing core source is rewritten, and no new accepted-binding vocabulary or native support is claimed by this proposal. Owner-issued role choices, original accepted binding/archive custody, exact independent native definition correspondence and compiler-owned lowering remain required. US-056-AC2/AC10 gain design/component proof obligations; historical26/132 remains unchanged.

Astra identified native `edge_out` endpoint-pair uniqueness as a separate association-instance preservation gate. The final proposal requires an authored key proving endpoint-tuple uniqueness or refusal of this layout. Three additional formulas establish conditional instance injectivity, a valid distinct-endpoint positive and a parallel same-endpoint/different-key counterexample. The nine-formula predecessor lacks this gate. Semantic count laws assume realizability over all nonnegative counts; arbitrary owner domains/keys must be compared independently, and explicit operational resource refusal is separate from semantic restriction. No infinite storage capacity is promised.

Astra ultra independently replayed final12 formulas (four UNSAT/eight SAT), verified all five current/preimage pins and found no remaining blocker within the proposal scope. These remain conditional laws, not native binding admission, SQL/compiler refinement or acceptance promotion.

## Implemented private association correspondence boundary — 2026-10-10

Truss main `fe8a67051a4ecb3c6a0ff10fdd89ab71f3d9a218` implements `packages/python/src/truss/_security_association_binding.py` as a preliminary source-correspondence boundary. It captures exact bounded original core/ontology/binding bytes and returns frozen tuples/bytes, preserving unknown numeric tokens without imposing Decimal or integer ranges. It requires complete association and role mappings, explicit orientation/unrestricted independent storage choices, exact ordered association/target-key references and an authored association key contained in endpoint Fields. Separate instance IDs and attribute-dependent keys refuse the endpoint-pair edge layout. Higher arity, non-string endpoint profiles, changed source digests/revisions, missing/defaulted metadata and duplicate mappings refuse.

Truss evidence `docs/helix/04-build/evidence/security-association-binding/b332851f-fc2d-4489-b737-536aa90bfe84/tests.json` passes39 tests under Python3.11.17, six current/preimage pins, SHA256 `d81a4d95a527948dda63e3e08fa76817a8e8a762818ab2b5bcb7603c01ca44b8`. Tests retain original fixture bytes, both explicit orientations, composite-order positives and independent reversals, endpoint-key subset positives, parallel-instance loss, duplicate/omitted mappings, Unicode/depth/byte boundaries, unknown fractions and extreme exponents/5000-digit integer tokens. Python module boundaries pass245 imports. Astra ultra verified all six pins,39 names against AST/log and the boundary result; it reviewed the corrected implementation with no remaining blocker. It did not rerun the suite or execute native operations.

This checks source correspondence only. Genuine UMF/ontology owner semantic validation, authenticated original artifact/cut and archive revision/pointer authority, registered relationship interpretation, actual catalog/namespace/key/incidence observations, original Weft lowering and complete protected mutation/publication remain independent required gates. The output dataclass is not an admission capability; no database effects/public exports or installed-wheel/backend qualification follow. The mapping carrier is a private candidate, not a newly accepted native vocabulary. US-056-AC1/AC2/AC10 gain preliminary component evidence, not completed criteria; historical26/132 remains unchanged.

## Original owner interpretation and association correspondence — 2026-10-10

`tools/security/qualify-association-owners.py` now executes the pinned UMF producer's original `inspect` API, Weft's legacy `security_mapping_handoff` owner entry point and the captured Truss Python correspondence boundary against the unchanged `natural-count-self-join` core/ontology sources. Final evidence `docs/helix/04-build/evidence/security/association-owner-interpretation/0e6a5088-80fd-4279-b8ef-4da50419248c/receipt.json` passes25 observations/292 current/preimage source pins, SHA256 `c3299918ae2594ff4da0c0063fc4857e58c3317d2ccf27405e34ba65692a5eba`, using Python3.11.17, Bun1.4.2 and rustc1.90.0. Captured Weft sources from clean main checkout `6cc7bc71e47cf31da9197c964db979f9a21ecb4d` build in a fresh temporary target with locked offline dependencies; executed UMF/Python source is copied from captured bytes. Original fixture digests and complete owner handoff match. The producer checks source, executable and archive custody before retaining a passing receipt; preimages and build logs are retained. Registry dependency bytes and the complete toolchain are not archived, so this is not a hermetic-build proof.

Independent actual-owner controls reject invalid core kind (UMF validation and Weft `WFT-MODEL`), substituted ontology document revision (`WFT-SECURITY-PIN`), removal of a declared Assignment Field classification (`WFT-SECURITY-ONTOLOGY`) and removal of an endpoint required by the policy (`WFT-SECURITY-TYPE`). Every Weft refusal has exit1 and empty stdout after the agreeing successful original. The first25-observation predecessor instead added an unknown ontology member; it cannot prove missing-classification rejection. Two intervening captured-source builds failed because compiler schema dependencies were omitted; their logs/preimages remain historical. Successful `caa02791` precedes explicit Python/Bun runtime metadata; `2eefdfc1` retains those hashes but precedes Weft's merged reliability integration. The final run preserves that integration, captures its clean main commit and reproduces the same original handoff. Astra's requested control/custody corrections are applied in the final run.

US-056-AC1/AC2/AC10 gain original interpretation and source-correspondence component evidence. Weft interprets the original legacy policy/query/binding packet; it does not register, issue or authorize the new private association mapping. The private correspondence dataclass grants no native authority. Authenticated owner/issuer/current-cut and archive-pointer custody, registered native relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure and final publication/drain remain required. Historical acceptance stays26/132. Next implementation work must carry these exact owner-validated source dependencies into registered binding admission and independently observed native relationship definitions before protected graph activation.

Astra ultra independently verified the final receipt SHA, all292 current/preimage pins,25 unique matching observations, clean Weft main commit, fresh build log/removed target, runtime/tool hashes and complete handoff correspondence. It found no remaining blocker within interpretation/correspondence scope. Review was read-only and did not rerun the compiler or execute native operations.

## Private provisional binding byte custody — 2026-10-10

The native `catalog_binding_archive` candidate retains the entire original binding body, vocabulary pin, artifact identity, complete original admitted input and actual writer xid. `runtime_stage_catalog_binding` checks original admitted bytes/digest, canonical base64, exact current document cohort and unchanged prior revisions/archive before inserting; the archive participates in catalog generation and has ALWAYS immutable UPDATE/DELETE/TRUNCATE guards. The actual private TypeScript stager calls it inside the existing savepoint before native definitions. Unknown binding content remains uninterpreted, including binary NUL/invalid UTF-8 and extreme numeric token text. Present-binding default homes still refuse; these fixtures explicitly select JSON homes.

The complete native prestate capture has a distinct `truss-native-catalog-prestate/0.2-binding-custody` profile including prior archive rows. The 0.1 producer refuses when the archive relation exists. This is fresh isolated candidate DDL, not adoption/migration of the exported storage layout or populated deployments. **The 0.2 parity/finalizer is unimplemented**: existing `runtime_verify_new_catalog_prestate` does not admit this profile. No accepted report, readiness, publication or registered relationship authority is established. Native JSON aggregation is size-checked after aggregation; it is not a general CPU/allocation bound.

Captured-source native receipts (PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg80001.31.5, Python3.11.17, Bun1.4.2):

`truss-binding-catalog-stage/4c7f2a37-f6bc-4582-a282-696b6b7374bf/native.json`: 84 observations/700 current/preimage pins; SHA256 `c183c2eed9a290fec6d1ebed4e3b553d35be0761663373bbeea526efc1f6a208`.

`truss-binding-catalog-stage/e8e65e86-4af3-4840-88ad-5e85f2a7da26/native.json`: 79 observations/700 current/preimage pins; SHA256 `0216dc8b7ee69c26fe9b4c195aba856cf6388aa56ecd0fab1d8d2741d6958bf2`.

`truss-owner-catalog-stage/af76cacd-6eb8-48a4-937e-c7e6fd7b8f4e/native.json`: 31 observations/697 current/preimage pins; SHA256 `f2839fa8c5c52e37a16408ad0fc7eddf34ab0f0b08f09ea22f9651d4d987115c`.

Occupied coverage uses an explicitly excluded installer seed on revision0 with inert original bytes, not an accepted historical cohort. All guards are restored ALWAYS before genuine capture/staging. Successful current staging and whole rollback preserve that prior row; an isolated prior identity-byte drift after original capture refuses with the intended55000 message and zero effects, following an agreeing positive. Independent byte substitution, prior revision, document revision/digest refusals, generation, immutable guards, ordinary-role privilege denial and full catalog/archive projections also pass. Ordinary-role controls use SET LOCAL ROLE in the excluded installer session, not login/SCRAM qualification. All required cleanup completes before passing receipts. Bun catalog-input preparation regression:16 tests/55 assertions.

Astra ultra reviewed source/controls, verified the earlier75-observation/700-pin receipt, and requested occupied-prestate coverage and fresh execution; both are now retained above. Historical75/77 predecessors precede current harness, and two failed attempts (including misrouted `truss-owner-catalog-stage/8bccc16f-9255-4ec0-b786-5de3cb0c9c9e`) retain failure/preimages without claiming support.

US-056-AC1/AC2/AC10 receive component evidence only. Historical acceptance remains26/132. Authenticated owner/issuer/current-cut and report custody, registered vocabulary/relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure, 0.2 finalizer/publication/drain and remaining backends stay open. The archive is byte custody, not a policy engine or a semantic authority.

Astra ultra independently verified the final occupied receipt SHA, all700 current/preimage pins and84 unique matching observations, including isolated prior-byte drift, restored ALWAYS guards, before-admission old-profile refusal and exact positive/rollback preservation. It found no blocker for this narrowly scoped landing; review did not execute native probes.

## Binding-aware retained new-only parity — 2026-10-10

`runtime_verify_new_catalog_prestate` now reconstructs the complete retained catalog for exact profiles0.1 and0.2-binding-custody. The binding-aware branch includes every prior binding archive row, excluding only the selected new revision; exact JSONB parity detects prior-byte drift and missing/extra members. The verifier refuses0.1 with an installed archive or0.2 without it, using55000 `original prestate archive profile correspondence required`. A constant parameterized query keeps the optional relation out of the legacy absent-archive branch. This supersedes the earlier statement that0.2 retained parity is unimplemented; **finalization/publication remains unimplemented for this profile**.

`truss-binding-catalog-stage/ad0315c2-eb86-41ea-a50e-8d3ad3ff6ebf/native.json`: 94 matching observations/700 current/preimage pins; SHA256 `bcc3a44518a1472f6457d1486e6251e15f05d4e8f43bdd5fdb3a1f8131462a26`.

`truss-owner-catalog-stage/4e88698c-cb91-469f-af43-87ddc8b20070/native.json`: 32 matching observations/697 current/preimage pins; SHA256 `87b54f11f5071001c762bd535e4c2e637c2ce40d0b26f7f5d11501e6903fd148`.

Actual native positive verification passes before and after full original cohort staging. The occupied fixture's isolated prior identity-byte drift refuses retained parity with the intended55000 and no further effects; rollback restores prior fixture bytes exactly. Both profile/relation mismatch controls call the verifier itself after an agreeing positive, then restore the original snapshot. Profile substitution is explicitly excluded-installer fault injection: the original-operation guard function is temporarily replaced to permit substitution, then restored from exact captured original DDL before verification. Attempts to mutate without that exclusion and to ALTER the trigger with pending deferred events failed before reaching the verifier; their evidence is retained without claiming branch coverage. A separate native startup timeout is also retained. Legacy absent-archive positive coverage now directly executes the verifier, rather than inferring support from staging. Native versions and installer/SET LOCAL ROLE limitations remain those of the preceding binding-custody evidence.

This is retained new-only parity only. It does not authenticate the prestate producer, validate the excluded current cohort, authorize accepted-report provenance, register semantic vocabulary, prove native relationship/key/incidence correctness, or finalize/publish revisions. These gates, protected mutation/callable closure and remaining backends remain open. US-056-AC1/AC2/AC10 gain component evidence; acceptance remains26/132.

Astra requested a valid legacy-shaped prestate for the installed-archive mismatch: the final94-observation run changes only the profile and removes the0.2-only `bindings` member, leaving every other native catalog component unchanged. Its intended55000 demonstrates refusal of otherwise silently omitted archive state. The earlier02038994 packet retained that member and remains weaker historical evidence.

Astra ultra independently verified final94/700 and32/697 receipts/pins, corrected legacy shape, exact mismatch errors and restoration. No remaining blocker for retained-prestate parity scope. Review was read-only and did not execute native probes.

## Original full native inventory and key-default correspondence — 2026-10-10

Executing `runtime_collect_new_catalog_inventory` on the unchanged owner-validated natural-count cohort exposed a real staging/verification disagreement: `runtime_stage_new_key` already interpreted omitted `primary` as false, while the inventory compared stored false against SQL NULL. The inventory now applies the same explicit false default. It preserves authored true and false; no primary key is inferred from a key name. The original failed collector execution is retained at `truss-binding-catalog-stage/e50fdd37-6b9b-4a51-89df-33f452f632f1/failure.json`.

`truss-binding-catalog-stage/ea488fcf-d9c1-4417-b9d2-7a39153af847/native.json`: 99 matching observations/700 current/preimage pins; SHA256 `4c3a5d6efeddd78dcc8e9349e7988758a35d77f0e6ece582572dcf78260bccca`.

`truss-owner-catalog-stage/a54de9b1-c3e0-4959-a215-e8a6bc34c531/native.json`: 33 matching observations/697 current/preimage pins; SHA256 `802b9c97d036f53b3acfa8a344b4be4205586e917a86375db47718065fbe6b79`.

The actual binding-aware full inventory now returns5 original Records,9 owned Fields and5 keys; the actual count collector returns5/9/5/0/0/0. It invokes complete core declaration/definition/source and retained-prestate checks. An agreeing positive precedes isolated native substitution of one nonprimary key to primary; the collector refuses with55000 `stored original ordered Key definition correspondence`. Full key_def rows now participate in native before/after refusal and savepoint rollback snapshots, so restoration is directly checked. The final99-observation receipt supersedes951e83ac, whose snapshots omitted key rows. The absent-archive path independently invokes the full count collector and retained verifier, passing33 observations. Versions, captured source custody, cleanup and installer limitations remain as recorded above.

This does not prove present-binding current-cohort authority: the collector still interprets authored core definitions only; byte archive presence does not register ontology relationship semantics. The ingress report basis still refuses present bindings pending registered binding effect interpretation. Authenticated owner/issuer/current-cut/report custody, native relationship/key/incidence interpretation, complete protected mutation/callable closure and final publication remain open. US-056-AC1/AC2/AC10 gain component evidence only; historical acceptance remains26/132.

Astra ultra independently verified final99/700 and33/697 receipts, hashes and current/preimage pins; the isolated exactly-one-key false-to-true fault, intended refusal and full key restoration; actual inventory/counts in both profiles. It found no blocker within authored-core correspondence scope. Review did not execute native probes.

## Complete-inventory binding exclusion — 2026-10-10

The original ontology does not issue the bounds/lifecycle/direction asserted by the authored-core native relationship stager. The source-correspondence candidate cannot synthesize those assertions or use accepted-document provenance for an ontology-derived relationship. Registered physical interpretation remains required before native association effects.

A complete-inventory gap is now closed: the existing original-core implementation is explicitly `runtime_collect_new_core_catalog_inventory`; its body and source checks are unchanged. The `runtime_collect_new_catalog_inventory` wrapper reads the actual retained operation's original input bytes and admits only version0.1 with exact absent binding carrier. A present or unsupported carrier refuses with0A000 `registered binding effect inventory required` before delegation. `runtime_collect_new_catalog_counts` still calls that wrapper, so it cannot silently report zero binding-derived relationships as a complete inventory. Both functions are invoker routines with PUBLIC execution revoked. This is a binding-specific exclusion, not a general complete-effects theorem; transforms, accepted report authority and other obligations remain separately guarded/open.

`truss-binding-catalog-stage/67d0fa7d-c649-43a6-8eae-8ddb31cba4cd/native.json`: 102 matching observations/700 current/preimage pins; SHA256 `20ca5221ee8c136739d506aa7fd69f32aaa6b3b7cc8b0d450196be4166659e9a`.

`truss-owner-catalog-stage/9a26a93f-39cc-4ad7-af83-dfbfd7d4971f/native.json`: 33 matching observations/697 current/preimage pins; SHA256 `110fbc0e47f28c2e28b05833d6e9cfb470f535bce6ff1162423c6993fa675fff`.

The binding run labels its19-definition success `original-core-only-native-inventory`, preserves key mutation/refusal tests, and independently refuses complete inventory and counts with exact intended errors and unchanged native snapshots. The original absent-binding cohort independently passes actual complete inventory/counts and retained parity. Earlier18dec7b8 passed the same gate but used the misleading complete-inventory label; it remains historical. Versions, copied source/ZIP custody, cleanup and excluded installer limitations remain recorded above.

Prior99-observation results remain evidence of authored-core correspondence only; they cannot authorize complete present-binding effects. No criterion is promoted: historical acceptance stays26/132. Next implementation requires original owner-selected physical profile obligations, retained ontology/core/binding extraction provenance and registered native effect interpretation, followed by protected key/incidence/mutation closure and authenticated final publication.

Astra ultra independently verified final102/700 and33/697 observations/pins/hashes, original retained binding gating, exact0A000 refusals and unchanged native state, and found no blocker for this binding-specific exclusion. Review did not execute native probes.

## Explicit physical storage basis carry-through — 2026-10-10

The private association binding already requires eight explicit storage choices. Its immutable parsed result previously omitted them, leaving a downstream compiler to revisit bytes or reconstruct defaults. `AssociationStorageBasis` now carries source/target minimum and maximum, directed, lifecycle, composition and inverse verbatim from the validated candidate, plus the exact zero-based original `/mappings/n/storage` pointer. `AssociationBasis.storage` retains only immutable primitives. Mapping order determines the source pointer; explicit role orientation remains separate. No field is inferred from the ontology, key name or endpoint order, and missing storage continues to refuse. Original binding bytes remain retained.

This does not register the candidate or authenticate its issuer. The selected independent, unrestricted binary subset remains unchanged; alternate storage behavior still refuses. The constructible dataclass is correspondence data, not a native admission capability. A later registered interpreter must resolve this pointer against the original retained artifact and independently establish ownership, interpretation profile and current-cut authority before effects.

Captured-source qualification `association-owner-interpretation/8da2bb4f-6362-4ff1-9b29-fd86e498084e/receipt.json` passes31 observations/292 current/preimage pins, SHA256 `79bc868540dad12081332ca1b9088b246379e9f1989526b15bbe6561e1d9a763`. It executes43 captured association tests and retains their log; additional checks verify both source pointers and every declared storage value. Fresh captured Weft build and pinned UMF owner inspection preserve the complete original legacy handoff and four independent owner refusals. Versions, executable custody and nonhermetic dependency/toolchain exclusions remain in the receipt. Python module boundary check passes268 imports.

The native harness now pins that refreshed interpretation receipt instead of the stale predecessor. `truss-binding-catalog-stage/39a1513e-a668-4619-921e-5bd6573472e2/native.json` passes102 observations/700 current/preimage pins, SHA256 `8dc7ddd6469cd40181d4a4b5e0564937fb45d8e3270b6227fa5c0dc8c6067b0a`: original byte archive, occupied prestate, core-only inventory and complete binding-effect refusals remain intact. The old owner interpretation receipt remains historical with its captured preimages; its source pins are no longer current after this deliberate change.

US-056-AC1/AC2/AC10 gain preliminary source correspondence evidence only; acceptance remains26/132. Registered native association definitions/provenance, canonical key/incidence and protected mutation closure, authenticated report/issuer/current-cut and publication remain required.

Astra ultra independently verified the31-observation/292-pin receipt, exact source archives, fresh owner build and43 test names/results against captured source. It found no blocker for the frozen storage-basis carry-through; review was read-only and did not execute tests or native probes.

## Public installed preparation of the original security cohort — 2026-10-10

The newly merged public Python `prepare_acceptance` API is exercised against the unchanged original natural-count core and exact association binding candidate. Source/core bytes and caller-selected binding carrier survive exactly; owner declarations contain5 Records,9 owned Fields and5 keys, with no invented core relationships. The public provenance explicitly keeps `installation_profiles_verified=false` and scope `original_umf_preparation_only`. Unknown binding vocabulary is preserved without registration/endorsement. Invalid core kind must refuse as `invalid_document` with original owner `CORE_SCHEMA_PROPERTIES` error at `/modules/0/elements/0/kind`; the isolated valid-format binding SHA substitution must refuse as `invalid_input`, preventing a generic runtime/producer failure from satisfying either control.

`tools/security/qualify-public-security-preparation.py` captures83 source/test/configuration/asset preimages, builds a fresh wheel offline without fetching build dependencies, installs it into an isolated temporary target, verifies the imported `truss` path lies within that target, and executes the copied5-test suite. Every shipped source/asset is compared byte-for-byte with its captured original; copied execution inputs and current source pins are rechecked. Python/Bun executable hashes are checked before/after. Build/install/test logs, original wheel and ZIP source preimages are retained. Temporary build/install state is removed before the passing receipt is written. This is not a hermetic build-toolchain proof or full installed-wheel/backend qualification.

Final `public-security-preparation/4edd0e6e-ea75-47ec-8d0f-e8ae84eeb9d0/receipt.json` passes5 tests/83 current-preimage pins, SHA256 `1f0e91dc542867fc47a1095484527096e8238229d074adea10b1b5deae0e11c4`; retained wheel SHA256 `fb23c4ab910f3678776e545f49906b933b5fe31ff4fe1a103a637a706a3a6f19`. Python3.11.17 and release-pinned Bun1.4.2 execute the actual public preparation. Predecessorsd0154fef andddb37985 lack final runtime/copy or exact refusal/path controls and remain historical. An initial development assertion expected flat Field/key arrays; inspection showed the actual owner declarations nest them perRecord, and the final test checks complete sums across all five owners.

This replaces custom-bridge-only evidence at the public preparation boundary; it does not replace ontology owner interpretation, register the binding vocabulary, open a database or issue accepted identities/reports. Authenticated owner/issuer/current-cut, native physical association/provenance/key/incidence and protected mutation closure, final publication and other backends remain required. US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132.

Astra ultra independently verified the final receipt SHA,83 current/preimage pins,77 exact shipped sources/assets,5 installed-wheel tests and precise diagnostics, import-path isolation, runtime hashes and cleanup. No blocker for this public preparation coverage. Review was read-only and did not execute tests.

## Independent current-operation native binding source observation — 2026-10-10

`runtime_collect_original_catalog_binding` independently reads the immutable native binding archive under the actual current writer/ordinal and admitted catalog operation, with the original exclusive head admission. It invokes the established complete original-core inventory, original document carrier and retained-prestate gates, then compares full archive input/writer and original artifact body/SHA/identity/vocabulary against the retained operation's original input. It returns exact binding/input hex bytes and digest, plus the actual writer xid, operation ordinal and effect generation. It preserves opaque binary content and does not decode its semantics. The invoker routine has PUBLIC execution revoked.

This is fresh isolated candidate DDL and a source observation, not an accepted-binding source envelope, authentication or registration. Native `accepted_binding` provenance remains rooted in an immutable accepted report; provisional operation data cannot be relabeled into that category. The returned row is not a transport/reuse capability; future compiler/host custody must recheck original operation/generation and independently qualify semantic owner/current-cut authority before effects. General native CPU/allocation/aggregate transport budgets and complete runtime/driver qualification are not established by these finite fixtures.

`truss-binding-catalog-stage/c9857f9c-d1af-4198-984a-60cc3340628f/native.json`: 129 matching observations/702 current/preimage pins; SHA256 `77d37a6714279ff06614ad23a92509c128456ff407e79c0926902fec022ac346`.

`truss-binding-catalog-stage/643295c1-98b7-4e29-bd7f-30cab1b0cca4/native.json`: 121 matching observations/702 current/preimage pins; SHA256 `5522c6d07dc1db0ecc116a8ac3a73885cc1a6a4001dcb01590e67f1573d004b1`.

Each archive body, complete input, writer xid, artifact identity and vocabulary fault changes one field on the current revision following an agreeing positive. Excluded installer injection temporarily disables archive immutability solely for the fault, restoring ALWAYS guards before observation; the intended55000 refuses with unchanged fault-state and exact rollback restoration. An independent document revision fault refuses through the existing original-document carrier gate. Ordinary SET LOCAL ROLE cannot execute the routine (42501). Full native key/document/archive/operation snapshots and required cleanup remain retained. Opaque binding input includes NUL, invalid UTF-8 and extreme numeric token text; byte custody and complete-inventory refusal remain intact.

The initial125-observation predecessor included redundant document matching in the observer. A later control failed only because the existing core carrier refused earlier with its original error; that retained failureffdb4452 is not a passing new branch test. The final implementation reuses that established carrier and removes the redundant loop. The final129/121 runs use the intended existing error and unchanged source pins.

US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132. Registered native association definitions/extraction/provenance, complete canonical key/incidence and protected mutation closure, authenticated original issuer/current-cut/report custody and final publication remain required.

Astra ultra independently verified both final receipt hashes,702 current/preimage pins per run,129/121 unique matching observations, exact binary source observation, six isolated intended55000 refusals, ordinary42501, unchanged fault-state and restoration, and continuing0A000 complete-binding gates. No blocker for current-operation byte observation. Review was read-only; native execution was not rerun by the reviewer.

## Exact original association mapping extraction — 2026-10-10

The private association basis now retains each whole authored mapping value as immutable `definition_bytes`, its exact logical `/mappings/n` source pointer, and candidate extraction identifier `truss-original-association-json-candidate/0.1.0`. Extraction occurs after the existing complete JSON duplicate-member, Unicode and resource validation; returning a basis still requires every original shape and semantic correspondence check. Decoded root member names locate the original mappings array; JSON decoder boundaries select original value slices. UTF-8 encoding those original slices preserves authored member order, internal whitespace, escapes and multibyte text without reserialization. Whitespace outside the selected value remains in the full original binding archive. Mapping order determines the pointer; endpoint orientation remains explicitly authored.

This addresses the exact-source requirement for a future registered compiler without inventing accepted provenance. The extraction identifier is not a registered vocabulary, signature or transport capability. The result remains constructible correspondence data; a consuming admitted operation must independently resolve its pointer/bytes against the original current binding archive and qualify ontology/core owners, complete dependencies, semantic interpretation, issuer/current cut and accepted report authority. No relationship is staged and the complete binding inventory gate remains closed. Existing1MiB source,32-depth,16384-node and4096-array limits remain; retained mapping slices total no more than the original binding bytes. This is not a whole-runtime heap, native transport budget or formal decoder proof.

Captured owner qualification `association-owner-interpretation/f316ca00-80f1-4da5-8b97-686e6c278733/receipt.json` passes36 observations/292 current-preimage pins, SHA256 `7e84130a8293cf25ebb2fe40b233d9d08bc5becd6bd755926da85020c51e8088`. It executes50 captured tests, checks both exact mapping fragments/pointers and the candidate extraction identifier, and retains fresh Weft owner build, UMF owner validation and four original-owner refusals. Added controls cover authored formatting, escaped root member/value spellings, reordered/root-first mappings, multibyte UTF-8, delimiters inside strings, escaped duplicate-member refusal and immutability. Python module boundaries pass281 imports. Toolchain/dependency exclusions remain explicit; this is not a hermetic build.

The native harness now pins that refreshed owner receipt. Fresh original-candidate catalog `truss-binding-catalog-stage/c6f72f92-9c1c-49bb-836c-2cba600fdeee/native.json` passes121 observations/702 current-preimage pins, SHA256 `82b3719d24e77d564587e9af3af56ee1f4b353384b0a24359246ce49a21f2c49`. Occupied original-candidate prestate `truss-binding-catalog-stage/aac9ca11-a9bc-4cff-8a76-217bc4ee2928/native.json` passes129 observations/702 pins, SHA256 `9662ff875ee2988d5bbc76b50d3e0ba84f868c7fb2e4c3c3e98c6b0500872566`. Original byte observation, six correspondence faults, complete-binding inventory/count refusal and exact rollback/cleanup remain intact. These installer-only native runs do not execute the Python extraction on a protected native transport or authenticate a normal caller; that composition still requires qualification. Earlier owner/native runs remain historical with their preimages after the deliberate source update.

US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132. Registered association interpretation/provenance, complete canonical key/incidence and protected mutation closure, authenticated original issuer/current-cut/report custody, final publication and other backend implementations remain required. Astra ultra independently verified the owner receipt's292 current/preimage pins,36 observations and50 captured test names/results with no blocking findings; review did not execute tests or native probes.

Astra ultra also verified both final native receipts:702 current/preimage pins each,121/129 unique matching observations, unchanged31 native SQL inputs, intended correspondence/privilege/complete-inventory refusals and completed cleanup. No blockers for this scoped landing; review was read-only.

## Pending binding provenance and report ordering — 2026-10-10

The native source observer and exact original mapping extraction expose an ordering obligation, not a reason to weaken `accepted_binding`. CONTRACT-001 roots that category in an immutable accepted report; current report preparation instead requires complete native inventory. Requiring an already accepted report before every binding-derived native definition, while requiring those definitions before producing that same report, creates a strict dependency cycle. The current implementation refuses present-binding report preparation and complete inventory; it does not implement this proposed protocol.

Select an explicit operation-local pending binding source state for the next layout/producer spike. A pending relationship is a real native definition with reserved native identity, endpoints and association property owner, but its source kind is an internal candidate `operation_binding`, never `accepted_binding` or `accepted_document`. Its provenance retains the actual writer/ordinal, unpublished revision, full original binding/input bytes and exact mapping pointer/fragment, with independent original association/target Record dependencies. It may be constructed only after registered vocabulary/owner interpretation and original authenticated operation admission. This state is not a new shared UMF semantic kind, ontology assertion or published catalog-view source category. Its native columns/checks, registered decoder and migration are unadopted layout work; the existing source union must not be silently reinterpreted.

The protected transaction sequence is: (1) archive original input/documents/binding and stage the exact pending physical association effects; (2) independently enumerate complete native definitions/endpoints/keys/property homes and all original dependencies at one generation; (3) produce and retain the complete immutable report describing those observed effects, original sources and registered interpretations; (4) resolve the actual report's acceptedInput.binding against the complete original archive, promote only matching pending source tuples to `accepted_binding`, and retain the same definition identities/endpoints/property homes; (5) freshly verify the complete final physical inventory, provenance closure and report correspondence at the resulting generation; (6) atomically publish the head and finalized operation. No ordinary catalog/read/mutation path may observe or execute a pending definition; neither publication nor transaction finalization may retain pending sources. Errors roll back the whole acceptance. A constructible preparation, returned mapping, report bytes or matching count cannot bypass these gates.

Report insertion and source promotion are real effects and may advance the operation generation. Final recheck must therefore acquire its own current cut after both; it cannot reuse the pre-report inventory cut. The immutable report describes semantic physical effects and exact original sources, not a claim that its own insertion or later source promotion did not occur. Final comparison must explicitly account for the sole permitted provenance promotion, verify every other definition/effect remains exact, and independently verify the report/input/binding bytes and registered profile. A hash/count-only comparison, normalized omission of unknown effects or fabricated zero inventory is forbidden. Any further catalog, authority or relevant data mutation invalidates the final cut until a complete fresh recheck; the host and native publication owner must enforce the same original operation/generation and required wait/drain protocol.

Implementation exits, in order: issue the exact pending native source tuple/layout through the owner-controlled schema/exporter and a closed language-neutral contract; implement registered original-source association interpretation and independently qualified native definition staging; implement a complete pending-aware physical inventory and report producer; implement immutable report correspondence and exact source promotion; qualify fresh final inventory/authority publication and ordinary-role closure. Every exit retains source/definition/cut evidence. This proposal selects the ordering, not owner registration, layout adoption or a functioning backend.

US-056-AC1/AC2/AC10 tests must cover the full positive transaction and exact native binding source/history projection, plus: stage accepted provenance before report; fabricated document provenance; omit/extra pending mapping or dependency; change key/role/attribute/home/endpoint under equal counts; substitute report/input/binding/profile; promote another writer/ordinal/revision; mutate after recheck; keep a pending source at head publication or commit; ordinary reads/writes of pending definitions; failure at each phase with complete rollback and source/history preservation. Original caller/issuer/current-cut and complete writer/privilege/cleanup/drain evidence remain required. Conditional solver results cannot close these native cases or promote the26/132 acceptance total.

## Conditional binding publication ordering proof — 2026-10-10

`tools/security/prove-binding-publication-order.py` retains14 original SMT-LIB formulas and independently parses/replays every formula with Z3 4.15.4. `binding-publication-order/fb3ebd52-120f-40e3-9d3c-7b47c1cf73e6/proof.json` passes8 UNSAT safety/incompatibility checks and6 SAT feasibility/weakened controls, with8 current source/preimage pins; SHA256 `619ddae6df8bf6faf7557c85bdfebadbde67774ce997d4786cf13e5627b24477`.

The incompatible strict order stage→inventory→report→stage is UNSAT; this is an excluded proposed ordering, not a claim that current code runs cyclically. The selected pending-source sequence has a SAT execution. Conditional publication excludes report/promotion/recheck order violations, reuse of the earlier report-generation cut, a later effect at publication and remaining pending binding sources. Full quantified native physical identity/value parity forbids extra, omitted or substituted effects; a weakened equal-identity inventory admits a changed value. Independent weakened generation, pending-source and ordering gates admit bad schedules. Original byte custody alone is compatible with absent authority/registration. The initial12-checkac7a9204 predecessor omitted the explicit pending-source law and used a weaker substitution premise; it remains historical with preimages, not current final qualification.

The model has fixed selected event families over unbounded integer order/generation and abstract full physical values. Original owner/issuer authentication, registered semantics, exact original/report-source correspondence, complete closure, monotone native generation correspondence and full physical inventory equality are explicit premises. It is not a native SQL refinement, concurrency/liveness theorem, formal JSON decoder proof or implemented report/promotion/finalizer. A native report insertion and provenance promotion may both advance generation; final publication must bind a fresh post-promotion cut. All unknown effects/profiles remain refusals. Native installation must independently verify the proposed internal source category/checks and exact permitted source promotion before any accepted-view admission.

This ordering is a backend compilation/acceptance obligation for both relational and graph mappings. The proposed internal `operation_binding` source tuple is a Truss layout candidate; it does not add a shared UMF semantic kind or impose Truss columns on Ashlar or other implementations. Their own pending effect/provenance mechanism must prove the same original-source, complete-effect, report, final-cut and publication requirements under their qualified physical controls. AC1/AC2/AC10 remain open; historical acceptance remains26/132.

### Exact head transition and post-head finalization obligation

The existing `runtime_observe_catalog_generation` observes the actual `schema_head` row update: it increments effect_generation and resets phase/readiness/sealed/application state. The proposed protected finalizer must retain this observer. The pre-head recheck only authorizes the exact original head transition; it does not authorize commit. Under the same original exclusive head/caller/operation custody, write exactly the selected old-head→new-revision transition, independently observe the actual generation increment and reset state, then run a distinct complete post-head verifier. That verifier checks the exact new head, immutable report/input/binding, fully promoted definition/source inventory, journal/feed/non-row effects, complete authority and zero pending sources, and establishes readiness/sealing/application evidence at the actual resulting generation. Commit/public disclosure requires that generation to remain current. A further relevant effect invalidates it; arbitrary late mutations receive no exemption.

For the formal selected single-head-row event, the head generation is the pre-head generation plus one. This correspondence is a declared native refinement obligation, not a universal assumption about a larger finalizer transaction: every additional observed journal/feed/catalog event must be completed and included before the post-head cut, with exact registered inventory/generation correspondence. The current `runtime_collect_new_core_catalog_inventory` rejects a head that has reached the candidate revision, so it cannot serve as this post-head verifier. The new finalization verifier and complete commit barrier must be implemented and qualified separately; the existing unconditional fail-closed barrier remains installed until that full replacement is ready. A phase flag or a report hash cannot substitute for it. Add native tests for the head-trigger reset, pre-head evidence reuse, an extra post-head effect, wrong old/new head, incomplete post-head journal/feed closure and failure after head update with full rollback.

## Reviewed final head-aware publication proof — 2026-10-10

Astra review identified two defects in the initial protocol qualification: the actual head observer increments generation and clears readiness, and the feasible SAT witness allowed an empty physical inventory. The final design requires a distinct post-head finalizer/verifier and preserves the unconditional current commit refusal until a complete replacement is qualified. The final model requires a present definition in its feasible execution, models the selected actual head event and post-head/commit generation cuts, and uses named guards so every weakened control erases exactly its intended guard while retaining the others.

Final `binding-publication-order/903fcd60-6635-4cda-8651-6879dac95dd2/proof.json` passes18 retained/replayed formulas:11 UNSAT and7 SAT, with10 current/preimage pins including the actual native catalog-generation observer and commit barrier. SHA256 `4183dd15fc92d980acedcab6d307684c01e5e0f5f41c01153af74dd59208a5e5`. Added laws reject a post-head check preceding the head event, reuse of pre-head readiness and an effect after post-head verification; the corresponding omitted commit-cut guard admits a later effect. The prior12/14-check receipts remain historical and cannot establish the corrected head-aware protocol. Existing registered/authority/source/full-parity/closure and native event-generation correspondence premises remain explicit. No native pending layout, report producer, promotion, post-head verifier, complete finalizer or backend acceptance is claimed;26/132 remains unchanged.

Astra ultra independently replayed all18 final formulas (11 UNSAT/7 SAT), verified10 current source/preimage pins and exact formula hashes, and confirmed the head-generation and populated/isolation findings are resolved. No remaining blocker for this qualified design/formal checkpoint; native refinement and implemented publication remain open.

## Native pending relationship-source tuple candidate — 2026-10-10

The fresh-layout adjunct `catalog-pending-binding-source-v0.1.proposal.sql` implements the selected internal `operation_binding` shape on generic `rel_def`, with no per-ontology tables/indexes. Five columns retain native writer xid8, operation ordinal bigint, binding revision int, C-collated original mapping pointer and exact mapping bytea. Native composite FK requires the referenced original operation row; the binding FK requires the original archive revision. The pending branch requires every field and association property owner, the same positive binding/creation revision, a nonnegative ordinal,1–4096 pointer bytes and1–1048576 mapping bytes. Accepted-document and accepted-binding branches preserve their prior predicates and require all pending columns NULL. The existing source-home legacy ordinal/FK interpretation is not replaced by this adjunct.

`tools/security/capture-pending-binding-layout.ts` uses the actual UMF PostgreSQL owner importer, retains the full native-source model, saves/reloads it and exports the SQL used by the native test. Native source, saved model and owner-export SHA256 are respectively `5242d6cc5c77ac0f88184e74fc7af5369254a4aa9f1c057292b048e641c23d76`, `667cb771d1a56c0b464527e88f26d590d59008b3e7a75d6ee5ded3d7f5157cff` and `183abbb3884210ca18c967351ea3352399468970fde9f5a447234ac8a4f9ee45`. The retained capture receipt pins five owner entry sources and Bun1.4.2; it is original-source/saved-export correspondence, not complete dependency/toolchain custody or portable semantic extraction. Preserve its raw native extension/unknown content. This is not adopted installation or populated conversion SQL.

`tools/security/truss-binding-catalog-stage.py --pending-layout` installs the exact owner-exported adjunct in isolated PostgreSQL16.15. Excluded installer tests insert a structurally complete pending row using actual operation/type IDs and the original fragment from the qualified source-extraction receipt; they independently read native column types/C collation, exact tuple bytes and the generation observer increment. Named23514 CHECK controls reject each missing field/property owner, NULL/unknown/premature source kind, mixed document/binding tuples, empty/oversized pointer/fragment, nonpositive revision and negative ordinal. Named23503 FK controls separately reject absent operation ordinal/writer and original archive. Each previously valid accepted-source branch independently rejects each single added pending field. A separate excluded installer document fixture makes the legacy since_rev/doc_ord FK valid at revision zero, isolating positive pending archive revision versus a different valid creation revision; the exact source-completeness CHECK rejects it. All injections and attempted rows roll back to complete document/key/relationship/endpoint/archive/operation snapshots; the archive immutability guard is ALWAYS before its missing-archive probe and after restoration.

The archive FK refuses plain truncate with0A000 before the immutability trigger; a separate cascading attempt reaches that trigger and receives its intended55000 with zero effects. Ordinary SET LOCAL ROLE cannot read/insert pending rows (42501); this is not authenticated login or complete callable/privilege closure. Complete binding inventory remains0A000 and the schema-qualified existing deferred commit barrier remains55000 `complete runtime finalizer is not installed`. That unconditional barrier is not a pending-specific finalizer proof. Original accepted-branch positive fixtures prove shape preservation only, not accepted report provenance.

Final occupied-prestate `truss-binding-catalog-stage/15e512a9-2eab-4cd7-9951-09772ce37125/native.json` passes214 observations/711 current-preimage pins, SHA256 `784a2506fb4c1847eec206fb6e380cfbcf08799f465660dfb6c3e44146c3186a`. Fresh pending layout `dfcb2f45-8e57-48f3-bc8e-2c3791c668a0/native.json` passes206/711, SHA256 `2f9db9808d3d9b4aa492d382943d430ed7a5c0f012d28989f1631ad76bb807b7`. Unchanged original layout `2b0fd119-80c6-44a0-a527-510b53d104f2/native.json` passes121/702, SHA256 `c582c9f06dcfba6bd8be0237cbbe958fb9a0312c245ab8104210cf197378d6e7`. Exact source ZIPs, observations and required cleanup are retained. Development failures7bd1f91a (new FK refuses truncate before trigger) and9bcdbfaa (unqualified constraint name resolves nowhere) are retained failures, not passes; ba237cd9/1ff1b251/95ef117c/f4382068 predecessors lack final native readback or isolated controls and remain historical with captured preimages.

FK/shape evidence proves referenced row existence and completeness, not that the operation is the authenticated current writer/cut, its kind/phase is admitted, the archive writer/input agrees, or the pointer/fragment represents registered semantics. Existing admitted helpers do not stage or interpret this pending source. The source observer's authored-core inventory cannot be reused unchanged once a binding-derived relationship is staged; the registered pending-aware inventory/source verifier must independently account for it without fabricating an authored relationship or weakening completeness. Whole pending artifact/operation aggregate resource budgets, full lifecycle/history/promotion, protected ordinary API, native key/incidence/attribute closure and post-head publication remain required. US-056-AC1/AC2/AC10 gain component evidence only;26/132 remains unchanged.

Astra ultra independently verified214/711,206/711 and121/702 matching observations/current-preimage pins, exact ZIPs, original accepted predicates, NULL-safe pending separation, isolated revision equality, full restoration and required cleanup. Both requested control refinements are resolved; no blocker for tuple/FK shape only. Review was read-only and did not execute native probes.


## Original ontology closure before pending staging — 2026-10-10

The private Truss0.1.0 binary association carrier supplies only an ontology digest/revision, leaving its original ontology outside the native archived input. Select a distinct private0.2.0 carrier embedding a closed ExactArtifact ontology (`identity`, canonical `bytesBase64`, `sha256`) alongside existing original source digests/revisions/mappings. Exact original core is already in AcceptanceInput documents. No legacy source is silently upgraded; archive-only recovery refuses0.1.0. This is Truss correspondence metadata, not new UMF core meaning, registered semantics or authority. The recovered ontology still needs genuine owner validation, original revision/model correspondence and full mapping coverage.

Private source tests cover exact original formatting, missing/extra artifact members, malformed/noncanonical encoding including nonzero pad bits, original substitution, corruption, identity/size bounds, legacy archive refusal and unchanged semantic mapping checks. Whole original binding remains1MiB, limiting embedded ontology capacity; a matching digest does not admit a resource or operation. Retained local Truss evidence records62 passing Python3.11.17 tests (50 legacy,12 new) and288-import boundary checks with exact changed-source ZIP readback/logs. These are entry-source checks, not installed-wheel/native custody. Owner qualification and native archive composition must be refreshed against the changed module before pending staging. US-056-AC2/AC10 gain no completed backend criterion;26/132 remains unchanged.


### Refreshed original-owner and native carrier evidence

`association-owner-interpretation/8ed0ba2a-6fb7-407a-a6db-c9fa4e487551/receipt.json` passes38 observations/301 current-source pins, SHA256 `dc3100cde30534c65e8d16687e3c3f97429dacca1ff8f0bf5cfa89b5d1c2be36`. It executes captured source with a fresh locked offline Weft build, the original UMF owner bundle and both private test classes62tests; recovered ontology bytes equal the unchanged original owner input exactly. Its original core/ontology digests, explicit0.2 binding and exact mapping fragments are retained. Artifact identity remains a label; whole owner registry dependencies/toolchain are not archived, so this is not hermetic or authenticated owner admission.

Fresh isolated PostgreSQL16.15 pending-layout carrier run `truss-binding-catalog-stage/710573f9-9a1c-46da-8c43-7b383238ec51/native.json` passes206 observations/711 pins, SHA256 `f404271f85480eb5fd4f183f4b3b0b8ac365dc52629e8ffc75d38867d9456647`. Occupied-prestate `d29befac-1e58-4132-893d-729ce1ab2fb3/native.json` passes214/711, SHA256 `67422da3fd07a51095b1945948b8ddb53f328e7330ea0cf4a9594e22a86b558e`. Both retain exact source preimages/native readback/control restoration and completed required cleanup. Native SQL is unchanged: it preserves original full carrier bytes and tuple/FK shape but does not decode/register ontology semantics. Complete present-binding inventory remains0A000 and the unconditional commit barrier remains55000. Previous receipts retain their original captured qualification and are not current-source evidence for this changed Python module/harness. Pending registered staging, semantic native key/incidence/property closure, complete reporting/promotion and post-head publication remain next; no acceptance promotion.


## Native exact original mapping extraction — 2026-10-10

The ontology-dependency carrier alone does not prove a native pending row retained the original mapping selected by its pointer. The private `catalog-binding-mapping.sql` component now supplies an exact UTF-8 byte slicer and a separate operation-linked collector. The pure extractor accepts bounded unique-member JSON objects, canonical `/mappings/n` pointers with index0–4095, and a selected object value; it returns the original byte slice without JSON/JSONB reserialization. Escaped root member names are decoded for lookup. Multibyte values, escaped quotes/delimiters, whitespace, member order and extreme uninterpreted numeric spelling survive unchanged. It validates original syntax and duplicate member names including nested/escaped aliases. It does not validate the binding vocabulary, every mapping object, ontology semantics, keys, authority or an accepted report.

An explicit1MiB/null admission check precedes one whole-input lexical scan and PostgreSQL JSON parsing. At most32 nested containers are permitted, counting the root object as one and the mappings array as another; strings/escaped braces do not count. This native lexical-container bound is separately qualified, not a claim of identical Python node/depth accounting. Byte offsets use bytea/get_byte, preserving exact UTF-8 source bytes. Allocation/work/deadline and operation aggregate accounting remain separate. The private value-end helper is meaningful for already validated JSON boundaries; the full extractor establishes syntax/uniqueness independently before returning a fragment.

`runtime_collect_original_association_mapping` first calls the unchanged original binding observer, retaining actual operation/archive/input/document/core inventory checks. Both original owner-qualified mapping fragments match native outputs before pending effects. A real excluded installer pending-row insertion makes this collector refuse55000 `unique original declaration required`; it cannot be reused after pending effects, because the current collector expects authored-core relationships. Pending-aware registered interpretation/inventory remains required. Every new routine is INVOKER, has a fixed search path and is revoked from PUBLIC; ordinary helper/collector denial is qualified through SET LOCAL ROLE only, not an authenticated installed callable closure.

Final PostgreSQL16.15 fresh pending-layout `truss-binding-catalog-stage/408708d1-92ee-43f1-bcf0-c2c83c3b6275/native.json` passes254 observations/712 source pins, SHA256 `ccde4637af80524535d3ab88680cf8e5c4e8fa6196c2bf2bdb04e983436345ec`. Occupied-prestate `78218f40-ab78-4329-a729-c7fe7d6434d7/native.json` passes262/712, SHA256 `6954187077546876184e310c09cc98d7cfd5c98c717afdaf519a39733ab16540`. Both retain original source ZIPs, exact results, refusal/zero-effect/restoration controls and completed required cleanup. Positive boundaries include1MiB, index4095 of4096 entries and exact whole depth32 before/after the selected mapping and in a later mapping. Negative controls cover duplicate names, malformed/missing/wrong arrays, absent/non-object selections, canonical pointer/index violations,1MiB+1 and whole depth33. Matching syntax/source checks do not prove formal native refinement of the scanner or native graph policy behavior.

Astra found that the initial selected-prefix scanner left deep suffixes unbounded. The correction scans the whole root before parsing or selecting; all exact boundary/suffix controls above execute. Earlier eafc7f59 (239),f91f9d0d (246) and90c4a3d6 (252) retain their captured passes only: they predate the final whole-input correction or exact suffix positives and are not current qualification. No installed profile, registered pending producer, report/promotion/publication or acceptance criterion is promoted. US-056-AC1/AC2/AC10 gain source-component evidence only;26/132 remains unchanged. Next implement native dependency correspondence and the registered pending batch producer with original authority and a pending-aware inventory, then compose complete reporting/promotion and post-head verification.

## Original-source private association staging candidate — 2026-10-11

The private PostgreSQL16.15 candidate stages two original binary associations as generic pending rel_def/rel_endpoint metadata, deriving Record owners, ordered fields/keys, role orientation, all storage values and exact mapping fragments from the archived original input. It retains association properties without fabricating authored lineage. Whole-source validation runs once before the ordered exact-byte batch extraction; 4096 mappings pass and 4097 or a later non-object refuse atomically. Original ontology parsing keeps unknown huge numeric content as JSON/original bytes. Typed role/key guards and complete entity/association reference inventories reject aliases, duplicates and malformed unused dependencies.

Final merged-main native receipts under `truss-binding-catalog-stage/`: `0c0f6dba-26cc-4117-8132-9afae1196a41/native.json`: 316 passing observations/713 captured source pins, SHA256 `cda618d1108c041604f9839d08a6d6028b13b229f6c32bf97b1ea73018fc238f`; `7b354d91-ad12-417c-97e6-01ba815e3f40/native.json`: 324 passing observations/713 captured source pins, SHA256 `ab7ef2da6640a685baa0ee18f6e5f42b50c558ec46db548c358624baf35b6ac6`. Fresh and occupied runs retain source ZIPs, exact native readback, eight-component restoration snapshots including lineage, ordinary-role denial and required cleanup. Paired source controls restore the exact operation guard before probing and are excluded installer mutations, not newly owner-issued meanings. Development failures365880f5 (pending-trigger ALTER refusal) and04eec4d9 (native escaped-NUL parser mismatch) remain retained failures; earlier passing receipts are captured predecessor evidence.

This is an unregistered installer candidate, not an adopted layout or protected producer. Native field arrays are limited to256; ontology escaped NUL receives explicit0A000 unsupported-parser refusal while original bytes remain intact. Complete binding inventory still refuses0A000; repeated staging refuses55000; the unchanged unconditional commit barrier refuses55000. Accepted association lineage/history, registered semantic authority, authenticated callable closure, data key/incidence/attribute enforcement, shared aggregate resource accounting, complete reports/promotion and post-head finalization remain open. No whole private0.2/native equivalence or native refinement proof is claimed. US-056-AC1/AC2/AC10 receive component evidence only; acceptance remains26/132.

## Post-stage original source custody candidate — 2026-10-11

`runtime_collect_pending_association_source_candidate` observes pending source custody after actual staging without invoking the authored-only relationship inventory. It requires the current admitted operation, held head exclusion, an existing unpublished revision, exact original input/archive writer/vocabulary/artifact/digest correspondence, original document carrier correspondence and native document integrity. One whole-source mapping batch establishes a complete one-to-one pointer/fragment cohort; every matching pending row retains the current writer/ordinal/revision and exact bytes. Returned mapping digests and the observed generation are component observations, not durable readiness or finalization certificates. Missing/duplicate pointers, byte substitution, an independently valid extra pending row, changed original document metadata and another revision refuse with zero observer effects; ordinary invocation is denied. Eight-component restoration includes lineage.

Final PostgreSQL16.15 receipts under `truss-binding-catalog-stage/`: `428d4fae-c838-4ebd-904b-d12448d47564/native.json` passes338 observations/713 source pins, SHA256 `8fb832c6258f4be67eba63cb5a8e313d35dab56a6b90b04e0f91be587b9d9e45`; `fb8dd6bc-3dab-4ec4-9439-5ec9d4911c04/native.json` passes346 observations/713 source pins, SHA256 `cd136ccd8f79f35ceca8809cd85c1fdd2ba813ddbe5637f82d331a71b798141d`. Source ZIPs, native executions and required cleanup are retained. Predecessors7baac25f/95bfe724 (334/342 observations) lack the independent extra-row control. Predecessor3d7bab6d (331 observations) preceded the original document carrier recheck and is historical only. The observer does not validate relationship storage/endpoints/property/key semantics, original operation issuer/cut, accepted lineage, full core/effect inventory, native data constraints or publication. Full binding inventory and commit barriers remain closed. US-056-AC1/AC2/AC10 receive custody component evidence;26/132 acceptance remains unchanged. Next compose registered source/semantic interpretation and pending-aware complete effect verification; this observer must never substitute for those gates.

## Original pending metadata effect verification candidate — 2026-10-11

The native source resolver now derives original association metadata without insertion; the allocator consumes that result and retains original source provenance. The private effect collector composes the independent exact source cohort with the original Record/Field/Key and authored-core correspondence checks, then compares each full native relationship row against the source-derived row, excluding only the allocated ID and separately verified pending source members. Accepted-source columns, retirement, namespace, owner, name and all storage fields must match; each relation has exactly one correctly oriented endpoint and no fabricated lineage. Existing pre-stage core inventory remains pending-refusing; its new internal core-only mode is not a registered complete effect inventory. Ordinary effect invocation is denied. Full registered inventory still refuses0A000 and finalization55000.

Final retained PostgreSQL16.15 evidence: `truss-binding-catalog-stage/460762fd-b4d0-462e-9be1-545ebc09a813/native.json`: 371 passing observations/717 source pins, SHA256 `69dc7d64afe943b2e818e7047a2f9dd9c04ae91a684c8e7466f3fede62b43308`; `truss-binding-catalog-stage/18458931-eb83-48d4-a847-c1502f96056a/native.json`: 379 passing observations/717 source pins, SHA256 `6c73d00a899ffc8c66376b4091c138b94063ac8b72bf4d76df8ab80c53259d3b`; `truss-owner-catalog-stage/748beedb-0438-4d55-a1ab-deb7c2873ebe/native.json`: 34 passing observations/702 source pins, SHA256 `324a7fc2f22fb93ccc9c561d584219f0164594838ff7b81bbbd20f63a3a5df87`. The absent-binding regression has5 Records/9 Fields/5 Keys and0 relationships/endpoints; it does not supply positive authored-relationship coverage. Candidate controls independently mutate storage, association owner/name, orientation, endpoint absence, an extra valid endpoint, a valid fabricated lineage row and original core field metadata. The latter two structural injections preserve source-custody success while effect verification refuses. Ten-component restoration includes actual types/properties and lineage. Original late mapping/type/inventory/custody controls remain.

The combined verified inventory is assembled in deterministic order and source-inspected code checks16384 rows/1MiB before emitting it. Exact combined row/byte threshold execution is still required; the current cohort does not prove those boundaries. CPU/deadline/allocation/shared operation budgets remain open. Both harnesses use a single-handle pgserver subclass with private mutex/socket directories and unchanged installed startup/cleanup methods. Three captured pgserver implementation files are observed runtime-source premises, not a hermetic frozen-module/toolchain proof. Failed predecessor091fa928 completed362 observations but failed current-source pins after concurrent edits; cleanup was interrupted waiting on the shared pgserver mutex, then its exclusively owned postmaster, temporary/socket directories and execution copy were cleaned separately. Failure and exact preimages remain failures, not promoted evidence.

Astra ultra independently audited final observations/current pins/exact ZIPs/cleanup and resolved extra-endpoint, fabricated-lineage and property-restoration coverage gaps. This is private new metadata-effect correspondence, not registered ontology/policy authority, admitted lineage/history, native key/incidence/attribute data enforcement, complete report/promotion/post-head verification or installed ordinary closure. Positive authored-relationship and composite ordered-key controls, exact combined boundaries and full backend execution remain open. US-056-AC1/AC2/AC10 receive component evidence only; acceptance remains26/132.

## Authored relationship and pending association coexistence — 2026-10-11

The original captured UMF preparation path validates an explicit installer source fixture adding the authored `WorksWith` relationship (Staff→Project). Only the binding core digest is updated; original mapping fragments remain unchanged. Native staging preserves the authored definition, endpoint and exact lineage at ID 1, allocates pending associations from actual prestate at IDs 2/3, and includes all three relationships in the private combined metadata inventory. An independently altered authored definition receives 55000 and ten-component restoration retains types/properties/lineage. Later shape-only fixtures now allocate an unused native ID rather than assuming 1. This is actual UMF validation/native staging of a synthetic authored coexistence fixture; Weft is not rerun and no newly owner-issued ontology handoff or authority is asserted.

Retained PostgreSQL 16.15 evidence under `truss-binding-catalog-stage/`: `0dabc8f0-1ac1-49f2-82b5-0ad39b2fef23/native.json`: 375 passing observations/717 captured source pins, SHA256 `7b041c8bedc23246d42b6cf1590f16601b15f3d1e0436f384ec24767c65fd2f1`; `79ad184b-24b6-4128-973f-68cf599363bd/native.json`: 383 passing observations/717 captured source pins, SHA256 `46a359e8ec179d0f25c87d08aace4a3e03625eb5249a8d0bc47a246f0aee1cef`; `e8dc8cbd-321e-4c20-b5ff-1e5928942b27/native.json`: 371 passing observations/717 captured source pins, SHA256 `0cd4fd9b9171a5108aa523e88427dbe09bc893ad324077f72912c33950186fd2`. The first two cover fresh and occupied authored coexistence; the third is the original fresh regression. All required cleanup completed. Astra ultra independently audits observations, current source pins and exact preimage ZIPs. Concurrent Truss main commit d80b50b3 changes Python issuance outside these captured source premises; these receipts do not qualify that new path.

Failed predecessor 1c989862 used stale candidate IDs; f5163a91 collided with authored ID 1 in the later raw shape fixture. Both remain failed evidence. Parallel occupied run 3ea8a698 failed native startup because macOS shared-memory IDs were exhausted; the sequential occupied retry passed. No unrelated database processes were altered. The fixture adds positive authored relationship coverage, not composite ordered-key or exact combined inventory threshold execution. Registered policy/ontology authority, accepted association lineage/history, protected callable closure, native data constraints, complete reports/promotion/post-head finalization and broader backend suites remain open. US-056-AC1/AC2/AC10 receive component evidence only; acceptance remains 26/132.
