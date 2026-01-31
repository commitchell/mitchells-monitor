import { describe, it, expect } from "vitest";
import {
    getCommitIcon,
    getColor,
    getMergeableIcon,
    getMergeableState,
    getPullRequestStateIcon,
    getReviewState,
} from "../src/utils";
import { createMockPullRequest, SAMPLE_PULL_REQUESTS } from "./fixtures";
import type { PullRequest } from "../src/types";

/**
 * Tests for the complete pull request rendering logic.
 * These tests verify how different PR states result in different
 * status bar appearances.
 */
describe("Pull Request Rendering Logic", () => {
    /**
     * Helper to simulate the status bar text generation logic from extension.ts
     */
    const generateStatusBarText = (pr: PullRequest, titleRegex: string | null = null): string => {
        const { reviewsPassing, hasComments, hasPendingChangeRequests, isApproved } =
            getReviewState(pr.reviews);
        const mergeableState = getMergeableState(pr, reviewsPassing);
        const closed = mergeableState === "CLOSED";

        const extractTitleText = (prTitle: string, regexPattern: string | null): string | null => {
            if (!regexPattern) return null;
            try {
                const regex = new RegExp(regexPattern);
                const match = prTitle.match(regex);
                return match && match[1] ? match[1] : null;
            } catch {
                return null;
            }
        };

        const displayText = extractTitleText(pr.title, titleRegex) || String(pr.number);
        const text = [
            getPullRequestStateIcon(pr.state),
            displayText,
            !pr.merged && !closed && getCommitIcon(pr.commits.nodes[0].commit.status),
            !pr.merged && !closed && getMergeableIcon(pr.mergeable),
            hasComments && "$(comment)",
            hasPendingChangeRequests && "$(thumbsdown)",
            isApproved && "$(thumbsup)",
        ];
        return text.filter((item) => item).join(" ");
    };

    it("open mergeable PR shows correct icons", () => {
        const pr = SAMPLE_PULL_REQUESTS.openMergeable;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(git-pull-request)");
        expect(text).toContain("$(check)");
        expect(text).toContain("$(git-merge)");
        expect(text).toContain("1");
    });

    it("open conflicting PR shows alert icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(git-pull-request)");
        expect(text).toContain("$(alert)");
    });

    it("open pending PR shows pending icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openPending;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(kebab-horizontal)");
        expect(text).toContain("$(question)");
    });

    it("open PR with failed checks shows tools icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithFailedChecks;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(tools)");
    });

    it("merged PR shows only merge icon and number", () => {
        const pr = SAMPLE_PULL_REQUESTS.merged;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(git-merge)");
        expect(text).not.toContain("$(check)");
        expect(text).not.toContain("$(alert)");
    });

    it("closed PR shows X icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(x)");
    });

    it("approved PR shows thumbsup icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.withApprovedReview;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(thumbsup)");
    });

    it("PR with changes requested shows thumbsdown icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.withChangesRequested;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(thumbsdown)");
    });

    it("PR with comments shows comment icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.withComments;
        const text = generateStatusBarText(pr);

        expect(text).toContain("$(comment)");
    });

    it("PR title regex extracts JIRA ticket", () => {
        const pr = SAMPLE_PULL_REQUESTS.withJiraTicket;
        const text = generateStatusBarText(pr, "\\b([A-Z][A-Z0-9]+-\\d+)\\b");

        expect(text).toContain("JIRA-123");
        expect(text).not.toContain("10");
    });

    it("PR without matching regex shows PR number", () => {
        const pr = createMockPullRequest({
            number: 42,
            title: "No ticket here",
        });
        const text = generateStatusBarText(pr, "\\b([A-Z][A-Z0-9]+-\\d+)\\b");

        expect(text).toContain("42");
    });
});

