#!/usr/bin/env python3
"""Validate NDJSON Pack Tools output, generated Python and representative CRUD."""
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib
import json
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path


def safe_pack_dir(root: Path, pack_id: str, version: str) -> Path:
    label = re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{pack_id}@{version}").strip("._") or "pack"
    digest = hashlib.sha256(f"{pack_id}@{version}".encode()).hexdigest()[:10]
    return root / f"{label}-{digest}"


def write_files(base: Path, files: list[dict]) -> list[Path]:
    written: list[Path] = []
    seen: set[str] = set()
    for item in files:
        path = item.get("path")
        content = item.get("text")
        if not isinstance(path, str) or not isinstance(content, str):
            raise ValueError("Generated file lacks a string path or text")
        parts = path.split("/")
        if not parts or any(part in ("", ".", "..") for part in parts) or "\\" in path or path.startswith("/"):
            raise ValueError(f"Unsafe generated file path: {path!r}")
        if path in seen:
            raise ValueError(f"Duplicate generated path: {path}")
        seen.add(path)
        data = content.encode("utf-8")
        if hashlib.sha256(data).hexdigest() != item.get("sha256"):
            raise ValueError(f"Generated file hash mismatch: {path}")
        destination = base.joinpath(*parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        written.append(destination)
    return written


def sample_value(column, index: int):
    from sqlalchemy import Boolean, Date, DateTime, Float, Integer, Numeric, String

    column_type = column.type
    if isinstance(column_type, Boolean):
        return True
    if isinstance(column_type, Integer):
        return index + 1
    if isinstance(column_type, Numeric):
        return Decimal("1")
    if isinstance(column_type, Float):
        return 1.25
    if isinstance(column_type, DateTime):
        return datetime(2024, 1, 2, 3, 4, 5)
    if isinstance(column_type, Date):
        return date(2024, 1, 2)
    if isinstance(column_type, String):
        return f"pack-tools-smoke-{index}"
    raise TypeError(f"No deterministic CRUD fixture for SQLAlchemy type {column_type!r}")


def validate_sqlalchemy(pack_dirs: list[Path], records: list[dict], requests: list[dict]) -> dict:
    try:
        import sqlalchemy
        from sqlalchemy import create_engine, inspect
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.orm import Session
        from sqlalchemy.schema import CreateTable
    except ImportError as error:
        return {"available": False, "reason": str(error), "metadata_modules": 0, "crud_smokes": []}
    if int(sqlalchemy.__version__.split(".", 1)[0]) < 2:
        raise RuntimeError(f"SQLAlchemy 2.x is required; found {sqlalchemy.__version__}")

    metadata_modules = 0
    candidates: dict[int, list[tuple[Path, object, object, object]]] = {1: [], 2: []}
    package_by_dir: dict[Path, str] = {}
    emitted_composite: set[tuple[str, str]] = set()
    for pack_dir, result in zip(pack_dirs, records):
        orm_file = next((file for file in result["files"] if file.get("kind") == "orm" and file["path"].endswith("/models.py")), None)
        if not orm_file:
            continue
        package = orm_file["path"].split("/", 1)[0]
        package_by_dir[pack_dir] = package
        sys.path.insert(0, str(pack_dir))
        try:
            models = importlib.import_module(f"{package}.models")
            base = models.Base
            metadata_modules += 1
            for table in base.metadata.sorted_tables:
                compiled = str(CreateTable(table).compile(dialect=postgresql.dialect()))
                if "CREATE TABLE" not in compiled or not compiled.rstrip().endswith(")"):
                    raise AssertionError(f"PostgreSQL DDL did not compile for {table.fullname}")
                if len(table.primary_key.columns) == 2:
                    emitted_composite.add((result["pack"]["id"], table.name))
            crud_file = next((file for file in result["files"] if file.get("kind") == "crud" and file["path"].endswith("/crud.py")), None)
            if crud_file:
                crud = importlib.import_module(f"{package}.crud")
                for model in base.__subclasses__():
                    table = inspect(model).local_table
                    pk = list(table.primary_key.columns)
                    if len(pk) not in candidates or not any(column.name not in {key.name for key in pk} for column in table.columns):
                        continue
                    create = getattr(crud, f"create_{model.__name__.lower()}", None)
                    if create:
                        candidates[len(pk)].append((pack_dir, model, crud, base))
        finally:
            sys.path.remove(str(pack_dir))

    expected_composite = set()
    for request, result in zip(requests, records):
        for source in request.get("sources", []):
            if source.get("schemaFormat") != "tablespec":
                continue
            table_spec = json.loads(source["text"])
            if len(table_spec.get("primary_key", [])) == 2:
                expected_composite.add((request["pack"]["id"], table_spec["table_name"]))
    missing_composite = expected_composite - emitted_composite
    if missing_composite:
        raise AssertionError(f"Declared composite-key CRUD models were not generated: {sorted(missing_composite)}")

    smokes = []
    for key_width, label in ((1, "single"), (2, "composite")):
        if not candidates[key_width]:
            smokes.append({"kind": label, "status": "unavailable", "reason": "No generated keyed table with mutable fields"})
            continue
        pack_dir, model, _, base = candidates[key_width][0]
        package = package_by_dir[pack_dir]
        sys.path.insert(0, str(pack_dir))
        try:
            crud = importlib.import_module(f"{package}.crud")
            suffix = model.__name__.lower()
            schema_map = {
                table.schema: None
                for table in base.metadata.tables.values()
                if table.schema is not None
            }
            engine = create_engine(
                "sqlite+pysqlite:///:memory:",
                execution_options={"schema_translate_map": schema_map},
            )
            base.metadata.create_all(engine)
            with Session(engine) as session:
                values = {column.name: sample_value(column, index) for index, column in enumerate(model.__table__.columns)}
                create = getattr(crud, f"create_{suffix}")
                try:
                    create(session, {**values, "__unknown_pack_tools_field__": "<refuse>"})
                except ValueError:
                    pass
                else:
                    raise AssertionError("CRUD create silently accepted an unknown field")
                created = create(session, values)
                key = {column.name: values[column.name] for column in model.__table__.primary_key.columns}
                read_function = getattr(crud, f"read_{suffix}")
                try:
                    read_function(session, {})
                except ValueError:
                    pass
                else:
                    raise AssertionError("CRUD read accepted a missing primary key")
                try:
                    read_function(session, {**key, "__unknown_pack_tools_key__": "<refuse>"})
                except ValueError:
                    pass
                else:
                    raise AssertionError("CRUD read accepted an extra primary key field")
                if key_width > 1:
                    partial_key = dict(list(key.items())[:-1])
                    try:
                        read_function(session, partial_key)
                    except ValueError:
                        pass
                    else:
                        raise AssertionError("Composite CRUD read accepted a partial primary key")
                read = read_function(session, key)
                if read is None:
                    raise AssertionError(f"{label} key did not read the created row")
                listed = getattr(crud, f"list_{suffix}")(session, limit=10, offset=0)
                if not listed:
                    raise AssertionError(f"{label} list did not return the created row")
                mutable = next(column for column in model.__table__.columns if column.name not in key)
                try:
                    getattr(crud, f"update_{suffix}")(session, key, {next(iter(key)): "<refuse>"})
                except ValueError:
                    pass
                else:
                    raise AssertionError("CRUD update accepted a primary-key mutation")
                updated = getattr(crud, f"update_{suffix}")(session, key, {mutable.name: sample_value(mutable, 99)})
                if updated is None:
                    raise AssertionError(f"{label} update did not return the row")
                if not getattr(crud, f"delete_{suffix}")(session, key):
                    raise AssertionError(f"{label} delete did not find the row")
                if read_function(session, key) is not None:
                    raise AssertionError(f"{label} delete left the row readable")
                session.rollback()
            smokes.append({"kind": label, "status": "passed", "pack": model.__module__.split(".")[0], "table": model.__tablename__})
        finally:
            sys.path.remove(str(pack_dir))
    return {"available": True, "sqlalchemy": sqlalchemy.__version__, "metadata_modules": metadata_modules, "crud_smokes": smokes}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("requests_jsonl", type=Path)
    parser.add_argument("results_jsonl", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--require-sqlalchemy", action="store_true")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    requests = [json.loads(line) for line in args.requests_jsonl.read_text().splitlines() if line.strip()]
    raw_lines = [line for line in args.results_jsonl.read_text().splitlines() if line.strip()]
    envelopes = [json.loads(line) for line in raw_lines]
    failures = [item for item in envelopes if item.get("ok") is not True]
    if failures:
        print(json.dumps({"generation_errors": [item.get("error") for item in failures]}, indent=2), file=sys.stderr)
        return 1
    records = [item["result"] for item in envelopes]
    if len(requests) != 28 or len(records) != 28:
        raise ValueError(f"Expected 28 requests and results; found {len(requests)} and {len(records)}")

    pack_dirs = []
    python_files = 0
    statuses: dict[str, int] = {}
    for request, result in zip(requests, records):
        if result.get("profile") != "umf.pack-tools-result/1":
            raise ValueError("Unexpected Pack Tools result profile")
        if result.get("status") not in {"generated", "partial", "blocked"}:
            raise ValueError("Unexpected Pack Tools result status")
        if result.get("pack") != {"id": request["pack"]["id"], "version": request["pack"]["version"]}:
            raise ValueError("Result order or pack identity differs from the production-helper request order")
        coverage_ids = [item.get("source") for item in result.get("coverage", [])]
        requested_ids = [item.get("id") for item in request.get("sources", [])]
        if len(coverage_ids) != len(requested_ids) or set(coverage_ids) != set(requested_ids) or len(set(coverage_ids)) != len(coverage_ids):
            raise ValueError(f"Coverage rows do not map one-to-one to source declarations for {request['pack']['id']}")
        companion_file = next((item for item in result["files"] if item.get("kind") == "source" and item.get("path") == "source-companion.json"), None)
        if not companion_file:
            raise ValueError(f"Missing exact-source companion for {request['pack']['id']}")
        companion = json.loads(companion_file["text"])
        expected_pack = request["pack"]
        expected_sources = [
            {"id": source["id"], "path": source["path"], "format": source["format"], "schemaFormat": source["schemaFormat"], "text": source["text"]}
            for source in request["sources"]
        ]
        if (
            companion.get("profile") != "umf.pack-tools-source-companion/1"
            or companion.get("pack") != expected_pack
            or companion.get("sources") != expected_sources
        ):
            raise ValueError(f"Source companion changed declared input text for {request['pack']['id']}")
        ddl_file = next((item for item in result["files"] if item.get("kind") == "ddl" and item.get("path") == "schema.sql"), None)
        if ddl_file:
            sql = ddl_file["text"]
            first_fk = sql.find("ALTER TABLE")
            last_create = sql.rfind("CREATE TABLE")
            if first_fk >= 0 and first_fk < last_create:
                raise ValueError(f"Foreign key DDL precedes a declared target CREATE TABLE in {request['pack']['id']}")
        statuses[result["status"]] = statuses.get(result["status"], 0) + 1
        pack_dir = safe_pack_dir(args.output_dir, result["pack"]["id"], result["pack"]["version"])
        written = write_files(pack_dir, result["files"])
        for path in written:
            if path.suffix == ".py":
                ast.parse(path.read_text(), filename=str(path))
                python_files += 1
        pack_dirs.append(pack_dir)

    validation = validate_sqlalchemy(pack_dirs, records, requests)
    if args.require_sqlalchemy and not validation["available"]:
        raise RuntimeError("SQLAlchemy validation was required but the package is unavailable")
    summary = {
        "packs": len(records),
        "status_counts": statuses,
        "python_files_syntax_checked": python_files,
        "files_written": sum(len(record["files"]) for record in records),
        "sqlalchemy": validation,
        "output_dir": str(args.output_dir),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
