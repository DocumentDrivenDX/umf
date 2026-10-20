# SPDX-License-Identifier: MIT OR Apache-2.0
from datetime import date
from decimal import Decimal
from domain_demo import SyncClient, DemoCreateInput, ExactTimestamp


def invalid(client: SyncClient) -> None:
    DemoCreateInput(id='r', owner='a', day=date.today(), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=Decimal(1), status='other', rank=2, tag='a', active=True)
    DemoCreateInput(id='r', owner='a', day=date.today(), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=Decimal(1), status='draft', rank=10, tag='a', active=True)
    DemoCreateInput(id='r', owner='a', day=date.today(), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=Decimal(1), status='draft', rank=2, tag='a', active=False)
    DemoCreateInput(id='r', owner='a', day=date.today(), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=1.5, status='draft', rank=2, tag='a', active=True)
    client.modules.demo.touch(id='r', owner='a', day=date.today(), at=ExactTimestamp('2026-01-01T00:00:00Z'), amount=Decimal(1), status='draft', rank=2, tag='a', active=True, idempotency_key='k')
