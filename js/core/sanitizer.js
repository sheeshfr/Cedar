/**
 * Cedar - Client-Side Image Sanitizer & Registry
 */
(function () {
  'use strict';

  window.Cedar = window.Cedar || window.Outpost || {};
  window.Outpost = window.Cedar;

  // =========================================================================
  // CLIENT-SIDE IMAGE SANITIZER & REGISTRY
  // =========================================================================
  
  /**
   * Detects whether a dataURL or File/Blob is an animated image (GIF, animated WebP, or APNG)
   * by checking MIME type, filename extension, and binary magic bytes.
   */
  function detectAnimatedImageFromDataUrl(rawDataUrl, fileOrBlob) {
    const str = typeof rawDataUrl === 'string' ? rawDataUrl.trim() : '';
    const mime = (fileOrBlob && fileOrBlob.type) ? String(fileOrBlob.type).toLowerCase() : '';
    const name = (fileOrBlob && fileOrBlob.name) ? String(fileOrBlob.name).toLowerCase() : '';

    // 1. Check explicit GIF MIME / extension / data URL prefix
    if (mime === 'image/gif' || /\.gif(\?|#|$)/i.test(name) || /^data:image\/gif/i.test(str) || /\.gif(\?|#|$)/i.test(str)) {
      return { animated: true, ext: 'gif', mime: 'image/gif' };
    }
    if (mime === 'image/apng' || /\.apng(\?|#|$)/i.test(name) || /^data:image\/apng/i.test(str)) {
      return { animated: true, ext: 'png', mime: 'image/png' };
    }

    // 2. Inspect binary header bytes from base64 payload
    if (str.startsWith('data:')) {
      const commaIdx = str.indexOf(',');
      if (commaIdx !== -1) {
        const b64Head = str.slice(commaIdx + 1, commaIdx + 512).replace(/\s/g, '');
        // "GIF87a" / "GIF89a" in base64 always starts with "R0lGOD"
        if (b64Head.startsWith('R0lGOD')) {
          return { animated: true, ext: 'gif', mime: 'image/gif' };
        }
        try {
          const safeLen = Math.floor(b64Head.length / 4) * 4;
          if (safeLen >= 24) {
            const bin = atob(b64Head.slice(0, safeLen));
            // GIF magic bytes: "GIF8"
            if (bin.slice(0, 4) === 'GIF8') {
              return { animated: true, ext: 'gif', mime: 'image/gif' };
            }
            // WebP magic bytes: "RIFF" .... "WEBP"
            if (bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WEBP') {
              const chunk = bin.slice(12, 16);
              if ((chunk === 'VP8X' && bin.length > 20 && (bin.charCodeAt(20) & 0x02) !== 0) || bin.includes('ANIM') || bin.includes('ANMF')) {
                return { animated: true, ext: 'webp', mime: 'image/webp' };
              }
            }
            // APNG: PNG signature + "acTL" animation control chunk
            if (bin.charCodeAt(0) === 0x89 && bin.slice(1, 4) === 'PNG' && bin.includes('acTL')) {
              return { animated: true, ext: 'png', mime: 'image/png' };
            }
          }
        } catch (e) {}
      }
    }

    return { animated: false, ext: '', mime: '' };
  }

  /**
   * Sanitizes an image file or blob on the client-side.
   * Strips all non-pixel metadata (EXIF, GPS, camera model, date/time, IPTC, XMP).
   * Re-encodes cleanly into WebP (or PNG for transparency).
   */
  async function sanitizeImage(fileOrBlob, slug = 'post-image') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        let rawDataUrl = e.target.result;
        const animInfo = detectAnimatedImageFromDataUrl(rawDataUrl, fileOrBlob);
        if (animInfo.animated && typeof rawDataUrl === 'string' && rawDataUrl.startsWith('data:') && animInfo.mime) {
          rawDataUrl = rawDataUrl.replace(/^data:[^;,]+/i, `data:${animInfo.mime}`);
        }
        const img = new Image();
        img.onload = function () {
          try {
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;

            // Preserve animated images (GIF, animated WebP, APNG) directly without passing through <canvas>
            if (animInfo.animated) {
              const animBlob = (fileOrBlob instanceof Blob)
                ? (fileOrBlob.type === animInfo.mime ? fileOrBlob : new Blob([fileOrBlob], { type: animInfo.mime }))
                : (typeof window.dataUrlToBlob === 'function' ? window.dataUrlToBlob(rawDataUrl) : null);
              finalizeImage(animBlob, animInfo.ext, rawDataUrl, natW, natH);
              return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = natW;
            canvas.height = natH;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Re-encode to clean WebP blob (wiping EXIF)
            canvas.toBlob(function (cleanBlob) {
              if (!cleanBlob) {
                // Fallback to PNG
                canvas.toBlob(function (pngBlob) {
                  finalizeImage(pngBlob, 'png', canvas.toDataURL('image/png'), canvas.width, canvas.height);
                }, 'image/png');
                return;
              }
              finalizeImage(cleanBlob, 'webp', canvas.toDataURL('image/webp', 0.92), canvas.width, canvas.height);
            }, 'image/webp', 0.92);

            function finalizeImage(blob, ext, cleanDataUrl, width, height) {
              const slugFn = (typeof generateSlug === 'function' ? generateSlug : (typeof window.generateSlug === 'function' ? window.generateSlug : (s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))));
              const cleanSlug = slug ? slugFn(slug) : 'image';
              const randSuffix = Math.random().toString(36).substr(2, 5);
              const filename = `${cleanSlug}-${Date.now().toString(36)}-${randSuffix}.${ext}`;
              const relativePath = `/blog/images/${filename}`;

              const imgObj = {
                filename: filename,
                relativePath: relativePath,
                blob: blob,
                dataUrl: cleanDataUrl,
                width: width,
                height: height,
                size: blob ? blob.size : 0,
                mimeType: (blob && blob.type) || (ext === 'gif' ? 'image/gif' : (ext === 'webp' ? 'image/webp' : 'image/png')),
                sanitized: true,
                createdAt: Date.now()
              };

              // Register globally in memory
              if (typeof imageRegistry !== 'undefined' && imageRegistry) {
                imageRegistry.set(filename, imgObj);
                imageRegistry.set(relativePath, imgObj);
                imageRegistry.set(`blog/images/${filename}`, imgObj);
              }

              // Persist blob in High-Capacity Virtual Storage (OPFS / IndexedDB)
              const vStorage = (typeof window !== 'undefined') && (window.CedarVirtualStorage || window.OutpostVirtualStorage);
              if (vStorage && typeof vStorage.writeBlob === 'function' && blob) {
                Promise.all([
                  vStorage.writeBlob(`blog/images/${filename}`, blob).catch(() => {}),
                  vStorage.writeBlob(`media/${filename}`, blob).catch(() => {})
                ]).finally(() => {
                  resolve(imgObj);
                });
              } else {
                resolve(imgObj);
              }
            }
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBlob);
    });
  }



  window.sanitizeImage = sanitizeImage;
  window.detectAnimatedImageFromDataUrl = detectAnimatedImageFromDataUrl;
  window.Cedar.sanitizer = {
    sanitizeImage,
    detectAnimatedImageFromDataUrl
  };
  window.Outpost.sanitizer = window.Cedar.sanitizer;
})();
