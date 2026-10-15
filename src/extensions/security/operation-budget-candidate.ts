/** Private shared operation ledgers; not an authority or a native credential. */
import {ProtectionLiteralBudget} from './protection/literals';
export class CandidateSecurityOperationBudget {
 readonly literal=new ProtectionLiteralBudget();
 private work=0;private text=0;private limit:number;
 constructor(maxSteps:number){this.limit=this.valid(maxSteps);}
 private valid(value:number){if(!Number.isSafeInteger(value)||value<1||value>1000000)throw Error('SECURITY_OPERATION_LIMIT');return value;}
 constrain(maxSteps:number){this.limit=Math.min(this.limit,this.valid(maxSteps));if(this.work>this.limit)throw Error('SECURITY_OPERATION_WORK');}
 step(units=1){if(!Number.isSafeInteger(units)||units<0)throw Error('SECURITY_OPERATION_CHARGE');this.work+=units;if(this.work>this.limit)throw Error('SECURITY_OPERATION_WORK');}
 snapshotText(units:number){if(!Number.isSafeInteger(units)||units<0)throw Error('SECURITY_OPERATION_TEXT_CHARGE');this.text+=units;if(this.text>4000000)throw Error('SECURITY_OPERATION_TEXT');}
}
