---
category: Event
---

How many places are left, set in the display face at its largest.

This number is the reason somebody opens an event screen twice in an evening,
so it gets its own states rather than one formatted string:

- **Places left** — the count, with "de {total}" under it.
- **The last one** (`left === 1`) — amber, plus a line saying it will not last.
  The last place is not the twentieth place.
- **Full** (`left === 0`) — amber, and the line under it changes depending on
  whether anybody is `waiting`. People do drop out, and the copy says so.
- **Past** (`isPast`) — it stops counting places and counts who came, next to
  the points for coming.

`left === null` on a non-past event means the event has no cap, and the
component renders nothing at all.

```tsx
<Places total={30} puntos={12} left={8} going={22} isPast={false} waiting={0} />
```

Gutter-padded internally, so give it the full screen width. Reads i18n, so it
needs a translation provider.
