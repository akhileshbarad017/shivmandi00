# Website Theme & Color Palette Reference

Ye document **Vijay Pandey & Company (Mandi ERP)** website ke theme, colors, typography aur design system ka complete reference hai.

---

## 1. Theme Overview

* **Theme Style:** Modern Aurora Glassmorphism (Frosted Glass UI)
* **Mode:** Light Mode (Dark mode intentionally disabled)
* **Visual Effects:**
  * Multi-layer Aurora radial gradient background
  * Backdrop blur / Frosted glass panels (`backdrop-filter: blur(18px) saturate(160%)`)
  * Smooth pill borders and translucent cards

---

## 2. Color Palette & Hex Codes

### Brand Blue Colors (Primary)
| Variable / Token | Hex Code | Preview / Role |
| :--- | :--- | :--- |
| `--color-brand-50` | `#eef6ff` | Lightest tint / background tint |
| `--color-brand-100` | `#d9ecff` | Subtly tinted container |
| `--color-brand-200` | `#b6d9ff` | Light border / accent |
| `--color-brand-300` | `#84c0ff` | Focus rings / borders |
| `--color-brand-400` | `#4aa3ff` | Vibrant sky blue |
| `--color-brand-500` | `#1f86f7` | **Primary Brand Color** (Buttons, active icons) |
| `--color-brand-600` | `#0b6ad6` | **Hover & Active states** |
| `--color-brand-700` | `#0a55ab` | Deep active blue |
| `--color-brand-800` | `#0d4888` | Dark blue tone |
| `--color-brand-900` | `#103c70` | Darkest brand navy |

### Background & Aurora Glow
| Variable | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--bg-1` | `#eef3fb` | Main background start (Ice blue) |
| `--bg-2` | `#dce8fa` | Main background end (Soft blue) |
| `--blob-1` | `#4aa3ff` | Radial glow 1 (Sky blue at 12% -12%) |
| `--blob-2` | `#22d3ee` | Radial glow 2 (Cyan at 108% 6%) |
| `--blob-3` | `#6366f1` | Radial glow 3 (Indigo at 50% 120%) |

### Glass & Surfaces
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `--surface` | `rgba(255, 255, 255, 0.62)` | Glass card background (62% opacity) |
| `--surface-strong` | `rgba(255, 255, 255, 0.84)` | Bottom nav & modal sheets (84% opacity) |
| `--surface-solid` | `#ffffff` | Pure white surface |
| `--border` | `rgba(13, 72, 136, 0.14)` | Card & divider border |
| `--border-strong` | `rgba(13, 72, 136, 0.24)` | High-emphasis border |

### Text Colors
| Variable | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--text` | `#0b1b33` | Primary body and heading text (Midnight Navy) |
| `--muted` | `#4f6076` | Secondary labels, captions, subtitles (Slate Gray) |

### Status & Feedback Colors
| Token | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--color-ok` | `#16a34a` | Success / Payment completed / Online |
| `--color-warn` | `#f59e0b` | Warning / Pending status / Alert |
| `--color-danger` | `#ef4444` | Danger / Error / Outstanding balance / Delete |
| `--color-cyan` | `#22d3ee` | Cyan highlight & gradient accent |

---

## 3. Typography & Fonts

* **Primary Font (`--font-sans`):** `'JetBrains Mono', ui-monospace, monospace`
* **Display Font (`--font-display`):** `'JetBrains Mono', ui-monospace, monospace`
* **Alternative Fonts Available:** `Inter` (Sans), `Space Grotesk` (Geometric Display)

---

## 4. Ready-to-Copy CSS Variables

```css
:root {
  /* Brand */
  --brand: #1f86f7;
  --brand-strong: #0b6ad6;

  /* Background */
  --bg-1: #eef3fb;
  --bg-2: #dce8fa;
  --blob-1: #4aa3ff;
  --blob-2: #22d3ee;
  --blob-3: #6366f1;

  /* Surfaces & Borders */
  --surface: rgba(255, 255, 255, 0.62);
  --surface-strong: rgba(255, 255, 255, 0.84);
  --surface-solid: #ffffff;
  --border: rgba(13, 72, 136, 0.14);
  --border-strong: rgba(13, 72, 136, 0.24);

  /* Text */
  --text: #0b1b33;
  --muted: #4f6076;

  /* Status */
  --ok: #16a34a;
  --warn: #f59e0b;
  --danger: #ef4444;
  --cyan: #22d3ee;
}
```
