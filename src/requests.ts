import * as vscode from "vscode";
import * as https from "https";
import * as queries from "./queries";
import { getStatesFilter } from "./utils";
import type {
    ApiResponse,
    GraphQLResponse,
    LoadPullRequestsOptions,
    PullRequest,
    PullRequestData,
    RepositoryPullRequestsData,
    ViewerPullRequestsData,
} from "./types";

let errorCount = 0;

const execQuery = async <T>(
    token: string,
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

export const loadPullRequests = async ({
    token,
    showMerged,
    showClosed,
    showError,
    count,
    url,
    allowUnsafeSSL,
    repository,
}: LoadPullRequestsOptions): Promise<ApiResponse<PullRequest[]>> => {
    const queryTemplate = repository ? queries.repository : queries.viewer;

    let query = queryTemplate
        .replace("@states", getStatesFilter(showMerged, showClosed))
        .replace("@count", String(count));
    if (repository) {
        query = query.replace("@owner", repository.owner).replace("@name", repository.name);
    }

    const { status, code, data } = await execQuery<PullRequestData>(
        token,
        query,
        showError,
        url,
        allowUnsafeSSL,
    );

    const pullRequests = data
        ? repository
            ? (data as RepositoryPullRequestsData).repository.pullRequests.nodes
            : (data as ViewerPullRequestsData).viewer.pullRequests.nodes
        : undefined;
    return { status, code, data: pullRequests };
};
