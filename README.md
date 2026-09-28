# Chess

A classic-styled chess game that runs entirely in the browser — no backend required.

- Full chess rules (castling, en passant, promotion, check/checkmate/stalemate)
- Play against the computer (**Stockfish 16**, running locally via WebAssembly) or a friend
- Adjustable difficulty from Beginner (~800 Elo) to Maximum (~3000+ Elo)
- Synthesized sound effects, move history, captured-piece trays, board flip, undo

## Run locally

It's pure static files, so any static server works:

```bash
python -m http.server 5555
```

Then open <http://localhost:5555>.

## Deploy

Static hosting (Vercel, Netlify, GitHub Pages, Render static site). No build step.
On Vercel, deploy this folder directly (`npx vercel`) or set the project's
**Root Directory** to this folder. HTTPS is required for the Stockfish engine to load,
which every host above provides automatically.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Page + layout |
| `styles.css` | Classic wooden-board theme |
| `engine.js` | Chess rules, move generation, FEN |
| `ai.js` | Built-in fallback engine (minimax) |
| `sf.js` | Stockfish (WASM) wrapper |
| `sounds.js` | Web Audio sound effects |
| `app.js` | UI and game flow |
| `engine/` | Stockfish 16 single-threaded WASM build |
