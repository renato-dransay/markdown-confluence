import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import { adfEqual, marksEqual } from "./AdfEqual";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import { heading, li, ol, p, text } from "@atlaskit/adf-utils/builders";
import { v4 as uuidv4 } from "uuid";
import { TextDefinition } from "@atlaskit/adf-schema";

type ExtractedInlineComment = {
	pluginInternalId: string;
	inlineCommentId: string;
	textForComment: string | undefined;
	beforeText: string;
	afterText: string;
};

type PossibleMatchForInlineComment = {
	pluginInternalId: string;
	inlineCommentId: string;
	textForComment: string | undefined;
	beforeTextOutsideMyNode: string;
	afterTextOutsideMyNode: string;
	beforeTextMyNode: string;
	afterTextMyNode: string;
	myParentNode: ADFEntity | undefined;
	myNode: ADFEntity | undefined;
	commentStart: number;
	commentEnd: number;
};

export function prepareAdfToUpload(
	confluencePagesToPublish: ConfluenceNode[],
	settings: ConfluenceSettings,
) {
	const fileToPageIdMap: Record<string, ConfluenceAdfFile> = {};

	confluencePagesToPublish.forEach((node) => {
		// Use absoluteFilePath (relative path from content root) as the key
		// This allows proper resolution of path-based links
		const normalizedPath = normalizeFilePath(node.file.absoluteFilePath);
		fileToPageIdMap[normalizedPath] = node.file;

		// Also add by filename for backward compatibility with simple wikilinks
		fileToPageIdMap[node.file.fileName] = node.file;

		// Add by page title for wikilinks that use the page title
		// e.g., [[Standards]] should match a page with title "Standards"
		if (node.file.pageTitle) {
			fileToPageIdMap[node.file.pageTitle] = node.file;
		}
	});

	confluencePagesToPublish.forEach((confluenceNode) => {
		let result = confluenceNode.file.contents;

		if (result.content.length === 0) {
			result.content = [p()];
		}

		result = processLinksToConfluence(
			confluenceNode.file.absoluteFilePath,
			result,
			fileToPageIdMap,
			settings,
		);

		result = mergeTextNodes(result);

		const pageInlineComments = extractInlineComments(
			confluenceNode.existingPageData.adfContent,
		);

		result = applyInlineComments(result, pageInlineComments);

		confluenceNode.file.contents = result;
	});
}

