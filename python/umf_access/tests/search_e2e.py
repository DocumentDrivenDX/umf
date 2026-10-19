# SPDX-License-Identifier: MIT OR Apache-2.0
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import timedelta
from decimal import Decimal
from importlib.metadata import version
from pathlib import Path

root = Path(__file__).resolve().parents[3]
generated = Path(os.environ["UMF_SEARCH_GENERATED_ROOT"])
sys.path.insert(0, str(generated))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import psycopg
from umf_access.postgres_read import (
    TimedOut,
)
from umf_access.postgres_search import (
    AsyncPostgresSearchTarget,
    EmbedderMismatch,
    PostgresSearchTarget,
    SearchError,
)
from umf_access.targets import (
    PostgresConfiguration,
    TargetMismatch,
    binding_digest,
)

bin = Path("/opt/homebrew/opt/postgresql@18/bin")
started = False
cases = []
remote_dsn = os.environ.get("UMF_SEARCH_TEST_DSN")
target_kind = os.environ.get("UMF_SEARCH_TARGET_KIND", "postgresql")
if target_kind not in ("postgresql", "lakebase"):
    raise ValueError("explicit native search target kind required")
if target_kind == "lakebase":
    from umf_access.postgres_search import (
        AsyncLakebaseSearchTarget as AsyncPostgresSearchTarget,
    )
    from umf_access.postgres_search import (
        LakebaseSearchTarget as PostgresSearchTarget,
    )
if target_kind == "lakebase":
    from umf_access.postgres_search import PostgresSearchTarget as OtherSearchTarget
else:
    from umf_access.postgres_search import LakebaseSearchTarget as OtherSearchTarget
full_record = os.environ.get("UMF_SEARCH_FULL_RECORD") == "1"
fenced_profile = os.environ.get("UMF_SEARCH_CATALOG_FENCE") == "1"
if fenced_profile and remote_dsn is not None:
    raise ValueError("candidate catalog-fence fixture is owned-local only")
partial_profile = os.environ.get("UMF_SEARCH_PARTIAL_PROFILE") == "1"
vector_version = os.environ.get("UMF_SEARCH_VECTOR_VERSION", "0.8.7")
if vector_version not in ("0.8.6", "0.8.7"):
    raise ValueError("explicit pinned native vector test version required")


def command(*args):
    p = subprocess.run(
        list(map(str, args)), text=True, capture_output=True, check=False
    )
    if p.returncode:
        raise RuntimeError(p.stdout + p.stderr)
    return p.stdout


(
    generated / "search_declarations.py"
).write_text("""from umf_access import query,Param,Vector
from umf_access.dsl import hybrid,rrf
from search_docs.models import Doc,DocSummary
@query
def keyword(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).top(3)
@query
def vector(q:Param[Vector]):return Doc.objects.search(Doc.s.semantic.near_vector(q)).top(3)
@query
def embedded(term:Param[str]):return Doc.objects.search(Doc.s.semantic.near(term)).top(3)
@query
def combined(term:Param[str]):return Doc.objects.search(hybrid(Doc.s.text.matches(term),Doc.s.semantic.near(term),fusion=rrf(depth=6))).top(3)
@query
def filtered(q:Param[Vector],minimum:Param[str]):return Doc.objects.filter(Doc.c.id >= minimum).search(Doc.s.semantic.near_vector(q)).top(3)
@query
def selected(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).select(Doc.c.id,Doc.c.body).top(3)
@query
def modeled(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).into(DocSummary).top(3)

""")
if partial_profile:
    declarations_path = generated / "search_declarations.py"
    declarations_path.write_text(
        declarations_path.read_text().replace(".top(3)", ".top(3,allow_partial=True)")
    )

stage_one = json.loads((generated / "stage-one-request.json").read_text())
model = stage_one["sources"][0]["text"]
logical = json.loads(model)
access = logical["modules"][0]["extensions"]["umf.access"]
if not access["columns"]:
    raise ValueError(
        "source-exact native search requires original authored ColumnSets; generate --source-exact"
    )
