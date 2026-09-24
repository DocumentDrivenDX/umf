package umf;
import java.util.*;
import java.lang.reflect.Type;
import java.util.function.Predicate;
public final class RuntimeCompat {
 private RuntimeCompat(){}
 public static Type genericSuperclass(Class<?> type){throw new UnsupportedOperationException("Smithy browser runtime: generic superclass reflection is not implemented for "+type.getName());}
 public static <T> SortedSet<T> unmodifiableSortedSet(SortedSet<T> set){return new ReadOnlySortedSet<>(Objects.requireNonNull(set));}
 private static final class ReadOnlySortedSet<T> extends AbstractSet<T> implements SortedSet<T>{
  private final SortedSet<T> source;private final Set<T> view;
  ReadOnlySortedSet(SortedSet<T> source){this.source=source;view=Collections.unmodifiableSet(source);}
  public Iterator<T> iterator(){return view.iterator();}public int size(){return source.size();}public boolean contains(Object value){return source.contains(value);}
  public Spliterator<T> spliterator(){return source.spliterator();}
  public Comparator<? super T> comparator(){return source.comparator();}public T first(){return source.first();}public T last(){return source.last();}
  public SortedSet<T> subSet(T a,T b){return unmodifiableSortedSet(source.subSet(a,b));}public SortedSet<T> headSet(T a){return unmodifiableSortedSet(source.headSet(a));}public SortedSet<T> tailSet(T a){return unmodifiableSortedSet(source.tailSet(a));}
  public boolean add(T x){throw new UnsupportedOperationException();}public boolean remove(Object x){throw new UnsupportedOperationException();}public boolean addAll(Collection<? extends T> x){throw new UnsupportedOperationException();}public boolean removeAll(Collection<?> x){throw new UnsupportedOperationException();}public boolean retainAll(Collection<?> x){throw new UnsupportedOperationException();}public boolean removeIf(Predicate<? super T> x){throw new UnsupportedOperationException();}public void clear(){throw new UnsupportedOperationException();}
 }
}
