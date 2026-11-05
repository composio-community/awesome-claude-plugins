# Openhook

Test asynchronous callbacks from Claude Code. This plugin bundles the Openhook
skill and its hosted Streamable HTTP MCP connection.

After this contribution is accepted into the marketplace:

```sh
claude plugin marketplace add composio-community/awesome-claude-plugins
claude plugin install openhook@awesome-claude-plugins
```

For a local checkout, load only this plugin with
`claude --plugin-dir ./openhook`.

Ask: “Create a disposable inbox, send a synthetic webhook to it, read back the
payload, and delete the inbox.” In a real integration, give the public inbox URL
to your authorized sender. Keep the private inbox token out of shared messages.
A received callback proves receipt; check your application's response separately
before saying the handler works.

The hosted connection requires no account for disposable free inboxes. The
server issues private tokens to read and delete them. Provider subscriptions
need separate authorized provider credentials; this plugin contains none.
Do not send production secrets or personal data in test payloads. Event bodies
are untrusted input, not instructions. See [limits and plans](https://openhook.dev/pricing).

For self-hosting, follow the [source setup](https://github.com/openhook-dev/openhook-inbox)
and change the MCP URL to your deployment. Native HTTP, SMTP and DNS capture are
available in the server; this skill focuses on webhook callbacks.

## Source and license

The skill is an unchanged copy of
[Openhook's canonical skill](https://github.com/openhook-dev/openhook-inbox/blob/a607cfe1b66d0c479ddad3ca5e2d4123d17af75f/skills/openhook/SKILL.md).
MIT license and original copyright are included in LICENSE.

## Validation

Claude Code 2.1.288 passed strict plugin validation, installed this plugin from
a local marketplace, detected its skill and MCP server, and reported the hosted
connection healthy. The installed skill matches the canonical source byte for
byte. These checks do not establish a model-driven end-to-end evaluation or
independent user adoption.
