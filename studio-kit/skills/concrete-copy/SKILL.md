---
name: concrete-copy
description: Use when writing, editing or reviewing the words on a website page (hero, section titles, product cards, buttons, microcopy, captions, meta descriptions), when a page "sounds like AI", when the client says the copy is vague, pompous or too long, and before showing a page to anyone. Keeps only words that tell the visitor what they get, what it costs and what to do next, strips commentary and filler, and lints the built HTML for AI tells. Not for long-form blog posts or ads strategy.
license: MIT
---

# Concrete copy for websites

Visitors decide in seconds. The words on a premium page do three jobs only: say what this is, say what the
visitor gets (and what it costs), say what to do next. Everything else is noise that makes the page look
cheaper and slower, no matter how good the design is.

## The page carries only this

Brand, navigation, section labels, product or service names, prices, specs that matter, buttons, and the few
sentences a buyer needs to decide. That is the default.

Not on the page unless the client wrote it or signed it off:
- captions that describe the image the visitor is already looking at ("A quiet morning in the studio");
- slogans that comment on the design ("One case. Every colour.");
- instructions about the interface ("Scroll to explore", "Move the light across the glass");
- work notes, legends, "preview", "draft", "lorem", version numbers.

Images and interaction should carry the mood. Words carry facts.

## Concrete beats philosophical

| Vague / pompous | Concrete |
|---|---|
| Where time becomes yours. | Swiss automatic, 40 mm, 3-year warranty. €4,200. |
| Elevate your smile journey. | Implants in one visit. Fixed price before we start. |
| Crafted with passion since forever. | Fresh pasta every morning. Kitchen open 12:00-14:30, 19:00-22:30. |
| Unlock seamless digital experiences. | We build your site in 10 days. You see it before you pay. |
| Not just a gym, it's a lifestyle. | Open 6:00-23:00. First week free. No joining fee. |

Test for every sentence: could the visitor act on it, or check it? If neither, cut it or replace it with a fact.

## Rules

1. Lead with the noun the visitor came for, then the proof (number, spec, guarantee, place, time, price).
2. One idea per sentence. Sentences under ~20 words in heroes and cards.
3. Buttons are verbs with an object: "Book a table", "See prices", "Get the quote". Not "Discover", "Learn more", "Submit".
4. Put the friction reducer next to the button, not in a footer: "No card needed", "Free cancellation until 24 h before".
5. Prices and hours are copy. If they exist, show them; hiding them reads as expensive in the bad way.
6. Claims need proof on the same screen: "4.9 on 312 Google reviews" beats "Loved by our clients".
7. Same word for the same thing everywhere (do not call it "session", "appointment" and "visit" on one page).
8. Write in the visitor's language and register. A local business in Italy gets Italian first; a multilingual site
   gets each language written natively, not machine-literal.

## AI tells to remove before anyone sees the page

- Words: leverage, seamless, empower, unlock, elevate, robust, actionable, data-driven, cutting-edge, game-changer,
  journey (for non-travel), curated (unless it literally is), solutions, synergy, delve, tapestry, testament,
  landscape (non-geographic), realm, harness (as a verb), bespoke (unless it literally is), world-class, state-of-the-art.
- Shapes: "Not just X, it's Y"; "Whether you're A or B"; false ranges ("from startups to enterprises"); triples
  that say nothing ("fast, simple, powerful"); rhetorical questions as headlines; vague attributions ("experts agree").
- Punctuation: em dashes used as a rhythm device; exclamation marks in body copy; Title Case On Every Word.
Brand devices that the client chose stay, even if they match a rule.

## Procedure

1. Read the brief and real material (menu, price list, product sheet, reviews). Facts come from there, never invented.
   If a fact is missing (price, hours, warranty), leave a visible `TODO` marker for the client, do not make one up.
2. Draft each block with the rules above.
3. Build the page, then lint the real HTML:
   ```bash
   python3 scripts/copy_lint.py dist/index.html      # or a folder, or http://localhost:5173
   ```
4. Fix every FAIL, judge every WARN, and read the page once at phone width: the hero must answer "what, for whom,
   what next" without scrolling.

## Scripts

- `scripts/copy_lint.py <file|folder|url> [--lang en]`: extracts visible text (skips scripts, styles, hidden
  elements marked `aria-hidden` or `hidden`), then reports FAIL for AI-tell words and shapes, em dashes and leftover
  placeholders (`lorem`, `TODO`, `TBD`), WARN for long sentences, vague buttons and exclamation marks. Exit 1 on FAIL.
  Standard library only.

For persuasion frameworks, product listings, SEO copy and conversion testing, use `conversion-copywriter`,
`seo-specialist` and `cro-specialist` from Studio Kit Pro, if installed.
