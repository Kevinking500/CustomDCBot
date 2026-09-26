const {
    generateHistoryResponse,
    generateActionsResponse,
    generateUserPanel,
    toggleUserProtection,
    isProtectionToggledOff
} = require('../ping-protection');
const {localize} = require('../../../src/functions/localize');
const {
    truncate,
    safeSetFooter,
    dateToDiscordTimestamp
} = require('../../../src/functions/helpers');
const {
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

// Handles subcommands
module.exports.subcommands = {
    'user': {
        'history': async function (interaction) {
            const user = interaction.options.getUser('user');
            const payload = await generateHistoryResponse(interaction.client, user.id, 1);
            await interaction.reply({
                ...payload,
                flags: MessageFlags.Ephemeral
            });
        },
        'actions-history': async function (interaction) {
            const user = interaction.options.getUser('user');
            const payload = await generateActionsResponse(interaction.client, user.id, 1);
            await interaction.reply({
                ...payload,
                flags: MessageFlags.Ephemeral
            });
        },
        'panel': async function (interaction) {
            const isManager = interaction.member?.permissions.has('Administrator') || interaction.member?.permissions.has('ManageGuild');
            if (!isManager) {
                return interaction.reply({
                    content: localize('ping-protection', 'no-permission'),
                    flags: MessageFlags.Ephemeral
                })
            }
            const user = interaction.options.getUser('user');
            const payload = await generateUserPanel(interaction.client, user);
            await interaction.reply({
                ...payload,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    'toggle': async function (interaction) {
        const generalConfig = interaction.client.configurations['ping-protection']?.['configuration'] || {};
        if (!generalConfig.allowProtectionToggle) {
            return interaction.reply({
                content: localize('ping-protection', 'toggle-disabled-by-admin'),
                flags: MessageFlags.Ephemeral
            });
        }

        const targetMember = interaction.member || interaction.user;
        const result = await toggleUserProtection(interaction.client, targetMember);

        if (!result.success) {
            if (result.reason === 'not-protected') {
                return interaction.reply({
                    content: localize('ping-protection', 'toggle-err-not-protected'),
                    flags: MessageFlags.Ephemeral
                });
            }
            return interaction.reply({
                content: localize('ping-protection', 'toggle-err-failed'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (result.state === 'disabled') {
            return interaction.reply({
                content: localize('ping-protection', 'toggle-succ-disabled', {
                    time: dateToDiscordTimestamp(result.disabledUntil, 'R')
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply({
            content: localize('ping-protection', 'toggle-succ-enabled'),
            flags: MessageFlags.Ephemeral
        });
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
// Handles list subcommands
async function listHandler(interaction, type) {
    const config = interaction.client.configurations['ping-protection']['configuration'];
    const embed = new EmbedBuilder()
        .setColor('Green');

    safeSetFooter(embed, interaction.client);

    if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();

    if (type === 'protected') {
        embed.setTitle(localize('ping-protection', 'list-protected-title'));
        embed.setDescription(localize('ping-protection', 'list-protected-desc'));

        let usersList = localize('ping-protection', 'list-none');
        if (Array.isArray(config.protectedUsers) && config.protectedUsers.length > 0) {
            const formattedUsers = await Promise.all(config.protectedUsers.map(async (id) => {
                const isOff = config.allowProtectionToggle
                    ? await isProtectionToggledOff(interaction.client, id)
                    : false;

                if (isOff) {
                    return `<@${id}> *(${localize('ping-protection', 'list-user-paused')})*`;
                }
                return `<@${id}>`;
            }));

            usersList = formattedUsers.join('\n');
        }

        const rolesList = Array.isArray(config.protectedRoles) && config.protectedRoles.length > 0
            ? config.protectedRoles.map(id => `<@&${id}>`).join('\n')
            : localize('ping-protection', 'list-none');

        embed.addFields([
            {
                name: localize('ping-protection', 'field-protected-users'),
                value: truncate(usersList, 1024),
                inline: true
            },
            {
                name: localize('ping-protection', 'field-protected-roles'),
                value: truncate(rolesList, 1024),
                inline: true
            }
        ]);

    } else if (type === 'whitelisted') {
        embed.setTitle(localize('ping-protection', 'list-whitelist-title'));
        embed.setDescription(localize('ping-protection', 'list-whitelist-desc'));

        const rolesList = Array.isArray(config.ignoredRoles) && config.ignoredRoles.length > 0
            ? config.ignoredRoles.map(id => `<@&${id}>`).join('\n')
            : localize('ping-protection', 'list-none');

        const channelsList = Array.isArray(config.ignoredChannels) && config.ignoredChannels.length > 0
            ? config.ignoredChannels.map(id => `<#${id}>`).join('\n')
            : localize('ping-protection', 'list-none');

        const usersList = Array.isArray(config.ignoredUsers) && config.ignoredUsers.length > 0
            ? config.ignoredUsers.map(id => `<@${id}>`).join('\n')
            : localize('ping-protection', 'list-none');

        embed.addFields([
            {
                name: localize('ping-protection', 'field-wl-roles'),
                value: truncate(rolesList, 1024),
                inline: true
            },
            {
                name: localize('ping-protection', 'field-wl-channels'),
                value: truncate(channelsList, 1024),
                inline: true
            },
            {
                name: localize('ping-protection', 'field-wl-users'),
                value: truncate(usersList, 1024),
                inline: true
            }
        ]);
    }

    await interaction.reply({
        embeds: [embed.toJSON()],
        flags: MessageFlags.Ephemeral
    });
}

module.exports.config = {
    name: 'ping-protection',
    description: localize('ping-protection', 'cmd-desc-module'),
    usage: '/ping-protection',
    type: 'slash',
    defaultPermission: false,
    options: function (client) {
        const array = [];

        const storageConfig = client.configurations['ping-protection']['storage'] || {};
        const generalConfig = client.configurations['ping-protection']['configuration'] || {};

        if (storageConfig.enablePingHistory) {
            array.push({
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
            });
        }

        if (generalConfig.allowProtectionToggle) {
            array.push({
                type: 'SUB_COMMAND',
                name: 'toggle',
                description: localize('ping-protection', 'cmd-desc-toggle')
            });
        }

        array.push({
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
        });

        return array;
    }
};