import * as userRepository from "@/repositories/userRepository";

export async function listProfiles() {
  return userRepository.list();
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
