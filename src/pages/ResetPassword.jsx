import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSession, updatePassword, signOut } from "@/auth/authService";
import { translateAuthError } from "@/auth/authErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const [hasRecoverySession, setHasRecoverySession] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // O link de redefinição redireciona pra cá com os tokens de recuperação
    // no hash da URL; o supabase-js já lê isso ao carregar e cria a sessão.
    getSession().then((session) => {
      setHasRecoverySession(!!session);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      await signOut();
      window.location.href = `${import.meta.env.BASE_URL}login`;
    } catch (err) {
      setError(translateAuthError(err, "Não foi possível redefinir a senha. Tente novamente."));
    } finally {
      setLoading(false);
    }
  };

  if (hasRecoverySession === null) {
    return null;
  }

  if (!hasRecoverySession) {
    return (
      <AuthLayout
        title="Link de recuperação inválido"
        subtitle="Este link de redefinição de senha está ausente ou inválido"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Solicitar novo link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          O link que você usou parece estar incompleto ou expirado. Solicite um novo e-mail de redefinição de senha.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nova senha"
      subtitle="Digite sua nova senha abaixo"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Redefinindo...
            </>
          ) : (
            "Redefinir senha"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
