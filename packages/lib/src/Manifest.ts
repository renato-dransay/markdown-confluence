import { ConfluenceAdfFile, UploadAdfFileResult } from "./Publisher";

export interface ManifestPage {
	source: string;
	confluenceId: string;
	title: string;
	url: string;
	contentType: string;
	lastPublished: string;
	result: {
		content: "same" | "updated";
		images: "same" | "updated";
		labels: "same" | "updated";
	};
}

export interface PublishingManifest {
	version: "1.0";
	generatedAt: string;
	confluenceBaseUrl: string;
	spaceKey: string;
	parentPageId: string;
	pages: ManifestPage[];
	summary: {
		total: number;
		updated: number;
		unchanged: number;
		failed: number;
	};
}

export function createManifest(
	results: Array<{
		successfulUploadResult?: UploadAdfFileResult;
		node: { file: ConfluenceAdfFile };
		reason?: string;
	}>,
	confluenceBaseUrl: string,
	spaceKey: string,
	parentPageId: string,
): PublishingManifest {
	const pages: ManifestPage[] = [];
	let updated = 0;
	let unchanged = 0;
	let failed = 0;

	for (const result of results) {
		if (result.successfulUploadResult) {
			const upload = result.successfulUploadResult;
			const wasUpdated =
				upload.contentResult === "updated" ||
				upload.imageResult === "updated" ||
				upload.labelResult === "updated";

			if (wasUpdated) {
				updated++;
			} else {
				unchanged++;
			}

			pages.push({
				source: upload.adfFile.absoluteFilePath,
				confluenceId: upload.adfFile.pageId,
				title: upload.adfFile.pageTitle,
				url: upload.adfFile.pageUrl,
				contentType: upload.adfFile.contentType,
				lastPublished: new Date().toISOString(),
				result: {
					content: upload.contentResult,
					images: upload.imageResult,
					labels: upload.labelResult,
				},
			});
		} else {
			failed++;
		}
	}

	return {
		version: "1.0",
		generatedAt: new Date().toISOString(),
		confluenceBaseUrl,
		spaceKey,
		parentPageId,
		pages,
		summary: {
			total: results.length,
			updated,
			unchanged,
			failed,
		},
	};
}

export function formatManifestSummary(manifest: PublishingManifest): string {
	const lines: string[] = [];

	lines.push(`\n=== Publishing Summary ===`);
	lines.push(`Generated at: ${manifest.generatedAt}`);
	lines.push(`Space: ${manifest.spaceKey}`);
	lines.push(`Parent Page ID: ${manifest.parentPageId}`);
	lines.push(``);
	lines.push(`Total pages: ${manifest.summary.total}`);
	lines.push(`  Updated: ${manifest.summary.updated}`);
	lines.push(`  Unchanged: ${manifest.summary.unchanged}`);
	lines.push(`  Failed: ${manifest.summary.failed}`);

	if (manifest.pages.length > 0) {
		lines.push(`\n--- Published Pages ---`);
		for (const page of manifest.pages) {
			const status =
				page.result.content === "updated" ||
				page.result.images === "updated" ||
				page.result.labels === "updated"
					? "UPDATED"
					: "UNCHANGED";
			lines.push(`[${status}] ${page.title}`);
			lines.push(`  Source: ${page.source}`);
			lines.push(`  URL: ${page.url}`);
		}
	}

	return lines.join("\n");
}
