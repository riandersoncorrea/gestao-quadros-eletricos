import * as userRepository from "@/repositories/userRepository";
import * as unitAccessRepository from "@/repositories/unitAccessRepository";
import { uploadFile } from "@/storage/storageService";

export async function listProfiles() {
  return userRepository.list();
}

/**
 * Salva o próprio perfil (nome + foto). E-mail e função não são editáveis
 * por aqui — permanecem só leitura no perfil e sob controle de /usuarios.
 * `avatarFile` é opcional: quando ausente, mantém `currentAvatarUrl`.
 */
export async function updateOwnProfile({ fullName, avatarFile, currentAvatarUrl }) {
  let avatarUrl = currentAvatarUrl ?? null;
  if (avatarFile) {
    const { file_url } = await uploadFile({ file: avatarFile });
    avatarUrl = file_url;
  }
  return userRepository.updateOwnProfile({ full_name: fullName, avatar_url: avatarUrl });
}

export async function updateUserRole(id, role) {
  return userRepository.updateRole(id, role);
}

export async function updateUserApproval(id, approved) {
  return userRepository.updateApproval(id, approved);
}

/** Contagem de usuários pendentes de aprovação (badge do menu, admin only). */
export async function countPendingUsers() {
  return userRepository.countPending();
}

/** Acesso de todos os usuários às unidades (0029), ou null antes dela. */
export async function listUsersUnitAccess() {
  return unitAccessRepository.listAllAccess();
}

/** Unidades autorizadas de um usuário — só administrador geral (o banco garante). */
export async function updateUserUnits(profileId, unidadeIds) {
  return unitAccessRepository.setUserUnits(profileId, unidadeIds);
}

/** Acesso a todas as unidades — só administrador geral (o banco garante). */
export async function updateUserGlobalAccess(profileId, todas) {
  return unitAccessRepository.setGlobalAccess(profileId, todas);
}

/** Administradores e inspetores aprovados disponíveis para serem responsáveis por uma ação. */
export async function listAssignableUsers() {
  return userRepository.listApprovedAssignable();
}
