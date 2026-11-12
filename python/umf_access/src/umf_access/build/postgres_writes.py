# SPDX-License-Identifier: MIT OR Apache-2.0
"""Issue fixed PostgreSQL write programs through the original Weft compiler."""

from __future__ import annotations

from umf_access.unified.operation_values import canonical, loads


def prepare_postgres_writes(
    bundle: dict, binding: dict, operations: tuple[str, ...]
) -> bytes:
    """Prepare single-row commands with required, unconstrained text parameters."""
    from umf_codegen import verify_table_deployment
    from weft import prepare_table_operation_module_json

    bundle = verify_table_deployment(bundle)
    source = bundle["source"]["utf8"]
    module = bundle["configuration"]["module"]
    lifecycle = {
        "version": "umf.table-lifecycle/0.1",
        "module": module,
        "configurationDigest": bundle["configurationDigest"],
        "deploymentDigest": bundle["bundleDigest"],
    }
    if (
        bundle["source"]["format"] != "json"
        or binding.get("modelJson") != source
        or binding.get("modelSha256") != bundle["sourceDigest"]
        or binding.get("schema") != bundle["configuration"]["schema"]
        or binding.get("nativeLifecycle") != lifecycle
        or not operations
        or len(set(operations)) != len(operations)
    ):
        raise ValueError("prepared write source differs")
    owner = next(item for item in loads(source)["modules"] if item["id"] == module)
    tables = owner["extensions"]["umf.tables"]
    commands = {command["id"]: command for command in tables["commands"]}
    fields = {
        field["id"]: field for field in owner["elements"] if field["kind"] == "field"
    }
    compiler = prepare_table_operation_module_json(
        canonical(
            {
                "version": "weft.table-operation-module/0.1",
                "target": "postgresql18",
                "module": module,
                "binding": binding,
            }
        )
    )
    programs = {}
    for name in operations:
        command = commands[name]
        body = command["body"]
        if (
            body["kind"] not in {"insert", "update", "delete", "upsert"}
            or body["maxRows"] != 1
            or "batch" in command
            or command["replay"] != "caller-key-required"
            or command["consistency"] != "transaction"
        ):
            raise ValueError("unsupported prepared write declaration")
        inputs = {}
        for param in command["parameters"]:
            ref = param["field"]
            field = fields[ref["element"]]
            if (
                set(param) != {"id", "field"}
                or ref["module"] != module
                or field
                != {
                    "id": ref["element"],
                    "kind": "field",
                    "scalarType": "string",
                    "cardinality": "one",
                    "nullability": "required",
                    "extensions": {},
                }
                or not any(
                    column["field"] == ref and column["nativeType"] == {"kind": "text"}
                    for table in tables["tables"]
                    for column in table["columns"]
                )
            ):
                raise ValueError("unsupported prepared write parameter")
            inputs[param["id"]] = {"string": "umf-build-probe"}
        program = loads(
            compiler.prepare(name).bind_json(
                canonical(
                    {
                        "call": {"kind": "single", "inputs": inputs},
                        "idempotencyKey": "0" * 64,
                    }
                )
            )
        )
        if (
            program.get("status") != "compiled"
            or program.get("nativeInputs")
            != [{key: item["string"] for key, item in inputs.items()}]
            or any(
                slot["source"]["kind"] not in {"input", "literal"}
                or (
                    slot["source"]["kind"] == "input"
                    and (
                        slot["carrier"] != "string"
                        or slot["nullable"]
                        or slot["source"]["parameter"] not in inputs
                    )
                )
                for slot in program["parameterSources"]
            )
            or {
                slot["source"]["parameter"]
                for slot in program["parameterSources"]
                if slot["source"]["kind"] == "input"
            }
            != inputs.keys()
        ):
            raise ValueError("unsupported prepared write compiler result")
        del program["nativeInputs"], program["idempotencyKey"]
        programs[name] = program
    return canonical(
        {
            "version": "umf.postgres-write/1",
            "pins": {
                "source": bundle["sourceDigest"],
                "bundle": bundle["bundleDigest"],
                "configuration": bundle["configurationDigest"],
            },
            "operations": programs,
        }
    ).encode()


def main() -> None:
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deployment_bundle", type=Path)
    parser.add_argument("weft_binding", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--operation", action="append", required=True)
    args = parser.parse_args()
    args.output.write_bytes(
        prepare_postgres_writes(
            loads(args.deployment_bundle.read_bytes()),
            loads(args.weft_binding.read_bytes()),
            tuple(args.operation),
        )
    )


if __name__ == "__main__":
    main()
