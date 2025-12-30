import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";

export class EnvironmentVariableSettingsLoader extends SettingsLoader {
	getValue<T extends keyof ConfluenceSettings>(
		propertyKey: T,
		envVar: string,
	): Partial<ConfluenceSettings> {
		const value = process.env[envVar];
		return value ? { [propertyKey]: value } : {};
	}

	getBooleanValue<T extends keyof ConfluenceSettings>(
		propertyKey: T,
		envVar: string,
	): Partial<ConfluenceSettings> {
		const value = process.env[envVar];
		if (value === undefined) {
			return {};
		}
		return { [propertyKey]: value === "true" };
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return {
			...this.getValue("confluenceBaseUrl", "CONFLUENCE_BASE_URL"),
			...this.getValue("confluenceParentId", "CONFLUENCE_PARENT_ID"),
			...this.getValue("atlassianUserName", "ATLASSIAN_USERNAME"),
			...this.getValue("atlassianApiToken", "ATLASSIAN_API_TOKEN"),
			...this.getValue("folderToPublish", "FOLDER_TO_PUBLISH"),
			...this.getValue("contentRoot", "CONFLUENCE_CONTENT_ROOT"),
			...this.getBooleanValue(
				"firstHeadingPageTitle",
				"CONFLUENCE_FIRST_HEADING_PAGE_TITLE",
			),
			...this.getBooleanValue("dryRun", "CONFLUENCE_DRY_RUN"),
			...this.getBooleanValue("validateOnly", "CONFLUENCE_VALIDATE_ONLY"),
			...this.getBooleanValue(
				"generateManifest",
				"CONFLUENCE_GENERATE_MANIFEST",
			),
			...this.getValue("manifestPath", "CONFLUENCE_MANIFEST_PATH"),
		};
	}
}
