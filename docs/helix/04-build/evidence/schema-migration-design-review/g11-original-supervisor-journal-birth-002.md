# G11 original supervisor-journal0.2 birth and selection 002

Proposed governing015 design, following014's original birth gate. Baseline native
_SupervisorJournal0.1 treats missing file as virtual zero and creates its lock on
first use; that behavior MUST NOT select or initialize the new0.2 journal. This
proposal preserves original owner-context0.3 member names, old six-scope config/
approval wires and old journal0.1 bytes. New admission is explicit, not a caller
flag, missing path inference or unapproved extension of current setup JSON.

## New original enrollment, unchanged primary context

Allocate NEW `umf.local-owner-bootstrap-enrollment/0.3` with EXACT:

```text
{profile,enrollmentId,purpose,context,ownerConfiguration,nativeProfile,
 generationAuthorityRoots,supervisorJournalBirth}
```

The first seven members retain original enrollment0.2 meanings. OwnerConfiguration
is EXACT original configured-owner-authority0.1 with SIX scopes; nativeProfile
keeps its exact existing member set. This is the journal-only original variant.
Old enrollment0.1/0.2 remain exact and do not gain this member or journal0.2.
The old actual journal literal is `umf.local-postgresql-supervisor-journal/0.1`;
the NEW `umf.local-postgresql-owner-journal/0.2` is deliberately distinct, not
an alias or automatic replacement for that old literal.
New enrollment0.3 is installed at the original operator boundary before any
runtime context/target authority. Existing primary owner-context0.3's unchanged
enrollmentRecordDigest pins COMPLETE new enrollment bytes, including descriptor.
Its authorityConfigurationDigest, purpose/context, ownerLedger and ROOT birth
remain original definitions. No companion file or added primary member.

The earlier UNADOPTED application-bootstrap-interface001 allocation of enrollment
0.3 is superseded: future seven-scope ownerconfig0.2/ownerledger0.2/context0.4 uses
separate enrollment0.4 with its separately reviewed exact fields, including this
journal birth. No application scope is adopted or implemented by this proposal.
No current active enrollment/setup/header is rewritten or upgraded automatically.

SupervisorJournalBirth profile `umf.original-supervisor-journal-birth/0.1`, EXACT:

```text
{profile,journalProfile,journalId,supervisorId,definition,definitionDigest,
 path,lockPath,anchorDigest,initialHeaderDigest}
```

JournalProfile EXACT `umf.local-postgresql-owner-journal/0.2`. JournalId is one
original operator-allocated UUID before context creation; supervisorId equals
original enrollment context/nativeProfile. Paths are DERIVED, never selected:
`nativeProfile.controlHome/owner-journal-<supervisorId-without-hyphens>.json` and
that same name plus `.lock`. They match the existing supervisor path convention;
a preexisting0.1 file there is a conflict, never an upgrade. Absolute original
private-root/path/no-symlink/single-link/0600 rules remain exact.

Definition is EXACT known literal tuple:

```text
{profile:"umf.supervisor-journal-definition/0.1",
 journalProfile:"umf.local-postgresql-owner-journal/0.2",
 physicalEvents:"umf.supervisor-physical-events/0.2",
 rootEvents:"umf.supervisor-generation-root-events/0.1",
 originalsEvents:"umf.supervisor-originals-store-events/0.1",
 ingressEvents:null,applicationEvents:null}
```

