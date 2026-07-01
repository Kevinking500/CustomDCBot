const {
    embedTypeV2,
    formatDiscordUserName,
    archiveDiscordAttachment
} = require('../../src/functions/helpers');

/**
 * Renders a quoted message into the send-options used to repost it, exactly as the
 * messageCreate link-quote handler does. Factored so both the auto-quote event and the
 * "Quote Message" context-menu command produce identical output.
 *
 * Returns null when the quoted message should be skipped per module config (noBots, or
 * selfQuote=false when the quoter is the quoted author).
 *
 * @param {Client} client
 * @param {Message} targetMsg The message being quoted
 * @param {GuildChannel} targetChannel The channel the quoted message lives in
 * @param {string} link The message link rendered into the embed
 * @param {string} quoterID ID of the user triggering the quote (for the selfQuote check)
 * @returns {Promise<object|null>} discord.js send options, or null to skip
 */
async function buildQuoteMessage(client, targetMsg, targetChannel, link, quoterID) {
    const moduleConfig = client.configurations['message-quotes']['config'] || {};

    if (moduleConfig.noBots === true && targetMsg.author.bot) return null;
    if (moduleConfig.selfQuote === false && targetMsg.author.id === quoterID) return null;

    const files = [];
    const withAttachments = moduleConfig.withAttachments;
    if (withAttachments && targetMsg.attachments.size > 0) {
        let count = 0;
        for (const entry of targetMsg.attachments) {
            const att = entry[1];
            if (count >= 3) break;
            if (att.size > 8 * 1024 * 1024) continue;

            files.push({
                attachment: att.url,
                name: att.name ?? 'attachment'
            });
            count++;
        }
    }

    let finalImage = '';
    const firstAttachment = targetMsg.attachments.first();
    if (firstAttachment) {
        finalImage = await archiveDiscordAttachment(client, firstAttachment.url, {
            displayName: `Quote by ${formatDiscordUserName(targetMsg.author)} in #${targetChannel.name}`.slice(0, 100),
            tags: ['message-quotes'],
            uploaderDiscordID: targetMsg.author.id
        });
    } else {
        const imgMatch = targetMsg.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)/i);
        if (imgMatch) finalImage = imgMatch[0];
    }

    const userAvatar = targetMsg.author.displayAvatarURL();
    const unixSeconds = Math.floor(targetMsg.createdTimestamp / 1000);
    const displayContent = targetMsg.content ||
        (targetMsg.attachments.size > 0 ? '*[Attachment]*' : '') ||
        (targetMsg.stickers?.size > 0 ? '*[Sticker]*' : '*[None]*');

    const quoteMsg = await embedTypeV2(moduleConfig.message, {
        '%userID%': targetMsg.author.id,
        '%userName%': formatDiscordUserName(targetMsg.author),
        '%displayName%': targetMsg.member?.displayName || targetMsg.author.username,
        '%userAvatar%': userAvatar,
        '%channelID%': targetChannel.id,
        '%channelName%': targetChannel.name,
        '%link%': link,
        '%image%': finalImage,
        '%timestamp%': `<t:${unixSeconds}:R>`,
        '%content%': displayContent
    });

    let finalFiles = quoteMsg.files && Array.isArray(quoteMsg.files) ? [...quoteMsg.files] : [];
    if (files.length > 0) {
        finalFiles = finalFiles.concat(files);
    }

    const sendOptions = {
        ...quoteMsg,
        allowedMentions: {
            parse: [],
            repliedUser: false
        }
    };
    if (finalFiles.length > 0) sendOptions.files = finalFiles;
    else delete sendOptions.files;
    return sendOptions;
}

module.exports = {buildQuoteMessage};
