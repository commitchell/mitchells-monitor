import type * as vscode from "vscode";

export type StatusState = "ERROR" | "EXPECTED" | "FAILURE" | "PENDING" | "SUCCESS";

export interface StatusCheckRollup {
    state: StatusState;
}

export interface Commit {
    statusCheckRollup: StatusCheckRollup | null;
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
    isDraft: boolean;
    title: string;
    url: string;
    updatedAt: string;
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
    draft?: string;
    unknown?: string;
    changes_requested?: string;
    has_conflicts?: string;
    checks_failing?: string;
    reviews_not_satisfied?: string;
    checks_pending?: string;
}

export type PullRequestStatusStatus = "MERGEABLE" | "OPEN" | "CLOSED" | "MERGED" | "DRAFT";

export type PullRequestBlockingReason =
    | "HAS_CONFLICTS"
    | "REVIEWS_NOT_SATISFIED"
    | "CHANGES_REQUESTED"
    | "CHECKS_PENDING"
    | "CHECKS_FAILING";

export type PullRequestStatus =
    | {
          status: Extract<PullRequestStatusStatus, "OPEN" | "DRAFT">;
          blockingReasons: PullRequestBlockingReason[];
      }
    | {
          status: Extract<PullRequestStatusStatus, "MERGEABLE" | "CLOSED" | "MERGED">;
      };

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
