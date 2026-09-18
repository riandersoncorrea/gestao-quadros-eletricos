import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, Loader2 } from "lucide-react";

const OUTPUT_SIZE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function extensionFor(mimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}

function withExtension(name, ext) {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base}.${ext}`;
}

/**
 * Recorta a imagem para um quadrado (sempre crop, nunca stretch) e devolve
 * um File pronto para upload. PNG de origem continua PNG (mantém
 * transparência); qualquer outro formato vira JPEG.
 */
async function cropToSquareFile(imageSrc, cropPixels, originalFile) {
  const image = await loadImage(imageSrc);
  const outputType = originalFile.type === "image/png" ? "image/png" : "image/jpeg";

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE
  );

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem recortada"))), outputType, 0.92);
  });

  return new File([blob], withExtension(originalFile.name, extensionFor(outputType)), { type: outputType });
}

/**
 * Etapa de enquadramento exibida entre "selecionar arquivo" e "enviar
 * foto": garante que o resultado seja sempre um recorte quadrado (1:1) da
 * imagem original, nunca uma versão esticada/deformada dela.
 */
export default function AvatarCropDialog({ open, imageSrc, originalFile, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || !originalFile) return;
    setSaving(true);
    try {
      const file = await cropToSquareFile(imageSrc, croppedAreaPixels, originalFile);
      onConfirm(file);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
        </DialogHeader>

        {imageSrc && (
          <div className="relative w-full h-72 sm:h-80 bg-muted rounded-lg overflow-hidden touch-none">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              restrictPosition
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
        )}

        <div className="flex items-center gap-3 px-1">
          <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([v]) => setZoom(v)} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!croppedAreaPixels || saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
