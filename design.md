# Design — Lavía

Sistema visual compartido, aprobado el 21 de octubre de 2026. Ampliar este documento antes de introducir variantes. Preservar los textos y las fotografías publicados por cada salón.

## Género y estructura

Editorial funcional, tema Atelier existente. Gestión y administración: Workbench con cabecera compacta, una tarea y un h1 por pantalla. Portal público: Catalogue fotográfico. Reservas: formulario secuencial, resumen del servicio y controles antes que introducciones. La navegación lateral de escritorio pasa a menú desplegable con nombres en móvil. Pie discreto, sin eslóganes en las pantallas de trabajo.

## Tema y tipografía

`tokens.css` es la fuente de verdad. Papel cálido `oklch(97% 0.012 75)`, superficie `oklch(99% 0.006 75)`, tinta `oklch(29% 0.025 335)`, acento ciruela `oklch(39% 0.065 340)`. Colores funcionales de éxito/error solo para estados. Fraunces Variable, peso 450 y estilo normal para títulos; IBM Plex Sans 400/500/600 para controles y contenido. Nunca cursiva en titulares. Gestión usa escala compacta; portada pública conserva escala editorial.

## Espacios y controles

Escala de 4 puntos en tokens. Formularios y tablas con ancho limitado para lectura. Controles de al menos 44 px, 48 px para puntero táctil. Botones y enlaces de acción en una línea; los grupos se reorganizan. Nombres y contenido arbitrario pueden envolver sin recortar información. Cada pantalla tiene una acción principal y ayudas junto a su campo. Un único h1; no repetir el salón en el título si ya figura en el selector.

## Voz y estados

Títulos directos: Agenda, Servicios, Clientes, Equipo, Página de clientes, Mi salón y Salones. Las cifras solo proceden de datos reales. No confundir valor de servicios completados con cobros. No modificar contenido propio de los salones para adoptar el nuevo tono. Confirmación breve al guardar; error con acción para reintentar; carga y estados vacíos explican el siguiente paso. Consentimientos explícitos se mantienen junto a la acción correspondiente. Los detalles secundarios pueden usar disclosures accesibles.

## Movimiento y accesibilidad

Sin animación decorativa ni nuevas dependencias. Solo transform/opacity para respuesta táctil, con los easings existentes; movimiento reducido sin transiciones. Foco visible inmediato, estados seleccionados también mediante aria, labels explícitos, navegación por teclado y cierre del menú al navegar. Contraste mínimo WCAG AA. Ningún control importante depende de hover.

## Responsividad

Verificar 320, 375, 414, 768 y 1440 px, contenido largo, diálogos y zoom. Grillas con `minmax(0, 1fr)`, mínimo 0 en hijos, `overflow-x: clip` en raíces. Cabeceras se apilan, sin esconder información para disimular errores. En móvil las tarjetas de servicios usan imagen lateral y descripción debajo; selección persistente de reserva sin tapar controles. Horarios agrupados por tramo local de la sede sin quitar horas disponibles.

## Exports

Exportaciones del sistema; la aplicación consume directamente `tokens.css`. Las fuentes se sirven localmente mediante los paquetes Fontsource existentes.

### tokens.css
```css
:root {
  --color-paper: oklch(97% 0.012 75);
  --color-surface: oklch(99% 0.006 75);
  --color-paper-2: oklch(94% 0.018 65);
  --color-ink: oklch(29% 0.025 335);
  --color-muted: oklch(48% 0.025 335);
  --color-rule: oklch(86% 0.014 65);
  --color-accent: oklch(39% 0.065 340);
  --color-accent-ink: oklch(98% 0.006 75);
  --color-focus: oklch(65.42% .13 55);
  --color-error: oklch(43% 0.17 25);
  --color-success: oklch(38% 0.06 150);
  --color-sage: oklch(91% 0.032 145);
  --color-clay: oklch(92% 0.036 40);
  --color-plum: oklch(91% 0.025 335);
  --color-ochre: oklch(93% 0.05 85);
  --color-backdrop: oklch(20% 0.02 335 / 0.35);
  --color-transparent: transparent;
  --font-display: "Fraunces Variable", serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-display: clamp(2.2rem, 3vw, 3.5rem);
  --text-hero: clamp(2.75rem, 5vw, 5.25rem);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-round: 50%;
  --rule-thin: 1px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --text-title: clamp(1.75rem, 2.5vw, 2.5rem);
  --text-section: clamp(1.25rem, 1.8vw, 1.65rem);
  --text-label: 0.75rem;
  --space-2xs: 2px;
  --space-section: clamp(32px, 5vw, 64px);
  --radius-pill: 999px;
  --rule-focus: 2px;
  --dur-short: 150ms;
  --color-accent-soft: oklch(94% 0.022 340);
  --color-shadow: oklch(29% 0.025 335 / 0.08);
}
```

