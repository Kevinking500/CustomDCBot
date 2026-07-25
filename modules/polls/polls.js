/**
 * Create and manage polls
 * @module polls
 */
const {scheduleJob} = require('node-schedule');
const {MessageEmbed} = require('discord.js');
const {
    renderProgressbar,
    formatDate,
    parseEmbedColor,
    truncate
} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');
const {
    protectMessage,
    unprotectMessage
} = require('../../src/functions/protectedMessages');

/**
 * Creates a new poll
 * @param {Object} data Data of the new poll
 * @param {Client} client Client
 * @return {Promise<void>}
 */
async function createPoll(data, client) {
    const votes = {};
    for (const vid in data.options) {
        votes[parseInt(vid) + 1] = [];
    }
    data.votes = votes;
    const id = await updateMessage(data.channel, data);

    await client.models['polls']['Poll'].create({
        messageID: id,
        description: data.description,
        options: data.options,
        channelID: data.channel.id,
        expiresAt: data.endAt,
        votes: votes,
        maxSelections: typeof data.maxSelections === 'number' ? data.maxSelections : 1
    });

    if (data.endAt) {
        client.jobs.push(scheduleJob(data.endAt, async () => {
            await updateMessage(data.channel, await client.models['polls']['Poll'].findOne({where: {messageID: id}}), id);
        }));
    }
}

module.exports.createPoll = createPoll;

/**
 * Updates a poll-message
 * @param {TextChannel} channel Channel in which the message is
 * @param {Object} data Data-Object (can be DB-Object)
 * @param {String} mID ID of already sent message
 * @return {Promise<*>}
 */
async function updateMessage(channel, data, mID = null) {
    const strings = channel.client.configurations['polls']['strings'];
    const config = channel.client.configurations['polls']['config'];

    let m;
    if (mID) m = await channel.messages.fetch(mID).catch(() => {
    });
    const embed = new MessageEmbed()
        .setTitle(strings.embed.title)
        .setColor(parseEmbedColor(strings.embed.color))
        .setDescription(data.description.replaceAll('[PUBLIC]', ''));
    let s = '';
    let p = '';
    let allVotes = 0;
    for (const vid in data.votes) {
        allVotes = allVotes + data.votes[vid].length;
    }
    for (const id in data.options) {
        if (!data.votes[(parseInt(id) + 1).toString()]) data.votes[(parseInt(id) + 1).toString()] = [];
        s = s + `${config.reactions[parseInt(id) + 1]}: ${data.options[id]} \`${data.votes[(parseInt(id) + 1).toString()].length}\`\n`;
        const percentage = 100 / allVotes * data.votes[(parseInt(id) + 1).toString()].length;
        p = p + `${config.reactions[parseInt(id) + 1]} ` + renderProgressbar(percentage) + ` ${!percentage ? '0' : percentage.toFixed(0)}% (${data.votes[(parseInt(id) + 1).toString()].length}/${allVotes})\n`;
    }
    embed.addField(strings.embed.options, s);
    embed.addField(strings.embed.liveView, p);
    embed.addField(strings.embed.visibility, localize('polls', `poll-${data.description.startsWith('[PUBLIC]') ? 'public' : 'private'}`));
    const optionCount = Object.keys(data.options).length;
    const rawMaxSelections = typeof data.maxSelections === 'number' ? data.maxSelections : 1;
    const effectiveMax = (rawMaxSelections === 0 || rawMaxSelections > optionCount) ? optionCount : rawMaxSelections;
    if (effectiveMax > 1) {
        embed.addField(localize('polls', 'max-selections-field'), rawMaxSelections === 0 ? localize('polls', 'max-selections-unlimited') : localize('polls', 'max-selections-limit', {n: effectiveMax}));
    }

    const options = [];
    for (const vId in data.options) {
        options.push({
            label: data.options[vId],
            value: vId,
            description: localize('polls', 'vote-this'),
            emoji: config.reactions[parseInt(vId) + 1]
        });
    }
    let expired = false;
    if (data.expiresAt || data.endAt) {
        const date = new Date(data.expiresAt || data.endAt);
        if (date.getTime() <= new Date().getTime()) {
            embed.setColor(parseEmbedColor(strings.embed.endedPollColor));
            embed.setTitle(strings.embed.endedPollTitle);
            expired = true;
        } else {
            embed.addField('\u200b', '\u200b');
            embed.addField(strings.embed.expiresOn, strings.embed.thisPollExpiresOn.split('%date%').join(formatDate(date)));
        }
    }

    const components = [
        /* eslint-disable camelcase */
        {
            type: 'ACTION_ROW',
            components: [{
                type: 'SELECT_MENU',
                disabled: expired,
                customId: 'polls-vote',
                min_values: 1,
                max_values: effectiveMax,
                placeholder: localize('polls', 'vote'),
                options
            }]
        },
        {
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                customId: 'polls-own-vote',
                'label': localize('polls', 'what-have-i-votet'),
                style: 'SUCCESS'
            }]
        }
    ];
    if (data.description.startsWith('[PUBLIC]')) components[1].components.push({
        type: 'BUTTON',
        customId: 'polls-public-votes',
        label: localize('polls', 'view-public-votes'),
        style: 'SECONDARY'
    });

    let r;
    if (m) r = await m.edit({embeds: [embed], components});
    else {
        r = await channel.send({embeds: [embed], components});
        // client is not in scope inside updateMessage, so use channel.client
        protectMessage(channel.client, channel.id, r.id);
    }
    // The ended poll message is kept, so unprotect it once voting is closed
    if (expired) unprotectMessage(channel.client, channel.id, r.id);
    return r.id;
}

module.exports.updateMessage = updateMessage;

/**
 * Builds the "public votes" embed (voters per option), shared by the polls-public-votes
 * button and the "View Poll Votes" context command.
 * @param {Interaction} interaction Interaction (used for client config + localize)
 * @param {Object} poll Poll DB-Object
 * @return {MessageEmbed}
 */
function buildPublicVotesEmbed(interaction, poll) {
    const embed = new MessageEmbed()
        .setTitle(localize('polls', 'view-public-votes'))
        .setColor(0xE67E22);
    for (const vId in poll.options) {
        const voters = [];
        for (const voterID of poll.votes[parseInt(vId, 10) + 1] || []) {
            voters.push('<@' + voterID + '>');
        }
        embed.addField(interaction.client.configurations['polls']['config']['reactions'][parseInt(vId, 10) + 1] + ' ' + poll.options[vId], truncate(voters.join(',') || '*' + localize('polls', 'no-votes-for-this-option') + '*', 1024));
    }
    return embed;
}

module.exports.buildPublicVotesEmbed = buildPublicVotesEmbed;