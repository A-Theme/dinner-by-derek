# Contrast audit — WCAG 2.1 AA

Every text-on-background pairing shipped in this app, measured. Thresholds:
**4.5:1** for body text, **3:1** for large text (≥24px, or ≥18.7px bold) and for
non-text UI components such as indicators and borders.

Reproduce with `npm run contrast`.

| Pairing | Ratio | Result |
|---|---|---|
| Espresso on Parchment (body) | 14.08 | Pass — body |
| Espresso on Cream-hi (cards) | 15.21 | Pass — body |
| Espresso on Parchment-2 (wells, table stripes) | 12.56 | Pass — body |
| **Espresso on Saddle Tan (primary CTA)** | **4.91** | **Pass — body** |
| Espresso on Warm Ochre (CTA hover) | 6.23 | Pass — body |
| **Parchment on Olive Green (header/footer links)** | **5.38** | **Pass — body** |
| Burnt Umber on Parchment (headings, secondary btn) | 11.23 | Pass — body |
| Olive-deep on Parchment | 8.19 | Pass — body |
| Tan-deep on Parchment | 5.14 | Pass — body |
| Umber-soft on Parchment (muted labels) | 7.23 | Pass — body |
| Parchment on Burnt Umber (sold out / closed chips) | 11.23 | Pass — body |
| Parchment on Espresso-2 (splash, offline) | 16.14 | Pass — body |

The spec singled out two pairings as needing verification rather than assumption.
One passed. The other did not, and neither did a third:

## Failure 1 — Burnt Umber text on Saddle Tan badges: 3.92:1

Passes for large text, fails for body. Header badges render small text, so this
would have shipped a real failure.

**Smallest fix:** step Burnt Umber two shades darker to `#3C2114`
(`--dbd-umber-deep`) → **4.52:1**. Same hue, same debossed reading; no
substitute colour introduced. `--dbd-umber` is unchanged everywhere else.

## Failure 2 — Saddle Tan active indicator on Olive Green: 1.88:1

Fails body, large text, and the 3:1 non-text component bar. An active nav
indicator is a UI component that carries meaning, so 3:1 applies.

**Smallest fix:** lift Saddle Tan toward its own hover tone, `#EBC08C`
(`--dbd-tan-lift`) → **3.64:1**. Warm Ochre was tested first as the more
obvious reuse and only reached 2.38:1, so it was rejected. Nav label text
remains Parchment at 5.38:1; the lifted tan is the indicator bar only.

## Note on Saddle Tan as text

Saddle Tan on Parchment is 2.87:1 and is never used for text. Where the design
calls for a tan-toned label, `--dbd-tan-deep` (5.14:1) is used instead. Saddle
Tan itself appears only as a background, a border, or a large-format accent.
