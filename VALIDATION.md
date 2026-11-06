# Validation — 2026-11-05

## Completed

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

## Limits

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
