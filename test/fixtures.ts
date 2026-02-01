import type { PullRequest, Repository } from "../src/types";

/**
 * Creates a mock pull request with default values that can be overridden
 */
export const createMockPullRequest = (overrides: Partial<PullRequest> = {}): PullRequest => ({
    repository: { name: "test-repo" },
    number: 1,
    mergeable: "MERGEABLE",
    state: "OPEN",
    title: "Test PR",
    mergedAt: null,
    merged: false,
    url: "https://github.com/test/test-repo/pull/1",
    potentialMergeCommit: null,
    commits: {
        nodes: [
            {
                commit: {
                    status: null,
                },
            },
        ],
    },
    reviews: {
        edges: [],
    },
    ...overrides,
});

/**
 * Creates a mock repository with default values
 */
export const createMockRepository = (overrides: Partial<Repository> = {}): Repository => ({
    name: "test-repo",
    nameWithOwner: "test-owner/test-repo",
    owner: { login: "test-owner" },
    ...overrides,
});

/**
 * Creates a successful viewer pull requests response
 */
export const createViewerPullRequestsResponse = (pullRequests: PullRequest[]) => ({
    data: {
        viewer: {
            pullRequests: {
                nodes: pullRequests,
            },
        },
    },
});

/**
 * Creates a successful repository pull requests response
 */
export const createRepositoryPullRequestsResponse = (pullRequests: PullRequest[]) => ({
    data: {
        repository: {
            pullRequests: {
                nodes: pullRequests,
            },
        },
    },
});

/**
 * Creates a successful repositories list response
 */
export const createRepositoriesResponse = (repositories: Repository[]) => ({
    data: {
        viewer: {
            repositories: {
                nodes: repositories,
            },
        },
    },
});

/**
 * Sample pull requests for various test scenarios
 */
export const SAMPLE_PULL_REQUESTS = {
    openMergeable: createMockPullRequest({
        number: 1,
        title: "Feature: Add new button",
        state: "OPEN",
        mergeable: "MERGEABLE",
        commits: {
            nodes: [{ commit: { status: { state: "SUCCESS" } } }],
        },
    }),

    openWithConflicts: createMockPullRequest({
        number: 2,
        title: "Fix: Resolve bug",
        state: "OPEN",
        mergeable: "CONFLICTING",
    }),

    openPending: createMockPullRequest({
        number: 3,
        title: "WIP: New feature",
        state: "OPEN",
        mergeable: "UNKNOWN",
        commits: {
            nodes: [{ commit: { status: { state: "PENDING" } } }],
        },
    }),

    openWithFailedChecks: createMockPullRequest({
        number: 4,
        title: "Broken build",
        state: "OPEN",
        mergeable: "MERGEABLE",
        commits: {
            nodes: [{ commit: { status: { state: "FAILURE" } } }],
        },
    }),

    merged: createMockPullRequest({
        number: 5,
        title: "Merged PR",
        state: "MERGED",
        merged: true,
        mergedAt: "2026-01-30T12:00:00Z",
    }),

    closed: createMockPullRequest({
        number: 6,
        title: "Closed PR",
        state: "CLOSED",
        merged: false,
    }),

    withApprovedReview: createMockPullRequest({
        number: 7,
        title: "Approved PR",
        state: "OPEN",
        mergeable: "MERGEABLE",
        reviews: {
            edges: [{ node: { author: { login: "reviewer1" }, state: "APPROVED" } }],
        },
    }),

    withChangesRequested: createMockPullRequest({
        number: 8,
        title: "Needs changes",
        state: "OPEN",
        mergeable: "MERGEABLE",
        reviews: {
            edges: [
                {
                    node: { author: { login: "reviewer1" }, state: "CHANGES_REQUESTED" },
                },
            ],
        },
    }),

    withComments: createMockPullRequest({
        number: 9,
        title: "Has comments",
        state: "OPEN",
        mergeable: "MERGEABLE",
        reviews: {
            edges: [{ node: { author: { login: "reviewer1" }, state: "COMMENTED" } }],
        },
    }),

    withJiraTicket: createMockPullRequest({
        number: 10,
        title: "JIRA-123: Fix the thing",
        state: "OPEN",
        mergeable: "MERGEABLE",
    }),
};

export const SAMPLE_REPOSITORIES: Repository[] = [
    createMockRepository({ name: "repo-1", nameWithOwner: "org/repo-1" }),
    createMockRepository({ name: "repo-2", nameWithOwner: "org/repo-2" }),
    createMockRepository({ name: "repo-3", nameWithOwner: "org/repo-3" }),
];
