import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

function encodeBmp(pixels: Buffer, width: number, height: number): Buffer {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize, 0);

  // File header
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-to-top
  buf.writeUInt16LE(1, 26);  // color planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30);  // no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38); // x pixels per meter
  buf.writeInt32LE(2835, 42); // y pixels per meter

  // Pixel data: Sharp gives RGB top-to-bottom, BMP needs BGR bottom-to-top
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y; // flip vertically
    const rowOffset = 54 + bmpRow * rowSize;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = rowOffset + x * 3;
      buf[dst] = pixels[src + 2];     // B
      buf[dst + 1] = pixels[src + 1]; // G
      buf[dst + 2] = pixels[src];     // R
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

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // Scale with nearest neighbor — no color management, no interpolation
  const pixels = await sharp(inputBuffer, { failOn: "none" })
    .resize(w, h, { kernel: "nearest", fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const bmp = encodeBmp(pixels, w, h);

  return new NextResponse(bmp.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/bmp",
      "Content-Disposition": `attachment; filename="scaled_${w}x${h}.bmp"`,
    },
  });
}
