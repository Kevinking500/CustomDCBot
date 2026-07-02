const {localize} = require('../../../src/functions/localize');
const {
    formatDate,
    memberCanSendInChannel
} = require('../../../src/functions/helpers');
const durationParser = require('../../../src/functions/parseDuration');
const {planReminder} = require('../reminders');

const snoozeDurations = {
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

/**
 * Handle snooze button interactions for reminders
 * @param {Client} client Discord client
 * @param {Interaction} interaction Button interaction
 */
module.exports.run = async function (client, interaction) {

    /*
     * Modal submit from the "Create Reminder" context command. The customId encodes the
     * targeted message as create-reminder:<channelId>:<messageId>; we reconstruct it, parse
     * the WHEN duration the same way /remind-me does and run the existing planReminder() flow
     * with the message jump link as the reminder content.
     */
    if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit() && interaction.customId.startsWith('create-reminder:')) {
        const parts = interaction.customId.split(':');
        const channelId = parts[1];
        const messageId = parts[2];

        const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (!message) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('reminders', 'context-message-not-found')
        });

        if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('command', 'no-send-permission')
        });

        const duration = durationParser(interaction.fields.getTextInputValue('in'));
        const time = new Date(duration + new Date().getTime());
        if (!time || isNaN(time) || time.getTime() < new Date().getTime() + 55000) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('reminders', 'one-minute-in-future')
        });

        const reminderObject = await client.models['reminders']['Reminder'].create({
            userID: interaction.user.id,
            reminderText: localize('reminders', 'context-reminder-text', {url: message.url}),
            date: time,
            channelID: interaction.channelId
        });
        planReminder(client, reminderObject);
        return interaction.reply({
            ephemeral: true,
            content: '✅ ' + localize('reminders', 'reminder-set', {d: formatDate(time)})
        });
    }

    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('reminder-snooze-')) return;

    const parts = interaction.customId.split('-');
    const durationKey = parts[2];
    const reminderID = parts[3];
    const duration = snoozeDurations[durationKey];
    if (!duration) return;

    const originalReminder = await client.models['reminders']['Reminder'].findOne({where: {id: reminderID}});
    if (!originalReminder || originalReminder.userID !== interaction.user.id) {
        return interaction.reply({ephemeral: true, content: '⚠️ ' + localize('reminders', 'snooze-not-allowed')});
    }

    const newDate = new Date(new Date().getTime() + duration);
    const newReminder = await client.models['reminders']['Reminder'].create({
        userID: interaction.user.id,
        reminderText: originalReminder.reminderText,
        date: newDate,
        channelID: originalReminder.channelID
    });
    planReminder(client, newReminder);

    await interaction.update({components: []});
    await interaction.followUp({
        ephemeral: true,
        content: '✅ ' + localize('reminders', 'snoozed', {d: formatDate(newDate)})
    });
};