function applyInlineComments(
	adf: JSONDocNode,
	pageInlineComments: ExtractedInlineComment[],
) {
	const unfoundInlineComments: ExtractedInlineComment[] = [];
	let result = adf;

	for (const comment of pageInlineComments) {
		const commentOptions: PossibleMatchForInlineComment[] = [];
		traverse(result, {
			any: (node) => {
				if (!node.content) {
					return;
				}
				for (
					let nodeIndex = 0;
					nodeIndex < node.content.length;
					nodeIndex++
				) {
					const child = node.content[nodeIndex];
					if (
						node.content &&
						child &&
						child.type === "text" &&
						child.text &&
						comment.textForComment &&
						child.text.includes(comment.textForComment)
					) {
						const beforeNodes: (ADFEntity | undefined)[] = [],
							afterNodes: (ADFEntity | undefined)[] = [];

						node.content?.forEach((siblingContent, index) => {
							if (nodeIndex > index) {
								beforeNodes.push(siblingContent);
							} else if (nodeIndex < index) {
								afterNodes.push(siblingContent);
							}
						});

						const beforeText = beforeNodes.reduce((prev, curr) => {
							return prev + curr?.text;
						}, "");

						const afterText = afterNodes.reduce((prev, curr) => {
							return prev + curr?.text;
						}, "");

						let index = 0;

						const childText = child.text ?? "";
						while (
							(index = childText.indexOf(
								comment.textForComment,
								index,
							)) !== -1
						) {
							const beforeTextMyNode = childText.slice(0, index);
							const afterTextMyNode = childText.slice(
								index + comment.textForComment.length,
							);

							const found: PossibleMatchForInlineComment = {
								pluginInternalId: comment.pluginInternalId,
								inlineCommentId: comment.inlineCommentId,
								beforeTextOutsideMyNode: beforeText,
								afterTextOutsideMyNode: afterText,
								myParentNode: node,
								myNode: child,
								beforeTextMyNode,
								textForComment: comment.textForComment,
								afterTextMyNode,
								commentStart: index,
								commentEnd:
									index + comment.textForComment.length,
							};

							commentOptions.push(found);

							index += comment.textForComment.length;
						}
					}
				}
			},
		});

		const whereToApplyComment = pickBestMatchForComment(
			comment,
			commentOptions,
		);
		if (
			whereToApplyComment?.myNode &&
			whereToApplyComment?.myNode !== undefined
		) {
			let appliedComment = false;
			result = traverse(result, {
				any: (node, _parent) => {
					if (!node.content || appliedComment) {
						return;
					}
					const newContent: (ADFEntity | undefined)[] = [];
					for (
						let nodeIndex = 0;
						nodeIndex < node.content.length;
						nodeIndex++
					) {
						const child = node.content[nodeIndex];
						if (
							node.content &&
							child &&
							child.type === "text" &&
							child.text &&
							whereToApplyComment?.myNode &&
							whereToApplyComment?.myParentNode &&
							adfEqual(whereToApplyComment.myNode, child) &&
							adfEqual(whereToApplyComment.myParentNode, node)
						) {
							appliedComment = true;
							const beforeText = child.text.slice(
								0,
								whereToApplyComment.commentStart,
							);
							const afterText = child.text.slice(
								whereToApplyComment.commentEnd,
								child.text.length,
							);

							if (beforeText) {
								newContent.push({
									...child,
									text: beforeText,
								});
							}

							newContent.push({
								...child,
								...(comment.textForComment
									? { text: comment.textForComment }
									: undefined),
								marks: [
									...(child.marks ? child.marks : []),
									{
										type: "annotation",
										attrs: {
											annotationType: "inlineComment",
											id: comment.inlineCommentId,
										},
									},
								],
							});

							newContent.push({
								...child,
								text: afterText,
							});
						} else {
							newContent.push(child);
						}
					}

					if (newContent.length > 0) {
						node.content = newContent;
					}

					return node;
				},
			}) as JSONDocNode;

			if (!appliedComment) {
				unfoundInlineComments.push(comment);
			}
		} else {
			unfoundInlineComments.push(comment);
		}
	}

	if (unfoundInlineComments.length > 0) {
		const comments = [
			heading({ level: 1 })(
				text("Inline comments that couldn't be mapped"),
			),
			ol({ order: 1 })(
				...unfoundInlineComments.map((item) =>
					li([
						p(
							commentedText(
								item.textForComment ?? "",
								item.inlineCommentId,
							),
						),
					]),
				),
			),
		];

		comments.forEach((item) => result.content.push(item));
	}

	return result;
}

function commentedText(text: string, inlineCommentId: string): TextDefinition {
	return {
		type: "text",
		text: text,
		marks: [
			{
				type: "annotation",
				attrs: {
					annotationType: "inlineComment",
					id: inlineCommentId,
				},
			},
		],
	};
}

