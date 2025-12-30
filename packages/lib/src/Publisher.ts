import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { AlwaysADFProcessingPlugins } from "./ADFProcessingPlugins";
import {
	ADFProcessingPlugin,
	createPublisherFunctions,
	executeADFProcessingPipeline,
} from "./ADFProcessingPlugins/types";
import { adfEqual } from "./AdfEqual";
import { CurrentAttachments } from "./Attachments";
import { PageContentType } from "./ConniePageConfig";
import { SettingsLoader } from "./SettingsLoader";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import {
	createFolderStructure as createLocalAdfTree,
	createFolderStructureWithValidation,
} from "./TreeLocal";
import { LoaderAdaptor, RequiredConfluenceClient } from "./adaptors";
import { isEqual } from "./isEqual";
import { ValidationResult, formatValidationResult } from "./Validator";

export interface LocalAdfFileTreeNode {
	name: string;
	children: LocalAdfFileTreeNode[];
	file?: LocalAdfFile;
}

export interface FilePublishResult {
	successfulUploadResult?: UploadAdfFileResult;
	node: ConfluenceNode;
	reason?: string;
}

export interface LocalAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	pageId: string | undefined;
	dontChangeParentPageId: boolean;
	contentType: PageContentType;
	blogPostDate: string | undefined;
}

export interface ConfluenceAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	dontChangeParentPageId: boolean;

	pageId: string;
	spaceKey: string;
	pageUrl: string;

	contentType: PageContentType;
	blogPostDate: string | undefined;
}

interface ConfluencePageExistingData {
	adfContent: JSONDocNode;
	pageTitle: string;
	ancestors: { id: string }[];
	contentType: string;
}

export interface ConfluenceNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	ancestors: string[];
}

export interface ConfluenceTreeNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
	adfFile: ConfluenceAdfFile;
	contentResult: "same" | "updated";
	imageResult: "same" | "updated";
	labelResult: "same" | "updated";
}

export interface DryRunResult {
	validation: ValidationResult;
	pages: DryRunPage[];
	summary: {
		total: number;
		wouldCreate: number;
		wouldUpdate: number;
		unchanged: number;
	};
}

export interface DryRunPage {
	source: string;
	title: string;
	action: "create" | "update" | "unchanged";
	confluenceId?: string;
	reason?: string;
}

export class Publisher {
	private confluenceClient: RequiredConfluenceClient;
	private adaptor: LoaderAdaptor;
	private myAccountId: string | undefined;
	private settingsLoader: SettingsLoader;
	private adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[];

	constructor(
		adaptor: LoaderAdaptor,
		settingsLoader: SettingsLoader,
		confluenceClient: RequiredConfluenceClient,
		adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[],
	) {
		this.adaptor = adaptor;
		this.settingsLoader = settingsLoader;

		this.confluenceClient = confluenceClient;
		this.adfProcessingPlugins = adfProcessingPlugins.concat(
			AlwaysADFProcessingPlugins,
		);
	}

	async validate(): Promise<ValidationResult> {
		const settings = this.settingsLoader.load();
		const files = await this.adaptor.getMarkdownFilesToUpload();
		const result = createFolderStructureWithValidation(files, settings);
		return result.validation;
	}

	async dryRun(): Promise<DryRunResult> {
		const settings = this.settingsLoader.load();

		const files = await this.adaptor.getMarkdownFilesToUpload();
		const result = createFolderStructureWithValidation(files, settings);

		if (!result.validation.valid) {
			return {
				validation: result.validation,
				pages: [],
				summary: {
					total: result.validation.summary.totalFiles,
					wouldCreate: 0,
					wouldUpdate: 0,
					unchanged: 0,
				},
			};
		}

		if (!this.myAccountId) {
			const currentUser =
				await this.confluenceClient.users.getCurrentUser();
			this.myAccountId = currentUser.accountId;
		}

		const parentPage = await this.confluenceClient.content.getContentById({
			id: settings.confluenceParentId,
			expand: ["body.atlas_doc_format", "space"],
		});
		if (!parentPage.space) {
			throw new Error("Missing Space Key");
		}

		const spaceToPublishTo = parentPage.space;

		const confluencePagesToPublish = await ensureAllFilesExistInConfluence(
			this.confluenceClient,
			this.adaptor,
			result.tree,
			spaceToPublishTo.key,
			parentPage.id,
			parentPage.id,
			settings,
		);

		const pages: DryRunPage[] = [];
		let wouldCreate = 0;
		let wouldUpdate = 0;
		let unchanged = 0;

		for (const node of confluencePagesToPublish) {
			const existingContent = node.existingPageData.adfContent;
			const newContent = node.file.contents;

			const hasExistingContent =
				existingContent &&
				existingContent.content &&
				existingContent.content.length > 0;

			const isBlankPage =
				hasExistingContent &&
				existingContent.content.length === 1 &&
				existingContent.content[0]?.type === "paragraph" &&
				existingContent.content[0]?.content?.[0]?.text ===
					"Page not published yet";

			if (isBlankPage) {
				wouldCreate++;
				pages.push({
					source: node.file.absoluteFilePath,
					title: node.file.pageTitle,
					action: "create",
					confluenceId: node.file.pageId,
					reason: "New page (placeholder exists)",
				});
			} else if (!adfEqual(existingContent, newContent)) {
				wouldUpdate++;
				pages.push({
					source: node.file.absoluteFilePath,
					title: node.file.pageTitle,
					action: "update",
					confluenceId: node.file.pageId,
					reason: "Content changed",
				});
			} else {
				unchanged++;
				pages.push({
					source: node.file.absoluteFilePath,
					title: node.file.pageTitle,
					action: "unchanged",
					confluenceId: node.file.pageId,
				});
			}
		}

		return {
			validation: result.validation,
			pages,
			summary: {
				total: confluencePagesToPublish.length,
				wouldCreate,
				wouldUpdate,
				unchanged,
			},
		};
	}

