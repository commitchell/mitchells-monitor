import type {
    ColorConfig,
    PullRequestBlockingReason,
    PullRequestStatus,
    PullRequest,
    ReviewEdge,
    ReviewNode,
    ReviewState,
} from "./types";

export const getStatesFilter = (showMerged: boolean, showClosed: boolean): string => {
    if (showMerged && showClosed) {
        return ""; // no filter applied
    }
    const states = ["OPEN"];
    if (showClosed) {
        states.push("CLOSED");
    }
    if (showMerged) {
        states.push("MERGED");
    }
    return `states: [${states.join(" ")}]`;
};

export const getReviewsByAuthor = (reviews: ReviewEdge[]): Record<string, ReviewNode[]> => {
    return reviews.reduce<Record<string, ReviewNode[]>>((acc, { node }) => {
        acc[node.author.login] = acc[node.author.login] || [];
        acc[node.author.login].push(node);
        return acc;
    }, {});
};

export const getLastStateByAuthor = (reviewsByAuthor: Record<string, ReviewNode[]>): string[] => {
    return Object.keys(reviewsByAuthor)
        .map((author) => {
            const lastState = reviewsByAuthor[author].reduce<string | undefined>(
                (acc, { state }) =>
                    ["CHANGES_REQUESTED", "APPROVED"].includes(state) ? state : acc,
                undefined,
            );
            return lastState;
        })
        .filter((item): item is string => item !== undefined);
};

import type { ReviewDecision } from "./types";

export const getReviewState = (
    reviews: { edges: ReviewEdge[] },
    reviewDecision?: ReviewDecision,
): ReviewState => {
    const reviewsCount = reviews.edges.length;
    const reviewsByAuthor = reviewsCount > 0 ? getReviewsByAuthor(reviews.edges) : null;
    const lastStateByAuthor = reviewsByAuthor ? getLastStateByAuthor(reviewsByAuthor) : [];

    // Use reviewDecision from GitHub API which accounts for:
    // - Required number of approvals
    // - Codeowner requirements
    // - Branch protection rules
    let hasPendingChangeRequests: boolean | undefined;
    let isApproved: boolean | undefined;
    let reviewsPassing: boolean;

    if (reviewDecision !== undefined) {
        // reviewDecision is provided - use GitHub's authoritative decision
        switch (reviewDecision) {
            case "APPROVED":
                reviewsPassing = true;
                isApproved = true;
                hasPendingChangeRequests = false;
                break;
            case "CHANGES_REQUESTED":
                reviewsPassing = false;
                isApproved = false;
                hasPendingChangeRequests = true;
                break;
            case "REVIEW_REQUIRED":
                reviewsPassing = false;
                isApproved = false;
                hasPendingChangeRequests = false;
                break;
            case null:
                // No review policy configured - reviews are not required
                reviewsPassing = true;
                isApproved = undefined;
                hasPendingChangeRequests = undefined;
                break;
        }
    } else {
        // Fallback for tests or when reviewDecision is not available
        hasPendingChangeRequests =
            lastStateByAuthor.length > 0
                ? lastStateByAuthor.some((state) => state === "CHANGES_REQUESTED")
                : undefined;
        isApproved =
            lastStateByAuthor.length > 0
                ? lastStateByAuthor.every((state) => state === "APPROVED")
                : undefined;

        // When no reviewDecision, match GitHub's behavior:
        // If there are no reviews, treat as passing (unprotected branch or no review activity)
        if (reviewsCount === 0) {
            reviewsPassing = true;
        } else {
            reviewsPassing = isApproved === true && !hasPendingChangeRequests;
        }
    }

    const hasComments = reviews.edges.some(({ node }) => node.state === "COMMENTED");

    return {
        reviewsPassing,
        hasComments,
        hasPendingChangeRequests,
        isApproved,
    };
};

export const getEndpointUrl = (githubEnterpriseUrl: string | null | undefined): string => {
    if (githubEnterpriseUrl) {
        return `${githubEnterpriseUrl}/api/graphql`;
    }
    return "https://api.github.com/graphql";
};

/**
 * Parse a GitHub repository owner and name from a git remote URL.
 * Supports both HTTPS and SSH URL formats.
 */
export const parseGitHubRepoFromRemoteUrl = (
    remoteUrl: string,
): { owner: string; name: string } | null => {
    // Handle SSH format: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
        return { owner: sshMatch[1], name: sshMatch[2] };
    }

    // Handle HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(/https?:\/\/[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], name: httpsMatch[2] };
    }

    return null;
};

