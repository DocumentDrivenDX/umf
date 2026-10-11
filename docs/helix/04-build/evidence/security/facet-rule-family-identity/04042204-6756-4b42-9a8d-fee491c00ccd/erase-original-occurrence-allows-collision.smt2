; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactOriginalOccurrence 0)
(declare-fun other_occurrence () ExactOriginalOccurrence)
(declare-fun occurrence () ExactOriginalOccurrence)
(assert
 (and (distinct occurrence other_occurrence) true))
(check-sat)
