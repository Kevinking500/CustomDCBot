/*
 * Tests for the welcomer USER context-menu commands (Check Welcome Status / Assign Join Roles /
 * Restore Base Roles). All three are thin adapters over the same primitives the automatic
 * base-role flow uses (isInHoldingState / evaluateMember / roles.add). localize is mocked so the
 * new description keys need not resolve, and baseRoles is mocked so we drive the holding-state and
 * missing-roles decisions directly and assert the resulting reply / role mutation.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => key}));

const mockIsInHoldingState = jest.fn();
const mockEvaluateMember = jest.fn();
jest.mock('../../modules/welcomer/baseRoles', () => ({
    isInHoldingState: (...a) => mockIsInHoldingState(...a),
    evaluateMember: (...a) => mockEvaluateMember(...a)
}));

const {MessageFlags} = require('discord.js');
const checkCmd = require('../../modules/welcomer/commands/check-welcome-status');
const assignCmd = require('../../modules/welcomer/commands/assign-join-roles');
const restoreCmd = require('../../modules/welcomer/commands/restore-base-roles');

function makeInteraction({
                             config = {},
                             targetRoleIDs = []
                         } = {}) {
    const rolesAdd = jest.fn().mockResolvedValue();
    return {
        rolesAdd,
        client: {
            configurations: {
                welcomer: {
                    config: {
                        'give-roles-on-join': ['r1', 'r2'],
                        'treat-welcome-roles-as-base-roles': true,
                        ...config
                    }
                }
            },
            logger: {
                info: jest.fn(),
                error: jest.fn()
            }
        },
        targetUser: {
            id: 'target',
            toString: () => '<@target>'
        },
        targetMember: {
            id: 'target',
            user: {
                id: 'target',
                toString: () => '<@target>'
            },
            roles: {
                cache: {has: id => targetRoleIDs.includes(id)},
                add: rolesAdd
            }
        },
        guild: {members: {fetch: jest.fn()}},
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    mockIsInHoldingState.mockReset();
    mockEvaluateMember.mockReset();
});

describe('config shapes', () => {
    test('Check Welcome Status: USER, MANAGE_GUILD', () => {
        expect(checkCmd.config.name).toBe('Check Welcome Status');
        expect(checkCmd.config.type).toBe('USER');
        expect(checkCmd.config.contextMenu).toBe(true);
        expect(checkCmd.config.defaultMemberPermissions).toEqual(['MANAGE_GUILD']);
    });
    test('Assign Join Roles: USER, MANAGE_ROLES', () => {
        expect(assignCmd.config.defaultMemberPermissions).toEqual(['MANAGE_ROLES']);
    });
    test('Restore Base Roles: USER, MANAGE_ROLES', () => {
        expect(restoreCmd.config.defaultMemberPermissions).toEqual(['MANAGE_ROLES']);
    });
});

describe('Check Welcome Status', () => {
    test('renders an ephemeral embed using isInHoldingState + evaluateMember', async () => {
        mockIsInHoldingState.mockResolvedValue(false);
        mockEvaluateMember.mockResolvedValue({
            skip: false,
            missingRoleIDs: ['r2']
        });
        const interaction = makeInteraction();
        await checkCmd.run(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({flags: MessageFlags.Ephemeral});
        const payload = interaction.editReply.mock.calls.pop()[0];
        expect(payload.embeds).toHaveLength(1);
        expect(mockIsInHoldingState).toHaveBeenCalledWith(interaction.targetMember, interaction.client);
        expect(interaction.rolesAdd).not.toHaveBeenCalled();
    });
});

describe('Assign Join Roles', () => {
    test('holding member is skipped (no roles added)', async () => {
        mockEvaluateMember.mockResolvedValue({
            skip: true,
            missingRoleIDs: []
        });
        const interaction = makeInteraction();
        await assignCmd.run(interaction);
        expect(interaction.rolesAdd).not.toHaveBeenCalled();
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('assign-skipped-holding');
    });
    test('adds the missing join roles exactly as the automatic flow', async () => {
        mockEvaluateMember.mockResolvedValue({
            skip: false,
            missingRoleIDs: ['r1', 'r2']
        });
        const interaction = makeInteraction();
        await assignCmd.run(interaction);
        expect(interaction.rolesAdd).toHaveBeenCalledWith(['r1', 'r2'], expect.stringContaining('audit-log-reason-join-roles'));
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('assign-success');
    });
    test('no join roles configured -> ephemeral notice', async () => {
        const interaction = makeInteraction({config: {'give-roles-on-join': []}});
        await assignCmd.run(interaction);
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('no-join-roles-configured');
    });
});

describe('Restore Base Roles', () => {
    test('base-roles disabled -> ephemeral notice, no add', async () => {
        const interaction = makeInteraction({config: {'treat-welcome-roles-as-base-roles': false}});
        await restoreCmd.run(interaction);
        expect(interaction.rolesAdd).not.toHaveBeenCalled();
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('base-roles-disabled');
    });
    test('holding member skipped', async () => {
        mockIsInHoldingState.mockResolvedValue(true);
        const interaction = makeInteraction();
        await restoreCmd.run(interaction);
        expect(interaction.rolesAdd).not.toHaveBeenCalled();
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('assign-skipped-holding');
    });
    test('re-adds missing base roles with the base-role audit reason', async () => {
        mockIsInHoldingState.mockResolvedValue(false);
        const interaction = makeInteraction({targetRoleIDs: ['r1']});
        await restoreCmd.run(interaction);
        expect(interaction.rolesAdd).toHaveBeenCalledWith(['r2'], 'base-role-audit-reason');
        expect(interaction.client.logger.info).toHaveBeenCalled();
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('assign-success');
    });
    test('member already has all base roles -> already-has notice', async () => {
        mockIsInHoldingState.mockResolvedValue(false);
        const interaction = makeInteraction({targetRoleIDs: ['r1', 'r2']});
        await restoreCmd.run(interaction);
        expect(interaction.rolesAdd).not.toHaveBeenCalled();
        expect(interaction.editReply.mock.calls.pop()[0].content).toContain('assign-already-has');
    });
});