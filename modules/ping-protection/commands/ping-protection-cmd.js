const { 
    fetchPingHistory, 
    fetchModHistory, 
    getLeaverStatus,
    getPingCountInWindow,
} = require('../ping-protection');
const { formatDate, embedType } = require('../../../src/functions/helpers');
const { localize } = require('../../../src/functions/localize');
const { MessageActionRow, MessageButton } = require('discord.js');

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
                { type: 'SUB_COMMAND', name: 'history', description: localize('ping-protection', 'cmd-desc-history'), options: [{ type: 'USER', name: 'user', description: localize('ping-protection', 'cmd-opt-user'), required: true }] },
                { type: 'SUB_COMMAND', name: 'actions-history', description: localize('ping-protection', 'cmd-desc-actions'), options: [{ type: 'USER', name: 'user', description: localize('ping-protection', 'cmd-opt-user'), required: true }] },
                { type: 'SUB_COMMAND', name: 'panel', description: localize('ping-protection', 'cmd-desc-panel'), options: [{ type: 'USER', name: 'user', description: localize('ping-protection', 'cmd-opt-user'), required: true }] }
            ]
        },
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'list',
            description: localize('ping-protection', 'cmd-desc-group-list'),
            options: [
                { type: 'SUB_COMMAND', name: 'users', description: localize('ping-protection', 'cmd-desc-list-users') },
                { type: 'SUB_COMMAND', name: 'roles', description: localize('ping-protection', 'cmd-desc-list-roles') },
                { type: 'SUB_COMMAND', name: 'whitelisted', description: localize('ping-protection', 'cmd-desc-list-white') }
            ]
        }
    ]
};

// Commands handler
module.exports.run = async function (interaction) {
    if (!interaction.guild) return;
    
    const group = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand(false);
    const config = interaction.client.configurations['ping-protection']['configuration'];
    const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                    (interaction.client.config.admins || []).includes(interaction.user.id);

    if (group === 'user') {
        const user = interaction.options.getUser('user');

        // Subcommand history
        if (subCmd === 'history') {
            const page = 1;
            const limit = 8;
            const { total, history } = await fetchPingHistory(interaction.client, user.id, page, limit);
            const leaverData = await getLeaverStatus(interaction.client, user.id);
            const totalPages = Math.ceil(total / limit) || 1;

            let description = "";
            if (leaverData) {
                description += `⚠️ ${localize('ping-protection', 'embed-leaver-warning', { t: formatDate(leaverData.leftAt) })}\n\n`;
            }

            if (history.length === 0) {
                description += localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    const ts = Math.floor(new Date(entry.createdAt).getTime() / 1000);
                    let targetString = "Unknown";
                    if (entry.targetId) {
                        targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`; 
                    } else {
                        targetString = "Detected"; 
                    }
                    return `${(page - 1) * limit + index + 1}. **Pinged ${targetString}** at <t:${ts}:f> (<t:${ts}:R>)\n[Jump to Message](${entry.messageUrl})`;
                });
                description += lines.join('\n\n');
            }

            // Buttons
            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`ping-protection_hist-page_${user.id}_${page - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(true),
                new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${page}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
                new MessageButton().setCustomId(`ping-protection_hist-page_${user.id}_${page + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(totalPages <= 1)
            );

            const replyOptions = embedType({
                title: localize('ping-protection', 'embed-history-title', { u: user.username }),
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                description: description,
                color: 'ORANGE'
            });

            replyOptions.components = [row];
            replyOptions.ephemeral = false;

            await interaction.reply(replyOptions); 
        }

        // Subcommand actions history
        else if (subCmd === 'actions-history') {
            const history = await fetchModHistory(interaction.client, user.id, 15);
            
            let description = "";
            if (history.length === 0) {
                description = localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
                    const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
                    return `${index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
                });
                description = lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
            }

            const replyOptions = embedType({
                title: localize('ping-protection', 'embed-actions-title', { u: user.username }),
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                description: description,
                color: 'RED'
            });
            
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }

        // Subcammand panel
        else if (subCmd === 'panel') {
            if (!isAdmin) return interaction.reply({ content: localize('ping-protection', 'no-permission'), ephemeral: true });

            const user = interaction.options.getUser('user');
            const pingerId = user.id;
            const storageConfig = interaction.client.configurations['ping-protection']['storage'];
            const timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
            
            const pingCount = await getPingCountInWindow(interaction.client, pingerId, timeframeWeeks);
            const modHistory = await fetchModHistory(interaction.client, pingerId, 1000);
            const modActionCount = modHistory.length; 

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`ping-protection_history_${user.id}`).setLabel(localize('ping-protection', 'btn-history')).setStyle('SECONDARY'),
                new MessageButton().setCustomId(`ping-protection_actions_${user.id}`).setLabel(localize('ping-protection', 'btn-actions')).setStyle('SECONDARY'),
                new MessageButton().setCustomId(`ping-protection_delete_${user.id}`).setLabel(localize('ping-protection', 'btn-delete')).setStyle('DANGER')
            );

            const replyOptions = embedType({
                title: localize('ping-protection', 'panel-title', { u: user.tag }),
                description: localize('ping-protection', 'panel-description', { u: user.toString(), i: user.id }),
                color: 'BLUE',
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                fields: [{
                    name: localize('ping-protection', 'field-quick-history', {w: timeframeWeeks}),
                    value: localize('ping-protection', 'field-quick-desc', { p: pingCount, m: modActionCount }),
                    inline: false
                }]
            });

            replyOptions.components = [row];
            replyOptions.ephemeral = false;

            await interaction.reply(replyOptions);
        }
    }

    // Subcommand group list
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

        const replyOptions = embedType({
            title: title,
            description: contentList.join('\n'),
            color: 'GREEN'
        });

        replyOptions.ephemeral = false;
        await interaction.reply(replyOptions);
    }
};