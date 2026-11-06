# Validation

## 2026-11-06 — evidence-rule false alarms

- Ran every evidence rule over all 17,880 EMSCAD adverts with
  `ml/evaluate_rules.mjs`. Before this change the high-severity payment rule
  fired on 257 of 17,014 legitimate adverts (1.51%) and 11 of 866 scams (1.27%).
  All 11 scam matches were incidental wording ("required to conduct training",
  "invoice processing"), not payment requests. Because any high-severity match
  sets the verdict to "Strong warning signs", about 1 in 66 ordinary adverts got
  the strongest warning.
- Rewrote the payment and money-mule rules so the candidate must be the one
  paying or moving money, and added fake-cheque, parcel-reshipping and
  chat-only-interview rules. Negation no longer treats "not only" or "do not
  hesitate" as a no-fee statement; "the company will pay the fee" is not a
  warning.
- After: high-severity rules fire on 0 of 17,014 legitimate adverts; any rule
  fires on 0.13% of legitimate adverts and 2.66% of scams (urgency wording).
  Counts are in `ml/rule-evaluation.json`.
- 16 Node tests pass, including fixed false-alarm sentences and new scam
  patterns. The 2 Python parity tests pass.
- Limit: EMSCAD (2012–2014 adverts) contains few explicit fee, cheque or mule
  requests, so the new rules' recall on modern scams is checked only with
  hand-written sentences, not a labelled dataset.

## 2026-11-05

### Completed

- Trained on the checksummed 17,880-row EMSCAD mirror; exported a real model and
  held-out evaluation. Split row indices are recorded in `ml/split.json`.
- 12 Node tests passed, including Python/JavaScript numeric prediction parity
  (absolute score error below 1e-10 on synthetic fixtures).
- Desktop browser: model loaded successfully; fictional upfront-fee example
  produced three evidence warnings and a separate ML score.
- Desktop browser: typical advert with an explicit no-fee statement produced no
  payment warning. The interface states this is not authenticity verification.
- Desktop browser: a three-row CSV produced high-warning, few-warning and
  insufficient-text outcomes. Short-text ML score was withheld.
- Desktop browser: model report navigation displayed recall, precision, false
  positives, false negatives and the weak UK slice correctly.
- Authored app modules and Python scripts passed syntax checks.
- Repository checked to confirm raw training data is not committed.

### Limits

- The final combined evidence/abstention policy has not been benchmarked on an
  independently labelled contemporary dataset. Unit tests do not measure its
  real-world precision or recall.
- CSS includes small-screen layouts and reduced-motion handling. A physical
  phone and a separate mobile browser were not tested in this environment.
- File parsers/export formatting were unit-tested. JSON/CSV downloads were not
  separately opened in spreadsheet software during browser QA.
- Browser extension metadata errors were observed; the displayed error URLs
  belonged to the browser extension, not the app's source or model assets.
- No user study, penetration test, accessibility certification or modern-data
  calibration study was performed.
