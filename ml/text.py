"""Deliberately simple preprocessing, mirrored exactly in the browser."""
import re
import unicodedata

ENTITIES = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " "}

def normalize(text):
    text = unicodedata.normalize("NFKC", str(text)).lower()
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"&(amp|lt|gt|quot|apos|nbsp);", lambda m: ENTITIES[m[1]], text)
    text = text.replace("\\r", " ").replace("\\n", " ")
    return re.sub(r"\s+", " ", text).strip()

def tokenize(text):
    return re.findall(r"\b[a-z][a-z0-9]{1,}\b", normalize(text), flags=re.ASCII)

def identity(text):
    return " ".join(tokenize(text))
