// SPDX-License-Identifier: MIT OR Apache-2.0
import {assetCli} from './assets/cli';
if(import.meta.main)await assetCli('domain-packs',process.argv.slice(2));
