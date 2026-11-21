# AppStruct Social

![AppStruct](assets/appstruct.svg)

Read connected social channels, inspect saved posts and available analytics, and save **unscheduled drafts** for review in AppStruct Social. The MCP connection cannot schedule, publish or delete posts.

This folder packages AppStruct's published [1.1.0 Claude Code client configuration and workflow skill](https://github.com/VladimirTambovtsev/appstruct-social-cursor-plugin/releases/tag/v1.1.0). It connects to the hosted service at `https://api.appstruct.ai/v1/social/mcp`; it does not contain the server implementation.

## Requirements

- An AppStruct account with applicable Social access and connected channels.
- A short-lived key for the intended workspace, configured privately as `APPSTRUCT_SOCIAL_MCP_KEY`.
- `social:read` for channels, posts and draft validation. Add `social:drafts:write` only when saving or revising drafts, and `social:analytics:read` only when reading analytics.

Create a key in [Social connection settings](https://appstruct.ai/dashboard/social/api/connect). Plan access and limits apply. Keep the actual key out of this checkout, terminal transcripts and conversations. The read scope includes unpublished posts and attachments in the selected workspace.

## Try one read before saving a draft

From this catalog's checkout, launch Claude Code with the plugin:

```sh
claude --plugin-dir ./appstruct-social
```

The process must inherit `APPSTRUCT_SOCIAL_MCP_KEY` from your private environment. Review the connection permissions and open `/mcp` to confirm that `appstruct-social` is connected. Use one connection method so the same server is not added twice.

Start with:

> List my AppStruct Social channels with their platform, ID and status. Do not create or edit a post.

Compare the returned destinations with the intended Social workspace. A successful connection does not by itself establish that the key selects the intended workspace.

Then request one fictional update for a channel you explicitly select. Read back the saved draft and review its text, attachments and destination in Social before choosing a publishing time there. Do not treat a saved draft as a published post.

The [worked setup guide, client configs and practice brief](https://blog.appstruct.ai/blog/social-media-mcp-server?utm_source=composio_plugins&utm_medium=referral&utm_campaign=social_mcp_launch_20261114&utm_content=plugin_readme_01) are public and need no email to download. A real connection requires the account and workspace key described above.

## Tools

| Permission | Available tasks |
| --- | --- |
| `social:read` | List channels, list posts, read a post and validate a draft |
| Read + draft-write | Also create or replace an unscheduled draft |
| `social:analytics:read` | Read available measured analytics |

Actual tool discovery depends on granted scopes. The [public API specification](https://api.appstruct.ai/v1/social/openapi.json) declares the `x-mcp-tools` inventory. This is a Bearer-key connection, not an OAuth-only connector. It has no package dependencies, executable hooks or bundled server process.

## Validation and license

The plugin and marketplace manifests passed Claude Code's local validator. The configuration and workflow skill match AppStruct's published 1.1.0 package, apart from this catalog's guide attribution. A dedicated read-only profile previously initialized the hosted endpoint in [Glama](https://glama.ai/mcp/connectors/io.github.VladimirTambovtsev/appstruct-social) and discovered four read-only tools. That check did not create or edit a draft; this submission does not claim an authenticated Claude Code drafting run.

Published by the AppStruct team. Client configuration and skill text are MIT licensed; retain `LICENSE` and `NOTICE`. The hosted service has separate terms and access limits. The name and logo remain AppStruct brand assets. Inclusion in a catalog is separate from approval by Anthropic.
