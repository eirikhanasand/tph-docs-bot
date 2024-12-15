import { Command } from "../../interfaces";
import Doc, { sources } from "discord.js-docs";
import { checkEmbedLimits } from "../../utils/EmbedUtils.js";
import { deleteButton } from "../../utils/CommandUtils.js";
import { 
	ActionRowBuilder, 
	StringSelectMenuBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { APIEmbed, ButtonBuilder } from "discord.js";

const supportedBranches = Object.keys(sources).map((branch) => ({
	name: capitalize(branch),
	value: branch
}));

const command: Command = {
	slashCommand: {
		data: new SlashCommandBuilder()
			.setName("djs")
			.setDescription(
				"Search discord.js documentations, supports builders, voice, collection and rpc documentations",
			)
			.addStringOption((option) =>
				option
					.setName("query")
					.setDescription(
						"Enter the phrase you'd like to search for, e.g: client#isready or builders:slashcommandbuilder",
					)
					.setRequired(true)
					.setAutocomplete(true),
			)
			.addStringOption((option) =>
				option
					.setName("source")
					.setDescription("Select which branch/repository to get documentation off of (Default: stable)")
					.addChoices(supportedBranches)
					.setRequired(false),
			)
			.addBooleanOption((option) =>
				option
					.setName("private")
					.setDescription("Whether or not to search private elements (default false)")
					.setRequired(false),
			),
		async run(interaction) {
			const deleteButtonComponent = deleteButton(interaction.user.id);
			const deleteButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButtonComponent);
			const queryOption = interaction.options.get("query")?.value as string;
			const sourceOption = interaction.options.get("source") as unknown as keyof typeof sources;

			// Support the source:Query format
			// eslint-disable-next-line prefer-const
			let { Source: source = "stable", Query: query } =
                queryOption.match(/(?:(?<Source>[^:]*):)?(?<Query>(?:.|\s)*)/i)?.groups ?? {};

			// The Default source should be stable
			if (!sources[source]) source = "stable";

			if (sourceOption) source = sourceOption;
			// Whether to include private elements on the search results, by 
			// default false, shows private elements if the search returns an 
			// exact result;
			const searchPrivate = interaction.options.get("private") as unknown as boolean || false;
			const doc = await Doc.fetch(source, { force: true }).catch(console.error);

			if (!doc) {
				await interaction.editReply({ content: "Couldn't fetch docs" }).catch(console.error);
				return;
			}
			// const resultEmbed = doc.resolveEmbed(query, { excludePrivateElements: !searchPrivate });
			const result = searchDJSDoc(doc, query, searchPrivate);
			// If a result wasn't found
			if (!result || (result as APIEmbed).description === "") {
				const notFoundEmbed = doc.baseEmbed();
				notFoundEmbed.description = "Didn't find any results for that query";

				const timeStampDate = new Date(notFoundEmbed.timestamp);
				// Satisfies the method's MessageEmbedOption type
				const embedObj = { ...notFoundEmbed, timestamp: timeStampDate.toLocaleDateString() };

				await interaction.editReply({ embeds: [embedObj] }).catch(console.error);
				return;
			} else if (Array.isArray(result)) {
				// If there are multiple results, send a select menu from which the user can choose which one to send

				const selectMenuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(`djsselect/${source}/${searchPrivate}/${interaction.user.id}`)
						.addOptions(result)
						.setPlaceholder("Select documentation to send"),
				);
				await interaction
					.editReply({
						content: "Didn't find an exact match, please select one from below",
						components: [selectMenuRow],
					})
					.catch(console.error);
				return;
			}
			const resultEmbed = result;
			const timeStampDate = new Date(resultEmbed.timestamp);
			const embedObj = { ...resultEmbed, timestamp: timeStampDate };
			const sendableQuery = query.length >= 100 ? `${query.slice(0, 100)}...` : query;

			//! "checkEmbedLimits" does not support MessageEmbed objects due to 
			// the properties being null by default, use a raw embed object for 
			// this method Check if the embed exceeds any of the limits
			if (!checkEmbedLimits([resultEmbed])) {
				// The final field should be the View Source button
				embedObj.fields = [embedObj.fields?.at(-1)];
			}
			await interaction.editReply({
				content: `Sent documentations for ${sendableQuery}`,
			});
			// @ts-expect-error
			await interaction.followUp({ embeds: [embedObj], components: [deleteButtonRow] }).catch(console.error);
			return;
		},
	},
	selectMenus: [
		{
			custom_id: "djsselect",
			async run(interaction) {
				const selectedValue = interaction.values[0];
				const [, source, searchPrivate, Initiator] = interaction.customId.split("/");
				const deleteButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([deleteButton(Initiator)]);
				const doc = await Doc.fetch(source, { force: true });
				const resultEmbed = searchDJSDoc(doc, selectedValue, searchPrivate === "true") as APIEmbed;

				// Remove the menu and update the ephemeral message
				await interaction
					.editReply({ content: `Sent documentations for ${selectedValue}`, components: [] })
					.catch(console.error);
				// Send documentation
				await interaction
					.followUp({ embeds: [resultEmbed], components: [deleteButtonRow] })
					.catch(console.error);
			},
		},
	],
};

function capitalize(str: string) {
	return str
		.split("-")
		.map((splitStr) => `${splitStr[0].toUpperCase()}${splitStr.substring(1)}`)
		.join("-");
}

// Export to reuse on the select menu handler
export function searchDJSDoc(doc: Doc, query: string, searchPrivate?: boolean) {
	// Get first 25 results
	const options = { excludePrivateElements: !searchPrivate, maxResults: 25 };

	const singleElement = doc.get(...query.split(/\.|#/));
	// Return embed for the single element, the exact match
	if (singleElement) return singleElement.embed(options);

	const searchResults = doc.search(query, options);
	if (!searchResults) return null;

	return searchResults.map((res) => {
		const parsedDescription = res.description?.trim?.() ?? "No description provided";
		// Labels and values have a limit of 100 characters
		const description = parsedDescription.length >= 99 ? `${parsedDescription.slice(0, 96)}...` : parsedDescription;
		return {
			label: res.formattedName,
			description,
			emoji: resolveRegionalEmoji(res.embedPrefix),
			value: res.formattedName,
		};
	});
}

/**
 * Return the unicode version of the regional emojis
 * @param regionalEmoji
 * @returns The unicode version of the emoji
 */
function resolveRegionalEmoji(regionalEmoji: string) {
	const character = regionalEmoji.match(/:regional_indicator_(.):/)?.[1];
	if (!character) return null;
	switch (character) {
	case "c":
		return "🇨";
	case "e":
		return "🇪";
	case "i":
		return "🇮";
	case "m":
		return "🇲";
	case "t":
		return "🇹";
	case "p":
		return "🇵";
	default:
		return null;
	}
}

export default command;
