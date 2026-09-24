package umf;
import java.util.Objects;
/** Compatibility implementation for TeaVM; mirrors the JDK StringJoiner contract. */
public final class StringJoiner {
 private final String delimiter,prefix,suffix;private String emptyValue;private StringBuilder value;
 public StringJoiner(CharSequence delimiter){this(delimiter,"","");}
 public StringJoiner(CharSequence delimiter,CharSequence prefix,CharSequence suffix){this.delimiter=Objects.requireNonNull(delimiter).toString();this.prefix=Objects.requireNonNull(prefix).toString();this.suffix=Objects.requireNonNull(suffix).toString();emptyValue=this.prefix+this.suffix;}
 public StringJoiner setEmptyValue(CharSequence text){emptyValue=Objects.requireNonNull(text).toString();return this;}
 public StringJoiner add(CharSequence text){if(value==null)value=new StringBuilder();else value.append(delimiter);value.append(text);return this;}
 public StringJoiner merge(StringJoiner other){Objects.requireNonNull(other);if(other.value!=null)add(other.value.toString());return this;}
 public int length(){return value==null?emptyValue.length():prefix.length()+value.length()+suffix.length();}
 public String toString(){return value==null?emptyValue:prefix+value+suffix;}
}
