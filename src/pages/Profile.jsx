import React, { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { updateOwnProfile } from "@/services/userService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Lock } from "lucide-react";

const ROLE_LABEL = { admin: "Administrador", editor: "Editor", viewer: "Visualizador" };
const ROLE_BADGE = {
  admin: "bg-primary/15 text-primary border-primary/20",
  editor: "bg-secondary/15 text-secondary border-secondary/20",
  viewer: "bg-accent/15 text-accent-foreground border-accent/20",
};

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef(null);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const mutation = useMutation({
    mutationFn: () => updateOwnProfile({ fullName, avatarFile, currentAvatarUrl: user?.avatar_url }),
    onSuccess: async () => {
      await refreshUser();
      setAvatarFile(null);
      toast.success("Perfil atualizado");
    },
    onError: (err) => toast.error(`Não foi possível salvar: ${err.message}`),
  });

  if (!user) return null;

  const handlePickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const initials = (fullName || user.email || "U")[0].toUpperCase();
  const dirty = fullName !== (user.full_name || "") || !!avatarFile;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Atualize seu nome e sua foto.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Informações pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarPreview || user.avatar_url || undefined} alt={fullName || user.email} />
                <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90"
                aria-label="Alterar foto"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickAvatar} />
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Alterar foto
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1">JPG ou PNG.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              E-mail <Lock className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input id="email" value={user.email || ""} disabled />
            <p className="text-[11px] text-muted-foreground">O e-mail não pode ser alterado por aqui.</p>
          </div>

          <div className="space-y-2">
            <Label>Função</Label>
            <div>
              <Badge variant="outline" className={`text-xs ${ROLE_BADGE[user.role] || ""}`}>
                {ROLE_LABEL[user.role] || user.role}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Somente um administrador pode alterar sua função.</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
