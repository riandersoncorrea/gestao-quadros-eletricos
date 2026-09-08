import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, PanelTypeLabel } from "./StatusBadge";
import { MapPin, Zap, Calendar, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function PanelCard({ panel }) {
  return (
    <Link to={`/quadro/${panel.id}`}>
      <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/60 hover:border-primary/30 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {panel.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{panel.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={panel.status} />
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </div>
          </div>

          <div className="space-y-1.5">
            {panel.location_name && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 text-primary/60" />
                <span>{panel.location_name}{panel.building ? ` • ${panel.building}` : ""}</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {panel.panel_type && (
                <span className="flex items-center gap-1">
                  <span className="font-medium"><PanelTypeLabel type={panel.panel_type} /></span>
                </span>
              )}
              {panel.voltage && <span>{panel.voltage}V</span>}
              {panel.amperage && <span>{panel.amperage}A</span>}
            </div>
            {panel.last_maintenance && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 text-secondary/60" />
                <span>Manutenção: {format(parseISO(panel.last_maintenance), "dd/MM/yyyy")}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}