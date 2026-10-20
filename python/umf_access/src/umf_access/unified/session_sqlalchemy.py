# SPDX-License-Identifier: MIT OR Apache-2.0
"""SQLAlchemy Core session control through its own transaction and execution API."""
from __future__ import annotations

from .session_async import AsyncSession
from .session_policy import SessionError
from .session_sync import SyncSession


class _State:
    def __init__(self, core, *, asynchronous=False):
        dialect = getattr(core, "dialect", None)
        if dialect is None:
            raise SessionError("SQLAlchemy Core Connection required; ORM Session is unsupported")
        drivers = ("psycopg",) if asynchronous else ("psycopg", "psycopg2")
        if dialect.name != "postgresql" or dialect.driver not in drivers:
            raise SessionError("SQLAlchemy sessions require PostgreSQL with a supported Psycopg driver")
        if bool(dialect.is_async) != asynchronous:
            raise SessionError("SQLAlchemy connection scheduling differs from the session adapter")
        self.core = core
        if core.closed or core.invalidated:
            raise SessionError("SQLAlchemy connection must be open and valid")
        self.driver = core.connection.driver_connection
        if self.driver.autocommit:
            raise SessionError("SQLAlchemy DBAPI autocommit cannot establish the required native transaction")

    @property
    def info(self):
        return self

    @property
    def transaction_status(self):
        transaction = self.core.get_transaction()
        if transaction is not None and hasattr(transaction, "prepare"):
            raise SessionError("SQLAlchemy two-phase transactions are unsupported")
        if self.core.dialect.driver == "psycopg":
            status = int(self.driver.info.transaction_status)
        else:
            status = self.driver.get_transaction_status()
        # An autobegun SQLAlchemy transaction may not yet have reached the
        # server. Refuse it rather than guessing which layer owns its lifetime.
        if self.core.in_transaction() != (status in (2, 3)):
            raise SessionError("SQLAlchemy and native transaction states differ")
        return status


class _Cursor:
    def __init__(self, connection):
        self.connection = connection
        self.result = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        if self.result is not None:
            self.result.close()

    def execute(self, statement, parameters=None):
        if self.result is not None:
            self.result.close()
        self.result = self.connection.exec_driver_sql(statement, parameters, execution_options={'no_parameters':parameters is None})

    def fetchone(self):
        row = self.result.fetchone()
        return None if row is None else tuple(row)

    def fetchall(self):
        return [tuple(row) for row in self.result.fetchall()]

    @property
    def native_description(self):
        # SQLAlchemy's key view omits DBAPI type OIDs. Retain the live native
        # cursor metadata for the once-cold typed query description check.
        cursor=getattr(self.result,'cursor',None)
        if cursor is None or cursor.description is None:
            raise SessionError('declared query description unavailable')
        return cursor.description

    @property
    def description(self):
        names = self.result.keys()
        return tuple((name,) for name in names)


class _SyncConnection(_State):
    def transaction(self):
        return self.core.begin_nested() if self.core.in_transaction() else self.core.begin()

    def cursor(self):
        return _Cursor(self.core)

    def close(self):
        try:
            self.core.invalidate()
        finally:
            self.core.close()


class _AsyncCursor(_Cursor):
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        super().__exit__(*args)

    async def execute(self, statement, parameters=None):
        if self.result is not None:
            self.result.close()
        self.result = await self.connection.exec_driver_sql(statement, parameters, execution_options={'no_parameters':parameters is None})

    async def fetchone(self):
        return super().fetchone()

    async def fetchall(self):
        return super().fetchall()


class _AsyncConnection(_State):
    def __init__(self, native):
        core = getattr(native, "sync_connection", None)
        super().__init__(core, asynchronous=True)
        self.native = native

    def transaction(self):
        return self.native.begin_nested() if self.native.in_transaction() else self.native.begin()

    def cursor(self):
        return _AsyncCursor(self.native)

    async def close(self):
        try:
            await self.native.invalidate()
        finally:
            await self.native.close()


class SQLAlchemySession(SyncSession):
    """Per-call SQLAlchemy 2 PostgreSQL Core leases, using Psycopg2 or Psycopg3.

    Supply a factory such as ``lambda identity: engine.connect()`` or a context
    manager lending an existing Core Connection. Caller ownership requires an
    actual active native transaction. DBAPI autocommit is refused. ORM Sessions
    and other dialects/drivers are outside this adapter's contract.
    """

    def _prepare_connection(self, connection):
        return _SyncConnection(connection)

    def _control_cursor(self, connection):
        return connection.cursor()


class AsyncSQLAlchemySession(AsyncSession):
    """Async SQLAlchemy 2 Core counterpart, using its PostgreSQL Psycopg3 driver."""

    def _prepare_connection(self, connection):
        return _AsyncConnection(connection)

    def _control_cursor(self, connection):
        return connection.cursor()
