# Core0.10.3 generation/metadata source review

Verdict: CHANGES REQUIRED in four finite families below. This reviews the23 generation-metadata postimages from implementation-source-freeze001 against Core plan ca65010b… and range decision efa3e900…. The separate four wheel/public-proof files retain their own review7ce6df1e…. Root's normal main merge e2babe303ad6ab34fc548ff8426c8324692d946b does not change these23 bytes; main's historical R3 is an input seed, not qualification. No candidate runtime, imports, AST/YAML evaluation, tests, generation, source edits or Git mutation performed. Stdlib JSON/hash/TAR/ELF-field reads and read-only Git source comparisons only.

## Consolidated corrections

**CG-F1 — P1: extracted CPython is not bound to its verified runtime tree.** core-python314-generation.yml:238–259 executes RUNNER_TEMP/core-python314/bin/python3.14 after extracting the complete pinned archive, but does not configure the loader. Direct stdlib parsing of the exact pinned17752-byte ELF proves DT_NEEDED=libpython3.14.so.1.0 and DT_RUNPATH=/opt/hostedtoolcache/Python/3.14.8/x64/lib. This can fail to load, or use an existing toolcache library instead of the verified tree. Keep the exact archive/executable pins and tar data-filter checks. Set an explicit narrow loader binding to the verified tree's lib directory for EVERY3.14 invocation and its children (or perform an equivalently exact controlled installation at the compiled prefix). In the existing hosted runtime check retain CPython3.14.8/UCD16 assertions and record/require actual libpython and stdlib/extension paths from the verified tree. Do not run the archive setup.sh: its text force-upgrades pip from the network. No fake minor, UCD value or substitute interpreter.

**CG-F2 — P2: cleanup reserve excludes the kill grace, and command evidence lacks actual start/end/failure identity.** Workflow102 and317 subtract60s, then inner/outer GNU timeout can consume another10s kill grace; this does not leave the declared60s reserve. Subtract the applicable grace (plus existing small margin) before that unchanged reserve in both calculations. Preserve180s children/1800s original monotonic deadline and setup time already consumed. Command record147–155 retains only duration, not the planned actual UTC start/end and monotonic endpoints. Record those fixed fields alongside existing argv/raw/capture exits/allowance/log identity. The failure-only replacement356 discards all actual command identity; retain the last bounded fixed command/failure summary in that receipt (no raw input/source data or additional log campaign), so timeout/capture overflow/source mismatch can be distinguished without inventing a success.

**CG-F3 — P1: bound output assembly before copies and fail the job on assembly failure.** Workflow289–313 hashes and builds the full compressed archive before checking its16MiB limit;343–353 copies the archive/manifest/receipt/log family before aggregate stat validation. If this finalizer detects missing/oversize evidence,354–360 replaces it with FAIL_OR_UNKNOWN but exits zero as long as the tiny failure receipt exists, allowing a green generation job with failed artifact assembly. Preflight the fixed regular output/stat roster; use a capped compressed-output writer with budget reserved for manifest/receipt/command records/logs, then stat the complete family BEFORE copying into a fresh upload directory. The16MiB cap is the actual compressed/upload family cap: do NOT impose it on the legitimate uncompressed regex corpus (current preimages already total13.8MB and additive14 grows them). Preserve the explicit output roster per phase and exact hashes. Write the bounded failure-only receipt when assembly fails, then exit nonzero; always-upload may retain that tiny failure receipt. Publish no partial success family. No cap increase or truncation-as-success.

**CG-F4 — P2: Python README has false current publication status.** python/README.md:29–31 still says PyPI publication is not configured. Retain the old0.10.0 URL as explicitly historical rather than current native qualification, state the actual released0.10.2 GitHub/PyPI path is configured and published, and keep0.10.3 an unpublished/unqualified candidate until its own gates close. Do not imply0.10.2 supports Python3.14, infer universal platform support from Requires-Python, or rewrite historical receipts.

## Source conclusions retained for affected closure

The regex stage uses actual d502 table/name preimages, pinned canonical generator/re_tests/license/Unicode16 alias bytes, exact official archive and executable metadata, and a real runtime/UCD check. The incremental generator refuses already-extended table/name inputs, keeps the entire previous table prefix and previous name→codepoint/minor mappings, and emits genuine CPython-derived412 outcomes. The three independent generators preserve old11–13 oracle records/TSV rows while appending actual14 results; Rust consumers add V3_14 and exact four-profile counts without dropping old rows. Their new14-only CLI route does not claim to regenerate old frozen profiles. Original11–13 corpus/generator data remain untouched.

The three closed phases enforce reviewed regex output adoption before metamodel generation and both exact regex/metamodel root hash families before dependent generation. The metamodel phase emits only its actual11 files into a staging root; the dependent phase runs original check:metamodel/self before action-identity, Codegen checks and R3/boundaries. No migration accounted-companion exception is transplanted into Core main. Statuses are artifact-only, not installed/native/release evidence. Lock updates and actual emitted output adoption still require root review; there is no pre-filled qualification claim.

