import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProfiles, updateUserRole, updateUserApproval } from "@/services/userService";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Users, Search, ShieldCheck, Calendar, UserCheck, UserX, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/auth/roles";

const ROLE_BADGE = {
  admin: "bg-primary/15 text-primary border-primary/20",
  editor: "bg-secondary/15 text-secondary border-secondary/20",
  viewer: "bg-accent/15 text-accent-foreground border-accent/20",
  inspetor: "bg-amber-100 text-amber-800 border-amber-200",
};

const ALL_ROLES = "all";
const TAB_USUARIOS = "usuarios";
const TAB_PEDIDOS = "pedidos";

function UserCard({ profile: p, isSelf, onRoleChange, onApprovalChange, rolePending, approvalPending }) {
  return (
    <Card className={`border-border/60 ${!p.approved ? "border-amber-300/60 bg-amber-50/40" : ""}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-sm truncate">{p.full_name || p.email || "(sem e-mail)"}</span>
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
              {p.full_name && p.email && (
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
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
                  onClick={() => onApprovalChange(false)}
                  disabled={approvalPending}
                >
                  <UserX className="h-3.5 w-3.5" />Revogar
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onApprovalChange(true)}
                  disabled={approvalPending}
                >
                  <UserCheck className="h-3.5 w-3.5" />Aprovar acesso
                </Button>
              )
            )}
            <Select value={p.role} onValueChange={onRoleChange} disabled={isSelf || rolePending}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
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
}

function EmptyState({ icon: Icon, text }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
        <Icon className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}

export default function UserManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, user } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  // Aba ativa na URL (?aba=pedidos), para dar para abrir direto nos pedidos.
  const tab = searchParams.get("aba") === TAB_PEDIDOS ? TAB_PEDIDOS : TAB_USUARIOS;
  const setTab = (value) => setSearchParams(value === TAB_PEDIDOS ? { aba: TAB_PEDIDOS } : {}, { replace: true });

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: listProfiles,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: ({ id, role }) => updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Perfil atualizado");
    },
    onError: () => toast.error("Não foi possível atualizar o perfil"),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, approved }) => updateUserApproval(id, approved),
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["pending-users-count"] });
      toast.success(approved ? "Acesso aprovado" : "Acesso revogado");
    },
    onError: () => toast.error("Não foi possível atualizar a aprovação"),
  });

  if (!isAdmin) {
    navigate("/");
    return null;
  }

  // Busca e filtro de perfil valem para as duas abas.
  const matches = (p) => {
    const s = search.toLowerCase();
    const matchSearch = !s
      || p.email?.toLowerCase().includes(s)
      || p.full_name?.toLowerCase().includes(s)
      || ROLE_LABEL[p.role]?.toLowerCase().includes(s);
    const matchRole = roleFilter === ALL_ROLES || p.role === roleFilter;
    return matchSearch && matchRole;
  };
  const approved = profiles.filter((p) => p.approved);
  const pending = profiles.filter((p) => !p.approved);
  const approvedFiltered = approved.filter(matches);
  const pendingFiltered = pending.filter(matches);
  const filtering = !!search || roleFilter !== ALL_ROLES;

  const renderList = (list, emptyIcon, emptyText) => {
    if (isLoading) {
      return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
    }
    if (list.length === 0) return <EmptyState icon={emptyIcon} text={emptyText} />;
    return (
      <div className="space-y-3">
        {list.map((p) => (
          <UserCard
            key={p.id}
            profile={p}
            isSelf={p.id === user?.id}
            onRoleChange={(role) => mutation.mutate({ id: p.id, role })}
            onApprovalChange={(value) => approvalMutation.mutate({ id: p.id, approved: value })}
            rolePending={mutation.isPending}
            approvalPending={approvalMutation.isPending}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pending.length > 0
            ? <>{pending.length} solicitação(ões) pendente(s) de aprovação · defina o perfil de acesso de cada usuário cadastrado.</>
            : <>Defina o perfil de acesso de cada usuário cadastrado.</>}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filtrar por perfil">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROLES}>Todos os perfis</SelectItem>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value={TAB_USUARIOS} className="flex-1 sm:flex-none gap-1.5">
            <Users className="h-3.5 w-3.5" />Usuários
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {filtering ? `${approvedFiltered.length}/${approved.length}` : approved.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value={TAB_PEDIDOS} className="flex-1 sm:flex-none gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />Pedidos de Aprovação
            {pending.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground">
                {filtering ? `${pendingFiltered.length}/${pending.length}` : pending.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={TAB_USUARIOS} className="mt-4">
          {renderList(
            approvedFiltered,
            Users,
            filtering ? "Nenhum usuário encontrado para os filtros atuais" : "Nenhum usuário aprovado",
          )}
        </TabsContent>
        <TabsContent value={TAB_PEDIDOS} className="mt-4">
          {renderList(
            pendingFiltered,
            UserCheck,
            filtering ? "Nenhum pedido encontrado para os filtros atuais" : "Nenhum pedido de aprovação pendente",
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