function pickBestMatchForComment(
	inlineComment: ExtractedInlineComment,
	possibleMatchsForInlineComment: PossibleMatchForInlineComment[],
): PossibleMatchForInlineComment | undefined {
	if (possibleMatchsForInlineComment.length === 0) {
		return undefined;
	}

	const exactMatch = possibleMatchsForInlineComment.find(
		(possibleSpot) =>
			inlineComment.beforeText ===
				possibleSpot.beforeTextOutsideMyNode +
					possibleSpot.beforeTextMyNode &&
			inlineComment.afterText ===
				possibleSpot.afterTextMyNode +
					possibleSpot.afterTextOutsideMyNode,
	);
	if (exactMatch) {
		return exactMatch;
	}

	const distancesBeforeAfter: {
		possibleSpot: PossibleMatchForInlineComment;
		beforeTextDistance: number;
		afterTextDistance: number;
	}[] = [];
	for (
		let index = 0;
		index < possibleMatchsForInlineComment.length;
		index++
	) {
		const possibleSpot = possibleMatchsForInlineComment[index];
		if (!possibleSpot) {
			continue;
		}

		const beforeText =
			possibleSpot.beforeTextOutsideMyNode +
			possibleSpot.beforeTextMyNode;
		const afterText =
			possibleSpot.afterTextMyNode + possibleSpot.afterTextOutsideMyNode;
		if (
			(inlineComment.beforeText.length > 0 &&
				beforeText.length > 0 &&
				isSpecialCharacter(
					inlineComment.beforeText.charAt(
						inlineComment.beforeText.length - 1,
					),
				) !==
					isSpecialCharacter(
						beforeText.charAt(beforeText.length - 1),
					)) ||
			(inlineComment.afterText.length > 0 &&
				afterText.length > 0 &&
				isSpecialCharacter(inlineComment.afterText.charAt(0)) !==
					isSpecialCharacter(afterText.charAt(0)))
		) {
			continue;
		}

		const beforeTextDistance = levenshteinDistance(
			inlineComment.beforeText,
			beforeText,
		);
		const afterTextDistance = levenshteinDistance(
			inlineComment.afterText,
			afterText,
		);

		if (beforeTextDistance > 40 && afterTextDistance > 40) {
			continue;
		}

		distancesBeforeAfter.push({
			possibleSpot,
			beforeTextDistance,
			afterTextDistance,
		});
	}
	const sortedDistances = distancesBeforeAfter.sort((a, b) => {
		const minDistanceA = Math.min(
			a.beforeTextDistance,
			a.afterTextDistance,
		);
		const minDistanceB = Math.min(
			b.beforeTextDistance,
			b.afterTextDistance,
		);

		return minDistanceA - minDistanceB;
	});

	if (sortedDistances.length > 1) {
		return sortedDistances.at(0)?.possibleSpot;
	}

	const distancesBeforeAfterWords: {
		possibleSpot: PossibleMatchForInlineComment;
		beforeTextDistance: number;
		afterTextDistance: number;
	}[] = [];
	// Look at words immediately around comment to see if multiple match
	for (
		let index = 0;
		index < possibleMatchsForInlineComment.length;
		index++
	) {
		const possibleSpot = possibleMatchsForInlineComment[index];
		if (!possibleSpot) {
			continue;
		}

		const beforeText =
			possibleSpot.beforeTextOutsideMyNode +
			possibleSpot.beforeTextMyNode;
		const afterText =
			possibleSpot.afterTextMyNode + possibleSpot.afterTextOutsideMyNode;
		if (
			(inlineComment.beforeText.length > 0 &&
				beforeText.length > 0 &&
				isSpecialCharacter(
					inlineComment.beforeText.charAt(
						inlineComment.beforeText.length - 1,
					),
				) !==
					isSpecialCharacter(
						beforeText.charAt(beforeText.length - 1),
					)) ||
			(inlineComment.afterText.length > 0 &&
				afterText.length > 0 &&
				isSpecialCharacter(inlineComment.afterText.charAt(0)) !==
					isSpecialCharacter(afterText.charAt(0)))
		) {
			continue;
		}

		const wordsFromBeforeText = getStringAfterXSpace(beforeText, 2);
		const wordsFromAfterText = getStringBeforeXSpace(afterText, 2);

		const wordsBeforeComment = getStringAfterXSpace(
			inlineComment.beforeText,
			2,
		);
		const wordsAfterComment = getStringBeforeXSpace(
			inlineComment.afterText,
			2,
		);

		const minBefore = Math.min(
			wordsBeforeComment.length,
			wordsFromBeforeText.length,
		);
		const minAfter = Math.min(
			wordsAfterComment.length,
			wordsFromAfterText.length,
		);

		const trimmedWordsFromAfterText = wordsFromAfterText.substring(
			0,
			minAfter,
		);
		const trimmedWordsAfterComment = wordsAfterComment.substring(
			0,
			minAfter,
		);

		const trimmedWordsFromBeforeText = wordsFromBeforeText.substring(
			wordsFromBeforeText.length - minBefore,
			wordsFromBeforeText.length,
		);
		const trimmedWordsBeforeComment = wordsBeforeComment.substring(
			wordsBeforeComment.length - minBefore,
			wordsBeforeComment.length,
		);

		const beforeTextDistance = levenshteinDistance(
			trimmedWordsFromBeforeText,
			trimmedWordsBeforeComment,
		);
		const afterTextDistance = levenshteinDistance(
			trimmedWordsFromAfterText,
			trimmedWordsAfterComment,
		);

		if (
			beforeTextDistance > minBefore / 2 &&
			afterTextDistance > minAfter / 2
		) {
			continue;
		}

		distancesBeforeAfterWords.push({
			possibleSpot,
			beforeTextDistance,
			afterTextDistance,
		});
	}
	const sortedDistancesWords = distancesBeforeAfterWords.sort((a, b) => {
		const minDistanceA = Math.min(
			a.beforeTextDistance,
			a.afterTextDistance,
		);
		const minDistanceB = Math.min(
			b.beforeTextDistance,
			b.afterTextDistance,
		);

		return minDistanceA - minDistanceB;
	});

	if (sortedDistancesWords.length > 0) {
		return sortedDistancesWords.at(0)?.possibleSpot;
	}

	return undefined;
}

