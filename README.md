# Perchance Image Downloader

A Firefox extension to download AI-generated images from [Perchance AI Image Generator](https://perchance.org/ai-text-to-image-generator).

## Features

- **Full-page overlay gallery** — click the extension icon to open a large image gallery panel
- **Auto-detection** — images are captured via postMessage, console.log interception, and DOM scanning
- **Multi-frame support** — scans all nested iframes where Perchance renders images
- **Download with retry** — configurable retry count and delay for failed downloads
- **Progress bar** — real-time download progress tracking
- **Dark/light theme** — toggle between themes, preference saved
- **Configurable preview size** — slider from 80px to 400px
- **Custom download folder** — type any folder name, saved to settings
- **Image count badge** — red badge on extension icon shows detected image count
- **Lightbox preview** — double-click or expand icon to view full-size, with prev/next navigation
- **Select/deselect in lightbox** — toggle selection while previewing
- **Context menu** — right-click any image on Perchance to download directly
- **SVG icons** — clean Lucide-style vector icons throughout
- **Keyboard shortcuts** — `Escape` to close, `Ctrl+Shift+D` to download all
- **Accessibility** — 44px touch targets, aria-labels, focus management, reduced-motion support

## Installation

1. Clone or download this repository:
   ```
   git clone https://github.com/noahstorm-work/perchance-image-downloader.git
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Select the `manifest.json` file from the cloned folder

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

## Permissions

| Permission | Purpose |
|------------|---------|
| `downloads` | Save images to your disk |
| `storage` | Persist folder name and theme settings |
| `contextMenus` | Right-click download option on images |
| `activeTab` | Communicate with the current tab |
| `webNavigation` | Query all frames in the page for images |

## How It Works

Perchance.org uses deeply nested iframes to render the AI image generator. This extension:

1. Injects content scripts into all frames on `*.perchance.org`
2. Captures images from three sources:
   - **postMessage** — the embed iframe sends generated image data
   - **console.log** — the site logs generation results
   - **DOM scan** — finds `<img>` elements on the page
3. The background script queries all frames and deduplicates by image URL
4. Images are displayed in the overlay gallery for selection and download

## License

MIT
