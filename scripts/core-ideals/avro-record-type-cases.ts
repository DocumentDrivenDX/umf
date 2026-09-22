import {avroFieldCases} from './avro-field-cases';
export const avroRecordTypeCases=[...avroFieldCases,{id:'direct',schema:' {"type":"record","name":"Root","namespace":"sales","fields":[{"name":"child","type":{"type":"record","name":"Child","fields":[{"name":"id","type":"long"}]}},{"name":"again","type":"Child"},{"name":"recursive","type":"Root"}]}\n',dependencies:[]}];