function getStringBeforeXSpace(str: string, numOfSpaces: number): string {
	if (numOfSpaces < 0) {
		throw new Error("The number of spaces should be non-negative.");
	}

	// Find the index where contiguous special characters and spaces end
	const startOfActualString = str.search(/\w/);

	// Check if the number of spaces is 0, then return the whole string
	if (numOfSpaces === 0) {
		return str;
	}

	let count = 0;
	let lastIndex = -1;

	for (let i = startOfActualString; i < str.length; i++) {
		if (str[i] === " ") {
			count++;
			if (count === numOfSpaces) {
				lastIndex = i;
				break;
			}
		}
	}

	if (lastIndex === -1) {
		return str;
	}

	return str.substring(0, lastIndex);
}

function getStringAfterXSpace(str: string, numOfSpaces: number): string {
	if (numOfSpaces < 0) {
		throw new Error("The number of spaces should be non-negative.");
	}

	// Find the index where contiguous special characters and spaces end at the end of the string
	const endOfActualString = str.search(/(\w)[^\w]*$/);

	// Check if the number of spaces is 0, then return the whole string
	if (numOfSpaces === 0) {
		return str;
	}

	let count = 0;
	let startIndex = -1;

	for (let i = endOfActualString; i >= 0; i--) {
		if (str[i] === " ") {
			count++;
			if (count === numOfSpaces) {
				startIndex = i;
				break;
			}
		}
	}

	if (startIndex === -1) {
		return str;
	}

	return str.substring(startIndex + 1);
}

function isSpecialCharacter(char: string): boolean {
	// The regex pattern checks if the character is not a letter, number, or underscore
	// \p{L} matches any kind of letter from any language
	// \p{N} matches any kind of numeric character in any script
	// \p{M} matches a character intended to be combined with another character (e.g. accents, umlauts, etc.)
	const regex = /[^\p{L}\p{N}\p{M}_]/u;
	return regex.test(char);
}

