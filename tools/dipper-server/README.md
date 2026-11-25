# Paraphrase and scoring server

Backs the dashboard's Writing view. It runs one rewriting model and returns an
intrinsic-dimension score (Tulchinskii et al., NeurIPS 2023).

| `DIPPER_KIND` | Model | Evidence |
|---|---|---|
| `dipper` (default) | `kalpeshk2011/dipper-paraphraser-xxl`, 8-bit | Krishna et al., NeurIPS 2023, against 2023 detectors |
| `humanizer` | `jialinyyzz/humanizer`, GGUF | Author-measured on Originality.ai; not independently checked |

One server runs one model, because both do not fit on a 16 GB GPU. To compare them, run each in
turn on the same text and read the scores.

## Status

- `phd.py` is tested on synthetic data.
- `server.py` has not been run on a GPU yet, for either model.
- DIPPER is loaded in 8-bit so it fits a 16 GB card; the authors only tested full precision on
  40 GB. Do the check below before trusting output.
- The humanizer prompt is checked against the hash on its model card at start-up. Loading the
  GGUF depends on the installed `llama-cpp-python` supporting the Gemma 4 architecture.

## Start it on Colab or Kaggle (GPU runtime)

```python
# 1. Get the files and install
!git clone --depth 1 -b dumbling/adoring-davinci-pk7kdq https://github.com/arunviswanathan91/arunviswanathan91.github.io site
%cd site/tools/dipper-server
!pip install -q -r requirements.txt
# For the humanizer, replace the CPU build of llama-cpp-python with a GPU one:
# !CMAKE_ARGS="-DGGML_CUDA=on" pip install -q --force-reinstall --no-cache-dir llama-cpp-python
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared && chmod +x cloudflared
```

```python
# 2. Start the server with a token you choose
import os, secrets, subprocess
os.environ["DIPPER_TOKEN"] = secrets.token_urlsafe(24)
os.environ["DIPPER_KIND"] = "dipper"  # or "humanizer"
print("Token:", os.environ["DIPPER_TOKEN"])
server = subprocess.Popen(["uvicorn", "server:app", "--port", "8000"])
```

```python
# 3. Open a tunnel; the https address it prints goes into the Writing view
!./cloudflared tunnel --url http://localhost:8000
```

The first start downloads about 45 GB of weights for DIPPER, or 10 GB for the humanizer. Paste the address and the token into
**Writing → Paraphrase server** and save.

## Check 8-bit output first

The authors publish reference outputs in `sample_outputs.md` in
`martiansideofthemoon/ai-detection-paraphrases`. Paraphrase the same inputs and read the results
side by side. Sampling means they will not match word for word; they should be fluent and keep
the meaning. If they are not, 8-bit is not good enough and the model needs a larger GPU.

## Endpoints

All `POST` routes need `Authorization: Bearer <token>`.

| Route | Body | Returns |
|---|---|---|
| `GET /health` | – | `{model}` |
| `POST /paraphrase` | `{text, lexical, order, prefix, seed}` | `{text}` |
| `POST /score` | `{text}` | `{phd, tokens}` |

`lexical` and `order` are diversity values: 0, 20, 40, 60, 80 or 100. The paper's strongest
setting is 60 and 60. The humanizer ignores them, and `prefix`.

## How each model is fenced

- DIPPER receives text with protected spans swapped for placeholder tokens.
- The humanizer receives the paragraph as written. The dashboard then checks that every protected
  span is still there and that no new number appeared, retries up to three times, and otherwise
  keeps the paragraph as written. Its model card reports a factual problem in 44 of 420 rewrites,
  so read the flags.

## Reading the score

Human English text usually scores 9–10 and generated text about 8, measured on roughly 300
tokens. The estimate is noisy and unreliable on short text. In the paper, DIPPER did not move
this score, so treat it as the hard check.

## Settings

| Variable | Default |
|---|---|
| `DIPPER_TOKEN` | required |
| `DIPPER_KIND` | `dipper` |
| `DIPPER_MODEL` | `kalpeshk2011/dipper-paraphraser-xxl` |
| `HUMANIZER_FILE` | `humanizer-12b-Q6_K.gguf` |
| `DIPPER_ORIGIN` | `https://arunviswanathan91.github.io` |
