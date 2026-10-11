; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalOccurrence 0)
(declare-sort OriginalSourceBytes 0)
(declare-fun decoded_pointer (OriginalOccurrence) String)
(declare-fun original_source_bytes (OriginalOccurrence) OriginalSourceBytes)
(declare-fun document_id (OriginalOccurrence) String)
(declare-fun substituted_occurrence () OriginalOccurrence)
(declare-fun occurrence () OriginalOccurrence)
(assert
 (forall ((occurrence OriginalOccurrence) (substituted_occurrence OriginalOccurrence) )(let (($x80 (= occurrence substituted_occurrence)))
 (let (($x90 (and (= (document_id occurrence) (document_id substituted_occurrence)) (= (original_source_bytes occurrence) (original_source_bytes substituted_occurrence)) (= (decoded_pointer occurrence) (decoded_pointer substituted_occurrence)))))
 (=> $x90 $x80))))
 )
(assert
 (and (distinct occurrence substituted_occurrence) true))
(assert
 (let ((?x67 (decoded_pointer occurrence)))
 (= ?x67 "/modules/0/elements/0/kind")))
(assert
 (let ((?x67 (decoded_pointer occurrence)))
 (let ((?x70 (decoded_pointer substituted_occurrence)))
 (= ?x70 ?x67))))
(assert
 (let ((?x72 (document_id occurrence)))
 (= ?x72 "doc-a")))
(assert
 (let ((?x72 (document_id occurrence)))
 (let ((?x75 (document_id substituted_occurrence)))
 (= ?x75 ?x72))))
(assert
 (let ((?x94 (original_source_bytes substituted_occurrence)))
(let ((?x93 (original_source_bytes occurrence)))
(and (distinct ?x93 ?x94) true))))
(check-sat)
