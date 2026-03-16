const { MessageFlags } = require('discord.js');
const { handleStatusRequest, handleStatusView, handleStatusList, handleStatusManage } = require('../staff-management');
const { localize } = require('../../../src/functions/localize');

module.exports.beforeSubcommand = async function (interaction) {
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ 
            flags: MessageFlags.Ephemeral 
        });
    }
};

module.exports.subcommands = {
    'loa': {
        'request': async function (interaction) {
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            await handleStatusRequest(interaction.client, interaction, 'LOA', duration, reason); 
        },
        'view': async function (interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            await handleStatusView(interaction.client, interaction, 'LOA', user);
        },
        'list': async function (interaction) {
            const filter = interaction.options.getString('filter');
            await handleStatusList(interaction.client, interaction, 'LOA', filter);
        },
        'admin': async function (interaction) { 
            const user = interaction.options.getMember('user');
            if (!user) return interaction.editReply({ 
                content: localize('staff-management-system', 'err-no-mem') 
            });
            await handleStatusManage(interaction.client, interaction, user, 'LOA');
        }
    },
    'ra': {
        'request': async function (interaction) {
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            await handleStatusRequest(interaction.client, interaction, 'RA', duration, reason); 
        },
        'view': async function (interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            await handleStatusView(interaction.client, interaction, 'RA', user);
        },
        'list': async function (interaction) {
            const filter = interaction.options.getString('filter');
            await handleStatusList(interaction.client, interaction, 'RA', filter);
        },
        'admin': async function (interaction) { 
            const user = interaction.options.getMember('user');
            if (!user) return interaction.editReply({ 
                content: localize('staff-management-system', 'err-no-mem') 
            });
            await handleStatusManage(interaction.client, interaction, user, 'RA');
        }
    }
};

module.exports.config = {
    name: 'status',
    description: localize('staff-management-system', 'cmd-desc-status'),
    usage: '/status',
    type: 'slash',
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'loa',
            description: localize('staff-management-system', 'cmd-desc-loa'),
            options: [
                { 
                    type: 'SUB_COMMAND', 
                    name: 'request', 
                    description: localize('staff-management-system', 'cmd-desc-loa-request'), 
                    options: [
                        { 
                            type: 'STRING', 
                            name: 'duration', 
                            description: localize('staff-management-system', 'cmd-desc-loar-duration'), 
                            required: true 
                        }, 
                        { 
                            type: 'STRING', 
                            name: 'reason', 
                            description: localize('staff-management-system', 'cmd-desc-loar-reason'), 
                            required: true 
                        }
                    ] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'view', 
                    description: localize('staff-management-system', 'cmd-desc-loa-view'), 
                    options: [
                        { 
                            type: 'USER', 
                            name: 'user', 
                            description: localize('staff-management-system', 'cmd-desc-loav-user'), 
                            required: false 
                        }
                    ] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'list', 
                    description: localize('staff-management-system', 'cmd-desc-loa-list'), 
                    options: [{ 
                        type: 'STRING', 
                        name: 'filter', 
                        description: localize('staff-management-system', 'cmd-desc-loal-filter'), 
                        required: true, 
                        choices: [
                        {
                            name: 'Active', 
                            value: 'active'
                        }, 
                        {
                            name: 'Expired', 
                            value: 'expired'
                        }, 
                        {
                            name: 'All', 
                            value: 'all'
                        }] 
                    }] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'admin', 
                    description: localize('staff-management-system', 'cmd-desc-loa-admin'), 
                    options: [
                        { 
                            type: 'USER', 
                            name: 'user', 
                            description: localize('staff-management-system', 'cmd-desc-loaa-user'), 
                            required: true 
                        }
                    ] 
                }
            ]
        },
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'ra',
            description: localize('staff-management-system', 'cmd-desc-ra'),
            options: [
                { 
                    type: 'SUB_COMMAND', 
                    name: 'request', 
                    description: localize('staff-management-system', 'cmd-desc-ra-request'), 
                    options: [
                        { 
                            type: 'STRING', 
                            name: 'duration', 
                            description: localize('staff-management-system', 'cmd-desc-rar-duration'),
                            required: true 
                        }, 
                        { 
                            type: 'STRING', 
                            name: 'reason', 
                            description: localize('staff-management-system', 'cmd-desc-rar-reason'),
                            required: true 
                        }
                    ] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'view', 
                    description: localize('staff-management-system', 'cmd-desc-ra-view'), 
                    options: [
                        { 
                        type: 'USER', 
                        name: 'user', 
                        description: localize('staff-management-system', 'cmd-desc-rav-user'),
                        required: false 
                    }] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'list', 
                    description: localize('staff-management-system', 'cmd-desc-ra-list'), 
                    options: [
                        { 
                        type: 'STRING', 
                        name: 'filter', 
                        description: localize('staff-management-system', 'cmd-desc-ral-filter'), 
                        required: true, 
                        choices: [
                            {
                                name: 'Active', 
                                value: 'active'
                            }, 
                            {
                                name: 'Expired', 
                                value: 'expired'
                            }, 
                            {
                                name: 'All', 
                                value: 'all'
                            }
                        ] 
                    }] 
                },
                { 
                    type: 'SUB_COMMAND', 
                    name: 'admin', 
                    description: localize('staff-management-system', 'cmd-desc-ra-admin'), 
                    options: [
                        { 
                            type: 'USER', 
                            name: 'user', 
                            description: localize('staff-management-system', 'cmd-desc-raa-user'), 
                            required: true 
                        }
                    ] 
                }
            ]
        }
    ]
};