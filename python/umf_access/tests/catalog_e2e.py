"""Installed CLI -> generated public call -> actual caller-role database execution."""

import asyncio
import json
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import psycopg

root = Path(sys.argv[1])
config = json.loads((root / "config.json").read_text())


def cli(*args):
    return subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-m",
            "umf_access.build.catalog",
            "catalog",
            "--config",
            str(root / "config.json"),
            "--root",
            str(root),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


first = cli()
assert first.returncode == 0, first.stdout + first.stderr
before = {
    str(p.relative_to(root)): p.read_bytes()
    for p in root.rglob("*")
    if p.is_file() and "__pycache__" not in p.parts
}
check = cli("--check")
assert check.returncode == 0, check.stdout + check.stderr
assert before == {
    str(p.relative_to(root)): p.read_bytes()
    for p in root.rglob("*")
    if p.is_file() and "__pycache__" not in p.parts
}
sys.path.insert(0, str(root))
from dataclasses import (
    replace,
)

from commerce import queries
from umf_access.catalog import (
    NotCompiledForTarget,
)
from umf_access.postgres_read import (
    TimedOut,
)
from umf_access.targets import (
    AsyncPostgresTarget,
    PostgresConfiguration,
    PostgresTarget,
    TargetMismatch,
    binding_digest,
)

binding = config["targets"][0]["binding"]
configuration = PostgresConfiguration(
    "praxis_test",
    binding_digest(binding),
    (int(config["targets"][0]["platform"][0]["versions"][0]),),
    timedelta(seconds=5),
)
with psycopg.connect(
    os.environ["UMF_PG_TEST_DSN"], user="praxis_a", autocommit=True
) as connection:
    target = PostgresTarget(
        connection, configuration, tuple(v.entry for v in queries._Q0.variants)
    )
    target.verify()
    rows = queries.joined(target)
    assert [(r.order_id, r.name) for r in rows] == [("a1", "Alpha"), ("a2", None)]
    # @covers US-082-AC8: actual generated catalog, nullable joined output and
    # caller-role RLS. Null-safe operators never discard both-null equality.
    for name, equal, different in (
        (None, ["a2"], ["a1"]),
        ("Alpha", ["a1"], ["a2"]),
        ("absent", [], ["a1", "a2"]),
    ):
        assert [r.order_id for r in queries.null_safe_equal(target, name=name)] == equal
        assert [r.order_id for r in queries.null_safe_different(target, name=name)] == different
    assert [r.order_id for r in queries.null_safe_null_literal(target)] == ["a2"]
    # @covers US-082-AC8: actual compiled prefixes use Unicode sequences, not
    # LIKE metacharacters, case folding or Unicode normalization. RLS hides a2's
    # customer so even the empty prefix must exclude its SQL-null joined value.
    with psycopg.connect(os.environ["UMF_PG_TEST_DSN"], autocommit=True) as owner:
        try:
            for text, prefix, expected in (
                ("Alpha", "", ["a1"]), ("Alpha", "Al", ["a1"]),
                ("Alpha", "al", []), ("ordinary", "%", []),
                ("ordinary", "_", []), ("%_\\tail", "%_\\", ["a1"]),
                ("éclair", "é", ["a1"]), ("éclair", "e\u0301", []),
                ("e\u0301clair", "e\u0301", ["a1"]),
                ("𝄞music", "𝄞", ["a1"]),
            ):
                owner.execute("UPDATE praxis_test.generated_customers SET name=%s WHERE customer_id='a1'", (text,))
                assert [r.order_id for r in queries.prefix_match(target, prefix=prefix)] == expected
            owner.execute("UPDATE praxis_test.generated_customers SET name=%s WHERE customer_id='a1'", ("%_\\tail",))
            assert [r.order_id for r in queries.prefix_literal(target)] == ["a1"]
        finally:
            owner.execute("UPDATE praxis_test.generated_customers SET name='Alpha' WHERE customer_id='a1'")
    assert [r.order_id for r in queries.filtered(target)] == ["a1", "a2"]
    assert [r.order_id for r in queries.filtered(target, minimum="a2")] == ["a2"]
    first = queries.paged(target, after=None)
    second = queries.paged(target, after=first.next_after)
    assert [r.order_id for r in (*first.items, *second.items)] == ["a1", "a2"]
    stream = queries.paged_stream(target, after=None, max_rows=1001)
    assert [r.order_id for r in stream] == ["a1", "a2"]
    assert connection.info.transaction_status == 0
    try:
        queries.joined(
            PostgresTarget(
                connection, replace(configuration, server_versions=(180099,))
            )
        )
    except TargetMismatch:
        pass
    else:
        raise AssertionError("unqualified native version accepted")
    try:
        queries.joined(
            PostgresTarget(connection, replace(configuration, binding_sha256="0" * 64))
        )
    except NotCompiledForTarget:
        pass
    else:
        raise AssertionError("foreign binding accepted")
    try:
        queries.joined(target, timeout=timedelta(0))
    except TimedOut:
        pass
    else:
        raise AssertionError("expired deadline dispatched")


async def run():
    async with await psycopg.AsyncConnection.connect(
        os.environ["UMF_PG_TEST_DSN"], user="praxis_a", autocommit=True
    ) as connection:
        target = AsyncPostgresTarget(
            connection, configuration, tuple(v.entry for v in queries._Q0.variants)
        )
        await target.verify()
        assert [(r.order_id, r.name) for r in await queries.joined(target)] == [
            ("a1", "Alpha"),
            ("a2", None),
        ]
        assert [r.order_id for r in await queries.filtered(target, minimum="a2")] == [
            "a2"
        ]
        stream = queries.paged_stream(target, after=None, max_rows=1001)
        assert [r.order_id async for r in stream] == ["a1", "a2"]
        assert connection.info.transaction_status == 0


asyncio.run(run())
path = root / "commerce/queries.py"
path.write_bytes(path.read_bytes() + b"\n# hand edit\n")
edited = path.read_bytes()
refused = cli("--check")
assert refused.returncode != 0
assert path.read_bytes() == edited
print("catalog native E2E: pass")
