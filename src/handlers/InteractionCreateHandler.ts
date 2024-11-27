import { commandCooldownCheck, commandPermissionCheck } from "../utils/CommandUtils.js";
import { glob } from "glob";
import type { Command, MyContext } from "../interfaces.js";
import type {
    ButtonInteraction,
    CommandInteraction,
    Interaction,
    StringSelectMenuInteraction,
} from "discord.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function interactionCreateHandler(context: MyContext, interaction: Interaction<"cached">) {
    try {
        if (interaction.isCommand()) {
            await commandInteractionHandler(context, interaction);
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
