import java.nio.file.Path;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.HexFormat;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.apache.iceberg.TableMetadataParser;
import org.apache.iceberg.Schema;
import org.apache.iceberg.data.Record;
import org.apache.iceberg.data.parquet.GenericParquetReaders;
import org.apache.iceberg.parquet.Parquet;
public class IcebergPromotionDataOracle {
 public static void main(String[] args) throws Exception {
  Path base=Path.of(args[0]);ObjectMapper mapper=new ObjectMapper();ArrayNode results=mapper.createArrayNode();
  JsonNode cases=mapper.readTree(base.resolve("data/manifest.json").toFile()).get("cases"),metadata=mapper.readTree(base.resolve("results.json").toFile()).get("results");
  for(JsonNode c:cases){
   String id=c.get("id").asText(),path=c.get("path").asText();byte[] bytes=Files.readAllBytes(Path.of(path));String sha=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));if(!sha.equals(c.get("sha256").asText()))throw new IllegalStateException("File changed: "+id);
   JsonNode item=null;for(JsonNode m:metadata)if(m.get("id").asText().equals(id))item=m;
   ObjectNode metadataHashes=mapper.createObjectNode();
   for(String format:new String[]{"source","json","yaml"}){
    Path meta=format.equals("source")?Path.of(item.get("path").asText()):base.resolve(id+"."+format+".json");Schema schema=TableMetadataParser.fromJson(Files.readString(meta)).schema();int row=0;metadataHashes.put(format,HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(meta))));
    try(var records=Parquet.read(org.apache.iceberg.Files.localInput(path)).project(schema).createReaderFunc(fileSchema->GenericParquetReaders.buildReader(schema,fileSchema)).<Record>build()){
     for(Record record:records){
      Object value=record.getField("x");String actual;
      if(c.get("encoding").asText().equals("double-ieee754-hex"))actual=String.format("%016x",Double.doubleToLongBits(((Number)value).doubleValue()));else actual=value.toString();
      if(!actual.equals(c.get("expectedPromoted").get(row).asText()))throw new IllegalStateException("Value differs: "+id+" "+format+" row "+row+" got "+actual);
      if(!record.getField("y").equals(c.get("expectedY").get(row).longValue())||!record.getField("z").equals(c.get("expectedZ").get(row).longValue()))throw new IllegalStateException("Untouched column changed");
      if(!format.equals("source")){String target=item.get("targetType").asText();if(target.equals("long")&&!(value instanceof Long)||target.equals("double")&&!(value instanceof Double)||target.startsWith("decimal")&&!(value instanceof java.math.BigDecimal))throw new IllegalStateException("Runtime type not promoted");}
      row++;
     }
    }
    if(row!=c.get("rows").asInt())throw new IllegalStateException("Row count differs");
   }
   results.add(mapper.createObjectNode().put("id",id).put("rows",c.get("rows").asInt()).put("sourceRead",true).put("promotedFormatReads",2).put("physicalNamesDiffer",true).put("fileSha256",sha).set("metadataSha256",metadataHashes));
  }
  ObjectNode report=mapper.createObjectNode().put("reader","Apache Iceberg Java 1.11.0 GenericParquetReaders").put("javaVersion",System.getProperty("java.version")).put("scope","Local Parquet projection by field ID; no manifest pruning or table commit");report.set("results",results);mapper.writerWithDefaultPrettyPrinter().writeValue(base.resolve("data/java-results.json").toFile(),report);System.out.println("Promotion data files checked: "+results.size());
 }
}
