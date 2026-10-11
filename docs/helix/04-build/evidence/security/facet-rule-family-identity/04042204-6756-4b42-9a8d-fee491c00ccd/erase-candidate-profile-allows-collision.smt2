; benchmark generated from python API
(set-info :status unknown)
(declare-sort CandidateProfile 0)
(declare-fun other_profile () CandidateProfile)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct profile other_profile) true))
(check-sat)
