# SPDX-License-Identifier: MIT OR Apache-2.0
"""Psycopg2 2.9 session lifetimes; no query compilation or driver dependency."""
from __future__ import annotations

from uuid import uuid4

from .session_policy import SessionError
from .session_sync import SyncSession


class _Savepoint:
    def __init__(self, connection):
        self.connection = connection
        # Only library-created identifiers enter control SQL, never model input.
        self.name = "umf_" + uuid4().hex

    def __enter__(self):
        with self.connection.cursor() as cursor:
            cursor.execute('SAVEPOINT "' + self.name + '"')
        return self

    def __exit__(self, kind, *_):
        with self.connection.cursor() as cursor:
            if kind is not None:
                cursor.execute('ROLLBACK TO SAVEPOINT "' + self.name + '"')
            cursor.execute('RELEASE SAVEPOINT "' + self.name + '"')


class _Connection:
    def __init__(self, native):
        if native.async_:
            raise SessionError("Psycopg2 asynchronous connections are unsupported; use Psycopg3 AsyncSession")
        self.native = native

    @property
    def info(self):
        return self

    @property
    def transaction_status(self):
        return self.native.get_transaction_status()

    def transaction(self):
        # Psycopg2's own context owns only an idle transaction. Nesting it in a
        # caller transaction would commit that caller, so use an actual savepoint.
        return self.native if self.transaction_status == 0 else _Savepoint(self.native)

    def cursor(self):
        return self.native.cursor()

    def close(self):
        self.native.close()


class Psycopg2Session(SyncSession):
    """Same per-call contract as SyncSession, for synchronous Psycopg2 >=2.9.

    The factory supplies a host-managed lease, yielding the original connection.
    ``open`` yields that original connection to executors. Adapter-owned leases
    use Psycopg2's transaction context (including autocommit connections); caller-
    owned leases use savepoints and never commit the outer transaction. Factories
    must discard closed connections, including failed cleanup, before pool reuse.
    """

    def _prepare_connection(self, connection):
        return _Connection(connection)
