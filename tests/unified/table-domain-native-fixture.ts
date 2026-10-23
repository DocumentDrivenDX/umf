// SPDX-License-Identifier: MIT OR Apache-2.0
import {legalDomainAuthoringSource} from './legal-domain-authoring-fixture';
await Bun.write(process.argv[2]??'/private/tmp/umf-legal-domain-native-source.json',JSON.stringify(legalDomainAuthoringSource(),null,2)+'\n');
