# Design — Lavía

Sistema actualizado el 22 de octubre de 2026 por petición expresa de una identidad distinta al proyecto Viajes. Se conserva el contenido de los salones y los recorridos de negocio. Todas las pantallas comparten el mismo sistema.

## Género y estructura

Modern-minimal, Coral adaptado a Lavía. Portal: Cover + service index, fotografía de portada amplia y panel de texto superpuesto en escritorio, apilado en móvil; categorías como índice circular, servicios en filas fotográficas. Gestión: Studio console con navegación carbón separada del lienzo, métricas compactas, listas de entidades y formularios en superficies claras. Reservas: resumen y panel operativo por pasos. Acceso: formulario a la izquierda y composición de oficio a la derecha. Administración: controles de plan y acceso por salón.

## Tema y tipografía

`tokens.css` es la fuente de verdad. Papel frío casi blanco, superficie blanca, tinta carbón, coral oscuro en foco y selección. Primarios carbón con texto claro; contextos oscuros invierten superficies. Manrope Variable 600–800 para marca y títulos; DM Sans Variable 400–600 para contenido y controles. Fuentes locales y titulares normales, sin serif ni cursiva. El cambio de identidad incluye composición, fotografías, navegación, proporciones y controles.

## Espacios y controles

Escala de 4 puntos; controles de 44 px como mínimo y 48 px táctiles. Botones redondeados, campos de radio 10 px, paneles de 16–24 px. Foco inmediato. Grillas `minmax(0,1fr)`, texto arbitrario envolvente y controles en una línea. Colores de estados acompañados de texto. Un h1 y una acción principal por pantalla. Los nombres del menú siempre accesibles.

## Contenido y estados

Los textos y fotos personalizados del salón se respetan. No inventar métricas, testimonios ni servicios; distinguir valor de servicios completados de cobros. Mantener consentimiento junto a la operación y detalles de privacidad accesibles. Los estados de acceso, carga, error y vacío utilizan el mismo sistema en gestión, portal y plataforma.

## Movimiento y responsividad

Sin animación decorativa, carruseles o nuevas dependencias de movimiento. Solo respuesta de transform/opacity; reduced-motion desactiva desplazamientos. Contraste AA y comprobaciones a 320, 375, 414, 768 y 1440 px, con diálogos, contenido largo y navegación por teclado.

## Exports

La aplicación consume `tokens.css`; las fuentes se sirven localmente.

### tokens.css
```css
:root {
  --color-paper: oklch(97.5% 0.004 250);
  --color-surface: oklch(100% 0 0);
  --color-paper-2: oklch(94% 0.005 250);
  --color-ink: oklch(22% 0.01 260);
  --color-muted: oklch(45% 0.015 260);
  --color-rule: oklch(86% 0.008 250);
  --color-control-rule: oklch(64% 0.012 250);
  --color-accent: oklch(48% 0.16 28);
  --color-accent-ink: oklch(100% 0 0);
  --color-accent-soft: oklch(95% 0.025 28);
  --color-focus: oklch(52% 0.17 28);
  --color-error: oklch(43% 0.17 25);
  --color-success: oklch(37% 0.07 158);
  --color-sage: oklch(94% 0.025 158);
  --color-clay: oklch(95% 0.03 40);
  --color-plum: oklch(95% 0.022 310);
  --color-ochre: oklch(95% 0.04 85);
  --color-backdrop: oklch(18% 0.01 260 / 0.5);
  --color-transparent: transparent;
  --color-shadow: oklch(22% 0.01 260 / 0.06);
  --color-inverse: oklch(98% 0.004 250);
  --color-inverse-muted: oklch(80% 0.01 250);
  --color-inverse-rule: oklch(40% 0.01 260);
  --color-inverse-surface: oklch(30% 0.012 260);
  --font-display: "Manrope Variable", sans-serif;
  --font-body: "DM Sans Variable", sans-serif;
  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --space-section: clamp(32px, 5vw, 64px);
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-label: 0.75rem;
  --text-display: clamp(2rem, 3.4vw, 3.5rem);
  --text-hero: clamp(2.75rem, 5.5vw, 5rem);
  --text-title: clamp(1.7rem, 2.6vw, 2.4rem);
  --text-section: clamp(1.2rem, 1.8vw, 1.6rem);
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-round: 50%;
  --radius-pill: 999px;
  --rule-thin: 1px;
  --rule-focus: 2px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --dur-short: 150ms;
}
```

