import React, { useState } from "react";
import { Building2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Unidades autorizadas de um usuário (tela Usuários). Edição só para o
 * administrador geral — o banco garante o mesmo (RLS de profile_unidades e
 * trigger em profiles, migration 0029). Ninguém altera o próprio acesso.
 *
 * `access`: { todas, unidadeIds } · `units`: unidades operacionais.
 */
export default function UserUnitAccess({ profile, access, units, canEdit, isSelf, onSaveUnits, onSaveGlobal, pending }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(access?.unidadeIds || []);
  const [todas, setTodas] = useState(!!access?.todas);
  const nome = (id) => units.find((u) => u.id === id)?.nome || "?";
  const semUnidade = profile.approved && !access?.todas && !(access?.unidadeIds || []).length;

  const reset = (o) => {
    setOpen(o);
    if (o) {
      setSelected(access?.unidadeIds || []);
      setTodas(!!access?.todas);
    }
  };
  const save = async () => {
    if (todas !== !!access?.todas) await onSaveGlobal(todas);
    await onSaveUnits(selected);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" data-testid="user-unit-access">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      {access?.todas ? (
        <Badge variant="outline" className="text-xs">Todas as unidades</Badge>
      ) : (access?.unidadeIds || []).map((id) => (
        <Badge key={id} variant="outline" className="text-xs">{nome(id)}</Badge>
      ))}
      {semUnidade && (
        <span className="flex items-center gap-1 text-[11px] text-amber-700">
          <AlertTriangle className="h-3 w-3" />sem unidade: não verá dados
        </span>
      )}
      {canEdit && !isSelf && (
        <Popover open={open} onOpenChange={reset}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={pending}>Unidades…</Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3" align="start">
            <p className="text-xs font-semibold">Unidades autorizadas</p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={todas} onCheckedChange={(v) => setTodas(!!v)} />
              Todas as unidades{profile.role === "admin" ? " (administrador geral)" : ""}
            </label>
            <div className="space-y-2 border-t pt-2">
              {units.map((u) => (
                <label key={u.id} className={`flex items-center gap-2 text-sm ${todas ? "opacity-50" : ""}`}>
                  <Checkbox
                    checked={todas || selected.includes(u.id)}
                    disabled={todas}
                    onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, u.id] : prev.filter((x) => x !== u.id)))}
                  />
                  {u.nome}{u.permite_escrita === false ? " · somente leitura" : ""}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={save} disabled={pending}>Salvar</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
