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
   * Sanitizes an image file or blob on the client-side.
   * Strips all non-pixel metadata (EXIF, GPS, camera model, date/time, IPTC, XMP).
   * Re-encodes cleanly into WebP (or PNG for transparency).
   */
  async function sanitizeImage(fileOrBlob, slug = 'post-image') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const rawDataUrl = e.target.result;
        const isGif = Boolean(
          (fileOrBlob && (fileOrBlob.type === 'image/gif' || /\.gif$/i.test(fileOrBlob.name || ''))) ||
          /^data:image\/gif/i.test(String(rawDataUrl || ''))
        );
        const img = new Image();
        img.onload = function () {
          try {
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;

            // Preserve animated GIFs directly without passing through <canvas> (which would flatten animation frames)
            if (isGif) {
              const gifBlob = (fileOrBlob instanceof Blob)
                ? (fileOrBlob.type === 'image/gif' ? fileOrBlob : new Blob([fileOrBlob], { type: 'image/gif' }))
                : (typeof window.dataUrlToBlob === 'function' ? window.dataUrlToBlob(rawDataUrl) : null);
              finalizeImage(gifBlob, 'gif', rawDataUrl, natW, natH);
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
  window.Cedar.sanitizer = {
    sanitizeImage
  };
  window.Outpost.sanitizer = window.Cedar.sanitizer;
})();
