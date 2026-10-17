"""Closed original Spark HLL++ metadata admission; no statistical guarantee added."""

from ..native_program import canonical_json
from ..reviewed import ReadBuildError

SPARK_HLL = {
    "algorithm": "HyperLogLog++",
    "backend": "Apache Spark",
    "backendVersion": "4.0.1",
    "documentation": "https://spark.apache.org/docs/4.0.1/api/sql/index.html#approx_count_distinct",
    "error": {"hardBound": False, "kind": "relative-standard-deviation", "value": "0.05"},
}


def require_approximate_profile(program: object, profile: str | None) -> None:
    """Preserve the owner descriptor, including its explicit absence of a hard bound."""
    reason = "WEFT_BLOCKED: WR-A10 qualified original approximate output profile required"
    if profile != "spark-delta4" or type(program) is not dict or program.get("version") != "weft.raw-read/0.1" or program.get("target") != profile:
        raise ReadBuildError(reason)
    outputs = program.get("outputs")
    if type(outputs) is not list or not outputs:
        raise ReadBuildError(reason)
    found = False
    for output in outputs:
        if type(output) is not dict:
            raise ReadBuildError(reason)
        if "approximate" not in output and "approximation" not in output:
            continue
        if output.get("approximate") is not True or output.get("carrier") != "integer" or output.get("nullable") is not False or canonical_json(output.get("approximation")) != canonical_json(SPARK_HLL):
            raise ReadBuildError(reason)
        found = True
    if not found:
        raise ReadBuildError(reason)