### Tailwind v4 @theme
```css
@theme {
  --color-paper: oklch(97% 0.012 75);
  --color-surface: oklch(99% 0.006 75);
  --color-paper-2: oklch(94% 0.018 65);
  --color-ink: oklch(29% 0.025 335);
  --color-muted: oklch(48% 0.025 335);
  --color-rule: oklch(86% 0.014 65);
  --color-accent: oklch(39% 0.065 340);
  --color-accent-ink: oklch(98% 0.006 75);
  --color-focus: oklch(65.42% .13 55);
  --color-error: oklch(43% 0.17 25);
  --color-success: oklch(38% 0.06 150);
  --color-sage: oklch(91% 0.032 145);
  --color-clay: oklch(92% 0.036 40);
  --color-plum: oklch(91% 0.025 335);
  --color-ochre: oklch(93% 0.05 85);
  --color-backdrop: oklch(20% 0.02 335 / 0.35);
  --color-transparent: transparent;
  --font-display: "Fraunces Variable", serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --spacing-3xl: 64px;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-display: clamp(2.2rem, 3vw, 3.5rem);
  --text-hero: clamp(2.75rem, 5vw, 5.25rem);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-round: 50%;
  --rule-thin: 1px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --text-title: clamp(1.75rem, 2.5vw, 2.5rem);
  --text-section: clamp(1.25rem, 1.8vw, 1.65rem);
  --text-label: 0.75rem;
  --spacing-2xs: 2px;
  --spacing-section: clamp(32px, 5vw, 64px);
  --radius-pill: 999px;
  --rule-focus: 2px;
  --dur-short: 150ms;
  --color-accent-soft: oklch(94% 0.022 340);
  --color-shadow: oklch(29% 0.025 335 / 0.08);
}
```

