# Cedar

Cedar is a private, client-side static blogging platform and site builder that operates entirely in the browser. It features a Bring-Your-Own-Cloud (BYO-GitHub) synchronization model, pure client-side image sanitization, and seamless integration with Cloudflare Pages.

---

## Key Features

### 1. Mandatory Client-Side Image Sanitization
To protect user privacy and prevent accidental leakage of sensitive location or personal information:
- **Always Active**: All uploaded media (JPEG, PNG, WebP, GIF) is automatically sanitized on ingest by an offscreen browser canvas rasterizer.
- **Zero EXIF / GPS Leakage**: All exchangeable image file format tags (EXIF), GPS coordinates, camera make/model, device serial numbers, timestamps, and embedded private comments are permanently stripped before files are stored in the local vault, committed to GitHub, or published.
- **Modern WebP Compression**: Images are normalized and compressed into WebP for optimal delivery without sacrificing visual clarity.

### 2. BYO-GitHub Cloud Sync
- **Zero Central Server / Zero Third-Party Tokens**: Cedar runs completely in your browser. All GitHub authentication uses your own Personal Access Token (PAT) stored exclusively in your browser's `localStorage`. Cedar operates without backends or intermediary proxies.
- **Private Repository Support**: Users are encouraged to host their blog in a **private** GitHub repository. This guarantees that unpublished drafts and hidden archives remain confidential while Cloudflare Pages builds and serves only your public articles.
- **Atomic Single-Commit Sync**: Site updates are committed using GitHub's Git Trees REST API (`/git/trees` and `/git/commits`). Even sites with hundreds of files and assets publish in a single atomic commit, triggering only one build on Cloudflare Pages.
- **Collision Protection**: An iteration token (`sync.json`) tracks repository state across workstations. If newer changes exist on GitHub when you attempt to publish, Cedar prevents accidental overwrites with options to cancel, export a backup archive, or force overwrite.

### 3. Three-Folder Quarantine Structure & `.cfignore`
Cedar segregates content into three distinct directories:
- `blog/<slug>/`: **Published Posts Only**. Contains pre-rendered `index.html`, source `index.md`, and metadata.
- `drafts/<slug>/`: **Drafts & Scheduled Articles**. Contains source `index.md` and `draft.json` for editor persistence. **No HTML is generated**, and Cloudflare Pages ignores this directory via `.cfignore`.
- `hidden/<slug>/`: **Archived & Unlisted Posts**. Source files preserved without public HTML. Ignored by Cloudflare Pages via `.cfignore`.

When deploying to Cloudflare Pages, the included `.cfignore` ensures drafts, hidden files, and internal sync manifests are excluded from public deployment.

---

## Export & Deployment

Visit the **Export** pane in the Cedar editor to:
- **Download Master Archive**: Export your complete site as a `.zip` file.
- **Manage BYO-GitHub Cloud Sync**: Enter your GitHub username, repository, branch, and Personal Access Token. Push updates or pull remote changes across devices anytime.
