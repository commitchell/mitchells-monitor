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

const execQuery = async <T>(
    token: string,
    query: string,
    graphqlEndpoint: string,
    allowUnsafeSSL = false,
): Promise<ApiResponse<T>> => {
    if (!graphqlEndpoint.startsWith("https://")) {
        vscode.window.showErrorMessage(
            "Mitchell's Monitor - Invalid GitHub Enterprise URL; make sure it starts with https://",
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
        } else {
            return { status: "error", code: response.status };
        }
    } catch (e) {
        console.error(e);

        return { status: "error" };
    }
};

export const fetchPullRequests = async ({
    token,
    showMerged,
    showClosed,
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
