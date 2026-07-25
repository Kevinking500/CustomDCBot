const {ChannelType} = require('discord.js');
const {
    embedType,
    disableModule
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {
    protectMessage,
    unprotectMessage,
    registerProtectedMessageProvider
} = require('../../../src/functions/protectedMessages');

// Restore auto-delete protection for ticket panels from the database on startup.
registerProtectedMessageProvider(async (client) => {
    if (!client.modules['tickets']?.enabled) return [];
    const rows = await client.models['tickets']['TicketMessage'].findAll({attributes: ['channelID', 'messageID']});
    return rows
        .filter(r => r.channelID && r.messageID)
        .map(r => ({
            channelId: r.channelID,
            messageId: r.messageID
        }));
});

module.exports.run = async function (client) {
    const moduleConfig = client.configurations['tickets']['config'];
    const messageModel = client.models['tickets']['TicketMessage'];
    for (const element of moduleConfig) {
        for (const element2 of moduleConfig) {
            if (moduleConfig.indexOf(element) === moduleConfig.indexOf(element2) && moduleConfig.indexOf(element) !== moduleConfig.indexOf(element2)) return disableModule('tickets', localize('tickets', 'button-not-uniqe'));
        }
        const channel = await client.channels.fetch(element['ticket-create-channel']).catch(() => {
        });
        if (!channel || channel.guild.id !== client.config.guildID || channel.type !== ChannelType.GuildText) return disableModule('tickets', localize('tickets', 'channel-not-found', {c: element['ticket-create-channel']}));
        const components = [{
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                label: element['ticket-create-button'],
                style: 'PRIMARY',
                customId: 'create-ticket-' + moduleConfig.indexOf(element)
            }]
        }];
        const message = embedType(element['ticket-create-message'], {}, {components});

        const sent = await client.models['tickets']['TicketMessage'].findOne({
            where: {
                type: moduleConfig.indexOf(element)
            }
        });
        if (sent) {
            const channelMessages = await channel.messages.fetch(sent.messageID).catch(() => {
            });
            if (channelMessages && channelMessages.author.id === client.user.id) {
                await channelMessages.edit(message);

                /* Protect the existing panel surviving a restart so auto-delete keeps it. */
                protectMessage(client, channel.id, channelMessages.id);
            } else {

                /* Old stored panel is gone or not ours, drop its protection before recreating. */
                unprotectMessage(client, sent.channelID || channel.id, sent.messageID);
                await sendMessage(message, channel, messageModel, moduleConfig, element);
            }
        } else {
            await sendMessage(message, channel, messageModel, moduleConfig, element);
        }
    }

};

/**
 * Send the ticket-creation-message
 * @param message the message to be sent
 * @param channel the channel it will be sent to
 * @param messageModel the model the ids of the new message and its channel will be saved to
 * @param moduleConfig needed to find the right row in the model
 * @param element needed to find the right row in the model
 * @returns {Promise<void>}
 */
async function sendMessage(message, channel, messageModel, moduleConfig, element) {
    const msg = await channel.send(message);

    /* client is not in scope here, use channel.client. Protect the freshly posted panel. */
    protectMessage(channel.client, channel.id, msg.id);
    const exists = await messageModel.findOne({
        where: {
            type: moduleConfig.indexOf(element)
        }
    });
    if (exists) {
        await messageModel.update({
            messageID: msg.id,
            channelID: channel.id
        }, {
            where: {
                type: moduleConfig.indexOf(element)
            }
        });
    } else {
        await messageModel.create({
            messageID: msg.id,
            channelID: channel.id,
            type: moduleConfig.indexOf(element)
        });
    }
}