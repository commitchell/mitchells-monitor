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

const statusBarItems: StatusBarItems = {};
const commandDisposables: Record<string, vscode.Disposable> = {};
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

const clearAllPRStatusBarItemsAndCommands = () => {
    for (const prId of Object.keys(statusBarItems)) {
        statusBarItems[prId].dispose();
        delete statusBarItems[prId];
    }
    for (const prId of Object.keys(commandDisposables)) {
        commandDisposables[prId].dispose();
        delete commandDisposables[prId];
    }
};

const createOrUpdatePRStatusBarItem = (
    context: vscode.ExtensionContext,
    pr: PullRequest,
    titleRegex: string | null,
    colorConfig: ColorConfig,
) => {
    const prId = `${pr.repository.name}${pr.number}`;

    let statusBarItem = statusBarItems[prId];
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        context.subscriptions.push(statusBarItem);
        statusBarItems[prId] = statusBarItem;
    }

    if (!commandDisposables[prId]) {
        const disposable = vscode.commands.registerCommand(
            `mitchells-monitor.openPullRequest.${prId}`,
            () => {
                vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(pr.url));
            },
        );
        commandDisposables[prId] = disposable;
        context.subscriptions.push(disposable);
    }

    const pullRequestStatus = getPullRequestStatus(pr);
    const pullRequestStatusIcon = getPullRequestStatusIcon(pullRequestStatus);
    const displayText = generateDisplayText(pr, titleRegex);
    const itemsToDisplayAsText = [pullRequestStatusIcon, displayText];

    statusBarItem.text = itemsToDisplayAsText.filter((item) => item).join(" ");
    statusBarItem.color = getPullRequestColour(pullRequestStatus, colorConfig);
    statusBarItem.command = `mitchells-monitor.openPullRequest.${prId}`;
    statusBarItem.tooltip = `${pr.repository.nameWithOwner}\n${pr.title}`;
    statusBarItem.show();
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

    const seen = new Set<string>();
    return results.filter((repo): repo is CurrentRepository => {
        if (!repo || seen.has(repo.nameWithOwner)) {
            return false;
        }
        seen.add(repo.nameWithOwner);
        return true;
    });
};

const fetchAndRenderPullRequests = async (
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration,
    manual: boolean = false,
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
        clearAllPRStatusBarItemsAndCommands();
        vscode.window.showWarningMessage(
            "Mitchell's Monitor - Please enter a token to begin monitoring!",
        );
        refreshButton.command = "mitchells-monitor.setToken";
        refreshButton.text = "$(key)";
        refreshButton.tooltip = "Set token";
        return;
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
        clearAllPRStatusBarItemsAndCommands();
        if (fetchedPullRequests.code === 401 || fetchedPullRequests.code === 403) {
            vscode.window.showErrorMessage("Mitchell's Monitor - Token not authorized!");
            refreshButton.command = "mitchells-monitor.setToken";
            refreshButton.text = "$(key)";
            refreshButton.tooltip = "Set token";
            return undefined;
        } else {
            const githubEnterpriseUrl = config.get<string | null>("githubEnterpriseUrl", null);
            const isVpnIssue = githubEnterpriseUrl && fetchedPullRequests.code === undefined;

            refreshButton.tooltip = "Connect to remote";
            if (isVpnIssue) {
                noResultsLabel.text = "Connect to VPN?";
                noResultsLabel.tooltip = "Check VPN connection and refresh";
                noResultsLabel.show();

                refreshButton.text = "$(globe)";
            } else {
                refreshButton.text = "$(zap)";
            }

            if (manual) {
                vscode.window.showErrorMessage(
                    `Mitchell's Monitor - There was an unknown error fetching the data.`,
                );
            }
        }
    } else {
        refreshButton.command = "mitchells-monitor.refresh";
        refreshButton.text = "$(mitchells-monitor-sync-pull-requests)";
        refreshButton.tooltip = "Refresh pull requests";

        const allPRs = fetchedPullRequests.data || [];

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

            return b.number - a.number;
        });

        const workspaceRepos = await detectWorkspaceRepositories();
        let workspaceRepoNames: Set<string> | undefined;
        if (workspaceRepos.length > 0) {
            workspaceRepoNames = new Set(workspaceRepos.map((r) => r.nameWithOwner));
        }
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

        clearAllPRStatusBarItemsAndCommands();
        pullRequests.forEach((pr) => {
            createOrUpdatePRStatusBarItem(context, pr, titleRegex, colorConfig);
        });

        if (pullRequests.length === 0) {
            noResultsLabel.text = "No PRs";
            noResultsLabel.tooltip = "Refresh pull requests";
            noResultsLabel.show();
            return;
        } else {
            noResultsLabel.hide();
        }

        if (manual) {
            vscode.window.showInformationMessage(
                `Mitchell's Monitor - Fetched ${pullRequests.length} pull request(s)!`,
            );
        }
    }
};

const getPullRequests = async (
    context: vscode.ExtensionContext,
    manual: boolean = false,
): Promise<void> => {
    const config = vscode.workspace.getConfiguration("mitchells-monitor");

    if (timer) {
        clearTimeout(timer);
    }

    await fetchAndRenderPullRequests(context, config, manual).catch((e) => {
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
            vscode.window.showInformationMessage("Mitchell's Monitor - Fetching pull requests...");
            getPullRequests(context, true);
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
