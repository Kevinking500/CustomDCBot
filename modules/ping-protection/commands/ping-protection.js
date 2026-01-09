const { 
  fetchModHistory, 
  getPingCountInWindow,
  generateHistoryResponse,
  generateActionsResponse
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

module.exports.run = async function (interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);

  if (group) {
    return module.exports.subcommands[group][sub](interaction);
  }
  return module.exports.subcommands[sub](interaction);
};

// Handles subcommands
module.exports.subcommands = {
  'user': {
    'history': async function (interaction) {
      const user = interaction.options.getUser('user');
      const payload = await generateHistoryResponse(interaction.client, user.id, 1);
      await interaction.reply(payload); 
    },
    'actions-history': async function (interaction) {
      const user = interaction.options.getUser('user');
      const payload = await generateActionsResponse(interaction.client, user.id, 1);
      await interaction.reply(payload);
    },
    'panel': async function (interaction) {
      const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                      (interaction.client.config.admins || []).includes(interaction.user.id);
      if (!isAdmin) return interaction.reply({ 
        content: localize('ping-protection', 'no-permission'), 
        ephemeral: true 
      });

      const user = interaction.options.getUser('user');
      const pingerId = user.id;
      const storageConfig = interaction.client.configurations['ping-protection']['storage'];
      const retentionWeeks = (storageConfig && storageConfig.pingHistoryRetention) 
      ? storageConfig.pingHistoryRetention : 12;
      const timeframeDays = retentionWeeks * 7;
      
      const pingCount = await getPingCountInWindow(interaction.client, pingerId, timeframeDays);
      const modData = await fetchModHistory(interaction.client, pingerId, 1, 1000); 

      const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId(`ping-protection_history_${user.id}`).setLabel(localize('ping-protection', 'btn-history')).setStyle('SECONDARY'),
        new MessageButton().setCustomId(`ping-protection_actions_${user.id}`).setLabel(localize('ping-protection', 'btn-actions')).setStyle('SECONDARY'),
        new MessageButton().setCustomId(`ping-protection_delete_${user.id}`).setLabel(localize('ping-protection', 'btn-delete')).setStyle('DANGER')
      );

      const embed = new MessageEmbed()
        .setTitle(localize('ping-protection', 'panel-title', { u: user.tag }))
        .setDescription(localize('ping-protection', 'panel-description', { u: user.toString(), i: user.id }))
        .setColor('BLUE')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields([{
          name: localize('ping-protection', 'field-quick-history', { w: retentionWeeks }),
          value: localize('ping-protection', 'field-quick-desc', { p: pingCount, m: modData.total }),
          inline: false
        }]);

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    }
  },
  'list': {
    'protected': async function (interaction) {
      await listHandler(interaction, 'protected');
    },
    'whitelisted': async function (interaction) {
      await listHandler(interaction, 'whitelisted');
    }
  }
};

// Handles list subcommands
async function listHandler(interaction, type) {
  const config = interaction.client.configurations['ping-protection']['configuration'];
  const embed = new MessageEmbed()
    .setColor('GREEN')
    .setFooter({ 
        text: interaction.client.strings.footer, 
        iconURL: interaction.client.strings.footerImgUrl 
    });

  if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();

  if (type === 'protected') {
    embed.setTitle(localize('ping-protection', 'list-protected-title'));
    embed.setDescription(localize('ping-protection', 'list-protected-desc'));

    const usersList = config.protectedUsers.length > 0 
    ? config.protectedUsers.map(id => `<@${id}>`).join('\n') 
    : localize('ping-protection', 'list-none');
    const rolesList = config.protectedRoles.length > 0 
    ? config.protectedRoles.map(id => `<@&${id}>`).join('\n') 
    : localize('ping-protection', 'list-none');

    embed.addFields([
      { name: localize('ping-protection', 'field-prot-users'), value: usersList, inline: true },
      { name: localize('ping-protection', 'field-prot-roles'), value: rolesList, inline: true }
    ]);

  } else if (type === 'whitelisted') {
    embed.setTitle(localize('ping-protection', 'list-whitelist-title'));
    embed.setDescription(localize('ping-protection', 'list-whitelist-desc'));

    const rolesList = config.ignoredRoles.length > 0 
    ? config.ignoredRoles.map(id => `<@&${id}>`).join('\n') 
    : localize('ping-protection', 'list-none');
    const channelsList = config.ignoredChannels.length > 0 
    ? config.ignoredChannels.map(id => `<#${id}>`).join('\n') 
    : localize('ping-protection', 'list-none');

    embed.addFields([
      { name: localize('ping-protection', 'field-wl-roles'), value: rolesList, inline: true },
      { name: localize('ping-protection', 'field-wl-channels'), value: channelsList, inline: true }
    ]);
  }

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

// Command definition
module.exports.config = {
  name: 'ping-protection',
  description: localize('ping-protection', 'cmd-desc-module'), 
  usage: '/ping-protection',
  type: 'slash',
  options: [
    {
            type: 'SUB_COMMAND_GROUP',
            name: 'user',
            description: localize('ping-protection', 'cmd-desc-group-user'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'history',
                    description: localize('ping-protection', 'cmd-desc-history'),
                    options: [{
                        type: 'USER',
                        name: 'user',
                        description: localize('ping-protection', 'cmd-opt-user'),
                        required: true
                    }]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'actions-history',
                    description: localize('ping-protection', 'cmd-desc-actions'),
                    options: [{
                        type: 'USER',
                        name: 'user',
                        description: localize('ping-protection', 'cmd-opt-user'),
                        required: true
                    }]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'panel',
                    description: localize('ping-protection', 'cmd-desc-panel'),
                    options: [{
                        type: 'USER',
                        name: 'user',
                        description: localize('ping-protection', 'cmd-opt-user'),
                        required: true
                    }]
                }
            ]
        },
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'list',
            description: localize('ping-protection', 'cmd-desc-group-list'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'protected',
                    description: localize('ping-protection', 'cmd-desc-list-protected')
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'whitelisted',
                    description: localize('ping-protection', 'cmd-desc-list-wl')
                }
            ]
        }
    ]
};