function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
		i,
	]);
	matrix[0] = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			// @ts-expect-error
			matrix[i][j] = Math.min(
				// @ts-expect-error
				matrix[i - 1][j] + 1,
				// @ts-expect-error
				matrix[i][j - 1] + 1,
				// @ts-expect-error
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	// @ts-expect-error
	return matrix[a.length][b.length];
}

function extractInlineComments(adf: JSONDocNode) {
	const result: ExtractedInlineComment[] = [];
	traverse(adf, {
		text: (node, parent, nodeIndex) => {
			if (
				parent.node &&
				node.marks &&
				node.marks.some(
					(mark) =>
						mark.type === "annotation" &&
						mark.attrs?.["annotationType"] === "inlineComment",
				)
			) {
				const inlineCommentMark = node.marks?.find(
					(mark) =>
						mark.type === "annotation" &&
						mark.attrs?.["annotationType"] === "inlineComment",
				);
				const beforeNodes: (ADFEntity | undefined)[] = [],
					afterNodes: (ADFEntity | undefined)[] = [];

				parent.node.content?.forEach((siblingContent, index) => {
					if (nodeIndex > index) {
						beforeNodes.push(siblingContent);
					} else if (nodeIndex < index) {
						afterNodes.push(siblingContent);
					}
				});

				const beforeText = beforeNodes.reduce((prev, curr) => {
					return prev + curr?.text;
				}, "");

				const afterText = afterNodes.reduce((prev, curr) => {
					return prev + curr?.text;
				}, "");

				const extract: ExtractedInlineComment = {
					pluginInternalId: uuidv4(),
					inlineCommentId: inlineCommentMark?.attrs?.["id"],
					textForComment: node.text,
					beforeText,
					afterText,
				};

				result.push(extract);
			}
		},
	});
	return result;
}

/**
 * Normalizes a file path for consistent lookup in the file map.
 * Removes leading slashes and ensures consistent format.
 */
function normalizeFilePath(filePath: string): string {
	// Remove leading slash if present
	let normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
	// Ensure .md extension
	if (!normalized.endsWith(".md")) {
		normalized = `${normalized}.md`;
	}
	return normalized;
}

/**
 * Resolves a link path relative to the current file's location.
 * Handles:
 * - Page titles (e.g., "Standards" -> page with title "Standards")
 * - Absolute paths from content root (e.g., "features/search/README")
 * - Relative paths (e.g., "../README")
 * - Simple filenames (e.g., "README")
 */
function resolveLinkPath(
	linkPath: string,
	currentFilePath: string,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
): ConfluenceAdfFile | undefined {
	// Normalize the link path
	let normalizedLink = linkPath;

	// Remove .md extension if present (we'll add it back for path-based lookups)
	if (normalizedLink.endsWith(".md")) {
		normalizedLink = normalizedLink.slice(0, -3);
	}

	// Get the directory of the current file
	const currentDir = currentFilePath.replace(/\/[^/]+$/, "") || "";

	// Try different resolution strategies in order of precedence:

	// 1. Try as a page title first (most common for wikilinks like [[Standards]])
	if (fileToPageIdMap[normalizedLink]) {
		return fileToPageIdMap[normalizedLink];
	}

	// 2. Try as an absolute path from content root
	const absolutePath = normalizeFilePath(normalizedLink);
	if (fileToPageIdMap[absolutePath]) {
		return fileToPageIdMap[absolutePath];
	}

	// 3. Try as a relative path from the current file's directory
	if (currentDir) {
		const relativePath = normalizeFilePath(
			resolvePath(currentDir, normalizedLink),
		);
		if (fileToPageIdMap[relativePath]) {
			return fileToPageIdMap[relativePath];
		}
	}

	// 4. Try just the filename (backward compatibility)
	const fileName = normalizedLink.split("/").pop() + ".md";
	if (fileToPageIdMap[fileName]) {
		return fileToPageIdMap[fileName];
	}

	return undefined;
}

/**
 * Simple path resolution for relative paths.
 * Handles .. and . segments.
 */
