# @markdown-confluence/cli

`@markdown-confluence/cli` is a powerful tool that allows you to publish your markdown files as Confluence pages. It is designed to work seamlessly in various environments, including NPM CLI, Docker Container, and GitHub Actions, enabling you to use your docs wherever you need them. Comprehensive documentation for the tool can be found at [https://markdown-confluence.com/](https://markdown-confluence.com/).

## Features

- **Dry-Run Mode**: Preview what would be published without making changes
- **Validation**: Check for issues like duplicate titles before publishing
- **Manifest Generation**: Generate a JSON manifest of published pages
- **Improved Error Messages**: Clear, actionable error messages

## Usage Examples

### CLI

**Example setup**

`.markdown-confluence.json`:

```json
{
  "confluenceBaseUrl": "https://markdown-confluence.atlassian.net",
  "confluenceParentId": "524353",
  "atlassianUserName": "andrew.mcclenaghan@gmail.com",
  "folderToPublish": "."
}
```

**Environment Variables**

macOS / Linux:

```bash
export ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

Windows:

```bash
set ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

[Learn more about `set` command](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/set_1)

**CLI Command**

```bash
npx @markdown-confluence/cli
```

### CLI Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--baseUrl` | `-b` | Confluence base URL |
| `--parentId` | `-p` | Confluence parent page ID |
| `--userName` | `-u` | Atlassian username |
| `--apiToken` | | Atlassian API token |
| `--enableFolder` | `-f` | Folder to publish |
| `--contentRoot` | `-cr` | Root directory for content |
| `--firstHeaderPageTitle` | `-fh` | Use first H1 as page title |
| `--dryRun` | `-d` | Preview changes without publishing |
| `--validateOnly` | `-v` | Only validate, do not publish |
| `--generateManifest` | `-m` | Generate manifest after publishing |
| `--manifestPath` | | Path for manifest file (default: confluence-manifest.json) |
| `--config` | `-c` | Path to config file |

### Dry-Run Mode

Use dry-run mode to preview what would happen without making any changes to Confluence:

```bash
npx @markdown-confluence/cli --dry-run
```

This will:
1. Validate all markdown files
2. Check for duplicate titles
3. Show which pages would be created, updated, or remain unchanged

### Validation Only

Run validation without connecting to Confluence:

```bash
npx @markdown-confluence/cli --validate-only
```

This checks for:
- Duplicate page titles
- Missing H1 headings
- Invalid frontmatter

### Manifest Generation

Generate a JSON manifest of all published pages:

```bash
npx @markdown-confluence/cli --generate-manifest --manifest-path ./docs-manifest.json
```

The manifest includes:
- Source file paths
- Confluence page IDs and URLs
- Publishing timestamps
- Update status (created/updated/unchanged)

### Docker Container

**Example setup**
```bash
docker run -it --rm -v "$(pwd):/content" -e ATLASSIAN_API_TOKEN ghcr.io/markdown-confluence/publish:latest
```

**Dry-run with Docker**
```bash
docker run -it --rm -v "$(pwd):/content" -e ATLASSIAN_API_TOKEN -e CONFLUENCE_DRY_RUN=true ghcr.io/markdown-confluence/publish:latest
```

### GitHub Actions

**Example setup**

`.github/workflows/publish.yml`:

```yaml
name: Publish to Confluence
on: [push]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      - name: Publish Markdown to Confluence
        uses: markdown-confluence/publish@v1
        with:
          atlassianApiToken: ${{ secrets.ATLASSIAN_API_TOKEN }}
```

**With validation on pull requests**

```yaml
name: Publish to Confluence

on:
  pull_request:
    branches: ["main"]
    paths:
      - "docs/**/*.md"
  push:
    branches: ["main"]
    paths:
      - "docs/**/*.md"

jobs:
  validate:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Confluence Structure
        uses: markdown-confluence/publish@v1
        with:
          atlassianApiToken: ${{ secrets.ATLASSIAN_API_TOKEN }}
          validateOnly: true

  publish:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish to Confluence
        uses: markdown-confluence/publish@v1
        with:
          atlassianApiToken: ${{ secrets.ATLASSIAN_API_TOKEN }}
          generateManifest: true
```

**Environment Variables**

Add your API token as a secret in your GitHub repository settings:

1. Go to your repository's `Settings` tab.
2. Click on `Secrets` in the left sidebar.
3. Click on `New repository secret`.
4. Name it `ATLASSIAN_API_TOKEN` and enter your API token as the value.
5. Click on `Add secret`.

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `CONFLUENCE_BASE_URL` | Confluence instance URL |
| `CONFLUENCE_PARENT_ID` | Parent page ID |
| `ATLASSIAN_USERNAME` | Atlassian username/email |
| `ATLASSIAN_API_TOKEN` | Atlassian API token |
| `FOLDER_TO_PUBLISH` | Folder containing markdown files |
| `CONFLUENCE_CONTENT_ROOT` | Root directory for content |
| `CONFLUENCE_FIRST_HEADING_PAGE_TITLE` | Use first H1 as page title (true/false) |
| `CONFLUENCE_DRY_RUN` | Enable dry-run mode (true/false) |
| `CONFLUENCE_VALIDATE_ONLY` | Enable validation only mode (true/false) |
| `CONFLUENCE_GENERATE_MANIFEST` | Generate manifest after publishing (true/false) |
| `CONFLUENCE_MANIFEST_PATH` | Path for manifest file |
| `CONFLUENCE_CONFIG_FILE` | Path to config file |
