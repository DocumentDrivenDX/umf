/** Internal optional accounting hooks; never accepted by public requests. */
export interface AccountingContext {
 charge(event:string,count?:number,path?:string):void;
 visit(category:string,path:string,count?:number):void;
 retainSubject(identity:unknown,path:string):void;
 retainBytes(domain:string,count:number,path:string):void;
 scanUtf8(text:string,path:string):number;
 appendCanonicalChunk(text:string,path:string):number;
}
