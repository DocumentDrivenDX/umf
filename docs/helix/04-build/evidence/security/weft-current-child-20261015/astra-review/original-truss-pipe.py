"""Private bounded computation pipe; never a policy evaluator or native permit.

The host owns trusted executable/source custody and the actual held database
operation. Responses remain original bytes. The owner semantic driver and native
caller/source/cut admission must be composed before any public query can use it.
"""
import json
from decimal import Decimal
import os
from pathlib import Path
import selectors
import struct
import subprocess
from threading import Lock
from time import monotonic


class CurrentQueryPipeError(ValueError):
    """The original computation invocation cannot be used or retried."""


def _envelope(raw):
    def pairs(items):
        value = {}
        for key, child in items:
            if key in value:
                raise CurrentQueryPipeError('Duplicate computation response member')
            value[key] = child
        return value
    def constant(_):
        raise CurrentQueryPipeError('Non-JSON computation value')
    # Only the envelope ID is consumed here. Numeric tokens remain in raw bytes;
    # float parsing is deliberately disabled rather than rounding owner content.
    try:
        value = json.loads(raw.decode('utf8', errors='strict'), object_pairs_hook=pairs,
                           parse_float=Decimal, parse_constant=constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise CurrentQueryPipeError('Original UTF-8 JSON computation frame required') from error
    if type(value) is not dict or type(value.get('requestId')) is not str:
        raise CurrentQueryPipeError('Original computation request correlation required')
    request_id = value['requestId']
    if not 1 <= len(request_id) <= 64 or not request_id.isascii() or not all(
            c.isalnum() or c in '_-' for c in request_id):
        raise CurrentQueryPipeError('Bounded computation request correlation required')
    return value


class CurrentQueryPipe:
    """One pure child and one shared deadline, with no restart/retry behavior."""
    def __init__(self, command, *, timeout_seconds=5.0):
        if (os.name != 'posix' or type(command) is not tuple or not command or len(command) > 8
                or any(type(v) is not str or not v or '\0' in v for v in command)
                or not Path(command[0]).is_absolute()
                or type(timeout_seconds) not in (int, float)
                or not 0 < timeout_seconds <= 60):
            raise CurrentQueryPipeError('Trusted computation executable and bounded deadline required')
        self._deadline = monotonic() + timeout_seconds
        self._lock = Lock()
        self._seen = set()
        self._source_receipt = None
        self._closed = False
        self._cleanup_complete = False
        self._startup_error = None
        self._child = subprocess.Popen(command, stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       bufsize=0, close_fds=True,
                                       env={'PATH': os.defpath, 'LANG': 'C.UTF-8'})
        try:
            os.set_blocking(self._child.stdin.fileno(), False)
            os.set_blocking(self._child.stdout.fileno(), False)
        except BaseException as error:
            # Keep the instance/process handle reachable even if containment
            # cannot finish now. Dispatch is fenced; close() may be retried.
            self._startup_error = error
            try:
                self.close()
            except BaseException:
                pass

    def _wait(self, stream, event):
        remaining = self._deadline - monotonic()
        if remaining <= 0:
            raise CurrentQueryPipeError('Computation operation deadline expired')
        with selectors.DefaultSelector() as selected:
            selected.register(stream, event)
            if not selected.select(remaining):
                raise CurrentQueryPipeError('Computation operation deadline expired')

    def _read(self, count):
        result = bytearray()
        while len(result) < count:
            self._wait(self._child.stdout, selectors.EVENT_READ)
            try:
                chunk = os.read(self._child.stdout.fileno(), min(count - len(result), 65536))
            except BlockingIOError:
                continue
            if not chunk:
                raise CurrentQueryPipeError('Original computation response truncated')
            result.extend(chunk)
        return bytes(result)

    def exchange(self, request, *, source_receipt):
        """Return one complete original response; failures permanently close child."""
        if not self._lock.acquire(blocking=False):
            raise CurrentQueryPipeError('One original computation call at a time required')
        try:
            if self._closed:
                raise CurrentQueryPipeError('Original computation child is closed')
            if type(request) is not bytes or not 1 <= len(request) <= 4 * 1024 * 1024:
                raise CurrentQueryPipeError('Bounded original computation request required')
            if (type(source_receipt) is not str or len(source_receipt) != 64
                    or any(c not in '0123456789abcdef' for c in source_receipt)):
                raise CurrentQueryPipeError('Original source receipt correlation required')
            if self._source_receipt is not None and self._source_receipt != source_receipt:
                raise CurrentQueryPipeError('Original computation source receipt changed')
            self._source_receipt = source_receipt
            envelope = _envelope(request)
            if 'sourceReceipt' in envelope and envelope['sourceReceipt'] != source_receipt:
                raise CurrentQueryPipeError('Original computation request source receipt changed')
            request_id = envelope['requestId']
            if request_id in self._seen or len(self._seen) >= 4098:
                raise CurrentQueryPipeError('Unique bounded computation calls required')
            self._seen.add(request_id)
            frame = memoryview(struct.pack('>I', len(request)) + request)
            while frame:
                self._wait(self._child.stdin, selectors.EVENT_WRITE)
                try:
                    count = os.write(self._child.stdin.fileno(), frame)
                except BlockingIOError:
                    continue
                if count <= 0:
                    raise CurrentQueryPipeError('Original computation request interrupted')
                frame = frame[count:]
            size = struct.unpack('>I', self._read(4))[0]
            if not 1 <= size <= 16 * 1024 * 1024:
                raise CurrentQueryPipeError('Bounded complete computation response required')
            response = self._read(size)
            envelope = _envelope(response)
            if envelope['requestId'] != request_id or envelope.get('sourceReceipt') != source_receipt:
                raise CurrentQueryPipeError('Original computation response correlation changed')
            # Any already-buffered extra output is unsolicited, not another reply.
            with selectors.DefaultSelector() as selected:
                selected.register(self._child.stdout, selectors.EVENT_READ)
                if selected.select(0):
                    extra = os.read(self._child.stdout.fileno(), 1)
                    if extra:
                        raise CurrentQueryPipeError('Unsolicited computation output')
            if monotonic() >= self._deadline:
                raise CurrentQueryPipeError('Computation operation deadline expired')
            return response
        except BaseException:
            self.close()
            raise
        finally:
            self._lock.release()

    def close(self):
        self._closed = True
        if self._cleanup_complete:
            return
        # Dispatch fencing is separate from confirmed process/pipe cleanup.
        # A failed kill/join retains the handle and permits another close().
        try:
            if self._child.poll() is None:
                try:
                    self._child.kill()
                except ProcessLookupError:
                    pass
            self._child.wait(timeout=2)
        finally:
            if self._child.poll() is not None:
                failure = None
                for stream in (self._child.stdin, self._child.stdout):
                    try:
                        stream.close()
                    except BaseException as error:
                        failure = error
                self._cleanup_complete = self._child.stdin.closed and self._child.stdout.closed
                if failure is not None:
                    raise failure

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
