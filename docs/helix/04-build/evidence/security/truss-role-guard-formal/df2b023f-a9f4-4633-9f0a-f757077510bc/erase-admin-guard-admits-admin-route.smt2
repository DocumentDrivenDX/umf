(declare-fun other_route () Bool)
(declare-fun selected_set () Bool)
(declare-fun ordinary_role () String)
(declare-fun selected_role () String)
(declare-fun prior_reason () Bool)
(declare-fun selected_admin () Bool)
(assert (let ((a!1 (ite (or prior_reason
                    (and (distinct selected_role ordinary_role)
                         (or selected_set false))
                    other_route)
                "scoped_mismatch"
                "scoped_match")))
  (and (not prior_reason)
       (not other_route)
       (distinct selected_role ordinary_role)
       (not selected_set)
       selected_admin
       (= a!1 "scoped_match"))))

(check-sat)
