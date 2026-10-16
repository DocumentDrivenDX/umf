"""Bounded spike emitter, not CONTRACT-067 implementation or semantic admission."""
from pathlib import Path
import base64
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
RUNTIME_VERSION = "0.0.0+tp001.spike"
RUNTIME_ABI = "umf-access-runtime/0.1"
CARRIERS = {"string": "str", "decimal": "Decimal", "instant": "datetime", "string-list": "list[str]"}

SUPPORT = '''class OrderColumns:
    order_id: Column[Order, str] = Column()
    amount: Column[Order, Decimal] = Column()
    memo: Column[Order, str | None] = Column()
    placed_at: Column[Order, datetime] = Column()
    customer: Related[Order, CustomerKey] = Related()

class OrderUpdate(TypedDict, total=False):
    amount: Decimal
    memo: str | None

class OrderRanked:
    def into(self, model: type[OrderSummary]) -> SummaryRanked: raise NotImplementedError
    def top(self, k: int) -> Terminal[SearchResult[Order]]: raise NotImplementedError

class SummaryRanked:
    def top(self, k: int) -> Terminal[SearchResult[OrderSummary]]: raise NotImplementedError

class OrderQuery(Query["Order", "Order", "OrderKey"]):
    def update(self, **values: Unpack[OrderUpdate]) -> None: raise NotImplementedError
    def into(self, model: type[OrderSummary]) -> Query[Order, OrderSummary, OrderKey]: raise NotImplementedError
    def search(self) -> OrderRanked: raise NotImplementedError

class CustomerColumns:
    name: Column[Customer, str] = Column()

'''

def emit_models(fixture: dict) -> str:
    if fixture['contract'] != 'tp001-bounded-generated-fixture/0.1' or fixture['coreVersion'] != '0.8.0':
        raise ValueError('fixture identity')
    output = '''"""Generated compatibility fixture. Not production generator output."""
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import ClassVar, TypedDict, Unpack, final
from pydantic import BaseModel, ConfigDict, MISSING
from umf_access import Column, Query, Related, Terminal, SearchResult

class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True,
                              revalidate_instances="always", hide_input_in_errors=True)

'''
    output += SUPPORT
    for model in fixture['models']:
        name = model['name']
        if not name.isidentifier() or name.startswith('_'):
            raise ValueError('fixture model name')
        output += f'@final\nclass {name}(StrictModel):\n'
        if model.get('queryRoot'):
            output += '    c: ClassVar[OrderColumns] = OrderColumns()\n    objects: ClassVar[OrderQuery] = OrderQuery()\n'
        if model.get('columns'):
            output += '    c: ClassVar[CustomerColumns] = CustomerColumns()\n'
        for field in model['fields']:
            if not field['name'].isidentifier() or field['name'].startswith('_'):
                raise ValueError('fixture field name')
            annotation = CARRIERS[field['carrier']]
            if field.get('null'): annotation += ' | None'
            if field.get('missing'): annotation += ' | MISSING'
            default = ' = MISSING' if field.get('missing') else ''
            output += f'    {field["name"]}: {annotation}{default}\n'
        output += '    def __init_subclass__(cls, **kwargs: object) -> None:\n        raise TypeError("generated model is final")\n\n'
    output += '''def encode_patch(value: OrderPatch) -> dict[str, object]:
    checked = OrderPatch.model_validate({name: getattr(value, name) for name in OrderPatch.model_fields})
    return {name: getattr(checked, name) for name in OrderPatch.model_fields if getattr(checked, name) is not MISSING}
'''
    return output

def build_wheel(destination: Path) -> Path:
    """Deterministic pure-Python fixture wheel; no external build backend needed."""
    dist_info = f'umf_access-{RUNTIME_VERSION}.dist-info'
    files = {
        'umf_access/__init__.py': ROOT.joinpath('runtime_fixture.py').read_bytes() + f'\n__version__ = "{RUNTIME_VERSION}"\nRUNTIME_ABI = "{RUNTIME_ABI}"\n'.encode(),
        'umf_access/py.typed': b'',
        f'{dist_info}/METADATA': f'Metadata-Version: 2.1\nName: umf-access\nVersion: {RUNTIME_VERSION}\nSummary: B-TP-001 fixture runtime only; not a release\nRequires-Python: >=3.12\nRequires-Dist: pydantic==2.14.1\n'.encode(),
        f'{dist_info}/WHEEL': b'Wheel-Version: 1.0\nGenerator: tp001-bounded-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
    }
    records=[]
    for name, content in sorted(files.items()):
        digest=base64.urlsafe_b64encode(hashlib.sha256(content).digest()).decode().rstrip('=')
        records.append(f'{name},sha256={digest},{len(content)}')
    records.append(f'{dist_info}/RECORD,,')
    files[f'{dist_info}/RECORD']= ('\n'.join(records)+'\n').encode()
    destination.mkdir(exist_ok=True)
    wheel = destination / f'umf_access-{RUNTIME_VERSION}-py3-none-any.whl'
    with zipfile.ZipFile(wheel, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, content in sorted(files.items()):
            info=zipfile.ZipInfo(name, (2026,10,15,0,0,0))
            info.external_attr=0o100644 << 16
            archive.writestr(info, content)
    return wheel

if __name__ == '__main__':
    generated = ROOT / 'generated'
    generated.mkdir(exist_ok=True)
    models=emit_models(json.loads((ROOT/'fixture.json').read_text()))
    (generated/'models.py').write_text(models)
    calls=(ROOT/'calls-template.txt').read_text().replace('from surface import', 'from umf_access import')
    (generated/'calls.py').write_text(calls)
    print(build_wheel(ROOT/'artifacts'))