### DTCG tokens.json
```json
{
  "color": {
    "paper": {
      "$value": "oklch(97% 0.012 75)",
      "$type": "color"
    },
    "surface": {
      "$value": "oklch(99% 0.006 75)",
      "$type": "color"
    },
    "paper-2": {
      "$value": "oklch(94% 0.018 65)",
      "$type": "color"
    },
    "ink": {
      "$value": "oklch(29% 0.025 335)",
      "$type": "color"
    },
    "muted": {
      "$value": "oklch(48% 0.025 335)",
      "$type": "color"
    },
    "rule": {
      "$value": "oklch(86% 0.014 65)",
      "$type": "color"
    },
    "accent": {
      "$value": "oklch(39% 0.065 340)",
      "$type": "color"
    },
    "accent-ink": {
      "$value": "oklch(98% 0.006 75)",
      "$type": "color"
    },
    "focus": {
      "$value": "oklch(65.42% .13 55)",
      "$type": "color"
    },
    "error": {
      "$value": "oklch(43% 0.17 25)",
      "$type": "color"
    },
    "success": {
      "$value": "oklch(38% 0.06 150)",
      "$type": "color"
    },
    "sage": {
      "$value": "oklch(91% 0.032 145)",
      "$type": "color"
    },
    "clay": {
      "$value": "oklch(92% 0.036 40)",
      "$type": "color"
    },
    "plum": {
      "$value": "oklch(91% 0.025 335)",
      "$type": "color"
    },
    "ochre": {
      "$value": "oklch(93% 0.05 85)",
      "$type": "color"
    },
    "backdrop": {
      "$value": "oklch(20% 0.02 335 / 0.35)",
      "$type": "color"
    },
    "transparent": {
      "$value": "transparent",
      "$type": "color"
    },
    "accent-soft": {
      "$value": "oklch(94% 0.022 340)",
      "$type": "color"
    },
    "shadow": {
      "$value": "oklch(29% 0.025 335 / 0.08)",
      "$type": "color"
    }
  },
  "font": {
    "display": {
      "$value": "\"Fraunces Variable\", serif",
      "$type": "fontFamily"
    },
    "body": {
      "$value": "\"IBM Plex Sans\", sans-serif",
      "$type": "fontFamily"
    }
  },
  "space": {
    "xs": {
      "$value": "4px",
      "$type": "dimension"
    },
    "sm": {
      "$value": "8px",
      "$type": "dimension"
    },
    "md": {
      "$value": "16px",
      "$type": "dimension"
    },
    "lg": {
      "$value": "24px",
      "$type": "dimension"
    },
    "xl": {
      "$value": "32px",
      "$type": "dimension"
    },
    "2xl": {
      "$value": "48px",
      "$type": "dimension"
    },
    "3xl": {
      "$value": "64px",
      "$type": "dimension"
    },
    "2xs": {
      "$value": "2px",
      "$type": "dimension"
    },
    "section": {
      "$value": "clamp(32px, 5vw, 64px)",
      "$type": "dimension"
    }
  },
  "text": {
    "sm": {
      "$value": "0.8125rem",
      "$type": "dimension"
    },
    "base": {
      "$value": "0.9375rem",
      "$type": "dimension"
    },
    "lg": {
      "$value": "1.125rem",
      "$type": "dimension"
    },
    "xl": {
      "$value": "1.5rem",
      "$type": "dimension"
    },
    "display": {
      "$value": "clamp(2.2rem, 3vw, 3.5rem)",
      "$type": "dimension"
    },
    "hero": {
      "$value": "clamp(2.75rem, 5vw, 5.25rem)",
      "$type": "dimension"
    },
    "title": {
      "$value": "clamp(1.75rem, 2.5vw, 2.5rem)",
      "$type": "dimension"
    },
    "section": {
      "$value": "clamp(1.25rem, 1.8vw, 1.65rem)",
      "$type": "dimension"
    },
    "label": {
      "$value": "0.75rem",
      "$type": "dimension"
    }
  },
  "radius": {
    "sm": {
      "$value": "4px",
      "$type": "dimension"
    },
    "md": {
      "$value": "8px",
      "$type": "dimension"
    },
    "lg": {
      "$value": "16px",
      "$type": "dimension"
    },
    "round": {
      "$value": "50%",
      "$type": "dimension"
    },
    "pill": {
      "$value": "999px",
      "$type": "dimension"
    }
  },
  "rule": {
    "thin": {
      "$value": "1px",
      "$type": "dimension"
    },
    "focus": {
      "$value": "2px",
      "$type": "dimension"
    }
  },
  "ease": {
    "out": {
      "$value": [
        0.16,
        1.0,
        0.3,
        1.0
      ],
      "$type": "cubicBezier"
    },
    "in": {
      "$value": [
        0.7,
        0.0,
        0.84,
        0.0
      ],
      "$type": "cubicBezier"
    },
    "in-out": {
      "$value": [
        0.65,
        0.0,
        0.35,
        1.0
      ],
      "$type": "cubicBezier"
    }
  },
  "dur": {
    "fast": {
      "$value": "120ms",
      "$type": "duration"
    },
    "short": {
      "$value": "150ms",
      "$type": "duration"
    }
  }
}
```

### shadcn/ui CSS variables

Usar junto al bloque `:root` anterior.
```css
:root {
  --background: var(--color-paper); --foreground: var(--color-ink);
  --primary: var(--color-accent); --primary-foreground: var(--color-accent-ink);
  --muted: var(--color-paper-2); --muted-foreground: var(--color-muted);
  --border: var(--color-rule); --input: var(--color-rule); --ring: var(--color-focus);
  --radius: var(--radius-sm);
}
```
