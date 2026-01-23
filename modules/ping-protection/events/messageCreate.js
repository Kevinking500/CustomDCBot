const { 
    addPing, 
    getPingCountInWindow, 
    executeAction, 
    sendPingWarning
} = require('../ping-protection');
const { Op } = require('sequelize');
const { localize } = require('../../../src/functions/localize');
const { randomElementFromArray } = require('../../../src/functions/helpers'); 

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

    if (message.author.bot) return;

    if (config.ignoredChannels.includes(message.channel.id)) return;
    if (config.ignoredUsers.includes(message.author.id)) return;
    if (message.member.roles.cache.some(role => config.ignoredRoles.includes(role.id))) return;

    // Check for protected pings
    const pingedProtectedRole = message.mentions.roles.some(role => config.protectedRoles.includes(role.id));
    let protectedMentions = message.mentions.users.filter(user => config.protectedUsers.includes(user.id));
    
    // Handles reply pings
    if (config.allowReplyPings && message.mentions.repliedUser) {
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
    if (target.id === message.author.id && config.selfPingConfiguration === "Allowed, and ignored") return;
    if (target.id === message.author.id && config.selfPingConfiguration === "Allowed, but with fun easter eggs") {
            const secretChance = 0.01; // Secret for a reason.. (1% chance)
            const standardMemes = [
                localize('ping-protection', 'meme-why'),
                localize('ping-protection', 'meme-played'),
                localize('ping-protection', 'meme-spider')
            ];
            const secretMeme = localize('ping-protection', 'meme-rick');
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
                selfPingCountMap.delete(message.author.id);
            } else if (currentCount === 5) {
                content = localize('ping-protection', 'meme-grind');
            } else {
                const lastIndex = lastMemeMap.get(message.author.id);

                let possibleMemes = standardMemes.map((_, index) => index);
                if (lastIndex !== undefined && lastIndex !== -1 && standardMemes.length > 1) {
                    possibleMemes = possibleMemes.filter(i => i !== lastIndex);
                }

                const randomIndex = randomElementFromArray(possibleMemes);
                content = standardMemes[randomIndex];
                lastMemeMap.set(message.author.id, randomIndex);
            }
            await message.reply({ content: content }).catch(() => {});
            return; 
    }

    // Log and process pings
    if (!!storageConfig && !!storageConfig.enablePingHistory) {      
        try {
            const isRole = !target.username; 
            await addPing(client, message.author.id, message.url, target.id, isRole);
        } catch (e) {}
    }

    await sendPingWarning(client, message, target, config);
    
    if (!moderationRules || !Array.isArray(moderationRules) || moderationRules.length === 0) return;

    const pingerId = message.author.id;
    
    for (let i = moderationRules.length - 1; i >= 0; i--) {
        const rule = moderationRules[i];
        
        let timeframeDays = 0;
        let retentionWeeks = (storageConfig && storageConfig.pingHistoryRetention) 
        ? storageConfig.pingHistoryRetention 
        : 12;

        if (!!rule.useCustomTimeframe) {
            timeframeDays = rule.timeframeDays || 7;
        } 
        else {
            timeframeDays = retentionWeeks * 7;
        }

        const pingCount = await getPingCountInWindow(client, pingerId, timeframeDays);
        const requiredCount = (rule.useCustomTimeframe) ? rule.pingsCountAdvanced : rule.pingsCountBasic;

        if (pingCount >= requiredCount) {
            const oneMinuteAgo = new Date(new Date() - 60000);
            try {
                const recentLog = await client.models['ping-protection']['ModerationLog'].findOne({
                    where: { 
                        victimID: message.author.id, 
                        createdAt: { [Op.gt]: oneMinuteAgo } 
                    }
                });
                if (recentLog) break;
            } catch (e) {}

            const generatedReason = (rule.useCustomTimeframe) 
                ? localize('ping-protection', 'reason-advanced', { 
                    c: pingCount, 
                    d: timeframeDays 
                })
                : localize('ping-protection', 'reason-basic', { 
                    c: pingCount, 
                    w: retentionWeeks 
                });

            let memberToPunish = message.member;
            if (!memberToPunish) {
                try { 
                    memberToPunish = await message.guild.members.fetch(message.author.id); 
                } catch (e) { continue; }
            }

            if (memberToPunish) {
                const success = await executeAction(
                    client,
                    memberToPunish,
                    rule,
                    generatedReason,
                    storageConfig,
                    message.channel,
                    { pingCount, timeframeDays }
                );
                
                if (success) break;
            }
        }
    }
};