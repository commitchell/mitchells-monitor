import * as vscode from "vscode";
import * as childProcess from "child_process";
import {
    getCommitIcon,
    getColor,
    getMergeableIcon,
    getMergeableState,
    getPullRequestStateIcon,
    getReviewState,
    getEndpointUrl,
    parseGitHubRepoFromRemoteUrl,
} from "./utils";
import { loadPullRequests } from "./requests";
import type { ColorConfig, CurrentRepository, PullRequest, StatusBarItems } from "./types";

let statusBarItems: StatusBarItems | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pullRequests: PullRequest[] = [];
let refreshButton: vscode.StatusBarItem;
let noResultsLabel: vscode.StatusBarItem;

/**
 * Detect GitHub repositories from all workspace folders by reading git remotes.
 * Returns an array of unique repository infos found across all workspace folders.
 */
const detectWorkspaceRepositories = async (): Promise<CurrentRepository[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return [];
    }

    const detectRepoInFolder = (folderPath: string): Promise<CurrentRepository | undefined> => {
        return new Promise((resolve) => {
            childProcess.exec("git remote get-url origin", { cwd: folderPath }, (error, stdout) => {
                if (error) {
                    resolve(undefined);
                    return;
                }

                const remoteUrl = stdout.trim();
                const repoInfo = parseGitHubRepoFromRemoteUrl(remoteUrl);

                if (repoInfo) {
                    resolve({
                        nameWithOwner: `${repoInfo.owner}/${repoInfo.name}`,
                        owner: repoInfo.owner,
                        name: repoInfo.name,
                    });
                } else {
                    resolve(undefined);
                }
            });
        });
    };

    const repoPromises = workspaceFolders.map((folder) => detectRepoInFolder(folder.uri.fsPath));
    const results = await Promise.all(repoPromises);

    // Filter out undefined and deduplicate by nameWithOwner
    const seen = new Set<string>();
    return results.filter((repo): repo is CurrentRepository => {
        if (!repo || seen.has(repo.nameWithOwner)) {
            return false;
        }
        seen.add(repo.nameWithOwner);
        return true;
    });
};

const extractTitleText = (
    prTitle: string,
    regexPattern: string | null | undefined,
): string | null => {
    if (!regexPattern) {
        return null;
    }
    try {
        const regex = new RegExp(regexPattern);
        const match = prTitle.match(regex);
        return match && match[1] ? match[1] : null;
    } catch (error) {
        console.warn("Invalid regex pattern for PR title extraction:", error);
        return null;
    }
};

const createStatusBarItem = (context: vscode.ExtensionContext, prId: string, url: string): void => {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    context.subscriptions.push(statusBarItem);
    const disposable = vscode.commands.registerCommand(
        `mitchells-monitor.openPullRequest.${prId}`,
        () => {
            vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(url));
        },
    );
    context.subscriptions.push(disposable);
    if (statusBarItems) {
        statusBarItems[prId] = statusBarItem;
    }
};

