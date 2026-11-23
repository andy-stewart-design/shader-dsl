# Stateless MCP Overview

## Purpose and intended change

Move `app-mcp` from the maintenance-only MCP SDK v1 to SDK v2 and add support for the 2026-07-28 MCP specification. The compatibility-preserving scope assumes continued legacy support, allowing existing and modern clients to use the same browser tools.

## How it is used

The user still starts the configured stdio helper, gets pairing information, opens the REPL pairing link, and discovers/calls the page's tools. No new protocol flag or project configuration is intended.

Pi clients that only support revisions through 2025-11-25 would use the legacy flow. Supporting 2026-07-28 on the server does not make Pi use that revision.

## Mental model

There are two separate boundaries:

- **MCP client ↔ helper over stdio:** accepts modern stateless requests or the legacy initialization flow.
- **Helper ↔ browser over authenticated loopback WebSocket:** retains the paired page, catalog, cancellation, and refresh-recovery state.

“Stateless MCP” does not mean restarting the helper for every request or forgetting the paired browser. Calls already carry explicit browser session and catalog handles. Protocol negotiation must not disrupt that application state.

## Scope and non-goals

- In scope: SDK migration, dual-era stdio support, preserved tool/security/lifecycle behavior, and modern-client plus Pi compatibility checks.
- Out of scope: HTTP MCP serving, new application tools, or changing the browser protocol. The working scope also excludes modifying Pi or dropping legacy clients.

## Related documents

- Specification: [spec.md](spec.md)
- Implementation plan: [plan.md](plan.md)
- Existing bridge context: [Agent MCP overview](../_completed/agent-mcp/overview.md)
