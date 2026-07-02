const {scheduleJob} = require('node-schedule');
const {embedType, formatDiscordUserName} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

/**
 * Plan a reminder notification
 * @param {Client} client Discord client
 * @param {Object} notificationObject Reminder database object
 */
function planReminder(client, notificationObject) {
    if (!notificationObject.date || isNaN(notificationObject.date) || notificationObject.date.getTime() <= new Date().getTime()) return;
    const bj = scheduleJob(notificationObject.date, async () => {
        const member = await client.guild.members.fetch(notificationObject.userID).catch(() => {
        });
        if (!member) return;
        const channel = notificationObject.channelID === 'DM' ? await member.user.createDM() : client.guild.channels.cache.get(notificationObject.channelID);
        if (!channel) return;
        channel.send(embedType(client.configurations['reminders']['config']['notificationMessage'], {
            '%mention%': member.user.toString(),
            '%message%': notificationObject.reminderText,
            '%userTag%': formatDiscordUserName(member.user),
            '%userAvatarURL%': member.user.avatarURL()
        }, {

            /*
             * A reminder must only ever ping its owner. The reminder text is user-supplied
             * (free text via /remind-me, a message link via the context command), so restrict
             * mentions to the owner only - this blocks @everyone/@here, role pings and pinging
             * other users through the reminder body, regardless of the global everyone-protection.
             */
            allowedMentions: {users: [notificationObject.userID]},
            components: [{
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: `reminder-snooze-10m-${notificationObject.id}`,
                        label: localize('reminders', 'snooze-10m'),
                        emoji: '🔔'
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: `reminder-snooze-30m-${notificationObject.id}`,
                        label: localize('reminders', 'snooze-30m'),
                        emoji: '🔔'
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: `reminder-snooze-1h-${notificationObject.id}`,
                        label: localize('reminders', 'snooze-1h'),
                        emoji: '🔔'
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: `reminder-snooze-1d-${notificationObject.id}`,
                        label: localize('reminders', 'snooze-1d'),
                        emoji: '🔔'
                    }
                ]
            }]
        }));
    });
    client.jobs.push(bj);
}

module.exports.planReminder = planReminder;