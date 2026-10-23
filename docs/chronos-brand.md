# Chronos identity

Use `components/brand/ChronosWordmark` at actual logo positions. The selected identity is uppercase Cinzel, weight 700, letter spacing 0.18em, with a gold color adjusted for a light or dark background.

- `hero` preserves the selected landing wordmark and scales down to 32px on phones.
- `compact` is the 18px home/header mark.
- `inline` is for an export's attribution mark.
- `onDark` preserves the gold on Classic's dark hero, regardless of page theme.

The font is self-hosted under `public/fonts/modern`, with its existing OFL license. The narrowly scoped wordmark CSS is shared by both entries; modern app globals are not loaded into Classic. Ordinary sentences and navigation labels remain ordinary text. The clock favicon remains the small icon.

The landing page has one centered mark and no duplicate header branding.
