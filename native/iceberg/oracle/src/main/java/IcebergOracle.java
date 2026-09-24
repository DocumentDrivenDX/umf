import java.nio.file.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.apache.iceberg.Schema;
import org.apache.iceberg.SchemaParser;

public final class IcebergOracle {
 public static void main(String[] args) throws Exception {
  Path base=Path.of(args[0]);ObjectMapper mapper=new ObjectMapper();ArrayNode results=mapper.createArrayNode();
  for(JsonNode c:mapper.readTree(base.resolve("results.json").toFile()).get("results")){
   String id=c.get("id").asText();JsonNode source=mapper.readTree(base.resolve(c.get("path").asText()).toFile()).at(c.get("pointer").asText());ObjectNode r=mapper.createObjectNode().put("id",id).put("umf",c.get("status").asText());Schema original;
   try{original=SchemaParser.fromJson(source.toString());r.put("nativeAccepted",true);}catch(Exception e){r.put("nativeAccepted",false).put("nativeError",e.getClass().getSimpleName()+": "+e.getMessage());results.add(r);continue;}
   if(c.get("status").asText().equals("roundtripped")){
    JsonNode expected=mapper.readTree(SchemaParser.toJson(original));
    for(String format:new String[]{"json","yaml"}){Schema actual=SchemaParser.fromJson(Files.readString(base.resolve("roundtrip/"+id+"."+format+".json")));if(!expected.equals(mapper.readTree(SchemaParser.toJson(actual))))throw new IllegalStateException("Round trip differs: "+id);}
    r.put("formatsAgree",2);
    if(c.has("edit")){Schema edited=SchemaParser.fromJson(Files.readString(base.resolve("edited/"+id+".json")));int fieldId=c.get("edit").get("fieldId").asInt();String name=c.get("edit").get("to").asText();if(!edited.findField(fieldId).name().equals(name)||!edited.identifierFieldIds().equals(original.identifierFieldIds()))throw new IllegalStateException("Edit changed identity: "+id);((ObjectNode)expected.get("fields").get(0)).put("name",name);if(!expected.equals(mapper.readTree(SchemaParser.toJson(edited))))throw new IllegalStateException("Unexpected edited semantics: "+id);r.put("editVerified",true);}
   }
   results.add(r);
  }
  ObjectNode report=mapper.createObjectNode().put("runtime","Apache Iceberg Java 1.11.0").put("javaVersion",System.getProperty("java.version")).set("results",results);mapper.writerWithDefaultPrettyPrinter().writeValue(base.resolve("java-oracle-results.json").toFile(),report);System.out.println("Native Java schemas checked: "+results.size());
 }
}
