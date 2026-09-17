import * as userRepository from "@/repositories/userRepository";
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