function resolvePath(basePath: string, relativePath: string): string {
	// Handle absolute paths
	if (relativePath.startsWith("/")) {
		return relativePath;
	}

	const baseParts = basePath.split("/").filter(Boolean);
	const relativeParts = relativePath.split("/");

	for (const part of relativeParts) {
		if (part === "..") {
			baseParts.pop();
		} else if (part !== "." && part !== "") {
			baseParts.push(part);
		}
	}

	return baseParts.join("/");
}

/**
 * Processes all links in the ADF document and converts them to Confluence URLs.
 * Handles:
 * - Wikilinks: [[PageName]] or [[path/to/Page]]
 * - Standard markdown links: [text](path/to/page.md) or [text](../relative/path.md)
 * - Mentions: [[mention:user-id]]
 */
function processLinksToConfluence(
	currentFilePath: string,
	adf: JSONDocNode,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings,
) {
	return traverse(adf, {
		text: (node, _parent) => {
			if (
				node.marks &&
				node.marks[0] &&
				node.marks[0].type === "link" &&
				node.marks[0].attrs
			) {
				const href = node.marks[0].attrs["href"];
				if (typeof href !== "string") {
					return;
				}

				// Handle wikilinks (wikilinks:PageName or wikilinks:path/to/Page)
				if (href.startsWith("wikilink")) {
					return processWikilink(
						node,
						href,
						currentFilePath,
						fileToPageIdMap,
						settings,
					);
				}

				// Handle mentions
				if (href.startsWith("mention:")) {
					const mentionUrl = new URL(href);
					node = {
						type: "mention",
						attrs: {
							id: decodeURI(mentionUrl.pathname),
							text: node.text,
						},
					};
					return node;
				}

				// Handle standard markdown relative links
				if (isRelativeMarkdownLink(href)) {
					return processRelativeLink(
						node,
						href,
						currentFilePath,
						fileToPageIdMap,
						settings,
					);
				}
			}
			return;
		},
	}) as JSONDocNode;
}

/**
 * Checks if a link is a relative markdown link (not external URL).
 */
function isRelativeMarkdownLink(href: string): boolean {
	// Skip external URLs
	if (
		href.startsWith("http://") ||
		href.startsWith("https://") ||
		href.startsWith("mailto:") ||
		href.startsWith("#")
	) {
		return false;
	}

	// Check if it looks like a path to a markdown file
	return (
		href.endsWith(".md") ||
		href.includes(".md#") ||
		// Paths without extension that look like relative paths
		href.startsWith("./") ||
		href.startsWith("../") ||
		(!href.includes("://") && !href.startsWith("#"))
	);
}

/**
 * Processes a wikilink and converts it to a Confluence URL.
 */
function processWikilink(
	node: ADFEntity,
	href: string,
	currentFilePath: string,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings,
): ADFEntity {
	const wikilinkUrl = new URL(href);
	const pathName = decodeURI(wikilinkUrl.pathname);

	// If pathname is empty, it's a self-reference
	if (wikilinkUrl.pathname === "") {
		const currentFile = resolveLinkPath(
			currentFilePath.replace(/\.md$/, ""),
			currentFilePath,
			fileToPageIdMap,
		);
		if (currentFile) {
			return createConfluenceLink(
				node,
				currentFile,
				wikilinkUrl.hash,
				pathName,
				settings,
			);
		}
		return removeLink(node);
	}

	// Try to resolve the wikilink path
	const linkPage = resolveLinkPath(
		pathName,
		currentFilePath,
		fileToPageIdMap,
	);

	if (linkPage) {
		return createConfluenceLink(
			node,
			linkPage,
			wikilinkUrl.hash,
			pathName,
			settings,
		);
	}

	// Link not found - remove the link mark
	return removeLink(node);
}

/**
 * Processes a relative markdown link and converts it to a Confluence URL.
 */
