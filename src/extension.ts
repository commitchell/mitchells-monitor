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
import { loadPullRequests, loadRepositories } from "./requests";
import type { ColorConfig, CurrentRepository, PullRequest, StatusBarItems } from "./types";
import { MODES, type Mode } from "./types";

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
    const toReturn = results.filter((repo): repo is CurrentRepository => {
        if (!repo || seen.has(repo.nameWithOwner)) {
            return false;
        }
        seen.add(repo.nameWithOwner);
        return true;
    });
    return toReturn;
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
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
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
        const mode = context.globalState.get<Mode>("mode", MODES.VIEWER);
        const repository = context.globalState.get<CurrentRepository>("currentRepository");

        const showMerged = config.get<boolean>("showMerged", false);
        const showClosed = config.get<boolean>("showClosed", false);
        const count = config.get<number>("count", 6);
        const titleRegex = config.get<string | null>("titleRegex", null);
        const colorConfig = config.get<ColorConfig>("colors", {});
        const url = getEndpointUrl(config.get<string | null>("githubEnterpriseUrl", null));
        const allowUnsafeSSL = config.get<boolean>("allowUnsafeSSL", false);

        // Determine effective mode and repository for smart viewer
        let effectiveMode = mode;
        let effectiveRepository = repository;
        let workspaceRepoNames: Set<string> | undefined;

        if (mode === MODES.SMART_VIEWER) {
            const workspaceRepos = await detectWorkspaceRepositories();
            if (workspaceRepos.length === 1) {
                // Single repo detected - use repository mode for efficiency
                effectiveMode = MODES.REPOSITORY;
                effectiveRepository = workspaceRepos[0];
            } else if (workspaceRepos.length > 1) {
                // Multiple repos detected - fetch all PRs and filter client-side
                effectiveMode = MODES.VIEWER;
                effectiveRepository = undefined;
                workspaceRepoNames = new Set(workspaceRepos.map((r) => r.nameWithOwner));
            } else {
                // No repos detected - fall back to viewer mode
                effectiveMode = MODES.VIEWER;
                effectiveRepository = undefined;
            }
        }

        const updatedPullRequests = await loadPullRequests(
            context.globalState.get<string>("token"),
            {
                mode: effectiveMode,
                showMerged,
                showClosed,
                repository: effectiveRepository,
                showError,
                count: workspaceRepoNames ? count * workspaceRepoNames.size : count,
                url,
                allowUnsafeSSL,
            },
        );

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
                        const matches = workspaceRepoNames.has(prRepoName);
                        return matches;
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

const setRepository = (
    context: vscode.ExtensionContext,
    nameWithOwner: string | undefined,
): void => {
    const currentRepository = context.globalState.get<CurrentRepository>("currentRepository");
    if (
        nameWithOwner &&
        (!currentRepository || currentRepository.nameWithOwner !== nameWithOwner)
    ) {
        context.globalState.update("currentRepository", {
            nameWithOwner,
            owner: nameWithOwner.split("/")[0],
            name: nameWithOwner.split("/")[1],
        });
        context.globalState.update("mode", MODES.REPOSITORY);
        getPullRequests(context);
    }
};

export const activate = (context: vscode.ExtensionContext): void => {
    noResultsLabel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    noResultsLabel.command = "mitchells-monitor.selectRepository";
    noResultsLabel.text = "No PRs";
    noResultsLabel.tooltip = "Select another repository";
    context.subscriptions.push(noResultsLabel);

    refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    refreshButton.command = "mitchells-monitor.refresh";
    refreshButton.text = "$(sync)";
    refreshButton.tooltip = "Refresh pull requests";
    refreshButton.show();
    context.subscriptions.push(refreshButton);

    // Auto-refresh when workspace folders change (for smart-viewer mode)
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const mode = context.globalState.get<Mode>("mode", MODES.VIEWER);
            if (mode === MODES.SMART_VIEWER) {
                console.log(
                    "[Smart Viewer] Workspace folders changed, refreshing pull requests...",
                );
                getPullRequests(context);
            }
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
            console.log("Hi mitchell!!");
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
        vscode.commands.registerCommand("mitchells-monitor.setMode", async () => {
            const currentMode = context.globalState.get<Mode>("mode", MODES.VIEWER);

            const modeOptions = [
                { label: MODES.SMART_VIEWER, description: "Auto-detect repository from workspace" },
                { label: MODES.VIEWER, description: "Show all your pull requests" },
                { label: MODES.REPOSITORY, description: "Show PRs from a specific repository" },
            ];

            const selectedOption = await vscode.window.showQuickPick(modeOptions, {
                placeHolder: `Current mode: ${currentMode}`,
            });

            const selectedMode = selectedOption?.label as Mode | undefined;

            if (selectedMode && context.globalState.get("mode") !== selectedMode) {
                if (
                    selectedMode === MODES.REPOSITORY &&
                    !context.globalState.get("currentRepository")
                ) {
                    vscode.commands.executeCommand("mitchells-monitor.selectRepository");
                    return;
                }
                context.globalState.update("mode", selectedMode);
                getPullRequests(context);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.selectRepository", async () => {
            const config = vscode.workspace.getConfiguration("mitchells-monitor");
            const url = getEndpointUrl(config.get<string | null>("githubEnterpriseUrl", null));
            const allowUnsafeSSL = config.get<boolean>("allowUnsafeSSL", false);
            const { data: repositories } = await loadRepositories(
                context.globalState.get<string>("token"),
                { url, allowUnsafeSSL },
            );

            if (!repositories) {
                return;
            }

            const repositoryNames = repositories.map(
                (repository) => repository.nameWithOwner || "",
            );

            const selectedRepository = await vscode.window.showQuickPick(
                repositoryNames.filter((name) => name),
                { placeHolder: "Choose the repository you would like to monitor" },
            );

            setRepository(context, selectedRepository);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.enterRepositoryName", async () => {
            const selectedRepository = await vscode.window.showInputBox({
                placeHolder:
                    "Please enter the name of your repository e.g. kieran/lots-of-terraform",
            });
            setRepository(context, selectedRepository);
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
