import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Users, Search, ShieldCheck, Calendar, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_LABEL = { admin: "Administrador", editor: "Editor", viewer: "Visualizador" };
const ROLE_BADGE = {
  admin: "bg-primary/15 text-primary border-primary/20",
  editor: "bg-secondary/15 text-secondary border-secondary/20",
  viewer: "bg-accent/15 text-accent-foreground border-accent/20",
};

export default function UserManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, user } = useUserRole();
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, approved, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, role }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Perfil atualizado");
    },
    onError: () => toast.error("Não foi possível atualizar o perfil"),
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, approved }) => {
      const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["pending-users-count"] });
      toast.success(approved ? "Acesso aprovado" : "Acesso revogado");
    },
    onError: () => toast.error("Não foi possível atualizar a aprovação"),
  });

  const pendingCount = profiles.filter((p) => !p.approved).length;

  if (!isAdmin) {
    navigate("/");
    return null;
  }

  const filtered = profiles.filter((p) => {
    const s = search.toLowerCase();
    return !s || p.email?.toLowerCase().includes(s) || ROLE_LABEL[p.role]?.toLowerCase().includes(s);
  });

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pendingCount > 0
            ? <>{pendingCount} solicitação(ões) pendente(s) de aprovação · defina o perfil de acesso de cada usuário cadastrado.</>
            : <>Defina o perfil de acesso de cada usuário cadastrado.</>}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por e-mail ou perfil..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isSelf = p.id === user?.id;
            return (
              <Card key={p.id} className={`border-border/60 ${!p.approved ? "border-amber-300/60 bg-amber-50/40" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-sm truncate">{p.email || "(sem e-mail)"}</span>
                          {isSelf && <Badge variant="outline" className="text-xs">você</Badge>}
                          <Badge variant="outline" className={`text-xs ${ROLE_BADGE[p.role] || ""}`}>
                            {ROLE_LABEL[p.role] || p.role}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${p.approved
                              ? "bg-secondary/15 text-secondary border-secondary/20"
                              : "bg-amber-100 text-amber-800 border-amber-200"}`}
                          >
                            {p.approved ? "Aprovado" : "Pendente"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Cadastrado em {format(parseISO(p.created_at), "dd/MM/yyyy")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isSelf && (
                        p.approved ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-muted-foreground hover:text-destructive"
                            onClick={() => approvalMutation.mutate({ id: p.id, approved: false })}
                            disabled={approvalMutation.isPending}
                          >
                            <UserX className="h-3.5 w-3.5" />Revogar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => approvalMutation.mutate({ id: p.id, approved: true })}
                            disabled={approvalMutation.isPending}
                          >
                            <UserCheck className="h-3.5 w-3.5" />Aprovar acesso
                          </Button>
                        )
                      )}
                      <Select
                        value={p.role}
                        onValueChange={(role) => mutation.mutate({ id: p.id, role })}
                        disabled={isSelf || mutation.isPending}
                      >
                        <SelectTrigger className="w-full sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isSelf && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Você não pode alterar o próprio perfil.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
