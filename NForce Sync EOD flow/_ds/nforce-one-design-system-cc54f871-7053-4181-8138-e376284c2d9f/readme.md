# Nforce One — Design System

A brand & content design system for **Nforce One** (NF1), used to produce professional **LinkedIn and other social-media posts**. Nforce One is a software **testing / QA & AI-automation** company; its content mixes technical thought-leadership (test automation, AI red-teaming, MCP servers, browser automation, agentic dev tools) with lighter culture/meme posts and community/CSR campaigns.

- **Brand mark:** "NF1" — white bold italic **NF** with a red gradient **1** trailed by speed/motion lines.
- **Tagline:** *Let's Do **IT**!* (the "IT" is red — a play on Information Technology).
- **Web:** www.nforceone.com

## Sources provided
- `uploads/Untitled design.png` — brand logo on black (cropped into `assets/logo-on-black.png` and a transparent `assets/logo.png`).
- Seven reference social posts (also mounted read-only under `nforce-linkedin-references/`):
  - `1778064274170.jpg` — "Red Teaming in AI and Impact Testing" (dark landscape article card)
  - `1780583310712.jpg` — "Happy Father's Day" (square, red field + script)
  - `1780600830688.jpg` — "Playwright MCP Server" (square dark infographic)
  - `1781150477383.jpg` — "2026 Back-A-Thon" event flier (Blood Warriors Foundation co-brand)
  - `1783366391405.jpg` — "MEMEWHILE" Titanic meme (portrait)
  - `1783511645776.jpg` — "Browser Use" (light landscape, strikethrough edit motif)
  - `1784123552734.jpg` — "OpenHands" infographic (dark, connector-bracket layout)
- No brand font files were provided — see **Fonts** caveat below.

---

## CONTENT FUNDAMENTALS

**Voice.** Confident, punchy, action-oriented — the tagline "Let's Do IT!" sets the tone. Copy is declarative and short. Headlines are the message; body is one or two supporting lines, never a paragraph.

**Casing.** Big headlines are frequently **ALL-CAPS** for impact ("RED TEAMING IN AI AND IMPACT TESTING", "FATHER'S DAY"). Product/tech names keep their real casing ("Playwright MCP Server", "OpenHands", "Browser Use"). Small labels/eyebrows are ALL-CAPS, wide-tracked ("MEMEWHILE").

**Person.** Mostly second/third person and imperative — talks *to* the audience or *about* a concept. Warm first-person-plural for community posts ("who became **our** first mentors").

**Accent-word emphasis.** The signature copy move: colour **one or two key words red** inside an otherwise white/dark sentence ("It's describing the **outcome**", "the **next generation** can move forward **free from Thalassemia**"). Use sparingly — 1–2 red words per line.

**Edit / correction motif.** Playful strikethrough to reframe ("The ~~future~~ **present** of test automation") with a hand-drawn red scribble/underline.

**Contrast framing.** "X vs Y" and before/after set-ups ("Breaking the system" vs "Understanding the consequences").

**Emoji.** Used *sparingly* and only in casual/meme or list contexts (👇 🙌 🤌 🎭). Never in formal thought-leadership headlines. Not part of the core brand voice — prefer red-accent words over emoji for emphasis.

**Meme register.** A distinct playful sub-brand ("MEMEWHILE" banner) using Impact-style captions on stock/film stills — engineering-culture humour. Kept visually separate from thought-leadership via the banner.

**Sign-off.** Posts routinely close with the URL `www.nforceone.com`, bottom-centre or in a bordered pill bottom-right.

---

## VISUAL FOUNDATIONS

**Colour.** Three-colour system: **black** (near-black canvas `#0A0A0B`), **brand red** (`#E01F26`, gradient down to maroon `#6E0A10`), and **white**. Grays carry body/subtext. A warm **cream** (`#F5EFEA`) is used for text over red fields; a soft **salmon** for script accents on red. A **meme yellow** highlights meme captions. Max 1–2 background treatments per post.

**Backgrounds.** Three canvases: (1) **dark** near-black, often with a subtle red radial glow, red wireframe/network graphics, or a desaturated tech photo; (2) **flat red field** (radial crimson→maroon) for emotional/community posts; (3) **light/white** for clean technical statements. Full-bleed photography appears behind dark scrims. A faint flowing line-texture (thin concentric strokes) recurs as a corner decoration.

**Type.** Geometric sans (Montserrat family) for headlines and UI, heavy uppercase for impact; a monospace (JetBrains Mono) for code and technical accents ("Browser Use", `browser.use()`); an elegant **script** (Great Vibes) for decorative words ("Happy"); Impact-style heavy display (Anton) for memes/posters.

