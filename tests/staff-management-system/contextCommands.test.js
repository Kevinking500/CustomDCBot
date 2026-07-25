/*
 * Tests for the staff-management-system USER context-menu commands and their shared core
 * (context-actions.js). The commands are thin adapters that show a modal/select gated by the
 * module's runtime SUPERVISOR check; the submitted data is routed back to the shared
 * issueInfraction / promoteUser / submitReview cores via the handlers here. localize is mocked so
 * the new description keys need not resolve, and the staff-management core is mocked so we assert
 * the handlers call it with the resolved target + collected fields (not the real DB logic).
 */
// Return just the key (kept short so TextInput/modal label length limits are never exceeded).
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => key}));

const mockIssueInfraction = jest.fn().mockResolvedValue('inf');
const mockPromoteUser = jest.fn().mockResolvedValue('promo');
const mockSubmitReview = jest.fn().mockResolvedValue('rev');
const mockState = {supervisor: true};

jest.mock('../../modules/staff-management-system/staff-management', () => ({
    getConfig: (client, file) => (client.configurations['staff-management-system'][file]),
    checkStaffPermissions: () => mockState.supervisor,
    issueInfraction: mockIssueInfraction,
    promoteUser: mockPromoteUser,
    submitReview: mockSubmitReview
}));

const issueInfraction = mockIssueInfraction;
const promoteUser = mockPromoteUser;
const submitReview = mockSubmitReview;

const actions = require('../../modules/staff-management-system/context-actions');
const infractCmd = require('../../modules/staff-management-system/commands/issue-infraction');
const promoteCmd = require('../../modules/staff-management-system/commands/promote-user');
const reviewCmd = require('../../modules/staff-management-system/commands/submit-review');

function makeClient() {
    return {
        configurations: {
            'staff-management-system': {
                configuration: {supervisorRoles: ['sup']},
                infractions: {infractionTypes: ['Warning', 'Strike', 'Suspension']}
            }
        },
        users: {
            fetch: jest.fn(id => Promise.resolve({
                id,
                tag: id + '#0'
            }))
        }
    };
}

function makeInteraction(over = {}) {
    const client = makeClient();
    return {
        client,
        member: {
            id: 'mod',
            roles: {cache: {some: () => true}}
        },
        targetUser: {id: 'target'},
        guild: {
            members: {
                fetch: jest.fn(id => Promise.resolve({
                    id,
                    user: {id}
                }))
            },
            roles: {
                cache: {
                    get: id => ({
                        id,
                        name: 'Role ' + id
                    })
                }
            }
        },
        showModal: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue(),
        ...over
    };
}

beforeEach(() => {
    mockState.supervisor = true;
    issueInfraction.mockClear();
    promoteUser.mockClear();
    submitReview.mockClear();
});

describe('config shapes', () => {
    test('Issue Infraction: USER, MANAGE_GUILD coarse gate', () => {
        expect(infractCmd.config.name).toBe('Issue Infraction');
        expect(infractCmd.config.type).toBe('USER');
        expect(infractCmd.config.contextMenu).toBe(true);
        expect(infractCmd.config.defaultMemberPermissions).toEqual(['MANAGE_GUILD']);
    });
    test('Promote User: USER, MANAGE_GUILD coarse gate', () => {
        expect(promoteCmd.config.defaultMemberPermissions).toEqual(['MANAGE_GUILD']);
        expect(promoteCmd.config.type).toBe('USER');
    });
    test('Submit Review: USER, everyone (no defaultMemberPermissions)', () => {
        expect(reviewCmd.config.name).toBe('Submit Review');
        expect(reviewCmd.config.defaultMemberPermissions).toBeUndefined();
    });
});

