"""Actual generated DSL -> Weft catalog -> PostgreSQL term-filter witnesses.

Run explicitly with a freshly generated search fixture and an owned receipt
directory. This script creates and stops its own disposable PostgreSQL cluster.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

import psycopg
import weft
from umf_access import Param, query
from umf_access.capture import capture
from umf_access.postgres_read import (
    ReadObligationUnmet,
    execute_read,
    execute_read_async,
)
from umf_access.reviewed import build_query
from umf_access.types import StrictModel

generated = Path(os.environ["UMF_TERM_GENERATED_ROOT"]).resolve()
out = Path(os.environ["UMF_TERM_RECEIPTS"]).resolve()
out.mkdir(parents=True, exist_ok=False)
sys.path.insert(0, str(generated))
from search_docs.models import Doc


class Terms(StrictModel):
    terms: str


class Hit(StrictModel):
    id: str


@query
def all_terms(terms: Param[str]):
    return Doc.objects.filter(Doc.c.body.matches_all_terms(terms)).select(Doc.c.id).order_by(Doc.c.id.asc()).limit(100).all()


@query
def any_terms(terms: Param[str]):
    return Doc.objects.filter(Doc.c.body.matches_any_term(terms)).select(Doc.c.id).order_by(Doc.c.id.asc()).limit(100).all()


text = json.loads((generated / "stage-one-request.json").read_text())["sources"][0]["text"]
model = json.loads(text)
access = model["modules"][0]["extensions"]["umf.access"]
language = next(index for index in access["search"] if index["kind"] == "keyword")["keyword"]["analyzer"]["language"]
if language not in ("english", "simple"):
    raise ValueError("explicit qualified analyzer required")
nullable = next(field for field in access["views"][0]["fields"] if field["field"]["element"] == "body")["row"]["null"]
binding = {
    "version": "umf.raw-read-binding/0.1", "schema": "search_app",
    "modelJson": text, "modelSha256": hashlib.sha256(text.encode()).hexdigest(),
    "tables": [{"logical": ["search", "Doc"], "native": "docs", "key": ["id"],
                "columns": [{"logical": name, "native": name, "carrier": "string", "nullable": nullable if name == "body" else False}
                            for name in ("id", "body")]}],
    "relationships": [],
}
entries = {
    name: build_query(capture(declaration), weft, parameters=Terms, result=Hit,
                      target="postgresql18", binding=binding, row_cap=100)
    for name, declaration in (("all", all_terms), ("any", any_terms))
}
for name, entry in entries.items():
    (out / f"{name}-catalog.json").write_text(entry.artifact_json + "\n")

pg = Path("/opt/homebrew/opt/postgresql@18/bin")
(out / "socket").mkdir()
checks = []
native_version = None
started = False


def command(name, args):
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True, check=False)
    (out / (name + ".log")).write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f"{name} failed: see retained log")


try:
    command("init", [pg / "initdb", "-D", out / "data", "-A", "trust", "-U", "sdk_test", "--no-sync"])
    command("start", [pg / "pg_ctl", "-D", out / "data", "-l", out / "server.log", "-o",
                      f"-F -k {out / 'socket'} -c listen_addresses='' -p 55494", "-w", "start"])
    started = True
    dsn = f"host={out / 'socket'} port=55494 dbname=postgres"
    with psycopg.connect(dsn + " user=sdk_test", autocommit=True) as admin:
        native_version = admin.execute("SHOW server_version").fetchone()[0]
        admin.execute("CREATE ROLE term_user LOGIN")
        admin.execute("CREATE SCHEMA search_app")
        admin.execute("CREATE TABLE search_app.docs(id text PRIMARY KEY, body text" + ("" if nullable else " NOT NULL") + ")")
        admin.execute("ALTER TABLE search_app.docs ENABLE ROW LEVEL SECURITY")
        admin.execute("CREATE POLICY term_rows ON search_app.docs USING(id <> '07')")
        admin.execute("GRANT USAGE ON SCHEMA search_app TO term_user")
        admin.execute("GRANT SELECT ON search_app.docs TO term_user")
        correct_index = f"CREATE INDEX doc_text ON search_app.docs USING gin(pg_catalog.to_tsvector('pg_catalog.{language}'::regconfig, COALESCE(body,''::text)))"
        wrong_language = "simple" if language == "english" else "english"
        admin.execute(correct_index)
        with admin.cursor() as cursor:
            cursor.executemany("INSERT INTO search_app.docs VALUES(%s,%s)", [
                ("01", "Running cats"), ("02", "runs dog"), ("03", "cat"),
                ("04", "the"), ("05", ""), ("06", "café CAT"),
                ("07", "excluded running cats"), ("08", "cafe\u0301"),
            ])
        if nullable:
            admin.execute("INSERT INTO search_app.docs VALUES('09',NULL)")
            assert admin.execute("SELECT count(*) FROM search_app.docs WHERE body IS NULL").fetchone()[0] == 1
            checks.append({"kind": "native-null-field", "rows": 1})
        with psycopg.connect(dsn + " user=term_user") as connection:
            cases = [
                ("all", "run cat", ["01"]), ("any", "run cat", ["01", "02", "03", "06"]),
                ("all", "cat cat", ["01", "03", "06"]), ("any", "CAT", ["01", "03", "06"]),
                ("all", "", ["01", "02", "03", "04", "05", "06", "08"]), ("any", "", []),
                ("all", "the", ["01", "02", "03", "04", "05", "06", "08"]), ("any", "the", []),
                ("any", "café", ["06"]), ("any", "cafe\u0301", ["08"]),
                ("all", "cats | dog", []),
            ]
            if language == "simple":
                cases = [
                    ("all", "run cat", []), ("any", "run cat", ["03", "06"]),
                    ("all", "cat cat", ["03", "06"]), ("any", "CAT", ["03", "06"]),
                    ("all", "", ["01", "02", "03", "04", "05", "06", "08"]), ("any", "", []),
                    ("all", "the", ["04"]), ("any", "the", ["04"]),
                    ("any", "café", ["06"]), ("any", "cafe\u0301", ["08"]),
                    ("all", "cats | dog", []),
                ]
            for name, terms, expected in cases:
                result = execute_read(connection, entries[name], Terms(terms=terms), app_schema="search_app")
                assert [row.id for row in result] == expected, (name, terms, result, expected)
                assert connection.info.transaction_status == 0
                checks.append({"kind": "sync", "mode": name, "terms": terms, "ids": expected})
            # A different real native index must refuse before returning rows.
            admin.execute("DROP INDEX search_app.doc_text")
            admin.execute(f"CREATE INDEX doc_text ON search_app.docs USING gin(pg_catalog.to_tsvector('pg_catalog.{wrong_language}'::regconfig, COALESCE(body,''::text)))")
            try:
                execute_read(connection, entries["all"], Terms(terms="cat"), app_schema="search_app")
            except ReadObligationUnmet:
                checks.append({"kind": "wrong-native-analyzer", "refused": True})
            else:
                raise AssertionError("mismatched native analyzer released rows")
            admin.execute("DROP INDEX search_app.doc_text")
            admin.execute(correct_index)

            class ChangedAnalyzerCursor:
                def __init__(self, raw):
                    self.raw = raw
                    self.changed = False

                def __enter__(self):
                    self.raw.__enter__()
                    return self

                def __exit__(self, *args):
                    return self.raw.__exit__(*args)

                @property
                def description(self):
                    return self.raw.description

                def execute(self, sql, params=None):
                    if sql == entries["all"].artifact()["dbapiSql"] and not self.changed:
                        self.changed = True
                        dictionary = "simple" if language == "english" else "english_stem"
                        admin.execute(f"ALTER TEXT SEARCH CONFIGURATION pg_catalog.{language} ALTER MAPPING FOR asciiword WITH pg_catalog.{dictionary}")
                    return self.raw.execute(sql, params)

                def fetchone(self):
                    return self.raw.fetchone()

                def fetchmany(self, size=1):
                    return self.raw.fetchmany(size)

            class ChangedAnalyzerConnection:
                info = connection.info

                def transaction(self):
                    return connection.transaction()

                def cursor(self):
                    return ChangedAnalyzerCursor(connection.cursor())

            try:
                try:
                    execute_read(ChangedAnalyzerConnection(), entries["all"], Terms(terms="cats"), app_schema="search_app")
                except ReadObligationUnmet:
                    checks.append({"kind": "native-analyzer-changed-after-admission", "withheld": True})
                else:
                    raise AssertionError("changed native analyzer released buffered rows")
            finally:
                dictionary = "english_stem" if language == "english" else "simple"
                admin.execute(f"ALTER TEXT SEARCH CONFIGURATION pg_catalog.{language} ALTER MAPPING FOR asciiword WITH pg_catalog.{dictionary}")
            assert connection.info.transaction_status == 0

        async def replay_async():
            async with await psycopg.AsyncConnection.connect(dsn + " user=term_user") as connection:
                for name, terms, expected in cases:
                    result = await execute_read_async(connection, entries[name], Terms(terms=terms), app_schema="search_app")
                    assert [row.id for row in result] == expected
                    assert connection.info.transaction_status == 0
                    checks.append({"kind": "async", "mode": name, "terms": terms, "ids": expected})
        asyncio.run(replay_async())
finally:
    if started:
        command("stop", [pg / "pg_ctl", "-D", out / "data", "-m", "fast", "-w", "stop"])
    (out / "result.json").write_text(json.dumps({
        "checks": checks, "language": language, "nullable": nullable,
        "versions": {"python": sys.version, "postgresql": native_version, "weft-sql": version("weft-sql"), "umf_access": version("umf_access"), "psycopg": version("psycopg"), "pydantic": version("pydantic")},
        "harnessSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "modelSha256": binding["modelSha256"],
        "serverStopped": not (out / "data/postmaster.pid").exists(), "temporal": "HELD",
    }, indent=2) + "\n")
print(json.dumps({"checks": len(checks), "serverStopped": True, "temporal": "HELD"}))
