# API.market MCP Gateway

Connect Claude Code to API.market through the hosted Streamable HTTP MCP endpoint:

`https://api.market/api/mcp/gateway`

## Setup

From this repository, run:

```sh
claude --plugin-dir ./api-market
```

Open `/mcp`, select the API.market server, and complete OAuth sign-in. An API.market account is required. No API key is embedded in the plugin.

The gateway exposes five tools: `search_apis`, `get_api_tools`, `call_api`, `check_usage`, and `manage_subscription`. These cover API discovery, operation schemas, execution, usage and subscriptions. Free tiers and paid plans vary by API; review pricing before executing paid calls or changing subscriptions.

## Verification

This plugin configuration was validated with `claude plugin validate` and connected successfully using Claude Code 2.1.281 on 2026-09-24. The client reported authentication, five tools, resources and prompts. This connection test did not execute every API operation or change subscriptions.

[Setup documentation](https://api.market/mcp) · [Maintained integration metadata](https://github.com/Noveum/api-market-agent-integrations)

This directory contains client configuration and documentation, not the source code of the hosted service.
