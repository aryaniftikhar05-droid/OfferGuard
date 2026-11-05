# Data and model card

## Provenance

- Original dataset: Employment Scam Aegean Dataset (EMSCAD), introduced by
  Vidros, Kolias, Kambourakis and Akoglu, Future Internet 2017, 9(1), 6.
- Paper: https://doi.org/10.3390/fi9010006
- Original dataset page: http://emscad.samos.aegean.gr/ (unavailable during this build).
- Retrieval mirror: https://github.com/Eric-Miao/INFO251-Job_Scam_Detection/blob/main/Data/emscad_v1.csv
- Retrieved: 2026-11-05. Byte count: 59,068,295.
- SHA-256: `25e52f6d34939510f3f2ca5afc55ccfe7259ccc01283319bd484c466ea88baaf`.
- CSV has 18 columns, 17,880 rows. Original labels are `f` (17,014) and
  `t` (866). It contains no timestamp suitable for a temporal evaluation.
- Source period: 2012–2014, from Workable. Original paper describes manual
  annotation by specialised Workable staff. This build did not re-annotate rows
  or independently verify the original labels.

## Use and reuse

The raw CSV is excluded from Git, the website, and the downloadable source ZIP.
The mirror is a retrieval source, not authority to grant rights. The original
dataset-specific redistribution/commercial-use terms could not be confirmed
from the unavailable original download page during this build. The paper's open
access licence must not be assumed to license the dataset identically.

This research prototype includes learned coefficients and vocabulary. The MIT
licence applies to authored code, not the original dataset or an assertion that
learned artifacts are unrestricted. Check the original dataset and model-artifact
reuse terms before redistributing data or using the model commercially.
Downloading public bytes does not by itself resolve those terms.

## Intended use

Exploratory research, education, and human review of recruitment text. The
statistical model is an old-population baseline, not a certified scam detector.
It does not determine whether a person, company, document, visa or employment
offer is genuine and is not designed to decide applicant eligibility.

## Feature and leakage controls

Input fields are title, description, requirements and benefits. Text is NFKC
normalised, lowercased, stripped of HTML tags, and split into ASCII words.
Company profiles and exact descriptions group related rows before splitting.
Only sufficiently long nonempty profiles/descriptions create shared groups.
Union-find joins overlapping matches transitively. Other fields are not input.

This reduces recurrence leakage but does not eliminate paraphrased adverts,
unknown-company overlap or identifiers embedded in text. There is no temporal
holdout and no platform holdout. Group counts, row indices and content hashes
are retained for reproducibility.

## Evaluation scope

10,728 training rows / 3,576 calibration-development / 3,576 test.
Test: 104 true positives, 69 false negatives, 42 false positives, 3,361 true negatives.
Calibration and threshold fitting share one development fold; that shortcut
must be revisited in a larger study. Test scores apply to the model at threshold
0.19 only. The policy layer and abstention thresholds were designed separately
and have unit tests, not independently labelled performance estimates.

The test set has two UK scams, both missed. Country and remote-role slices are
small and cannot establish effectiveness for these groups. No demographic
fairness audit was possible with this data, and none is claimed.

## Privacy

The app processes input locally and has no analytics, external inference API,
history or database. Generated model artifacts contain vocabulary/coefficients,
not raw training rows. Source tests use synthetic examples. Explicit exports may
contain matched excerpts. Hosting infrastructure handles normal page requests.

## Failure modes

Historical domain shift, unusual legitimate wording, polished or adversarial
scam messages, multilingual text, short messages, negation, context split over
multiple sentences, forged branding and a real organisation being impersonated.
A lower score is never proof of safety. Independent verification remains needed.
