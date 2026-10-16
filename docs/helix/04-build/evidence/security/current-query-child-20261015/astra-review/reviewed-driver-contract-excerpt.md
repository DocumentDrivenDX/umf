### Private current-query computation driver proposal — 2026-10-15

Status: private computation child implemented below; native issuer/capture and
guarded release integration remain unfinished. This section records the host
contract, with the final concrete framing and lifecycle specified in the child
implementation section. All original backend cases remain required.

The trusted native host owns one private, long-lived Bun child with inherited
private pipes. There is no public HTTP endpoint, listening server, selectable
model service, caller-imported opaque handle or permission token. Only its held
native query context can send and consume this protocol. A request ID and source
hash are correlation evidence; possession never grants access. Process ownership
and pipe access are host premises, not properties proved by JSON validation.

Proposed initialization carries exactly the original sources:

```ts
interface OriginalSources {
  policy: Json;
  catalog: Json | null;
  closure: Json;
  ontology: Json;
  associationBindings: Json;
  extensionSelection: null | readonly [{id: 'umf.actions'; version: '0.1.0'}];
}
interface Initialize {
  kind: 'initialize';
  requestId: string;
  sources: OriginalSources;
}
```

The private child calls
`compileCandidateCatalogProgram(sources.policy, sources.catalog,
sources.closure, sources.ontology, sources.associationBindings,
locallyIssuedExtensionClosure)` and retains the genuine returned JS object
privately. If `extensionSelection` is non-null, the child first calls the original
`createCandidateCoreExtensionClosure(selection)` factory and supplies its actual
in-process result as `locallyIssuedExtensionClosure`. The current closed factory
admits exactly `[{id:'umf.actions',version:'0.1.0'}]`; null selection means an
omitted sixth argument. Empty/extra/unknown selections refuse. This is explicit
selection of installed original semantics, not downloading or inferring a package.
The sixth argument is a WeakSet-issued opaque handle: a JSON object, copied report
or serialized closure is not transportable and must never be imported.
`associationBindings` maps directly to the compiler's semantic `bindings`
argument; it is not Weft's physical values binding. The source envelope requires
the explicit nullable extension selection. Installed source/package fingerprints
and runtime version are retained separately in the bundle manifest. No source
transformation is inserted. Wrapper records are closed; source JSON is forwarded intact to the
existing validators, including unknown extension data. Unsupported meaning
refuses through those validators. One process retains one exact compiled source
set; a source replacement requires a fresh child under a new native-held
initialization. Reinitialization/import into a live child and silent cache reuse
are refused. Native source changes invalidate the current invocation. The private
initialization reply is `{kind:'initialized', requestId, sourceReceipt}`;
`sourceReceipt` is SHA256 of the exact initialization frame, header included,
solely for correlation. Original source preimages and implementation provenance
remain separately retained; a frame hash is not a semantic identity algorithm.
A digest match does not prove DB origin, loading integrity or authority.

Proposed evaluation records contain the existing callable inputs verbatim:

```ts
// Json, SecurityRef and CoreKeyTupleValue retain their existing UMF meanings.
type OriginalOperation =
  | {id: string; kind: 'scan'; selection: {type: SecurityRef; fields: SecurityRef[]}}
  | {id: string; kind: 'read-rules'; selection: {type: SecurityRef}}
  | {id: string; kind: 'action'; request: {action: string;
      resources: {type: SecurityRef; key: CoreKeyTupleValue[]}[];
      targets: SecurityRef[]; fields: SecurityRef[]}};
interface RouteRequest {
  id: string;
  use: { scan: string; path: string; type: SecurityRef; field: SecurityRef;
    operator: 'predicate' | 'join' | 'group' | 'order' | 'aggregate';
    operation: string; required: Json[] };
}
interface Evaluate {
  kind: 'evaluate';
  requestId: string;
  owner: Json;
  cut: Json;
  operations: OriginalOperation[];
  routes: RouteRequest[];
}
```