const getPullRequests = async (
    context: vscode.ExtensionContext,
    showError = false,
): Promise<void> => {
    const config = vscode.workspace.getConfiguration("mitchells-monitor");
    if (timer) {
        clearTimeout(timer);
    }

    const fetchAndRenderPullRequests = async (
        config: vscode.WorkspaceConfiguration,
    ): Promise<number | undefined> => {
        const showMerged = config.get<boolean>("showMerged", false);
        const showClosed = config.get<boolean>("showClosed", false);
        const count = config.get<number>("count", 6);
        const titleRegex = config.get<string | null>("titleRegex", null);
        const colorConfig = config.get<ColorConfig>("colors", {});
        const url = getEndpointUrl(config.get<string | null>("githubEnterpriseUrl", null));
        const allowUnsafeSSL = config.get<boolean>("allowUnsafeSSL", false);
        const token = context.globalState.get<string>("token");

        if (!token) {
            vscode.window.showWarningMessage(
                "Mitchell's Monitor - Please enter a token to begin monitoring!",
            );
            return undefined;
        }

        // Detect workspace repositories for smart filtering
        const workspaceRepos = await detectWorkspaceRepositories();
        let repository: CurrentRepository | undefined;
        let workspaceRepoNames: Set<string> | undefined;

        if (workspaceRepos.length === 1) {
            // Single repo detected - use repository mode for efficiency
            repository = workspaceRepos[0];
        } else if (workspaceRepos.length > 1) {
            // Multiple repos detected - fetch all PRs and filter client-side
            workspaceRepoNames = new Set(workspaceRepos.map((r) => r.nameWithOwner));
        }
        // If no repos detected, fetch all PRs (viewer mode behavior)

        const updatedPullRequests = await loadPullRequests({
            token,
            showMerged,
            showClosed,
            showError,
            count: workspaceRepoNames ? count * workspaceRepoNames.size : count,
            url,
            allowUnsafeSSL,
            repository,
        });

        if (updatedPullRequests.code === 401) {
            refreshButton.command = "mitchells-monitor.setToken";
            refreshButton.text = "$(key)";
            refreshButton.tooltip = "Set GitHub token";
            return undefined;
        }

        const overrideRefreshInterval = updatedPullRequests.status === "error" ? 15 : undefined;

        if (updatedPullRequests.status === "error") {
            refreshButton.command = "mitchells-monitor.refresh.showError";
            refreshButton.text = "$(zap)";
            refreshButton.tooltip = "Connect";
        } else {
            refreshButton.command = "mitchells-monitor.refresh";
            refreshButton.text = "$(sync)";
            refreshButton.tooltip = "Refresh pull requests";

            // Filter PRs if we detected multiple workspace repos
            const allPRs = updatedPullRequests.data || [];

            if (workspaceRepoNames) {
                pullRequests = allPRs
                    .filter((pr) => {
                        const prRepoName = pr.repository.nameWithOwner || "";
                        return workspaceRepoNames.has(prRepoName);
                    })
                    .slice(0, count);
            } else {
                pullRequests = allPRs;
            }
        }

        if (!statusBarItems) {
            statusBarItems = {};
        } else {
            const prIds = pullRequests.map((pr) => `${pr.repository.name}${pr.number}`);
            Object.keys(statusBarItems).forEach((item) => {
                if (!prIds.includes(item)) {
                    statusBarItems![item].hide();
                }
            });
        }

        if (pullRequests.length === 0) {
            noResultsLabel.show();
        } else {
            noResultsLabel.hide();
        }

        pullRequests.forEach((pr) => {
            const prId = `${pr.repository.name}${pr.number}`;

            if (!statusBarItems![prId]) {
                createStatusBarItem(context, prId, pr.url);
            }

            const { reviewsPassing, hasComments, hasPendingChangeRequests, isApproved } =
                getReviewState(pr.reviews);
            const mergeableState = getMergeableState(pr, reviewsPassing);
            const closed = mergeableState === "CLOSED";

            const statusBarItem = statusBarItems![prId];
            const displayText = extractTitleText(pr.title, titleRegex) || String(pr.number);
            const text = [
                getPullRequestStateIcon(pr.state),
                displayText,
                !pr.merged && !closed && getCommitIcon(pr.commits.nodes[0].commit.status),
                !pr.merged && !closed && getMergeableIcon(pr.mergeable),
                hasComments && "$(comment)",
                hasPendingChangeRequests && "$(thumbsdown)",
                isApproved && "$(thumbsup)",
            ];

            statusBarItem.text = text.filter((item) => item).join(" ");
            statusBarItem.color = getColor(mergeableState, colorConfig);
            statusBarItem.command = `mitchells-monitor.openPullRequest.${prId}`;
            statusBarItem.tooltip = pr.title;
            statusBarItem.show();
        });

        return overrideRefreshInterval;
    };

    const overrideRefreshInterval = await fetchAndRenderPullRequests(config).catch((e) => {
        console.error(e);
        vscode.window.showErrorMessage(
            `Mitchell's Monitor - An error has occurred while fetching pull requests: ${e.message}`,
        );
        return undefined;
    });

    // we store the interval in seconds and prevent the users to set a value lower than 15s
    const userRefreshInterval =
        overrideRefreshInterval || Number.parseInt(String(config.get("refreshInterval")), 10);
    const refreshInterval = userRefreshInterval >= 15 ? userRefreshInterval : 60;
    if (!refreshInterval) {
        return;
    }

    timer = setTimeout(() => getPullRequests(context), refreshInterval * 1000);
};

export const activate = (context: vscode.ExtensionContext): void => {
    noResultsLabel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    noResultsLabel.command = "mitchells-monitor.refresh";
    noResultsLabel.text = "No PRs";
    noResultsLabel.tooltip = "Refresh pull requests";
    context.subscriptions.push(noResultsLabel);

    refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    refreshButton.command = "mitchells-monitor.refresh";
    refreshButton.text = "$(sync)";
    refreshButton.tooltip = "Refresh pull requests";
    refreshButton.show();
    context.subscriptions.push(refreshButton);

    // Auto-refresh when workspace folders change
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            getPullRequests(context);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "mitchells-monitor.start",
            (options: { silent?: boolean } = {}) => {
                const { silent } = options;
                getPullRequests(context);
                if (!silent) {
                    vscode.window.showInformationMessage("Mitchell's Monitor has been started!");
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.stop", () => {
            if (timer) {
                clearTimeout(timer);
            }
            vscode.window.showInformationMessage("Mitchell's Monitor has been stopped!");
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh", () => {
            getPullRequests(context);
            vscode.window.showInformationMessage(
                "Mitchell's Monitor - Refreshing pull requests...",
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh.showError", () => {
            getPullRequests(context, true);
            vscode.window.showInformationMessage(
                "Mitchell's Monitor - Attempting to connect to remote...",
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.setToken", async () => {
            const token = await vscode.window.showInputBox({
                placeHolder: "Please enter your GitHub token",
            });
            if (token) {
                context.globalState.update("token", token);
                getPullRequests(context);
                vscode.window.showInformationMessage("Token successfully saved.");
            } else {
                vscode.window.showWarningMessage("A token was not provided!");
            }
        }),
    );

    if (
        vscode.workspace.getConfiguration("mitchells-monitor").get("autostart") &&
        context.globalState.get("token")
    ) {
        vscode.commands.executeCommand("mitchells-monitor.start", { silent: true });
    }
};

export const deactivate = (): void => {
    if (timer) {
        clearTimeout(timer);
    }
};
