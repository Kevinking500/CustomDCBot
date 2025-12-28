const { 
    addPing, 
    getPingCountInWindow, 
    executeAction, 
    sendPingWarning
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
// Tracks the last meme to prevent many duplicates
const lastMemeMap = new Map();
// Tracks ping counts for the grind message
const selfPingCountMap = new Map();
// Handles messages
module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.guild.id !== client.guildID) return;

    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];
    
    if (!config) return;

    if (message.author.bot) return;

    if (config.ignoredChannels.includes(message.channel.id)) return;
    if (message.member.roles.cache.some(role => config.ignoredRoles.includes(role.id))) return;

    // Check for protected pings
    const pingedProtectedRole = message.mentions.roles.some(role => config.protectedRoles.includes(role.id));
    let protectedMentions = message.mentions.users.filter(user => config.protectedUsers.includes(user.id));
    // Handles reply pings
    if (config.allowReplyPings && message.type === 'REPLY' && message.mentions.repliedUser) {
        const repliedId = message.mentions.repliedUser.id;
        
        if (protectedMentions.has(repliedId)) {
            const manualMentionRegex = new RegExp(`<@!?${repliedId}>`);
            const isManualPing = manualMentionRegex.test(message.content);

            if (!isManualPing) {
                protectedMentions.delete(repliedId);
            }
        }
    }
    // Determines if any protected entities were pinged
    const pingedProtectedUser = protectedMentions.size > 0;

    if (!pingedProtectedRole && !pingedProtectedUser) return;
    
    let target = null;
    if (pingedProtectedUser) {
        target = protectedMentions.first();
    } else if (pingedProtectedRole) {
        target = message.mentions.roles.find(r => config.protectedRoles.includes(r.id));
    }

    if (!target) return; 

    // Funny easter egg when they ping themselves
    if (target.id === message.author.id) {
        const secretChance = 0.01; // Secret for a reason.. (1% chance)
        const standardMemes = [
            '[Why are you the way that you are?](<https://www.youtube.com/watch?v=NY9UZI1OUMI>) - You just pinged yourself..',
            '🔑 [Congratulations, you played yourself.](<https://www.youtube.com/watch?v=Lr7CKWxqhtw>)',
            '🕷️ [Is this you?](<https://i.kym-cdn.com/entries/icons/original/000/023/397/C-658VsXoAo3ovC.jpg>) - You just pinged yourself.'
        ];
        const secretMeme = '🎵 [Never gonna give you up, never gonna let you down...](<https://www.youtube.com/watch?v=dQw4w9WgXcQ>) You just Rick Rolled yourself. Also congrats you unlocked the secret easter egg that only has a 1% chance of appearing!!1!1!!';
        const currentCount = (selfPingCountMap.get(message.author.id) || 0) + 1;
        selfPingCountMap.set(message.author.id, currentCount);

        setTimeout(() => {
            selfPingCountMap.delete(message.author.id);
        }, 300000);

        const roll = Math.random();
        let content = '';

        if (roll < secretChance) {
            content = secretMeme;
            lastMemeMap.set(message.author.id, -1);
            selfPingCountMap.delete(message.author.id); // Reset on secret unlock
        } else if (currentCount === 5) {
            content = 'Why are you even pinging yourself 5 times in a row? Anyways continue some more to possibly get the secret meme\n-# (good luck grinding, only a 1% chance of getting it and during testing I had it once after 83 pings)';
        } else {
            const lastIndex = lastMemeMap.get(message.author.id);

            let possibleMemes = standardMemes.map((_, index) => index);
            if (lastIndex !== undefined && lastIndex !== -1 && standardMemes.length > 1) {
                possibleMemes = possibleMemes.filter(i => i !== lastIndex);
            }

            const randomIndex = possibleMemes[Math.floor(Math.random() * possibleMemes.length)];
            content = standardMemes[randomIndex];
            lastMemeMap.set(message.author.id, randomIndex);
        }
        await message.reply({ content: content }).catch(() => {});
        return; 
    }

    let pingCount = 0;
    const pingerId = message.author.id;
    let timeframeWeeks = 12;
    let rule1 = (moderationRules && Array.isArray(moderationRules) && moderationRules.length > 0) ? moderationRules[0] : null;

    if (!!storageConfig && !!storageConfig.enablePingHistory) {      
        try {
            await addPing(client, message, target);
            if (rule1 && !!rule1.advancedConfiguration) {
                timeframeWeeks = rule1.timeframeWeeks;
            } else {
                timeframeWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12; 
            }
            pingCount = await getPingCountInWindow(client, pingerId, timeframeWeeks);
        } catch (e) {}
    }
    // Send warning if enabled and moderation actions
    await sendPingWarning(client, message, target, config);
    
    if (!rule1 || !rule1.enableModeration) return;
    
    let requiredCount = 0;
    let generatedReason = "";

    if (!!rule1.advancedConfiguration) {
        requiredCount = rule1.pingsCountAdvanced;
        generatedReason = localize('ping-protection', 'reason-advanced', { c: pingCount, w: rule1.timeframeWeeks });
    } else {
        requiredCount = rule1.pingsCountBasic;
        generatedReason = localize('ping-protection', 'reason-basic', { c: pingCount, w: timeframeWeeks });
    }

    if (pingCount >= requiredCount) {
        const { Op } = require('sequelize');
        const oneMinuteAgo = new Date(new Date() - 60000);
        try {
            const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
                where: { victimID: message.author.id, createdAt: { [Op.gt]: oneMinuteAgo } }
            });
            if (recentLog) return; 
        } catch (e) {}

        let memberToPunish = message.member;
        if (!memberToPunish) {
            try { memberToPunish = await message.guild.members.fetch(message.author.id); } catch (e) { return; }
        }
        await executeAction(client, memberToPunish, rule1, generatedReason, storageConfig);
    }
};