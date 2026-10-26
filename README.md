<div align="center">
  <img src="logo.png" alt="Cedar Logo" width="128" />
  <h1>Cedar</h1>
  <p>A private, local-first static blogging platform and visual site builder that operates entirely in your browser. Write, design, and manage your site locally, then publish directly to GitHub or export a ready-to-host <code>.zip</code> archive.</p>
  <p>Vibe coded by <b>Gemini</b> • Designed by <b>SheeshFr</b></p>
</div>

---

## Features

- **Visual Studio & Block Editor:** Write articles and custom pages with rich formatting, image galleries, callouts, audio/video embeds, tables, and live side-by-side preview.
- **Real-Time Theme & Layout Designer:** Customize palettes, typography, post card layouts, header/footer navigation, and profile widgets with zero code.
- **Image Sanitization:** All uploaded images (JPEG, PNG, WebP, GIF) are automatically re-rasterized client-side to strip EXIF metadata, GPS coordinates, camera serial numbers, and embedded comments before being compressed into WebP.
- **Draft Quarantine:** Published articles compile into standalone, SEO-ready HTML (`blog/<slug>/index.html`) alongside an automatic RSS feed (`rss.xml`) and search index, while drafts (`drafts/`) and archived posts (`hidden/`) stay excluded from public builds via `.cfignore`.
- **GitHub Publishing & `.zip` Export:** Push your compiled static site directly to your GitHub repository in a single atomic commit (ready for Cloudflare Pages or GitHub Pages), or export a standalone production `.zip` archive in one click.
- **100% Local-First Storage:** Keep your entire site vault (`config.json`, posts, pages, and media) in a folder on your local drive. Zero external databases, accounts, or telemetry.

---

## Usage

### 1. Web App (Recommended)
Visit [**https://cedar.pub**](https://cedar.pub) in any modern browser to start writing, designing, and managing your site immediately—no installation required. All data stays 100% in your local browser storage or linked local folder.

### 2. Run Locally
Clone the repository and run the included local Python server for automatic real-time disk syncing with your local blog folder:

```bash
# Windows
.\cedar.bat

# Linux / macOS
./cedar.sh
```

Or run directly:
```bash
python serve.py
```
Cedar will automatically open `http://localhost:8080` in your browser.

---

## Publishing & Deployment

Open the **Publish** pane in the Cedar dashboard to deploy your site:

- **Publish to GitHub:** Enter your GitHub Repository URL (`https://github.com/username/repo`) and a Personal Access Token (PAT), then click **Publish to GitHub**. Cedar compiles your live site and pushes a single atomic commit directly to your repository—ready to link with Cloudflare Pages or GitHub Pages on your custom domain.
- **Export Web Package (`.zip`):** Click **Download Master Archive (.ZIP)** to bundle your complete, pre-rendered static website into a portable `.zip` file ready to drop onto any static web host.

---

## Privacy & Security

- **No Central Servers:** Your drafts, media library, and site configuration remain strictly on your machine.
- **Zero Metadata Leakage:** Client-side canvas sanitization guarantees that personal EXIF and location metadata are stripped on upload.
- **Private Credentials:** Your GitHub Personal Access Token is stored exclusively in your local browser (`localStorage`) and communicates directly with `api.github.com`.

---

## License

GPL v3 License. Free and open source.
