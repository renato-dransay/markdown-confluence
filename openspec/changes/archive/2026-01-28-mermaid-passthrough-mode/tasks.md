## 1. Settings

- [x] 1.1 Add `mermaidRenderer` field to Settings type with values `"puppeteer" | "none"`
- [x] 1.2 Set default value to `"none"` in settings loading logic

## 2. CLI Integration

- [x] 2.1 Update CLI entry point to conditionally include MermaidRendererPlugin based on `mermaidRenderer` setting

## 3. Obsidian Integration

- [x] 3.1 Update Obsidian plugin entry point to conditionally include MermaidRendererPlugin based on `mermaidRenderer` setting

## 4. Testing

- [x] 4.1 Update existing tests to account for new default behavior
- [x] 4.2 Test mermaid passthrough mode with a sample document
