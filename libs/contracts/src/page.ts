export const PAGE_DEFAULTS = {
  display_name: "",
  hero_title: "Tu tiempo.\nTu manera\nde cuidarte.",
  hero_description: "Un cambio de look. Un pequeño ritual. O simplemente, un rato para ti. Encuentra tu próximo cuidado y elige cuándo venir.",
  hero_caption: "El cuidado está en los detalles.",
  hero_button: "Encuentra tu momento",
  categories_title: "¿Por dónde empezamos?",
  categories_description: "Encuentra lo que te hace sentir bien.",
  catalog_title: "¿Qué te apetece hoy?",
  catalog_description: "El cuidado que buscas, con su tiempo y su precio.",
  visit_title: "Nos vemos\nen el salón.",
  visit_description: "Elige tu cuidado con calma. En el siguiente paso podrás consultar los horarios y el profesional disponible para tu visita.",
  footer_text: "Lavía · Reservas con calma.",
  show_reference_photos: true,
  hero_asset_id: null as string | null,
  visit_asset_id: null as string | null,
};
export type PageSettings = typeof PAGE_DEFAULTS;
export interface SiteCategory {
  id: string;
  name: string;
  description: string;
  fallback_image: string;
  featured: boolean;
  photo_asset_id: string | null;
}
export const DEFAULT_SITE_CATEGORIES: SiteCategory[] = [
  { id: "hair", name: "Peluquería", description: "Cortes, color y cuidado capilar", fallback_image: "hair", featured: true, photo_asset_id: null },
  { id: "nails", name: "Manicura", description: "Manos, pies y pequeños detalles", fallback_image: "nails", featured: true, photo_asset_id: null },
  { id: "barber", name: "Barbería", description: "Corte, barba y afeitado", fallback_image: "barber", featured: true, photo_asset_id: null },
  { id: "spa", name: "Spa y facial", description: "Una pausa para tu piel", fallback_image: "spa", featured: true, photo_asset_id: null },
  { id: "massage", name: "Masajes", description: "Baja el ritmo, suelta la tensión", fallback_image: "massage", featured: true, photo_asset_id: null },
  { id: "beauty", name: "Cejas y belleza", description: "El cuidado de los pequeños detalles", fallback_image: "spa", featured: false, photo_asset_id: null },
  { id: "other", name: "Otros cuidados", description: "Más momentos para ti", fallback_image: "salon", featured: false, photo_asset_id: null },
];
