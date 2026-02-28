# CardioSense Design System

## Tokens

### Colors (Dark-Only)
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `220 25% 8%` | Page background |
| `--foreground` | `210 20% 95%` | Primary text |
| `--card` | `222 22% 10%` | Card surfaces |
| `--primary` | `172 55% 42%` | Accent / CTAs |
| `--muted-foreground` | `218 12% 58%` | Secondary text |
| `--text-soft` | `218 12% 68%` | Body text |
| `--border` | `220 18% 16%` | Borders |

### Motion
| Token | Value |
|-------|-------|
| `--motion-duration-fast` | `150ms` |
| `--motion-duration-normal` | `250ms` |
| `--motion-duration-slow` | `400ms` |
| `--motion-easing-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--motion-easing-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` |

### Blur & Glow
| Token | Value |
|-------|-------|
| `--blur-glass` | `16px` |
| `--blur-subtle` | `8px` |
| `--glow-primary` | `0 0 24px hsl(172 55% 42% / 0.15)` |

## Typography
- **Display**: `--font-display` for h1, stat values
- **Body**: System stack via Tailwind defaults
- **Scale**: h1 `2xl`, h2 `xl`, h3 `lg`, body `sm/text-base`, caption `text-xs`

## 3D Zones

### Allowed
- **Dashboard header**: `AmbientHeart` — pulsing sphere behind page title
- **Empty states**: `FloatingShapes` — drifting blurred orbs behind "no items" messages

### Forbidden
- Charts and live monitoring displays
- Data tables and form inputs
- Navigation elements

## Accessibility
- `prefers-reduced-motion: reduce` → all animations disabled
- 3D components: `aria-hidden="true"`, `role="presentation"`, `pointer-events: none`
- Focus states: `focus-visible` with teal ring + glow halo on all interactive elements
- Screen readers skip all decorative 3D content

## Performance
- 3D loaded via `next/dynamic({ ssr: false })` — not in server bundle
- `three` and `@react-three/*` in separate client chunk
- `FloatingShapes` uses pure CSS (no WebGL)
- `AmbientHeart` has WebGL detection → SVG fallback
