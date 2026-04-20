// PDF asset CDN URLs — loaded at runtime to keep the bundle small
export const FONT_REGULAR_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/pdf_font_regular_ddba800f.ttf";

export const FONT_BOLD_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/pdf_font_bold_e0f63139.ttf";

export const LOGO_THERMO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/pdf_logo_thermo_26a77b19.png";

export const LOGO_MW_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/pdf_logo_mw_eed314f1.png";

export const QR_WARRANTY_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663323594646/BgVSczWjokZ8ShW8VRp9Kb/pdf_qr_warranty_4f583d8f.png";

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
