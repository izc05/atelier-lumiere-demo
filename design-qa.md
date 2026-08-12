# Design QA — Portada Atelier Lumière

- Source visual truth:
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-545a16f3-1015-40bc-ba1b-a1bb730f7e6f.png`
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-8ac0468b-cdda-4a74-955d-efca4fe35a08.png`
  - `C:/Users/ISICIO/AppData/Local/Temp/codex-clipboard-a9883d83-0c72-47ec-b369-0fbdaf7d049d.png`
- Implementation screenshots:
  - `qa-artifacts/home-final-1280x720.png`
  - `qa-artifacts/home-workshops-1280x720.png`
  - `qa-artifacts/home-commissions-1280x720.png`
  - `qa-artifacts/home-mobile-390x844.png`
- Viewports: 1280 × 720 CSS px and 390 × 844 CSS px; density 1×. Source captures are 1920 × 1020 px and were compared by matching the same visible regions rather than applying pixel-perfect scaling to browser chrome.
- State: public home, The Gentle Stitch active in the rotating hero, live production catalog proxied into the local implementation.

## Full-view comparison evidence

The implementation preserves the supplied Atelier composition, palette, typography, copy and imagery. The requested deltas are visible: the active workshop's real logo replaces the generic AL seal, the main image occupies more of the hero, both workshop cards have identical top and bottom coordinates, and the commission columns move at distinct scroll rates.

## Focused region comparison evidence

- Hero: the rendered logo loaded at 110 × 110 px from the active provider profile and is contained inside the existing circular seal; the photograph is 539 × 575 CSS px at 1280 × 720 without overlapping the copy.
- Workshop cards: both live cards measured `top: 1118.41`, `bottom: 1680.01`, `height: 561.60` CSS px.
- Commission section: over a 420 px scroll, the intro transform changed from `+6.38px` to `-3.89px`, while the route changed from `-9.04px` to `+5.51px`, confirming independent parallax layers.
- Mobile: no horizontal overflow; the workshop seal is intentionally hidden and commission transforms are disabled.

## Required fidelity surfaces

- Fonts and typography: existing Georgia/editorial serif and UI sans hierarchy preserved; no new wrapping or truncation regression above the fold.
- Spacing and layout rhythm: hero image enlarged within the available right column; card stagger removed; equal card heights confirmed.
- Colors and visual tokens: existing wine, cream and gold tokens retained; logo seal uses the established cream/gold treatment.
- Image quality and asset fidelity: real provider logo and real catalog media used through the responsive image pipeline; no placeholder or recreated logo.
- Copy and content: all existing public copy is unchanged.

## Comparison history

- Pass 1 — P2: at 1280 px the first enlargement made the visual overlap the last characters of the headline. Fix: retained the larger 51vw desktop composition above 1360 px, but restored a 43vw cap for 1100–1360 px. Post-fix evidence: `home-final-1280x720.png`, with a clear gap between copy and image.
- Pass 2 — no actionable P0/P1/P2 findings. Logo, card alignment, responsive behavior, parallax and console state verified.

## Findings

No actionable P0, P1 or P2 findings remain. No P3 follow-up is required for the requested scope.

## Primary interactions tested

- Rotating workshop data and logo hydration.
- Workshop navigation controls remained present.
- Scroll-driven commission parallax at desktop width.
- Mobile layout and reduced-motion-compatible static transforms.
- Browser console checked: no errors.

## Final result

final result: passed