export const generateDisplayText = (
    pr: PullRequest,
    regexPattern: string | null | undefined,
): string => {
    if (!regexPattern) {
        return String(pr.number);
    } else {
        try {
            const regex = new RegExp(regexPattern);
            const match = pr.title.match(regex);
            return match && match[1] ? match[1] : String(pr.number);
        } catch (error) {
            console.warn("Invalid regex pattern for PR title extraction:", error);
            return String(pr.number);
        }
    }
};

export const getPullRequestStatus = (pr: PullRequest): PullRequestStatus => {
    if (pr.state === "MERGED") {
        return "MERGED";
    } else if (pr.state === "CLOSED") {
        return "CLOSED";
    }

    const blockingReasons: PullRequestBlockingReason[] = [];
    const commit = pr.commits.nodes[0].commit;
    const commitStatus = commit.status;
    const { reviewsPassing, hasPendingChangeRequests } = getReviewState(
        pr.reviews,
        pr.reviewDecision,
    );
    const { potentialMergeCommit } = pr;

    if (commitStatus !== null && commitStatus.state === "PENDING") {
        blockingReasons.push("CHECKS_PENDING");
    }

    if (!reviewsPassing) {
        blockingReasons.push("REVIEWS_NOT_SATISFIED");
    }

    if (commitStatus !== null && commitStatus.state === "FAILURE") {
        blockingReasons.push("CHECKS_FAILING");
    }

    if (potentialMergeCommit && potentialMergeCommit.status !== null) {
        blockingReasons.push("MERGE_COMMIT_ISSUES");
    }

    if (pr.mergeable === "CONFLICTING") {
        blockingReasons.push("HAS_CONFLICTS");
    }

    if (hasPendingChangeRequests) {
        blockingReasons.push("CHANGES_REQUESTED");
    }

    if (blockingReasons.length === 0 && pr.mergeable === "MERGEABLE") {
        return "MERGEABLE";
    }

    if (blockingReasons.length === 0) {
        blockingReasons.push("UNKNOWN");
    }

    return blockingReasons;
};

export const getPullRequestStatusIcon = (status: PullRequestStatus): string | undefined => {
    switch (status) {
        case "MERGEABLE":
            return "$(pass-filled)";
        case "CLOSED":
            return "$(git-pull-request-closed)";
        case "MERGED":
            return "$(git-merge)";
        default:
            switch (status[status.length - 1]) {
                case "UNKNOWN":
                    return "$(question)";
                case "CHANGES_REQUESTED":
                    return "$(request-changes)";
                case "HAS_CONFLICTS":
                    return "$(warning)";
                case "MERGE_COMMIT_ISSUES":
                    return "$(warning)";
                case "CHECKS_PENDING":
                    return "$(kebab-horizontal)";
                case "CHECKS_FAILING":
                    return "$(error)";
                case "REVIEWS_NOT_SATISFIED":
                    return "$(eye)";
            }
    }
};

export const getPullRequestColour = (
    status: PullRequestStatus,
    colorConfig: ColorConfig = {},
): string => {
    switch (status) {
        case "MERGEABLE":
            return colorConfig.mergeable || "rgba(77, 237, 186, 1)"; // #4DEDBA
        case "CLOSED":
            return colorConfig.closed || "rgba(144, 155, 155, 1)"; // #909B9B
        case "MERGED":
            return colorConfig.merged || "rgba(214, 172, 255, 1)"; // #D6ACFF
        default:
            switch (status[status.length - 1]) {
                case "UNKNOWN":
                    return colorConfig.unknown || "rgba(255, 115, 82, 1)"; // #FF7352
                case "CHANGES_REQUESTED":
                    return colorConfig.changes_requested || "rgba(255, 115, 82, 1)"; // #FF7352
                case "HAS_CONFLICTS":
                    return colorConfig.has_conflicts || "rgba(255, 115, 82, 1)"; // #FF7352
                case "MERGE_COMMIT_ISSUES":
                    return colorConfig.merge_commit_issues || "rgba(255, 115, 82, 1)"; // #FF7352
                case "CHECKS_FAILING":
                    return colorConfig.checks_failing || "rgba(255, 115, 82, 1)"; // #FF7352
                case "REVIEWS_NOT_SATISFIED":
                    return colorConfig.reviews_not_satisfied || "rgba(255, 115, 82, 1)"; // #FF7352
                case "CHECKS_PENDING":
                    return colorConfig.checks_pending || "rgba(255, 227, 77, 1)"; // #FFE34D
            }
    }
};
