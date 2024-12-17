import { commandCooldownCheck, commandPermissionCheck } from "../utils/CommandUtils.js";
import { glob } from "glob";
import type { Command, MyContext } from "../interfaces.js";
import {
    AutocompleteInteraction,
    InteractionType,
    type ButtonInteraction,
    type CommandInteraction,
    type Interaction,
    type StringSelectMenuInteraction,
} from "discord.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import flexsearch from "flexsearch";
import Doc from "discord.js-docs";
import { MDNAutocomplete } from "../commands/docs/mdn.js";
import { DEFAULT_SEARCH_QUERY } from "../constants.js";

interface SitemapEntry<T extends string | number> {
    loc: string;
    lastmod: T;
}
type Sitemap<T extends string | number> = SitemapEntry<T>[];

let sources = {
    index: null as flexsearch.Index,
    sitemap: null as Sitemap<number>,
    lastUpdated: null as number,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function interactionCreateHandler(context: MyContext, interaction: Interaction<"cached">) {
    try {
        if (interaction.isCommand() || interaction.type === InteractionType.ApplicationCommandAutocomplete) {
            if (interaction.isAutocomplete()) {
                // Autocomplete handlers
                switch (interaction.commandName) {
                case "djs": DJSAutocomplete(interaction); break;
                case "mdn": MDNAutocomplete(interaction); break;
                default: break;
                }
            }

            if (interaction.isCommand()) {
                await commandInteractionHandler(context, interaction);
            }
        } else if (interaction.isButton()) {
            await buttonInteractionHandler(context, interaction);
        } else if (interaction.isStringSelectMenu()) {
            await selectMenuInteractionHandler(context, interaction);
        }
    } catch (e) {
        console.error(e);
    }
}

/**
 * Locally loads the commands to the context for further use
 * @param context
 * @returns
 */
export function loadCommands(context: MyContext) {
    // Promisifies the process of glob
    return new Promise((resolve) => {
        // Find all js files
        glob(`${__dirname}/../commands/**/*.js`).then(async (files) => {
            await Promise.all(
                files.map(async (file) => {
                    const { default: myCommandFile }: { default: Command } = await import(file).catch((err) => {
                        console.error(err);
                        // Since the return value gets destructured, an empty object is returned
                        return {};
                    });
                    if (!myCommandFile) return;
                    const { buttons, selectMenus, slashCommand } = myCommandFile;
                    buttons?.forEach((button) => context.commands.buttons.set(button.custom_id, button));
                    selectMenus?.forEach((selectMenu) =>
                        context.commands.selectMenus.set(selectMenu.custom_id, selectMenu),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    slashCommand && context.commands.slashCommands.set(slashCommand.data.name, slashCommand);
                }),
            );
            resolve(undefined);
        });
    });
}

async function commandInteractionHandler(context: MyContext, interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true }).catch(console.error);
    const command = context.commands.slashCommands.get(interaction.commandName);
    if (!command) return interaction.editReply({ content: "Command not found" }).catch(console.error);

    if (commandPermissionCheck(interaction, command)) return;
    if (commandCooldownCheck(interaction, command, context)) return;
    try {
        await command.run(interaction, context);
    } catch (e) {
        console.error(e);
        const errorMessage = "An error has occurred";
        await interaction[interaction.replied ? "editReply" : "reply"]?.({
            content: errorMessage,
        }).catch(console.error);
    }
}

async function buttonInteractionHandler(context: MyContext, interaction: ButtonInteraction<"cached">) {
    const buttonId = interaction.customId.split("/")[0];
    const button = context.commands.buttons.get(buttonId);
    if (button) {
        await button.run(interaction, context).catch(console.error);
        return;
    }
    await interaction[interaction.replied ? "editReply" : "reply"]?.({
        content: "Unknown Button",
        ephemeral: true,
    }).catch(console.error);
}

async function selectMenuInteractionHandler(context: MyContext, interaction: StringSelectMenuInteraction<"cached">) {
    await interaction.deferUpdate().catch(console.error);

    const menuId = interaction.customId.split("/")[0];
    const menu = context.commands.selectMenus.get(menuId);
    if (menu) {
        await menu.run(interaction, context).catch(console.error);
        return;
    }
    await interaction[interaction.replied ? "editReply" : "reply"]?.({
        content: "Unknown menu",
        ephemeral: true,
    }).catch(console.error);
}

async function DJSAutocomplete(interaction: AutocompleteInteraction<"cached">) {
    const query = interaction.options.getFocused(true).value as string;
    const sourceOption = interaction.options.getString("source") || "stable";

    // Validate source and fetch documentation
    const source = sources[sourceOption] ? sourceOption : "stable";
    const doc = await Doc.fetch(source, { force: false });
    if (!doc) {
        await interaction.respond([]).catch(console.error);
        return;
    }

    // Support source:query format
    // eslint-disable-next-line prefer-const
    let { Source: branchOrProject = "stable", Query: searchQuery } =
        (query || DEFAULT_SEARCH_QUERY).match(/(?:(?<Source>[^:]*):)?(?<Query>(?:.|\s)*)/i)?.groups ?? {};

    if (!sources[branchOrProject]) branchOrProject = "stable";

    const singleElement = doc.get(...searchQuery.split(/\.|#/));
    if (singleElement) {
        await interaction
            .respond([
                {
                    name: singleElement.formattedName,
                    value: `${branchOrProject}:${singleElement.formattedName}`,
                },
            ])
            .catch(console.error);
        return;
    }

    const searchResults = doc.search(searchQuery, { excludePrivateElements: false, maxResults: 25 });
    if (!searchResults) {
        // Responds with no options if no results
        await interaction.respond([]).catch(console.error);
        return;
    }

    await interaction
        .respond(
            searchResults.map((elem) => ({
                name: elem.formattedName,
                value: `${branchOrProject}:${elem.formattedName}`,
            })),
        )
        .catch(console.error);
}
