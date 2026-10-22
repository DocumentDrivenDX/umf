// SPDX-License-Identifier: MIT OR Apache-2.0
import {referenceHandlerImage} from './actions-reference/sandbox';
// Install the reviewed runtime before tests; invoking a handler still forbids pulls.
for (const image of ['postgres:17.9', referenceHandlerImage]) {
 const child = Bun.spawn(['docker', 'pull', image], {stdout: 'inherit', stderr: 'inherit'});
 if (await child.exited) throw new Error(`Cannot install action test runtime: ${image}`);
}
