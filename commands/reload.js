import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName("reload")
  .setDescription("🔁 Reloads the bot’s configuration and commands (admin only).");

export async function execute(interaction, db, updateQueueEmbed) {
  try {
    // 🧱 Admin check
    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({
        content: "❌ You need **Administrator** permissions to use this command.",
        ephemeral: true,
      });
    }

    // 🧩 Reload config.json (force fresh read from disk)
    const newConfig = JSON.parse(fs.readFileSync("./config.json", "utf8"));
    interaction.client.config = newConfig;

    // 🧩 Dynamically reload all command modules
    const commandsPath = path.join(__dirname, "../commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

    interaction.client.commands.clear();

    for (const file of commandFiles) {
      // Add cache-busting query param to force ESM reimport
      const fileUrl = pathToFileURL(path.join(commandsPath, file)).href + `?v=${Date.now()}`;
      const command = await import(fileUrl);
      if (command.data && command.execute) {
        interaction.client.commands.set(command.data.name, command);
      }
    }

    // 🧱 Update the queue embed with new config values
    await updateQueueEmbed(interaction.guild);

    await interaction.reply({
      content: "✅ Configuration and commands reloaded successfully!",
      ephemeral: true,
    });

    console.log("🔁 /reload executed: config + commands refreshed!");
  } catch (err) {
    console.error("❌ /reload error:", err);
    if (!interaction.replied) {
      await interaction.reply({
        content: "⚠️ Failed to reload configuration or commands. Check console for details.",
        ephemeral: true,
      });
    }
  }
}
