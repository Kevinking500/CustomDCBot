const { 
    fetchPingHistory, 
    fetchModHistory, 
    getLeaverStatus 
} = require('../ping-protection');
const { 
    formatDate 
} = require('../../../src/functions/helpers');
const { localize } = require('../../../src/functions/localize');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');

// 1. Command Configuration (for SCNX internal loader)
// We embed the entire command structure (groups/options) inside the 'config' object.
module.exports.config = {
    name: 'ping-protection',
    description: localize('ping-protection', 'cmd-desc-module'), 
    usage: '/ping-protection',
    type: 'slash',
    
    // The entire Discord API command structure goes here, mirroring the 'options' array from before.
    options: [
        // --- GROUP: USER ---
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
        // --- GROUP: LIST ---
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'list',
            description: localize('ping-protection', 'cmd-desc-group-list'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'users',
                    description: localize('ping-protection', 'cmd-desc-list-users') 
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'roles',
                    description: localize('ping-protection', 'cmd-desc-list-roles') 
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'whitelisted',
                    description: localize('ping-protection', 'cmd-desc-list-white') 
                }
            ]
        }
    ]
};

// 2. Execution Function - Must be named 'run' for SCNX
module.exports.run = async function (interaction) {
    if (!interaction.guild) return;
    
    // FIX: Get subcommand group and subcommand without crashing if they don't exist
    const group = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand(false);
    
    // FIX: Correct the config file name key
    const config = interaction.client.configurations['ping-protection']['configuration'];

    // FINAL FALLBACK: If command structure is missing, inform the user (better than silence)
    if (!config || !group || !subCmd) {
        return interaction.reply({
            content: "⚠️ Command Structure Error (Synching issue). Please ensure the module is enabled and try reloading your Discord client (CTRL+R).",
            ephemeral: true
        });
    }

    const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                    (interaction.client.config.admins || []).includes(interaction.user.id);

    // GROUP: USER
    if (group === 'user') {
        const user = interaction.options.getUser('user');

        if (subCmd === 'history') {
            const history = await fetchPingHistory(interaction.client, user.id, 10);
            const leaverData = await getLeaverStatus(interaction.client, user.id);

            const embed = new MessageEmbed()
                .setTitle(localize('ping-protection', 'embed-history-title', { u: user.username }))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setColor('ORANGE');

            let description = "";

            if (leaverData) {
                description += `⚠️ ${localize('ping-protection', 'embed-leaver-warning', { 
                    t: formatDate(leaverData.leftAt) 
                })}\n\n`;
            }

            if (history.length === 0) {
                description += localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    return `${index + 1}. **[${formatDate(entry.timestamp)}]** [Jump to Message](${entry.messageUrl})`;
                });
                description += lines.join('\n');
            }

            embed.setDescription(description);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (subCmd === 'actions-history') {
            const history = await fetchModHistory(interaction.client, user.id, 10);
            
            const embed = new MessageEmbed()
                .setTitle(localize('ping-protection', 'embed-actions-title', { u: user.username }))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setColor('RED');

            if (history.length === 0) {
                embed.setDescription(localize('ping-protection', 'no-data-found'));
            } else {
                const lines = history.map((entry, index) => {
                    const duration = entry.actionDuration ? ` (${Math.round(entry.actionDuration / 60000)}m)` : '';
                    return `${index + 1}. **${entry.actionType}${duration}** - ${formatDate(entry.timestamp)}\n${localize('ping-protection', 'label-reason')}: ${entry.reason}`;
                });
                embed.setDescription(lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (subCmd === 'panel') {
            if (!isAdmin) {
                return interaction.reply({ 
                    content: localize('ping-protection', 'no-permission'), 
                    ephemeral: true 
                });
            }
            
            const user = interaction.options.getUser('user');

            const embed = new MessageEmbed()
                .setTitle(localize('ping-protection', 'panel-title', { u: user.tag }))
                .setDescription(localize('ping-protection', 'panel-description', { u: user.toString(), i: user.id }))
                .setColor('BLUE')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }));

            const row = new MessageActionRow().addComponents(
                new MessageButton()
                    .setCustomId(`ping-protection_history_${user.id}`)
                    .setLabel(localize('ping-protection', 'btn-history'))
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId(`ping-protection_actions_${user.id}`)
                    .setLabel(localize('ping-protection', 'btn-actions'))
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId(`ping-protection_delete_${user.id}`)
                    .setLabel(localize('ping-protection', 'btn-delete'))
                    .setStyle('DANGER')
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }

    // GROUP: LIST
    else if (group === 'list') {
        let contentList = [];
        let title = "";

        if (subCmd === 'roles') {
            title = localize('ping-protection', 'list-roles-title');
            contentList = config.protectedRoles.map(id => `<@&${id}>`);
        } else if (subCmd === 'users') {
            title = localize('ping-protection', 'list-members-title');
            contentList = config.protectedUsers.map(id => `<@${id}>`);
        } else if (subCmd === 'whitelisted') {
            title = localize('ping-protection', 'list-whitelist-title');
            contentList = config.ignoredRoles.map(id => `<@&${id}>`);
        }

        if (contentList.length === 0) contentList = [localize('ping-protection', 'list-empty')];

        const embed = new MessageEmbed()
            .setTitle(title)
            .setDescription(contentList.join('\n'))
            .setColor('GREEN');

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};