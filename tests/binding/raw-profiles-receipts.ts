// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Validation} from '../../src/model/types';

const ordinary:Validation={valid:true,complete:true,diagnostics:[]};
const absentMembers:Validation={valid:false,complete:false,diagnostics:[
 {code:'BINDING_RAW_PROFILE',path:'/extensions/umf.binding/elements/0',message:'Explicit fully interpreted Record membership is required',severity:'error'},
 {code:'BINDING_RAW_PROFILE',path:'/extensions/umf.binding/fields/0',message:'Expected direct core member Field with one bound Record owner and explicit column',severity:'error'},
]};
const wrongTarget:Validation={valid:false,complete:false,diagnostics:[
 {code:'BINDING_RAW_PROFILE',path:'/extensions/umf.binding/target',message:'ColumnSet target must match the exact authored platform and version identity',severity:'error'},
]};
export const rawProfileExpectedReceipts=['lakebase','unity-catalog','spark-delta'].flatMap(platform=>[
 {platform,name:'ordinary',result:ordinary},
 {platform,name:'absent-members',result:absentMembers},
 {platform,name:'wrong-target',result:wrongTarget},
]);
