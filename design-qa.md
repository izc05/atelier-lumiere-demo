# Design QA — Simplificación de portada y movimiento de marca

- Source visual truth:
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-cf553c2a-d9b4-4beb-bae2-aac67badb160.png`
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-7a1c3676-554e-41b3-a50a-0c7902d50774.png`
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-fcf8235a-b6f8-4741-a8ab-e93d6c54d4fe.png`
- Implementation screenshots:
  - `qa-artifacts/home-logo-only-1440x900.png`
  - `qa-artifacts/join-dark-logo-1440x900.png`
  - `qa-artifacts/brand-entry-motion-1440x900.png`
  - `qa-artifacts/brand-entry-mobile-390x844.png`
  - `qa-artifacts/home-logo-only-mobile-390x844.png`
- Viewports: 1440 × 900 CSS px and 390 × 844 CSS px; density 1×. Source captures include browser chrome and were compared by matching the same visible page regions.
- State: public home, The Gentle Stitch active in the rotating hero, live production catalog proxied into the local implementation.

## Full-view comparison evidence

The implementation preserves the supplied Atelier composition, palette, typography, copy and primary imagery. The requested deltas are visible: the duplicate detail photo no longer exists, the workshop logo is the only floating media in the hero, the light header bug on `/unete/` is repaired with the official dark logo, and the brand entry gains a restrained moving light plus slow background-letter motion.

## Focused region comparison evidence

- Hero: `.hero-photo-detail` count is `0`; the active workshop logo loads from its real provider media endpoint; the logo container has transparent background and a `0px` border.
- Join header: `data-atelier-brand-tone="dark"`, official dark SVG, computed image opacity `1`, no background-image override, rendered at 201.6 × 46.1 CSS px.
- Brand entry: pointer movement updated the lighting variables from `50% / 42%` to `72% / 25.56%`; the background letters use a 16-second motion cycle and the glow a 7-second cycle.
- Mobile: document width equals viewport width at 390 px, the intro logo remains visible, the public menu remains available, and the desktop workshop logo is intentionally hidden.

## Required fidelity surfaces

- Fonts and typography: existing Georgia/editorial serif and UI sans hierarchy preserved; no new wrapping or truncation regression above the fold.
- Spacing and layout rhythm: hero image enlarged within the available right column; card stagger removed; equal card heights confirmed.
- Colors and visual tokens: existing wine, cream and gold tokens retained; logo seal uses the established cream/gold treatment.
- Image quality and asset fidelity: real provider logo, official brand SVGs and real catalog media used; no recreated or placeholder asset was introduced.
- Copy and content: all existing public copy is unchanged.

## Comparison history

- Pass 1 — P1: the global brand navigation CSS forced the light logo on every public header, reproducing the invisible mark in `/unete/`. Fix: the logo tone is now explicit per header and only light-tone headers suppress the inline image.
- Pass 2 — P2: removing the duplicate photo exposed the decorative outer seal around the provider logo. Fix: removed its border, background and pseudo-element while retaining a shadow on the real logo asset.
- Pass 3 — no actionable P0/P1/P2 findings. Desktop, mobile, pointer lighting, live media hydration and console state verified.

## Findings

No actionable P0, P1 or P2 findings remain. No P3 follow-up is required for the requested scope.

## Primary interactions tested

- Rotating workshop data and logo hydration.
- Workshop navigation controls remained present.
- Brand-entry CTA and transition into the home.
- Pointer-driven entry illumination.
- Mobile layout and reduced-motion fallback declarations.
- Browser console checked on home and join: no errors.

## Final result

final result: passed
