---
category: People
---

A car, with the people in it drawn around it.

A list of names says who is going. This says who is going **with whom**, which
is what anybody actually wants to know before a two-hour drive.

The geometry is fixed rather than computed: five slots — the driver on the left
and four seats around the car — which is exactly what the offer form allows, so
there is no arrangement to solve and no sixth bubble to place badly. The block
is 244px tall and expects roughly 390px of width.

- `ride` — the row plus its `seats`; riders are sorted oldest-first so nobody's
  bubble moves when the next person gets in.
- `meId` — your user id. Your bubble gets the brand ring and your name the
  brand colour, and reads "Tu".

Two states worth knowing: a seat held for somebody who has not accepted is
dimmed and labelled, and empty dashed circles are drawn only while seats remain
— four of them under a full car would read as four people missing.

```tsx
<CarDrawing ride={ride} meId={meId} />
```

Reads i18n for its labels, so it needs a translation provider.
