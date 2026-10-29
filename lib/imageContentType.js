/** Identify migrated binary images without trusting filenames or HTML bodies.
 * @param {Uint8Array} bytes
 * @returns {string | null}
 */
export function detectImageContentType(bytes) {
  const starts = (prefix) => prefix.every((value, index) => bytes[index] === value);
  const text = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const boxSize = bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3];
    const end = Math.min(boxSize, bytes.length, 256);
    for (let from = 8; from + 4 <= end; from += 4) {
      if (from !== 12 && ["avif", "avis"].includes(text(from, from + 4))) return "image/avif";
    }
  }
  return null;
}
