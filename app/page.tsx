"use client";

import { useState, useRef, useCallback } from "react";

type Mode = "pixel" | "knot";

export default function Home() {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("knot");
  const [targetW, setTargetW] = useState("960");
  const [targetH, setTargetH] = useState("1400");
  const [widthCm, setWidthCm] = useState("300");
  const [heightCm, setHeightCm] = useState("400");
  const [tarak, setTarak] = useState("32");
  const [atki, setAtki] = useState("70");
  const [resultSize, setResultSize] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);

  const loadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setOriginalFile(file);
      setOriginalImage(img);
      setResultSize(null);
      setStatus("");

      const canvas = originalCanvasRef.current;
      if (!canvas) return;
      const maxSize = 400;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const rc = resultCanvasRef.current;
      if (rc) { rc.width = 0; rc.height = 0; }

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
  }, [loadImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const calcTargetSize = (): { w: number; h: number } | null => {
    if (mode === "pixel") {
      const w = parseInt(targetW);
      const h = parseInt(targetH);
      if (!w || !h) return null;
      return { w, h };
    } else {
      const wCm = parseFloat(widthCm);
      const hCm = parseFloat(heightCm);
      const t = parseFloat(tarak);
      const a = parseFloat(atki);
      if (!wCm || !hCm || !t || !a) return null;
      return { w: Math.round(wCm * t / 10), h: Math.round(hCm * a / 10) };
    }
  };

  const scale = () => {
    if (!originalImage) { setStatus("Önce bir dosya yükleyin."); return; }
    const size = calcTargetSize();
    if (!size) { setStatus("Geçersiz değerler."); return; }

    const offscreen = document.createElement("canvas");
    offscreen.width = size.w;
    offscreen.height = size.h;
    const ctx = offscreen.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(originalImage, 0, 0, size.w, size.h);

    setResultSize(size);

    const rc = resultCanvasRef.current;
    if (!rc) return;
    const maxSize = 400;
    const s = Math.min(maxSize / size.w, maxSize / size.h, 1);
    rc.width = Math.round(size.w * s);
    rc.height = Math.round(size.h * s);
    const rctx = rc.getContext("2d")!;
    rctx.imageSmoothingEnabled = false;
    rctx.drawImage(offscreen, 0, 0, rc.width, rc.height);

    setStatus("");
  };

  const renderScaled = (): HTMLCanvasElement | null => {
    if (!originalImage || !resultSize) return null;
    const { w, h } = resultSize;
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(originalImage, 0, 0, w, h);
    return offscreen;
  };

  const saveBmp = () => {
    const canvas = renderScaled();
    if (!canvas || !resultSize) return;
    const { w, h } = resultSize;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, w, h);
    const { data } = imageData;

    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const pixelDataSize = rowSize * h;
    const fileSize = 54 + pixelDataSize;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // File header
    view.setUint8(0, 0x42); view.setUint8(1, 0x4d); // "BM"
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, 54, true);

    // DIB header
    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, h, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(30, 0, true);
    view.setUint32(34, pixelDataSize, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    view.setUint32(46, 0, true);
    view.setUint32(50, 0, true);

    // Pixel data (bottom-to-top, BGR)
    for (let y = h - 1; y >= 0; y--) {
      const rowOffset = 54 + (h - 1 - y) * rowSize;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        view.setUint8(rowOffset + x * 3, data[idx + 2]);     // B
        view.setUint8(rowOffset + x * 3 + 1, data[idx + 1]); // G
        view.setUint8(rowOffset + x * 3 + 2, data[idx]);     // R
      }
    }

    const blob = new Blob([buffer], { type: "image/bmp" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scaled_${w}x${h}.bmp`;
    a.click();
  };

  const savePng = () => {
    const canvas = renderScaled();
    if (!canvas || !resultSize) return;
    const { w, h } = resultSize;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `scaled_${w}x${h}.png`;
      a.click();
    }, "image/png");
  };

  const targetSize = calcTargetSize();

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center tracking-tight">
        Halı Deseni — Ebat Değiştirme
      </h1>

      {/* Dosya yükleme */}
      <div
        className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center mb-6 cursor-pointer hover:border-blue-500 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".bmp,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
        {originalFile ? (
          <p className="text-green-400 font-medium">
            {originalFile.name} — {originalImage?.width}×{originalImage?.height} px
          </p>
        ) : (
          <p className="text-gray-400">BMP / PNG / JPG dosyasını buraya sürükle veya tıkla</p>
        )}
      </div>

      {/* Mod seçimi */}
      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <div className="flex gap-6 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === "knot"} onChange={() => setMode("knot")} className="accent-blue-500" />
            <span>Atkı / Tarak</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === "pixel"} onChange={() => setMode("pixel")} className="accent-blue-500" />
            <span>Piksel</span>
          </label>
        </div>

        {mode === "knot" ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Genişlik (cm)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Yükseklik (cm)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Tarak (düğüm/10cm)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={tarak} onChange={(e) => setTarak(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Atkı (düğüm/10cm)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={atki} onChange={(e) => setAtki(e.target.value)} />
            </div>
            {targetSize && (
              <div className="col-span-2 text-sm text-blue-400 font-medium">
                → Çıktı: {targetSize.w} × {targetSize.h} px
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Genişlik (px)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={targetW} onChange={(e) => setTargetW(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Yükseklik (px)</label>
              <input className="w-full bg-gray-800 rounded px-3 py-2" value={targetH} onChange={(e) => setTargetH(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Ölçeklendir */}
      <button
        onClick={scale}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl mb-6 transition-colors"
      >
        ÖLÇEKLENDİR
      </button>

      {status && <p className="text-yellow-400 text-sm mb-4 text-center">{status}</p>}

      {/* Önizleme */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">
            Orijinal {originalImage ? `${originalImage.width}×${originalImage.height} px` : ""}
          </p>
          <canvas ref={originalCanvasRef} className="max-w-full rounded" style={{ imageRendering: "pixelated" }} />
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">
            Sonuç {resultSize ? `${resultSize.w}×${resultSize.h} px` : ""}
          </p>
          <canvas ref={resultCanvasRef} className="max-w-full rounded" style={{ imageRendering: "pixelated" }} />
        </div>
      </div>

      {/* Kaydet */}
      {resultSize && (
        <div className="flex gap-4">
          <button
            onClick={saveBmp}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-colors"
          >
            BMP Kaydet ({resultSize.w}×{resultSize.h} px)
          </button>
          <button
            onClick={savePng}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors"
          >
            PNG Kaydet
          </button>
        </div>
      )}
    </main>
  );
}
