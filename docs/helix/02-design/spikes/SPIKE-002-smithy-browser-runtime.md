---
ddx:
  id: SPIKE-002
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-014
      kind: informed_by
    - id: US-014
      kind: informed_by
---

# SPIKE-002: Smithy browser runtime feasibility

Can the pinned native Smithy parser/assembler run as JavaScript without replacing its
semantics with a partial parser? This experiment tests direct TeaVM compilation. It is
research evidence; the browser-runtime requirement remains open.

The prototype in `native/smithy/browser/` pins smithy-model 1.73.0 and TeaVM 0.15.0.
It uses an exported static method, in-memory `addUnparsedModel` inputs and native model
serialization. Reproduction: `mvn -q -f native/smithy/browser/unmodified-pom.xml process-classes`.
The installed OpenJDK 27 compiled the bridge; TeaVM failed with exit code 1. No usable
JavaScript artifact resulted. The checked-in findings list missing runtime surfaces.

Native assembler reachability includes `parallelStream`, class resource URLs,
`StringJoiner`, sorted-set wrappers and reflection methods such as parameter metadata
and generic superclass access. Supplying TeaVM's class library fixes the initial
missing-Object configuration error but does not resolve these native-library demands.
No model validation was disabled to force a successful build.

The result rules out an unmodified direct compilation under this pinned configuration,
not every possible Java-to-JS port. Further work must cover resource embedding, runtime
substitutions and reflective trait/validator behavior, then compare the full native
corpus. A separate browser parser must likewise demonstrate the required language and
assembly semantics rather than inherit native support claims from archived source.

Meanwhile, the TypeScript source-bundle profile preserves exact IDL/JSON texts and
candidate edits with explicit unvalidated status. Native JVM tests establish round-trip
behavior independently. This source profile does not complete browser parsing/assembly.

References: [TeaVM JS modules](https://teavm.org/docs/runtime/js-modules.html),
[TeaVM Maven configuration](https://teavm.org/docs/tooling/maven.html), and
[Smithy IDL](https://smithy.io/2.0/spec/idl.html).

## Patched Runtime Experiment (2026-09-20)

The subsequent compatibility build succeeds and runs natively in Bun and Chromium.
`bun run build:smithy-experiment` pins and verifies the upstream source artifacts,
regenerates thirteen modified native source files and compiles the optional module.
Original/patched source hashes and the unchanged prelude hash are recorded. The
unmodified failure remains reproducible under its separate Maven configuration.

Changes replace parallel streams with sequential streams, add StringJoiner/read-only
sorted-set adapters, use equivalent method parameter reflection APIs and embed the
pinned prelude text. Compilation alone was insufficient: runtime IDL parsing failed
because TeaVM's CharBuffer.charAt ignored buffer position. Materializing string slices
at the two parser boundaries resolves that observed divergence. Generic-superclass
reflection is explicitly unsupported and throws, rather than returning an approximation.
No model validation is disabled. Twenty-six JVM helper comparisons/guards pass.

The patched runtime matches every existing native corpus result: 64 JSON AST cases
and 80 IDL cases, including acceptance, sorted diagnostic IDs and canonical model
SHA-256. All 144 comparisons also pass in Chromium. Browser negative checks reject
an unresolved reference, an invalid trait target and malformed syntax; exact unsafe
integer metadata remains intact. Both reports record the generated runtime hash.
These compare different runtimes of largely the same native implementation, not two
independently authored language implementations.

The result establishes a viable experimental browser runtime under these patches. It
does not establish all reflective/custom-validator behavior or complete language
coverage. Next: integrate the optional module behind a typed, source-retaining public
assembly API; expand negative corpus coverage; isolate synchronous compilation in a
worker; and account for unsupported reflection before making wider support claims.
The default library's archive inspection remains distinct from native assembly.

The optional runtime is now available through explicit public backend/assembly APIs
(CONTRACT-014). Public results retain source, native diagnostics and exact assembled
models while keeping runtime limitations visible. Source archive inspection remains
separate. Worker isolation and broader negative/reflection coverage remain open. The
public corpus audit also identified native non-idempotent mixin serialization; its
effective-model stability is verified separately with the unmodified JVM.
