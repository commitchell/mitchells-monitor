import type * as vscode from "vscode";

export interface CommitStatus {
    state: "SUCCESS" | "PENDING" | "FAILURE" | null;
}

export interface Commit {
    status: CommitStatus | null;
    committedDate: string;
}

export interface CommitNode {
    commit: Commit;
}

export interface ReviewNode {
    state: "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "DISMISSED";
    author: {
        login: string;
    };
    createdAt: string;
}

export interface ReviewEdge {
    node: ReviewNode;
}

export interface Reviews {
    edges: ReviewEdge[];
}

export interface PotentialMergeCommit {
    status: {
        state: string;
        commit: {
            status: CommitStatus | null;
        };
    } | null;
}

export interface Repository {
    name: string;
    nameWithOwner?: string;
    owner?: {
        login: string;
    };
}

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface PullRequest {
    repository: Repository;
    number: number;
    mergeable: "MERGEABLE" | "UNKNOWN" | "CONFLICTING";
    state: "OPEN" | "CLOSED" | "MERGED";
    title: string;
    mergedAt: string | null;
    merged: boolean;
    url: string;
    potentialMergeCommit: PotentialMergeCommit | null;
    commits: {
        nodes: CommitNode[];
    };
    reviewDecision: ReviewDecision;
    reviews: Reviews;
}

export interface ReviewState {
    reviewsPassing: boolean;
    hasComments: boolean;
    hasPendingChangeRequests: boolean | undefined;
    isApproved: boolean | undefined;
}

export interface ColorConfig {
    merged?: string;
    mergeable?: string;
    closed?: string;
    unknown?: string;
    changes_requested?: string;
    has_conflicts?: string;
    merge_commit_issues?: string;
    checks_failing?: string;
    reviews_not_satisfied?: string;
    checks_pending?: string;
}

export type PullRequestBlockingReason =
    | "HAS_CONFLICTS"
    | "REVIEWS_NOT_SATISFIED"
    | "CHANGES_REQUESTED"
    | "CHECKS_PENDING"
    | "CHECKS_FAILING"
    | "MERGE_COMMIT_ISSUES"
    | "UNKNOWN";

export type PullRequestStatus = "MERGEABLE" | "CLOSED" | "MERGED" | PullRequestBlockingReason[];

export interface CurrentRepository {
    nameWithOwner: string;
    owner: string;
    name: string;
}

export interface GraphQLResponse<T> {
    data?: T;
}

export interface ViewerPullRequestsData {
    viewer: {
        pullRequests: {
            nodes: PullRequest[];
        };
    };
}

export interface LoadPullRequestsOptions {
    token: string;
    showMerged: boolean;
    showClosed: boolean;
    count: number;
    url: string;
    allowUnsafeSSL: boolean;
}

export interface ApiResponse<T> {
    status: "ok" | "error";
    code?: number;
    data?: T;
}

export interface StatusBarItems {
    [key: string]: vscode.StatusBarItem;
}
