import * as vscode from "vscode";
import * as https from "https";
import * as queries from "./queries";
import { getStatesFilter } from "./utils";
import type {
    ApiResponse,
    LoadPullRequestsOptions,
    LoadRepositoriesOptions,
    PullRequest,
    Repository,
} from "./types";

let errorCount = 0;

interface GraphQLResponse<T> {
    data?: T;
}

interface ViewerPullRequestsData {
    viewer: {
        pullRequests: {
            nodes: PullRequest[];
        };
    };
}

interface RepositoryPullRequestsData {
    repository: {
        pullRequests: {
            nodes: PullRequest[];
        };
    };
}

interface ViewerRepositoriesData {
    viewer: {
        repositories: {
            nodes: Repository[];
        };
    };
}

const execQuery = async <T>(
    token: string | undefined,
    query: string,
    showError: boolean,
    graphqlEndpoint: string,
    allowUnsafeSSL = false,
): Promise<ApiResponse<T>> => {
    if (!graphqlEndpoint.startsWith("https://") && showError) {
        vscode.window.showErrorMessage(
            "Mitchell's Monitor - Invalid GitHub Enterprise URL; make sure it starts with https://",
        );
        return { status: "error" };
    }

    if (showError) {
        errorCount = 0;
    }

    if (!token) {
        vscode.window.showWarningMessage(
            "Mitchell's Monitor - Please enter a token to begin monitoring!",
        );
        return { status: "error" };
    }

    try {
        const agent = new https.Agent({ rejectUnauthorized: !allowUnsafeSSL });
        const response = await fetch(graphqlEndpoint, {
            method: "POST",
            headers: {
                Authorization: `bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
            // @ts-expect-error - agent is valid for Node.js fetch
            agent,
        });

        if (response.status === 200) {
            const result = (await response.json()) as GraphQLResponse<T>;
            return { status: "ok", data: result.data };
        }

        if (response.status === 401 || response.status === 403) {
            vscode.window.showErrorMessage("Mitchell's Monitor - Token not authorized!");
            return { status: "error", code: 401 };
        }
        vscode.window.showErrorMessage(`Mitchell's Monitor - http error ${response.status}`);

        return { status: "error", code: response.status };
    } catch (e) {
        console.error(e);

        if (!showError) {
            errorCount += 1;
        }

        if (showError || errorCount === 2) {
            vscode.window.showErrorMessage(
                "Mitchell's Monitor - There was an error fetching the data. Please check your network connection and settings.",
            );
        }

        return { status: "error" };
    }
};

export const loadPullRequests = async (
    token: string | undefined,
    options: LoadPullRequestsOptions,
): Promise<ApiResponse<PullRequest[]>> => {
    const { mode, showMerged, showClosed, repository, showError, count, url, allowUnsafeSSL } =
        options;

    const queryTemplate = mode === "viewer" ? queries.viewer : queries.repository;
    const baseQuery = queryTemplate
        .replace("@states", getStatesFilter(showMerged, showClosed))
        .replace("@count", String(count));

    if (mode === "repository" && !repository) {
        vscode.window.showWarningMessage(
            "Mitchell's Monitor - You are in repository mode. Select a repository to start monitoring!",
        );
        return { status: "error" };
    }

    const query =
        mode === "repository" && repository
            ? baseQuery.replace("@owner", repository.owner).replace("@name", repository.name)
            : baseQuery;

    type PullRequestData = ViewerPullRequestsData | RepositoryPullRequestsData;
    const { status, code, data } = await execQuery<PullRequestData>(
        token,
        query,
        showError,
        url,
        allowUnsafeSSL,
    );

    const pullRequests = data
        ? mode === "viewer"
            ? (data as ViewerPullRequestsData).viewer.pullRequests.nodes
            : (data as RepositoryPullRequestsData).repository.pullRequests.nodes
        : undefined;
    return { status, code, data: pullRequests };
};

export const loadRepositories = async (
    token: string | undefined,
    options: LoadRepositoriesOptions,
): Promise<ApiResponse<Repository[]>> => {
    const { url, allowUnsafeSSL } = options;
    const { status, code, data } = await execQuery<ViewerRepositoriesData>(
        token,
        queries.repositories,
        true,
        url,
        allowUnsafeSSL,
    );
    const repositories = data?.viewer.repositories.nodes;
    return { status, code, data: repositories };
};
