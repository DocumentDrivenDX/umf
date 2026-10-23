# SPDX-License-Identifier: MIT OR Apache-2.0
"""Offline administrative containment check. Never opens a database connection."""
import argparse
import json
import sys
from pathlib import Path

from .sql_containment import MAX_BYTES, check_sql_containment
from .sql_containment_parser import PglastParser


def main(argv=None):
    parser = argparse.ArgumentParser(prog='umf-sql-check', allow_abbrev=False)
    parser.add_argument('--sql', required=True, type=Path)
    parser.add_argument('--policy', required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        with args.sql.open('rb') as handle:
            source = handle.read(MAX_BYTES + 1).decode('utf-8')
        with args.policy.open('rb') as handle:
            raw_policy = handle.read(MAX_BYTES + 1)
        if len(raw_policy) > MAX_BYTES:
            raise ValueError('policy-limit')
        result = check_sql_containment(source, json.loads(raw_policy), PglastParser())
    except (OSError, ValueError, UnicodeError):
        result = {'status': 'blocked', 'executionAuthorized': False,
                  'diagnostics': [{'code': 'SQL_INPUT_INVALID', 'path': '/input', 'offset': None}]}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] == 'checked' else 1


if __name__ == '__main__':
    sys.exit(main())
