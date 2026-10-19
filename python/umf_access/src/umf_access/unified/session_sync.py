# SPDX-License-Identifier: MIT OR Apache-2.0
"""Psycopg 3 synchronous per-call leases; the host owns connections and pools."""
from __future__ import annotations

import os
import sys
import threading
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any, Literal

from .session_policy import GET_SETTING, ROLE_CHECK, SET_LOCAL, SessionError, SessionIdentity, SessionPolicy, verify_role


@contextmanager
def _lease(factory, identity):
    lease = factory(identity)
    connection = lease.__enter__()
    try:
        yield connection
    except BaseException:
        try:
            lease.__exit__(*sys.exc_info())
        except BaseException:
            connection.close()
            raise
        raise
    else:
        try:
            lease.__exit__(None, None, None)
        except BaseException:
            connection.close()
            raise


class SyncSession:
    """Use a factory returning a direct-connection or pool lease context manager.

    The factory runs once per call, after authentication. It must release the
    connection on exit and discard closed/broken connections. This adapter never
    creates a pool, changes autocommit, or closes a healthy caller connection.
    Create this object and its host pool after spawning a child process.
    """
    def __init__(self, factory: Callable[[SessionIdentity], AbstractContextManager[Any]], policy: SessionPolicy,
                 *, transaction_owner: Literal["adapter", "caller"] = "adapter"):
        if transaction_owner not in ("adapter", "caller"):
            raise ValueError("transaction_owner must be adapter or caller")
        self.transaction_owner = transaction_owner
        self.factory = factory
        self.policy = policy
        self._pid = os.getpid()
        self._active: set[int] = set()
        self._lock = threading.Lock()

    @contextmanager
    def open(self, identity: SessionIdentity, *, read_only: bool = True) -> Iterator[Any]:
        if os.getpid() != self._pid:
            raise SessionError("create session factories and pools after process creation")
        if type(read_only) is not bool:
            raise ValueError("read_only must be bool")
        settings = self.policy.settings(identity)  # reject before acquiring a lease
        with _lease(self.factory, identity) as connection:
            key = id(connection)
            with self._lock:
                if key in self._active:
                    raise SessionError("connection already leased by this adapter")
                self._active.add(key)
            entered = False
            try:
                status = int(connection.info.transaction_status)
                if status not in (0, 2):
                    raise SessionError("connection is not idle or in a healthy caller transaction")
                owned = self.transaction_owner == "adapter"
                if status != (0 if owned else 2):
                    raise SessionError("connection state differs from explicit transaction ownership")
                transaction = connection.transaction()
                try:
                    transaction.__enter__()
                    entered = True
                except BaseException:
                    connection.close()
                    raise
                with connection.cursor() as cursor:
                    if owned:
                        if read_only:
                            cursor.execute("SET TRANSACTION READ ONLY")
                    elif read_only:
                        cursor.execute(GET_SETTING, ("transaction_read_only",))
                        if cursor.fetchone() != ("on",):
                            raise SessionError("caller transaction must already be read-only")
                    previous = {}
                    for name in settings:
                        cursor.execute(GET_SETTING, (name,))
                        previous[name] = cursor.fetchone()[0]
                    for name, value in settings.items():
                        cursor.execute(SET_LOCAL, (name, value))
                    cursor.execute(ROLE_CHECK)
                    session_user = verify_role(cursor.fetchone(), settings["role"])
                    effective = {}
                    for name in settings:
                        cursor.execute(GET_SETTING, (name,))
                        effective[name] = cursor.fetchone()[0]
                yield connection
                with connection.cursor() as cursor:
                    cursor.execute(ROLE_CHECK)
                    verify_role(cursor.fetchone(), settings["role"], session_user)
                    for name, value in effective.items():
                        cursor.execute(GET_SETTING, (name,))
                        if cursor.fetchone()[0] != value:
                            raise SessionError("session settings changed during execution")
                    # RELEASE SAVEPOINT preserves SET LOCAL. Restore the caller's
                    # values explicitly before releasing a successful nested lease.
                    if not owned:
                        for name, value in previous.items():
                            cursor.execute(SET_LOCAL, (name, value))
                entered = False
                try:
                    transaction.__exit__(None, None, None)
                except BaseException:
                    connection.close()  # uncertain commit/cleanup must not recycle
                    raise
            except BaseException:
                if entered:
                    try:
                        transaction.__exit__(*sys.exc_info())
                    except BaseException:
                        connection.close()
                        raise
                raise
            finally:
                with self._lock:
                    self._active.remove(key)
