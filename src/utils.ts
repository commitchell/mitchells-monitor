import type {
    ColorConfig,
    PullRequestBlockingReason,
    PullRequestStatus,
    PullRequest,
    ReviewEdge,
    ReviewNode,
    ReviewState,
} from "./types";

// export const getCommitIcon = (value: CommitStatus | null): string | undefined => {
//     // https://developer.github.com/v4/reference/enum/statusstate/
//     if (!value) {
//         return undefined;
//     }
//     switch (value.state) {
//         case "SUCCESS":
//             return "$(check)";
//         case "PENDING":
//             return "$(kebab-horizontal)";
//         case "FAILURE":
//             return "$(tools)";
//         default:
//             return undefined;
//     }
// };

// export const getMergeableIcon = (value: string): string | undefined => {
//     // https://developer.github.com/v4/reference/enum/statusstate/
//     switch (value) {
//         case "MERGEABLE":
//             return "$(git-merge)";
//         case "UNKNOWN":
//             return "$(question)";
//         case "CONFLICTING":
//             return "$(alert)";
//         default:
//             return undefined;
//     }
// };

// export const getPullRequestStateIcon = (value: string): string | undefined => {
//     // https://developer.github.com/v4/reference/enum/pullrequeststate/
//     switch (value) {
//         case "MERGED":
//             return "$(git-merge)";
//         case "OPEN":
//             return "$(git-pull-request)";
//         case "CLOSED":
//             return "$(x)";
//         default:
//             return undefined;
//     }
// };

// export const getColor = (mergeableState: MergeableState, colorConfig: ColorConfig = {}): string => {
//     switch (mergeableState) {
//         case "MERGED":
//             return colorConfig.merged || "rgba(190, 154, 240, 1)"; // #be9af0
//         case "MERGEABLE":
//             return colorConfig.mergeable || "rgba(128, 211, 148, 1)"; // #80d394
//         case "CLOSED":
//             return colorConfig.closed || "rgba(58, 62, 62, 1)"; // #3A3E3E
//         case "FAILURE":
//             return colorConfig.failure || "rgba(255, 110, 110, 1)"; // #FF6E6E
//         default:
//             return colorConfig.default || "rgba(144, 155, 155, 1)"; // #909B9B
//     }
// };

// export const getMergeableState = (pr: PullRequest, reviews: boolean): MergeableState => {
//     // https://developer.github.com/v4/reference/enum/mergeablestate/
//     const commit = pr.commits.nodes[0].commit.status;
//     const { potentialMergeCommit } = pr;
//     if (["MERGED", "CLOSED"].includes(pr.state)) {
//         return pr.state as MergeableState;
//     }
//     if (
//         pr.mergeable === "MERGEABLE" &&
//         reviews &&
//         (commit === null /* no tests defined */ || commit.state === "SUCCESS") &&
//         potentialMergeCommit &&
//         potentialMergeCommit.status === null
//     ) {
//         return "MERGEABLE";
//     }
//     if (
//         pr.mergeable === "CONFLICTING" ||
//         !reviews ||
//         (commit !== null /* tests defined */ && commit.state === "FAILURE")
//     ) {
//         return "FAILURE";
//     }
//     return "OPEN";
// };

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

export const getReviewState = (reviews: { edges: ReviewEdge[] }): ReviewState => {
    const reviewsCount = reviews.edges.length;
    const reviewsByAuthor = reviewsCount > 0 ? getReviewsByAuthor(reviews.edges) : null;
    const lastStateByAuthor = reviewsByAuthor ? getLastStateByAuthor(reviewsByAuthor) : [];
    const hasPendingChangeRequests =
        lastStateByAuthor.length > 0
            ? lastStateByAuthor.some((state) => state === "CHANGES_REQUESTED")
            : undefined;
    const isApproved =
        lastStateByAuthor.length > 0
            ? lastStateByAuthor.every((state) => state === "APPROVED")
            : undefined;
    const hasComments = reviews.edges.some(({ node }) => node.state === "COMMENTED");
    const reviewsPassing = reviewsCount === 0 || !hasPendingChangeRequests || isApproved === true;
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
): string | null => {
    if (!regexPattern) {
        return String(pr.number);
    } else {
        try {
            const regex = new RegExp(regexPattern);
            const match = pr.title.match(regex);
            return match && match[1] ? match[1] : null;
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
    const { reviewsPassing, hasPendingChangeRequests } = getReviewState(pr.reviews);
    const commit = pr.commits.nodes[0].commit.status;

    if (commit !== null && commit.state === "PENDING") {
        blockingReasons.push("CHECKS_PENDING");
    }

    if (!reviewsPassing) {
        blockingReasons.push("REVIEWS_NOT_SATISFIED");
    }

    if (commit !== null && commit.state === "FAILURE") {
        blockingReasons.push("CHECKS_FAILING");
    }

    // Not sure about this one yet
    // const { potentialMergeCommit } = pr;
    // if (potentialMergeCommit && potentialMergeCommit.status !== null) {
    //     blockingReasons.push("MERGE_COMMIT_ISSUES");
    // }

    if (pr.mergeable === "CONFLICTING") {
        blockingReasons.push("HAS_CONFLICTS");
    }

    if (hasPendingChangeRequests) {
        blockingReasons.push("CHANGES_REQUESTED");
    }

    // If PR is not in a mergeable state and we haven't identified specific reasons
    if (pr.mergeable !== "MERGEABLE" && blockingReasons.length === 0) {
        blockingReasons.push("UNKNOWN");
    }

    return blockingReasons.length ? blockingReasons : "MERGEABLE";
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
