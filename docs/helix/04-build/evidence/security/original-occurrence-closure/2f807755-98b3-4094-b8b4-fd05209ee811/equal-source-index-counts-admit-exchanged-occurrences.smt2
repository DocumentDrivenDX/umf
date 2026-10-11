; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalOccurrence 0)
(declare-fun is_original_value (OriginalOccurrence) Bool)
(declare-fun is_semantic_assertion (OriginalOccurrence) Bool)
(declare-fun owner_classification (OriginalOccurrence) Int)
(declare-fun is_indexed_value (OriginalOccurrence) Bool)
(declare-fun is_reported_assertion (OriginalOccurrence) Bool)
(declare-fun substituted_occurrence () OriginalOccurrence)
(declare-fun occurrence () OriginalOccurrence)
(assert
 (forall ((occurrence OriginalOccurrence) )(let (($x11 (is_original_value occurrence)))
 (let (($x12 (is_semantic_assertion occurrence)))
 (=> $x12 $x11))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(and (>= (owner_classification occurrence) 0) (<= (owner_classification occurrence) 3)))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x18 (owner_classification occurrence)))
 (let (($x26 (and (distinct ?x18 0) true)))
 (let (($x17 (is_indexed_value occurrence)))
 (=> $x17 $x26)))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let (($x12 (is_semantic_assertion occurrence)))
 (let ((?x18 (owner_classification occurrence)))
 (let (($x34 (= ?x18 1)))
 (let (($x35 (= $x34 $x12)))
 (=> (and (is_indexed_value occurrence) (and (distinct ?x18 0) true)) $x35))))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x18 (owner_classification occurrence)))
 (let (($x34 (= ?x18 1)))
 (let (($x17 (is_indexed_value occurrence)))
 (let (($x32 (and $x17 $x34)))
 (= (is_reported_assertion occurrence) $x32))))))
 )
(assert
 (and (distinct occurrence substituted_occurrence) true))
(assert
 (is_original_value occurrence))
(assert
 (let (($x56 (is_original_value substituted_occurrence)))
 (not $x56)))
(assert
 (is_semantic_assertion occurrence))
(assert
 (let (($x45 (is_indexed_value occurrence)))
 (not $x45)))
(assert
 (is_indexed_value substituted_occurrence))
(assert
 (= (owner_classification substituted_occurrence) 2))
(assert
 (let (($x58 (is_indexed_value substituted_occurrence)))
 (let ((?x65 (ite $x58 1 0)))
 (let (($x45 (is_indexed_value occurrence)))
 (let ((?x64 (ite $x45 1 0)))
 (let (($x56 (is_original_value substituted_occurrence)))
 (let ((?x62 (ite $x56 1 0)))
 (let (($x7 (is_original_value occurrence)))
 (let ((?x61 (ite $x7 1 0)))
 (= (+ ?x61 ?x62) (+ ?x64 ?x65)))))))))))
(assert
 (let (($x16 (is_reported_assertion occurrence)))
(not $x16)))
(check-sat)
