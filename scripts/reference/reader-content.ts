import type {Concept} from '../../docs/helix/05-deploy/reference/model';
export const concepts:Concept[]=[
 {key:'document',title:'Document',pointer:'',description:'A complete UMF model: its identity, vocabulary versions and modules.'},
 {key:'module',title:'Module',pointer:'/$defs/module',description:'A namespace containing elements and declared relationships.'},
 {key:'record',title:'Record',pointer:'/$defs/element',role:'record',description:'A definition of named members. Its members reference Field definitions; its keys describe record identity.'},
 {key:'field',title:'Field',pointer:'/$defs/element',role:'field',description:'A named value slot. Describe a scalar, a collection, or a reference to a separate Record definition.'},
 {key:'group',title:'Group',pointer:'/$defs/element',role:'group',description:'An organizing element. The group role does not establish a record value shape.'},
 ...[['value-types','Value types','scalarType','Recognized scalar families and the rules for unknown family labels.'],['nullability','Nullability','knownNullability','Whether an ideal value may be absent. Native missing and null carriers need explicit bindings.'],['cardinality','Cardinality','knownCardinality','One value, array items, or string-keyed map values.'],['facets','Facets','facets','Explicit bounds and refinements. Omission imposes no bound.'],['keys','Record identity Keys','key','An ordered tuple of required singular Fields identifying a record within its collection.'],['relationships','Relationships','relationship','Declared links between record populations, distinct from type references.'],['extensions','Extensions','extensions','Vocabulary-keyed metadata retaining independent native and authored meanings.']].map(([key,title,def,description])=>({key:key!,title:title!,pointer:'/$defs/'+def,description:description!}))
];
export const propertyText:Record<string,string>={
 umf:'The exact core schema version used by this document.',id:'Stable identity within the owning scope. Names and display titles do not replace it.',
 vocabularies:'Vocabulary identifiers mapped to exact independently versioned declarations.',modules:'Modules making up this document.',namespace:'The module namespace; it does not automatically assert domain semantics.',elements:'Definitions carried by a module. Choose an explicit kind to state a UMF role.',
 name:'A name in the model; distinct from stable id and display title.',description:'Human explanation of the authored meaning.',title:'Display title for people reading the model.',aliases:'Alternative authored names; identities remain unchanged.',
 kind:'The role of an element: field, record or group. Missing and unknown labels do not infer a role.',
 scalarType:'The scalar value family. Recognized labels have UMF meaning; other nonempty labels remain retained with incomplete interpretation.',
 nullability:'Ideal value availability for a Field. Required, absent-allowed and unspecified remain distinct; no native null carrier is implied.',
 cardinality:'Field value shape: one, array, map or unspecified. Array and map containers cannot also assert scalarType.',
 itemType:'Reference to the Field defining array items or map values. Requires kind field and cardinality array or map. Omission leaves item meaning unasserted.',
 facets:'Authored value refinements and bounds. Missing facets impose no bound; unknown qualifiers stay uninterpreted.',
 members:'References to the Fields belonging to a Record definition. These are the record’s data fields, distinct from this object’s own JSON keys.',
 keys:'Record identity declarations. Each key names an ordered tuple of owned, required singular Fields; this does not itself install native uniqueness enforcement.',
 primary:'Marks the selected primary identity Key; at most one per Record.',fields:'Ordered Field references making up the identity Key. Order is significant.',
 references:'Role-qualified references to other elements. A record-type reference describes a Field’s Record value type, not relationship enforcement.',
 extensions:'Metadata keyed by vocabulary identifier. Unknown extension content is retained without inventing meaning.',
 examples:'Authored example values encoded using exact UMF literal carriers.',allowedValues:'Explicit allowed literals. Absence asserts no allowed-value list.',
 default:'An explicit literal and the missing/null trigger on which default resolution is requested. Validation does not silently insert it.',
 on:'The explicit default trigger: missing, null or missing-or-null.',value:'The literal value in its declared carrier, retaining exact numeric spelling.',
 semanticTypes:'Version-qualified vocabulary term references. Native or external meaning is not inferred from a label alone.',
 module:'Stable ID of the module containing the reference target.',element:'Stable ID of the referenced element within that module.',role:'Declared reference role; unknown roles retain their original labels.',
 relationships:'Declared relationships owned by this module.',version:'The exact independently versioned vocabulary declaration.',
};
export const scalarMeanings:Record<string,string>={boolean:'Boolean truth values.',integer:'Whole-number values; width and signedness require explicit refinements.',decimal:'Exact decimal values; precision and scale are explicit refinements.',float:'Floating-point value family; native precision and representation require explicit bindings.',string:'Text values; native encoding and comparison rules are separate.',binary:'Binary values; native storage and encoding remain separate.',date:'Date family; no implicit calendar operations are selected.',time:'Time family; no implicit timezone is selected.',timestamp:'Timestamp family; local versus instant semantics require explicit refinements.',bits128:'An exact 16-byte domain under umf-128/1.',uuid:'An exact 16-byte UUID domain under umf-128/1; supported operations remain profile-qualified.'};
export const examples=(version:string)=>[{umf:version,id:'sales-schema',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[
 {id:'order',name:'Order',kind:'record',extensions:{},members:[{module:'sales',element:'orderId'},{module:'sales',element:'tags'}],keys:[{id:'order-key',name:'order-key',fields:[{module:'sales',element:'orderId'}],primary:true}]},
 {id:'orderId',name:'orderId',kind:'field',extensions:{},scalarType:'string',cardinality:'one',nullability:'required'},
 {id:'tags',name:'tags',kind:'field',extensions:{},cardinality:'array',itemType:{module:'sales',element:'tagValue'}},
 {id:'tagValue',name:'tag',kind:'field',extensions:{},scalarType:'string',cardinality:'one'}]}]}];
