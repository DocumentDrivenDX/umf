import {renderRecordMap} from '../../docs/helix/05-deploy/schema-browser/record-map';
import {attachLiniSvg} from '../../docs/helix/05-deploy/schema-browser/lini-svg';
import type {ComponentModel} from '../../docs/helix/05-deploy/schema-browser/visual-model';
const handles:ReturnType<typeof renderRecordMap>[]=[],navigation:{id:string;kind?:string}[]=[];
(globalThis as any).visualTest={
 navigation,
 async create(model:ComponentModel,focus=''){
  const root=document.createElement('div');root.id='map-'+handles.length;document.body.append(root);
  const handle=renderRecordMap(root,model,{focus,onNavigate:(id,kind)=>navigation.push({id,...(kind?{kind}:{})})});
  handles.push(handle);await handle.ready;return handles.length-1;
 },
 async race(index:number,a:ComponentModel,b:ComponentModel){await Promise.all([handles[index]!.update(a),handles[index]!.update(b)]);},
 async destroyWhileRendering(index:number,model:ComponentModel){const ready=handles[index]!.update(model);handles[index]!.destroy();await ready;},
 destroy(index:number){handles[index]!.destroy();document.getElementById('map-'+index)?.remove();},
 checkSvg(text:string){const root=document.createElement('div');try{const drawing=attachLiniSvg(root,text);drawing.destroy();return true;}catch{return false;}},
};
