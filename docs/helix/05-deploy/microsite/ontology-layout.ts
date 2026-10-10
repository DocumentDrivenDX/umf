export interface Point {x:number;y:number}
/** Separate parallel declarations without changing their endpoints or direction. */
export function relationshipGeometry(a:Point,b:Point,lane=0){
 if(a.x===b.x&&a.y===b.y){const rise=44+Math.abs(lane)*16;return {path:`M ${a.x+65} ${a.y} C ${a.x+35} ${a.y-rise} ${a.x+170} ${a.y-rise} ${a.x+140} ${a.y}`,x:a.x+102.5,y:a.y-rise*.75};}
 const dx=b.x-a.x,dy=b.y-a.y,ratio=Math.min(dx===0?Infinity:108/Math.abs(dx),dy===0?Infinity:43/Math.abs(dy)),length=Math.hypot(dx,dy),sign=dx<0||dx===0&&dy<0?-1:1;
 const bow=dy===0&&Math.abs(dx)>250?88:0,cx=(a.x+b.x)/2+102.5-dy/length*lane*40*sign,cy=(a.y+b.y)/2+39+bow+dx/length*lane*40*sign;
 return {path:`M ${a.x+102.5+dx*ratio} ${a.y+39+dy*ratio} Q ${cx} ${cy} ${b.x+102.5-dx*ratio} ${b.y+39-dy*ratio}`,x:(a.x+b.x)/2+102.5+(cx-((a.x+b.x)/2+102.5))/2,y:(a.y+b.y)/2+39+(cy-((a.y+b.y)/2+39))/2};
}