DefinitionDigest hashes its complete canonical bytes. PhysicalEvents0.2 retains complete original six-scope physical rules with only
the explicit new target-create-request0.2 creation-intent binding below. Other
original physical event shapes/order/outcome rules remain exact. In journal0.2,
legacy untyped store-creation-intent/store-creation-confirmed MUST refuse; actual
new scope4 generic intent must follow its exact admitted typed ORIGINALS or
INGRESS intent and parent association. Complete per-store reservation state
replaces the legacy single global store boolean for those new branches. None of
this changes old journal0.1 wire/reader behavior. RootEvents is exactly governing014 observed/mutation-
intent/mutation-confirmed/bound grammar, original012 transitions and013 ordering.
OriginalsEvents is exactly adopted G04journal010 typed intent/confirmation and
original generic-intent association. Native runtime accepts ONLY this complete
compiled known tuple/digest with actual corresponding closed validators; no
hash-supplied parser, plugin, arbitrary event-family list or caller activation.
Unsupported definition refuses before context/target exposure.

Ingress/application event families are deliberately null until their separate
exact grammar is adopted. A future supported complete tuple with non-null
adopted family has a different immutable definitionDigest and requires a FRESH
original enrollment/header. It never enlarges an already enrolled journal's
allowed events or reinterprets its old definition. Old tuples stay readonly/
behavior exact. This is explicit fixed variant dispatch, not generic registry
admission by a matching submitted digest. Final positive full target qualification
requires a tuple containing all its actual needed originally approved protocols.

## Acyclic anchor and actual zero-state record

Derive anchorDigest=H of EXACT canonical projection:

```text
{profile:"umf.original-supervisor-journal-anchor/0.1",enrollmentId,purpose,
 context,authorityConfigurationDigest,nativeProfileDigest,
 generationRootPolicyDigest,journalId,path,lockPath,definitionDigest}
```

The three content digests hash COMPLETE corresponding original enrollment values.
No complete enrollmentRecordDigest, final context digest, initialHeaderDigest,
current journal hash or own anchor digest occurs inside this projection. They
would create cycles or make normal later appends invalidate original birth.

The REAL on-disk0.2 journal has EXACT:

```text
{profile,supervisorId,journalId,definitionDigest,anchorDigest,
 sequence,headDigest,events}
```

Initial actual bytes are canonical UTF8 JSON, NO trailing LF, profile the exact
new0.2 literal, sequence0, headDigest=anchorDigest, events=[].
InitialHeaderDigest hashes these COMPLETE bytes. Thus anchor → initial bytes →
descriptor → full enrollment bytes → unchanged final context digest; no hash cycle.

Events retain exact common `{sequence,kind,payload,previousDigest,recordDigest}`.
First previousDigest is original anchorDigest (not old zero64); subsequent links
are previous recordDigest. RecordDigest hashes complete canonical common event
with only recordDigest omitted. Sequence is exact number of retained events,
exact integer excluding bool/float, <=4096; whole canonical file<=8MiB. Validate
complete grammar/state/crosslinks and every original tighter payload/source bound.
Unknown kinds/keys/values or unsupported original definition refuse. No old0.1
record is read under this anchor/definition or silently canonicalized into0.2.

On later reads verify immutable birth projection/profile/IDs/definition/anchor,
recompute SAME original zero-state digest, then validate COMPLETE CURRENT events/
sequence/head/state. NEVER require the WHOLE current file hash to remain equal
to initialHeaderDigest after legitimate appends. This repeats the already reviewed
ROOT structured-header distinction, preventing source005's old failure pattern.
No such hash or file check alone proves deployment origin/nonrewind.

## Actual original creation, confirmation and constructor route

During original owner-context0.3 PENDING setup under its existing setup mutex,
include new enrollment0.3 supervisor journal and empty lock in the SAME original
required-resource birth protocol as owner ledger and ROOT registry. Validate all
known paths/header bytes first. Create only the exact descriptor-selected zero
journal and empty private lock; fsync files/parent. A known exact initial subset
can finish while original primary is still pending, with no usable authority,
no event/request export or native effect. A conflicting/nonzero journal while
primary pending refuses. No replacement IDs, alternate path or inferred empty
history. After ALL required resources verified, perform the ONE original atomic
primary pending→confirmed replacement. Existing old enrollment resource sets
remain exact; they do not suddenly require this new journal.