`operations` is the existing original `evaluateCandidateCatalogOperationBatch`
closed operation union (`scan`, `read-rules`, `action`), not a second language.
The child calls that function with its own genuine handle and the exact original
owner/cut/operation inputs. For each route, in original order, it calls
`evaluateCandidateQueryValueRoutes(handle, owner, cut, use)`. All calls use one
detached immutable supplied data snapshot. The child emits one complete private
response containing the untouched original batch result and ordered original
route results, paired with request/route IDs. It does not issue authority,
`nativeReady`, scalar-domain qualification or a database admission decision.
Successful transport/computation is not a permitted query. On transport,
initialization, framing, resource-limit or process failure it emits no usable
partial response; only a coarse private failure category is retained.

Before planning or evaluation, the native host must require
`owner.disclosure.readAction === actualWeftDesignation.primary_action()` and
verify the exact original policy/model/catalog/closure/owner/profile/static
binding correspondence to that actual preparation. UMF's read-purpose check and
owner/cut revision agreement alone do not establish the designated primary action:
another declared read-purpose action could otherwise be weaker. Source receipts
or caller-imported designation JSON cannot supply this equality.

The Weft typed operand ledger has no effective mode. The native host combines
that genuine ledger with original UMF conditional source inspection before
constructing operations. A private `inspect-routes` RPC supplies exact
`{owner,routes}` to `inspectCandidateQueryValueRoutes(handle,owner,use)` in original
route order and returns the untouched conditional plans, never active truth or
permission. These plans are bound to the same private original program and owner;
evaluation verifies exact source/owner correspondence, not caller-invented plans.
The native host derives the provisional operand scan union from each original
ontology/base constraint. All admitted store/read modes must agree with that
base; every actually selected route is checked against it during evaluation.
Prohibited, conflicting, unknown or otherwise unsupported modes refuse; they are
not defaulted to disclosed or original. This is source planning through the
existing inspector, not a second policy resolver. Source preflight remains
mandatory for empty populations, without inventing an active branch or choosing
an unsupported empty-result domain. If the actual native profile cannot establish
the required uniform source domain/mode for an empty relation, it refuses.
A future profile with source modes not statically determined by that original
base would need an explicit bounded route-resolution phase on the same held cut;
this one-shot evaluation contract must not silently admit it.

The resulting operation plan uses that source inspection and actual Weft typed
original occurrence ledger, never SQL reparsing, imported diagnostic reports or
caller-selected actions:

- For each source occurrence, include a `read-rules` operation for its qualified
  type and a `scan` operation for exactly the union of selected public projection
  Fields and disclosed-mode operand Fields. Empty Fields remain a real typed
  scan for field-free COUNT and empty population admission. A raw operand alone
  does not add an otherwise unselected public disclosure requirement. Derive
  disclosed operand membership from the original source base, not a mode falsely
  attributed to the Weft operand ledger. The private render union may contain
  non-public disclosed operand cells; actual public projection mapping remains
  separate and is never inferred from that union.
- Evaluate each exact separate original action over the supplied typed resource
  inventory, retaining its explicit `targets` even when `resources` is empty.
  Preserve actual per-query ordering and an explicit association from every
  original occurrence to its action result. A read permit or an unrelated
  permitted action cannot satisfy an issued original-action designation.
- Preserve denied and indeterminate action results. The native consumer requires
  the exact action permit for every primary read-eligible resource where that
  occurrence requires it; denied resources never gain a staged operand.
- Rendered scan rows contain cells, not Resource IDs. The host must pair them
  with the permit rows of the same batch's ordered `read-rules` result and verify
  exact population/order/count correspondence to the original typed input facts.
  Preserve qualified type and original ordered Core Key tuples; do not invent a
  JSON/hash identity resolver. Refused or conflicting rendering supplies no rows.
- Route evaluation returns actual original rule truths and branch selection.
  `selected` can still mean prohibited, conflicting modes, unresolved disclosure
  or a separately authorized original value. The host must inspect the selected
  source branch status and exact native requirements; the label alone is never
  a staging permit. Missing source correspondence or an unknown eligible route
  refuses the whole query, including empty filter/LIMIT paths.

Proposed response mapping is:

```ts
interface Evaluation {
  kind: 'evaluation';
  requestId: string;
  batch: CandidateCatalogOperationBatchResult;
  routeResults: readonly {id: string; result: CandidateQueryValueRouteEvaluation}[];
}
```