describe("Pull Request Color Logic", () => {
    it("merged PR gets purple color", () => {
        const pr = SAMPLE_PULL_REQUESTS.merged;
        const { reviewsPassing } = getReviewState(pr.reviews);
        const state = getMergeableState(pr, reviewsPassing);
        const color = getColor(state);

        expect(state).toBe("MERGED");
        expect(color).toBe("rgba(190, 154, 240, 1)");
    });

    it("closed PR gets dark color", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        const { reviewsPassing } = getReviewState(pr.reviews);
        const state = getMergeableState(pr, reviewsPassing);
        const color = getColor(state);

        expect(state).toBe("CLOSED");
        expect(color).toBe("rgba(58, 62, 62, 1)");
    });

    it("mergeable PR gets green color", () => {
        const pr = createMockPullRequest({
            state: "OPEN",
            mergeable: "MERGEABLE",
            commits: { nodes: [{ commit: { status: { state: "SUCCESS" } } }] },
            potentialMergeCommit: { status: null },
        });
        const { reviewsPassing } = getReviewState(pr.reviews);
        const state = getMergeableState(pr, reviewsPassing);
        const color = getColor(state);

        expect(state).toBe("MERGEABLE");
        expect(color).toBe("rgba(128, 211, 148, 1)");
    });

    it("conflicting PR gets red color", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        const { reviewsPassing } = getReviewState(pr.reviews);
        const state = getMergeableState(pr, reviewsPassing);
        const color = getColor(state);

        expect(state).toBe("FAILURE");
        expect(color).toBe("rgba(255, 110, 110, 1)");
    });

    it("pending PR gets gray color", () => {
        const pr = SAMPLE_PULL_REQUESTS.openPending;
        const { reviewsPassing } = getReviewState(pr.reviews);
        const state = getMergeableState(pr, reviewsPassing);
        const color = getColor(state);

        expect(state).toBe("OPEN");
        expect(color).toBe("rgba(144, 155, 155, 1)");
    });

    it("custom colors override defaults", () => {
        const customColors = {
            merged: "#custom-merged",
            mergeable: "#custom-mergeable",
            closed: "#custom-closed",
            failure: "#custom-failure",
            default: "#custom-default",
        };

        expect(getColor("MERGED", customColors)).toBe("#custom-merged");
        expect(getColor("MERGEABLE", customColors)).toBe("#custom-mergeable");
        expect(getColor("CLOSED", customColors)).toBe("#custom-closed");
        expect(getColor("FAILURE", customColors)).toBe("#custom-failure");
        expect(getColor("OPEN", customColors)).toBe("#custom-default");
    });
});

describe("Review State Logic", () => {
    it("no reviews means reviews passing", () => {
        const pr = createMockPullRequest({ reviews: { edges: [] } });
        const state = getReviewState(pr.reviews);

        expect(state.reviewsPassing).toBe(true);
        expect(state.hasComments).toBe(false);
        expect(state.hasPendingChangeRequests).toBeUndefined();
        expect(state.isApproved).toBeUndefined();
    });

    it("approved review sets isApproved", () => {
        const pr = SAMPLE_PULL_REQUESTS.withApprovedReview;
        const state = getReviewState(pr.reviews);

        expect(state.isApproved).toBe(true);
        expect(state.hasPendingChangeRequests).toBe(false);
        expect(state.reviewsPassing).toBe(true);
    });

    it("changes requested sets hasPendingChangeRequests", () => {
        const pr = SAMPLE_PULL_REQUESTS.withChangesRequested;
        const state = getReviewState(pr.reviews);

        expect(state.hasPendingChangeRequests).toBe(true);
        expect(state.isApproved).toBe(false);
        expect(state.reviewsPassing).toBe(false);
    });

    it("comments only sets hasComments", () => {
        const pr = SAMPLE_PULL_REQUESTS.withComments;
        const state = getReviewState(pr.reviews);

        expect(state.hasComments).toBe(true);
        expect(state.reviewsPassing).toBe(true);
    });

    it("later approval overrides earlier changes requested", () => {
        const pr = createMockPullRequest({
            reviews: {
                edges: [
                    {
                        node: { author: { login: "reviewer" }, state: "CHANGES_REQUESTED" },
                    },
                    { node: { author: { login: "reviewer" }, state: "APPROVED" } },
                ],
            },
        });
        const state = getReviewState(pr.reviews);

        expect(state.isApproved).toBe(true);
        expect(state.hasPendingChangeRequests).toBe(false);
        expect(state.reviewsPassing).toBe(true);
    });

    it("multiple reviewers all must approve for isApproved", () => {
        const pr = createMockPullRequest({
            reviews: {
                edges: [
                    { node: { author: { login: "reviewer1" }, state: "APPROVED" } },
                    {
                        node: {
                            author: { login: "reviewer2" },
                            state: "CHANGES_REQUESTED",
                        },
                    },
                ],
            },
        });
        const state = getReviewState(pr.reviews);

        expect(state.isApproved).toBe(false);
        expect(state.hasPendingChangeRequests).toBe(true);
        expect(state.reviewsPassing).toBe(false);
    });
});
