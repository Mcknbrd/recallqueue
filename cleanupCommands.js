import { REST, Routes } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🧹 Fetching all commands...");
    const [global, guild] = await Promise.all([
      rest.get(Routes.applicationCommands(process.env.CLIENT_ID)),
      rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)),
    ]);

    console.log(`🌍 Global: ${global.length}, 🏠 Guild: ${guild.length}`);

    // Delete global commands (safe to remove if you only use guild ones)
    for (const cmd of global) {
      console.log(`❌ Deleting global command: ${cmd.name}`);
      await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
    }

    console.log("✅ All global commands removed!");
  } catch (err) {
    console.error(err);
  }
})();
