# arunviswanathan91.github.io

Academic profile site for Arun Viswanathan (PhD Candidate & Senior Research Fellow, Rajiv Gandhi Centre for Biotechnology). Live at <https://arunviswanathan91.github.io> once pushed.

Plain HTML/CSS/JS — no build step, no framework install required. Built on the Start Bootstrap "Freelancer" template structure (Bootstrap 5 CSS via CDN), re-skinned for a minimal academic look with custom nav, hover, and scroll animations in `css/style.css` / `js/main.js`.

## Structure

- `index.html` — the single page (About, Research, Publications, CV, Contact)
- `css/style.css` — theme, layout, responsiveness, animations
- `js/main.js` — nav toggle, scrollspy, scroll-reveal, back-to-top, image/CV fallback handling
- `assets/img/` — add `profile.jpg` here (see `assets/img/README.md`)
- `assets/cv/` — add `Arun_Viswanathan_CV.pdf` here (see `assets/cv/README.md`)

## Local preview

Serve over HTTP rather than opening the file directly, so the fallback-avatar/CV-check scripts behave the same way they will on GitHub Pages:

```sh
python -m http.server 8000
```

then open <http://localhost:8000>.

## To finish setup

1. Add `assets/img/profile.jpg` (JPEG headshot).
2. Add `assets/cv/Arun_Viswanathan_CV.pdf`.
3. In `index.html`, under the Publications → Conference presentation entry, confirm the full AACR abstract title (currently reconstructed from the URL slug and marked with a `TODO` comment).
