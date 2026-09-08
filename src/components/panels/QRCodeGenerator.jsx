import React, { useEffect, useRef } from "react";

export default function QRCodeGenerator({ value, size = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    generateQR(canvasRef.current, value, size);
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}

// Simple QR Code generator using canvas
function generateQR(canvas, text, size) {
  const ctx = canvas.getContext("2d");
  
  // Use a simple encoding approach with the QR API
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
  };
  img.onerror = () => {
    // Fallback: draw a placeholder
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#0097A7";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("QR Code", size / 2, size / 2);
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&color=0C2340&bgcolor=FFFFFF`;
}

export function getQRCodeDataUrl(value, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=0C2340&bgcolor=FFFFFF&format=png`;
}