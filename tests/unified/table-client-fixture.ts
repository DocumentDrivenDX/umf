// SPDX-License-Identifier: MIT OR Apache-2.0
import {generatePythonClient} from '../../src/access';
import {tableOperationSource} from './table-operation-fixture';
import {domainSource} from './table-domain-fixture';
const root=process.argv[2];if(!root)throw Error('Output directory required');
const domains=process.argv.includes('--domains');
for(const file of generatePythonClient({text:JSON.stringify(domains?domainSource():tableOperationSource()),package:domains?'domain_demo':'native_demo'}).files)await Bun.write(root+'/'+file.path,file.text);
