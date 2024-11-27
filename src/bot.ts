import "dotenv/config";
import { MyContext } from "./interfaces";
import { loadCommands, interactionCreateHandler } from "./handlers/InteractionCreateHandler.js";
import { messageHandler } from "./handlers/MessageHandler.js";
import { deleteButtonHandler } from "./utils/CommandUtils.js";
import { 
    ActivityType, 
    Client, 
    Collection, 
    GatewayIntentBits, 
    LimitedCollection, 
    Partials 
} from "discord.js";

(async function () {
    const context: MyContext = {
        client: new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ],
            presence: {
                activities: [{ type: ActivityType.Playing, name: "Read the docs" }],
                status: "online",
            },
            // For DMs, a partial channel object is received, in order to 
            // receive dms, Partials.Channel must be activated
            partials: [
                Partials.Channel
            ],
            makeCache: (manager) => {
                //! Disabling these caches will break djs functionality
                const unsupportedCaches = [
                    "GuildManager",
                    "ChannelManager",
                    "GuildChannelManager",
                    "RoleManager",
                    "PermissionOverwriteManager",
                ];
                if (unsupportedCaches.includes(manager.name)) return new Collection();
                // Disable every supported cache
                return new LimitedCollection({ maxSize: 0 });
            },
        }),
        commands: {
            buttons: new Collection(),
            selectMenus: new Collection(),
            slashCommands: new Collection(),
        },
        cooldownCounter: new Collection(),
    };
    const docsBot = context.client;
    await loadCommands(context);
    // Add delete button handler
    context.commands.buttons.set("deletebtn", { custom_id: "deletebtn", run: deleteButtonHandler });

    docsBot.on("error", console.error);
    docsBot.on("warn", console.warn);

    docsBot.once("ready", (client) => {
        console.info(`Logged in as ${client.user.tag} (${client.user.id})`);
    });

    docsBot.on("messageCreate", messageHandler);
    docsBot.on("interactionCreate", interactionCreateHandler.bind(null, context));

    docsBot.login(process.env.TOKEN);
})();

process.on("unhandledRejection", async (err) => {
    console.error("Top Level Unhandled Promise Rejection:\n", err)
})

process.on("uncaughtException", async (err) => {
    console.error("Top Level Uncaught Promise Exception:\n", err)
})

process.on("uncaughtExceptionMonitor", async (err) => {
    console.error("Top Level Uncaught Promise Exception (Monitor):\n", err)
})
