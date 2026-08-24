---
category: Event
---

The 240px hero at the top of an event: photograph, gradient, and a corner slot.

`coverUrl` may be `null`, and then it draws the striped placeholder rather than
an empty box. The gradient over the image is not decoration — it is what keeps
the corner control and the past badge legible over an arbitrary photograph, so
do not remove it or replace the image with a bare `<img>`.

`corner` is a **slot**, not a back link: the event screen puts a back link
there and the junta's preview puts a close button, which is the only reason it
is a prop. `isPast` adds the "ja ha passat" badge in the opposite corner.

Nothing in it fetches and nothing in it knows where it is mounted — it lives
apart from the screen precisely so the junta's unsaved-form preview can render
the same thing.

```tsx
<Cover coverUrl={event.cover_url} isPast={isPast} corner={<BackLink to="/" />} />
```

Full-bleed: give it the screen's width, not the gutter's.
