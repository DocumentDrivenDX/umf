# Executable formal-analysis sources

Start with [analysis findings and limits](../../../../04-build/evidence/actions-formal-analysis.md).

- semantics.py: independent SMT relations and concrete relational/access witnesses.
- Commands.tla / run_tlc.py: phased finite safety/progress model, mutations and positive witnesses.
- history_oracle.py: independent real-time sequentialization checker for the original synthetic PG executor.

Result JSON and logs are exercising evidence; a counterexample run is expected
only when its named mutation or negative reachability assertion is violated.
No model/tool pass implies public UMF or production executor implementation.
