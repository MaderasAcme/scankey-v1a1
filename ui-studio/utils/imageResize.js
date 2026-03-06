/**
 * Resize image to max dimension (optimized for upload).
 * @param {string} dataUrl - data URL
 * @param {number} maxDim - max width/height
 * @returns {Promise<string>} data URL
 */
export function resizeDataUrl(dataUrl, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w <= maxDim && h <= maxDim) {
        resolve(dataUrl);
        return;
      }
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(c.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = dataUrl;
  });
}
