#!/usr/bin/env python3
"""
Cedar — Local Development & Writing Studio Server
Serves http://localhost:8080 with no-cache headers and automatically launches the browser.
"""

import http.server
import socketserver
import os
import sys
sys.dont_write_bytecode = True
import argparse
import webbrowser
import threading
import time
import socket
import json
import subprocess
import base64
import shutil

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def choose_folder_dialog(initial_dir=""):
    initial_dir = os.path.normpath(initial_dir or DIRECTORY)
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        selected = filedialog.askdirectory(initialdir=initial_dir, title="Select Cedar Blog Folder")
        root.destroy()
        if selected and os.path.isdir(selected):
            return os.path.abspath(selected)
    except Exception:
        pass

    if sys.platform == 'darwin' and shutil.which('osascript'):
        try:
            osa = 'POSIX path of (choose folder with prompt "Select Cedar Blog Folder")'
            out = subprocess.check_output(['osascript', '-e', osa], text=True, timeout=60).strip()
            if out and os.path.isdir(out):
                return os.path.abspath(out)
        except Exception:
            pass

    if sys.platform != 'win32':
        if shutil.which('zenity'):
            try:
                cmd = ['zenity', '--file-selection', '--directory', f'--filename={initial_dir}/', '--title=Select Cedar Blog Folder']
                out = subprocess.check_output(cmd, text=True, timeout=60).strip()
                if out and os.path.isdir(out):
                    return os.path.abspath(out)
            except Exception:
                pass
        elif shutil.which('kdialog'):
            try:
                cmd = ['kdialog', '--getexistingdirectory', initial_dir]
                out = subprocess.check_output(cmd, text=True, timeout=60).strip()
                if out and os.path.isdir(out):
                    return os.path.abspath(out)
            except Exception:
                pass

    try:
        ps_script = (
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;"
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog;"
            f"$d.SelectedPath = '{initial_dir}';"
            "$d.Description = 'Select Cedar Blog Folder';"
            "$d.ShowNewFolderButton = $true;"
            "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"
        )
        cmd = ['powershell', '-NoProfile', '-Command', ps_script]
        out = subprocess.check_output(cmd, text=True, timeout=60).strip()
        if out and os.path.isdir(out):
            return os.path.abspath(out)
    except Exception:
        pass

    return ""

