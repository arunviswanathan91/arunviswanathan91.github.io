"""Paraphrase and scoring server for the dashboard's Writing view.

Runs DIPPER (Krishna et al., NeurIPS 2023) in 8-bit on one GPU and scores text with the
intrinsic-dimension estimator in phd.py. See README.md for how to start it on Colab or Kaggle.
"""
import os
import re

import nltk
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoModel, AutoTokenizer, BitsAndBytesConfig, T5ForConditionalGeneration, T5Tokenizer

from phd import MIN_POINTS, phd

TOKEN = os.environ["DIPPER_TOKEN"]
MODEL = os.environ.get("DIPPER_MODEL", "kalpeshk2011/dipper-paraphraser-xxl")
ORIGIN = os.environ.get("DIPPER_ORIGIN", "https://arunviswanathan91.github.io")
LEVELS = (0, 20, 40, 60, 80, 100)
MARK = re.compile(r"ZQX\d+Z")

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

tokenizer = T5Tokenizer.from_pretrained("google/t5-v1_1-xxl")
model = T5ForConditionalGeneration.from_pretrained(
    MODEL, quantization_config=BitsAndBytesConfig(load_in_8bit=True), device_map="auto"
)
model.eval()
scorer_tokenizer = AutoTokenizer.from_pretrained("roberta-base")
scorer = AutoModel.from_pretrained("roberta-base").eval()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_methods=["POST"], allow_headers=["authorization", "content-type"])


def authorised(authorization: str = Header("")):
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")


class ParaphraseIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    lexical: int = 60
    order: int = 60
    prefix: str = ""
    seed: int | None = None


class ScoreIn(BaseModel):
    text: str = Field(min_length=1, max_length=40000)


def paraphrase(text, lexical, order, prefix, sent_interval=3):
    # Same input format as the authors' paraphrase_minimal.py: the model takes similarity codes,
    # so a diversity of X is sent as 100 - X, and the span to rewrite sits between <sent> tags.
    sentences = nltk.sent_tokenize(" ".join(text.split()))
    prefix = " ".join(prefix.split())
    out = []
    for i in range(0, len(sentences), sent_interval):
        window = " ".join(sentences[i:i + sent_interval])
        prompt = f"lexical = {100 - lexical}, order = {100 - order}"
        if prefix:
            prompt += f" {prefix}"
        prompt += f" <sent> {window} </sent>"
        inputs = tokenizer([prompt], return_tensors="pt").to(model.device)
        with torch.inference_mode():
            ids = model.generate(**inputs, do_sample=True, top_p=0.75, top_k=None, max_length=512)
        piece = tokenizer.batch_decode(ids, skip_special_tokens=True)[0].strip()
        # A window that lost a placeholder is kept as written, so one bad window does not sink the paragraph.
        if sorted(MARK.findall(piece)) != sorted(MARK.findall(window)):
            piece = window
        out.append(piece)
        prefix = (prefix + " " + piece).strip()
    return " ".join(out)


@app.get("/health")
def health():
    return {"model": MODEL}


@app.post("/paraphrase", dependencies=[Depends(authorised)])
def paraphrase_route(body: ParaphraseIn):
    if body.lexical not in LEVELS or body.order not in LEVELS:
        raise HTTPException(422, "lexical and order must be one of 0, 20, 40, 60, 80, 100")
    if body.seed is not None:
        torch.manual_seed(body.seed)
    return {"text": paraphrase(body.text, body.lexical, body.order, body.prefix)}


@app.post("/score", dependencies=[Depends(authorised)])
def score_route(body: ScoreIn):
    inputs = scorer_tokenizer(body.text, return_tensors="pt", truncation=True, max_length=512)
    with torch.inference_mode():
        hidden = scorer(**inputs).last_hidden_state[0][1:-1].numpy()
    if len(hidden) < MIN_POINTS:
        raise HTTPException(422, f"text is too short to score: {len(hidden)} tokens, need {MIN_POINTS}")
    try:
        return {"phd": phd(hidden), "tokens": int(len(hidden))}
    except ValueError as error:
        raise HTTPException(422, str(error))
