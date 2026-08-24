---
category: Event
---

One line of an event's facts: a fixed-width uppercase label, then the value.

The label column is a fixed 64px so the values line up down the block however
short the labels are — that alignment is the whole component. Both props are
plain strings you have already localised and formatted; it does no formatting
itself.

```tsx
<Fact label={t('event.facts.when')} value={when} />
<Fact label={t('event.facts.where')} value={event.lugar} />
<Fact label={t('event.facts.price')} value={price ?? t('event.facts.free')} />
```

Values wrap with `text-wrap: pretty` and are never truncated. Stack them
directly — they carry their own vertical rhythm, so no `gap` is needed.