	async publish(publishFilter?: string): Promise<FilePublishResult[]> {
		const settings = this.settingsLoader.load();

		if (!this.myAccountId) {
			const currentUser =
				await this.confluenceClient.users.getCurrentUser();
			this.myAccountId = currentUser.accountId;
		}

		const parentPage = await this.confluenceClient.content.getContentById({
			id: settings.confluenceParentId,
			expand: ["body.atlas_doc_format", "space"],
		});
		if (!parentPage.space) {
			throw new Error("Missing Space Key");
		}

		const spaceToPublishTo = parentPage.space;

		const files = await this.adaptor.getMarkdownFilesToUpload();
		const folderTree = createLocalAdfTree(files, settings);
		let confluencePagesToPublish = await ensureAllFilesExistInConfluence(
			this.confluenceClient,
			this.adaptor,
			folderTree,
			spaceToPublishTo.key,
			parentPage.id,
			parentPage.id,
			settings,
		);

		if (publishFilter) {
			confluencePagesToPublish = confluencePagesToPublish.filter(
				(file) => file.file.absoluteFilePath === publishFilter,
			);
		}

		const adrFileTasks = confluencePagesToPublish.map((file) => {
			return this.publishFile(file);
		});

		const adrFiles = await Promise.all(adrFileTasks);
		return adrFiles;
	}

	private async publishFile(
		node: ConfluenceNode,
	): Promise<FilePublishResult> {
		try {
			const successfulUploadResult = await this.updatePageContent(
				node.ancestors,
				node.version,
				node.existingPageData,
				node.file,
				node.lastUpdatedBy,
			);

			return {
				node,
				successfulUploadResult,
			};
		} catch (e: unknown) {
			if (e instanceof Error) {
				return {
					node,
					reason: this.formatError(e, node.file),
				};
			}

			return {
				node,
				reason: JSON.stringify(e),
			};
		}
	}

	private formatError(error: Error, file: ConfluenceAdfFile): string {
		const baseMessage = error.message;

		if (baseMessage.includes("last updated by another user")) {
			return `Page "${file.pageTitle}" was modified by another user since last sync. Manual review required.`;
		}

		if (baseMessage.includes("Cannot convert between content types")) {
			return `Cannot change content type for "${file.pageTitle}". ${baseMessage}`;
		}

		if (baseMessage.includes("is trying to overwrite a page outside")) {
			return `Page "${file.pageTitle}" would overwrite an existing page outside your publish tree. Check if this title already exists in the space.`;
		}

		return `Failed to publish "${file.pageTitle}": ${baseMessage}`;
	}

