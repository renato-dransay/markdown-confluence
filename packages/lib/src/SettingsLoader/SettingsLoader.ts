import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings";

export abstract class SettingsLoader {
	abstract loadPartial(): Partial<ConfluenceSettings>;

	load(): ConfluenceSettings {
		const initialSettings = this.loadPartial();
		const settings = this.validateSettings(initialSettings);
		return settings;
	}

	loadForValidationOnly(): ConfluenceSettings {
		const initialSettings = this.loadPartial();
		const settings = this.validateSettingsForValidation(initialSettings);
		return settings;
	}

	protected validateSettings(
		settings: Partial<ConfluenceSettings>,
	): ConfluenceSettings {
		if (settings.validateOnly) {
			return this.validateSettingsForValidation(settings);
		}

		if (!settings.confluenceBaseUrl) {
			throw new Error("Confluence base URL is required");
		}

		if (!settings.confluenceParentId) {
			throw new Error("Confluence parent ID is required");
		}

		if (!settings.atlassianUserName) {
			throw new Error("Atlassian user name is required");
		}

		if (!settings.atlassianApiToken) {
			throw new Error("Atlassian API token is required");
		}

		if (!settings.folderToPublish) {
			throw new Error("Folder to publish is required");
		}

		if (!settings.contentRoot) {
			throw new Error("Content root is required");
		} else {
			if (!settings.contentRoot.endsWith("/")) {
				settings.contentRoot += "/";
			}
		}

		if (!("firstHeadingPageTitle" in settings)) {
			settings.firstHeadingPageTitle = false;
		}

		if (!("dryRun" in settings)) {
			settings.dryRun = DEFAULT_SETTINGS.dryRun;
		}

		if (!("validateOnly" in settings)) {
			settings.validateOnly = DEFAULT_SETTINGS.validateOnly;
		}

		if (!("generateManifest" in settings)) {
			settings.generateManifest = DEFAULT_SETTINGS.generateManifest;
		}

		if (!settings.manifestPath) {
			settings.manifestPath = DEFAULT_SETTINGS.manifestPath;
		}

		return settings as ConfluenceSettings;
	}

	protected validateSettingsForValidation(
		settings: Partial<ConfluenceSettings>,
	): ConfluenceSettings {
		if (!settings.folderToPublish) {
			settings.folderToPublish = DEFAULT_SETTINGS.folderToPublish;
		}

		if (!settings.contentRoot) {
			settings.contentRoot = DEFAULT_SETTINGS.contentRoot;
		}

		if (!settings.contentRoot.endsWith("/")) {
			settings.contentRoot += "/";
		}

		if (!("firstHeadingPageTitle" in settings)) {
			settings.firstHeadingPageTitle = false;
		}

		if (!settings.confluenceBaseUrl) {
			settings.confluenceBaseUrl = "https://placeholder.atlassian.net";
		}

		return {
			...DEFAULT_SETTINGS,
			...settings,
			validateOnly: true,
		} as ConfluenceSettings;
	}
}
