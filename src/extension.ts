import * as vscode from "vscode";
import * as childProcess from "child_process";
import {
    getEndpointUrl,
    parseGitHubRepoFromRemoteUrl,
    getPullRequestStatus,
    getPullRequestStatusIcon,
    generateDisplayText,
    getPullRequestColour,
} from "./utils";
import { fetchPullRequests } from "./requests";
import type { ColorConfig, CurrentRepository, PullRequest, StatusBarItems } from "./types";

let statusBarItems: StatusBarItems | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshButton: vscode.StatusBarItem;
let noResultsLabel: vscode.StatusBarItem;

const createRefreshStatusBarItem = (context: vscode.ExtensionContext) => {
    refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    refreshButton.command = "mitchells-monitor.refresh";
    refreshButton.text = "$(mitchells-monitor-sync-pull-requests)";
    refreshButton.tooltip = "Refresh pull requests";
    refreshButton.show();
    context.subscriptions.push(refreshButton);
};

const createNoResultsStatusBarItem = (context: vscode.ExtensionContext): void => {
    noResultsLabel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    noResultsLabel.command = "mitchells-monitor.refresh";
    noResultsLabel.text = "No PRs";
    noResultsLabel.tooltip = "Refresh pull requests";
    context.subscriptions.push(noResultsLabel);
};

const createPRStatusBarItem = (
    context: vscode.ExtensionContext,
    prId: string,
    pr: PullRequest,
): vscode.StatusBarItem => {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    context.subscriptions.push(statusBarItem);

    const disposable = vscode.commands.registerCommand(
        `mitchells-monitor.openPullRequest.${prId}`,
        () => {
            vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(pr.url));
        },
    );
    context.subscriptions.push(disposable);

    if (statusBarItems) {
        statusBarItems[prId] = statusBarItem;
    }

    return statusBarItem;
};

/**
 * Detect GitHub repositories from all workspace folders by reading git remotes.
 * Returns an array of unique repository infos found across all workspace folders.
 */
