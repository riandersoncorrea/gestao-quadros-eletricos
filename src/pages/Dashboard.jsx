import React from "react";
import { ElectricalPanel } from "@/api/entities";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import PanelCard from "@/components/panels/PanelCard";
import {
  LayoutPanelTop,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Map,
  ArrowRight,
  Activity,
  Zap
} from "lucide-react";

function StatCard({ icon: Icon, label, value, color, isLoading }) {
  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
          </div>
          <div className={`h-11 w-11 rounded-xl ${color} flex items-center justify-center`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { canEdit } = useUserRole();

  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("-created_date"),
  });

  const activeCount = panels.filter((p) => p.status === "ativo").length;
  const maintenanceCount = panels.filter((p) => p.status === "manutencao").length;
  const inactiveCount = panels.filter((p) => p.status === "inativo").length;
  const recentPanels = panels.slice(0, 6);

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            <LayoutPanelTop className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight leading-tight">
              Gestão de Quadros Elétricos
            </h1>
            <p className="text-sm font-medium text-primary/80 mt-0.5">Serviços Operacionais</p>
            <p className="text-xs text-muted-foreground mt-0.5">São Luís EFC</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <img
            src="https://media.base44.com/images/public/6a18dab566437ac7c183062d/4a7af8dfc_1644a982-6629-43f1-97c7-a158a6b1037a.jpeg"
            alt="São Luis EFC – Serviços Operacionais"
            className="h-12 w-auto object-contain rounded-md"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Link to="/mapa">
          <Button variant="outline" size="sm" className="gap-2">
            <Map className="h-4 w-4" />
            Ver Mapa
          </Button>
        </Link>
        {canEdit && (
          <Link to="/inventario/novo">
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Novo Quadro
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Zap} label="Total" value={panels.length} color="bg-primary" isLoading={isLoading} />
        <StatCard icon={CheckCircle2} label="Ativos" value={activeCount} color="bg-secondary" isLoading={isLoading} />
        <StatCard icon={AlertTriangle} label="Manutenção" value={maintenanceCount} color="bg-accent" isLoading={isLoading} />
        <StatCard icon={Activity} label="Inativos" value={inactiveCount} color="bg-muted-foreground" isLoading={isLoading} />
      </div>

      {/* Recent Panels */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Quadros Recentes</h2>
          <Link to="/quadros" className="text-sm text-primary hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-3 w-48" />
              </Card>
            ))}
          </div>
        ) : recentPanels.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum quadro cadastrado ainda</p>
            {canEdit && (
              <Link to="/inventario/novo">
                <Button size="sm" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Cadastrar primeiro quadro
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {recentPanels.map((panel) => (
              <PanelCard key={panel.id} panel={panel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}