original_sources = {source["id"]: source["text"] for source in stage_one["sources"]}
binding = {
    "version": "umf.raw-read-binding/0.1",
    "schema": "search_app",
    "modelJson": model,
    "modelSha256": hashlib.sha256(model.encode()).hexdigest(),
    "tables": [
        {
            "logical": ["search", "Doc"],
            "native": "docs",
            "key": ["id"],
            "columns": [
                {"logical": f, "native": f, "carrier": "string", "nullable": False}
                for f in ["id", "body", "owner"]
            ],
        }
    ],
    "relationships": [],
}
if full_record:
    expected = {"id", "body", "embedding", "owner", "count", "amount", "payload"}
    actual = {
        member["element"]
        for element in logical["modules"][0]["elements"]
        if element["id"] == "Doc"
        for member in element["members"]
    }
    assert actual == expected

    binding["tables"][0]["columns"].extend(
        [
            {"logical": field, "native": field, "carrier": carrier, "nullable": False}
            for field, carrier in [("count", "integer"), ("amount", "decimal")]
        ]
    )
column_sets = []
for index, columns in enumerate(access["columns"]):
    alias = columns["binding"]["sourceId"]
    if alias not in original_sources:
        raise ValueError("original physical search binding source absent")
    physical_text = original_sources[alias]
    column_sets.append(
        {
            "columnSet": {
                "documentId": logical["id"],
                "coreVersion": logical["umf"],
                "documentSha256": hashlib.sha256(model.encode()).hexdigest(),
                "module": logical["modules"][0]["id"],
                "pointer": f"/modules/0/extensions/umf.access/columns/{index}",
            },
            "binding": {
                "sourceId": alias,
                "documentJson": physical_text,
                "documentSha256": hashlib.sha256(physical_text.encode()).hexdigest(),
            },
        }
    )
binding["nativeColumns"] = {
    "target": {"platform": target_kind, "majorVersion": "18"},
    "sets": column_sets,
    "vectorExtension": {"schema": "public", "version": vector_version},
}
if fenced_profile:
    binding["nativeCatalogFence"] = {
        "version": "umf.pg-ts-fence/0.1", "schema": "native_fence",
        "view": "ts_catalog_lock", "owner": "fence_owner",
        "ownerProfile": "non-login-maintainer/0.1",
    }
config = {
    "package": "search_docs",
    "modules": ["search_declarations"],
    "targets": [
        {
            "id": "local",
            "kind": target_kind,
            "backendId": "weft-postgresql",
            "backendVersion": "raw-read/0.1",
            "targetProfile": "weft.raw-read/0.1",
            "binding": binding,
            "platform": [{"name": "postgresql", "versions": ["180006"]}],
            "vectorBindings": [
                {
                    "field": {"module": "search", "element": "embedding"},
                    "native": "embedding",
                    "dimensions": 3,
                    "extensionSchema": "public",
                    "extensionVersion": vector_version,
                }
            ],
        }
    ],
}
(generated / "original-model.json").write_text(model)
config["weft"] = {"distribution": "weft-sql", "version": version("weft-sql")}
documents = []
for alias, text in original_sources.items():
    path = "original-" + alias + ".json"
    (generated / path).write_text(text)
    documents.append(
        {"path": path, "sha256": hashlib.sha256(text.encode()).hexdigest()}
    )
