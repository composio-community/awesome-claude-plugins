# Story authoring

Use `plan` output to select controls for the requested flow. `label` resolves
ARIA references and HTML labels; native select `options` provide labels, values
and disabled states. The plan's `name` remains the HTML attribute, not a
computed accessible name. This DOM inventory is not a complete accessibility
tree. Use the supplied `selector` when the intended locator is uncertain.

An editable story:

```json
{
  "url": "https://your-app.com",
  "viewport": { "width": 1440, "height": 810 },
  "initialWait": 700,
  "tail": 1200,
  "steps": [
    { "action": "click", "role": "button", "name": "New project", "zoom": false },
    { "action": "waitFor", "selector": "input[name=project-name]" },
    { "action": "type", "selector": "input[name=project-name]", "value": "Launch", "caption": "Give it a name" },
    { "action": "click", "text": "Create project", "caption": "Your workspace is ready", "zoom": false },
    { "action": "waitFor", "text": "Launch" }
  ]
}
```

`initialWait`, `tail`, step `ms`, `pause` and `timeout` use **milliseconds**.
`posterAt` and `zoomDuration` use **seconds**. Validate with the packaged
[schema](../schemas/story.schema.json); unknown fields are errors.

| Action | Fields |
|---|---|
| `wait` | `ms` |
| `goto` | `url`, `pause` |
| `click`, `hover` | locator, `pause`, `caption`, `zoom` |
| `focus` | locator, `pause`, `caption`, `zoom`; measure the target after scrolling into view |
| `type` | locator, `value`, `pause`, `caption`, `zoom` |
| `select` | locator, `value` or `text`, `pause`, `caption`, `zoom` |
| `drag` | locator, `dx`, `dy`, `steps`, `pause`, `caption`, `zoom` |
| `scroll` | `y`, `pause`, `caption`, `zoom` |
| `press` | `key`, `pause`, `caption`, `zoom` |
| `waitFor` | `selector`, `text` or `url`; optional `timeout`, `pause` |
| `screenshot` | `file`, relative to the output directory |

Locator fields are `selector`, `role` + `name` (or `text`), `name`, or `text`.
An explicit selector is tried first. A supplied `role` restricts name matching
to that role, exact before partial. Without a role, try exact button/link
candidates, partial button/link candidates, then plain text (exact before
partial). This keeps noninteractive headings behind controls. Each candidate
selects its first visible match; hidden exact matches do not block a visible
partial match. Use a scoped selector when labels repeat or overlap.
Story steps do not have a dedicated iframe locator. `type` clears the field
before typing.

`click` waits for an enabled, unobstructed target; its optional `timeout` is in
milliseconds (default 20,000). Persistent blocking returns `STEP_TIMEOUT`.
A successful click does not prove the app finished processing it; continue to
use `waitFor` for the expected result.

Use `waitFor` for a visible result before the next interaction. Give captions
and focus targets explicit pauses. `focus` frames the target without clicking it;
add another focus step after the layout changes. Use `preview --config story.json`
to execute steps before recording. Preview performs actual app changes, so reset
demo data before a retake. It preserves recordings and writes explicit screenshots.
Use rendered output to check camera framing. Give captions time to be read; they
begin after the interaction and replace the previous caption. An action's `pause`
provides reading time after its caption starts; saved timelines keep their
original timestamps.
Set `zoom: false` when the result is elsewhere on screen. Avoid
recording a blank initial load or ending on an unfinished dialog.

To improve blurry output when zooming, record with `"scale": 2` (or `--scale 2`) for HiDPI 2x capture, or use a larger viewport such as `1920x1080`. To capture an editable story by clicking through the app interactively, run `tabretake capture --url <url> --out story.json`.
If text does not fit, shorten the caption or split it across meaningful steps.
If a selector fails, inspect the reported step and refresh the page plan rather
than guessing at selectors or increasing every timeout.