After primary confirmed, missing/corrupt journal OR lock ALWAYS refuses, even if
current sequence would have been zero. Read/open/recover0.2 never uses O_CREAT,
virtual zero or sidecar repair. Full current record verification cannot erase
pending history or synthesize initial bytes. Existing bootstrap/owner session
factory still runs before native target lease, as014 requires.

Bootstrap owns an opaque `_OriginalSupervisorJournalBirth` class/registry issued
ONLY after genuine original confirmed setup/enrollment/resource verification.
It retains SAME original issuer/context objects and complete descriptor canonical
bytes, not a current-state cache or SQL authority. No public constructor/seal or
caller JSON issues the object. A source fixture using this original file boundary
is still only source evidence until actual native target construction qualifies.

Native constructor route is fixed
`_SupervisorJournal.open_original(birth,*,control_lease)` (name internal). Require
that exact bootstrap-issued original birth object, same registered original
context/issuer/supervisor/control-root and active original physical control lease;
read ONLY existing actual files, verify fresh complete current record, then bind
its real path/lock/journal identity privately. Returning a birth object itself
cannot authorize writes or native SQL. Every append repeats current identity/
complete original history validation under outer lease then subordinate EXISTING
journal lock. No caller-supplied path/profile flag can select0.2. Old constructor
remains exact0.1 only; native original enrollment0.3 path MUST use open_original
and cannot downgrade to that legacy constructor.

## Explicit signed selection in target creation

Allocate NEW `umf.local-postgresql-create-request/0.2`: exact existing0.1 keys
PLUS `supervisorJournalBirthDigest,ownerBootstrapContextDigest` and new profile.
BirthDigest hashes complete original descriptor; contextDigest hashes ACTUAL
confirmed original primary context bytes. Original scope1 Ed25519 signing payload/
domain stay unchanged: its intentDigest now signs the complete new0.2 request,
so the selected journal birth/context are explicitly covered by the actual
owner creation signature, not falsely described as a separately signed JSON
bootstrap enrollment. No future target/native OID is added. The journal0.2 creation-intent payload
retains ALL new request0.2 fields plus the exact original purpose/requestDigest/
approvalId/approvalDigest members. Validate both new digests against genuine
original birth/context and signed request; never drop them and call old0.1
validation as a substitute for that binding.

Pure core gets these exact expected digests through genuine bootstrap-owned
opaque context metadata derived from original enrollment, with no filesystem/
native callback in core. It validates all duplicates/target/purpose and versions:
new enrollment0.3 requires request0.2; old enrollment0.1/0.2 retains request0.1
and rejects0.2. Already issued old requests are not upgraded/replaced at an
occupied effect key. Native prepare/reserve/execute/recover resolves SAME original
birth object/current files and original request signature/IDs under SAME lease
before effects; current path absence cannot choose a profile. Target reattachment
never calls target preparation to recover a missing journal or allocate IDs.

## Acyclic codec and source adoption handoff

Physical bootstrap must verify0.2 current journal without importing native
supervisor. Extract/new fixed native-free supervisor-journal codec BELOW bootstrap
and native adapter, owning exact closed data validators/state replay/anchor
projections. It may consume pure ROOT transition/validation leaves; those leaves
never import native supervisor or this journal consumer back. IO/file constructor
and actual native capability issuance remain their original bootstrap/native
owners. No generic callback/validator registrar. Source-map exact old physical
validator extraction and preserve original0.1 bytes/errors/behavior in regression
controls; do not accidentally redefine LocalPostgresError class/alias identity.
Codec-private error maps to original stable sanitized boundary error.

