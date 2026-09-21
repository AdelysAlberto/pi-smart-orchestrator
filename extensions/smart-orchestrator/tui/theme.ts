import type {ThemeColors} from "../config.validator.ts";

export const VIASERA_PALETTE: ThemeColors = {
  active: "#00E5FF", // Electric Cyan (Progreso, latencia, agente activo)
  header: "#0055FF", // Cobalt Royal (Bordes estructurales, títulos)
  action: "#FF6B00", // Volcanic Orange (Alertas, esfuerzo high, aprobación requerida)
  surface: "#0B0F17", // Asfalto Profundo (Fondo antideslumbrante)
};

/**
 * Convert hex (#RRGGBB) to ANSI 24-bit truecolor escape codes for terminal formatting.
 */
export function hexToAnsiFg(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "";
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function hexToAnsiBg(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "";
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

export const ANSI_RESET = "\x1b[0m";
export const ANSI_BOLD = "\x1b[1m";
export const ANSI_DIM = "\x1b[2m";

export function colorize(text: string, hexColor: string, bold = false): string {
  const prefix = `${hexToAnsiFg(hexColor)}${bold ? ANSI_BOLD : ""}`;
  return `${prefix}${text}${ANSI_RESET}`;
}
