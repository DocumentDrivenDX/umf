# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit optional parser adapter; no import-time parser loading or SQL effects."""
from importlib.metadata import PackageNotFoundError, version

from .sql_containment import PARSER, ContainmentRefused


class PglastParser:
    identity = PARSER

    def parse_json(self, source: str) -> str:
        try:
            installed = version('pglast')
        except PackageNotFoundError as error:
            raise ContainmentRefused('SQL_PARSER_UNAVAILABLE', '/parser') from error
        if installed != '7.20':
            raise ContainmentRefused('SQL_PARSER_VERSION', '/parser')
        from pglast.parser import parse_sql_json

        return parse_sql_json(source)
