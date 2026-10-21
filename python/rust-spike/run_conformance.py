# SPDX-License-Identifier: MIT OR Apache-2.0
"""Run conformance cases against the installed native Python wheel only."""
import json
import resource
import os
import subprocess
import sys
import time

import _umf_rust_spike as binding


def fail(message):
    raise AssertionError(message)


def call(request):
    return json.loads(binding.run(json.dumps(request, separators=(",", ":"))))


def units(text):
    encoded = text.encode("utf-16-le", "surrogatepass")
    return [encoded[index] | (encoded[index + 1] << 8) for index in range(0, len(encoded), 2)]


def main(path):
    with open(path, encoding="utf-8") as source:
        payload = json.load(source)
    expected = payload["expected"]
    results = []
    generation_index = 0
    for index, request in enumerate(payload["requests"]):
        actual = call(request)
        op = request["op"]
        if op == "source-roundtrip":
            if actual.get("ok") is not True or actual.get("sourceUnits") != request["sourceUnits"]:
                fail(f"source code units changed in case {index}")
        elif op == "validate-record":
            if request.get("expectedCode"):
                if actual.get("code") != request["expectedCode"] or actual.get("complete") is not False:
                    fail(f"semantic operation accepted invalid UTF-16 source in case {index}: {actual}")
                results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code")})
                continue
            if actual.get("code") == "DUPLICATE_JSON_KEY":
                if actual.get("complete") is not False:
                    fail("duplicate-key source was treated as complete")
                results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code")})
                continue
            expected_valid = expected["unsupportedValidation"]["valid"] if request["model"]["umf"] != "0.10.0" else expected["validation"]["valid"]
            if actual.get("tsComparable", {}).get("valid") != expected_valid:
                fail(f"TypeScript structural valid projection differs in case {index}: {actual}")
            if actual.get("valid") is not expected_valid:
                fail(f"Rust structural acceptance differs in case {index}: {actual}")
            if expected_valid and actual.get("complete") is not False:
                fail("bounded structural validation claimed completeness")
            if expected_valid and not any("INCOMPLETE" in d.get("code", "") for d in actual.get("diagnostics", [])):
                fail("bounded structural validation omitted its incompleteness diagnostic")
            if expected_valid and actual.get("retainedModel") != request["model"]:
                fail("unknown extension model content changed")
        elif op == "generate-keyed-record":
            expected_generation = expected["generationCases"][generation_index]
            generation_index += 1
            if expected_generation["caseName"] == "unknown-record-extension":
                if actual.get("code") != "UNSUPPORTED_RECORD" or actual.get("complete") is not False:
                    fail(f"generator did not refuse unknown selected Record extensions: {actual}")
                results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code")})
                continue
            if expected_generation["caseName"].startswith(("conservative-field-name-", "conservative-record-name-")):
                if actual.get("code") != "UNSUPPORTED_RECORD" or actual.get("complete") is not False:
                    fail(f"Rust did not conservatively refuse generated name {expected_generation['caseName']}: {actual}")
                results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code"), "tsAccepted": expected_generation["accepted"], "qualification": "conservative refusal outside exact TypeScript normalization subset"})
                continue
            if expected_generation["accepted"]:
                if actual.get("ok") is not True:
                    fail(f"Rust refused TypeScript-accepted generation case {expected_generation['caseName']}: {actual}")
            else:
                if actual.get("ok") is not False or actual.get("complete") is not False:
                    fail(f"Rust accepted TypeScript-refused generation case {expected_generation['caseName']}: {actual}")
                results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code"), "tsError": expected_generation.get("errorCode")})
                continue
            if actual.get("pythonSource") != expected_generation["pythonSource"]:
                fail("key class block differs from current TypeScript generator")
            if actual.get("sourceDigest") != expected_generation["sourceDigest"]:
                fail("generator source digest differs from current TypeScript generator")
            if actual.get("complete") is not False:
                fail("single key class generation claimed full generator completeness")
        else:
            fail(f"unknown test operation {op}")
        results.append({"index": index, "op": op, "ok": actual.get("ok"), "code": actual.get("code")})

    observed = []
    callback_request = payload["callbackRequest"]
    callback_result = json.loads(binding.run_with_validator(
        json.dumps(callback_request, separators=(",", ":")),
        lambda source: observed.append(units(source)),
    ))
    original_units = callback_request["sourceUnits"]
    if observed != [original_units] or callback_result.get("complete") is True:
        fail("validator callback did not receive original source code units")

    validation_callback = payload["validationCallbackRequest"]
    validation_received = []
    validation_result = json.loads(binding.run_with_validator(
        json.dumps(validation_callback, separators=(",", ":")),
        lambda source: validation_received.append(units(source)),
    ))
    if validation_received != [validation_callback["sourceUnits"]] or validation_result.get("valid") is not True or validation_result.get("complete") is not False:
        fail(f"trusted callback did not run through actual structural validation: {validation_result}")

    try:
        thrown_result = binding.run_with_validator(
            json.dumps(payload["throwingCallbackRequest"], separators=(",", ":")),
            lambda _source: (_ for _ in ()).throw(RuntimeError("R1 callback sentinel")),
        )
    except RuntimeError as error:
        if str(error) != "R1 callback sentinel":
            fail(f"callback exception identity/message changed: {error!r}")
    else:
        callback_error = json.loads(thrown_result)
        if callback_error.get("code") != "CALLBACK_ERROR" or callback_error.get("complete") is not False:
            fail(f"callback exception became a successful result: {callback_error}")

    reentrant_request = payload["validationCallbackRequest"]
    nested = []
    def reentrant(source):
        nested.append(units(source))
        nested_result = call({"op": "source-roundtrip", "sourceUnits": [ord("n"), ord("e"), ord("s"), ord("t"), ord("e"), ord("d")]})
        if nested_result.get("sourceUnits") != [ord("n"), ord("e"), ord("s"), ord("t"), ord("e"), ord("d")]:
            fail("nested binding call failed")
    reentrant_result = json.loads(binding.run_with_validator(
        json.dumps(reentrant_request, separators=(",", ":")), reentrant,
    ))
    if nested != [reentrant_request["sourceUnits"]] or reentrant_result.get("valid") is not True or reentrant_result.get("complete") is not False:
        fail("callback reentrancy or source context changed")

    # This callback is polled by Rust at each bounded-work step; it is distinct
    # from the deterministic options.cancelAtStep test below.
    polls = []
    def cancel_ongoing_work():
        polls.append(None)
        return len(polls) >= 3
    host_cancel = json.loads(binding.run_with_control(
        json.dumps({"op": "validate-record", "model": json.loads(payload["modelText"]),
                    "sourceUnits": units(payload["modelText"]), "record": {"identity": {"module": "m", "element": "Item"}, "values": []}}),
        cancel_ongoing_work,
    ))
    if host_cancel.get("code") != "CANCELLED" or host_cancel.get("complete") is not False or len(polls) != 3:
        fail(f"host cancellation was not polled during bounded Rust work: {host_cancel}, polls={len(polls)}")

    budget = call({"op": "validate-record", "model": json.loads(payload["modelText"]),
                   "sourceUnits": units(payload["modelText"]), "record": {"identity": {"module": "m", "element": "Item"}, "values": []},
                   "options": {"cancelAtStep": 2}})
    if budget.get("code") != "CANCELLED" or budget.get("complete") is True:
        fail(f"mid-work cancellation did not refuse as incomplete: {budget}")
    capacity = call({"op": "source-roundtrip", "sourceUnits": [1, 2, 3, 4], "options": {"capacity": 3}})
    if capacity.get("code") != "CAPACITY":
        fail(f"capacity boundary was not enforced: {capacity}")
    step_budget = call({"op": "validate-record", "model": json.loads(payload["modelText"]),
                        "sourceUnits": units(payload["modelText"]), "record": {"identity": {"module": "m", "element": "Item"}, "values": []},
                        "options": {"maxSteps": 1}})
    if step_budget.get("code") != "CAPACITY" or step_budget.get("complete") is True:
        fail(f"mid-work step budget did not refuse as incomplete: {step_budget}")
    deadline = call({"op": "source-roundtrip", "sourceUnits": [65], "options": {"deadlineUnixMs": 0}})
    if deadline.get("code") != "DEADLINE" or deadline.get("complete") is True:
        fail(f"expired deadline did not refuse: {deadline}")

    timed = {"op": "source-roundtrip", "sourceUnits": [65, 66, 67]}
    count = 10000
    started = time.perf_counter_ns()
    for _ in range(count):
        call(timed)
    elapsed_ns = time.perf_counter_ns() - started
    probe = "import _umf_rust_spike; _umf_rust_spike.run(" + repr(json.dumps(timed, separators=(",", ":"))) + ")"
    cold_start_ms = []
    child_env = dict(os.environ, PATH="/usr/bin:/bin", PYTHONDONTWRITEBYTECODE="1")
    for _ in range(10):
        cold_started = time.perf_counter_ns()
        subprocess.run([sys.executable, "-c", probe], env=child_env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cold_start_ms.append((time.perf_counter_ns() - cold_started) / 1_000_000)
    cold_start_ms.sort()
    print(json.dumps({"status": "pass", "python": sys.version, "binding": binding.__file__, "engineVersion": binding.ENGINE_VERSION, "cases": results,
                      "callbacks": {"rawSource": {"expectedUnits": original_units, "receivedUnits": observed[0], "exact": observed == [original_units]},
                                   "validationSource": {"unitCount": len(validation_callback["sourceUnits"]), "exact": validation_received == [validation_callback["sourceUnits"]]},
                                   "reentrantValidation": {"unitCount": len(reentrant_request["sourceUnits"]), "exact": nested == [reentrant_request["sourceUnits"]]}},
                      "measurement": {"operation": "source-roundtrip", "calls": count, "elapsedNs": elapsed_ns,
                                      "meanMicroseconds": elapsed_ns / count / 1000,
                                      "callsPerSecond": count * 1e9 / elapsed_ns,
                                      "coldProcessSamples": len(cold_start_ms), "coldImportAndOneCallMedianMs": cold_start_ms[4],
                                      "coldImportAndOneCallMinMs": cold_start_ms[0], "coldImportAndOneCallMaxMs": cold_start_ms[-1],
                                      "peakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                                      "note": "Throughput includes JSON encoding/decoding and native engine work; cold start includes fresh Python process, extension import, and one call. Not an isolated FFI-only estimate."}}, sort_keys=True))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: run_conformance.py VECTORS.json")
    main(sys.argv[1])
