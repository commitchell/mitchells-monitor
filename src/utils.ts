import type {
    CommitStatus,
    ColorConfig,
    MergeableState,
    PullRequest,
    ReviewEdge,
    ReviewNode,
    ReviewState,
} from "./types";

export const getCommitIcon = (value: CommitStatus | null): string | undefined => {
    // https://developer.github.com/v4/reference/enum/statusstate/
    if (!value) {
        return undefined;
    }
    switch (value.state) {
        case "SUCCESS":
            return "$(check)";
        case "PENDING":
            return "$(kebab-horizontal)";
        case "FAILURE":
            return "$(tools)";
        default:
            return undefined;
    }
};

export const getMergeableIcon = (value: string): string | undefined => {
    // https://developer.github.com/v4/reference/enum/statusstate/
    switch (value) {
        case "MERGEABLE":
            return "$(git-merge)";
        case "UNKNOWN":
            return "$(question)";
        case "CONFLICTING":
            return "$(alert)";
        default:
            return undefined;
    }
};

export const getPullRequestStateIcon = (value: string): string | undefined => {
    // https://developer.github.com/v4/reference/enum/pullrequeststate/
    switch (value) {
        case "MERGED":
            return "$(git-merge)";
        case "OPEN":
            return "$(git-pull-request)";
        case "CLOSED":
            return "$(x)";
        default:
            return undefined;
    }
};

export const getColor = (mergeableState: MergeableState, colorConfig: ColorConfig = {}): string => {
    switch (mergeableState) {
        case "MERGED":
            return colorConfig.merged || "rgba(190, 154, 240, 1)"; // #be9af0
        case "MERGEABLE":
            return colorConfig.mergeable || "rgba(128, 211, 148, 1)"; // #80d394
        case "CLOSED":
            return colorConfig.closed || "rgba(58, 62, 62, 1)"; // #3A3E3E
        case "FAILURE":
            return colorConfig.failure || "rgba(255, 110, 110, 1)"; // #FF6E6E
        default:
            return colorConfig.default || "rgba(144, 155, 155, 1)"; // #909B9B
    }
};

export const getMergeableState = (pr: PullRequest, reviews: boolean): MergeableState => {
    // https://developer.github.com/v4/reference/enum/mergeablestate/
    const commit = pr.commits.nodes[0].commit.status;
    const { potentialMergeCommit } = pr;
    if (["MERGED", "CLOSED"].includes(pr.state)) {
        return pr.state as MergeableState;
    }
    if (
        pr.mergeable === "MERGEABLE" &&
        reviews &&
        (commit === null /* no tests defined */ || commit.state === "SUCCESS") &&
        potentialMergeCommit &&
        potentialMergeCommit.status === null
    ) {
        return "MERGEABLE";
    }
    if (
        pr.mergeable === "CONFLICTING" ||
        !reviews ||
        (commit !== null /* tests defined */ && commit.state === "FAILURE")
    ) {
        return "FAILURE";
    }
    return "OPEN";
};

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
