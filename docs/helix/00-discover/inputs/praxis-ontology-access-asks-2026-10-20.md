# Asks for UMF: a typed access client for the Praxis ontology

From Praxis (Skadden harness). Evidence date 2026-10-20. Cohort used: `umf-core 0.10.0`,
`umf-codegen 0.1.0a1` (UMF SDK 0.5.2 release assets), Python 3.11.17, macOS ARM64. Nothing was run
against Truss, Weft or Postgres; every finding below comes from the generator and the generated
client against a fake transport, plus reading UMF source and contracts.

## Summary

`umf_codegen generate` already gives Praxis most of what it wants: frozen row and key dataclasses,
typed column predicates, relationship builders, typed `Actions`, sync and async clients, a
one-method transport protocol, all standard library only, with a `check` that detects drift. This
write-up lists what stopped us from adopting it for a plugin's ontology module and what we ask UMF
to add or confirm. Items 1 to 4 block adoption; 5 to 8 are smaller.

## How Praxis uses this

- A plugin declares one ontology module (a UMF document in its package). A host loader registers it
  and the plugin code reads and mutates its types.
- Plugin code runs either in the host process or in a sandboxed worker. In the worker the only way
  out is a broker call, so the generated client's transport is a thin adapter (`execute(request)`)
  that forwards the request document to the host. Plugin code must be identical in both modes.
- Every call is made as one person; the host binds the transport to that person per request.
- Generated code is produced at build time and covered by the plugin package digest. It is not
  committed.

## What worked (so you can keep it)

Reproduction in a scratch venv:

```sh
python3.11 -m venv v && ./v/bin/python -m pip install --only-binary=:all: \
  --find-links https://github.com/DocumentDrivenDX/umf/releases/expanded_assets/umf-v0.5.2 \
  'umf-core==0.10.0' 'umf-codegen==0.1.0a1'
python -m umf_codegen generate --schema ex10a.json --package example_client --output gen
python -m umf_codegen check    --schema ex10a.json --package example_client --output gen   # exit 0
```

- With the document's `umf` set to `0.10.0`, records, keys and relationships (forward and inverse)
  generate: `Project`, `ProjectKey`, `Project.c.practice.eq(...)`, `Project.objects`,
  `.related(...)`, `get`, `get_many`, `first`, `one`, `page(size, after, at_least)`, `all`.
- Actions declared with `umf.actions` generate typed methods, for example
  `Actions.open_project(*, code, title, practice, idempotency_key=None) -> Receipt[ProjectKey, None]`
  and `plan_milestone(*, milestone: MilestoneKey, project: ProjectKey, ...)`.
- A fake sync transport round-tripped a read page, two applies and a type error. Request envelopes
  carry `contract: "umf.access/1"`, the source digest as `schema`, `idempotency_key` and `at_least`.
  Rows and keys travel keyed by field id (`"Project.code"`). A lost write raises
  `WriteOutcomeUnknown`.

## Asks

### 1. Accept (or convert) Hohfeld's DDD ontology documents, and say so loudly

Our module documents are core 0.7.0 with `umf.ddd` records and actions written as
`modules[0].actions[]` with `inputs`, `preconditions` (`absent`, `exists`) and `effects`
(`create`, `link`, `update`, `delete`). Today:

- Setting `"umf": "0.10.0"` is enough for records, keys and relationships.
- The actions are silently ignored: `_ACTIONS = {}` and `Actions` has no methods. No diagnostic.

Ask: either (a) define the supported mapping from that action form to `umf.actions` and have the
generator or a separate converter do it, or (b) tell us it is out of scope and we rewrite our
documents. In both cases, **refuse or warn when a document carries actions the generator did not
turn into methods**. A silent empty `Actions` is the worst outcome.

### 2. Optional action inputs and create-with-optional-fields

Our `OpenProject` takes `client` as an optional string, and the record's `client` field is
optional (`absent-allowed`). With `graph-write/1` the generator refuses it
(`ACCESS_UNSUPPORTED ... ACTION_EFFECT`), because `src/extensions/actions/analysis.ts` requires an
assignment from "a required value parameter of the exact destination Field"
(the check near line 157). The only way through was to drop the parameter.

