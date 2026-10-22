# SPDX-License-Identifier: MIT OR Apache-2.0
from native_demo import SyncClient, DemoCreateInput, Recovered


def invalid(client: SyncClient, recovered: Recovered) -> None:
    client.modules.demo.read_many(owner=1)
    client.modules.demo.create(id='key', owner='alice')
    client.modules.demo.create_batch_batch(items=(DemoCreateInput(id='key', owner='alice'),), idempotency_key='key')
    client.modules.demo.execute('SELECT arbitrary')
    print(recovered.items)
