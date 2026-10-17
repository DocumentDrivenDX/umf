# R14 whole-package mypy triage

The raw command checks 45 source files and reports 85 diagnostics in 16 files. This is the meaningful current baseline for that exact command, not a clean source audit. Prior nine-error copied-source audit checked one `_query.py` file, removed exactly two scoped correlated-state ignores, and reported six correlated-state base errors plus three decorator-attribute errors. Its README explicitly disclaims a whole-library clean claim. Comparing 85 to nine as a regression is invalid.

Classification by source family:
- types.py:23 diagnostics at one forwarding call: **kwargs object does not satisfy Pydantic's typed ConfigDict subclass signature. Genuine source annotation debt; validate typed Unpack[ConfigDict] or remove unsupported config forwarding only after compatibility review.
- pages.py:2: obligations object narrowing is not retained beyond conditional extraction. Preserve Mapping local and narrow rowCap integer.
- _expressions.py:4: two overload-overlap diagnostics; two dataclasses.replace phantom-type returns. Explicit typed constructors can preserve exact runtime metadata while returning alias phantom. Overlap must get standalone client probes, not broad ignores.
- navigation.py:1: branch assignment inference chooses Navigation subtype before inverse Join. Annotate the shared relationship local with its actual Join supertype.
- _query.py:3: pre-existing callable decorator attributes. A typed decorated callable Protocol can encode metadata without broad Any/public contract widening.
- related_keys.py:1: dynamically assembled Pydantic create_model fields typed object rather than TypeForm. Explicit typed builder/validated type expression required.
- postgres_read.py:5: exact runtime type guards not understood for bytes; generator yield-from return loses tuple shape; verify-only correlated params narrowing. Native guards exist, annotations need precise protocols/branch split.
- native_actions.py:5, postgres_search.py:1, postgres_bulk.py:1, unity_search.py:2: generated class ClassVars absent on StrictModel. Encode generated metadata Protocol, not add invented defaults.
- build/unity_search.py:2: keyword node.value optional in static Node annotation; inspect validated leg and bind nonoptional local before access.
- unity_search.py:2 additional: exact native binary/vector guards not reflected by type(value) predicates.
- commands.py:1: generic async/sync implementation compatibility with overload. Reproduce independently before adjustment; keep public async result types.
- delta_read.py:26: predominantly dict[str,object] artifact outputs used as nested mappings/lists without typed narrowing, one optional py4j dependency absent, empty collection inference, strict binary conversion. Keep actual original-program validation; introduce typed admitted internal artifact structures rather than erase object checks.
- managed_support.py:1 and managed_bulk.py:5: empty collection inference, TypeAdapter dynamic union annotation and dynamically attached settlement_failures. Candidate managed profile stays closed; source annotation fixes must retain uncertainty quarantine behavior.

No native runtime failure is demonstrated by this diagnostic list alone. No source suppression or production edit was performed. All source hashes at diagnostic locations are retained in diagnostics.json; original raw log is retained verbatim. The package remains frozen for R14 installed/native qualification. Next fixes should be separate coherent source cut with standalone strict client probes and existing unit/native replay.