export const apiGuides:Record<string,{purpose:string;example?:string;related?:string[]}>={
 AVRO_KEYS_EXTENSION:{purpose:'The identifier for the Avro key metadata extension. Use this constant as a vocabulary or extension map key. Observed schema metadata does not establish Avro uniqueness enforcement or authored key intent.',example:'import { AVRO_KEYS_EXTENSION } from "@umf/core";\n\n// document is an existing UMF Document.\nconst metadata = document.extensions?.[AVRO_KEYS_EXTENSION];\nconst vocabulary = document.vocabularies[AVRO_KEYS_EXTENSION];',related:['avroKeysPackage','classifyAvroKeys','AvroKeyRequest','AvroKeyClassification']},
 avroKeysPackage:{purpose:'The Avro key metadata extension package manifest. Inspect its vocabulary, payload schema and declared capabilities; loading a constant alone does not register it.',related:['AVRO_KEYS_EXTENSION','classifyAvroKeys']},
 classifyAvroKeys:{purpose:'Observe Avro record declarations from an explicitly supplied retained native archive. The result distinguishes observations and residual losses; it does not infer authored keys or native uniqueness enforcement.',related:['AvroKeyRequest','AvroKeyClassification','AVRO_KEYS_EXTENSION']},
 AvroKeyRequest:{purpose:'Options for Avro key classification: explicit loss policy, schema-declaration profile and retained native source archive.',related:['classifyAvroKeys','AvroKeyArchive']},
 AvroKeyArchive:{purpose:'The original Avro schema text and its explicitly supplied named dependency schemas.',related:['AvroKeyRequest']},
 readDocument:{purpose:'Parse UMF JSON or YAML text into a Document using the core checks. Choose the input format explicitly when needed; use validateDocument with a registry for extension interpretation.',example:'import { readDocument } from "@umf/core";\n\nconst document = readDocument(\'{"umf":"0.10.0","id":"example","vocabularies":{},"modules":[]}\');',related:['Document','Registry','writeDocument','validateDocument']},
 writeDocument:{purpose:'Serialize a UMF Document, preserving retained metadata and exact literal carriers. Select the desired output format in the options.',related:['readDocument','Document']},
 validateDocument:{purpose:'Check core structure and registered extension semantics. Read diagnostics and completeness alongside valid; a valid retained document may contain unknown meaning.',related:['ValidationResult','Registry','readDocument']},
 selectCoreElements:{purpose:'Select copied element metadata by explicit filters and reference traversal policy. Qualified identities remain distinct from names.',related:['Document','SelectionQuery']},
 Document:{purpose:'The programmatic UMF document envelope: core version, stable identity, vocabulary declarations and modules.',related:['readDocument','validateDocument','Module']},
 Registry:{purpose:'A registry of explicitly installed extension packages and their trusted interpretation. Unknown extension payloads remain preserved.',related:['createUmfRegistry','Document']},
 createUmfRegistry:{purpose:'Construct the SDK default registry with its selected extensions. Default registration differs from an explicitly empty Registry.',related:['Registry']},
};
export function apiTask(name:string):string {if(/^(read|parse|validate|check|is[A-Z])/.test(name))return 'Read and validate';if(/^(inspect|select|get|find|resolve|prepare)/.test(name))return 'Inspect and select';if(/^(write|serialize|emit|encode|decode)/.test(name))return 'Serialize';if(/^(import|export|project|recover)/.test(name))return 'Import and export';if(/(EXTENSION|Package|Registry|register)/.test(name))return 'Extensions';if(/^(create|add|set|edit|propose|remove|migrate|rollback)/.test(name))return 'Author and edit';return 'Other APIs';}
