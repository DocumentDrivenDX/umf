package org.apache.iceberg;
import java.nio.file.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
public class IcebergPromotionOracle {
 public static void main(String[] args) throws Exception {
  Path base=Path.of(args[0]);ObjectMapper mapper=new ObjectMapper();ArrayNode out=mapper.createArrayNode();
  for(var c:mapper.readTree(base.resolve("results.json").toFile()).get("results")){
   String id=c.get("id").asText();TableMetadata original=TableMetadataParser.fromJson(java.nio.file.Files.readString(Path.of(c.get("path").asText())));
   Schema schema=new SchemaUpdate(original.schema(),original.lastColumnId()).updateColumn(original.schema().findColumnName(c.get("fieldId").asInt()),org.apache.iceberg.types.Types.fromPrimitiveString(c.get("targetType").asText())).apply();
   TableMetadata expected=original.updateSchema(schema);
   ObjectNode expectedJson=(ObjectNode)mapper.readTree(TableMetadataParser.toJson(expected));expectedJson.remove("last-updated-ms");
   for(String f:new String[]{"json","yaml"}){
    TableMetadata actual=TableMetadataParser.fromJson(java.nio.file.Files.readString(base.resolve(id+"."+f+".json")));
    ObjectNode actualJson=(ObjectNode)mapper.readTree(TableMetadataParser.toJson(actual));actualJson.remove("last-updated-ms");
    if(!expectedJson.equals(actualJson))throw new IllegalStateException("Native promotion differs: "+id+" "+f+"\n"+expectedJson+"\n"+actualJson);
   }
   out.add(mapper.createObjectNode().put("id",id).put("formatsAgree",2).put("nativeOperation","SchemaUpdate.updateColumn + TableMetadata.updateSchema").put("excludedComparison","last-updated-ms: UMF candidate does not advance commit time"));
  }
  mapper.writerWithDefaultPrettyPrinter().writeValue(base.resolve("java-results.json").toFile(),out);System.out.println("Native promotion candidates checked: "+out.size());
 }
}