def check_is_cedar_folder(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return False
    indicators = [
        os.path.join(folder_path, 'config.json'),
        os.path.join(folder_path, 'vault.json'),
        os.path.join(folder_path, 'writer', 'drafts.json'),
        os.path.join(folder_path, 'static-writer', 'drafts.json'),
        os.path.join(folder_path, 'blog', 'published'),
        os.path.join(folder_path, 'blog', 'drafts'),
        os.path.join(folder_path, 'pages', 'published')
    ]
    for ind in indicators:
        if os.path.exists(ind):
            return True
    return False

check_is_outpost_folder = check_is_cedar_folder

def open_folder_in_os(folder_path):
    abs_path = os.path.abspath(folder_path)
    if hasattr(os, 'startfile'):
        os.startfile(abs_path)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', abs_path])
    elif shutil.which('xdg-open'):
        subprocess.Popen(['xdg-open', abs_path])
    else:
        subprocess.Popen(['explorer', abs_path])

def is_app_directory(target_path):
    if not target_path:
        return False
    try:
        return os.path.normcase(os.path.abspath(target_path)) == os.path.normcase(os.path.abspath(DIRECTORY))
    except Exception:
        return False

def find_and_open_vault(folder_name, saved_path="", do_open=True):
    folder_name = (folder_name or "").strip()
    saved_path = (saved_path or "").strip().strip('"\'')

    # 1. Try saved_path directly (must not be the Cedar app directory itself)
    if saved_path:
        norm_path = os.path.normpath(saved_path)
        if os.path.isdir(norm_path) and not is_app_directory(norm_path):
            if do_open:
                open_folder_in_os(norm_path)
            return {"success": True, "path": os.path.abspath(norm_path)}

    drive_root = (os.path.splitdrive(DIRECTORY)[0] + os.sep) if os.path.splitdrive(DIRECTORY)[0] else os.sep
    user_home = os.path.expanduser("~")
    candidates = []

    if saved_path:
        base_from_path = os.path.basename(os.path.normpath(saved_path))
        if base_from_path and not folder_name:
            folder_name = base_from_path

    if folder_name:
        candidates = [
            os.path.join(drive_root, folder_name),
            os.path.join(os.path.dirname(DIRECTORY), folder_name),
            os.path.join(drive_root, "Website", folder_name),
            os.path.join(user_home, "Documents", folder_name),
            os.path.join(user_home, "Desktop", folder_name),
            os.path.join(user_home, "Downloads", folder_name),
            os.path.join(user_home, folder_name),
        ]

    for cand in candidates:
        if os.path.isdir(cand) and not is_app_directory(cand):
            if do_open:
                open_folder_in_os(cand)
            return {"success": True, "path": os.path.abspath(cand)}

    # 2. Search near parent/drive root for folder_name (excluding the Cedar app folder itself)
    if folder_name:
        for root_dir in [os.path.dirname(DIRECTORY), os.path.join(drive_root, "Website")]:
            if os.path.isdir(root_dir):
                for root, dirs, files in os.walk(root_dir):
                    if is_app_directory(root):
                        dirs.clear()
                        continue
                    if os.path.basename(root).lower() == folder_name.lower():
                        if do_open:
                            open_folder_in_os(root)
                        return {"success": True, "path": os.path.abspath(root)}
                    if root.count(os.sep) - root_dir.count(os.sep) >= 2:
                        dirs.clear()

    return {"success": False, "error": f"Could not locate folder '{saved_path or folder_name}' on disk."}

PREVIEW_PORT = 8081
LATEST_LIVE_DATA = {
    "project": None,
    "drafts": None,
    "domain": None,
    "blogPath": None,
    "updatedAt": 0
}

def sanitize_synced_project(proj):
    if not isinstance(proj, dict):
        return proj
    design = proj.get("design")
    if isinstance(design, dict):
        blocks = design.get("homeBlocks")
        if isinstance(blocks, list):
            design["homeBlocks"] = [b for b in blocks if isinstance(b, dict) and b.get("type") != "signage"]
            layout_name = str(design.get("_layoutThemeName", "")).strip().upper()
            if "18XX" in layout_name:
                # 18XX layout has NO spotlight and NO categories_shelf
                design["homeBlocks"] = [b for b in design["homeBlocks"] if b.get("type") not in ("spotlight", "categories_shelf")]
        branding = design.get("branding")
        if isinstance(branding, dict):
            branding.pop("signage", None)

    return proj

def get_active_blog_path():
    """Returns the user's active blog directory slug (default: 'blog')."""
    path_val = LATEST_LIVE_DATA.get("blogPath")
    if path_val is not None:
        return str(path_val).strip().strip('/')

    proj = LATEST_LIVE_DATA.get("project")
    if isinstance(proj, dict) and proj.get("blogPath") is not None:
        return str(proj.get("blogPath")).strip().strip('/')

    return "blog"

def fetch_url_metadata(target_url):
    """Fetches title, subtitle/description, favicon/logo, and domain from target URL for Linktree and editor cards."""
    import urllib.request
    from urllib.parse import urlparse, urljoin, quote
    import re
    import html
    import json

    target_url = (target_url or "").strip()
    if not target_url:
        return {"success": False, "error": "Empty URL"}

    if not target_url.startswith(('http://', 'https://')):
        target_url = 'https://' + target_url

    try:
        parsed = urlparse(target_url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
    except Exception:
        domain = target_url

    clean_domain_title = domain.split('.')[0].capitalize() if '.' in domain else domain.capitalize()
    res = {
        "success": True,
        "url": target_url,
        "domain": domain,
        "title": clean_domain_title,
        "subtitle": domain,
        "icon": f"https://www.google.com/s2/favicons?domain={domain}&sz=128",
        "image": ""
    }

    # Helper for YouTube video ID extraction
    def extract_youtube_id(url_str):
        m = re.search(r'(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})', url_str)
        return m.group(1) if m else None

    # 1. Specialized handler: YouTube oEmbed + Thumbnail generator
    if 'youtube.com' in domain or 'youtu.be' in domain:
        yt_id = extract_youtube_id(target_url)
        if yt_id:
            res["image"] = f"https://img.youtube.com/vi/{yt_id}/maxresdefault.jpg"
            res["title"] = "YouTube Video"
        res["icon"] = "https://www.youtube.com/s/desktop/f746ebf3/img/favicon_144x144.png"
        try:
            oembed_url = f"https://www.youtube.com/oembed?url={quote(target_url, safe='')}&format=json"
            oembed_req = urllib.request.Request(oembed_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(oembed_req, timeout=4) as oembed_resp:
                if oembed_resp.status == 200:
                    oe_data = json.loads(oembed_resp.read().decode('utf-8'))
                    if oe_data.get('title'):
                        res["title"] = oe_data['title']
                    if oe_data.get('author_name'):
                        res["subtitle"] = oe_data['author_name']
                    if oe_data.get('thumbnail_url'):
                        res["image"] = oe_data['thumbnail_url']
                    return res
        except Exception:
            pass

        if res["image"]:
            return res

    # 2. Specialized handler: GitHub defaults
    is_github = 'github.com' in domain
    gh_parts = []
    if is_github:
        res["icon"] = "https://github.githubassets.com/favicons/favicon.png"
        try:
            gh_parts = [p for p in parsed.path.strip('/').split('/') if p]
        except Exception:
            gh_parts = []

        if len(gh_parts) >= 2:
            owner, repo = gh_parts[0], gh_parts[1]
            res["title"] = f"GitHub - {owner}/{repo}"
            res["subtitle"] = f"{owner}/{repo} repository on GitHub"
            res["image"] = f"https://opengraph.githubassets.com/1/{owner}/{repo}"
        elif len(gh_parts) == 1:
            user = gh_parts[0]
            res["title"] = f"{user} · GitHub"
            res["subtitle"] = f"Explore {user}'s profile and repositories on GitHub"
            res["image"] = f"https://github.com/{user}.png?size=400"
        else:
            res["title"] = "GitHub · Where software is built"
            res["subtitle"] = "GitHub is where developers shape the future of software."
            res["image"] = "https://images.ctfassets.net/8aevphvgewt8/4pe4eOtUJ0ARpZRE4fNekf/f52b1f9c52f059a33170229883731ed0/GH-Homepage-Universe-img.png"

    # 3. HTML Scraping for rich OpenGraph, Twitter, and Schema metadata
    try:
        req = urllib.request.Request(
            target_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        )
        with urllib.request.urlopen(req, timeout=7) as resp:
            ctype = resp.headers.get('Content-Type', '')
            if 'text/html' in ctype or 'application/xhtml+xml' in ctype or not ctype:
                # Read up to 512KB so large heads/meta tags are not truncated
                raw_chunk = resp.read(524288)
                charset = 'utf-8'
                if 'charset=' in ctype:
                    charset = ctype.split('charset=')[-1].split(';')[0].strip()
                try:
                    head_html = raw_chunk.decode(charset, errors='replace')
                except Exception:
                    head_html = raw_chunk.decode('utf-8', errors='replace')

                # A. OG Title or Twitter Title or HTML Title
                og_t = re.search(r'<meta\s+[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_t:
                    og_t = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:title["\']', head_html, re.I)
                if not og_t:
                    og_t = re.search(r'<meta\s+[^>]*name=["\'](?:twitter:title|title)["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_t:
                    og_t = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*name=["\'](?:twitter:title|title)["\']', head_html, re.I)

                title_tag = re.search(r'<title\b[^>]*>(.*?)</title>', head_html, re.I | re.S)

                if og_t and og_t.group(1).strip():
                    res["title"] = html.unescape(og_t.group(1).strip())
                elif title_tag and title_tag.group(1).strip():
                    cleaned_t = re.sub(r'\s+', ' ', title_tag.group(1)).strip()
                    res["title"] = html.unescape(cleaned_t)

                # B. Description / Subtitle
                og_desc = re.search(r'<meta\s+[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_desc:
                    og_desc = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:description["\']', head_html, re.I)
                if not og_desc:
                    og_desc = re.search(r'<meta\s+[^>]*name=["\'](?:description|twitter:description)["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_desc:
                    og_desc = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*name=["\'](?:description|twitter:description)["\']', head_html, re.I)

                if og_desc and og_desc.group(1).strip():
                    res["subtitle"] = html.unescape(og_desc.group(1).strip())
                elif is_github and res.get("subtitle") != domain:
                    pass
                else:
                    res["subtitle"] = domain

                # C. Favicon or Touch Icon
                touch_tag = re.search(r'<link\s+[^>]*rel=["\'][^"\']*apple-touch-icon[^"\']*["\'][^>]*\bhref=["\']([^"\']+)["\']', head_html, re.I)
                if not touch_tag:
                    touch_tag = re.search(r'<link\s+[^>]*\bhref=["\']([^"\']+)["\'][^>]*rel=["\'][^"\']*apple-touch-icon[^"\']*["\']', head_html, re.I)

                icon_tag = re.search(r'<link\s+[^>]*rel=["\'][^"\']*(?:shortcut\s+)?icon[^"\']*["\'][^>]*\bhref=["\']([^"\']+)["\']', head_html, re.I)
                if not icon_tag:
                    icon_tag = re.search(r'<link\s+[^>]*\bhref=["\']([^"\']+)["\'][^>]*rel=["\'][^"\']*(?:shortcut\s+)?icon[^"\']*["\']', head_html, re.I)

                best_icon = None
                if touch_tag and touch_tag.group(1).strip():
                    best_icon = touch_tag.group(1).strip()
                elif icon_tag and icon_tag.group(1).strip():
                    best_icon = icon_tag.group(1).strip()

                if best_icon:
                    res["icon"] = urljoin(target_url, best_icon)

                # D. Featured Card Image (og:image, twitter:image, image_src, itemprop)
                og_img = re.search(r'<meta\s+[^>]*property=["\']og:image(?::url|:secure_url)?["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image(?::url|:secure_url)?["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<meta\s+[^>]*name=["\'](?:twitter:image|twitter:image:src|image)["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*name=["\'](?:twitter:image|twitter:image:src|image)["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<link\s+[^>]*rel=["\']image_src["\'][^>]*href=["\']([^"\']+)["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<link\s+[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']image_src["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<meta\s+[^>]*itemprop=["\']image["\'][^>]*content=["\']([^"\']+)["\']', head_html, re.I)
                if not og_img:
                    og_img = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*itemprop=["\']image["\']', head_html, re.I)

                if og_img and og_img.group(1).strip():
                    extracted_img = html.unescape(og_img.group(1).strip())
                    res["image"] = urljoin(target_url, extracted_img)
    except Exception:
        pass

    # 4. Universal Image Fallback: Ensure EVERY card has a visual preview image
    if not res.get("image"):
        if is_github:
            if len(gh_parts) >= 2:
                res["image"] = f"https://opengraph.githubassets.com/1/{gh_parts[0]}/{gh_parts[1]}"
            elif len(gh_parts) == 1:
                res["image"] = f"https://github.com/{gh_parts[0]}.png?size=400"
            else:
                res["image"] = "https://images.ctfassets.net/8aevphvgewt8/4pe4eOtUJ0ARpZRE4fNekf/f52b1f9c52f059a33170229883731ed0/GH-Homepage-Universe-img.png"
        elif 'youtube.com' in domain or 'youtu.be' in domain:
            yt_id = extract_youtube_id(target_url)
            if yt_id:
                res["image"] = f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg"
        else:
            # WordPress mshots global web screenshot generator
            res["image"] = f"https://s0.wp.com/mshots/v1/{quote(target_url, safe='')}?w=800"

    return res

LAST_ACTIVE_VAULT = None
VAULT_IMAGE_CACHE = {}

def update_vault_image_cache(vault_path):
    global VAULT_IMAGE_CACHE
    if not vault_path or not os.path.isdir(vault_path):
        return
    img_exts = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.avif', '.bmp')
    new_cache = {}
    try:
        for root, dirs, files in os.walk(vault_path):
            for f in files:
                if f.lower().endswith(img_exts):
                    full_f = os.path.abspath(os.path.join(root, f))
                    new_cache[f.lower()] = full_f
                    rel = os.path.relpath(full_f, vault_path).replace('\\', '/').lower()
                    new_cache[rel] = full_f
        VAULT_IMAGE_CACHE = new_cache
    except Exception:
        pass

def discover_local_cedar_vault():
    drive_root = (os.path.splitdrive(DIRECTORY)[0] + os.sep) if os.path.splitdrive(DIRECTORY)[0] else os.sep
    user_home = os.path.expanduser("~")
    search_roots = [
        drive_root,
        os.path.dirname(DIRECTORY),
        os.path.join(drive_root, "Website"),
        os.path.join(user_home, "Documents"),
        os.path.join(user_home, "Desktop"),
    ]
    best_path = None
    best_mtime = -1
    seen = set()
    for root_dir in search_roots:
        if not root_dir or not os.path.isdir(root_dir):
            continue
        norm_root = os.path.normcase(os.path.abspath(root_dir))
        if norm_root in seen:
            continue
        seen.add(norm_root)
        try:
            for entry in os.listdir(root_dir):
                if entry.startswith('.') or entry.lower() in ('windows', 'program files', 'program files (x86)', 'programdata', '$recycle.bin', 'system volume information', 'ai coding'):
                    continue
                cand = os.path.join(root_dir, entry)
                if os.path.isdir(cand) and not is_app_directory(cand) and 'backup' not in entry.lower():
                    if check_is_cedar_folder(cand):
                        mtime = 0
                        for marker in ('editor/drafts.json', 'writer/drafts.json', 'config.json', 'vault.json'):
                            mp = os.path.join(cand, marker)
                            if os.path.isfile(mp):
                                try:
                                    mtime = max(mtime, os.path.getmtime(mp))
                                except Exception:
                                    pass
                        if mtime > best_mtime:
                            best_mtime = mtime
                            best_path = os.path.abspath(cand)
        except Exception:
            pass
    return best_path

def set_active_vault_path(path):
    global LAST_ACTIVE_VAULT
    if path and os.path.isdir(path) and not is_app_directory(path):
        norm = os.path.abspath(path)
        if norm != LAST_ACTIVE_VAULT:
            LAST_ACTIVE_VAULT = norm
            update_vault_image_cache(LAST_ACTIVE_VAULT)
            load_vault_data_into_live_data(force=True)

def get_active_vault_path():
    global LAST_ACTIVE_VAULT
    if LAST_ACTIVE_VAULT and os.path.isdir(LAST_ACTIVE_VAULT) and not is_app_directory(LAST_ACTIVE_VAULT):
        return LAST_ACTIVE_VAULT
    discovered = discover_local_cedar_vault()
    if discovered:
        set_active_vault_path(discovered)
        return LAST_ACTIVE_VAULT
    return None

def find_image_in_vault(req_path):
    vault_dir = get_active_vault_path()
    if not vault_dir:
        return None
    base_fn = os.path.basename(req_path).lower()
    if not base_fn:
        return None
    clean_sub = req_path.lstrip('/').replace('\\', '/').lower()
    if base_fn in VAULT_IMAGE_CACHE and os.path.isfile(VAULT_IMAGE_CACHE[base_fn]):
        return VAULT_IMAGE_CACHE[base_fn]
    if clean_sub in VAULT_IMAGE_CACHE and os.path.isfile(VAULT_IMAGE_CACHE[clean_sub]):
        return VAULT_IMAGE_CACHE[clean_sub]
    update_vault_image_cache(vault_dir)
    if base_fn in VAULT_IMAGE_CACHE and os.path.isfile(VAULT_IMAGE_CACHE[base_fn]):
        return VAULT_IMAGE_CACHE[base_fn]
    if clean_sub in VAULT_IMAGE_CACHE and os.path.isfile(VAULT_IMAGE_CACHE[clean_sub]):
        return VAULT_IMAGE_CACHE[clean_sub]
    return None

def sanitize_synced_drafts(drafts_list):
    if not isinstance(drafts_list, list):
        return drafts_list
    cleaned = []
    for d in drafts_list:
        if not isinstance(d, dict):
            continue
        did = str(d.get("id", ""))
        slug = str(d.get("slug", "")).strip().lower()
        title = str(d.get("title", "")).strip().lower()

        # Purge hallucinated test artifacts and deleted pages
        if (
            did in ("page_faq", "page_custom_faq", "page_cat_tech", "page_cat_interviews", "page_1792817789185_l3h0i0", "page_1792843130092_qn15eo", "page_test_static_1", "page_test_static_2", "page_1792812981050_lb72ka") or
            slug in ("my-brand-new-project", "faq", "alpha-static", "beta-static-newer", "maybe-i-have") or
            title in ("my brand new project", "faq", "alpha static", "beta static newer", "maybe i have") or
            (d.get("isCategoryAggregate") and slug in ("tech", "interviews")) or
            "testcategory" in did.lower() or "testcategory" in slug.lower() or "testcategory" in title.lower()
        ):
            continue

        # Auto-heal any static page slug if title is real and slug is untitled or missing
        if d.get("type") == "page" and title and title not in ("untitled page", "page", "untitled", "new page") and slug in ("untitled-page", "untitled-post", ""):
            import re
            healed = re.sub(r'[^a-z0-9]+', '-', title).strip('-')
            if healed:
                d["slug"] = healed
                slug = healed

        md_text = (d.get("markdown") or "").strip()
        prose_text = (d.get("proseHtml") or "").strip()
        html_text = (d.get("html") or "").strip()
        cover_val = (d.get("coverImage") or "").strip()
        combined_content = f"{md_text} {prose_text} {html_text} {cover_val}"
        is_empty_content = not md_text and (not prose_text or prose_text in ("<p><br></p>", "<p></p>")) and not html_text
        if is_empty_content and not cover_val:
            d["images"] = []
            d["tempImages"] = []
            d["coverImage"] = ""
            d.pop("featuredImage", None)
        elif isinstance(d.get("images"), list) and d["images"]:
            kept_images = []
            for im in d["images"]:
                if isinstance(im, dict):
                    fn = str(im.get("filename", "") or "")
                    rp = str(im.get("relativePath", "") or "")
                    src = str(im.get("src", "") or "")
                    if (fn and fn in combined_content) or (rp and rp in combined_content) or (src and src in combined_content):
                        kept_images.append(im)
                elif isinstance(im, str):
                    if im in combined_content:
                        kept_images.append(im)
            d["images"] = kept_images
        if did.startswith("post_"):
            d["type"] = "post"
        elif did.startswith("page_") or d.get("isCategoryAggregate"):
            d["type"] = "page"
        cleaned.append(d)

    # Deduplicate custom pages by slug and by title to ensure duplicates never enter live data
    deduped = []
    seen_page_slugs = set()
    seen_page_titles = set()
    for d in cleaned:
        if d.get("type") == "page" and not d.get("isCategoryAggregate"):
            s = str(d.get("slug", "")).strip().lower()
            t = str(d.get("title", "")).strip().lower()
            # If not built-in (about, links, rss, all), deduplicate by title or slug
            if s not in ("about", "links", "rss", "all") and t not in ("about", "links", "rss", "all"):
                if (s and s in seen_page_slugs) or (t and t in seen_page_titles):
                    continue
                if s: seen_page_slugs.add(s)
                if t: seen_page_titles.add(t)
        deduped.append(d)
    return deduped

def reset_live_workspace_data():
    global LAST_ACTIVE_VAULT, VAULT_IMAGE_CACHE
    LAST_ACTIVE_VAULT = None
    VAULT_IMAGE_CACHE.clear()
    LATEST_LIVE_DATA["project"] = None
    LATEST_LIVE_DATA["drafts"] = []
    LATEST_LIVE_DATA["domain"] = None
    LATEST_LIVE_DATA["blogPath"] = None
    LATEST_LIVE_DATA["updatedAt"] = time.time()

def load_vault_data_into_live_data(force=False):
    vault_dir = get_active_vault_path()
    if not vault_dir:
        return
    if force or LATEST_LIVE_DATA.get("project") is None:
        for rel in ("editor/config.json", "writer/config.json", "config.json"):
            cfg_p = os.path.join(vault_dir, rel)
            if os.path.isfile(cfg_p):
                try:
                    with open(cfg_p, "r", encoding="utf-8") as f:
                        LATEST_LIVE_DATA["project"] = json.load(f)
                    break
                except Exception:
                    pass
    if force or LATEST_LIVE_DATA.get("drafts") is None:
        best_drafts = None
        best_posts_count = -1
        for rel in ("editor/drafts.json", "writer/drafts.json", "static-writer/drafts.json"):
            d_p = os.path.join(vault_dir, rel)
            if os.path.isfile(d_p):
                try:
                    with open(d_p, "r", encoding="utf-8") as f:
                        loaded = sanitize_synced_drafts(json.load(f))
                    if isinstance(loaded, list):
                        p_count = sum(1 for item in loaded if isinstance(item, dict) and (item.get("type") == "post" or str(item.get("id", "")).startswith("post_")))
                        if p_count > best_posts_count:
                            best_posts_count = p_count
                            best_drafts = loaded
                except Exception:
                    pass
        if best_drafts is not None:
            LATEST_LIVE_DATA["drafts"] = best_drafts
    if LATEST_LIVE_DATA.get("drafts"):
        sanitize_synced_drafts(LATEST_LIVE_DATA["drafts"])
    if LATEST_LIVE_DATA.get("project") and isinstance(LATEST_LIVE_DATA["project"], dict):
        if LATEST_LIVE_DATA.get("blogPath") is None:
            LATEST_LIVE_DATA["blogPath"] = LATEST_LIVE_DATA["project"].get("blogPath", "blog")
        if LATEST_LIVE_DATA.get("domain") is None:
            LATEST_LIVE_DATA["domain"] = LATEST_LIVE_DATA["project"].get("domain", "")

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def translate_path(self, path):
        # Strip query parameters
        raw_path = path.split('?')[0]
        clean_path = raw_path.rstrip('/')
        server_port = self.server.server_address[1] if hasattr(self.server, 'server_address') else PORT

        # Dedicated preview port (e.g. 8081) directly serves preview.html as root
        if server_port == PREVIEW_PORT and (clean_path == '' or clean_path == '/index.html' or clean_path in ('/about-cedar', '/about-cedar/index.html')):
            return super().translate_path('/preview.html')

        # 0. Check if request is for a real asset/image under /preview.html/ or any nested path
        for marker in ('/images/', '/assets/', '/css/', '/js/', '/components/', '/fonts/'):
            if marker in raw_path:
                sub = raw_path[raw_path.index(marker):]
                fb = super().translate_path(sub)
                if os.path.exists(fb):
                    return fb
        base_fn = os.path.basename(clean_path)
        if '.' in base_fn:
            img_exts = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.avif', '.bmp')
            if base_fn.lower().endswith(img_exts):
                vault_fb = find_image_in_vault(raw_path)
                if vault_fb and os.path.isfile(vault_fb):
                    return vault_fb
            if '/media/' not in raw_path and base_fn.lower() not in ('icon.png', 'icon.ico', 'logo.png'):
                root_fb = super().translate_path('/' + base_fn)
                if os.path.exists(root_fb):
                    return root_fb
                img_fb = super().translate_path('/images/' + base_fn)
                if os.path.exists(img_fb):
                    return img_fb
            elif clean_path in ('/icon.png', '/icon.ico', '/logo.png'):
                root_fb = super().translate_path('/' + base_fn)
                if os.path.exists(root_fb):
                    return root_fb

        if clean_path == '/help' or clean_path == '/help/index.html':
            return super().translate_path('/index.html')

        if clean_path.startswith('/preview.html/'):
            return super().translate_path('/preview.html')


        active_path = get_active_blog_path()
        valid_slugs = set(["preview", "blog"])
        if active_path:
            valid_slugs.add(active_path)

        # 1. Clean Directory & Sub-route Routing:
        # If accessing the blog subpath directly (e.g. /blog/, /preview/ or /blog/posts/slug)
        # transparently serve preview.html without HTTP redirects or ugly .html extensions
        preview_route_prefixes = ("/posts", "/post", "/notes", "/note", "/author", "/authors", "/category", "/categories", "/pages", "/page")
        for slug in valid_slugs:
            if clean_path == f"/{slug}" or clean_path == f"/{slug}/index.html":
                return super().translate_path('/preview.html')
            for pr in preview_route_prefixes:
                if clean_path == f"/{slug}{pr}" or clean_path.startswith(f"/{slug}{pr}/"):
                    return super().translate_path('/preview.html')

        # Clean top-level blog paths if not an existing file on disk (e.g. /posts/slug, /notes, /author/name)
        for pr in preview_route_prefixes:
            if clean_path == pr or clean_path.startswith(f"{pr}/"):
                candidate = super().translate_path(raw_path)
                if not os.path.isfile(candidate):
                    return super().translate_path('/preview.html')

        # 2. Asset & Resource Routing under subpath:
        # If a request is made under /<slug>/... (e.g. /carrot/images/Lamp.png, /blog/icon.png)
        # check if it exists at DIRECTORY/<slug>/...; if not, fallback to root DIRECTORY/...
        for slug in valid_slugs:
            prefix = f"/{slug}/"
            if raw_path.startswith(prefix):
                candidate = super().translate_path(raw_path)
                if not os.path.exists(candidate):
                    subpath = raw_path[len(prefix) - 1:] # preserves leading slash, e.g. /images/Lamp.png
                    fallback = super().translate_path(subpath)
                    if os.path.exists(fallback):
                        return fallback

        
        candidate = super().translate_path(path)
        if not os.path.exists(candidate):
            # 1. Asset & Image fallback across subpaths (e.g. /preview.html/.../images/avatar.jpg or /.../logo.png)
            for marker in ('/images/', '/assets/', '/css/', '/js/', '/components/', '/fonts/'):
                if marker in raw_path:
                    sub = raw_path[raw_path.index(marker):]
                    fb = super().translate_path(sub)
                    if os.path.exists(fb):
                        return fb
            base_fn = os.path.basename(clean_path)
            if '.' in base_fn:
                img_exts = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.avif', '.bmp')
                if base_fn.lower().endswith(img_exts):
                    vault_fb = find_image_in_vault(raw_path)
                    if vault_fb and os.path.isfile(vault_fb):
                        return vault_fb
                if '/media/' not in raw_path and base_fn.lower() not in ('icon.png', 'icon.ico', 'logo.png'):
                    root_fb = super().translate_path('/' + base_fn)
                    if os.path.exists(root_fb):
                        return root_fb
                    img_fb = super().translate_path('/images/' + base_fn)
                    if os.path.exists(img_fb):
                        return img_fb
                elif clean_path in ('/icon.png', '/icon.ico', '/logo.png'):
                    root_fb = super().translate_path('/' + base_fn)
                    if os.path.exists(root_fb):
                        return root_fb

            # 2. SPA clean URL route fallback
            if '.' not in os.path.basename(clean_path):
                return super().translate_path('/preview.html')
            
        return candidate


    def do_GET(self):
        parsed_path = self.path.split('?')[0]
        if parsed_path.endswith('/api/fetch-link-meta'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            target = q.get('url', [''])[0].strip()
            res = fetch_url_metadata(target) if target else {"success": False, "error": "Missing url"}
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/vault-path'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            req_folder = q.get('folder', [''])[0]
            req_path = q.get('path', [''])[0]

            found_path = ""
            found_name = ""

            if req_path and os.path.isdir(req_path) and not is_app_directory(req_path):
                found_path = os.path.abspath(req_path)
                found_name = os.path.basename(found_path)
            elif req_folder:
                cand_res = find_and_open_vault(req_folder, req_path, do_open=False)
                if cand_res.get('success') and cand_res.get('path') and not is_app_directory(cand_res['path']):
                    found_path = cand_res['path']
                    found_name = os.path.basename(found_path)

            if not found_path:
                active_vp = get_active_vault_path()
                if active_vp and os.path.isdir(active_vp) and not is_app_directory(active_vp):
                    found_path = os.path.abspath(active_vp)
                    found_name = os.path.basename(found_path)

            if found_path and os.path.isdir(found_path):
                set_active_vault_path(found_path)

            res = {
                "path": found_path,
                "defaultPath": found_path,
                "folderName": found_name,
                "exists": bool(found_path and os.path.isdir(found_path))
            }
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/live-sync'):
            if not LATEST_LIVE_DATA.get("drafts") or not LATEST_LIVE_DATA.get("project"):
                load_vault_data_into_live_data(force=True)
            if LATEST_LIVE_DATA.get("drafts"):
                sanitize_synced_drafts(LATEST_LIVE_DATA["drafts"])
            sync_data = dict(LATEST_LIVE_DATA)
            if "project" in sync_data and sync_data["project"]:
                sync_data["project"] = sanitize_synced_project(sync_data["project"])

            resp_bytes = json.dumps(sync_data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/browse-folder'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            init_dir = q.get('initialDir', [''])[0]
            picked = choose_folder_dialog(init_dir)
            res = {
                "success": bool(picked and os.path.isdir(picked)),
                "path": picked or "",
                "name": os.path.basename(picked) if picked else "",
                "exists": bool(picked and os.path.isdir(picked)),
                "isCedar": check_is_cedar_folder(picked) if picked else False,
                "isOutpost": check_is_cedar_folder(picked) if picked else False
            }
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/check-folder'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            req_path = q.get('path', [''])[0].strip().strip('"\'')
            norm_path = os.path.abspath(req_path) if req_path else ""
            is_dir = os.path.isdir(norm_path) if norm_path else False
            res = {
                "exists": is_dir,
                "isCedar": check_is_cedar_folder(norm_path) if is_dir else False,
                "isOutpost": check_is_cedar_folder(norm_path) if is_dir else False,
                "path": norm_path if is_dir else req_path,
                "name": os.path.basename(norm_path) if is_dir else ""
            }
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/vault-read'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            folder = q.get('folder', [''])[0].strip().strip('"\'')
            file_rel = q.get('file', [''])[0].strip().lstrip('/\\')
            as_format = q.get('as', ['text'])[0].lower()

            if not folder or not file_rel:
                self.send_error(400, "Missing folder or file parameter")
                return

            if folder and os.path.isdir(folder):
                set_active_vault_path(folder)

            full_path = os.path.abspath(os.path.join(folder, file_rel))
            folder_abs = os.path.abspath(folder)
            if not full_path.lower().startswith(folder_abs.lower()):
                self.send_error(403, "Access denied")
                return

            if not os.path.isfile(full_path):
                self.send_error(404, "File not found")
                return

            try:
                if as_format == 'json':
                    with open(full_path, 'r', encoding='utf-8') as f:
                        resp_bytes = f.read().encode('utf-8')
                    content_type = 'application/json; charset=utf-8'
                elif as_format in ('binary', 'blob', 'arraybuffer'):
                    with open(full_path, 'rb') as f:
                        resp_bytes = f.read()
                    content_type = 'application/octet-stream'
                else:
                    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                        resp_bytes = f.read().encode('utf-8')
                    content_type = 'text/plain; charset=utf-8'

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                return
            except Exception as e:
                self.send_error(500, str(e))
                return

        if parsed_path.endswith('/api/vault-list'):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            folder = q.get('folder', [''])[0].strip().strip('"\'')
            subpath = q.get('subpath', [''])[0].strip().lstrip('/\\')
            if folder and os.path.isdir(folder):
                set_active_vault_path(folder)
            target_dir = os.path.abspath(os.path.join(folder, subpath)) if folder else ""
            results = []
            if target_dir and os.path.isdir(target_dir):
                for item in os.listdir(target_dir):
                    ipath = os.path.join(target_dir, item)
                    results.append({
                        "name": item,
                        "kind": "directory" if os.path.isdir(ipath) else "file"
                    })
            resp_bytes = json.dumps(results).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        super().do_GET()

    def do_POST(self):
        parsed_path = self.path.split('?')[0]
        if parsed_path.endswith('/api/nuclear-reset'):
            reset_live_workspace_data()
            resp_bytes = json.dumps({"success": True}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/fetch-link-meta'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
                target = data.get('url', '').strip() if isinstance(data, dict) else ''
            except Exception:
                target = ''
            res = fetch_url_metadata(target) if target else {"success": False, "error": "Missing url"}
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/live-sync'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
                if isinstance(data, dict):
                    if "project" in data and data["project"] is not None:
                        incoming_proj = data["project"]
                        prev_proj = LATEST_LIVE_DATA.get("project")
                        if isinstance(prev_proj, dict) and isinstance(incoming_proj, dict):
                            prev_authors = prev_proj.get("authors", [])
                            incoming_authors = incoming_proj.get("authors", [])
                            if isinstance(prev_authors, list) and isinstance(incoming_authors, list):
                                for p_auth in prev_authors:
                                    if isinstance(p_auth, dict) and p_auth.get("avatar") and p_auth.get("name"):
                                        p_name = p_auth["name"].strip().lower()
                                        for in_auth in incoming_authors:
                                            if isinstance(in_auth, dict) and in_auth.get("name") and in_auth["name"].strip().lower() == p_name:
                                                if not in_auth.get("avatar"):
                                                    in_auth["avatar"] = p_auth["avatar"]
                        incoming_proj = sanitize_synced_project(incoming_proj)
                        LATEST_LIVE_DATA["project"] = incoming_proj
                    if "drafts" in data and data["drafts"] is not None:
                        incoming_drafts = data["drafts"]
                        if isinstance(incoming_drafts, str):
                            try:
                                incoming_drafts = json.loads(incoming_drafts)
                            except Exception:
                                incoming_drafts = None
                        if isinstance(incoming_drafts, list):
                            incoming_drafts = sanitize_synced_drafts(incoming_drafts)
                            inc_posts = sum(1 for d in incoming_drafts if isinstance(d, dict) and (d.get("type") == "post" or str(d.get("id", "")).startswith("post_")))
                            prev_drafts = LATEST_LIVE_DATA.get("drafts") or []
                            prev_posts = sum(1 for d in prev_drafts if isinstance(d, dict) and (d.get("type") == "post" or str(d.get("id", "")).startswith("post_")))
                            if inc_posts > 0 or prev_posts == 0 or data.get("allowEmptyPosts"):
                                LATEST_LIVE_DATA["drafts"] = incoming_drafts
                    if "domain" in data and data["domain"] is not None:
                        LATEST_LIVE_DATA["domain"] = data["domain"]
                    if "blogPath" in data and data["blogPath"] is not None:
                        LATEST_LIVE_DATA["blogPath"] = data["blogPath"]
                    LATEST_LIVE_DATA["updatedAt"] = time.time()
            except Exception:
                pass
            resp_bytes = json.dumps({"success": True}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/open-vault-explorer'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            folder_name = data.get('folderName', '')
            saved_path = data.get('savedPath', '')
            res = find_and_open_vault(folder_name, saved_path)

            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200 if res.get('success') else 404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        if parsed_path.endswith('/api/vault-write'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
                folder_path = data.get('folderPath', '').strip().strip('"\'')
                file_path = data.get('filePath', '').strip().lstrip('/\\')
                content = data.get('content', '')
                encoding = data.get('encoding', 'utf-8')

                if not folder_path or not file_path:
                    self.send_error(400, "Missing folderPath or filePath")
                    return

                if is_app_directory(folder_path):
                    self.send_error(403, "Cannot use the Cedar application directory as a user data Vault")
                    return

                if folder_path and os.path.isdir(folder_path):
                    set_active_vault_path(folder_path)

                target_file = os.path.abspath(os.path.join(folder_path, file_path))
                folder_abs = os.path.abspath(folder_path)
                if not target_file.lower().startswith(folder_abs.lower()):
                    self.send_error(403, "Access denied")
                    return

                os.makedirs(os.path.dirname(target_file), exist_ok=True)

                if encoding == 'base64':
                    raw_bytes = base64.b64decode(content)
                    with open(target_file, 'wb') as f:
                        f.write(raw_bytes)
                else:
                    text_data = content if isinstance(content, str) else json.dumps(content, indent=2)
                    if file_path.endswith('drafts.json') and os.path.isfile(target_file) and not data.get('allowEmptyPosts'):
                        try:
                            inc_list = json.loads(text_data)
                            if isinstance(inc_list, list):
                                inc_posts = sum(1 for d in inc_list if isinstance(d, dict) and (d.get('type') == 'post' or str(d.get('id', '')).startswith('post_')))
                                if inc_posts == 0:
                                    with open(target_file, 'r', encoding='utf-8') as ef:
                                        ex_list = json.load(ef)
                                    ex_posts = sum(1 for d in ex_list if isinstance(d, dict) and (d.get('type') == 'post' or str(d.get('id', '')).startswith('post_'))) if isinstance(ex_list, list) else 0
                                    if ex_posts > 0:
                                        res = {"success": True, "path": target_file, "skippedEmptyOverwrite": True}
                                        resp_bytes = json.dumps(res).encode('utf-8')
                                        self.send_response(200)
                                        self.send_header('Content-Type', 'application/json')
                                        self.send_header('Access-Control-Allow-Origin', '*')
                                        self.send_header('Content-Length', str(len(resp_bytes)))
                                        self.end_headers()
                                        self.wfile.write(resp_bytes)
                                        return
                        except Exception:
                            pass
                    with open(target_file, 'w', encoding='utf-8') as f:
                        f.write(text_data)

                res = {"success": True, "path": target_file}
                resp_bytes = json.dumps(res).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                return
            except Exception as e:
                self.send_error(500, str(e))
                return

        if parsed_path.endswith('/api/vault-delete'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
                folder_path = data.get('folderPath', '').strip().strip('"\'')
                file_path = data.get('filePath', '').strip().lstrip('/\\')

                if not folder_path or not file_path:
                    self.send_error(400, "Missing folderPath or filePath")
                    return

                if is_app_directory(folder_path):
                    self.send_error(403, "Cannot use the Cedar application directory as a user data Vault")
                    return

                target_path = os.path.abspath(os.path.join(folder_path, file_path))
                folder_abs = os.path.abspath(folder_path)
                if not target_path.lower().startswith(folder_abs.lower()):
                    self.send_error(403, "Access denied")
                    return

                if os.path.isfile(target_path):
                    os.remove(target_path)
                elif os.path.isdir(target_path):
                    shutil.rmtree(target_path)

                res = {"success": True}
                resp_bytes = json.dumps(res).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(resp_bytes)))
                self.end_headers()
                self.wfile.write(resp_bytes)
                return
            except Exception as e:
                self.send_error(500, str(e))
                return

        if parsed_path.endswith('/api/browse-folder'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            init_dir = data.get('initialDir', '')
            picked = choose_folder_dialog(init_dir)
            res = {
                "success": bool(picked and os.path.isdir(picked)),
                "path": picked or "",
                "name": os.path.basename(picked) if picked else "",
                "exists": bool(picked and os.path.isdir(picked)),
                "isCedar": check_is_cedar_folder(picked) if picked else False,
                "isOutpost": check_is_cedar_folder(picked) if picked else False
            }
            resp_bytes = json.dumps(res).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        self.send_error(404, "Endpoint not found")

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def launch_browser(url, delay=0.5):
    time.sleep(delay)
    webbrowser.open(url)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Cedar local studio server")
    parser.add_argument('--port', type=int, default=PORT, help="Server port (default: 8080)")
    parser.add_argument('--no-browser', action='store_true', help="Don't open browser automatically")
    args = parser.parse_args()

    port = args.port
    target_url = f"http://localhost:{port}/"

    if is_port_in_use(port):
        print("=============================================================")
        print(f"  Cedar Studio is already running at:")
        print(f"  {target_url}")
        print("=============================================================")
        if not args.no_browser:
            print("  Opening studio in your browser...")
            webbrowser.open(target_url)
        sys.exit(0)

    os.chdir(DIRECTORY)

    # Multithreaded HTTP server: handles concurrent requests & multiple tabs with zero blocking
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    studio_server = http.server.ThreadingHTTPServer(("", port), NoCacheHTTPRequestHandler)
    studio_server.daemon_threads = True

    # Dedicated Live Preview Server (Port 8081)
    preview_running = False
    if not is_port_in_use(PREVIEW_PORT):
        try:
            preview_server = http.server.ThreadingHTTPServer(("", PREVIEW_PORT), NoCacheHTTPRequestHandler)
            preview_server.daemon_threads = True
            threading.Thread(target=preview_server.serve_forever, daemon=True).start()
            preview_running = True
        except Exception as e:
            preview_running = False

    print("=============================================================")
    print("  Cedar - Drop-in Blog Engine & Studio")
    print(f"  Studio URL:    {target_url}")
    if preview_running:
        print(f"  Live Site:     http://localhost:{PREVIEW_PORT}/ (dedicated preview)")
    else:
        print(f"  Live Site:     http://localhost:{port}/preview.html")
    print(f"  Directory:     {DIRECTORY}")
    print("  Engine:        Multithreaded (concurrent tabs & requests enabled)")
    print("  Press Ctrl+C to stop the server")
    print("=============================================================")

    if not args.no_browser:
        threading.Thread(target=launch_browser, args=(target_url,), daemon=True).start()

    try:
        studio_server.serve_forever()
    except KeyboardInterrupt:
        print("\nCedar server stopped.")
        sys.exit(0)
