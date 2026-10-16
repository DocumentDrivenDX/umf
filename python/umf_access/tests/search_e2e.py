import asyncio
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import timedelta
from importlib.metadata import version
from pathlib import Path

root = Path(__file__).resolve().parents[3]
generated = Path(os.environ["UMF_SEARCH_GENERATED_ROOT"])
sys.path.insert(0, str(generated))
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

pg = Path(tempfile.mkdtemp(prefix="umf-search-pg18-", dir="/private/tmp"))
(pg / "socket").mkdir()
bin = Path("/opt/homebrew/opt/postgresql@18/bin")
started = False
cases = []


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
from search_docs.models import Doc
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
""")
model = (root / "fixtures/access/search/model.json").read_text()
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
                for f in ["id", "body"]
            ],
        }
    ],
    "relationships": [],
}
config = {
    "package": "search_docs",
    "modules": ["search_declarations"],
    "targets": [
        {
            "id": "local",
            "kind": "postgresql",
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
                    "extensionVersion": "0.8.7",
                }
            ],
        }
    ],
}
(generated / "original-model.json").write_text(model)
config["weft"] = {"distribution": "weft-sql", "version": version("weft-sql")}
config["umf"] = {
    "documents": [
        {
            "path": "original-model.json",
            "sha256": hashlib.sha256(model.encode()).hexdigest(),
        }
    ]
}
(generated / "search-config.json").write_text(json.dumps(config))
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

control = Path(os.environ["UMF_PGVECTOR_CONTROL_ROOT"]).resolve()
if any(c.isspace() for c in str(control)):
    raise ValueError("owned fixture control path must have no whitespace")
try:
    command(
        bin / "initdb", "-D", pg / "data", "-U", "sdk_test", "-A", "trust", "--no-sync"
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
    admin.execute("CREATE EXTENSION vector VERSION '0.8.7'")
    assert admin.execute(
        "SELECT extversion FROM pg_extension WHERE extname='vector'"
    ).fetchone() == ("0.8.7",)
    admin.execute("CREATE ROLE search_user LOGIN NOSUPERUSER NOBYPASSRLS")
    admin.execute("CREATE ROLE hidden_user NOLOGIN")
    admin.execute("CREATE SCHEMA search_app")
    admin.execute("GRANT USAGE ON SCHEMA search_app TO search_user")
    admin.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    admin.execute(
        'CREATE TABLE search_app.docs (id text COLLATE "C" PRIMARY KEY,body text COLLATE "C" NOT NULL,embedding public.vector(3) NOT NULL,owner text NOT NULL)'
    )
    admin.execute(
        "INSERT INTO search_app.docs VALUES ('a','cats cats','[1,0,0]','search_user'),('b','dogs cats','[0.5,0.5,0]','search_user'),('c','dogs','[0,1,0]','search_user'),('hidden','cats','[1,0,0]','hidden_user')"
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
    assert text.stale == 0 and not text.partial and not text.approximate
    cases.append(
        "actual native plain keyword ranking and RLS; whole-row vector decoding"
    )
    plain = queries.keyword(target, term="cats | dogs")
    assert [h.item.id for h in plain] == ["b"]
    assert len(queries.keyword(target, term="cats') OR true--")) == 0
    cases.append("plain keyword terms do not interpret boolean operators or SQL text")
    vector = queries.vector(target, q=(1.0, 0.0, 0.0))
    assert [h.item.id for h in vector] == ["a", "b", "c"]
    assert vector[0].score.kind == "cosine-distance" and vector[0].score.value == 0.0
    assert vector[1].item.embedding == (0.5, 0.5, 0.0)
    filtered = queries.filtered(target, q=(1.0, 0.0, 0.0), minimum="b")
    assert [h.item.id for h in filtered] == ["b", "c"]
    cases.append(
        "actual pgvector0.8.7 exact distance, complete pre-filtering and Key tie order"
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
                "versions": {"postgresql": "18.6", "pgvector": "0.8.7"},
                "temporal": "HELD",
                "scope": "owned local source-bound exact search fixture; no managed Lakebase/Unity service qualification",
            },
            indent=2,
        )
    )
finally:
    if started:
        command(bin / "pg_ctl", "-D", pg / "data", "-m", "fast", "-w", "stop")
    assert not (pg / "data/postmaster.pid").exists()
    print("ownedServerStopped=true")
