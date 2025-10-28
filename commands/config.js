// commands/config.js
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import fs from "fs";

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("🛠 Configure the queue system (admins only)");

export async function execute(interaction, db, updateQueueEmbed) {
  // ✅ Load config fresh each time
  const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

  // ✅ Check for admin permission
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ You don’t have permission to use this command.",
      ephemeral: true,
    });
  }

  // ✅ Create config overview embed
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Queue Configuration Panel")
    .setColor(0x2b2d31)
    .setDescription(
      [
        `**Queue Size:** ${config.queueSize}`,
        `**Allowed Roles:** ${
          config.allowedRoleIds.length
            ? config.allowedRoleIds.map((r) => `<@&${r}>`).join(", ")
            : "*(none)*"
        }`,
        `**5Q Voice Channels:** ${
          config.targetVoiceChannelIds.length
            ? config.targetVoiceChannelIds.map((c) => `<#${c}>`).join(", ")
            : "*(none)*"
        }`,
        `**Trio Voice Channels:** ${
          config.trioVoiceChannelIds.length
            ? config.trioVoiceChannelIds.map((c) => `<#${c}>`).join(", ")
            : "*(none)*"
        }`,
      ].join("\n")
    )
    .setFooter({
      text: "Use the buttons below to modify settings. Changes are saved instantly.",
    });

  // ✅ Build buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("config_size")
      .setLabel("Change Queue Size")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("config_roles")
      .setLabel("Edit Allowed Roles")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("config_channels")
      .setLabel("Edit Voice Channels")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("config_reset")
      .setLabel("Reset Queue")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}
