import { useAuth } from "@/lib/AuthContext";

export function useUserRole() {
  const { user } = useAuth();
  const role = user?.role || "viewer";

  return {
    role,
    isAdmin: role === "admin",
    isEditor: role === "editor" || role === "admin",
    isViewer: role === "viewer",
    canEdit: role === "admin" || role === "editor",
    canDelete: role === "admin",
    user,
  };
}