**Spacing & layout.** Generous edge padding (`--post-pad` 56px). Headlines pinned left or centred. Infographics use **bracket/elbow connector lines** from a central word out to labelled icons. Footer info organised in 2–3 vertical columns separated by thin dividers. The logo sits top-left (or top-right on fliers) at a consistent small size.

**Borders & dividers.** Thin 1px dividers in `--border-dark` (dark) or `--border-light`. The URL sign-off sometimes sits in a **1px red-bordered rectangle** (not rounded much — `--radius-sm`). Connector lines are hairline gray.

**Corner radii.** Mostly square/low radius — the brand is angular (the logo is all sharp italic slabs). Chips/pills use `--radius-pill`; cards `--radius-md`; the QR and image insets `--radius-sm`.

**Shadows & glow.** Subtle. White elements over dark can carry a soft white glow (`--glow-white`); red CTAs a red glow (`--glow-red`). Photo cards use a soft dark shadow. No heavy neumorphism.

**Gradients.** Signature diagonal red gradient (`--grad-red`, bright→maroon, echoing the logo "1"); radial red field for emotional posts; dark radial glow behind hero words. Avoid blue/purple gradients entirely.

**Imagery vibe.** Cool, high-contrast, desaturated-with-red-tint tech photography (robotic hands, circuitry, wireframes); warm silhouettes on red for community posts. Often a red rim-light or red graphic overlay ties photos to the palette.

**Transparency / blur.** Dark scrims (`--scrim-bottom`) protect text over photos. Occasional low-opacity logo watermark. Minimal glassmorphism.

**Motion** (for any animated/web use). Quick and confident: short fades and slide-ups on `--ease-out` (~220ms). Accent words can "ignite" red. No bounce, no playful spring — energetic but professional.

**Hover / press** (UI contexts). Hover: red darkens (`--color-brand-hover`) or white lightens; press: slightly darker + 1px nudge, no big scale. Links use brand red, hover darker.

---

## ICONOGRAPHY

Nforce posts use **line icons** with a consistent thin/medium stroke, usually **white on dark**, drawn inside plain shapes or connected by hairline bracket lines (see OpenHands / MCP infographics: brain, workflow nodes, browser window, terminal, Docker, GitHub, LLM). Third-party product/tech **brand logos** appear as-is (VS Code, GitHub, Docker, Windsurf, Cursor, Playwright). Occasional **emoji glyphs** stand in as icons in casual posts (🎭 🙌 👇). Simple UI glyphs (search, calendar, walking figure) are line-style.

**In this system:** we use the **Lucide** icon set via CDN as the closest match to Nforce's thin-line style (SUBSTITUTION — the originals are bespoke/mixed-source line icons; flag if exact glyphs are needed). Brand/product logos are not bundled — drop them in per-post. Emoji are allowed only in casual/meme templates. Never hand-draw a bespoke brand logo.

---

## Fonts — SUBSTITUTION (needs your input)

No original brand font files were provided, so the system uses **Google Fonts stand-ins** chosen to match the references:
- **Montserrat** → headlines, UI, body (the geometric bold sans in "OpenHands", "Playwright MCP Server").
- **Anton** → heavy Impact-style meme/poster display.
- **Great Vibes** → decorative script ("Happy").
- **JetBrains Mono** → code / technical mono ("Browser Use", `browser.use()`).

**Please confirm the real brand fonts (or supply the files)** so these can be swapped in.

---

## Index / Manifest

- `styles.css` — root entry; `@import`s all token files. Consumers link this one file.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`.
- `assets/` — `logo.png` (transparent), `logo-on-black.png`, `samples/` (reference posts as sample imagery).
- `components/core/` — reusable post primitives: **PostFrame, Logo, Eyebrow, Highlight, CTA, Tag, Footer, IconFeature**.
- `ui_kits/social-posts/` — full post templates (landscape article, square announcement/infographic, portrait meme, event flier).
- `guidelines/` — foundation specimen cards (Type, Colors, Spacing, Brand).
- `SKILL.md` — Agent-Skills-compatible entry point.

### Components
- **PostFrame** — artboard shell: format (landscape/square/portrait), theme (dark/red/light), padding, optional logo + footer.
- **Logo** — NF1 mark, size + variant.
- **Eyebrow** — wide-tracked uppercase label / category banner ("MEMEWHILE").
- **Highlight** — inline red (or salmon/yellow) accent word, with optional strikethrough-edit variant.
- **CTA** — red pill / bordered URL sign-off button.
- **Tag** — small chip/badge.
- **Footer** — bottom URL sign-off row.
- **IconFeature** — icon + label unit for connector-style infographics.

### UI kit
- `ui_kits/social-posts/` — `index.html` + JSX screens composing the components into finished, on-brand posts.