function processRelativeLink(
	node: ADFEntity,
	href: string,
	currentFilePath: string,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings,
): ADFEntity {
	// Extract hash fragment if present
	const [pathPart, hashFragment] = href.split("#");
	const hash = hashFragment ? `#${hashFragment}` : "";

	// Remove .md extension for path resolution
	const linkPath = (pathPart ?? "").replace(/\.md$/, "");

	// Try to resolve the link
	const linkPage = resolveLinkPath(
		linkPath,
		currentFilePath,
		fileToPageIdMap,
	);

	if (linkPage) {
		return createConfluenceLink(node, linkPage, hash, linkPath, settings);
	}

	// Link not found - keep the original link (might be intentional external link)
	return node;
}

/**
 * Creates a Confluence link or inline card from a resolved page.
 */
function createConfluenceLink(
	node: ADFEntity,
	linkPage: ConfluenceAdfFile,
	hash: string,
	originalPathName: string,
	settings: ConfluenceSettings,
): ADFEntity {
	const confluenceUrl = `${settings.confluenceBaseUrl}/wiki/spaces/${linkPage.spaceKey}/pages/${linkPage.pageId}${hash}`;

	if (node.marks && node.marks[0]) {
		node.marks[0].attrs = node.marks[0].attrs || {};
		node.marks[0].attrs["href"] = confluenceUrl;

		// If the link text matches the path, convert to inline card
		if (node.text === `${originalPathName}${hash}`) {
			node.type = "inlineCard";
			node.attrs = { url: confluenceUrl };
			delete node.marks;
			delete node.text;
		}
	}

	return node;
}

/**
 * Removes the link mark from a node (for broken links).
 */
function removeLink(node: ADFEntity): ADFEntity {
	if (node.marks && node.marks[0]) {
		delete node.marks[0];
	}
	return node;
}

function removeEmptyProperties(adf: JSONDocNode) {
	return traverse(adf, {
		any: (node, _parent) => {
			if (
				node.content &&
				node.content.filter((m) => !(m === undefined || m === null))
					.length === 0
			) {
				delete node.content;
			}

			try {
				if (
					node.marks &&
					node.marks.filter((m) => !(m === undefined || m === null))
						.length === 0
				) {
					delete node.marks;
				}
			} catch (e: unknown) {
				console.warn({ marks: node.marks, e });
			}
			return node;
		},
	}) as JSONDocNode;
}

function mergeTextNodes(adf: JSONDocNode) {
	let result = removeEmptyProperties(adf);

	result = traverse(result, {
		paragraph: (node, _parent) => {
			if (
				node?.content === undefined ||
				node.content.filter((m) => !(m === undefined || m === null))
					.length === 0
			) {
				return node;
			}
			const processedContent: Array<ADFEntity | undefined> = [];
			const indexToSkip: number[] = [];
			const nodesToCheck = node.content.length ?? 0;
			for (let index = 0; index < nodesToCheck; index++) {
				if (indexToSkip.includes(index)) {
					continue;
				}

				const currentNode = node.content[index];
				const nextNode = node.content[index + 1];

				if (
					nextNode === undefined ||
					currentNode === undefined ||
					currentNode.type !== "text" ||
					nextNode.type !== "text"
				) {
					processedContent.push(currentNode);
					continue;
				}

				for (
					let lookAheadIndex = index + 1;
					lookAheadIndex < nodesToCheck;
					lookAheadIndex++
				) {
					const futureNode = node.content[lookAheadIndex];

					if (marksEqual(currentNode?.marks, futureNode?.marks)) {
						currentNode.text =
							(currentNode.text ?? "") + (futureNode?.text ?? "");
						indexToSkip.push(lookAheadIndex);
					} else {
						break;
					}
				}

				processedContent.push(currentNode);
			}

			if (processedContent.length > 0) {
				node.content = processedContent;
			}

			return node;
		},
	}) as JSONDocNode;

	return result;
}
