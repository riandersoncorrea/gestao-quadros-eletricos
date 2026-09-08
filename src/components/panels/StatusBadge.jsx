import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  ativo: { label: "Ativo", className: "bg-secondary/15 text-secondary border-secondary/20" },
  inativo: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
  manutencao: { label: "Manutenção", className: "bg-accent/20 text-accent-foreground border-accent/30" },
};

const TYPE_CONFIG = {
  distribuicao: "Distribuição",
  comando: "Comando",
  medicao: "Medição",
  transferencia: "Transferência",
  geral: "Geral",
};

const PHASE_CONFIG = {
  monofasico: "Monofásico",
  bifasico: "Bifásico",
  trifasico: "Trifásico",
};

export function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ativo;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}

export function PanelTypeLabel({ type }) {
  return TYPE_CONFIG[type] || type || "—";
}

export function PhaseLabel({ phase }) {
  return PHASE_CONFIG[phase] || phase || "—";
}