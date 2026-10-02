import React from "react";
import { Link } from "react-router-dom";
import { MapPin, ExternalLink } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

const Row = ({ label, value, mono }) => (
  <div className="flex gap-2 min-w-0">
    <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
    <dd className={cn("min-w-0 break-words font-medium", mono && "font-mono text-[11px]", !value && "text-muted-foreground font-normal")}>
      {value || "—"}
    </dd>
  </div>
);

/**
 * "Localização do quadro" de uma ação (dados do quadro vinculado à NC/ação,
 * ver domain/panelLocation.js). `location` null = ação sem quadro.
 * `singleColumn` para espaços estreitos (ex.: diálogo de tratamento).
 * "Ver detalhes do quadro" usa telas que já existem: a ficha completa para
 * quem acessa o Inventário e a página pública do quadro (a mesma do QR
 * Code) para o Inspetor — sem abrir novo acesso.
 */
export default function PanelLocation({ location, className, singleColumn = false }) {
  const { isInspetor } = useUserRole();
  return (
    <section className={cn("rounded-lg border border-border bg-muted/30 p-3 text-xs", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" />Localização do quadro
        </h4>
        {location && (isInspetor ? (
          <Link to={`/quadro-publico/${location.panelId}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline">
            Ver detalhes do quadro<ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <Link to={`/quadro/${location.panelId}`} className="flex items-center gap-1 text-primary hover:underline">
            Ver detalhes do quadro<ExternalLink className="h-3 w-3" />
          </Link>
        ))}
      </div>
      {!location ? (
        <p className="text-muted-foreground">Ação sem quadro vinculado.</p>
      ) : (
        <dl className={cn("grid gap-x-6 gap-y-1", !singleColumn && "sm:grid-cols-2")}>
          <Row label="Localidade" value={location.unidade} />
          <Row label="Site" value={location.site} />
          <Row label="Local (Prédio)" value={location.predio} />
          <Row label="Sublocal" value={location.sublocal} />
          <Row label="Quadro" value={location.tag} mono />
          <Row label="Local inst. SAP" value={location.sapLocal} mono />
          <Row label="Equipamento SAP" value={location.sapEquipamento} mono />
        </dl>
      )}
    </section>
  );
}
