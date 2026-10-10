import {expect,test} from 'bun:test';
import {relationshipGeometry} from '../../docs/helix/05-deploy/microsite/ontology-layout';
test('parallel declarations remain separately inspectable with a stable midpoint in either direction',()=>{const a={x:35,y:35},b={x:285,y:165};const left=relationshipGeometry(a,b,-.5),right=relationshipGeometry(a,b,.5);expect(left.path).not.toBe(right.path);expect(left.x).not.toBe(right.x);expect(relationshipGeometry(b,a,-.5).x).toBe(left.x);expect(relationshipGeometry(b,a,-.5).y).toBe(left.y);});
test('self relationship badge stays outside its record',()=>{const a={x:535,y:60},g=relationshipGeometry(a,a);expect(g.y).toBeLessThan(a.y-11);expect(g.x).toBeLessThan(880);expect(g.y).toBeGreaterThan(11);});
