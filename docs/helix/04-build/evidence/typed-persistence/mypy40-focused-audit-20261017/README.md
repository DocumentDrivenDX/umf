# Bounded source mypy40 correctness audit

This independent, native-free audit found **no demonstrated release blocker among the reviewed 40 diagnostics**. All 40 implementation diagnostics remain; this is not a whole-library type-clean or soundness claim. Runtime/source and governance are unchanged.

The historical two-module direct mypy invocation had an identical diagnostic multiset at baseline c042a13e and candidate f58deb12 (40 each). It is distinct from the governed generated-client release checker. The original log, comparison and scope are retained unchanged.

Classification: 23 Pydantic subclass-kwargs stub argument mismatches; two overload-overlap diagnostics; two dataclasses.replace phantom-owner return types; one navigation local inference; three dynamic decorator attributes; two correlated Mapping narrowing diagnostics; one create_model overload; five raw-driver/generic/narrowing diagnostics; one generated-Key ClassVar annotation. These are implementation typing debt; this bounded audit establishes no new public counterexample.

Focused mypy probes using current source, actual generated commerce/relationship_shop and pinned mypy 2.4.0 passed 11 exact positive type assertions. Five intentional nullable/numeric bucket, alias-owner, relationship-Key and navigation-owner misuses all failed with the retained precise diagnostics. Five pure runtime checks passed: alias/relationship identity, inverse selected-Key versus relationship-Key metadata, malformed stream-domain refusal, strict Binary carrier conversion, and retention of generated field validators in related-result models. The generated int64 model still rejects bool and out-of-range values after wrapping.

Raw parameters are exact-model checked before revalidation (postgres_read.py); None/wrong-model cannot reach the business path. The pages diagnostic is correlated narrowing: nonnull stream domain implies Mapping obligations, and malformed domains are explicitly refused. No generic suppression or production change was made.

`retained-source-inputs.tar.gz` and source-provenance.json capture retention-time current source and the two consumed generated packages. No contemporaneous before/after hash receipt was recorded for the original focused probes; retention hashes must not be presented as such. Source archive also includes unrelated current build WIP for exact provenance only; that WIP was not edited or audited here. Historical logs retain their own source-cut scope. Commands are retained verbatim in commands.txt. Pinned Python 3.14.8 / Pydantic 2.14.1 dependencies came from the immutable R26/R22 environment; mypy targets Python 3.11.

No native/UI/API calls, source edits, release/gate reclassification, grant-policy changes or R5 parser application occurred. R5 human approval and managed native capability/permission holds remain unchanged.