Required frozen source review includes: exact original enrollment0.3/schema and
metadata dispatch; full pure codec/event tuple/anchor/canonical state validation;
pending→confirmed native journal/lock birth with all crash/fsync/rename cuts;
bootstrap opaque birth ownership; existing-only native constructor/append/recover;
explicit target request0.2/original core metadata version checks; old0.1 resources/
requests/fixtures unchanged. Test legitimate nonzero current journal, loss of each
confirmed file, wrong header/definition/context/signature/paths, no O_CREAT/read
virtual zero, source hash-cycle controls, actual two-process resource lock/fence
and exact same-ID recovery. Full positive native/PG/checkpoint/committed-ingress/
application-origin/managed/installed/release acceptance remains separately OPEN.

This explicit new original selection allows actual durable ROOT writer work to
proceed without silently changing context0.3 or creating history on first use.
All future full migration support and historical active-target upgrade obligations
stay tracked; fixed safe refusals and source helper success do not close them.


## Exact bootstrap-owned private context metadata

Store immutable metadata bytes in a physical bootstrap-owned registry keyed by
EXACT registered OwnerAuthorityContext object, with the SAME original issuer
object. Preserve actual context class/registry/alias identity and serialized
context0.3 member set. This is private derived metadata, not a new setup file or
public constructor parameter. It is populated ONLY by genuine original context
issuance after existing confirmed setup/enrollment/resource verification.

Metadata EXACT:

```text
{profile:"umf.owner-context-journal-metadata/0.1",enrollmentProfile,
 ownerContextProfile,ownerBootstrapContextDigest,supervisorJournal}
```

OwnerContextProfile is EXACT `umf.local-owner-bootstrap-context/0.3`.
OwnerBootstrapContextDigest is lower64hex H of the COMPLETE actual confirmed
primary bytes, including state confirmed. EnrollmentProfile is exactly one of
original enrollment0.1/0.2/0.3; other variants refuse until separately adopted.
For old enrollment0.1/0.2 supervisorJournal is EXACT JSON null (not missing).
For new enrollment0.3 it is EXACT non-null:

```text
{birthDigest,journalProfile,journalId,definitionDigest}
```

BirthDigest is H of COMPLETE original supervisorJournalBirth descriptor;
journalProfile is EXACT new owner-journal0.2; journalId canonical UUID;
definitionDigest lower64hex of the COMPLETE original known definition. All four
members mandatory, no unknown keys. Enroll0.3/null or old enrollment/non-null
refuses. No future context0.4/enroll0.4 implicit admission. Paths/full descriptor
remain bootstrap-owned birth-object data; pure core needs only these original
expected digests/profile/identity, not a file path or native callback.

Fixed bootstrap function `_owner_context_journal_metadata(context)` resolves
EXACT actual context+issuer registry membership and retained immutable metadata
bytes, validates closed shapes and returns a defensive data copy/bytes. It does
not read files, create metadata lazily, call issuer methods/callbacks, accept a
submitted dictionary, invoke the existing live-I/O context validator to obtain
these values, or register a new context/issuer. Actual bootstrap/native freshness
checks continue at their owning boundaries; this accessor adds no filesystem/
native lookup to pure intent validation. Missing registry entry is corruption/
unqualified context, NEVER inferred old enrollment or journal absence.

Original actual context issuance for old enrollment records also populates the
explicit old metadata projection. Source tests that previously monkeypatched
only a six-value issuer tuple must explicitly construct genuine original private
setup/enrollment fixtures before issuing context; retain their assertion bodies
and source-only qualification. Do not add a sourceTest/legacy boolean, production
missing-data fallback, generic metadata setter or arbitrary issuer registry to
make those tests pass. No native process/database needs to run for original file
fixture construction, and those fixtures alone never attest native origin.

The core's local-target-creation parser chooses exact request versions from this
metadata: old enrollment/null journal→request0.1 only; new enrollment/non-null→
request0.2 only, with exact expected birth/context digests. All other existing
scope intents/signing payload/domain stay exact. A caller-supplied matching
metadata object or mutated context attributes cannot select a version; only the
bootstrap-owned registered association supplies it. No optional-key default or
first-use metadata synthesis is admitted.