The two result types are the existing exported private library interfaces,
not new result/status definitions. `batch` and every `result` are the original library
objects serialized without normalization; all original status, decision,
`complete:false`, `authority:false`, literal tokens, identities, cells and
unknown data remain intact. An original `refused` result remains a refusal, not
an empty relation or transport success certificate. The host does not stage or
release anything until the full expected response set is received and admitted.
No raw cut, hidden fact key/count or diagnostic detail is sent to the ordinary
caller. These private results are not a new public read interface.

The implemented private-child profile uses practical bounded input/output and a
native-parent deadline; it makes no aggregate work or heap guarantee. Original
batch work/text/literal accounting remains shared and unchanged. Each standalone
route call retains its original independent inspector and runtime ledgers; those
are not a whole-query ledger. The profile permits at most 256 operations, including
16 scans and 16 read-rules operations separately (32 combined), 4096 selected
Fields, 4096 routes with 16 distinct scan labels, and 10000 facts plus graphs.
Request/response payload limits are 4/16 MiB. Original parser/helper limits may
refuse earlier. The parent enforces one shared deadline and owns process cleanup,
native staging and guarded release. A deadline is not a proof of aggregate work,
allocation or memory bounds. No custom tracing, metrics or allocation meter is
introduced; any future aggregate guarantee requires separate implementation and
evidence. Source, Subject, coverage and value semantics cannot be changed to fit
a bound. This practical profile does not narrow the original acceptance cases.

Native-host sequence remains: hold authentic source/caller/Subject/current guard;
capture original source and complete fact cut; compile/compute; verify every
occurrence, route, exact action and projection; admit uniform scalar/presence and
paired runtime scopes; stage private values; compile through the actual typed
Weft consumer; execute; decode with actual result/cell lineage; revalidate and
release under the held guard. Every failure refuses before ordinary output.
Issuer release, cancellation, connection/process loss and revocation drain are
native-host responsibilities. No component receipt substitutes for that sequence.

Open integration inputs: Truss's DB-derived original source and fact-capture
records; actual authenticated current-Subject and guard ownership ABI; native
per-use relation/OID/ACL/type/encoding/collation checks; actual source and result
lineage; native staging limits; final frozen Weft binding;
private-pipe framing/cancellation and no-replay behavior. Proposed transport
rules admit one in-flight evaluation, unique bounded request/route IDs, exact
response correlation and original route order. Duplicate, unsolicited, late,
truncated, reordered or wrong-source replies invalidate the child/invocation;
there is no automatic re-execution or retry after uncertain native effects.
The implemented frame/byte limits are specified below. These are not inferred
from the candidate physical binding's JSON hashes. Raw tables and graph tables
use the same semantic callable shapes, while their native capture and physical
mapping remain separately qualified. Delta/Ashlar also retain separate native
issuer/publication/current-authority obligations.

Preimplementation callable witnesses are retained in [the proposal packet](../../04-build/evidence/security/native-computation-driver-proposal-20261015/README.md): supplied-cut alternate read-purpose admission and original local extension issuance/import refusal. They do not execute an actual Weft designation or native issuer and promote no acceptance case.

### Private computation child implementation — 2026-10-15

The private Bun child now implements original source compilation, route inspection
and atomic batch plus route evaluation through the actual Truss Python pipe.
The final ABI uses big-endian uint32 framing and nested `initialize.sources` with
all six closed fields. `extensionSelection` is null or exactly the local actions
0.1.0 selection; the original factory issues the opaque handle. `sourceReceipt`
is SHA256 of the exact initialization header plus payload, solely correlation.
Each child accepts exactly initialize, inspect-routes, evaluate, with unique
bounded request IDs and identical owner/ordered routes. Failure is terminal;
original semantic refusals remain untouched private results. No database
credentials, public server, native issuer or guarded release is added.

The builder discovers the original dependency closure, pins before the actual
build, verifies the same closure and post-build pins, and retains original
third-party license notices. Independent Astra controls and real pipe tests are
retained in [the child packet](../../04-build/evidence/security/current-query-child-20261015/README.md).
Native current-Subject/fact capture, primary-action correspondence, typed Weft
contributor lineage and held-context release remain required integration work.
No backend acceptance case is promoted.