### Tailwind v4 @theme
```css
@theme {
  --color-paper: oklch(97.5% 0.004 250);
  --color-surface: oklch(100% 0 0);
  --color-paper-2: oklch(94% 0.005 250);
  --color-ink: oklch(22% 0.01 260);
  --color-muted: oklch(45% 0.015 260);
  --color-rule: oklch(86% 0.008 250);
  --color-control-rule: oklch(64% 0.012 250);
  --color-accent: oklch(48% 0.16 28);
  --color-accent-ink: oklch(100% 0 0);
  --color-accent-soft: oklch(95% 0.025 28);
  --color-focus: oklch(52% 0.17 28);
  --color-error: oklch(43% 0.17 25);
  --color-success: oklch(37% 0.07 158);
  --color-sage: oklch(94% 0.025 158);
  --color-clay: oklch(95% 0.03 40);
  --color-plum: oklch(95% 0.022 310);
  --color-ochre: oklch(95% 0.04 85);
  --color-backdrop: oklch(18% 0.01 260 / 0.5);
  --color-transparent: transparent;
  --color-shadow: oklch(22% 0.01 260 / 0.06);
  --color-inverse: oklch(98% 0.004 250);
  --color-inverse-muted: oklch(80% 0.01 250);
  --color-inverse-rule: oklch(40% 0.01 260);
  --color-inverse-surface: oklch(30% 0.012 260);
  --font-display: "Manrope Variable", sans-serif;
  --font-body: "DM Sans Variable", sans-serif;
  --spacing-2xs: 2px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --spacing-3xl: 64px;
  --spacing-section: clamp(32px, 5vw, 64px);
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-label: 0.75rem;
  --text-display: clamp(2rem, 3.4vw, 3.5rem);
  --text-hero: clamp(2.75rem, 5.5vw, 5rem);
  --text-title: clamp(1.7rem, 2.6vw, 2.4rem);
  --text-section: clamp(1.2rem, 1.8vw, 1.6rem);
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-round: 50%;
  --radius-pill: 999px;
  --rule-thin: 1px;
  --rule-focus: 2px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms;
  --dur-short: 150ms;
}
```

### DTCG tokens.json
```json
{
  "color": {
    "paper": {
      "$value": "oklch(97.5% 0.004 250)",
      "$type": "color"
    },
    "surface": {
      "$value": "oklch(100% 0 0)",
      "$type": "color"
    },
    "paper-2": {
      "$value": "oklch(94% 0.005 250)",
      "$type": "color"
    },
    "ink": {
      "$value": "oklch(22% 0.01 260)",
      "$type": "color"
    },
    "muted": {
      "$value": "oklch(45% 0.015 260)",
      "$type": "color"
    },
    "rule": {
      "$value": "oklch(86% 0.008 250)",
      "$type": "color"
    },
    "control-rule": {
      "$value": "oklch(64% 0.012 250)",
      "$type": "color"
    },
    "accent": {
      "$value": "oklch(48% 0.16 28)",
      "$type": "color"
    },
    "accent-ink": {
      "$value": "oklch(100% 0 0)",
      "$type": "color"
    },
    "accent-soft": {
      "$value": "oklch(95% 0.025 28)",
      "$type": "color"
    },
    "focus": {
      "$value": "oklch(52% 0.17 28)",
      "$type": "color"
    },
    "error": {
      "$value": "oklch(43% 0.17 25)",
      "$type": "color"
    },
    "success": {
      "$value": "oklch(37% 0.07 158)",
      "$type": "color"
    },
    "sage": {
      "$value": "oklch(94% 0.025 158)",
      "$type": "color"
    },
    "clay": {
      "$value": "oklch(95% 0.03 40)",
      "$type": "color"
    },
    "plum": {
      "$value": "oklch(95% 0.022 310)",
      "$type": "color"
    },
    "ochre": {
      "$value": "oklch(95% 0.04 85)",
      "$type": "color"
    },
    "backdrop": {
      "$value": "oklch(18% 0.01 260 / 0.5)",
      "$type": "color"
    },
    "transparent": {
      "$value": "transparent",
      "$type": "color"
    },
    "shadow": {
      "$value": "oklch(22% 0.01 260 / 0.06)",
      "$type": "color"
    },
    "inverse": {
      "$value": "oklch(98% 0.004 250)",
      "$type": "color"
    },
    "inverse-muted": {
      "$value": "oklch(80% 0.01 250)",
      "$type": "color"
    },
    "inverse-rule": {
      "$value": "oklch(40% 0.01 260)",
      "$type": "color"
    },
    "inverse-surface": {
      "$value": "oklch(30% 0.012 260)",
      "$type": "color"
    }
  },
  "font": {
    "display": {
      "$value": "\"Manrope Variable\", sans-serif",
      "$type": "fontFamily"
    },
    "body": {
      "$value": "\"DM Sans Variable\", sans-serif",
      "$type": "fontFamily"
    }
  },
  "space": {
    "2xs": {
      "$value": "2px",
      "$type": "dimension"
    },
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
    "section": {
      "$value": "clamp(32px, 5vw, 64px)",
      "$type": "dimension"
    }
  },
  "text": {
    "sm": {
      "$value": "0.875rem",
      "$type": "dimension"
    },
    "base": {
      "$value": "1rem",
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
    "label": {
      "$value": "0.75rem",
      "$type": "dimension"
    },
    "display": {
      "$value": "clamp(2rem, 3.4vw, 3.5rem)",
      "$type": "dimension"
    },
    "hero": {
      "$value": "clamp(2.75rem, 5.5vw, 5rem)",
      "$type": "dimension"
    },
    "title": {
      "$value": "clamp(1.7rem, 2.6vw, 2.4rem)",
      "$type": "dimension"
    },
    "section": {
      "$value": "clamp(1.2rem, 1.8vw, 1.6rem)",
      "$type": "dimension"
    }
  },
  "radius": {
    "sm": {
      "$value": "10px",
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

Usar junto al bloque de tokens.
```css
:root {
 --background: var(--color-paper); --foreground: var(--color-ink);
 --primary: var(--color-ink); --primary-foreground: var(--color-inverse);
 --muted: var(--color-paper-2); --muted-foreground: var(--color-muted);
 --border: var(--color-rule); --input: var(--color-control-rule); --ring: var(--color-focus);
 --radius: var(--radius-sm);
}
```
