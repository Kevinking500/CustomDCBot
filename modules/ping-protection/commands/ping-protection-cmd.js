const { 
    fetchModHistory, 
    getPingCountInWindow,
    generateHistoryResponse,
    generateActionsResponse
} = require('../ping-protection');
const { embedType } = require('../../../src/functions/helpers');
const { localize } = require('../../../src/functions/localize');
const { MessageActionRow, MessageButton } = require('discord.js');
// Commands list and info
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
                { type: 'SUB_COMMAND', name: 'whitelisted', description: localize('ping-protection', 'cmd-desc-list-wl') }
            ]
        }
    ]
};
// Main commands handler
module.exports.run = async function (interaction) {
    if (!interaction.guild) return;
    
    const group = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand(false);
    const config = interaction.client.configurations['ping-protection']['configuration'];
    const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                    (interaction.client.config.admins || []).includes(interaction.user.id);
// Handles subcommands
    // Subcommand user
    if (group === 'user') {
        const user = interaction.options.getUser('user');

        if (subCmd === 'history') {
            const replyOptions = await generateHistoryResponse(interaction.client, user.id, 1);
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions); 
        }

        else if (subCmd === 'actions-history') {
            const replyOptions = await generateActionsResponse(interaction.client, user.id, 1);
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }

        else if (subCmd === 'panel') {
            if (!isAdmin) return interaction.reply({ content: localize('ping-protection', 'no-permission'), ephemeral: true });

            const pingerId = user.id;
            const storageConfig = interaction.client.configurations['ping-protection']['storage'];
            const timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
            
            const pingCount = await getPingCountInWindow(interaction.client, pingerId, timeframeWeeks);
            const modData = await fetchModHistory(interaction.client, pingerId, 1, 1000); 

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`ping-protection_history_${user.id}`).setLabel(localize('ping-protection', 'btn-history')).setStyle('SECONDARY'),
                new MessageButton().setCustomId(`ping-protection_actions_${user.id}`).setLabel(localize('ping-protection', 'btn-actions')).setStyle('SECONDARY'),
                new MessageButton().setCustomId(`ping-protection_delete_${user.id}`).setLabel(localize('ping-protection', 'btn-delete')).setStyle('DANGER')
            );

            const replyOptions = embedType({
                _schema: 'v3',
                embeds: [{
                    title: localize('ping-protection', 'panel-title', { u: user.tag }),
                    description: localize('ping-protection', 'panel-description', { u: user.toString(), i: user.id }),
                    color: 'BLUE',
                    thumbnailURL: user.displayAvatarURL({ dynamic: true }),
                    fields: [{
                        name: localize('ping-protection', 'field-quick-history', {w: timeframeWeeks}),
                        value: localize('ping-protection', 'field-quick-desc', { p: pingCount, m: modData.total }),
                        inline: false
                    }]
                }]
            });

            replyOptions.components = [row];
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }
    }
    // Subcommand list
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
            _schema: 'v3',
            embeds: [{
                title: title,
                description: contentList.join('\n'),
                color: 'GREEN'
            }]
        });

        replyOptions.ephemeral = false;
        await interaction.reply(replyOptions);
    }
};