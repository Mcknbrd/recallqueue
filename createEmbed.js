// createEmbed.js
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch("1431577673938767932"); // same as configMessageChannelId

  const embed = new EmbedBuilder()
    .setTitle("🎮 Ranked Queue")
    .setDescription("Queue will appear here once people join.")
    .setColor("Blue");

  const message = await channel.send({ embeds: [embed] });
  console.log("✅ Embed created!");
  console.log("configMessageChannelId:", channel.id);
  console.log("configMessageId:", message.id);
  process.exit();
});

client.login(process.env.DISCORD_TOKEN);
