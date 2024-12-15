import { codeBlock, EmbedBuilder } from "discord.js";
import type { Message } from "discord.js";
import { intervalToDuration, intervalObjToStr } from "../utils/DateUtils.js";

export async function messageHandler(message: Message<true>) {
	try {
		const clientUser = message.client.user;
		// The regex for the bot's mention
		const mentionRegex = new RegExp(`^<@!?${clientUser.id}>$`);

		if (message.content.trim().match(mentionRegex)) {
			const pkgJSONPath = "../../package.json";
			const pkgJSON = await import(pkgJSONPath);
			const { version, description, dependencies } = pkgJSON;

			const uptimeObj = intervalToDuration(Date.now() - message.client.uptime, Date.now());
			const uptime = `${intervalObjToStr(uptimeObj)}` || "Just turned on";
			const supportedDocs = ["discord.js", "Javascript (mdn)"].map((str) => `\`${str}\``).join(", ");
			const deps = codeBlock("json", JSON.stringify(dependencies, undefined, 4));
			const statusEmbed = new EmbedBuilder()
				.setTitle(`${clientUser.username} (v${version})`)
				.setURL("https://github.com/the-programmers-hangout/tph-docs-bot/")
				.setColor(0xd250c7)
				.setDescription(description)
				.setThumbnail(clientUser.displayAvatarURL({ forceStatic: false }))
				.addFields(
					{name: "Currently Supported Docs", value: supportedDocs},
					{name: "Dependencies", value: deps},
					{name: "Uptime", value: uptime },
					{name: "Ping", value: `${message.client.ws.ping}ms`},
					{name: "Source", value: "[GitHub](https://github.com/the-programmers-hangout/tph-docs-bot/)"},
					{name: "Contributors", value: "[Link](https://github.com/the-programmers-hangout/tph-docs-bot/graphs/contributors)"}
				);

			await message.reply({ embeds: [statusEmbed] });
		}
	} catch (e) {
		console.error(e);
	}

	return;
}

// temp change to apply on top