Ask: a way to assign an optional parameter to an optional field, with a defined meaning when the
caller omits it (leave the field absent; never write null). The generated signature would then be
`client: str | None | Missing = MISSING`.

### 3. Preconditions and refusal reasons the client can name

Our actions carry preconditions with stable ids and reasons, for example `fresh` ("a project with
that code exists"; predicate: the key is absent) and `exists` on referenced entities. The client
documents `PreconditionFailed.precondition` and an error `{code, field?, precondition?}`.

Ask:
- Confirm `umf.actions` preconditions of these two kinds (key absent, entity exists) are supported
  by the generator, and what the generated surface exposes (an enum of precondition ids per action
  would let callers handle each refusal by name).
- A sample document with preconditions that generates, so we are not guessing from the contract.
  (Praxis did not test this; our attempt stopped at item 2.)

### 4. Batch apply and validate-only

The runtime already treats `apply_batch` as a write kind (it raises `WriteOutcomeUnknown` for it)
but generates no batch method, and there is no validate-only call. Praxis uses both: a batch of up
to 100 items of one action, optionally atomic, optionally stopping on the first error, with
per-item results; and a validate call that runs the preconditions without committing.

Ask: typed `Actions.<name>_batch(items, *, atomic=False, stop_on_error=False, idempotency_key=None)`
returning per-item outcomes plus one consistency token, and `Actions.<name>_validate(...)`. Please
state the item cap in the generated metadata (we cap at 100; Truss groups allow 1,024).

### 5. Link keys on reads

Our reads can ask for the keys of named links on each row (`links=["dependsOn"]`), at most 100 keys
per link, so a list screen can show relationships in one call. The generated client has
`.related(rel)`, which is one query per relationship per call, and rows carry no link data.

Ask: an optional link-keys projection on `get`, `get_many` and `page` (typed, bounded, with a
stated truncation signal), or confirm that the intended answer is one `.related()` query per link.

### 6. Wire naming and the host mapping

Rows and keys use field ids (`Project.code`, `Milestone.code`) and action ids use the document's
kebab-case ids (`example.open-project`). Praxis hosts will map these to their backend. Please
document the wire contract as normative (field ids, record ids as `module.Record`, key shape,
receipt `created`/`changed` shape `{record, key}`, `counts`, `consistency_token`) and state that a
transport may rely on it. Please also publish the six-plus error codes as a machine-readable list in
`description.json` so a transport implementer can check coverage.

### 7. Pending tokens and write outcomes in the receipt

The release notes say pending receipt tokens exist before commit. The receipt returns only
`consistency_token`. Please say in the contract how a caller distinguishes "applied and committed"
from "token issued, outcome not yet known", and that `Receipt` is only returned after a confirmed
commit. Praxis audit entries and `at_least` reads key off this.

### 8. Build-time requirements and platform

- Praxis builds on Linux for Databricks; the cohort says qualification was macOS ARM64. Please
  confirm `umf-codegen` (with `mini-racer 0.14.1`) installs from wheels on manylinux x86_64 and
  aarch64, Python 3.11 to 3.14.
- Please state whether the generator is deterministic across platforms (same input, same bytes),
  since the output is covered by a package digest and compared by `check`.
- Please confirm the generated package never imports `umf_access` and can be installed in a worker
  with only the standard library.

## Not asked

Execution, authorization, grants, row scope, audit and plugin loading stay in Praxis. A Truss or
Hohfeld backend behind the transport is a separate decision on our side.

## Questions back to UMF

1. Is mapping Hohfeld's DDD actions to `umf.actions` something UMF wants to own, or should Praxis
   (or Hohfeld) own a converter?
2. What is the intended sequence between `umf-codegen` and `umf_access` for a host that is not
   using Weft or Postgres for the ontology (our backend may be a Hohfeld session over Truss)?
3. Is `umf.access/1` frozen enough for a transport adapter to be written against it now?
