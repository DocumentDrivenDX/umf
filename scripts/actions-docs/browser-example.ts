// SPDX-License-Identifier: MIT OR Apache-2.0
import {runPortableExample} from './portable-example';
const button=document.querySelector<HTMLButtonElement>('#inspect-action');
button?.addEventListener('click',()=>{document.querySelector('#action-result')!.textContent=JSON.stringify(runPortableExample(),null,2);});
