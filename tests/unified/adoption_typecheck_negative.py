# SPDX-License-Identifier: MIT OR Apache-2.0
from adoption import Actions, Client, SyncActions, SyncClient, ProjectKey, CustomerKey, OpenProjectInput

async def wrong(client: Client, sync: SyncClient) -> None:
    OpenProjectInput(code='P1', title='Project', client=ProjectKey(code='wrong-record'))
    await Actions(client).open_project_validate(code='P1', title='Project', client=CustomerKey(code='C1'), note=12)
    await Actions(client).open_project_batch((CustomerKey(code='C1'),))
    await SyncActions(sync).open_project_batch((OpenProjectInput(code='P1', title='Project', client=CustomerKey(code='C1')),))
