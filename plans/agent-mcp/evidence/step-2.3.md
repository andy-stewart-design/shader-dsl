# Step 2.3 evidence — unrelated conformance page

## Hosted conformance

The user manually deployed the updated standalone React demo over HTTPS and ran the helper against it; no pairing links, credentials, or session identifiers are recorded here. Direct MCP observations showed the expected `demo_get_state`, `demo_set_message`, and `demo_capture_image` catalog. The initial state was the default message at revision 0; setting the message returned revision 1. The user confirmed that the edit was visible in the page. The generated image was delivered as actual model-visible PNG content at 640×360, showing the purple/white inverted triangle and green/dark circle.

The same browser page was refreshed without a new pairing link. The user reported that the flow continued to work; direct connection/state observations confirmed catalog rediscovery, a fresh session, reset-to-default application state at revision 0 (expected because application state is not persisted), and successful image delivery again. Explicit disconnect followed by refresh stayed unpaired (`Not connected`); the helper was also unpaired and did not auto-resume. After re-pairing, a helper restart left the new helper unpaired and the user observed the expected connection-error/attention state; fresh pairing was required and then worked. The extra helper restart during pairing was not diagnosed and is not treated as a product finding.

For the interrupted mutation flow, the delayed `demo_set_message` call returned `not_connected: page disconnected; outcome may be uncertain` after the user refreshed during the call. Once the helper had a fresh connection, the parent waited 11 seconds and read the page state: the default message, revision 0, and `demoState: ready`; no replayed mutation was observed. This demonstrates no reconnect replay and retains uncertainty semantics—it does not claim rollback guarantees for an arbitrary write that may already have been applied.

## Checks and gate

- `pnpm --filter @shdr/agent-bridge check` — passed.
- `pnpm --filter @shdr/agent-bridge build` — passed.
- `pnpm --filter @shdr/agent-bridge test` — passed: 33 tests across 7 files.
- `pnpm --filter agent-bridge-demo check` — passed.
- `pnpm --filter agent-bridge-demo lint` — passed.
- `pnpm --filter agent-bridge-demo build` — passed.

The unrelated demo uses the same public browser package and required no shader-specific bridge changes; the generic package remains independent of the app at runtime. These results close the Step 2.3 completion and Phase 2 exit gates for the generic/browser portions of AC3, AC7, AC8, AC9, and AC24. REPL authoring, later client-compatibility claims, and Phase 3 work remain uncompleted. The user performed the deployment manually; this evidence does not grant production approval or claim a production rollout. Exact Chrome version was not collected and is not treated as a blocker for this gate.