describe('Issue Infraction adapter (supervisor gate + modal)', () => {
    test('non-supervisor is rejected ephemerally and no modal is shown', async () => {
        mockState.supervisor = false;
        const interaction = makeInteraction();
        await infractCmd.run(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-gen-no-perm')}));
    });
    test('supervisor sees a modal whose customId encodes the target and excludes Suspension type', async () => {
        const interaction = makeInteraction();
        await infractCmd.run(interaction);
        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe('staff-mgmt_ctx-infract_target');
        const select = modal.components[0].component;
        const values = select.options.map(o => o.value);
        expect(values).toContain('Warning');
        expect(values).not.toContain('Suspension');
    });
});

describe('Issue Infraction modal handler', () => {
    test('runs issueInfraction with resolved member + collected fields', async () => {
        const interaction = {
            client: makeClient(),
            member: {id: 'mod'},
            guild: {
                members: {
                    fetch: jest.fn(() => Promise.resolve({
                        id: 'target',
                        user: {id: 'target'}
                    }))
                }
            },
            fields: {
                getStringSelectValues: () => ['Warning'],
                getTextInputValue: (k) => (k === 'reason' ? 'bad' : '7d')
            },
            reply: jest.fn()
        };
        await actions.handleInfractionModal(interaction.client, interaction, 'target');
        expect(issueInfraction).toHaveBeenCalledWith(interaction.client, interaction, expect.objectContaining({id: 'target'}), 'Warning', 'bad', '7d');
    });
    test('non-supervisor rejected before core runs', async () => {
        mockState.supervisor = false;
        const interaction = {
            client: makeClient(),
            member: {id: 'mod'},
            reply: jest.fn(),
            guild: {members: {fetch: jest.fn()}}
        };
        await actions.handleInfractionModal(interaction.client, interaction, 'target');
        expect(issueInfraction).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
    });
});

describe('Promote User adapter (supervisor gate + role select)', () => {
    test('non-supervisor rejected, no select shown', async () => {
        mockState.supervisor = false;
        const interaction = makeInteraction();
        await promoteCmd.run(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-gen-no-perm')}));
    });
    test('supervisor: replies with a role select encoding the target', async () => {
        const interaction = makeInteraction();
        await promoteCmd.run(interaction);
        const payload = interaction.reply.mock.calls[0][0];
        const select = payload.components[0].toJSON().components[0];
        expect(select.custom_id).toBe('staff-mgmt_ctx-promote_target');
    });
});

describe('Promote User select handler', () => {
    test('runs promoteUser with chosen role and a null-channel options shim', async () => {
        const role = {
            id: 'r1',
            name: 'Senior'
        };
        const interaction = {
            client: makeClient(),
            member: {id: 'mod'},
            guild: {
                members: {
                    fetch: jest.fn(() => Promise.resolve({
                        id: 'target',
                        user: {id: 'target'}
                    }))
                },
                roles: {cache: {get: () => role}}
            },
            roles: {first: () => role},
            values: ['r1'],
            reply: jest.fn()
        };
        await actions.handlePromoteSelect(interaction.client, interaction, 'target');
        expect(promoteUser).toHaveBeenCalledTimes(1);
        const [, passedInteraction, member, passedRole, reason] = promoteUser.mock.calls[0];
        expect(member).toEqual(expect.objectContaining({id: 'target'}));
        expect(passedRole).toBe(role);
        expect(reason).toBeNull();
        // the shim must provide options.getChannel returning null (modal/select have no options)
        expect(passedInteraction.options.getChannel('channel')).toBeNull();
    });
});

describe('Submit Review adapter (everyone + modal)', () => {
    test('shows a modal encoding the target (no supervisor gate)', async () => {
        const interaction = makeInteraction();
        await reviewCmd.run(interaction);
        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe('staff-mgmt_ctx-review_target');
    });
});

describe('Submit Review modal handler', () => {
    test('runs submitReview with parsed stars + comment', async () => {
        const interaction = {
            client: makeClient(),
            fields: {getTextInputValue: (k) => (k === 'stars' ? '4' : 'great work')},
            reply: jest.fn()
        };
        await actions.handleReviewModal(interaction.client, interaction, 'target');
        expect(submitReview).toHaveBeenCalledWith(interaction.client, interaction, expect.objectContaining({id: 'target'}), 4, 'great work');
    });
    test('rejects non-numeric / out-of-range stars before core runs', async () => {
        const interaction = {
            client: makeClient(),
            fields: {getTextInputValue: (k) => (k === 'stars' ? '9' : 'x')},
            reply: jest.fn()
        };
        await actions.handleReviewModal(interaction.client, interaction, 'target');
        expect(submitReview).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('ctx-review-invalid-stars')}));
    });
});