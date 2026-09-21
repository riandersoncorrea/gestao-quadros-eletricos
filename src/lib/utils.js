import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Absolute base of the app, honoring the deploy subpath (GitHub Pages, the
// only production deploy, serves under /<repo>/; local dev/preview under /).
// No trailing slash — callers append "/path".
export const appUrl = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");

// URL pública (sem login) de um quadro — o que o QR Code físico deve
// codificar. Rota separada de /quadro/:id (autenticada, dados completos);
// ver src/pages/PublicPanelDetail.jsx e a view panel_public_info
// (supabase/migrations/0010_public_panel_view.sql).
export const panelPublicUrl = (panelId) => `${appUrl}/quadro-publico/${panelId}`;
