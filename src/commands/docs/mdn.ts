import { deleteButton } from "../../utils/CommandUtils.js";
import { XMLParser } from "fast-xml-parser";
import { Command, MdnDoc } from "../../interfaces";
import flexsearch from "flexsearch";
import { 
	ActionRowBuilder, 
	ButtonBuilder, 
	EmbedBuilder, 
	SlashCommandBuilder, 
	StringSelectMenuBuilder 
} from "discord.js";
import { 
	MDN_BASE_URL, 
	MDN_COLOR, 
	MDN_DOCS_URL, 
	MDN_ICON_URL, 
	MDN_SITEMAP 
} from "../../constants.js";

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

const command: Command = {
	slashCommand: {
		data: new SlashCommandBuilder()
			.setName("mdn")
			.setDescription("Searches MDN documentation.")
			.addStringOption((opt) =>
				opt
					.setName("query")
					.setDescription("Enter the phrase you'd like to search for. Example: Array.filter")
					.setRequired(true)
					.setAutocomplete(true),
			),
		async run(interaction) {
			const deleteButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([deleteButton(interaction.user.id)]);
			const query = interaction.options.get("query").value as string | null;
			const { index, sitemap } = await getSources();
			// Get the top 25 results
			const search: string[] = index.search(query, { limit: 25 }).map((id) => sitemap[<number>id].loc);
			const sendableQuery = query.length >= 100 ? `${query.slice(0, 100)}...` : query;

			if (!search.length) {
				const noResultsEmbed = new EmbedBuilder()
					.setColor(0xff0000)
					.setAuthor({ name: "MDN Documentation", iconURL: MDN_ICON_URL })
					.setTitle(`Search for: ${query.slice(0, 243)}`)
					.setDescription("No results found...");
				await interaction.editReply({ embeds: [noResultsEmbed] }).catch(console.error);
				return;
			} else if (search.length === 1 || search.includes(query)) {
				// If there's an exact match
				const resultEmbed = await getSingleMDNSearchResults(search.includes(query) ? query : search[0]);
				if (!resultEmbed) {
					await interaction.editReply({ content: "Couldn't find any results" }).catch(console.error);
					return;
				}
				await interaction
					.editReply(`Sent documentation for ${sendableQuery}`)
					.catch(console.error);
				await interaction
					.followUp({
						embeds: [resultEmbed],
						components: [deleteButtonRow],
					})
					.catch(console.error);

				return;
			} else {
				// If there are multiple results, send a select menu from which 
				// the user can choose which one to send
				const selectMenuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(`mdnselect/${interaction.user.id}`)
						.addOptions(
							search.map((val) => {
								const parsed = val.length >= 99 ? val.split("/").slice(-2).join("/") : val;
								return { label: parsed, value: parsed };
							}),
						)
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
		},
	},
	selectMenus: [
		{
			custom_id: "mdnselect",
			async run(interaction) {
				const Initiator = interaction.customId.split("/")[1];
				const deleteButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([deleteButton(Initiator)]);
				const selectedValue = interaction.values[0];
				const resultEmbed = await getSingleMDNSearchResults(selectedValue);

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

// Export to reuse on the select menu handler
export async function getSingleMDNSearchResults(searchQuery: string) {
	// Search for the match once again
	const { index, sitemap } = await getSources();
	// Search one more time
	const secondSearch = index.search(searchQuery, { limit: 25 }).map((id) => sitemap[<number>id].loc);
	// Since it returns an array, the exact match might not be the first 
	// selection, if the exact match exists, fetch using that, if not get the 
	// first result
	const finalSelection = secondSearch.includes(searchQuery) ? searchQuery : secondSearch[0];
	const res = await fetch(`${MDN_BASE_URL}${MDN_DOCS_URL}${finalSelection}/index.json`).catch(console.error);
	if (!res || !res?.ok) return null;
	const resJSON = await res.json?.().catch(console.error) as { doc: MdnDoc };
	if (!res.json) return null;

	const doc: MdnDoc = resJSON.doc;

	return new EmbedBuilder()
		.setColor(MDN_COLOR)
		.setAuthor({ name: "MDN Documentation", iconURL: MDN_ICON_URL })
		.setTitle(doc.pageTitle)
		.setURL(`${MDN_BASE_URL}${MDN_DOCS_URL}${doc.mdn_url}`)
		.setDescription(doc.summary);
}

// NB: This function is duplicated in handlers/InteractionCreateHandler.ts
// But both files will fail if you try to import / export it.
async function getSources(): Promise<typeof sources> {
	try {
		if (sources.lastUpdated && Date.now() - sources.lastUpdated < 43200000 /* 12 hours */) return sources;        
		const res = await fetch(MDN_SITEMAP);
		// Fallback to old sources if the new ones are not available for any reason
		if (!res.ok) return sources;
		const rawData = await res.text();
		const parsedSitemap = new XMLParser().parse(rawData);
		const sitemap: Sitemap<number> = parsedSitemap.urlset.url.map((entry: SitemapEntry<string>) => ({
			loc: entry.loc.slice(`${MDN_BASE_URL}${MDN_DOCS_URL}`.length),
			lastmod: new Date(entry.lastmod).valueOf(),
		}));
		const index = new flexsearch.Index();
		sitemap.forEach((entry, idx) => index.add(idx, entry.loc));    
		sources = { index, sitemap, lastUpdated: Date.now() };
		return sources;
	} catch (error) {
		console.warn(`Failed to fetch mdn docs: ${error}`);
		return sources;
	}
}

export default command;

// temp change to apply on top