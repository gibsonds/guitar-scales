# Guitar Scale Explorer - GitHub Pages Edition

A fully client-side guitar scale visualization tool. This version runs entirely in the browser with no backend required.

## Features

- 🎸 13 guitar scale patterns (modes, blues, jazz/symmetrical scales)
- 🎵 Transpose to any root note (C through B)
- 🎚️ Octave shifting (+12/-12 frets)
- 📊 Canvas-based fretboard visualization
- 🔄 Automatic positioning (defaults to below fret 12)
- 📱 Mobile-friendly responsive design

## Deployment to GitHub Pages

### Quick Deploy

1. **Create a GitHub repository** (public)
   ```bash
   # From the github-pages directory
   git init
   git add .
   git commit -m "Initial commit: Guitar Scale Explorer"
   ```

2. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/guitar-scales.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - Go to repository Settings
   - Click "Pages" in sidebar
   - Under "Source", select "main" branch
   - Click "Save"

4. **Access your site**
   - Your site will be live at: `https://YOUR_USERNAME.github.io/guitar-scales/`
   - May take a few minutes to deploy

### Local Testing

Open `index.html` directly in a browser:
```bash
open index.html  # macOS
# or just double-click the file
```

Or use a local server (recommended for avoiding CORS issues):
```bash
# Python 3
python3 -m http.server 8080

# Then visit: http://localhost:8080
```

## How It Works

### Client-Side Architecture

Everything runs in the browser:
- **No backend** - Pure HTML/CSS/JavaScript
- **JSON files** - Scale patterns loaded via fetch API
- **Client-side transposition** - JavaScript calculates note positions
- **Canvas rendering** - Fretboard drawn directly in browser

### File Structure

```
github-pages/
├── index.html           # Standalone HTML (all CSS/JS inline)
├── scales/              # Scale pattern JSON files
│   ├── major_blues_box.json
│   ├── ionian_3nps.json
│   └── ... (13 total)
└── README.md
```

### Technical Details

**Transposition Logic:**
- Each JSON file defines a pattern starting at a specific root (e.g., A)
- JavaScript calculates semitone shift to new root
- Applies shift to all fret positions
- Recalculates note names based on standard tuning

**Octave Shifting:**
- Auto-shifts patterns starting above fret 12 down one octave
- Manual +12/-12 buttons for user control
- Resets on scale/root change

## Editing Scale Patterns

Scale patterns are defined in `scales/*.json`. Each file contains:
- Starting position (tone, string, fret)
- Intervals and scale degrees
- Fret positions for each string

Edit the JSON files and reload the page to see changes.

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers

## License

MIT License - Feel free to fork and customize!


## Browser script security

Tone.js stays on the existing 14.8.49 CDN release, with SHA-384 Subresource Integrity and anonymous CORS. A changed CDN response is blocked by the browser rather than executed.

GoatCounter's current integration script is self-hosted at `vendor/goatcounter-count.js`, copied without changes from https://gc.zgo.at/count.js on 2026-11-05. Its SHA-256 is `792b7abd26c1fb6ae62906833e09a301251e2641816e69e4f95aba518f3fe3f0`. The ISC attribution is alongside it. Analytics still uses the existing `guitarllm.goatcounter.com/count` endpoint; no analytics events or endpoint settings were changed. Self-hosting is supported by https://www.goatcounter.com/help/countjs-host.

Updates are deliberate: review the official upstream script, replace the local file, update its integrity value in `index.html` and this digest, then test. Automatic script updates are no longer accepted. This static app intentionally has no npm package manifest or lockfile.

Run the dependency-integrity checks with `node --test tests/*.test.mjs`.
