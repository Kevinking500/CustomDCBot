/*
 * The reminders events/interactionCreate.js modal-submit branch handles the "Create Reminder"
 * context command. It reconstructs the targeted message from the customId, parses the WHEN
 * duration the same way /remind-me does and runs the existing planReminder() flow with the
 * message jump link as the reminder content.
 *
 * parseDuration is ESM-only and requires init(); we mock it deterministically.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key, replace) => `${file}.${key}:${JSON.stringify(replace || {})}`}));
jest.mock('../../src/functions/parseDuration', () => jest.fn());
jest.mock('../../src/functions/helpers', () => ({
    formatDate: () => 'FORMATTED',
    memberCanSendInChannel: jest.fn(() => true)
}));
jest.mock('../../modules/reminders/reminders', () => ({planReminder: jest.fn()}));

const durationParser = require('../../src/functions/parseDuration');
const {memberCanSendInChannel} = require('../../src/functions/helpers');
const {planReminder} = require('../../modules/reminders/reminders');
const handler = require('../../modules/reminders/events/interactionCreate');

const MESSAGE_URL = 'https://discord.com/channels/g/c1/m1';

function makeInteraction({
                             customId = 'create-reminder:c1:m1',
                             inValue = '2h'
                         } = {}) {
    return {
        isModalSubmit: () => true,
        isButton: () => false,
        customId,
        channelId: 'c1',
        channel: {id: 'c1'},
        member: {id: 'u1'},
        user: {id: 'u1'},
        fields: {getTextInputValue: jest.fn(() => inValue)},
        reply: jest.fn().mockResolvedValue()
    };
}

function makeClient({
                        message = {
                            id: 'm1',
                            url: MESSAGE_URL
                        }
                    } = {}) {
    const channel = {messages: {fetch: jest.fn().mockResolvedValue(message)}};
    return {
        channels: {
            cache: {get: () => channel},
            fetch: jest.fn().mockResolvedValue(channel)
        },
        models: {reminders: {Reminder: {create: jest.fn().mockImplementation((o) => Promise.resolve({id: 7, ...o}))}}}
    };
}

beforeEach(() => {
    durationParser.mockReset();
    planReminder.mockClear();
    memberCanSendInChannel.mockReset();
    memberCanSendInChannel.mockReturnValue(true);
});

describe('Create Reminder modal submit handler', () => {
    test('creates a reminder with the jump link and schedules it via planReminder', async () => {
        const interaction = makeInteraction({inValue: '2h'});
        const client = makeClient();
        durationParser.mockReturnValue(2 * 60 * 60 * 1000);

        await handler.run(client, interaction);

        expect(client.models.reminders.Reminder.create).toHaveBeenCalledTimes(1);
        const created = client.models.reminders.Reminder.create.mock.calls[0][0];
        expect(created.userID).toBe('u1');
        expect(created.channelID).toBe('c1');
        expect(created.reminderText).toContain(MESSAGE_URL);
        expect(planReminder).toHaveBeenCalledTimes(1);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('refuses a time under one minute in the future and does not schedule', async () => {
        const interaction = makeInteraction({inValue: '1s'});
        const client = makeClient();
        durationParser.mockReturnValue(1000);

        await handler.run(client, interaction);

        expect(client.models.reminders.Reminder.create).not.toHaveBeenCalled();
        expect(planReminder).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('one-minute-in-future');
    });

    test('refuses and does not schedule when the member cannot send in the channel', async () => {
        const interaction = makeInteraction({inValue: '2h'});
        const client = makeClient();
        durationParser.mockReturnValue(2 * 60 * 60 * 1000);
        memberCanSendInChannel.mockReturnValue(false);

        await handler.run(client, interaction);

        expect(client.models.reminders.Reminder.create).not.toHaveBeenCalled();
        expect(planReminder).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });

    test('replies when the targeted message can no longer be found', async () => {
        const interaction = makeInteraction();
        const client = makeClient({message: null});

        await handler.run(client, interaction);

        expect(planReminder).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('context-message-not-found');
    });
});