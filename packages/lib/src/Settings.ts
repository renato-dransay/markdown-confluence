export type MermaidRenderer = "none" | "puppeteer";

export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
	dryRun: boolean;
	validateOnly: boolean;
	generateManifest: boolean;
	manifestPath: string;
	mermaidRenderer: MermaidRenderer;
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceBaseUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	folderToPublish: "Confluence Pages",
	contentRoot: process.cwd(),
	firstHeadingPageTitle: false,
	dryRun: false,
	validateOnly: false,
	generateManifest: false,
	manifestPath: "confluence-manifest.json",
	mermaidRenderer: "none",
};
