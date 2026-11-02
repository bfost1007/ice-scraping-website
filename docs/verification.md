# Website verification

Passed:
- Production Next.js build and standalone TypeScript checking.
- Four signed-session security tests.
- Fifteen HTTP workflow scenarios against isolated Supabase fixtures: role
  permissions, record isolation, employee lifecycle, scheduling, private photos,
  submission/redo/approval, requests, payment permissions, pagination, and
  public signup validation/persistence.
- Chromium public-page checks at 360, 390, and 1440 pixels; light/dark mode;
  homepage links; four-step signup; phone formatting and validity; correct
  semester prices; selection and deselection of service days; keyboard-accessible
  payment radios; handled network and non-JSON errors; double-click prevention;
  successful signup against the local fixture. No browser exceptions occurred.
- Chromium owner and employee sign-in, all dashboard tabs, dialog dismissal,
  starting work, required-photo submission controls, requests, and layout checks.

Fixed during this check:
- Signup network failures previously escaped without useful feedback.
- Submission controls previously allowed duplicate clicks while waiting.
- Deselected weekdays were rejected as invalid service times.
- Malformed JSON, null/array schedules, invalid plan/payment values and inherited
  weekday keys were not safely validated by the booking API.
- Phone validity pattern and input/payment/day accessibility were corrected.
- Public signup semester prices now match the approved homepage prices: Basic
  $40 and Full $55, based on 24 cleanings. Daily averages and savings are derived.

Limits:
- These checks use synthetic data, not the live Supabase project. Live database
  connection/setup remains unresolved; no remote schema/data was changed.
- Google sign-in has been discussed but is not implemented.
- The standalone lint command still needs an ESLint configuration; build/type
  checks do not constitute an ESLint run.
- This is evidence for the tested workflows, not a guarantee of zero bugs.

Photo-compression verification additionally covers:
- Real JPEG/PNG/WebP processing, resize limits, upright camera orientation,
  metadata removal, preserving already-small originals, and invalid input.
- Keeping proof unchanged until approval, then storing verified smaller copies.
- Rollback for upload failures, damaged stored copies and concurrent job changes.
- Approval remains valid when deletion fails; owner-only cleanup retries are
  idempotent and preserve the compressed photos.
