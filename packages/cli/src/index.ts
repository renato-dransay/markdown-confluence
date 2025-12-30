#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import * as fs from "fs/promises";
import {
	AutoSettingsLoader,
	FileSystemAdaptor,
	Publisher,
	MermaidRendererPlugin,
	formatDryRunResult,
	formatValidationResult,
	createManifest,
	formatManifestSummary,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";

async function main() {
	const settingLoader = new AutoSettingsLoader();

	const partialSettings = settingLoader.loadPartial();
	if (partialSettings.validateOnly) {
		const settings = settingLoader.loadForValidationOnly();
		console.log(chalk.blue("Running validation only..."));
		console.log(chalk.gray(`Content root: ${settings.contentRoot}`));
		console.log(
			chalk.gray(`Folder to publish: ${settings.folderToPublish}`),
		);

		const adaptor = new FileSystemAdaptor(settings);
		const publisher = new Publisher(
			adaptor,
			settingLoader,
			{} as ConfluenceClient,
			[],
		);

		try {
			const validationResult = await publisher.validate();
			console.log(formatValidationResult(validationResult));

			if (!validationResult.valid) {
				console.error(
					chalk.red(
						boxen("Validation failed. See errors above.", {
							padding: 1,
						}),
					),
				);
				process.exit(1);
			}

			console.log(
				chalk.green(boxen("Validation passed!", { padding: 1 })),
			);
			process.exit(0);
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error(
					chalk.red(
						boxen(`Validation error: ${error.message}`, {
							padding: 1,
						}),
					),
				);
			}
			process.exit(1);
		}
	}

	const settings = settingLoader.load();
	const adaptor = new FileSystemAdaptor(settings);

	const confluenceClient = new ConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: settings.atlassianUserName,
				apiToken: settings.atlassianApiToken,
			},
		},
		middlewares: {
			onError(e) {
				if ("response" in e && "data" in e.response) {
					e.message =
						typeof e.response.data === "string"
							? e.response.data
							: JSON.stringify(e.response.data);
				}
			},
		},
	});

	const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
		new MermaidRendererPlugin(new PuppeteerMermaidRenderer()),
	]);

	if (settings.dryRun) {
		console.log(chalk.blue("Running in dry-run mode..."));
		try {
			const dryRunResult = await publisher.dryRun();
			console.log(formatDryRunResult(dryRunResult));

			if (!dryRunResult.validation.valid) {
				console.error(
					chalk.red(
						boxen(
							"Validation failed. Cannot proceed with publishing.",
							{
								padding: 1,
							},
						),
					),
				);
				process.exit(1);
			}

			console.log(
				chalk.green(
					boxen(
						`Dry run complete. ${dryRunResult.summary.wouldCreate} pages would be created, ${dryRunResult.summary.wouldUpdate} would be updated.`,
						{ padding: 1 },
					),
				),
			);
			process.exit(0);
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error(
					chalk.red(
						boxen(`Dry run error: ${error.message}`, {
							padding: 1,
						}),
					),
				);
			}
			process.exit(1);
		}
	}

	const publishFilter = "";
	const results = await publisher.publish(publishFilter);

	let hasErrors = false;
	results.forEach((file) => {
		if (file.successfulUploadResult) {
			const result = file.successfulUploadResult;
			const status =
				result.contentResult === "updated" ||
				result.imageResult === "updated" ||
				result.labelResult === "updated"
					? "UPDATED"
					: "UNCHANGED";

			console.log(chalk.green(`[${status}] ${file.node.file.pageTitle}`));
			console.log(
				chalk.gray(`  Source: ${file.node.file.absoluteFilePath}`),
			);
			console.log(chalk.gray(`  URL: ${file.node.file.pageUrl}`));
			console.log(
				chalk.gray(
					`  Content: ${result.contentResult}, Images: ${result.imageResult}, Labels: ${result.labelResult}`,
				),
			);
			return;
		}

		hasErrors = true;
		console.error(chalk.red(`[FAILED] ${file.node.file.pageTitle}`));
		console.error(chalk.red(`  ${file.reason}`));
	});

	if (settings.generateManifest) {
		const manifest = createManifest(
			results,
			settings.confluenceBaseUrl,
			results[0]?.node.file.spaceKey ?? "",
			settings.confluenceParentId,
		);

		await fs.writeFile(
			settings.manifestPath,
			JSON.stringify(manifest, null, 2),
		);

		console.log(formatManifestSummary(manifest));
		console.log(
			chalk.blue(`\nManifest written to: ${settings.manifestPath}`),
		);
	}

	if (hasErrors) {
		console.error(
			chalk.red(
				boxen("Some pages failed to publish. See errors above.", {
					padding: 1,
				}),
			),
		);
		process.exit(1);
	}

	console.log(
		chalk.green(
			boxen(
				`Successfully published ${results.length} pages to Confluence!`,
				{
					padding: 1,
				},
			),
		),
	);
}

main().catch((error) => {
	console.error(chalk.red(boxen(`Error: ${error.message}`, { padding: 1 })));
	process.exit(1);
});