const detectWorkspaceRepositories = async (): Promise<CurrentRepository[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return [];
    }

    const repoPromises = workspaceFolders.map(
        (folder) =>
            new Promise<CurrentRepository | undefined>((resolve) => {
                childProcess.exec(
                    "git remote get-url origin",
                    { cwd: folder.uri.fsPath },
                    (error, stdout) => {
                        if (error) {
                            console.error(
                                `Error detecting git remote for folder ${folder.name}:`,
                                error,
                            );
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
                    },
                );
            }),
    );
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

const renderPullRequestItem = (
    pr: PullRequest,
    context: vscode.ExtensionContext,
    titleRegex: string | null,
    colorConfig: ColorConfig,
) => {
    const prId = `${pr.repository.name}${pr.number}`;
    const statusBarItem = statusBarItems![prId] || createPRStatusBarItem(context, prId, pr);

    const pullRequestStatus = getPullRequestStatus(pr);
    const pullRequestStatusIcon = getPullRequestStatusIcon(pullRequestStatus);
    const displayText = generateDisplayText(pr, titleRegex);

    const itemsToDisplayAsText = [pullRequestStatusIcon, displayText];

    statusBarItem.text = itemsToDisplayAsText.filter((item) => item).join(" ");
    statusBarItem.color = getPullRequestColour(pullRequestStatus, colorConfig);
    statusBarItem.command = `mitchells-monitor.openPullRequest.${prId}`;
    statusBarItem.tooltip = `${pr.repository.name}\n${pr.title}`;
    statusBarItem.show();
};

const fetchAndRenderPullRequests = async (
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration,
): Promise<void> => {
    const count = config.get<number>("count", 6);
    const titleRegex = config.get<string | null>("titleRegex", null);
    const colorConfig = config.get<ColorConfig>("colors", {});
    const url = getEndpointUrl(config.get<string | null>("githubEnterpriseUrl", null));
    const allowUnsafeSSL = config.get<boolean>("allowUnsafeSSL", false);
    const showMerged = config.get<boolean>("showMerged", false);
    const showClosed = config.get<boolean>("showClosed", false);
    const token = context.globalState.get<string>("token");

    if (!token) {
        vscode.window.showWarningMessage(
            "Mitchell's Monitor - Please enter a token to begin monitoring!",
        );
        refreshButton.command = "mitchells-monitor.setToken";
        refreshButton.text = "$(key)";
        refreshButton.tooltip = "Set token";
        return;
    }

    const workspaceRepos = await detectWorkspaceRepositories();

    let workspaceRepoNames: Set<string> | undefined;
    if (workspaceRepos.length > 0) {
        workspaceRepoNames = new Set(workspaceRepos.map((r) => r.nameWithOwner));
    }

    let pullRequests: PullRequest[] = [];
    const fetchedPullRequests = await fetchPullRequests({
        token,
        showMerged,
        showClosed,
        count,
        url,
        allowUnsafeSSL,
    });

    if (fetchedPullRequests.status === "error") {
        if (fetchedPullRequests.code === 401 || fetchedPullRequests.code === 403) {
            vscode.window.showErrorMessage("Mitchell's Monitor - Token not authorized!");
            refreshButton.command = "mitchells-monitor.setToken";
            refreshButton.text = "$(key)";
            refreshButton.tooltip = "Set token";
            return undefined;
        } else {
            vscode.window.showErrorMessage(
                `Mitchell's Monitor - There was an unknown error fetching the data. Check the console for details.`,
            );
            refreshButton.command = "mitchells-monitor.refresh.showError";
            refreshButton.text = "$(zap)";
            refreshButton.tooltip = "Connect to remote";
        }
    } else {
        refreshButton.command = "mitchells-monitor.refresh";
        refreshButton.text = "$(mitchells-monitor-sync-pull-requests)";
        refreshButton.tooltip = "Refresh pull requests";

        const allPRs = fetchedPullRequests.data || [];

        // Sort PRs to prioritize open > merged > closed
        const sortedPRs = allPRs.sort((a, b) => {
            const getStatePriority = (state: string) => {
                switch (state) {
                    case "OPEN":
                        return 1;
                    case "MERGED":
                        return 2;
                    case "CLOSED":
                        return 3;
                    default:
                        return 4;
                }
            };

            const priorityA = getStatePriority(a.state);
            const priorityB = getStatePriority(b.state);

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // If same priority, sort by PR number descending (newest first)
            return b.number - a.number;
        });

        if (workspaceRepoNames) {
            pullRequests = sortedPRs
                .filter((pr) => {
                    const prRepoName = pr.repository.nameWithOwner || "";
                    return workspaceRepoNames.has(prRepoName);
                })
                .slice(0, count);
        } else {
            pullRequests = sortedPRs;
        }
    }

    if (pullRequests.length === 0) {
        noResultsLabel.show();
        return;
    } else {
        noResultsLabel.hide();
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

    pullRequests.forEach((pr) => {
        renderPullRequestItem(pr, context, titleRegex, colorConfig);
    });
};

const getPullRequests = async (context: vscode.ExtensionContext): Promise<void> => {
    const config = vscode.workspace.getConfiguration("mitchells-monitor");

    if (timer) {
        clearTimeout(timer);
    }

    await fetchAndRenderPullRequests(context, config).catch((e) => {
        console.error(e);
        vscode.window.showErrorMessage(
            `Mitchell's Monitor - An error has occurred while fetching pull requests: ${e.message}`,
        );
        return undefined;
    });

    const userRefreshInterval = Number.parseInt(String(config.get("refreshInterval")), 10);
    let refreshInterval: number;
    if (userRefreshInterval >= 15) {
        refreshInterval = userRefreshInterval;
    } else {
        refreshInterval = 60;
    }

    timer = setTimeout(() => getPullRequests(context), refreshInterval * 1000);
};

export const activate = (context: vscode.ExtensionContext): void => {
    createRefreshStatusBarItem(context);
    createNoResultsStatusBarItem(context);

    // Watch for workspace folders changing and refresh PRs when that happens
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // Only refresh if the extension has been started (timer exists)
            if (timer) {
                getPullRequests(context);
            }
        }),
    );

    // Register start command
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

    // Register stop command
    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.stop", () => {
            if (timer) {
                clearTimeout(timer);
            }

            vscode.window.showInformationMessage("Mitchell's Monitor has been stopped!");
        }),
    );

    // Register refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh", () => {
            getPullRequests(context);

            vscode.window.showInformationMessage(
                "Mitchell's Monitor - Refreshing pull requests...",
            );
        }),
    );

    // Register refresh with error display command
    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh.showError", () => {
            getPullRequests(context);

            vscode.window.showInformationMessage(
                "Mitchell's Monitor - Attempting to connect to remote...",
            );
        }),
    );

    // Register set token command
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

    // Auto-start if configured
    const autostart = vscode.workspace.getConfiguration("mitchells-monitor").get("autostart");
    const token = context.globalState.get("token");
    if (autostart && token) {
        vscode.commands.executeCommand("mitchells-monitor.start", { silent: true });
    }
};

export const deactivate = (): void => {
    if (timer) {
        clearTimeout(timer);
    }
};
