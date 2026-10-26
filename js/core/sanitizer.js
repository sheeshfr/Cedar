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
        const img = new Image();
        img.onload = function () {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Re-encode to clean WebP blob (wiping EXIF)
            canvas.toBlob(function (cleanBlob) {
              if (!cleanBlob) {
                // Fallback to PNG
                canvas.toBlob(function (pngBlob) {
                  finalizeImage(pngBlob, 'png');
                }, 'image/png');
                return;
              }
              finalizeImage(cleanBlob, 'webp');
            }, 'image/webp', 0.92);

            function finalizeImage(blob, ext) {
              const cleanDataUrl = canvas.toDataURL(ext === 'webp' ? 'image/webp' : 'image/png', 0.92);
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
                width: canvas.width,
                height: canvas.height,
                size: blob.size,
                mimeType: blob.type,
                sanitized: true,
                createdAt: Date.now()
              };

              // Register globally in memory
              imageRegistry.set(filename, imgObj);
              imageRegistry.set(relativePath, imgObj);

              resolve(imgObj);
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
