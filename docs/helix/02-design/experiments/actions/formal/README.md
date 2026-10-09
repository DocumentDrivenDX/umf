# Executable formal-analysis sources

Start with [analysis findings and limits](../../../../04-build/evidence/actions-formal-analysis.md).

- semantics.py: independent SMT relations and concrete relational/access witnesses.
- Commands.tla / run_tlc.py: phased finite safety/progress model, mutations and positive witnesses.
- history_oracle.py: independent real-time sequentialization checker for the original synthetic PG executor.

Result JSON and logs are exercising evidence; a counterexample run is expected
only when its named mutation or negative reachability assertion is violated.
No model/tool pass implies public UMF or production executor implementation.

## Reproduce without the historical temporary directory

From the repository root, use Python 3 with venv support:

```sh
python3 scripts/actions-docs/reproduce-formal.py
```

This installs z3-solver 4.15.3.0 in an owned `.cache/actions-formal-reproduction/venv`, copies the original model sources into that cache and runs SMT there. The original certified sources/results remain unchanged. Installing tools requires network access; the resulting analysis is local.

For TLC, Docker must have the recorded replay image `sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249` (see the certificate and docker/core-replay). Run the same command with `--tlc`. It downloads the official TLC 1.7.4 jar, verifies the original published artifact digest, and runs the original finite configurations in the immutable image with no network. Source/output hashes and tooling versions are recorded in the cache manifest. The runner copy changes only tool location and image selection, not properties or model bounds.

Missing runtime, incomplete state search or a wrong expected counterexample fails. This reproduces bounded design experiments; it does not rerun the actual PostgreSQL refinement or certify a new release. Original experiment SQL histories and actual implementation witnesses remain separately documented in their evidence.
