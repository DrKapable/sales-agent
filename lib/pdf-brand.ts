import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const OFFICIAL_LOGO_ASPECT = 614 / 260;

type DecodedLogo = {
  width: number;
  height: number;
  rgb: Buffer;
};

let cachedLogo: DecodedLogo | null = null;

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeOfficialLogoPng(png: Buffer): DecodedLogo {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Official MedMinds logo is not a valid PNG file.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error("Official MedMinds logo PNG is truncated.");

    if (type === "IHDR") {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
      interlace = png[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || !idat.length) throw new Error("Official MedMinds logo PNG has no image data.");
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`Unsupported MedMinds logo PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const expectedBytes = height * (rowBytes + 1);
  if (inflated.length < expectedBytes) throw new Error("Official MedMinds logo PNG data is incomplete.");

  const reconstructed = Buffer.alloc(height * rowBytes);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++];
    const source = inflated.subarray(sourceOffset, sourceOffset + rowBytes);
    sourceOffset += rowBytes;
    const target = reconstructed.subarray(row * rowBytes, (row + 1) * rowBytes);

    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= bytesPerPixel ? target[index - bytesPerPixel] : 0;
      const up = previous[index] || 0;
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      let predictor = 0;

      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);

      target[index] = (source[index] + predictor) & 0xff;
    }

    previous = Buffer.from(target);
  }

  if (colorType === 2) return { width, height, rgb: reconstructed };

  const rgb = Buffer.alloc(width * height * 3);
  for (let src = 0, dst = 0; src < reconstructed.length; src += 4, dst += 3) {
    const alpha = reconstructed[src + 3];
    const inverse = 255 - alpha;
    rgb[dst] = Math.round((reconstructed[src] * alpha + 255 * inverse) / 255);
    rgb[dst + 1] = Math.round((reconstructed[src + 1] * alpha + 255 * inverse) / 255);
    rgb[dst + 2] = Math.round((reconstructed[src + 2] * alpha + 255 * inverse) / 255);
  }

  return { width, height, rgb };
}

function loadOfficialLogo() {
  if (cachedLogo) return cachedLogo;
  const logoPath = join(process.cwd(), "public", "medminds-logo.png");
  cachedLogo = decodeOfficialLogoPng(readFileSync(logoPath));
  return cachedLogo;
}

export function officialLogoDrawCommand(x: number, y: number, maxWidth: number, maxHeight: number) {
  let width = maxWidth;
  let height = width / OFFICIAL_LOGO_ASPECT;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * OFFICIAL_LOGO_ASPECT;
  }
  const drawX = x + (maxWidth - width) / 2;
  const drawY = y + (maxHeight - height) / 2;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm /Im1 Do Q`;
}

export function buildPdfWithOfficialLogo(content: string) {
  const logo = loadOfficialLogo();
  const compressedLogo = deflateSync(logo.rgb, { level: 9 });
  const contentBytes = Buffer.from(content, "utf8");
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "utf8"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "utf8"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 4 0 R >>", "utf8"),
    Buffer.concat([
      Buffer.from(`<< /Length ${contentBytes.length} >>\nstream\n`, "utf8"),
      contentBytes,
      Buffer.from("\nendstream", "utf8")
    ]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "utf8"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "utf8"),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedLogo.length} >>\nstream\n`, "utf8"),
      compressedLogo,
      Buffer.from("\nendstream", "utf8")
    ])
  ];

  const header = Buffer.from("%PDF-1.4\n%MedMinds\n", "utf8");
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let position = header.length;

  for (let index = 0; index < objects.length; index += 1) {
    const prefix = Buffer.from(`${index + 1} 0 obj\n`, "utf8");
    const suffix = Buffer.from("\nendobj\n", "utf8");
    offsets.push(position);
    chunks.push(prefix, objects[index], suffix);
    position += prefix.length + objects[index].length + suffix.length;
  }

  const xrefOffset = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const objectOffset of offsets.slice(1)) xref += `${String(objectOffset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "utf8"));
  return Buffer.concat(chunks);
}
