"use client";

import React, { useEffect, useRef, useState } from "react";

interface CircularCropToolProps {
  src: string;
  onCropComplete: (croppedImageData: string) => void;
  onCancel: () => void;
}

export default function CircularCropTool({ src, onCropComplete, onCancel }: CircularCropToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    img.onload = () => {
      setOffsetX(0);
      setOffsetY(0);
      setScale(1);
    };
  }, [src]);

  function handleCrop() {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    const x = (size - scaledWidth) / 2 + offsetX;
    const y = (size - scaledHeight) / 2 + offsetY;

    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

    canvas.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          onCropComplete(e.target?.result as string);
        };
        reader.readAsDataURL(blob);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Logoyu Kırp (Yuvarlak)</h3>

        <div className="relative mb-4 flex justify-center">
          <div className="relative h-80 w-80 overflow-hidden rounded-full border-4 border-emerald-500 bg-slate-100">
            <img
              ref={imageRef}
              src={src}
              alt="Logo"
              className="h-full w-full object-cover"
              style={{
                transform: `scale(${scale}) translate(${offsetX}px, ${offsetY}px)`,
                transformOrigin: "center",
              }}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Zoom</label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-slate-500">{scale.toFixed(1)}x</p>
        </div>

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Sağ/Sol</label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Yukarı/Aşağı</label>
            <input
              type="range"
              min="-100"
              max="100"
              step="5"
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            İptal
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600"
          >
            Onayla ✓
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
