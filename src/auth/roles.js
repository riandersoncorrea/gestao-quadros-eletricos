// Perfis de usuário (valor gravado em profiles.role) e seus rótulos.
// A autorização de fato está no banco (RLS via current_role()); aqui ficam
// só as definições compartilhadas pela interface (rotas, menu, gestão de
// usuários).

export const ROLE_LABEL = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
  inspetor: "Inspetor",
};

/** Perfis com acesso às páginas gerais do sistema (todos, exceto o Inspetor). */
export const GENERAL_ROLES = ["admin", "editor", "viewer"];

/**
 * Página para onde o perfil é levado quando abre uma rota que não pode
 * acessar. O Inspetor só acessa Não Conformidades e Ações; os demais
 * perfis mantêm o destino de sempre (Mapa).
 */
export function homePathForRole(role) {
  return role === "inspetor" ? "/nao-conformidades" : "/mapa";
}
