---
category: Actions
---

Sign in with Google — the one button in the app that is not brand-filled.

White with dark text is Google's requirement, not a style choice: their mark is
allowed on a white or a dark button and nowhere else. It is also the only
control here that does not use the display face — it is Google's button
sitting in our screen. Do not restyle it, do not tint it, and do not put the
mark on brand red.

Square and `min-height` like every other decision on these screens, so a longer
Spanish label grows it instead of clipping. Takes any `<button>` prop; the
children are the label.

```tsx
<GoogleButton onClick={signIn} disabled={pending}>
  {pending ? 'Un segon…' : 'Entra amb Google'}
</GoogleButton>
```
