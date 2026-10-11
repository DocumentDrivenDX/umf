; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalOccurrence 0)
(declare-fun is_original_value (OriginalOccurrence) Bool)
(declare-fun is_semantic_assertion (OriginalOccurrence) Bool)
(declare-fun owner_classification (OriginalOccurrence) Int)
(declare-fun is_indexed_value (OriginalOccurrence) Bool)
(declare-fun is_reported_assertion (OriginalOccurrence) Bool)
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
 (forall ((occurrence OriginalOccurrence) )(let (($x11 (is_original_value occurrence)))
 (let (($x17 (is_indexed_value occurrence)))
 (= $x17 $x11))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x18 (owner_classification occurrence)))
 (let (($x26 (and (distinct ?x18 0) true)))
 (let (($x17 (is_indexed_value occurrence)))
 (=> $x17 $x26)))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x18 (owner_classification occurrence)))
 (let (($x34 (= ?x18 1)))
 (let (($x17 (is_indexed_value occurrence)))
 (let (($x32 (and $x17 $x34)))
 (= (is_reported_assertion occurrence) $x32))))))
 )
(assert
 (let (($x9 (is_semantic_assertion occurrence)))
 (let (($x31 (not $x9)))
 (let (($x16 (is_reported_assertion occurrence)))
 (and $x16 $x31)))))
(assert
 (is_original_value occurrence))
(check-sat)
