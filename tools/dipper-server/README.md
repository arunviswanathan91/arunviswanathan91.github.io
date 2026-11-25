# Paraphrase and scoring server

Backs the dashboard's Writing view. It runs the DIPPER paraphraser
(`kalpeshk2011/dipper-paraphraser-xxl`, Krishna et al., NeurIPS 2023) and returns an
intrinsic-dimension score (Tulchinskii et al., NeurIPS 2023).

## Status

- `phd.py` is tested on synthetic data.
- `server.py` has not been run on a GPU yet. DIPPER is loaded in 8-bit so it fits a 16 GB card;
  the authors only tested full precision on 40 GB. Do the check below before trusting output.

## Start it on Colab or Kaggle (GPU runtime)

```python
# 1. Get the files and install
!git clone --depth 1 -b dumbling/adoring-davinci-pk7kdq https://github.com/arunviswanathan91/arunviswanathan91.github.io site
%cd site/tools/dipper-server
!pip install -q -r requirements.txt
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared && chmod +x cloudflared
```

```python
# 2. Start the server with a token you choose
import os, secrets, subprocess
os.environ["DIPPER_TOKEN"] = secrets.token_urlsafe(24)
print("Token:", os.environ["DIPPER_TOKEN"])
server = subprocess.Popen(["uvicorn", "server:app", "--port", "8000"])
```

```python
# 3. Open a tunnel; the https address it prints goes into the Writing view
!./cloudflared tunnel --url http://localhost:8000
```

The first start downloads about 45 GB of weights. Paste the address and the token into
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
setting is 60 and 60.

## Reading the score

Human English text usually scores 9–10 and generated text about 8, measured on roughly 300
tokens. The estimate is noisy and unreliable on short text. In the paper, DIPPER did not move
this score, so treat it as the hard check.

## Settings

| Variable | Default |
|---|---|
| `DIPPER_TOKEN` | required |
| `DIPPER_MODEL` | `kalpeshk2011/dipper-paraphraser-xxl` |
| `DIPPER_ORIGIN` | `https://arunviswanathan91.github.io` |
