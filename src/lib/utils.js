import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Absolute base of the app, honoring the deploy subpath (GitHub Pages serves
// under /<repo>/, Netlify under /). No trailing slash — callers append "/path".
export const appUrl = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
