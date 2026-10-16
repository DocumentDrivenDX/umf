"""Immutable source-frozen native programs; no execution or compiler discovery."""
from __future__ import annotations
from collections.abc import Mapping
from dataclasses import dataclass
import hashlib
import json
from typing import Any
from .types import RUNTIME_IDENTITY, ActionRef
from .protocols import ActionRefused
from .reviewed import parameter_style

class ProgramBuildError(ValueError):
    def __init__(self, original_json: str):
        self.original_json=original_json
        super().__init__('WEFT_BLOCKED: '+original_json)


def program_json(text: str) -> Any:
    def members(pairs: list[tuple[str,Any]]) -> dict[str,Any]:
        result={}
        for key,value in pairs:
            if key in result:raise ValueError('duplicate owner program member')
            result[key]=value
        return result
    def constant(value: str) -> Any:
        raise ValueError('nonfinite owner JSON')
    return json.loads(text,object_pairs_hook=members,parse_constant=constant)


def canonical_json(value: Any) -> str:
    # The Weft owner uses UTF-16 ordering, including non-BMP identifiers.
    def ordered(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: ordered(item[key]) for key in sorted(item, key=lambda key: key.encode('utf-16-be'))}
        if isinstance(item, list): return [ordered(v) for v in item]
        return item
    return json.dumps(ordered(value), ensure_ascii=False, separators=(',', ':'), allow_nan=False)


@dataclass(frozen=True)
class NativeProgram:
    original_json: str
    statements_json: str
    bundle_input_digest: str
    runtime_abi: tuple[str,str,str] = RUNTIME_IDENTITY

    @classmethod
    def build(cls, compiler: Any, request: Mapping[str, Any], *, bundle_input_digest: str) -> NativeProgram:
        """Explicit build-time compiler call; runtime never loads a compiler."""
        version=request.get('version')
        if version=='weft.native-action/0.1':method=compiler.compile_native_action_json
        elif version=='weft.native-bulk/0.1':method=compiler.compile_native_bulk_json
        elif version=='weft.search/0.1':method=compiler.compile_search_json
        else:method=None
        if method is None:raise ActionRefused('WEFT_PROGRAM_INTERFACE')
        original = method(canonical_json(dict(request)))
        program = program_json(original)
        if program.get('status') != 'compiled':
            raise ProgramBuildError(original)
        statements: dict[str, Any] = {}
        def visit(value: Any, path: str) -> None:
            if isinstance(value, dict):
                if set(value) == {'sql', 'parameters'}:
                    sql, order = (value['sql'],tuple(range(len(value['parameters'])))) if program.get('profile') in ('umf.actions.native-delta/0.1','umf.actions.native-delta-bulk/0.1') else parameter_style(value['sql'], len(value['parameters']))
                    statements[path] = {'sql': sql, 'order': order}
                else:
                    for key, child in value.items(): visit(child, path + '/' + key)
            elif isinstance(value, list):
                for index, child in enumerate(value): visit(child, path + '/' + str(index))
        visit(program, '')
        result = cls(original, canonical_json(statements), bundle_input_digest)
        result.checked()
        return result


    def bind(self, action: ActionRef[Any,Any]) -> None:
        program=self.checked()
        if action.source is None or getattr(action.input_type,'UMF_BUNDLE_INPUT_DIGEST',None)!=self.bundle_input_digest:
            raise ActionRefused('CATALOG_STALE')
        source=program['source']
        for name,attribute in [('documentId','document_id'),('coreVersion','core_version'),('module','module'),('action','action'),('documentSha256','document_sha256'),('actionPointer','action_pointer')]:
            if source[name]!=getattr(action.source,attribute):raise ActionRefused('NATIVE_ACTION_SOURCE_MISMATCH')
        if source['invocation']!={'id':action.source.invocation_id,'version':action.source.invocation_version}:
            raise ActionRefused('NATIVE_INVOCATION_PROFILE')

    def checked(self) -> dict[str, Any]:
        if len(self.original_json.encode()) > 4_194_304 or len(self.statements_json.encode()) > 8_388_608:
            raise ActionRefused('NATIVE_PROGRAM_BUDGET')
        if self.runtime_abi != RUNTIME_IDENTITY or len(self.bundle_input_digest)!=64 or any(c not in '0123456789abcdef' for c in self.bundle_input_digest):
            raise ActionRefused('NATIVE_PROGRAM_ABI')
        program = program_json(self.original_json)
        if program.get('version')=='weft.native-action/0.1':
            if program.get('profile')=='umf.actions.native-delta/0.1':
                if program.get('target')!='spark-delta4':raise ActionRefused('NATIVE_PROGRAM_PROFILE')
            elif program.get('profile')!='umf.actions.native-sql/0.1' or program.get('target') not in ('postgresql18','lakebase18'):
                raise ActionRefused('NATIVE_PROGRAM_PROFILE')
        if program.get('profile')=='umf.actions.native-delta-bulk/0.1' and (program.get('version')!='weft.native-bulk/0.1' or program.get('target')!='spark-delta4'):raise ActionRefused('NATIVE_PROGRAM_PROFILE')
        pin = program.pop('structuralDigest', {})
        if pin.get('owner') != {'weft.native-action/0.1':('weft-databricks-native-action' if program.get('profile')=='umf.actions.native-delta/0.1' and program.get('target')=='spark-delta4' else 'weft-postgresql-native-action'),'weft.native-bulk/0.1':('weft-databricks-native-bulk' if program.get('profile')=='umf.actions.native-delta-bulk/0.1' and program.get('target')=='spark-delta4' else 'weft-postgresql-native-bulk'),'weft.search/0.1':'weft-postgresql-search'}.get(program.get('version')) or pin.get('version') != '0.1' or hashlib.sha256(canonical_json(program).encode()).hexdigest() != pin.get('sha256'):
            raise ActionRefused('NATIVE_PROGRAM_INTEGRITY')
        program['structuralDigest'] = pin
        if program.get('status') != 'compiled' or program.get('version') not in ('weft.native-action/0.1','weft.native-bulk/0.1','weft.search/0.1'):
            raise ActionRefused('NATIVE_PROGRAM_PROFILE')
        # Re-derive only parameter style, never SQL structure or semantics.
        expected: dict[str, Any] = {}
        def visit(value: Any, path: str) -> None:
            if isinstance(value, dict):
                if set(value) == {'sql', 'parameters'}:
                    sql, order = (value['sql'],tuple(range(len(value['parameters'])))) if program.get('profile') in ('umf.actions.native-delta/0.1','umf.actions.native-delta-bulk/0.1') else parameter_style(value['sql'], len(value['parameters']))
                    expected[path] = {'sql': sql, 'order': list(order)}
                else:
                    for key, child in value.items(): visit(child, path + '/' + key)
            elif isinstance(value, list):
                for index, child in enumerate(value): visit(child, path + '/' + str(index))
        visit(program, '')
        if program_json(self.statements_json) != expected:
            raise ActionRefused('NATIVE_PARAMETER_STYLE_INTEGRITY')
        return program


