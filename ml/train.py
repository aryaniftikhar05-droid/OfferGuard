"""Reproducible recruitment-text baseline. Nothing is fitted on the test fold.

Usage: python3 ml/train.py --csv data/raw/emscad_v1.csv
Raw data is not redistributed. See DATA_CARD.md for provenance and limits.
"""
from pathlib import Path
import argparse
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import sklearn
from scipy.special import expit
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
    confusion_matrix, precision_score, recall_score, f1_score, roc_auc_score)
from sklearn.model_selection import StratifiedGroupKFold

sys.path.insert(0, str(Path(__file__).parent))
from text import normalize, tokenize, identity

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
FIELDS = ["title", "description", "requirements", "benefits"]

class UnionFind:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)

def metrics(y, p, threshold):
    pred = p >= threshold
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {"precision": float(precision_score(y, pred, zero_division=0)),
        "recall": float(recall_score(y, pred, zero_division=0)),
        "f1": float(f1_score(y, pred, zero_division=0)),
        "average_precision": float(average_precision_score(y, p)),
        "roc_auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "confusion": {"true_negative": int(tn), "false_positive": int(fp),
            "false_negative": int(fn), "true_positive": int(tp)},
        "false_positive_rate": float(fp / max(1, fp + tn))}

def main(csv):
    raw = Path(csv).read_bytes()
    df = pd.read_csv(csv).fillna("")
    y = df["fraudulent"].map({"t": 1, "f": 0, "1": 1, "0": 0, 1: 1, 0: 0})
    if y.isna().any(): raise ValueError("Unknown labels; expected f/t or 0/1")
    y = y.to_numpy(dtype=int)
    # Company profile is used ONLY to prevent leakage, never as a model feature.
    uf, profiles, bodies = UnionFind(len(df)), {}, {}
    for i, row in df.iterrows():
        profile = identity(row["company_profile"])
        body = identity(row["description"])
        for value, seen in [(profile if len(profile)>60 else "", profiles),
                            (body if len(body)>80 else "", bodies)]:
            if not value: continue
            digest = hashlib.sha256(value.encode()).hexdigest()
            if digest in seen: uf.union(i, seen[digest])
            else: seen[digest] = i
    groups = np.array([uf.find(i) for i in range(len(df))])
    texts = df[FIELDS].astype(str).agg("\n".join, axis=1).to_numpy()
    outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    dev, test = next(outer.split(texts, y, groups))
    inner = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED+1)
    train_rel, cal_rel = next(inner.split(texts[dev], y[dev], groups[dev]))
    train, cal = dev[train_rel], dev[cal_rel]
    assert not (set(groups[train]) & set(groups[cal]))
    assert not (set(groups[train]) & set(groups[test]))
    assert not (set(groups[cal]) & set(groups[test]))
    vectorizer = TfidfVectorizer(analyzer="word", tokenizer=tokenize,
        token_pattern=None, lowercase=False, ngram_range=(1, 2),
        max_features=24000, min_df=3, sublinear_tf=True, norm="l2", dtype=np.float64)
    X_train = vectorizer.fit_transform(texts[train])
    model = LogisticRegression(C=8.0, class_weight="balanced", max_iter=1200,
        random_state=SEED, solver="liblinear")
    model.fit(X_train, y[train])
    X_cal = vectorizer.transform(texts[cal])
    cal_logits = model.decision_function(X_cal)
    # Held-out sigmoid calibration. The same development fold selects a review
    # threshold. Its metrics are not called test metrics; test remains untouched.
    calibrator = LogisticRegression(C=1000.0, solver="lbfgs", max_iter=1000)
    calibrator.fit(cal_logits.reshape(-1, 1), y[cal])
    slope, intercept = float(calibrator.coef_[0, 0]), float(calibrator.intercept_[0])
    p_cal = expit(slope * cal_logits + intercept)
    # Lock threshold by development F2 (recall-weighted), before test scoring.
    thresholds = np.linspace(.02, .95, 187)
    def f2(t):
        pred = p_cal >= t
        prec = precision_score(y[cal], pred, zero_division=0)
        rec = recall_score(y[cal], pred, zero_division=0)
        return 5*prec*rec/(4*prec+rec) if prec+rec else 0
    threshold = float(max(thresholds, key=f2))
    X_test = vectorizer.transform(texts[test])
    p_test = expit(slope*model.decision_function(X_test)+intercept)
    p_raw = model.predict_proba(X_test)[:, 1]
    test_metrics = metrics(y[test], p_test, threshold)
    majority = {"accuracy": float((y[test] == 0).mean()), "scam_recall": 0.0,
        "average_precision": float(y[test].mean())}
    bins = []
    for lo, hi in zip(np.linspace(0,1,6)[:-1],np.linspace(0,1,6)[1:]):
        mask = (p_test >= lo) & (p_test < hi if hi < 1 else p_test <= hi)
        if mask.any(): bins.append({"from":float(lo),"to":float(hi),
            "mean_score":float(p_test[mask].mean()),
            "observed_fraction":float(y[test][mask].mean()),"count":int(mask.sum())})
    # Perturbation audit is reported, never used to select the model.
    original_logits = model.decision_function(X_test)
    case_logits = model.decision_function(vectorizer.transform(np.char.upper(texts[test].astype(str))))
    named_slices = {}
    for name, mask in {
        "remote": df.iloc[test]["telecommuting"].isin(["t",1,"1"]).to_numpy(),
        "short_text": np.array([len(tokenize(t)) < 80 for t in texts[test]]),
        "uk": df.iloc[test]["location"].str.startswith("GB").to_numpy(),
    }.items():
        if mask.sum() and len(set(y[test][mask])) == 2:
            named_slices[name] = {"rows":int(mask.sum()),"scams":int(y[test][mask].sum()),
                **metrics(y[test][mask],p_test[mask],threshold)}
    report = {
        "model_version":"emscad-grouped-v1", "built_at":datetime.now(timezone.utc).isoformat(),
        "dataset": {"name":"EMSCAD v1", "total":len(df), "scams":int(y.sum()),
            "period":"2012–2014", "sha256":hashlib.sha256(raw).hexdigest(),
            "source":"https://raw.githubusercontent.com/Eric-Miao/INFO251-Job_Scam_Detection/main/Data/emscad_v1.csv",
            "paper":"https://doi.org/10.3390/fi9010006"},
        "split":{name:{"rows":len(idx),"scams":int(y[idx].sum()),
            "groups":len(set(groups[idx]))} for name,idx in [("train",train),("calibration",cal),("test",test)]},
        "split_method":"Seeded company-profile and exact-description grouped holdout; no shared groups across folds. Residual near-duplicates and unknown-company overlap may remain.",
        "features":len(vectorizer.vocabulary_), "training_fields":FIELDS,
        "threshold":threshold,"threshold_method":"Maximum F2 on the calibration/development fold; locked before test scoring.",
        "test":test_metrics,"majority_baseline":majority,
        "uncalibrated_brier":float(brier_score_loss(y[test],p_raw)),
        "reliability_bins":bins,"slices":named_slices,
        "robustness":{"uppercase_max_logit_difference":float(np.max(np.abs(original_logits-case_logits)))},
        "runtime":{"python":platform.python_version(),"sklearn":sklearn.__version__,"numpy":np.__version__,"pandas":pd.__version__},
        "limits":["Historical English job adverts from one platform; no modern recruitment or visa-message validation.",
            "Group splitting reduces leakage but cannot prove all related employers or near-duplicates are separated.",
            "Calibration estimates historical dataset frequencies, not the chance that a current offer is fraudulent.",
            "The text model does not verify a company, domain ownership, recruiter identity, sponsor licence or visa eligibility.",
            "Evidence rules are a separate heuristic layer; test metrics apply only to the text model.",
            "No prospective user study or measured real-world loss reduction has been completed."]}
    exported = {"version":report["model_version"],"features":vectorizer.get_feature_names_out().tolist(),
        "idf":vectorizer.idf_.tolist(),"weights":model.coef_[0].tolist(),
        "bias":float(model.intercept_[0]),"calibration":{"slope":slope,"intercept":intercept},
        "threshold":threshold,"tokenizer":"ascii-word-v1","max_chars":30000}
    # Synthetic fixtures test cross-runtime inference without redistributing ads.
    fixtures = ["Software engineer. Build APIs, write tests and collaborate with a product team. Apply through our official careers portal. Two technical interviews.",
        "Work from home! No experience required. Earn weekly income. Pay a registration fee to start immediately. Send a passport copy on WhatsApp.",
        "REMOTE &amp; FLEXIBLE <b>job</b>\\r\\n apply now", "", "data data data engineer Python Python", "CAFÉ café engineering ＳＯＦＴＷＡＲＥ"]
    parity = [{"text":t,"score":float(p)} for t,p in zip(fixtures,expit(slope*model.decision_function(vectorizer.transform(fixtures))+intercept))]
    for path, value in [(ROOT/"dist/assets/model.json",exported),
                        (ROOT/"dist/assets/evaluation.json",report),
                        (ROOT/"tests/parity-fixtures.json",parity)]:
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(value,ensure_ascii=False,separators=(",",":")))
    # Save row indices and group hashes for reproducible audit, not raw listings.
    split = {name:[int(i) for i in idx] for name,idx in [("train",train),("calibration",cal),("test",test)]}
    (ROOT/"ml/split.json").write_text(json.dumps(split,separators=(",",":")))
    print(json.dumps({"split":report["split"],"threshold":threshold,"test":test_metrics,
        "baseline":majority,"features":report["features"],"slices":named_slices},indent=2))

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("--csv",required=True)
    main(p.parse_args().csv)
