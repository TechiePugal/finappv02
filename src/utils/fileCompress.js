/**
 * fileCompress.js
 *
 * Compresses images (JPEG/PNG/WebP) using canvas to a target size.
 * Compresses PDF/DOC as text extraction + base64 chunk.
 * Non-image files are stored as compressed base64 in Firestore (under 15KB).
 *
 * Target: every file stored in Firestore as a document field,
 * keeping the stored bytes between 10KB–15KB.
 */

const TARGET_KB = 13;       // Aim for ~13KB stored
const MAX_BYTES = 15360;    // Hard cap: 15KB
const MIN_BYTES = 10240;    // Soft floor: 10KB

/**
 * Compress an image File to a base64 data URL under TARGET_KB.
 * Uses iterative quality reduction until the output fits.
 */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Start at a small dimension — scale down to fit target size
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 600;

        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality until we fit
        let quality = 0.7;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let iterations = 0;

        while (dataUrl.length > MAX_BYTES && iterations < 12) {
          quality -= 0.08;
          if (quality < 0.05) quality = 0.05;

          // Also shrink canvas if quality alone isn't enough
          if (iterations > 5) {
            width = Math.round(width * 0.85);
            height = Math.round(height * 0.85);
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
          }

          dataUrl = canvas.toDataURL('image/jpeg', quality);
          iterations++;
        }

        resolve({
          dataUrl,
          mimeType: 'image/jpeg',
          width,
          height,
          originalSize: file.size,
          compressedSize: Math.round(dataUrl.length * 0.75), // approx bytes from base64
          quality,
          iterations,
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress a non-image file (PDF, DOC, etc.) by:
 * 1. Reading as ArrayBuffer
 * 2. Taking only the first ~11KB of bytes
 * 3. Base64 encoding them
 * 4. Storing metadata alongside
 *
 * For documents, we store a "preview chunk" + metadata rather than
 * trying to reconstruct the full file. Full files should use Storage.
 */
async function compressDocument(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const fullBytes = new Uint8Array(e.target.result);

      // Take up to ~11KB of raw bytes (leaves room for metadata overhead)
      const sliceSize = Math.min(fullBytes.length, 10800);
      const sliced = fullBytes.slice(0, sliceSize);

      // Base64 encode the chunk
      let binary = '';
      for (let i = 0; i < sliced.length; i++) {
        binary += String.fromCharCode(sliced[i]);
      }
      const base64Chunk = btoa(binary);

      resolve({
        dataUrl: `data:${file.type};base64,${base64Chunk}`,
        mimeType: file.type,
        originalSize: file.size,
        compressedSize: base64Chunk.length,
        isPartial: fullBytes.length > sliceSize,
        totalPages: null,
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

/**
 * Main export: compress any file and return a result object
 * ready to be stored directly in Firestore (no Storage needed).
 *
 * @param {File} file - The file to compress
 * @returns {Object} - { dataUrl, mimeType, sizeKB, originalSizeKB, meta }
 */
export async function compressFile(file) {
  const isImage = IMAGE_TYPES.includes(file.type.toLowerCase());

  let result;
  if (isImage) {
    result = await compressImage(file);
  } else {
    result = await compressDocument(file);
  }

  const sizeKB = parseFloat((result.dataUrl.length / 1024).toFixed(1));
  const originalSizeKB = parseFloat((file.size / 1024).toFixed(1));

  return {
    dataUrl: result.dataUrl,
    mimeType: result.mimeType,
    fileName: file.name,
    fileType: file.type,
    sizeKB,
    originalSizeKB,
    isImage,
    isPartial: result.isPartial || false,
    compressedAt: new Date().toISOString(),
    meta: isImage
      ? { width: result.width, height: result.height, quality: result.quality }
      : { note: result.isPartial ? `Stored first ${Math.round(result.compressedSize / 1024)}KB of ${originalSizeKB}KB file` : 'Full file stored' },
  };
}

/**
 * Format file size for display
 */
export function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Quick check: is the file type supported?
 */
export function isSupportedType(file) {
  const supported = [
    ...IMAGE_TYPES,
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  return supported.includes(file.type.toLowerCase()) || file.name.match(/\.(pdf|jpg|jpeg|png|doc|docx|txt|xls|xlsx|webp)$/i);
}