Distribution metadata/init/tests consistently select0.10.3 while semantic Core remains0.10.0. Requires-Python>=3.11,<3.15 and semantic specifier tests preserve11–14 admission and3.10/3.15 packaging refusal; native future-minor refusal stays. Version-selector/custody/sdist tests retain their actual failure controls. The six broad workflow diffs only add the two exact generation/public-proof branch ignores; tags, PR and other existing events/jobs are preserved. The action-runtime seventh exclusion is owned by the separate four-file slice.

Correct CG-F1–F4 together and review only their closure before the first bounded regex-artifact dispatch. No unreviewed tool execution, cap increase, installed qualification, Core publication, or SDK dependency adoption is accepted here.

## Exact reviewed23-path tuple

| Path | SHA-256 | Bytes |
| --- | --- | --- |
| .github/workflows/access-boundaries.yml | f05570c87773fcf9669c058d82989414ddef498fb228be91a4a1cd66fd47ac7d | 25980 |
| .github/workflows/actions.yml | 81140ba3bc3bf1f258f9dc48e65be22b592187c371506d15085876240f7c249b | 1471 |
| .github/workflows/core-python314-generation.yml | 72ca29db42b6cf579dee05de7735a8c5c31e0e7d495b6caa448ec955a7b22234 | 29422 |
| .github/workflows/python.yml | 3fc3dd139663a8e9994ea4fe1d28ba1efa79588d5a370f725af22323bf9a523a | 974 |
| .github/workflows/rust-core.yml | ef0678ca7f64b2b70db21a5b386c210c660864a29b1b2bd3ffdd3b8f6c066708 | 3259 |
| .github/workflows/rust-spike.yml | 9735589858797922b677b92b2c6faff240ed8453e01221e839268304e42e134d | 940 |
| .github/workflows/sql-containment.yml | 1cc4ad69baa2bc20b7e9cf2e42501038e8cf4e46dedc9f5fd6cc062cb4fe3e58 | 2140 |
| crates/umf-core/tests/python_regex_hex_independent.rs | 425147b2f3fde310a8d2579308b246e226792721716264bd5ee51ceea0c69e21 | 1761 |
| crates/umf-core/tests/python_regex_independent.rs | d19c3e61be17aad5fbc34193b0dd8643b9df3f30995e07b8b736bd1a2e184093 | 2686 |
| crates/umf-core/tests/python_regex_info_independent.rs | 77dfdffa38ed1ef623266331ce1b98f493bda092c0e864b170f6caf17ab0d0b9 | 2335 |
| crates/umf-core/tools/extend_python_re_314.py | 2063a74ae8e825c4cb7cc9fdde730f01eda3dc0f44d4ec5ae8a1384873c8c4b4 | 9688 |
| crates/umf-core/tools/generate_independent_python_re_boundaries.py | 14fd8e77bfeb91a05a222ae87337156569cd82a2c375f99e7e260098d2f35504 | 8891 |
| crates/umf-core/tools/generate_independent_python_re_hex.py | cfe76557ac8996fd0ab95b17d21852d9f59d50f820f981120b1022700dbebcb6 | 3537 |
| crates/umf-core/tools/generate_independent_python_re_info.py | 283c07014258892177758643e24ba5e9e3a49c6b355e821790d87fd102c49b9b | 4602 |
| python/README.md | 4832e4da1c8c41d0f97bff11bd143be5e47158c961c15449395b61f1d803519a | 5331 |
| python/pyproject.toml | b498b238d1c084f91efdc1375b4495fcea4c85ebb29154ada27c2e2977314fad | 1430 |
| python/src/umf/__init__.py | dc7dfb07f414068211402d0c478c359f0da810a6f60b2317dc5d012b721a4a13 | 1258 |
| python/tests/test_core.py | f9cdc2cd406a2c413b4d4531333ea76e9a393ef5a05760ea63bc8438750dd651 | 8921 |
| python/tests/test_distribution_artifact.py | e2bb987ed1e8a648607da3b95bed6b3d25401b5df007f668b64eeeab44f1cf94 | 28105 |
| python/tests/test_python_artifact_custody.py | 88239260e336349072c78a5263975ea0d3879bee5dad3d66c268fadeea1d325a | 4848 |
| python/tests/test_python_artifact_version.py | d3a9c59e90faebcab133511e5aad3c1d649f97896406ed41ea44a3cd902f08a1 | 3740 |
| python/tests/test_python_sdist.py | 710b13fa53bacb7a36575d4baf5a7217c2de99b5d47b59f64916158f175040e3 | 14516 |
| qualification-inputs/core-python314-generation.json | 530b975b665613b6ce06c81d7445560522224077b969b870c18036d9e4060de3 | 4452 |
