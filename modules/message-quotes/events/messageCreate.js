const { localize } = require('../../../src/functions/localize');
const { embedType, embedTypeV2 } = require('../../../src/functions/helpers');

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.guild || !msg.member) return;
    if (msg.author.bot || msg.system) return;
    if (msg.guild.id !== client.guildID) return;
    
    const moduleConfig = client.configurations['message-quotes']['config'];
    
    if (moduleConfig.channels.includes(msg.channel.id) || moduleConfig.channels.includes(msg.channel.parentId) || moduleConfig.channels.includes(msg.channel.parent?.parentId)) return;
    if (msg.member.roles.cache.some(r => moduleConfig.roles.some(br => String(br) === r.id))) return;    
    
    const discordLinkRegex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;
    const match = msg.content.match(discordLinkRegex);
    if (!match) return;
    
    const [_, guildId, channelId, messageId] = match;
    if (guildId !== msg.guild.id) return;
    
    try {
        const targetChannel = await msg.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) return;
        
        const botPerms = targetChannel.permissionsFor(msg.guild.members.me);
        if (!botPerms || !botPerms.has('ViewChannel') || !botPerms.has('ReadMessageHistory')) return;
        
        const targetMsg = await targetChannel.messages.fetch(messageId).catch(() => null);
        if (!targetMsg) return;
        
        if (moduleConfig.noBots === true && targetMsg.author.bot) return;
        
        let files = [];
        const withAttachments = moduleConfig.withAttachments;
        if (withAttachments && targetMsg.attachments.size > 0) {
            targetMsg.attachments.forEach(att => {
                files.push({
                    attachment: att.url,
                    name: att.name
                });
            });
        }
        
        const firstAttachment = targetMsg.attachments.first()?.url || '';
        const userAvatar = targetMsg.author.displayAvatarURL({ dynamic: true });
        const unixSeconds = Math.floor(targetMsg.createdTimestamp / 1000);
        const quoteMsg = await embedTypeV2(moduleConfig.message, {
           '%userID%': targetMsg.author.id,
           '%userName%': targetMsg.author.tag,
           '%userAvatar%': userAvatar,
           '%channelID%': targetChannel.id,
           '%channelName%': targetChannel.name,
           '%link%': match[0],
           '%image%': firstAttachment,
           '%timestamp%': `<t:${unixSeconds}:R>`,
           '%content%': targetMsg.content || ''
        });
        
        let finalFiles = quoteMsg.files && Array.isArray(quoteMsg.files) ? [...quoteMsg.files] : [];
        
        if (files.length > 0) {
            finalFiles = finalFiles.concat(files);
        }
        
        const sendOptions = {
            ...quoteMsg,
            files: finalFiles.length > 0 ? finalFiles : undefined
        };
        
        if (moduleConfig.asReply === true && moduleConfig.deleteOrigin !== true) {
            sendOptions.allowedMentions = { repliedUser: false };
            await msg.reply(sendOptions);
        } else {
            await msg.channel.send(sendOptions);
        }
        
        if (moduleConfig.deleteOrigin === true) {
            const currentChannelPerms = msg.channel.permissionsFor(msg.guild.members.me);
            if (currentChannelPerms && currentChannelPerms.has('ManageMessages')) {
                await msg.delete().catch(() => null);
            }
        }
    } catch(error) {
        client.logger.error('[Message-Quotes]' + error);
    };
};
