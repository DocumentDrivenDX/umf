// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializePythonClientRustDefaultV4} from '../../src/access/rust-default-v4';

const failure=(globalThis as any)[Symbol.for('umf.rust-codegen-default-v4.init-failure')];
await initializePythonClientRustDefaultV4(()=>Promise.reject(failure));
