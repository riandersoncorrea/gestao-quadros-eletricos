// Supabase Auth só retorna mensagens em inglês (error.message). Mapeamos as
// mais comuns para PT-BR; o que não reconhecemos cai num texto genérico em
// vez de vazar inglês pra tela.
const KNOWN_MESSAGES = [
  ["Invalid login credentials", "E-mail ou senha inválidos."],
  ["Email not confirmed", "E-mail ainda não confirmado."],
  ["User already registered", "Este e-mail já está cadastrado."],
  ["Password should be at least", "A senha é muito curta."],
  ["Unable to validate email address", "E-mail em formato inválido."],
  ["For security purposes", "Por segurança, aguarde um instante antes de tentar novamente."],
  ["Email rate limit exceeded", "Muitas tentativas. Aguarde um instante e tente novamente."],
];

export function translateAuthError(error, fallback = "Não foi possível concluir a operação. Tente novamente.") {
  const msg = error?.message;
  if (!msg) return fallback;
  const match = KNOWN_MESSAGES.find(([en]) => msg.includes(en));
  return match ? match[1] : fallback;
}
