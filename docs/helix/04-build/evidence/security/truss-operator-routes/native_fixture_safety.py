"""Private evidence-producer failure hygiene; not runtime settlement authority."""
import json
from pathlib import Path


def sanitized_message(error, sensitive):
    message = str(error)
    for secret in sensitive:
        if secret:
            message = message.replace(secret, '[redacted fixture secret]')
    return message


def record_failure(path, error, sensitive, **evidence):
    original = str(error)
    message = sanitized_message(error, sensitive)
    payload = dict(evidence, status='failed', error=type(error).__name__,
                   message=message, diagnosticRedacted=(message != original))
    encoded = json.dumps(payload, indent=2)
    # Failure diagnostics may include nested native evidence. Fixture secrets are
    # generated URL-safe ASCII; also cover escaped JSON spellings in tests.
    redacted = False
    for secret in sensitive:
        if secret:
            spelling = json.dumps(secret)[1:-1]
            if spelling in encoded:
                encoded = encoded.replace(spelling, '[redacted fixture secret]')
                redacted = True
    if redacted:
        payload = json.loads(encoded)
        payload['diagnosticRedacted'] = True
        encoded = json.dumps(payload, indent=2)
    Path(path).write_text(encoded + '\n')


def raise_sanitized(error, sensitive):
    # Suppress the original exception's traceback/context, not just its message
    # in the receipt. Preserve its type name as bounded diagnostic provenance.
    raise RuntimeError(type(error).__name__ + ': ' + sanitized_message(error, sensitive)) from None



def fail_safely(path, error, sensitive, **evidence):
    # An unavailable diagnostic sink cannot expose the original secret-bearing
    # exception through Python's implicit exception context.
    try:
        record_failure(path, error, sensitive, **evidence)
    finally:
        raise_sanitized(error, sensitive)


def cleanup_owned(connections, server):
    """Attempt every owned close and cluster cleanup; retain errors privately."""
    errors = []
    try:
        for connection in connections:
            try:
                connection.close()
            except BaseException as error:
                errors.append(error)
    finally:
        try:
            server.cleanup()
        except BaseException as error:
            errors.append(error)
    return tuple(errors)
