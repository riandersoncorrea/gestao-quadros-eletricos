import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/AuthLayout";
import { Hourglass, LogOut } from "lucide-react";

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <AuthLayout
      icon={Hourglass}
      title="Solicitação pendente"
      subtitle="Seu cadastro foi recebido e aguarda aprovação de um administrador"
    >
      <div className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          {user?.email && <>A conta <span className="font-medium text-foreground">{user.email}</span> ainda</>}
          {!user?.email && <>Sua conta ainda</>} não foi liberada para acessar o sistema. Assim que um
          administrador aprovar seu acesso, você poderá entrar normalmente.
        </p>
        <Button variant="outline" className="w-full h-12 font-medium" onClick={() => logout()}>
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </div>
    </AuthLayout>
  );
}
