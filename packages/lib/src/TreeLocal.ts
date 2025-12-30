import path from "path";
import { MarkdownFile } from "./adaptors";
import { convertMDtoADF } from "./MdToADF";
import { folderFile } from "./FolderFile";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LocalAdfFileTreeNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import {
	validateTitleUniqueness,
	formatValidationResult,
	ValidationResult,
} from "./Validator";

const findCommonPath = (paths: string[]): string => {
	const [firstPath, ...rest] = paths;
	if (!firstPath) {
		throw new Error("No Paths Provided");
	}
	const commonPathParts = firstPath.split(path.sep);

	rest.forEach((filePath) => {
		const pathParts = filePath.split(path.sep);
		for (let i = 0; i < commonPathParts.length; i++) {
			if (pathParts[i] !== commonPathParts[i]) {
				commonPathParts.splice(i);
				break;
			}
		}
	});

	return commonPathParts.join(path.sep);
};

const createTreeNode = (name: string): LocalAdfFileTreeNode => ({
	name,
	children: [],
});

const addFileToTree = (
	treeNode: LocalAdfFileTreeNode,
	file: MarkdownFile,
	relativePath: string,
	settings: ConfluenceSettings,
) => {
	const [folderName, ...remainingPath] = relativePath.split(path.sep);
	if (folderName === undefined) {
		throw new Error("Unable to get folder name");
	}

	if (remainingPath.length === 0) {
		const adfFile = convertMDtoADF(file, settings);
		treeNode.children.push({
			...createTreeNode(folderName),
			file: adfFile,
		});
	} else {
		let childNode = treeNode.children.find(
			(node) => node.name === folderName,
		);

		if (!childNode) {
			childNode = createTreeNode(folderName);
			treeNode.children.push(childNode);
		}

		addFileToTree(childNode, file, remainingPath.join(path.sep), settings);
	}
};

const processNode = (commonPath: string, node: LocalAdfFileTreeNode) => {
	if (!node.file) {
		let indexFile = node.children.find(
			(child) => path.parse(child.name).name === node.name,
		);
		if (!indexFile) {
			indexFile = node.children.find((child) =>
				["index", "README", "readme"].includes(
					path.parse(child.name).name,
				),
			);
		}

		if (indexFile && indexFile.file) {
			node.file = indexFile.file;
			node.children = node.children.filter(
				(child) => child !== indexFile,
			);
		} else {
			node.file = {
				folderName: node.name,
				absoluteFilePath: path.join(commonPath, node.name),
				fileName: `${node.name}.md`,
				contents: folderFile as JSONDocNode,
				pageTitle: node.name,
				frontmatter: {},
				tags: [],
				pageId: undefined,
				dontChangeParentPageId: false,
				contentType: "page",
				blogPostDate: undefined,
			};
		}
	}

	const childCommonPath = path.parse(
		node?.file?.absoluteFilePath ?? commonPath,
	).dir;

	node.children.forEach((childNode) =>
		processNode(childCommonPath, childNode),
	);
};

export interface FolderStructureResult {
	tree: LocalAdfFileTreeNode;
	validation: ValidationResult;
}

export const createFolderStructure = (
	markdownFiles: MarkdownFile[],
	settings: ConfluenceSettings,
): LocalAdfFileTreeNode => {
	const result = createFolderStructureWithValidation(markdownFiles, settings);

	if (!result.validation.valid) {
		const formattedErrors = formatValidationResult(result.validation);
		throw new Error(
			`Validation failed:\n${formattedErrors}\n\nUse --dry-run or --validate-only to see all issues without publishing.`,
		);
	}

	return result.tree;
};

export const createFolderStructureWithValidation = (
	markdownFiles: MarkdownFile[],
	settings: ConfluenceSettings,
): FolderStructureResult => {
	const commonPath = findCommonPath(
		markdownFiles.map((file) => file.absoluteFilePath),
	);
	const rootNode = createTreeNode(commonPath);

	markdownFiles.forEach((file) => {
		const relativePath = path.relative(commonPath, file.absoluteFilePath);
		addFileToTree(rootNode, file, relativePath, settings);
	});

	processNode(commonPath, rootNode);

	const validation = validateTitleUniqueness(rootNode);

	return {
		tree: rootNode,
		validation,
	};
};
