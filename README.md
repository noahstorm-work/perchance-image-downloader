# Perchance Image Downloader

A Firefox extension to download AI-generated images from [Perchance AI Image Generator](https://perchance.org/ai-text-to-image-generator).

## Features

- **Full-page overlay gallery** — click the extension icon to open a large image gallery panel
- **Auto-detection** — images are captured via postMessage, console.log interception, and DOM scanning
- **Multi-frame support** — scans all nested iframes where Perchance renders images
- **Download with retry** — failed downloads retry up to 3 times with exponential backoff
- **Download deduplication** — prevents the same image from being queued multiple times
- **Queue size limit** — max 500 queued downloads to prevent memory issues
- **Progress tracking** — event-based progress via `chrome.downloads.onChanged` (no polling)
- **Toast notifications** — success/error messages for scan results and download status
- **Dark/light theme** — toggle between themes, preference synced across tabs
- **Configurable preview size** — slider from 80px to 400px
- **Custom download folder** — type any folder name, saved to settings
- **Image count badge** — red badge on extension icon shows detected image count
- **Lightbox preview** — double-click or expand icon to view full-size, with prev/next navigation
- **Select/deselect in lightbox** — toggle selection while previewing
- **Context menu** — right-click any image on Perchance to download directly (debounced)
- **SVG icons** — separate icon files, loaded via `chrome.runtime.getURL`
- **Keyboard shortcuts** — `Escape` to close, arrow keys for card navigation, `Shift+Enter` for lightbox
- **Accessibility** — 44px touch targets, aria-labels, aria-keyshortcuts, focus management, `role="grid"`, `role="gridcell"`, reduced-motion support
- **Content Security Policy** — extension pages hardened against inline scripts
- **URL allowlist** — only Perchance domain images are captured
- **Graceful degradation** — checks for API availability before calling Chrome APIs
- **Search/filter** — filter gallery by prompt text
- **Export** — export selected images as JSON
- **On-demand permissions** — `downloads` and `contextMenus` requested only when needed
- **Image format detection** — saves files with correct extension (.png, .jpg, .webp, etc.)
- **Download history** — persists downloaded URLs across sessions to prevent re-downloading
- **Error boundaries** — try-catch wrappers on critical paths with toast error reporting
- **Memory monitoring** — warns when heap usage exceeds 80%
- **i18n-ready** — all UI strings extracted to MSG object

## Installation

1. Clone or download this repository:
   ```
   git clone https://github.com/noahstorm-work/perchance-image-downloader.git
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Select the `manifest.json` file from the cloned folder

## Development

```bash
npm install        # install dev dependencies
npm run lint       # run ESLint
npm test           # run unit tests
npm run build      # minify to dist/
```

## Usage

1. Go to [perchance.org/ai-text-to-image-generator](https://perchance.org/ai-text-to-image-generator)
2. Click the extension icon in the toolbar to open the overlay
3. Generate images on the page
4. Click **Refresh** in the overlay to scan for images
5. Select images by clicking them (all pre-selected by default)
6. Use the **expand icon** (top-right of each card) to open lightbox preview
7. Click **Download Selected** to save images
8. Customize the download folder name in the filter bar

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close overlay or lightbox |
| `Ctrl+Shift+D` | Download all detected images |
| Arrow keys | Navigate gallery cards |
| `Shift+Enter` | Open lightbox for focused card |
| `Enter` / `Space` | Toggle selection of focused card |

## Permissions

| Permission | Purpose | Required |
|------------|---------|----------|
| `storage` | Persist folder name, theme, and preview size across tabs | Yes |
| `activeTab` | Communicate with the current tab | Yes |
| `webNavigation` | Query all frames in the page for images | Yes |
| `downloads` | Save images to your disk | No (on-demand) |
| `contextMenus` | Right-click download option on images | No (on-demand) |

## How It Works

Perchance.org uses deeply nested iframes to render the AI image generator. This extension:

1. Injects content scripts into all frames on `*.perchance.org`
2. Captures images from three sources:
   - **postMessage** — the embed iframe sends generated image data
   - **console.log** — the site logs generation results
   - **DOM scan** — finds `<img>` elements on the page
3. The background script queries all frames and deduplicates by image URL
4. Images are displayed in the overlay gallery for selection and download

## Changelog

### v2.4.0

- Added on-demand permissions (`downloads`, `contextMenus`) — only requested when user initiates download
- Added image format detection — files saved with correct extension (.png, .jpg, .webp, etc.)
- Added download history persistence — tracks downloaded URLs across sessions
- Added search/filter input — filter gallery by prompt text in real-time
- Added export button — export selected images as JSON
- Added keyboard navigation — arrow keys for card grid, Shift+Enter for lightbox
- Added error boundaries — try-catch wrappers on render/load with toast error reporting
- Added memory monitoring — warns when heap usage exceeds 80%
- Added i18n MSG object — all UI strings extracted for future localization
- Added `role="gridcell"` on gallery cards for screen reader support
- Added `aria-keyshortcuts` on all interactive buttons
- Added storage schema versioning with migration support
- Fixed `no-redeclare` lint error in load error handler
- Fixed `no-shadow` lint warning in permission callback
- Updated test suite to 90 tests (covering all new features)
- Updated README with v2.4.0 changelog

### v2.3.0

- Added `browser`/`chrome` namespace polyfill for cross-browser compatibility
- Added Perchance detection config object for easy maintenance
- Added queue persistence via `chrome.storage.session` (survives service worker restarts)
- Added gallery virtualization with `IntersectionObserver` (handles 1000+ images)
- Added storage schema versioning with migration support
- Added placeholder cards for virtualized gallery
- Updated tests to 50 (covering new features)

### v2.2.0

- Added Content Security Policy to extension pages
- Added URL domain allowlist for image capture (Perchance domains only)
- Added context menu debounce (1s) to prevent queue flooding
- Replaced progress polling with `chrome.downloads.onChanged` events
- Added toast notifications for scan results, download status, and errors
- Renamed CSS classes for clarity (`pdl-sel` -> `pdl-selected`, `pdl-lb` -> `pdl-lightbox`)
- Moved SVG icons to separate files (`icons/svg/`)
- Added `aria-keyshortcuts` and `role="grid"` for accessibility
- Added `focus-visible` styles for keyboard navigation
- Added graceful degradation for missing Chrome APIs
- Added named constants (`MIN_IMAGE_SIZE`, `ALLOWED_DOMAINS`, etc.)
- Added unit tests (34 tests covering URL validation, escaping, dedup, queue, retry, CSS)
- Added minification build script (`npm run build` -> `dist/`)
- Documented prompt text trust boundary

### v2.1.0

- Migrated to Manifest V3
- Fixed XSS vulnerability in gallery card rendering
- Added download deduplication (same image cannot be queued twice)
- Added retry logic with exponential backoff (3 attempts)
- Added queue size limit (500 items max)
- Fixed memory leak in keyboard event handler
- Moved theme/preview settings to `chrome.storage` for cross-tab sync
- Extracted inline CSS to separate file
- `console.log` monkey-patching now restored on page unload

### v2.0.0

- Full-page overlay gallery UI
- Multi-frame image detection
- Lightbox preview with navigation
- Context menu download
- Dark/light theme

## License

MIT
