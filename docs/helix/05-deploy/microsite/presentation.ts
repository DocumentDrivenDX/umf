/** Display labels never replace source IDs, keys or numeric values. */
const acronyms:Record<string,string>={cms:'CMS',hl7:'HL7',fhir:'FHIR',xbrl:'XBRL',umf:'UMF',sec:'SEC',dicom:'DICOM',pacs:'PACS',tcia:'TCIA',gtfs:'GTFS',hr:'HR',noaa:'NOAA',ghcn:'GHCN',nyc:'NYC',tlc:'TLC',api:'API',json:'JSON',csv:'CSV',pdf:'PDF',id:'ID',ids:'IDs',sha256:'SHA-256',utc:'UTC',url:'URL'};
export function displayLabel(value:string):string {
 const words=value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').trim().split(/\s+/);
 return words.map((word,i)=>acronyms[word.toLowerCase()]??(i===0?word.charAt(0).toUpperCase()+word.slice(1):word)).join(' ');
}
export function numericLexeme(value:unknown):string|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const keys=Object.keys(value);if(keys.length===1&&keys[0]==='numberToken'&&typeof (value as any).numberToken==='string')return (value as any).numberToken;
}
