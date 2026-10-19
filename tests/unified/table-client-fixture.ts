// SPDX-License-Identifier: MIT OR Apache-2.0
import {generatePythonClient} from '../../src/access';
import {tableOperationSource} from './table-operation-fixture';
const root=process.argv[2];if(!root)throw Error('Output directory required');
for(const file of generatePythonClient({text:JSON.stringify(tableOperationSource()),package:'native_demo'}).files)await Bun.write(root+'/'+file.path,file.text);