config["umf"] = {"documents": documents}
(generated / "search-config.json").write_text(json.dumps(config))
if partial_profile:
    declarations_path = generated / "search_declarations.py"
    original = declarations_path.read_text()
    declarations_path.write_text(
        original.replace(
            "def filtered(q:Param[Vector],minimum:Param[str]):return Doc.objects.filter(Doc.c.id >= minimum).search(Doc.s.semantic.near_vector(q)).top(3,allow_partial=True)",
            "def filtered(q:Param[Vector],minimum:Param[str]):return Doc.objects.filter(Doc.c.id >= minimum).search(Doc.s.semantic.near_vector(q)).top(3)",
        )
    )
    try:
        refused = subprocess.run(
            [
                sys.executable,
                "-I",
                "-B",
                "-m",
                "umf_access.build.catalog",
                "catalog",
                "--config",
                str(generated / "search-config.json"),
                "--root",
                str(generated),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        (generated / "partial-without-optin.log").write_text(
            refused.stdout + refused.stderr
        )
        assert (
            refused.returncode != 0
            and "SEARCH_FILTER" in refused.stdout + refused.stderr
        )
        cases.append(
            "partial original binding refuses filtered search without explicit opt-in"
        )
    finally:
        declarations_path.write_text(original)
for extra in ([], ["--check"]):
    command(
        sys.executable,
        "-B",
        "-m",
        "umf_access.build.catalog",
        "catalog",
        "--config",
        generated / "search-config.json",
        "--root",
        generated,
        *extra,
    )
from search_docs import (
    queries,
)

if os.environ.get("UMF_SEARCH_BUILD_ONLY") == "1":
    print(
        json.dumps(
            {"publicCliStatus": "pass", "nativeExecuted": False, "temporal": "HELD"}
        )
    )
    raise SystemExit(0)

pg = Path(tempfile.mkdtemp(prefix="umf-search-pg18-", dir="/private/tmp"))
(pg / "socket").mkdir()

try:
    if remote_dsn is None:
        control = Path(os.environ["UMF_PGVECTOR_CONTROL_ROOT"]).resolve()
        if any(c.isspace() for c in str(control)):
            raise ValueError("owned fixture control path must have no whitespace")
        command(
            bin / "initdb",
            "-D",
            pg / "data",
            "-U",
            "sdk_test",
            "-A",
            "trust",
            "--no-sync",
        )
        command(
            bin / "pg_ctl",
            "-D",
            pg / "data",
            "-l",
            pg / "server.log",
            "-o",
            f"-F -k {pg / 'socket'} -c listen_addresses='' -c extension_control_path={control} -p 55494",
            "-w",
            "start",
        )
        started = True
        dsn = f"host={pg / 'socket'} port=55494 dbname=postgres"
        admin = psycopg.connect(dsn + " user=sdk_test", autocommit=True)
    else:
        dsn = remote_dsn
        admin = psycopg.connect(
            dsn, password=os.environ["UMF_SEARCH_TEST_ADMIN_PASSWORD"], autocommit=True
        )
    admin.execute(
        psycopg.sql.SQL("CREATE EXTENSION vector VERSION {}").format(
            psycopg.sql.Literal(vector_version)
        )
    )
    assert admin.execute(
        "SELECT extversion FROM pg_extension WHERE extname='vector'"
    ).fetchone() == (vector_version,)
    if remote_dsn is None:
        admin.execute("CREATE ROLE search_user LOGIN NOSUPERUSER NOBYPASSRLS")
    if fenced_profile:
        from pg_fence_e2e_support import deploy_owned_fence
        artifacts = [
            entry.artifact()
            for name, value in vars(queries).items() if name.startswith("_S")
            for variant in value.variants for entry in variant.entries
        ]
        fence = deploy_owned_fence(admin, artifacts)
        (generated / "fence-deployment-receipt.json").write_text(json.dumps(fence, indent=2))
    admin.execute("CREATE ROLE hidden_user NOLOGIN")
    admin.execute("CREATE SCHEMA search_app")
    admin.execute("GRANT USAGE ON SCHEMA search_app TO search_user")
    admin.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    extra_columns = (
        ",count bigint NOT NULL,amount numeric(38,10) NOT NULL,payload bytea NOT NULL"
        if full_record
        else ""
    )
    admin.execute(
        'CREATE TABLE search_app.docs (id text COLLATE "C" PRIMARY KEY,body text COLLATE "C" NOT NULL,embedding public.vector(3) NOT NULL,owner text NOT NULL'
        + extra_columns
        + ")"
    )
    if full_record:
        for identity, body, vector, owner, count, amount, payload in [
            (
                "a",
                "cats cats",
                "[1,0,0]",
                "search_user",
                9223372036854775807,
                "1234567890123456789012345678.1234567890",
                b"\x00\xffnative",
            ),
            (
                "b",
                "dogs cats",
                "[0.5,0.5,0]",
                "search_user",
                -9223372036854775808,
                "-1234567890123456789012345678.1234567890",
                b"\x80\x00bytes",
            ),
            ("c", "dogs", "[0,1,0]", "search_user", 0, "0.0000000000", b""),
            ("hidden", "cats", "[1,0,0]", "hidden_user", 1, "1.0000000000", b"hidden"),
        ]:
            admin.execute(
                "INSERT INTO search_app.docs VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (identity, body, vector, owner, count, Decimal(amount), payload),
            )
    else:
        admin.execute(
            "INSERT INTO search_app.docs(id,body,embedding,owner) VALUES ('a','cats cats','[1,0,0]','search_user'),('b','dogs cats','[0.5,0.5,0]','search_user'),('c','dogs','[0,1,0]','search_user'),('hidden','cats','[1,0,0]','hidden_user')"
        )

    admin.execute(
        "CREATE INDEX doc_text ON search_app.docs USING gin (pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,COALESCE(body,''::text)))"
    )
    admin.execute(
        "CREATE INDEX doc_semantic ON search_app.docs USING hnsw (embedding public.vector_cosine_ops)"
    )
    admin.execute("ALTER TABLE search_app.docs ENABLE ROW LEVEL SECURITY")
    admin.execute(
        "CREATE POLICY own_rows ON search_app.docs USING (owner=current_user)"
    )
    admin.execute("GRANT SELECT ON search_app.docs TO search_user")
    config = json.loads((generated / "search-config.json").read_text())
    binding = config["targets"][0]["binding"]
    configuration = PostgresConfiguration(
        "search_app", binding_digest(binding), (180006,), timedelta(seconds=5)
    )

    class Embedding:
        calls = 0

        def identity(self):
            return {"model": "fixture-embedder", "version": "1", "dimensions": 3}

        def embed(self, texts):
            self.calls += 1
            assert isinstance(texts, list) and len(texts) == 1
            return [(1.0, 0.0, 0.0)]

    connection = psycopg.connect(dsn + " user=search_user")
    all_variants = tuple(
        v
        for name, value in vars(queries).items()
        if name.startswith("_S")
        for v in value.variants
    )
    try:
        OtherSearchTarget(
            connection, configuration, search_variants=all_variants
        ).verify()
    except TargetMismatch:
        pass
    else:
        raise AssertionError(
            "eager search verification accepted a foreign target profile"
        )
    assert connection.info.transaction_status == 0
    cases.append(
        "eager verification refuses a foreign target profile before native search"
    )
    embedder = Embedding()
    target = PostgresSearchTarget(
        connection,
        configuration,
        embedders={"semantic": embedder},
        search_variants=all_variants,
    )
    target.verify()
    assert connection.info.transaction_status == 0
    text = queries.keyword(target, term="cats")
    assert [h.item.id for h in text] == ["a", "b"]
    assert all(h.score.kind == "implementation-defined" for h in text)
    assert text.stale == 0 and text.partial == partial_profile and not text.approximate
    cases.append(
        "actual native plain keyword ranking and RLS; whole-row vector decoding"
    )
    from search_docs.models import Doc

    extra_values = (
        {"count": 1, "amount": Decimal("1.0000000000"), "payload": b"instance"}
        if full_record
        else {}
    )
    created = Doc(
        id="instance",
        body="cats",
        embedding=(1.0, 0.0, 0.0),
        owner="search_user",
        **extra_values,
    )
    if full_record:
        expected_native = connection.execute(
            "SELECT id,count,amount,payload,embedding::text FROM search_app.docs WHERE id IN ('a','b') ORDER BY id"
        ).fetchall()
        connection.rollback()
        assert [
            (hit.item.id, hit.item.count, hit.item.amount, hit.item.payload)
            for hit in text
        ] == [row[:4] for row in expected_native]
        assert all(
            type(hit.item.count) is int
            and type(hit.item.amount) is Decimal
            and type(hit.item.payload) is bytes
            for hit in text
        )
        assert [hit.item.embedding for hit in text] == [
            (1.0, 0.0, 0.0),
            (0.5, 0.5, 0.0),
        ]
        cases.append(
            "actual full-record keyword native Binary Integer64 Decimal38 and Vector float32 decoding"
        )
    assert created.body == "cats"
    selected = queries.selected(target, term="cats")
    assert [h.item for h in selected] == [("a", "cats cats"), ("b", "dogs cats")]
    assert [(h.item.id, h.item.body) for h in queries.modeled(target, term="cats")] == [
        h.item for h in selected
    ]
    cases.append(
        "actual generated instance, selected tuple and explicit generated-model ranked projection"
    )
    native_keyword = connection.execute(
        "SELECT id FROM search_app.docs WHERE pg_catalog.to_tsvector('pg_catalog.english',body) @@ pg_catalog.plainto_tsquery('pg_catalog.english',%s) ORDER BY pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('pg_catalog.english',body),pg_catalog.plainto_tsquery('pg_catalog.english',%s)) DESC,id COLLATE \"C\" ASC LIMIT 3",
        ("cats", "cats"),
    ).fetchall()
    connection.rollback()
    assert [h.item.id for h in text] == [r[0] for r in native_keyword]
    cases.append(
        "independent native keyword ranking oracle under the constrained RLS principal"
    )
    plain = queries.keyword(target, term="cats | dogs")
    assert [h.item.id for h in plain] == ["b"]
    assert len(queries.keyword(target, term="cats') OR true--")) == 0
    cases.append("plain keyword terms do not interpret boolean operators or SQL text")
    vector = queries.vector(target, q=(1.0, 0.0, 0.0))
    assert [h.item.id for h in vector] == ["a", "b", "c"]
    assert vector[0].score.kind == "cosine-distance" and vector[0].score.value == 0.0
    assert vector[1].item.embedding == (0.5, 0.5, 0.0)
    if full_record:
        independent = connection.execute(
            'SELECT id,count,amount,payload FROM search_app.docs ORDER BY id COLLATE "C"'
        ).fetchall()
        connection.rollback()
        assert [
            (hit.item.id, hit.item.count, hit.item.amount, hit.item.payload)
            for hit in vector
        ] == independent
        assert all(
            type(hit.item.count) is int
            and type(hit.item.amount) is Decimal
            and type(hit.item.payload) is bytes
            for hit in vector
        )
        cases.append(
            "actual full-record vector native Binary Integer64 Decimal38 decoding matches independent physical rows"
        )
    from umf_access.postgres_search import _statement

    vector_entry = next(
        entry
        for variant in all_variants
        for entry in variant.entries
        if entry.artifact().get("scoreKind") == "cosine-distance"
        and not entry.artifact()["selectionTemplate"].get("parameters")
    )
    original_sql, original_params = _statement(
        vector_entry, "/statement", {"__umf_search_query": "[1,0,0]"}, "search_app"
    )
    connection.execute("SET LOCAL enable_seqscan=off")
    plan = connection.execute(
        "EXPLAIN (FORMAT JSON) " + original_sql, original_params
    ).fetchone()[0]
    connection.rollback()
    (generated / "exact-vector-explain.json").write_text(json.dumps(plan, indent=2))
    assert '"Index Name": "doc_semantic"' not in json.dumps(plan)
    assert "__umf_candidates" in json.dumps(plan)
    cases.append(
        "original materialized vector candidate plan cannot use HNSW even with sequential scans discouraged"
    )
    filtered = queries.filtered(target, q=(1.0, 0.0, 0.0), minimum="b")
    assert [h.item.id for h in filtered] == ["b", "c"]
    cases.append(
        f"actual pgvector{vector_version} exact distance, complete pre-filtering and Key tie order"
    )
    native_vector = connection.execute(
        'SELECT id FROM search_app.docs WHERE id >= %s ORDER BY embedding OPERATOR(public.<=>) %s::public.vector,id COLLATE "C" ASC LIMIT 3',
        ("b", "[1,0,0]"),
    ).fetchall()
    connection.rollback()
    assert [h.item.id for h in filtered] == [r[0] for r in native_vector]
    cases.append(
        "independent native exact vector prefilter oracle; no ANN recall claim"
    )
    admin.execute("UPDATE search_app.docs SET body='birds' WHERE id='a'")
    changed = queries.keyword(target, term="cats")
    assert (
        [h.item.id for h in changed] == ["b"]
        and changed.stale == 0
        and changed.partial == partial_profile
    )
    admin.execute("UPDATE search_app.docs SET body='cats cats' WHERE id='a'")
    assert [h.item.id for h in queries.keyword(target, term="cats")] == ["a", "b"]
    cases.append(
        "committed transactional keyword freshness and restoration without stale hydration"
    )
    embedded = queries.embedded(target, term="cats")
    assert [h.item.id for h in embedded] == ["a", "b", "c"] and embedder.calls == 1
    fused = queries.combined(target, term="cats")
    assert [h.item.id for h in fused] == ["a", "b", "c"] and all(
        h.score.kind == "rrf" for h in fused
    )
    cases.append(
        "host embedder identity and bounded native-leg RRF under one read snapshot"
    )

    class Wrong(Embedding):
        def identity(self):
            return {"model": "wrong", "version": "1", "dimensions": 3}

    wrong = PostgresSearchTarget(
        connection, configuration, embedders={"semantic": Wrong()}
    )
    try:
        queries.embedded(wrong, term="cats")
    except EmbedderMismatch:
        pass
    else:
        raise AssertionError("wrong embedder identity accepted")
    assert connection.info.transaction_status == 0
    cases.append("embedder mismatch refuses before native dispatch")
    if full_record:
        admin.execute(
            "INSERT INTO search_app.docs VALUES ('z','zero','[0,0,0]','search_user',%s,%s,%s)",
            (0, Decimal("0.0000000000"), b"zero"),
        )
    else:
        admin.execute(
            "INSERT INTO search_app.docs VALUES ('z','zero','[0,0,0]','search_user')"
        )
    try:
        queries.vector(target, q=(1.0, 0.0, 0.0))
    except SearchError:
        pass
    else:
        raise AssertionError("undefined matching cosine row silently dropped")
    admin.execute("DELETE FROM search_app.docs WHERE id='z'")
    cases.append(
        "undefined matching cosine vectors refuse rather than disappear from top-k"
    )

    async def async_cases():
        c = await psycopg.AsyncConnection.connect(dsn + " user=search_user")
        t = AsyncPostgresSearchTarget(
            c,
            configuration,
            embedders={"semantic": Embedding()},
            search_variants=all_variants,
        )
        await t.verify()
        result = await queries.combined(t, term="cats")
        assert [h.item.id for h in result] == ["a", "b", "c"]
        assert c.info.transaction_status == 0

        class Slow(Embedding):
            def embed(self, texts):
                import time

                time.sleep(0.15)
                return super().embed(texts)

        class Observed:
            calls = 0

            @property
            def info(self):
                return c.info

            async def execute(self, *a, **kw):
                self.calls += 1
                return await c.execute(*a, **kw)

            async def rollback(self):
                return await c.rollback()

            async def close(self):
                return await c.close()

        observed = Observed()
        slow = AsyncPostgresSearchTarget(
            observed, configuration, embedders={"semantic": Slow()}
        )
        pulse = asyncio.create_task(asyncio.sleep(0.005))
        try:
            await queries.embedded(
                slow, term="cats", timeout=timedelta(milliseconds=25)
            )
        except TimedOut:
            pass
        else:
            raise AssertionError("blocking host embedder defeated async call deadline")
        assert pulse.done() and observed.calls == 0 and c.info.transaction_status == 0
        cases.append(
            "blocking host embedder stays off the async loop; timeout returns before any native dispatch"
        )
        await c.close()

    asyncio.run(async_cases())
    cases.append("actual async keyword/vector/RRF target and cleanup parity")
    admin.execute("DROP INDEX search_app.doc_semantic")
    admin.execute(
        "CREATE INDEX doc_semantic ON search_app.docs USING hnsw (embedding public.vector_l2_ops)"
    )
    try:
        queries.vector(target, q=(1.0, 0.0, 0.0))
    except TargetMismatch:
        pass
    else:
        raise AssertionError("wrong native metric index accepted")
    assert connection.info.transaction_status == 0
    cases.append("native index/operator-class drift refuses before ranked data read")
    connection.close()
    admin.close()
    print(
        json.dumps(
            {
                "status": "pass",
                "cases": cases,
                "versions": {"postgresql": "18.6", "pgvector": vector_version},
                "temporal": "HELD",
                "scope": (
                    "isolated managed Lakebase source-bound exact search fixture; no broader engine/Unity qualification"
                    if remote_dsn is not None
                    else "owned local source-bound exact search fixture; no managed Lakebase/Unity service qualification"
                ),
            },
            indent=2,
        )
    )
finally:
    if started:
        command(bin / "pg_ctl", "-D", pg / "data", "-m", "fast", "-w", "stop")
    assert not (pg / "data/postmaster.pid").exists()
    print(
        "ownedServerStopped=true"
        if remote_dsn is None
        else "managedConnectionClosed=true"
    )
