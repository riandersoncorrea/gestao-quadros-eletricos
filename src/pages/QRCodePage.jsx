import React, { useRef } from "react";
import { ElectricalPanel } from "@/api/entities";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import QRCodeGenerator, { getQRCodeDataUrl } from "@/components/panels/QRCodeGenerator";
import { Download, Printer, QrCode, Zap } from "lucide-react";

export default function QRCodePage() {
  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("name"),
  });

  const appUrl = window.location.origin;

  const downloadQR = (panel) => {
    const url = getQRCodeDataUrl(`${appUrl}/quadro/${panel.id}`, 600);
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR_${panel.code}.png`;
    link.click();
  };

  const printAll = () => {
    const printWindow = window.open("", "_blank");
    const html = `
      <html>
        <head>
          <title>QR Codes - Quadros Elétricos</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .item { text-align: center; page-break-inside: avoid; border: 1px solid #ddd; padding: 16px; border-radius: 8px; }
            .item img { width: 150px; height: 150px; }
            .name { font-weight: bold; font-size: 14px; margin-top: 8px; }
            .code { font-size: 12px; color: #666; font-family: monospace; }
            .location { font-size: 11px; color: #999; margin-top: 4px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <h1 style="text-align:center;margin-bottom:24px;">QR Codes — Quadros Elétricos</h1>
          <div class="grid">
            ${panels.map(p => `
              <div class="item">
                <img src="${getQRCodeDataUrl(`${appUrl}/quadro/${p.id}`, 300)}" />
                <div class="name">${p.name}</div>
                <div class="code">${p.code}</div>
                ${p.location_name ? `<div class="location">${p.location_name}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <script>setTimeout(() => window.print(), 1000);</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere e imprima QR Codes para identificação dos quadros
          </p>
        </div>
        {panels.length > 0 && (
          <Button onClick={printAll} variant="outline" size="sm" className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir Todos
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-40 w-40 mx-auto mb-4" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </Card>
          ))}
        </div>
      ) : panels.length === 0 ? (
        <div className="text-center py-16">
          <QrCode className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum quadro cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {panels.map((panel) => (
            <Card key={panel.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex flex-col items-center p-6 gap-3">
                <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
                  <QRCodeGenerator value={`${appUrl}/quadro/${panel.id}`} size={140} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">{panel.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{panel.code}</p>
                  {panel.location_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{panel.location_name}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => downloadQR(panel)}>
                  <Download className="h-3 w-3" />
                  Baixar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}