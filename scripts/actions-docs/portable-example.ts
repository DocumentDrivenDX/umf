// SPDX-License-Identifier: MIT OR Apache-2.0
import * as sdk from '#umf-source';
import {runPortableInspection} from './portable-inspection';

export const runPortableExample=()=>runPortableInspection(sdk);
if(import.meta.main)console.log(JSON.stringify(runPortableExample(),null,2));
