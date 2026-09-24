import java.nio.file.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.apache.iceberg.TableMetadata;
import org.apache.iceberg.TableMetadataParser;
public final class IcebergTableOracle {
 public static void main(String[] args) throws Exception {
  Path base=Path.of(args[0]);ObjectMapper mapper=new ObjectMapper();ArrayNode results=mapper.createArrayNode();
  for(JsonNode c:mapper.readTree(base.resolve("results.json").toFile()).get("results")){
   String id=c.get("id").asText(),raw=Files.readString(Path.of(c.get("path").asText()));ObjectNode r=mapper.createObjectNode().put("id",id).put("umf",c.get("status").asText());TableMetadata original;
   try{original=TableMetadataParser.fromJson(raw);r.put("nativeAccepted",true);}catch(Exception e){r.put("nativeAccepted",false).put("nativeError",e.getClass().getSimpleName()+": "+e.getMessage());results.add(r);continue;}
   if(c.get("status").asText().equals("roundtripped")){
    JsonNode expected=mapper.readTree(TableMetadataParser.toJson(original));
    for(String f:new String[]{"json","yaml"}){TableMetadata actual=TableMetadataParser.fromJson(Files.readString(base.resolve(id+"."+f+".json")));if(!expected.equals(mapper.readTree(TableMetadataParser.toJson(actual))))throw new IllegalStateException("Round trip differs: "+id);}
    TableMetadata edited=TableMetadataParser.fromJson(Files.readString(base.resolve(id+".edited.json")));((ObjectNode)expected).put("location","s3://umf-fixture/relocated/"+id);if(!expected.equals(mapper.readTree(TableMetadataParser.toJson(edited))))throw new IllegalStateException("Unexpected edit: "+id);r.put("formatsAgree",2).put("editVerified",true);
   }results.add(r);
  }
  ObjectNode report=mapper.createObjectNode().put("runtime","Apache Iceberg Java 1.11.0").put("javaVersion",System.getProperty("java.version")).set("results",results);mapper.writerWithDefaultPrettyPrinter().writeValue(base.resolve("java-oracle-results.json").toFile(),report);System.out.println("Native Java tables checked: "+results.size());
 }
}
