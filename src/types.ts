import type * as vscode from "vscode";

export interface CommitStatus {
    state: "SUCCESS" | "PENDING" | "FAILURE" | null;
}

export interface Commit {
    status: CommitStatus | null;
}

export interface CommitNode {
    commit: Commit;
}

export interface ReviewNode {
    state: "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "DISMISSED";
    author: {
        login: string;
    };
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
    failure?: string;
    default?: string;
}

export type MergeableState = "MERGED" | "CLOSED" | "MERGEABLE" | "FAILURE" | "OPEN";

export interface CurrentRepository {
    nameWithOwner: string;
    owner: string;
    name: string;
}

export interface LoadPullRequestsOptions {
    mode: string;
    showMerged: boolean;
    showClosed: boolean;
    repository: CurrentRepository | undefined;
    showError: boolean;
    count: number;
    url: string;
    allowUnsafeSSL: boolean;
}

export interface LoadRepositoriesOptions {
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

export const MODES = {
    VIEWER: "viewer",
    SMART_VIEWER: "smart-viewer",
    REPOSITORY: "repository",
} as const;

export type Mode = (typeof MODES)[keyof typeof MODES];
