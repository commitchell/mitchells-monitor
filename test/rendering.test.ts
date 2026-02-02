import { describe, it, expect } from "vitest";
import {
    getPullRequestStatus,
    getPullRequestStatusIcon,
    getPullRequestColour,
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
        const { hasComments, hasPendingChangeRequests, isApproved } = getReviewState(
            pr.reviews,
            pr.reviewDecision,
        );
        const status = getPullRequestStatus(pr);
        const statusIcon = getPullRequestStatusIcon(status);
        const color = getPullRequestColour(status);
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
            statusIcon,
            displayText,
            color,
            hasComments && "$(comment)",
            hasPendingChangeRequests && "$(thumbsdown)",
            isApproved && "$(thumbsup)",
        ];
        return text.filter((item) => item).join(" ");
    };

    it("open mergeable PR shows correct icons", () => {
        const pr = SAMPLE_PULL_REQUESTS.openMergeable;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(pass-filled)");
        expect(text).toContain("rgba(77, 237, 186, 1)");
        expect(text).toContain("1");
    });

    it("open conflicting PR shows alert icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(warning)");
        expect(text).toContain("rgba(255, 115, 82, 1)");
    });

    it("open pending PR shows pending icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openPending;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(kebab-horizontal)");
        expect(text).toContain("rgba(255, 227, 77, 1)");
    });

    it("open PR with failed checks shows tools icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithFailedChecks;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(error)");
        expect(text).toContain("rgba(255, 115, 82, 1)");
    });

    it("merged PR shows only merge icon and number", () => {
        const pr = SAMPLE_PULL_REQUESTS.merged;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(git-merge)");
        expect(text).toContain("rgba(214, 172, 255, 1)");
    });

    it("closed PR shows X icon", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        const text = generateStatusBarText(pr);
        expect(text).toContain("$(git-pull-request-closed)");
        expect(text).toContain("rgba(144, 155, 155, 1)");
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
        const status = getPullRequestStatus(pr);
        const color = getPullRequestColour(status);
        expect(status).toBe("MERGED");
        expect(color).toBe("rgba(214, 172, 255, 1)");
    });

    it("closed PR gets dark color", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        const status = getPullRequestStatus(pr);
        const color = getPullRequestColour(status);
        expect(status).toBe("CLOSED");
        expect(color).toBe("rgba(144, 155, 155, 1)");
    });

    it("mergeable PR gets green color", () => {
        const pr = createMockPullRequest({
            state: "OPEN",
            mergeable: "MERGEABLE",
            commits: { nodes: [{ commit: { status: { state: "SUCCESS" } } }] },
            potentialMergeCommit: { status: null },
        });
        const status = getPullRequestStatus(pr);
        const color = getPullRequestColour(status);
        expect(status).toBe("MERGEABLE");
        expect(color).toBe("rgba(77, 237, 186, 1)");
    });

    it("conflicting PR gets red color", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        const status = getPullRequestStatus(pr);
        const color = getPullRequestColour(status);
        expect(Array.isArray(status)).toBe(true);
        expect(color).toBe("rgba(255, 115, 82, 1)");
    });

    it("pending PR gets gray color", () => {
        const pr = SAMPLE_PULL_REQUESTS.openPending;
        const status = getPullRequestStatus(pr);
        const color = getPullRequestColour(status);
        expect(color).toBe("rgba(255, 227, 77, 1)");
    });

    it("custom colors override defaults", () => {
        const customColors = {
            merged: "#custom-merged",
            mergeable: "#custom-mergeable",
            closed: "#custom-closed",
            unknown: "#custom-unknown",
            changes_requested: "#custom-changes-requested",
            has_conflicts: "#custom-has-conflicts",
            merge_commit_issues: "#custom-merge-commit-issues",
            checks_failing: "#custom-checks-failing",
            reviews_not_satisfied: "#custom-reviews-not-satisfied",
            checks_pending: "#custom-checks-pending",
        };
        expect(getPullRequestColour("MERGED", customColors)).toBe("#custom-merged");
        expect(getPullRequestColour("MERGEABLE", customColors)).toBe("#custom-mergeable");
        expect(getPullRequestColour("CLOSED", customColors)).toBe("#custom-closed");
        expect(getPullRequestColour(["HAS_CONFLICTS"], customColors)).toBe("#custom-has-conflicts");
        expect(getPullRequestColour(["CHECKS_PENDING"], customColors)).toBe(
            "#custom-checks-pending",
        );
    });
});

describe("Review State Logic", () => {
    it("no reviews means reviews passing when no review policy", () => {
        const pr = createMockPullRequest({ reviews: { edges: [] }, reviewDecision: null });
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.reviewsPassing).toBe(true);
        expect(state.hasComments).toBe(false);
        expect(state.hasPendingChangeRequests).toBeUndefined();
        expect(state.isApproved).toBeUndefined();
    });

    it("approved review sets isApproved", () => {
        const pr = SAMPLE_PULL_REQUESTS.withApprovedReview;
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.isApproved).toBe(true);
        expect(state.hasPendingChangeRequests).toBe(false);
        expect(state.reviewsPassing).toBe(true);
    });

    it("changes requested sets hasPendingChangeRequests", () => {
        const pr = SAMPLE_PULL_REQUESTS.withChangesRequested;
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.hasPendingChangeRequests).toBe(true);
        expect(state.isApproved).toBe(false);
        expect(state.reviewsPassing).toBe(false);
    });

    it("comments only with review required does not pass", () => {
        const pr = SAMPLE_PULL_REQUESTS.withComments;
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.hasComments).toBe(true);
        // reviewDecision is REVIEW_REQUIRED, so reviews are NOT passing
        expect(state.reviewsPassing).toBe(false);
    });

    it("later approval overrides earlier changes requested", () => {
        const pr = createMockPullRequest({
            reviewDecision: "APPROVED",
            reviews: {
                edges: [
                    {
                        node: {
                            author: { login: "reviewer" },
                            state: "CHANGES_REQUESTED",
                            createdAt: "2026-01-30T10:00:00Z",
                        },
                    },
                    {
                        node: {
                            author: { login: "reviewer" },
                            state: "APPROVED",
                            createdAt: "2026-01-30T11:00:00Z",
                        },
                    },
                ],
            },
        });
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.isApproved).toBe(true);
        expect(state.hasPendingChangeRequests).toBe(false);
        expect(state.reviewsPassing).toBe(true);
    });

    it("multiple reviewers all must approve for isApproved", () => {
        const pr = createMockPullRequest({
            reviewDecision: "CHANGES_REQUESTED",
            reviews: {
                edges: [
                    {
                        node: {
                            author: { login: "reviewer1" },
                            state: "APPROVED",
                            createdAt: "2026-01-30T10:00:00Z",
                        },
                    },
                    {
                        node: {
                            author: { login: "reviewer2" },
                            state: "CHANGES_REQUESTED",
                            createdAt: "2026-01-30T10:00:00Z",
                        },
                    },
                ],
            },
        });
        const state = getReviewState(pr.reviews, pr.reviewDecision);

        expect(state.isApproved).toBe(false);
        expect(state.hasPendingChangeRequests).toBe(true);
        expect(state.reviewsPassing).toBe(false);
    });
});
