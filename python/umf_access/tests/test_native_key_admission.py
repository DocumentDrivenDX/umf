"""Native catalog controls for the narrow raw-read Key equality profile."""
import os
import unittest

from umf_access.postgres_read import _KEYS


@unittest.skipUnless(os.environ.get("UMF_PG_TEST_DSN"), "explicit isolated PostgreSQL test cluster required")
class NativeKeyAdmission(unittest.TestCase):
    def test_default_keys_pass_but_alternate_equality_refuses(self):
        import psycopg
        with psycopg.connect(os.environ["UMF_PG_TEST_DSN"], autocommit=True) as connection:
            # All controls are transaction-local and roll back, including collations.
            with connection.transaction(force_rollback=True):
                connection.execute("CREATE TEMP TABLE umf_key_default (id text PRIMARY KEY)")
                connection.execute("CREATE TEMP TABLE umf_key_pattern (id text NOT NULL)")
                connection.execute("CREATE UNIQUE INDEX ON umf_key_pattern (id text_pattern_ops)")
                connection.execute("CREATE TEMP TABLE umf_key_collation (id text COLLATE \"C\" NOT NULL)")
                connection.execute("CREATE UNIQUE INDEX ON umf_key_collation (id COLLATE \"POSIX\")")
                def keys(table):
                    oid = connection.execute("SELECT pg_catalog.to_regclass(%s)::pg_catalog.oid", (table,)).fetchone()[0]
                    return connection.execute(_KEYS, (oid,)).fetchall()
                self.assertEqual(keys("umf_key_default"), [(["id"],)])
                self.assertEqual(keys("umf_key_pattern"), [])
                self.assertEqual(keys("umf_key_collation"), [])
                if connection.execute("SELECT 1 FROM pg_catalog.pg_collation WHERE collprovider = 'i' LIMIT 1").fetchone():
                    connection.execute("CREATE COLLATION pg_temp.umf_key_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false)")
                    connection.execute("CREATE TEMP TABLE umf_key_nondeterministic (id text COLLATE pg_temp.umf_key_ci NOT NULL)")
                    connection.execute("CREATE UNIQUE INDEX ON umf_key_nondeterministic (id COLLATE \"C\")")
                    connection.execute("INSERT INTO umf_key_nondeterministic VALUES ('a'), ('A')")
                    self.assertEqual(connection.execute("SELECT count(*) FROM umf_key_nondeterministic WHERE id = 'a'").fetchone()[0], 2)
                    self.assertEqual(keys("umf_key_nondeterministic"), [])
