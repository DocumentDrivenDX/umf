(declare-fun other_route () Bool)
(declare-fun selected_admin () Bool)
(declare-fun selected_set () Bool)
(declare-fun ordinary_role () String)
(declare-fun selected_role () String)
(declare-fun prior_reason () Bool)
(assert (let ((a!1 (ite (or prior_reason
                    (and (distinct selected_role ordinary_role)
                         (or selected_set selected_admin))
                    other_route)
                "scoped_mismatch"
                "scoped_match")))
  (and (and (distinct selected_role ordinary_role)
            (or selected_set selected_admin))
       (not prior_reason)
       (= a!1 "scoped_match"))))

(check-sat)
