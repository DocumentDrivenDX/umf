# G10 retained whole-table recovery — formal R2 proposal001

This is an unadopted Sol design packet for root and independent external review.
It changes no repository artifact, public wire, native database or implementation.
All names/versions newly allocated here are PROPOSED. Approval of this document
would approve a design; it would not establish a native provider or qualification.

Read contract.md, provider-and-codec.md, lifecycle.md, original-registry.md,
cross-carrier.md and wire-adaptations.md as ONE normative proposal. The complete
fixed19-table DDL is provider-ddl.sql; the new dynamic heap/value/guard renderers
are specified in provider-and-codec.md and guard-renderer.md. New provider,
metadata and record definitions are bound by the definition descriptors and
manifest. Missing real original authority cannot be substituted with these files.

Inputs retain the full external R2 decision, all21 adopted G10 definitions,
governing C081/TD085/STP085 snapshots, later schema-USAGE governing002, actual
originals provider source and the exact original custody core. Source provenance,
hashes and sizes are in the input pin files and final manifest. All88 predecessor
acceptance obligations remain verbatim in the retained acceptance-matrix input;
acceptance.md adds64 future obligations. No first subset, safe refusal, Field
archive or carrier wrapper closes the full retained-table/mixed/native goal.

wire-types.schema.json is an additional CLOSED syntactic schema for the named
new record subset, not a complete validator for imported .1/G05 source/plan ASTs,
all .2 wrappers, native capabilities, signatures, state transitions or cross-record
relations. The complete exact normative shapes and relational rules are in the
listed documents and pinned imported definitions. generate-record-schema.py is
retained authoring source, not an executable authority or runtime dependency.
Later original-registry closed types are normative prose and deliberately have
no claim of machine-schema coverage. Implementations must validate ALL rules.

design-controls.py and its retained stdout/stderr are an earlier finite draft
checkpoint, run before the coordinator HOLD. They checked small synthetic shape,
framing, population and count examples, not PostgreSQL, native send semantics,
full JSON Schema conformance or product behavior. Subsequent source edits include
registry accounting/authority, wire distinctions and restoration clarifications.
The final packet has NOT rerun those controls. Under the active HOLD, final work
was restricted to source authoring/reading, consistency review and metadata
hashing/sealing. No tests, probes, SQL, build, browser, process campaign or native
execution ran after the HOLD. No qualifying result is inferred from a design case.

resolved-open.md separates concrete proposed decisions from enablement gates.
The pending table-definition direction is explicitly identified in its own file;
it is not mislabeled as a pre-existing public alias or already adopted addendum.
Root and external review must agree the complete interfaces before implementation
or governing adoption. Existing artifact IDs, frontmatter, DDX and all frozen
predecessor packet bytes are untouched.

The provider definition descriptor has EXACT the keys specified in
provider-and-codec.md: profile, engine, version, encoding, fixedDdlSha256,
recordFiles, rendererFiles, originalPins and limits. Every file entry is EXACT
{path,sha256}; path is packet-relative, SHA hashes raw file bytes. Limits EXACT
{fixedTables,liveRowsPerArchive,completeNativeValueStreamBytesPerArchive}, with
literal19/10000/8388608; all other complete signed caps remain conjunctive via
the pinned normative records. Its digest file is H(the descriptor), not the
raw pretty-printed JSON hash. No descriptor digest is embedded in a file it hashes.

New metadata definition descriptor EXACT
{profile,originalMetadataDefinitionDigest,unchangedApplicationMetadataSql,
providerDefinitionDigest,recordFiles}, profile
umf.inventory-metadata-definition/0.3; the original definition digest is the
retained original metadata-definition-digest.txt value, unchanged SQL/file
entries use {path,sha256}, providerDefinitionDigest is the new canonical
descriptor H, recordFiles the ordered complete new record-definition entries.
Its digest file likewise records H. These new descriptors supplement the
original exact physical metadata footprint; they do not alter old descriptors.
