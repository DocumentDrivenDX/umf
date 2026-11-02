# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-independent SEC projection smoke for an installed umf-core wheel."""

from __future__ import annotations

import json
import os
import platform
import struct
import subprocess
import sys
import sysconfig
from pathlib import Path

import umf


def _facts(observations: str) -> str:
    return (
        '{"cik":320193,"facts":{"us-gaap":{"Cash":{"label":"\\ud800",'
        '"future":{"retained":true},"units":{"USD":[' + observations + ']}}}}}'
    )


def _frame(text: str, source_id: str) -> bytes:
    source = text.encode("utf-16-le", "surrogatepass")
    identity = source_id.encode("utf-16-le", "surrogatepass")
    return (
        b"UMFSEC2\0"
        + struct.pack("<I", len(source) // 2)
        + source
        + struct.pack("<I", len(identity) // 2)
        + identity
    )


def _boundary_facts(label_units: int, extra_units: int, *, late_invalid: bool = False) -> str:
    raw = (
        '{"cik":"1","facts":{"t":{"C":{"label":"'
        + "x" * label_units
        + '","units":{"USD":['
    )
    raw += ",".join(
        '{"val":0,"extra":"' + "y" * extra_units + '"}'
        if index == 899
        else '{"val":0}'
        for index in range(900)
    )
    if late_invalid:
        raw += ",null"
    return raw + "]}}}}}"


def _output_cap_checks(cli: Path) -> dict[str, object]:
    cap = 32 * 1024 * 1024
    source_id = "cap-boundary"
    base = umf.project_sec_company_facts(_boundary_facts(0, 0), source_id)
    base_units = len(base.encode("utf-16-le", "surrogatepass")) // 2
    label_units = (cap - 1 - base_units) // 900
    remainder = cap - 1 - base_units - 900 * label_units
    python_result: dict[str, object] = {}
    cli_result: dict[str, object] = {}

    for offset, label in ((0, "capMinusOne"), (1, "exactCap")):
        request = _boundary_facts(label_units, remainder + offset)
        output = umf.project_sec_company_facts(request, source_id)
        output_units = len(output.encode("utf-16-le", "surrogatepass")) // 2
        expected = cap - 1 + offset
        assert output_units == expected, (label, output_units, expected)
        python_result[label] = output_units

        cli_run = subprocess.run(
            [str(cli), "sec", "company-facts", "--stdin-utf16le"],
            input=_frame(request, source_id),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=180,
        )
        assert cli_run.returncode == 0, cli_run.stderr.decode("utf-8", "replace")
        assert cli_run.stderr == b""
        cli_output = cli_run.stdout.decode("utf-8").rstrip("\n")
        assert len(cli_output.encode("utf-16-le")) // 2 == expected
        cli_result[label] = expected

    request = _boundary_facts(label_units, remainder + 2)
    expected_limit = "SEC projection output limit exceeded"
    try:
        umf.project_sec_company_facts(request, source_id)
    except umf.SecProjectionError as error:
        assert (error.name, error.code, error.path, error.message) == (
            "UmfError", "LIMIT", "", expected_limit
        )
        python_result["capPlusOne"] = error.message
    else:
        raise AssertionError("Python projection accepted output above the cap")
    cli_run = subprocess.run(
        [str(cli), "sec", "company-facts", "--stdin-utf16le"],
        input=_frame(request, source_id),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=180,
    )
    assert cli_run.returncode != 0 and cli_run.stdout == b""
    cli_error = json.loads(cli_run.stderr)
    assert (cli_error["name"], cli_error["code"], cli_error["path"], cli_error["message"]) == (
        "UmfError", "LIMIT", "", expected_limit
    )
    cli_result["capPlusOne"] = cli_error["message"]

    late_invalid = _boundary_facts(40_000, 0, late_invalid=True)
    try:
        umf.project_sec_company_facts(late_invalid, source_id)
    except Exception as error:
        actual_name = getattr(error, "name", type(error).__name__)
        actual_message = getattr(error, "message", str(error))
        assert (actual_name, actual_message) == ("Error", "Expected SEC object")
        python_result["lateInvalid"] = actual_message
    else:
        raise AssertionError("Python projection accepted a late invalid observation")
    cli_run = subprocess.run(
        [str(cli), "sec", "company-facts", "--stdin-utf16le"],
        input=_frame(late_invalid, source_id),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=180,
    )
    assert cli_run.returncode != 0 and cli_run.stdout == b""
    cli_error = json.loads(cli_run.stderr)
    assert (cli_error["name"], cli_error["message"]) == ("Error", "Expected SEC object")
    cli_result["lateInvalid"] = cli_error["message"]
    return {"capUtf16Units": cap, "python": python_result, "cli": cli_result}


def _expect_error(
    call, *, name: str, message: str | None = None, error_type=umf.SecProjectionError
) -> None:
    try:
        call()
    except error_type as error:
        actual_name = getattr(error, "name", type(error).__name__)
        actual_message = getattr(error, "message", str(error))
        assert actual_name == name, (actual_name, actual_message)
        if message is not None:
            assert actual_message == message, actual_message
        return
    raise AssertionError("SEC projection unexpectedly accepted a refusal case")


def _memory_child() -> None:
    import resource

    observations = ",".join(
        '{"val":9007199254740993.0100,"accn":"A000000000000000",'
        '"end":"2026-01-01","future":"retained"}'
        for _ in range(8_000)
    )
    request = _facts(observations)
    result = umf.project_sec_company_facts(request, "memory-probe")
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_bytes = peak if sys.platform == "darwin" else peak * 1024
    output_units = len(result.encode("utf-16-le", "surrogatepass")) // 2
    assert output_units <= 32 * 1024 * 1024
    print(
        json.dumps(
            {
                "inputUtf16Units": len(request.encode("utf-16-le", "surrogatepass")) // 2,
                "outputUtf16Units": output_units,
                "peakRssBytes": peak_bytes,
                "observationCount": 8_000,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )


def main() -> None:
    if sys.argv[1:] == ["--memory-child"]:
        _memory_child()
        return

    package_root = Path(umf.__file__).resolve().parent
    assert package_root.is_relative_to(Path(sysconfig.get_path("platlib")).resolve())
    assert umf.project_sec_company_facts.__module__ == "umf.rust_sec_projection"
    assert umf.project_sec_submissions.__module__ == "umf.rust_sec_projection"
    assert umf.rust_sec_projection.profile_version() == "umf-sec-projection/2.0.0"

    facts = _facts(
        '{"val":9007199254740993.0100,"accn":"A","future":{"x":1}},'
        '{"val":9007199254740993.0100,"accn":"A"},{},{"val":null},{"val":0}'
    )
    facts_text = umf.project_sec_company_facts(facts, "source\ud800")
    facts_rows = json.loads(facts_text)
    assert [row["value"] for row in facts_rows] == [
        "9007199254740993.0100",
        "9007199254740993.0100",
        None,
        None,
        "0",
    ]
    assert [row["value_state"] for row in facts_rows] == [
        "present", "present", "absent", "null", "present"
    ]
    assert "9007199254740993.0100" in facts_text
    assert "\\ud800" in facts_text
    assert json.loads(facts_rows[0]["native_json"])["future"] == {"x": 1}
    concept = json.loads(facts_rows[0]["concept_json"])
    assert concept["future"] == {"retained": True}
    assert concept["label"] == "\ud800"

    submissions = (
        '{"cik":"0000320193","name":"Synthetic","tickers":["SYN"],'
        '"exchanges":["Synthetic"],"filings":{"recent":{'
        '"accessionNumber":["0000320193-26-000001"],"filingDate":["2026-01-02"],'
        '"reportDate":["2026-01-01"],"form":["8-K"],'
        '"primaryDocument":["xsl/test.xml"],"items":["2.01"],'
        '"future":["retained"]}}}'
    )
    submissions_text = umf.project_sec_submissions(submissions, "source\ud800")
    assert "0000320193-26-000001" in submissions_text
    assert "\\ud800" in submissions_text
    assert "retained" in submissions_text

    _expect_error(
        lambda: umf.project_sec_submissions(b"{}", "source"),
        name="TypeError",
        message="input must be JSON text",
        error_type=TypeError,
    )
    _expect_error(lambda: umf.project_sec_company_facts("{", 3), name="UmfError")
    _expect_error(
        lambda: umf.project_sec_company_facts("[]", 3),
        name="Error",
        message="Expected SEC object",
    )
    _expect_error(
        lambda: umf.project_sec_company_facts('{"cik":1,"facts":{}}', 3),
        name="Error",
        message="Invalid SEC source identity",
    )
    _expect_error(
        lambda: umf.project_sec_company_facts(_facts('{"val":"1"}'), "source"),
        name="Error",
        message="Expected SEC numeric token",
    )
    _expect_error(
        lambda: umf.project_sec_company_facts(
            '{"cik":1,"cik":2,"facts":{}}', "source"
        ),
        name="UmfError",
    )
    _expect_error(
        lambda: umf.project_sec_company_facts(" " * 4_000_001, "source"),
        name="UmfError",
        message="Native JSON exceeds text limit",
    )

    cli = package_root / "_bin" / ("umf.exe" if os.name == "nt" else "umf")
    assert cli.is_file(), cli
    cli_run = subprocess.run(
        [str(cli), "sec", "company-facts", "--stdin-utf16le"],
        input=_frame(facts, "source\ud800"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert cli_run.returncode == 0, cli_run.stderr.decode("utf-8", "replace")
    assert cli_run.stderr == b""
    assert cli_run.stdout.decode("utf-8").rstrip("\n") == facts_text

    bad_frame = subprocess.run(
        [str(cli), "sec", "company-facts", "--stdin-utf16le"],
        input=b"UMFSEC2\0",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert bad_frame.returncode != 0 and bad_frame.stdout == b""
    assert set(json.loads(bad_frame.stderr)) == {"name", "code", "path", "message"}

    source_id_precedence = {}
    for label, text in (("malformed-input", "{"), ("valid-input", facts)):
        try:
            umf.project_sec_company_facts(text, "s" * 1025)
        except umf.SecProjectionError as error:
            python_error = {
                "name": error.name,
                "code": error.code,
                "path": error.path,
                "message": error.message,
            }
        else:
            raise AssertionError("overlong source ID was accepted by Python")
        cli_run = subprocess.run(
            [str(cli), "sec", "company-facts", "--stdin-utf16le"],
            input=_frame(text, "s" * 1025),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert cli_run.returncode != 0 and cli_run.stdout == b""
        cli_error = json.loads(cli_run.stderr)
        assert python_error == cli_error, (label, python_error, cli_error)
        source_id_precedence[label] = cli_error
    assert source_id_precedence["valid-input"]["message"] == "Invalid SEC source identity"
    assert source_id_precedence["malformed-input"]["message"] != "Invalid SEC source identity"

    output_cap = _output_cap_checks(cli)

    memory = subprocess.run(
        [sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--memory-child"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=180,
    )
    assert memory.returncode == 0, memory.stderr.decode("utf-8", "replace")
    memory_result = json.loads(memory.stdout)
    print(
        json.dumps(
            {
                "status": "passed",
                "profile": umf.rust_sec_projection.profile_version(),
                "python": platform.python_version(),
                "platform": platform.platform(),
                "machine": platform.machine(),
                "installedPackage": str(package_root),
                "cli": "passed",
                "sourceIdPrecedence": source_id_precedence,
                "peakMemory": memory_result,
                "outputCap": output_cap,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
