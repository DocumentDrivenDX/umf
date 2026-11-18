// SPDX-License-Identifier: MIT OR Apache-2.0
import {runQueryValueThreeValuedCorpus} from './query-value-three-valued-corpus';
const start=Number(process.argv[2]),end=Number(process.argv[3]),stride=Number(process.argv[4]);
console.log(JSON.stringify({start,end,stride,summary:runQueryValueThreeValuedCorpus(start,end,stride)}));
