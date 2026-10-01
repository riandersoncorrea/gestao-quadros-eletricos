import { useAuth } from "@/lib/AuthContext";

export function useUserRole() {
  const { user } = useAuth();
  const role = user?.role || "viewer";
  const canEdit = role === "admin" || role === "editor";

  return {
    role,
    isAdmin: role === "admin",
    isEditor: role === "editor" || role === "admin",
    isViewer: role === "viewer",
    isInspetor: role === "inspetor",
    canEdit,
    canDelete: role === "admin",
    // Tratar ações corretivas (Nota, OM, fotos, conclusão). O Inspetor
    // pode tratar, mas não edita NCs nem cria/exclui ações (canEdit).
    canTreatActions: canEdit || role === "inspetor",
    user,
  };
}
