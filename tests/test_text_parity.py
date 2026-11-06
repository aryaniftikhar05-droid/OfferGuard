"""Check that Python preprocessing (training) matches JavaScript (browser).

If these drift apart, the browser would silently score text differently from
the model that was evaluated. Requires Node 20+ on PATH.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))
from text import normalize, tokenize  # noqa: E402

CASES = [
    "Software Engineer: build APIs & write tests.",
    "REMOTE &amp; FLEXIBLE <b>job</b>\\r\\n apply now",
    "CAFÉ café engineering ＳＯＦＴＷＡＲＥ",
    "Pay a £150 registration-fee before 9am!!",
    "x1 a 42 python3 c++ node.js",
    "   multiple    spaces\tand\ttabs   ",
    "",
]


def js_results():
    script = (
        "import {normalize,tokenize} from './dist/assets/engine.js';"
        "const cases=JSON.parse(process.argv[1]);"
        "console.log(JSON.stringify(cases.map(c=>[normalize(c),tokenize(c)])));"
    )
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script, json.dumps(CASES)],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def test_python_and_javascript_preprocessing_match():
    for case, (js_norm, js_tokens) in zip(CASES, js_results()):
        assert normalize(case) == js_norm, case
        assert tokenize(case) == js_tokens, case


def test_tokenizer_drops_single_letters_and_leading_digits():
    assert tokenize("a 1st b2 ok") == ["b2", "ok"]
