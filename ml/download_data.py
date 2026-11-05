"""Download the public EMSCAD mirror and require the recorded content hash.

Review DATA_CARD.md before use. This downloads research data; it does not confer
rights to redistribute the dataset or deploy the classifier commercially.
"""
from pathlib import Path
import hashlib
import urllib.request

URL = 'https://raw.githubusercontent.com/Eric-Miao/INFO251-Job_Scam_Detection/main/Data/emscad_v1.csv'
SHA256 = '25e52f6d34939510f3f2ca5afc55ccfe7259ccc01283319bd484c466ea88baaf'
target = Path(__file__).resolve().parents[1] / 'data/raw/emscad_v1.csv'
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == SHA256:
    print('Dataset already present and checksum verified.')
else:
    with urllib.request.urlopen(URL, timeout=90) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError('The mirror content changed. Review provenance before using it.')
    target.write_bytes(data)
    print('Downloaded EMSCAD v1; SHA-256 verified. Raw data is excluded from source control.')
