"use client";

import { useState } from "react";
import Cropper from "react-easy-crop";

type Props = {
  image: string;
  aspect: number;
  onCropComplete: (croppedArea: any, croppedAreaPixels: any) => void;
  onApply: () => void;
  onCancel: () => void;
};

export default function ImageCropper({
  image,
  aspect,
  onCropComplete,
  onApply,
  onCancel,
}: Props) {

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">

      <div className="w-[90vw] max-w-[520px] rounded-3xl bg-white p-5 shadow-xl">

        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-black">

          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />

        </div>

        {/* Zoom slider */}

        <div className="mt-4">

          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />

        </div>

        {/* Buttons */}

        <div className="mt-4 flex justify-end gap-3">

          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            İptal
          </button>

          <button
            onClick={onApply}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Uygula
          </button>

        </div>

      </div>

    </div>
  );
}