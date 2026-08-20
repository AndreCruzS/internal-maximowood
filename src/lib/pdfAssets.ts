// PDF assets served from public/ (downloaded from the legacy Manus CDN) —
// loaded at PDF-generation time to keep the JS bundle small.
export const FONT_REGULAR_URL = "/pdf/font-regular.ttf";

export const FONT_BOLD_URL = "/pdf/font-bold.ttf";

export const LOGO_THERMO_URL = "/pdf/logo-thermo.png";

export const LOGO_MW_URL = "/pdf/logo-mw.png";

export const QR_WARRANTY_URL = "/pdf/qr-warranty.png";

/**
 * Fetch a URL and return it as a base64 data URL string.
 * Used at PDF-generation time so assets are loaded on demand.
 */
export async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch a TTF font URL and return the raw ArrayBuffer.
 * jsPDF addFileToVFS expects the base64 string of the font file.
 */
export async function fetchFontBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
