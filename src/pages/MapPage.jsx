import React, { useState } from "react";
import { ElectricalPanel } from "@/api/entities";
import { useQuery } from "@tanstack/react-query";
import PanelMapView from "@/components/panels/PanelMap";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

export default function MapPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list(),
  });

  const filtered = panels.filter((p) => {
    const matchSearch =
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.location_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mapa de Quadros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Localização de todos os quadros elétricos cadastrados
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar quadro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="manutencao">Manutenção</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="h-[500px] rounded-xl bg-muted animate-pulse flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Carregando mapa...</p>
        </div>
      ) : (
        <PanelMapView panels={filtered} height="h-[calc(100vh-220px)]" />
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-secondary" /> Ativo ({panels.filter(p => p.status === "ativo").length})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-accent" /> Manutenção ({panels.filter(p => p.status === "manutencao").length})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-muted-foreground" /> Inativo ({panels.filter(p => p.status === "inativo").length})
        </div>
      </div>
    </div>
  );
}