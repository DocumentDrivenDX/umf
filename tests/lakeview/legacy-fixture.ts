// SPDX-License-Identifier: MIT OR Apache-2.0
export const legacyIds={data:'data',datasets:['dataset'],pages:[{id:'page',items:['filter']}]};
export function legacyFixture(name='column',extra:Record<string,unknown>={}):any {
  return {
    datasets:[{name:'native-dataset',query:'select column'}],
    pages:[{name:'native-page',layout:[{
      position:{x:0,y:0,width:1,height:1},
      widget:{name:'native-filter',queries:[{name:'query',query:{
        datasetName:'native-dataset',fields:[{name:'output',expression:'`'+name+'`'}],
      }}],spec:{widgetType:'filter-single-select',version:1,
        encodings:{fields:[{queryName:'query',fieldName:'output'}]},...extra,
      }},
    }]}],
  };
}

export function legacyNumericFixture(token:string,mixed=false){
  const values=[{value:'NUMERIC_TOKEN'},...(mixed?[{value:'retained-string'}]:[])];
  const source=JSON.stringify(legacyFixture('column',{selection:{defaultSelection:{values:{dataType:'DECIMAL',values}}}}))
    .replace('"NUMERIC_TOKEN"',token);
  return JSON.parse(source);
}

export const legacyMixedDefaults:{name:string;values:unknown[]}[]=[
  {name:'numeric and null value',values:[{value:1},{value:null}]},
  {name:'null entry before numeric',values:[null,{value:1}]},
  {name:'numeric and opaque value',values:[{value:1},{value:{future:'unknown'}}]},
];
export function legacySelectionFixture(values:unknown[]){
  return legacyFixture('column',{selection:{defaultSelection:{values:{dataType:'DECIMAL',values}}}});
}

export const legacyUnknownWidgetTypes:unknown[]=[
  'constructor','toString','__proto__','future-filter',null,{},['filter-single-select'],
];

export const legacyUnknownFormats:unknown[]=[
  'constructor','toString','__proto__','future-format',null,{},['number'],
];
export const legacyUnknownChannels=['constructor','toString','__proto__','future-channel'];
export function legacyFormatFixture(type:unknown){
  return legacyFixture('column',{widgetType:'table',encodings:{columns:[{fieldName:'output',format:{type}}]}});
}
export function legacyChannelFixture(name:string){
  return legacyFixture('column',{widgetType:'table',encodings:{columns:[{fieldName:'output'}],[name]:{fieldName:'output'}}});
}
