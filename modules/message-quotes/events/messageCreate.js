const {buildQuoteMessage} = require('../renderQuote');
const cooldowns = new Map();

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.content || msg.author.bot || msg.system) return;
    if (!msg.guild || !msg.member) return;
    if (msg.guild.id !== client.guildID) return;

    const now = Date.now();
    const cooldownAmount = 5 * 1000;
    if (cooldowns.has(msg.author.id)) {
        const expirationTime = cooldowns.get(msg.author.id) + cooldownAmount;
        if (now < expirationTime) return;
    }

    const moduleConfig = client.configurations['message-quotes']['config'] || {};

    const blacklistedChannels = moduleConfig.channels || [];
    const blacklistedRoles = moduleConfig.roles || [];

    if (blacklistedChannels.includes(msg.channel.id) ||
        blacklistedChannels.includes(msg.channel.parentId) ||
        (msg.channel.parent?.parentId && blacklistedChannels.includes(msg.channel.parent.parentId))) {
        return;
    }

    if (msg.member.roles.cache.some(r => blacklistedRoles.some(br => String(br) === r.id))) return;

    const discordLinkRegex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;
    const match = msg.content.match(discordLinkRegex);
    if (!match) return;

    cooldowns.set(msg.author.id, now);

    const [_, guildId, channelId, messageId] = match;
    if (guildId !== msg.guild.id) return;

    try {
        const targetChannel = await msg.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) return;

        const userPerms = targetChannel.permissionsFor(msg.member);
        if (!userPerms || !userPerms.has('ViewChannel') || !userPerms.has('ReadMessageHistory')) return;

        const botPerms = targetChannel.permissionsFor(msg.guild.members.me);
        if (!botPerms || !botPerms.has('ViewChannel') || !botPerms.has('ReadMessageHistory')) return;

        const targetMsg = await targetChannel.messages.fetch(messageId).catch(() => null);
        if (!targetMsg) return;

        const sendOptions = await buildQuoteMessage(client, targetMsg, targetChannel, match[0], msg.author.id);
        if (!sendOptions) return;

        if (moduleConfig.asReply === true && moduleConfig.deleteOrigin !== true) {
            await msg.reply(sendOptions);
        } else {
            await msg.channel.send(sendOptions);
        }

        if (moduleConfig.deleteOrigin === true) {
            const currentChannelPerms = msg.channel.permissionsFor(msg.guild.members.me);
            if (currentChannelPerms && currentChannelPerms.has('ManageMessages')) {
                await msg.delete().catch(() => null);
            } else {
                client.logger.warn(`[Message-Quotes] Messages cannot deleted, missing Permission: ManageMessages`);
            }
        }
    } catch (error) {
        client.logger.error('[Message-Quotes]' + error);
    }
};