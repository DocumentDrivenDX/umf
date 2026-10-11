import {decodeParquetPhysical,type ParquetPhysicalValue} from './physical';
import {inspectParquetSchema,type ParquetSchemaNode} from './schema';
import type {Document,Diagnostic} from '../../model/types';
export type ParquetRowValue=null|{kind:'record';fields:{index:number;name:string;value:ParquetRowValue}[]}|{kind:'repeated';items:ParquetRowValue[]}|{kind:'physical';value:ParquetPhysicalValue};
export interface ParquetRows {source:Document;status:'assembled'|'blocked';complete:false;diagnostics:Diagnostic[];rows?:ParquetRowValue[]}
type Slot={kind:'record';fields:Map<number,Slot>}|{kind:'repeated';items:Slot[];empty:boolean}|{kind:'null'}|{kind:'physical';value:ParquetPhysicalValue};
export const PARQUET_ROW_NODE_LIMIT=100000;
/** Reconstruct physical records by schema identity; logical LIST/MAP lowering is separate. */
export function assembleParquetRows(source:Document):ParquetRows {
 const physical=decodeParquetPhysical(source),r:ParquetRows={source:physical.source,status:'blocked',complete:false,diagnostics:[...physical.diagnostics]};if(physical.status!=='decoded')return r;
 const inspected=inspectParquetSchema(source),metadata=inspected.metadata as any,paths=new Map<number,ParquetSchemaNode[]>(),rows:Slot[]=[];let nodes=0;
 const make=(v:Slot)=>{if(++nodes>PARQUET_ROW_NODE_LIMIT)throw Error('Physical row node budget exceeded');return v;};
 const record=():Slot=>make({kind:'record',fields:new Map()});
 try{
  function index(n:ParquetSchemaNode,path:ParquetSchemaNode[]){const next=[...path,n];if(metadata.schema[n.index].type!==undefined)paths.set(n.index,next.slice(1));else{if(!n.children.length)throw Error('Empty groups have no observable presence stream');for(const c of n.children)index(c,next);}}index(inspected.tree!,[]);
  for(const [g,group] of metadata.row_groups.entries()){
   const groupRows=Array.from({length:Number(group.num_rows)},record);
   for(const leaf of inspected.leaves!){const path=paths.get(leaf.index)!,positions:number[]=[];let row=-1;
    for(const page of physical.pages!.filter(p=>p.kind==='data'&&p.rowGroup===g&&p.column===leaf.ordinal)){const levels=page.levels!;let valueIndex=0;
     for(let i=0;i<levels.definition.length;i++){
      const rep=levels.repetition[i]!,def=levels.definition[i]!;if(rep===0){row++;positions.length=0;}else{if(positions[rep]===undefined)throw Error('Repeated continuation has no prior instance');positions[rep]++;positions.length=rep+1;}
      if(row>=groupRows.length)throw Error('Column row count exceeds row group');let current=groupRows[row]!;
      for(const n of path){if(current.kind!=='record')throw Error('Shared group structure differs between columns');const e=metadata.schema[n.index],repeated=e.repetition_type==='2',absent=def<n.definitionLevel;let slot=current.fields.get(n.index);
       if(repeated){
        if(!slot){slot=make({kind:'repeated',items:[],empty:absent});current.fields.set(n.index,slot);}if(slot.kind!=='repeated'||slot.empty!==absent)throw Error('Columns disagree on empty repeated group');
        if(absent){positions.length=Math.min(positions.length,n.repetitionLevel);break;}
        positions[n.repetitionLevel]??=0;const position=positions[n.repetitionLevel]!;let item=slot.items[position];
        if(!item){if(position>slot.items.length)throw Error('Repeated instance coordinates have a gap');item=e.type===undefined?record():make({kind:'physical',value:page.values[valueIndex++]!});slot.items[position]=item;}else if(e.type!==undefined)throw Error('Duplicate physical value at repeated coordinate');
        if(e.type!==undefined){if(item.kind!=='physical'||!item.value)throw Error('Missing physical value');break;}current=item;
       }else if(absent){if(slot&&slot.kind!=='null')throw Error('Columns disagree on optional group presence');if(!slot)current.fields.set(n.index,make({kind:'null'}));positions.length=Math.min(positions.length,n.repetitionLevel+1);break;}
       else if(e.type!==undefined){if(slot)throw Error('Duplicate physical value coordinate');const value=page.values[valueIndex++];if(!value)throw Error('Missing physical value');current.fields.set(n.index,make({kind:'physical',value}));break;}
       else{if(!slot){slot=record();current.fields.set(n.index,slot);}if(slot.kind!=='record')throw Error('Columns disagree on optional group presence');current=slot;}
      }
     }
     if(valueIndex!==page.values.length)throw Error('Unused physical values after row assembly');
    }
    if(row+1!==groupRows.length)throw Error('Column row count differs from row group');
   }
   rows.push(...groupRows);
  }
  function finish(slot:Slot,n:ParquetSchemaNode):ParquetRowValue{
   if(slot.kind==='null')return null;if(slot.kind==='physical')return {kind:'physical',value:{...slot.value}};
   if(slot.kind==='repeated')return {kind:'repeated',items:slot.items.map(s=>finish(s,n))};
   const fields=n.children.map(c=>{const value=slot.fields.get(c.index);if(!value)throw Error('Columns disagree on repeated cardinality or shared structure');return {index:c.index,name:c.name,value:finish(value,c)};});return {kind:'record',fields};
  }
  r.rows=rows.map(row=>finish(row,inspected.tree!));r.status='assembled';r.diagnostics.push({code:'PARQUET_ROW_LOGICAL_UNVERIFIED',path:'',severity:'warning',message:'Physical records assembled by schema index; logical validation and LIST/MAP projections remain separate'});
 }catch(e){r.diagnostics.push({code:'PARQUET_ROW_ASSEMBLY',path:'',severity:'error',message:(e as Error).message});}return r;
}
