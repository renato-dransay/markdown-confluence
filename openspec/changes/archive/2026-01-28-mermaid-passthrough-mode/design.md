## Context

Currently, Mermaid diagrams are rendered to PNG via Puppeteer and uploaded as attachments. This is hardcoded in both CLI and Obsidian entry points. The Atlassian Labs "Mermaid diagrams viewer" app can render Mermaid code blocks directly in Confluence, making the PNG conversion unnecessary for users with this app installed.

## Goals / Non-Goals

**Goals:**
- Add configuration to skip Mermaid PNG rendering
- Pass Mermaid code blocks through as-is when configured
- Keep existing PNG rendering as opt-in fallback

**Non-Goals:**
- Automatically detecting if Confluence has a Mermaid app installed
- Adding the Mermaid viewer macro programmatically (user adds it manually)
- Changing the PNG rendering quality or format

## Decisions

### 1. Configuration approach

**Decision**: Add `mermaidRenderer` field to settings with values `"puppeteer"` | `"none"`.

**Rationale**: Simple, explicit, matches existing config patterns. Using `"none"` rather than `"passthrough"` because it describes what the system does (no rendering) rather than an implementation detail.

**Alternative considered**: Boolean `renderMermaidToPng: true/false` - rejected because less extensible if we add other renderers later.

### 2. Default value

**Decision**: Default to `"none"` (passthrough mode).

**Rationale**:
- Simpler setup for new users (no Puppeteer/Chrome dependency)
- Solves the current pain points (upload failures, low resolution)
- Users wanting PNG can explicitly opt-in

### 3. Implementation location

**Decision**: Check the setting in CLI/Obsidian entry points when constructing the plugins array.

**Rationale**: Minimal code change. The Publisher already accepts plugins as a parameter, so we just conditionally include MermaidRendererPlugin.

```typescript
// Before
const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
  new MermaidRendererPlugin(new PuppeteerMermaidRenderer()),
]);

// After
const plugins = settings.mermaidRenderer === "puppeteer"
  ? [new MermaidRendererPlugin(new PuppeteerMermaidRenderer())]
  : [];
const publisher = new Publisher(adaptor, settingLoader, confluenceClient, plugins);
```

## Risks / Trade-offs

- **Users without Mermaid app see raw code** → Acceptable tradeoff; code is still readable and they can install the free Atlassian Labs app
- **Breaking change for existing users** → Mitigated by announcing in changelog; users can add `mermaidRenderer: "puppeteer"` to restore old behavior
