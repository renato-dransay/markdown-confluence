## ADDED Requirements

### Requirement: Mermaid renderer configuration option
The system SHALL provide a `mermaidRenderer` configuration option that controls how Mermaid code blocks are processed during publishing.

#### Scenario: Configuration accepts valid values
- **WHEN** user sets `mermaidRenderer` to `"none"` or `"puppeteer"`
- **THEN** the system accepts the configuration without error

#### Scenario: Default value when not specified
- **WHEN** user does not specify `mermaidRenderer` in configuration
- **THEN** the system defaults to `"none"`

### Requirement: Passthrough mode preserves Mermaid code blocks
When `mermaidRenderer` is set to `"none"`, the system SHALL leave Mermaid code blocks unchanged in the ADF output.

#### Scenario: Mermaid code block passes through unchanged
- **WHEN** `mermaidRenderer` is `"none"`
- **AND** a Markdown file contains a mermaid code block
- **THEN** the ADF output contains a `codeBlock` node with `language: "mermaid"` and the original code content

#### Scenario: No PNG attachments created in passthrough mode
- **WHEN** `mermaidRenderer` is `"none"`
- **AND** a Markdown file contains mermaid code blocks
- **THEN** no PNG image attachments are uploaded for those code blocks

### Requirement: Puppeteer mode renders Mermaid to PNG
When `mermaidRenderer` is set to `"puppeteer"`, the system SHALL render Mermaid code blocks to PNG images (existing behavior).

#### Scenario: Mermaid code block rendered to image
- **WHEN** `mermaidRenderer` is `"puppeteer"`
- **AND** a Markdown file contains a mermaid code block
- **THEN** the ADF output contains a `mediaSingle` node with the rendered PNG image
- **AND** the image is uploaded as an attachment

### Requirement: Configuration available in all entry points
The `mermaidRenderer` configuration option SHALL be available in both CLI and Obsidian plugin entry points.

#### Scenario: CLI respects mermaidRenderer setting
- **WHEN** user runs CLI with `mermaidRenderer: "none"` in config
- **THEN** Mermaid code blocks pass through unchanged

#### Scenario: Obsidian plugin respects mermaidRenderer setting
- **WHEN** user configures Obsidian plugin with `mermaidRenderer: "none"`
- **THEN** Mermaid code blocks pass through unchanged
