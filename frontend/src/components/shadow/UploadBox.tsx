import { useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";

interface Props {
  onFile: (file: File | null) => void;
  file: File | null;
}

export function UploadBox({ onFile, file }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = (f: File | null) => {
    onFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    handle(f);
  };

  return (
    <motion.div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      animate={{ borderColor: hover ? "#ffffff" : "rgba(255,255,255,0.3)" }}
      className="relative aspect-[4/3] w-full border border-dashed cursor-pointer flex items-center justify-center overflow-hidden"
    >
      {preview ? (
        <img src={preview} alt="upload" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      ) : (
        <div className="text-center px-6">
          <div className="text-lg font-bold uppercase tracking-command text-white">
            Upload Stance
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-display text-smoke">
            Drop your image here or click to select
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
      {file && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-command text-smoke">
          {file.name}
        </div>
      )}
    </motion.div>
  );
}
