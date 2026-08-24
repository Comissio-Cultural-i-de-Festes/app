---
category: Navigation
---

The Idees tab glyph: a speech bubble.

Same API as every tab icon — one optional `className` replacing the 21×21
default, `fill: currentColor`, `aria-hidden`.

If the screen behind it has not shipped, the whole slot goes to `opacity-45`
as a disabled button rather than being removed. Do not express that state by
dimming the icon alone: a dimmed link is still focusable and still goes
nowhere.

```tsx
<span className="text-fg-dim">
  <ProposalsIcon />
</span>
```
