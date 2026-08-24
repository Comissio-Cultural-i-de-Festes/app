---
category: Actions
---

A row of CTAs — sí / potser / no — sharing one baseline.

It is a grid with `items-stretch` and equal columns, which is the point: a
label that wraps to two lines makes every button in the row that tall instead
of leaving it ragged. That is exactly how "grow, don't clip" usually falls
apart, so reach for this rather than a flex row whenever more than one `Button`
sits side by side.

Column count comes from how many children you pass; two and three are the
shapes the app uses.

```tsx
<ButtonGroup>
  <Button>Sí</Button>
  <Button variant="secondary">Potser</Button>
  <Button variant="secondary">No</Button>
</ButtonGroup>
```
