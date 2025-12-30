import path from "path";
import { LocalAdfFileTreeNode } from "./Publisher";

export interface ValidationError {
	type: "duplicate-title" | "missing-title" | "invalid-frontmatter";
	message: string;
	files: string[];
	suggestion?: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
	summary: {
		totalFiles: number;
		duplicateTitles: number;
		missingTitles: number;
	};
}

function collectAllTitles(
	node: LocalAdfFileTreeNode,
	titles: Map<string, string[]> = new Map(),
): Map<string, string[]> {
	const currentPageTitle = node.file?.pageTitle ?? "";
	const filePath = node.file?.absoluteFilePath ?? node.name;

	if (currentPageTitle) {
		const existingFiles = titles.get(currentPageTitle) ?? [];
		existingFiles.push(filePath);
		titles.set(currentPageTitle, existingFiles);
	}

	for (const child of node.children) {
		collectAllTitles(child, titles);
	}

	return titles;
}

function countFiles(node: LocalAdfFileTreeNode): number {
	let count = node.file ? 1 : 0;
	for (const child of node.children) {
		count += countFiles(child);
	}
	return count;
}

export function validateTitleUniqueness(
	rootNode: LocalAdfFileTreeNode,
): ValidationResult {
	const titles = collectAllTitles(rootNode);
	const errors: ValidationError[] = [];
	const warnings: ValidationError[] = [];
	let duplicateTitles = 0;
	let missingTitles = 0;

	for (const [title, files] of titles.entries()) {
		if (!title || title.trim() === "") {
			missingTitles++;
			errors.push({
				type: "missing-title",
				message: `Missing page title (empty or no H1 heading)`,
				files,
				suggestion:
					"Add an H1 heading (# Title) at the start of the file or use 'connie-title' in frontmatter",
			});
			continue;
		}

		if (files.length > 1) {
			duplicateTitles++;
			const isReadmeConflict = files.every(
				(f) =>
					path.basename(f).toLowerCase() === "readme.md" ||
					path.basename(f).toLowerCase() === "index.md",
			);

			errors.push({
				type: "duplicate-title",
				message: `Page title "${title}" is used by ${files.length} files`,
				files,
				suggestion: isReadmeConflict
					? "Each README.md/index.md must have a unique H1 heading that differs from other README files"
					: "Ensure each file has a unique H1 heading or use 'connie-title' in frontmatter",
			});
		}
	}

	const totalFiles = countFiles(rootNode);

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		summary: {
			totalFiles,
			duplicateTitles,
			missingTitles,
		},
	};
}

export function formatValidationResult(result: ValidationResult): string {
	const lines: string[] = [];

	lines.push(`\n=== Validation Summary ===`);
	lines.push(`Total files: ${result.summary.totalFiles}`);
	lines.push(
		`Status: ${result.valid ? "PASSED" : "FAILED"} (${
			result.errors.length
		} errors, ${result.warnings.length} warnings)`,
	);

	if (result.errors.length > 0) {
		lines.push(`\n--- Errors ---`);
		for (const error of result.errors) {
			lines.push(`\n[${error.type.toUpperCase()}] ${error.message}`);
			lines.push(`  Files:`);
			for (const file of error.files) {
				lines.push(`    - ${file}`);
			}
			if (error.suggestion) {
				lines.push(`  Suggestion: ${error.suggestion}`);
			}
		}
	}

	if (result.warnings.length > 0) {
		lines.push(`\n--- Warnings ---`);
		for (const warning of result.warnings) {
			lines.push(`\n[${warning.type.toUpperCase()}] ${warning.message}`);
			for (const file of warning.files) {
				lines.push(`    - ${file}`);
			}
		}
	}

	return lines.join("\n");
}
