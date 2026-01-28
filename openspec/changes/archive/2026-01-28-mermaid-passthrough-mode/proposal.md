## Why

The current Mermaid diagram handling converts code blocks to PNG images via Puppeteer rendering. This causes problems: upload failures with multiple diagrams, low resolution/unreadable diagrams, and unnecessary complexity. Confluence users with the Atlassian Labs "Mermaid diagrams viewer" app can render Mermaid code blocks directly - we just need to pass the code through instead of converting it.

## What Changes

- Add a configuration option `mermaidRenderer` with values `"puppeteer"` (current behavior) or `"none"` (passthrough)
- When set to `"none"`, skip the MermaidRendererPlugin entirely
- Mermaid code blocks remain as `codeBlock` nodes with `language: "mermaid"` in the ADF
- Default to `"none"` for simpler setup (users wanting PNG can opt-in to puppeteer)

## Capabilities

### New Capabilities
- `mermaid-rendering-config`: Configuration option to control how Mermaid diagrams are handled (passthrough vs PNG rendering)

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- `packages/lib/src/Settings.ts` - Add new `mermaidRenderer` setting
- `packages/cli/src/index.ts` - Conditionally include MermaidRendererPlugin based on setting
- `packages/obsidian/src/main.ts` - Same conditional logic for Obsidian plugin
- Configuration files (`.mermaid-confluence.yaml`, etc.) - New optional field
- **No breaking changes** - existing behavior available via `mermaidRenderer: "puppeteer"`
