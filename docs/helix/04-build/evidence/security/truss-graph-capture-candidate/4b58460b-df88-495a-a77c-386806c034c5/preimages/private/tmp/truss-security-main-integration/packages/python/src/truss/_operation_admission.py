"""Private one-use admission custody; not a native confirmation/authority factory.

The original admitted producer must register its own confirmations. Trusted port
callbacks still establish native lifetime/issuer/context/account authority; this
registry and its tests cannot establish those facts or grant SQL privileges.
"""
from dataclasses import dataclass
import inspect
from threading import Lock


class AdmissionRefusal(ValueError):
    pass


@dataclass(frozen=True, slots=True, eq=False)
class _Confirmation:
    pass


def _sync(value):
    if inspect.isgenerator(value):
        value.close()
        raise AdmissionRefusal('Deferred admission execution is unavailable')
    if inspect.isawaitable(value) or inspect.isasyncgen(value):
        if inspect.iscoroutine(value):
            value.close()
        raise AdmissionRefusal('Synchronous original admission port required')
    return value


class AdmissionCustody:
    """Original producer-only registry for one transaction's admission lifetime.

    Capacity is selected before construction by the original enclosing account.
    Consumption never refunds it. The host retains recovery custody externally.
    No public package export or native producer is supplied here.
    """
    def __init__(self, producer, maximum, verify, admit):
        if producer is None or type(maximum) is not int or maximum < 1:
            raise AdmissionRefusal('Original producer and finite capacity required')
        if any(not callable(f) or inspect.iscoroutinefunction(f) or inspect.isasyncgenfunction(f)
               or inspect.isgeneratorfunction(f)
               or inspect.iscoroutinefunction(getattr(f,'__call__',None))
               or inspect.isasyncgenfunction(getattr(f,'__call__',None))
               or inspect.isgeneratorfunction(getattr(f,'__call__',None))
               for f in (verify,admit)):
            raise AdmissionRefusal('Synchronous original port required')
        self._producer = producer
        self._maximum = maximum
        self._verify = verify
        self._admit = admit
        self._entries = {}
        self._originals = {}
        self._closed = False
        self._busy = False
        self._lock = Lock()

    def register_confirmed(self, producer, original):
        with self._lock:
            if producer is not self._producer or original is None or self._closed or self._busy:
                raise AdmissionRefusal('Original open producer custody required')
            if id(original) in self._originals or len(self._entries) >= self._maximum:
                raise AdmissionRefusal('Confirmation consumed or capacity exhausted')
            ticket = _Confirmation()
            self._originals[id(original)] = original
            self._entries[id(ticket)] = [ticket,original,False]
            return ticket

    def close(self, producer):
        with self._lock:
            if producer is not self._producer:
                raise AdmissionRefusal('Original producer custody required')
            self._closed = True

    def admit_once(self, ticket, original_input):
        with self._lock:
            entry = self._entries.get(id(ticket))
            if self._closed or self._busy or entry is None or entry[0] is not ticket or entry[2]:
                raise AdmissionRefusal('Unavailable or consumed confirmation')
            entry[2] = True
            self._busy = True
            original = entry[1]
        try:
            if _sync(self._verify(original,original_input)) is not None:
                raise AdmissionRefusal('Original verification must complete or raise')
            with self._lock:
                if self._closed:
                    raise AdmissionRefusal('Admission custody closed')
            return _sync(self._admit(original,original_input))
        except BaseException:
            # Escaped port failure supplies no safe continuation evidence.
            with self._lock:
                self._closed = True
            raise
        finally:
            with self._lock:
                self._busy = False
