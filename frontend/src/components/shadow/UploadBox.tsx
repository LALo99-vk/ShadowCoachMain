import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB = 10;

interface Props {
  onFile: (file: File | null) => void;
  file: File | null;
}

function validateClientImage(f: File): string | null {
  if (!ALLOWED_TYPES.includes(f.type)) {
    return "Only JPEG, PNG, WebP, and GIF images are allowed";
  }
  if (f.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Image must be ${MAX_SIZE_MB} MB or smaller`;
  }
  return null;
}

export function UploadBox({ onFile, file }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [hover, setHover] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const handle = (f: File | null) => {
    revokePreview();

    if (f) {
      const error = validateClientImage(f);
      if (error) {
        toast.error(error);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const url = URL.createObjectURL(f);
      previewUrlRef.current = url;
      setPreview(url);
    } else {
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    }

    onFile(f);
  };

  useEffect(() => {
    return () => revokePreview();
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    handle(f);
  };

  const changeImage = (e: MouseEvent) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  const removeImage = (e: MouseEvent) => {
    e.stopPropagation();
    handle(null);
  };

  return (
    <div className="space-y-3">
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
          <img
            src={preview}
            alt="upload preview"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />
        ) : (
          <div className="text-center px-6">
            <div className="text-lg font-bold uppercase tracking-command text-white">
              Upload Stance
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-display text-smoke">
              Sports stance photo only · JPEG, PNG, WebP, GIF · max {MAX_SIZE_MB} MB
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0] ?? null)}
        />
        {file && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-command text-smoke truncate">
            {file.name}
          </div>
        )}
      </motion.div>

      {file && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={changeImage}
            className="flex-1 border border-white py-3 text-[10px] uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
          >
            Change image
          </button>
          <button
            type="button"
            onClick={removeImage}
            className="flex-1 border border-white/30 py-3 text-[10px] uppercase tracking-command text-smoke hover:border-white hover:text-white transition-colors duration-500"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
