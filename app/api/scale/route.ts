import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// Decode 8-bit indexed or 24-bit BMP to raw RGB (top-to-bottom)
function decodeBmp(buf: Buffer): { pixels: Buffer; width: number; height: number } {
  const pixelDataOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bitsPerPixel = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);

  const isTopToBottom = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const out = Buffer.alloc(width * height * 3);

  if (bitsPerPixel === 8 && compression === 0) {
    // 8-bit indexed — palette at offset 54, 4 bytes per entry (BGRA)
    const palette: [number, number, number][] = [];
    for (let i = 0; i < 256; i++) {
      palette.push([buf[54 + i * 4 + 2], buf[54 + i * 4 + 1], buf[54 + i * 4]]);
    }
    const rowSize = Math.floor((width + 3) / 4) * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = isTopToBottom ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const [r, g, b] = palette[buf[pixelDataOffset + srcRow * rowSize + x]];
        const o = (y * width + x) * 3;
        out[o] = r; out[o + 1] = g; out[o + 2] = b;
      }
    }
  } else if (bitsPerPixel === 24 && compression === 0) {
    // 24-bit BGR
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = isTopToBottom ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const s = pixelDataOffset + srcRow * rowSize + x * 3;
        const o = (y * width + x) * 3;
        out[o] = buf[s + 2]; out[o + 1] = buf[s + 1]; out[o + 2] = buf[s];
      }
    }
  } else {
    throw new Error(`Desteklenmeyen BMP formatı: ${bitsPerPixel}bpp compression=${compression}`);
  }

  return { pixels: out, width, height };
}

function encodeBmp(pixels: Buffer, width: number, height: number): Buffer {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const buf = Buffer.alloc(54 + pixelDataSize, 0);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + pixelDataSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);

  // Sharp raw output: RGB top-to-bottom → BMP: BGR bottom-to-top
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y;
    const rowOffset = 54 + bmpRow * rowSize;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 3;
      const d = rowOffset + x * 3;
      buf[d] = pixels[s + 2]; buf[d + 1] = pixels[s + 1]; buf[d + 2] = pixels[s];
    }
  }

  return buf;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const w = parseInt(form.get("width") as string);
  const h = parseInt(form.get("height") as string);

  if (!file || !w || !h) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Decode BMP manually (supports 8-bit indexed and 24-bit)
  const { pixels, width: origW, height: origH } = decodeBmp(inputBuffer);

  // Scale with Sharp using nearest neighbor (no color management)
  const scaled = await sharp(pixels, { raw: { width: origW, height: origH, channels: 3 } })
    .resize(w, h, { kernel: "nearest", fit: "fill" })
    .raw()
    .toBuffer();

  const bmp = encodeBmp(scaled, w, h);

  return new NextResponse(bmp.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/bmp",
      "Content-Disposition": `attachment; filename="scaled_${w}x${h}.bmp"`,
    },
  });
}
