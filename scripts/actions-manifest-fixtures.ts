// SPDX-License-Identifier: MIT OR Apache-2.0
import * as api from '../src/index';
import {manifestOracleCases,bulkOracleCases} from '../tests/actions-manifest-corpus';
await Bun.write('docs/helix/03-test/fixtures/bulk-update/manifest-oracle.json',JSON.stringify({protocol:'umf-manifest-oracle-cases/1',owner:'UMF US-903',scope:'Original fixture declarations; hand-authored eligibility expectations, no native execution',cases:manifestOracleCases(api),bulkCases:bulkOracleCases(api)},null,2)+'\n');
