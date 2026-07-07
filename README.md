# 🌍 Terra News — Global News on a Spinning Globe

A locally-hostable, GitHub-Pages-ready site that aggregates **live global news** and
plots each story on an interactive **3D globe** at its geographic origin. Spin the
globe, scroll into a region, and click a marker to read the article.

![topic dots](https://img.shields.io/badge/data-GDELT-4c8dff) ![globe.gl](https://img.shields.io/badge/render-globe.gl-34d0c0) ![no%20API%20key](https://img.shields.io/badge/API%20key-none-7bed57)

## Features

- **Geolocated news** — every headline is placed on the globe by the country its
  source outlet is based in, with a small deterministic jitter so clusters stay readable.
- **Spinning globe** that auto-rotates and pauses while you interact.
- **Fly to a region** — one click flies the camera into North America, Europe,
  Asia, Africa, the Middle East, and more.
- **Topic filters** — toggle story categories (Politics, Conflict, Economy,
  Climate, Tech, Health, Science, Sports, and regional feeds).
- **Search** headlines and countries; **headlines panel** lists the latest stories.
- **No API key, no backend, no build step.** Fully static — works on GitHub Pages.

## How it works

GitHub Pages can only serve static files, and the news source
([GDELT](https://www.gdeltproject.org/)) sends no CORS headers and rate-limits by IP —
so the browser can't fetch it directly. Instead:

```
 GitHub Action (every 2h)          Static site (GitHub Pages)
 ┌────────────────────────┐        ┌──────────────────────────┐
 │ scripts/fetch-news.mjs │        │ index.html + js/app.js   │
 │  → GDELT DOC 2.0 API   │  data/ │  → globe.gl renders       │
 │  → map country→lat/lng │ ─────► │     data/news.json on a   │
 │  → write news.json     │ commit │     3D globe              │
 └────────────────────────┘        └──────────────────────────┘
```

The scheduled [workflow](.github/workflows/update-news.yml) fetches news
server-side (where there's no CORS and a clean rate-limit budget), geolocates it,
and commits `data/news.json`. The static site just loads that JSON.

## Run locally

Requires Node 18+. No `npm install` needed — the dev server and scripts are
dependency-free, and the globe library is vendored in `js/vendor/`.

```bash
# Serve the site at http://localhost:8080
npm run dev

# (optional) refresh the news data yourself
npm run fetch
```

Then open <http://localhost:8080>.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The static globe site |
| `js/vendor/globe.gl.min.js` | Vendored [globe.gl](https://github.com/vasturiano/globe.gl) (bundles three.js) |
| `img/` | Earth textures + starfield |
| `data/news.json` | Generated, geolocated news the site renders |
| `data/country-centroids.json` | Country → lat/lng lookup |
| `scripts/fetch-news.mjs` | Aggregates + geolocates news from GDELT |
| `scripts/build-centroids.mjs` | Rebuilds the centroid lookup from the CSV |
| `scripts/serve.mjs` | Zero-dependency static dev server |
| `.github/workflows/update-news.yml` | Scheduled data refresh |

## Notes & limitations

- **Geolocation is country-level.** GDELT's article list exposes a source
  *country*, not street coordinates, so markers sit near a country centroid.
- **Topic = which query surfaced the story**, an approximation rather than a
  strict classification.
- News is English-language–filtered for readable headlines; global outlets
  (e.g. Times of India, Al Jazeera, SCMP) still provide broad geographic spread.

## Credits

News data © [The GDELT Project](https://www.gdeltproject.org/). Globe rendering by
[globe.gl](https://github.com/vasturiano/globe.gl) / [three.js](https://threejs.org/).
Earth imagery from the three-globe example assets. MIT licensed.
