const { 
    addPing, 
    getPingCountInWindow, 
    executeAction, 
    sendPingWarning 
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');

module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['ping-protection']['configuration'];
    const storageConfig = client.configurations['ping-protection']['storage'];
    const moderationRules = client.configurations['ping-protection']['moderation'];
    
    if (!config) return;

    // Checks ignored channels
    if (config.ignoredChannels.includes(message.channel.id)) return;

    // Checks whitelisted roles
    const hasIgnoredRole = message.member.roles.cache.some(role => 
        config.ignoredRoles.includes(role.id)
    );
    if (hasIgnoredRole) return;

    // Reply logic
    if (message.type === 'REPLY' && config.allowReplyPings) {
    }

    // Detect pings
    const pingedProtectedRole = message.mentions.roles.some(role => 
        config.protectedRoles.includes(role.id)
    );
    
    const pingedProtectedUser = message.mentions.users.some(user => 
        config.protectedUsers.includes(user.id)
    );

    if (!pingedProtectedRole && !pingedProtectedUser) return;

    // Log pings if enabled
    if (storageConfig && storageConfig.enablePingHistory) {
        await addPing(client, message);
    }

    // Send warning
    const target = message.mentions.users.find(u => config.protectedUsers.includes(u.id)) 
                || message.mentions.roles.find(r => config.protectedRoles.includes(r.id));
                
    await sendPingWarning(client, message, target, config);

    // Moderation logic
    if (!moderationRules || !Array.isArray(moderationRules)) return;

    for (const rule of moderationRules) {
        if (!rule.enableModeration) continue;

        let triggerHit = false;
        let generatedReason = "";

        if (rule.advancedConfiguration) {
            // Advanced configuration
            const count = await getPingCountInWindow(client, message.author.id, rule.timeframeWeeks);
            
            if (count >= rule.pingsCountAdvanced) {
                triggerHit = true;
                generatedReason = localize('ping-protection', 'reason-advanced', {
                    c: count, 
                    w: rule.timeframeWeeks
                });
            }
        } else {
            // Basic configuration
            const globalWeeks = (storageConfig && storageConfig.pingHistoryRetention) ? storageConfig.pingHistoryRetention : 12;
            const count = await getPingCountInWindow(client, message.author.id, globalWeeks);

            if (count >= rule.pingsCountBasic) {
                triggerHit = true;
                generatedReason = localize('ping-protection', 'reason-basic', {
                    c: count, 
                    w: globalWeeks
                });
            }
        }

        if (triggerHit) {
            await executeAction(client, message.member, rule, generatedReason, storageConfig);
            break;
        }
    }
};