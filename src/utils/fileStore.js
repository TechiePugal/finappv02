/**
 * fileStore.js — File storage using Firestore base64 (no Firebase Storage CORS issues)
 *
 * Why not Firebase Storage?
 *   Storage requires CORS config via gsutil CLI. Without it, every upload fails.
 *   Firestore base64 storage works immediately with zero config.
 *
 * Strategy:
 *   Images → compress via canvas → store as base64 dataUrl in Firestore
 *   PDFs   → read as base64 → store in Firestore (up to 700KB safe limit)
 *   Viewing → Blob URL conversion → opens in new tab, no CORS ever
 */

const IMAGE_TYPES = new Set([
  'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/bmp',
]);

// Compress image using canvas - fast single pass
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read image'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Cannot load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), mimeType: 'image/jpeg' });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Read any file as base64 dataUrl
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read file'));
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

/**
 * Process a file for Firestore storage.
 * Returns { dataUrl, fileName, fileType, sizeKB, originalSizeKB, isImage, isTruncated }
 */
export async function processFile(file) {
  const isImage = IMAGE_TYPES.has((file.type || '').toLowerCase());
  const originalSizeKB = Math.round(file.size / 1024);

  let dataUrl, fileType;

  if (isImage) {
    const r = await compressImage(file);
    dataUrl = r.dataUrl;
    fileType = r.mimeType;
  } else {
    // PDFs/docs: Firestore doc limit 1MB, base64 adds ~33% overhead
    // Safe limit: 700KB binary = ~933KB base64
    const MAX_BYTES = 700 * 1024;
    const isTruncated = file.size > MAX_BYTES;
    const toRead = isTruncated ? file.slice(0, MAX_BYTES) : file;
    const sliceFile = isTruncated ? new File([toRead], file.name, { type: file.type }) : file;
    dataUrl = await readAsBase64(sliceFile);
    fileType = file.type || 'application/octet-stream';

    return {
      dataUrl, fileType,
      fileName: file.name,
      originalType: file.type,
      sizeKB: Math.round(dataUrl.length * 0.75 / 1024),
      originalSizeKB,
      isImage: false,
      isTruncated,
      storedAt: new Date().toISOString(),
    };
  }

  return {
    dataUrl, fileType,
    fileName: file.name,
    originalType: file.type,
    sizeKB: Math.round(dataUrl.length * 0.75 / 1024),
    originalSizeKB,
    isImage: true,
    isTruncated: false,
    storedAt: new Date().toISOString(),
  };
}

// Compat aliases
export const uploadDocumentFile = async (file) => processFile(file);
export const uploadFile = async (file) => processFile(file);
export const uploadProjectDocument = async (file) => processFile(file);

/**
 * Open a document safely in a new browser tab.
 * Converts base64 dataUrl to Blob URL so browser security policies don't block it.
 */
export function openDocument(urlOrDataUrl, fileName) {
  if (!urlOrDataUrl) { alert('No document available.'); return; }

  // Normal HTTPS URL — open directly
  if (urlOrDataUrl.startsWith('http')) {
    window.open(urlOrDataUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // Base64 dataUrl — must convert to Blob URL
  if (urlOrDataUrl.startsWith('data:')) {
    try {
      const comma = urlOrDataUrl.indexOf(',');
      const mime  = urlOrDataUrl.slice(5, urlOrDataUrl.indexOf(';'));
      const b64   = urlOrDataUrl.slice(comma + 1);
      const bin   = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const blob    = new Blob([bytes], { type: mime || 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      const tab     = window.open(blobUrl, '_blank', 'noopener,noreferrer');

      // Cleanup after 30s
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

      // If popup blocked, trigger download
      if (!tab) {
        const a = document.createElement('a');
        a.href     = blobUrl;
        a.download = fileName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }
    } catch (err) {
      console.error('openDocument:', err);
      alert('Could not open the document. It may be corrupted.');
    }
    return;
  }

  window.open(urlOrDataUrl, '_blank', 'noopener,noreferrer');
}

export function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
