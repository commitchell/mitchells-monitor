import * as vscode from "vscode";
import {
    getCommitIcon,
    getColor,
    getMergeableIcon,
    getMergeableState,
    getPullRequestStateIcon,
    getReviewState,
    getEndpointUrl,
} from "./utils";
import { loadPullRequests, loadRepositories } from "./requests";
import type { ColorConfig, CurrentRepository, PullRequest, StatusBarItems } from "./types";
import { MODES, type Mode } from "./types";

let statusBarItems: StatusBarItems | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pullRequests: PullRequest[] = [];
let refreshButton: vscode.StatusBarItem;
let noResultsLabel: vscode.StatusBarItem;

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

        const updatedPullRequests = await loadPullRequests(
            context.globalState.get<string>("token"),
            {
                mode,
                showMerged,
                showClosed,
                repository,
                showError,
                count,
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
            pullRequests = updatedPullRequests.data || [];
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
        vscode.window.showErrorMessage("Mitchell's Monitor error rendering");
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

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "mitchells-monitor.start",
            (options: { silent?: boolean } = {}) => {
                const { silent } = options;
                getPullRequests(context);
                if (!silent) {
                    vscode.window.showInformationMessage("Mitchell's Monitor started!");
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.stop", () => {
            if (timer) {
                clearTimeout(timer);
            }
            vscode.window.showInformationMessage("Mitchell's Monitor stopped!");
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh", () => {
            getPullRequests(context);
            vscode.window.showInformationMessage("Mitchell's Monitor refreshing");
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.refresh.showError", () => {
            getPullRequests(context, true);
            vscode.window.showInformationMessage("Mitchell's Monitor refreshing");
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.setMode", async () => {
            const selectedMode = await vscode.window.showQuickPick(
                [MODES.REPOSITORY, MODES.VIEWER],
                {
                    placeHolder: "Please select the mode",
                },
            );
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
                { placeHolder: "Please select the repository" },
            );
            setRepository(context, selectedRepository);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("mitchells-monitor.enterRepositoryName", async () => {
            const selectedRepository = await vscode.window.showInputBox({
                placeHolder: "Please enter the full repository name, ie: your-team/awesome-project",
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
                vscode.window.showInformationMessage("Token saved.");
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