	private async updatePageContent(
		ancestors: string[],
		pageVersionNumber: number,
		existingPageData: ConfluencePageExistingData,
		adfFile: ConfluenceAdfFile,
		lastUpdatedBy: string,
	): Promise<UploadAdfFileResult> {
		if (lastUpdatedBy !== this.myAccountId) {
			throw new Error(
				`Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`,
			);
		}
		if (existingPageData.contentType !== adfFile.contentType) {
			throw new Error(
				`Cannot convert between content types. From ${existingPageData.contentType} to ${adfFile.contentType}`,
			);
		}

		const result: UploadAdfFileResult = {
			adfFile,
			contentResult: "same",
			imageResult: "same",
			labelResult: "same",
		};

		const currentUploadedAttachments =
			await this.confluenceClient.contentAttachments.getAttachments({
				id: adfFile.pageId,
			});

		const currentAttachments: CurrentAttachments =
			currentUploadedAttachments.results.reduce((prev, curr) => {
				return {
					...prev,
					[`${curr.title}`]: {
						filehash: curr.metadata.comment,
						attachmentId: curr.extensions.fileId,
						collectionName: curr.extensions.collectionName,
					},
				};
			}, {});

		const supportFunctions = createPublisherFunctions(
			this.confluenceClient,
			this.adaptor,
			adfFile.pageId,
			adfFile.absoluteFilePath,
			currentAttachments,
		);
		const adfToUpload = await executeADFProcessingPipeline(
			this.adfProcessingPlugins,
			adfFile.contents,
			supportFunctions,
		);

		result.imageResult = "updated";

		const existingPageDetails = {
			title: existingPageData.pageTitle,
			type: existingPageData.contentType,
			...(adfFile.contentType === "blogpost" ||
			adfFile.dontChangeParentPageId
				? {}
				: { ancestors: existingPageData.ancestors }),
		};

		const newPageDetails = {
			title: adfFile.pageTitle,
			type: adfFile.contentType,
			...(adfFile.contentType === "blogpost" ||
			adfFile.dontChangeParentPageId
				? {}
				: {
						ancestors: ancestors.map((ancestor) => ({
							id: ancestor,
						})),
				  }),
		};

		if (
			!adfEqual(existingPageData.adfContent, adfToUpload) ||
			!isEqual(existingPageDetails, newPageDetails)
		) {
			result.contentResult = "updated";

			const updateContentDetails = {
				...newPageDetails,
				id: adfFile.pageId,
				version: { number: pageVersionNumber + 1 },
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: JSON.stringify(adfToUpload),
						representation: "atlas_doc_format",
					},
				},
			};
			await this.confluenceClient.content.updateContent(
				updateContentDetails,
			);
		}

		const getLabelsForContent = {
			id: adfFile.pageId,
		};
		const currentLabels =
			await this.confluenceClient.contentLabels.getLabelsForContent(
				getLabelsForContent,
			);

		for (const existingLabel of currentLabels.results) {
			if (!adfFile.tags.includes(existingLabel.label)) {
				result.labelResult = "updated";
				await this.confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter(
					{
						id: adfFile.pageId,
						name: existingLabel.name,
					},
				);
			}
		}

		const labelsToAdd = [];
		for (const newLabel of adfFile.tags) {
			if (
				currentLabels.results.findIndex(
					(item) => item.label === newLabel,
				) === -1
			) {
				labelsToAdd.push({
					prefix: "global",
					name: newLabel,
				});
			}
		}

		if (labelsToAdd.length > 0) {
			result.labelResult = "updated";
			await this.confluenceClient.contentLabels.addLabelsToContent({
				id: adfFile.pageId,
				body: labelsToAdd,
			});
		}

		return result;
	}
}

export function formatDryRunResult(result: DryRunResult): string {
	const lines: string[] = [];

	lines.push(`\n=== Dry Run Summary ===`);

	if (!result.validation.valid) {
		lines.push(`\nValidation FAILED - cannot proceed with publishing`);
		lines.push(formatValidationResult(result.validation));
		return lines.join("\n");
	}

	lines.push(`Validation: PASSED`);
	lines.push(`\nPages to process: ${result.summary.total}`);
	lines.push(`  Would create: ${result.summary.wouldCreate}`);
	lines.push(`  Would update: ${result.summary.wouldUpdate}`);
	lines.push(`  Unchanged: ${result.summary.unchanged}`);

	if (result.pages.length > 0) {
		lines.push(`\n--- Page Details ---`);

		const creates = result.pages.filter((p) => p.action === "create");
		const updates = result.pages.filter((p) => p.action === "update");
		const unchanged = result.pages.filter((p) => p.action === "unchanged");

		if (creates.length > 0) {
			lines.push(`\nWould CREATE:`);
			for (const page of creates) {
				lines.push(`  + ${page.title}`);
				lines.push(`    Source: ${page.source}`);
			}
		}

		if (updates.length > 0) {
			lines.push(`\nWould UPDATE:`);
			for (const page of updates) {
				lines.push(`  ~ ${page.title}`);
				lines.push(`    Source: ${page.source}`);
				lines.push(`    Confluence ID: ${page.confluenceId}`);
			}
		}

		if (unchanged.length > 0) {
			lines.push(`\nUNCHANGED:`);
			for (const page of unchanged) {
				lines.push(`  = ${page.title}`);
			}
		}
	}

	return lines.join("\n");
}
