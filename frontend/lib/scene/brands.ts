// Sponsors shown on the boundary cushion and the stand's LED ribbon. These are
// plain-text wordmarks (no logos), alternating Indian and Pakistani brands.
// To use different or fictional sponsors, edit this list — nothing else changes.

export interface Brand {
  name: string;
  bg: string; // panel colour
  fg: string; // lettering
  stripe?: string; // thin accent band along the bottom of the panel
  italic?: boolean;
  lower?: boolean; // keep the brand's own casing instead of upper-casing it
}

export const BRANDS: Brand[] = [
  { name: "TATA", bg: "#1c3f94", fg: "#ffffff", stripe: "#7fb2ff" },
  { name: "Jazz", bg: "#111111", fg: "#ff2a2a", stripe: "#ffd400", lower: true, italic: true },
  { name: "Jio", bg: "#0a2885", fg: "#ffffff", stripe: "#e2231a", lower: true },
  { name: "HBL", bg: "#00816d", fg: "#ffffff", stripe: "#00b398" },
  { name: "Amul", bg: "#ffffff", fg: "#e4002b", stripe: "#e4002b", lower: true, italic: true },
  { name: "PSO", bg: "#006b3f", fg: "#ffd200", stripe: "#ffd200" },
  { name: "airtel", bg: "#e40000", fg: "#ffffff", lower: true },
  { name: "K&N's", bg: "#ffd100", fg: "#d6001c", stripe: "#d6001c", lower: true },
  { name: "MRF", bg: "#d71920", fg: "#ffffff", stripe: "#111111" },
  { name: "Shan", bg: "#b5121b", fg: "#ffe14d", lower: true, italic: true },
  { name: "Mahindra", bg: "#ffffff", fg: "#e31837", stripe: "#e31837", lower: true },
  { name: "PIA", bg: "#0b6b45", fg: "#ffffff", stripe: "#c9a227" },
  { name: "Dream11", bg: "#c8102e", fg: "#ffffff", lower: true },
  { name: "Easypaisa", bg: "#2bb24c", fg: "#ffffff", lower: true },
  { name: "Paytm", bg: "#002e6e", fg: "#00baf2", lower: true },
  { name: "Engro", bg: "#0057a8", fg: "#ffffff", stripe: "#7ac143", lower: true },
];

export const brandText = (b: Brand) => (b.lower ? b.name : b.name.toUpperCase());
