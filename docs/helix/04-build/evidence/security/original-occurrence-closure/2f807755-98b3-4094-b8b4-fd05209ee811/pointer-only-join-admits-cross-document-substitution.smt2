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
 (forall ((occurrence OriginalOccurrence) (substituted_occurrence OriginalOccurrence) )(let (($x83 (= occurrence substituted_occurrence)))
 (let (($x93 (and (= (document_id occurrence) (document_id substituted_occurrence)) (= (original_source_bytes occurrence) (original_source_bytes substituted_occurrence)) (= (decoded_pointer occurrence) (decoded_pointer substituted_occurrence)))))
 (=> $x93 $x83))))
 )
(assert
 (and (distinct occurrence substituted_occurrence) true))
(assert
 (= (decoded_pointer occurrence) (decoded_pointer substituted_occurrence)))
(assert
 (let ((?x74 (document_id substituted_occurrence)))
(let ((?x73 (document_id occurrence)))
(and (distinct ?x73 ?x74) true))))
(check-sat)
