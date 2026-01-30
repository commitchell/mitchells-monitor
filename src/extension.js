const vscode = require('vscode'); // eslint-disable-line import/no-unresolved
const { clearTimeout, setTimeout } = require('timers');
const { getCommitIcon, getColor, getMergeableIcon, getMergeableState, getPullRequestStateIcon, getReviewState, getEndpointUrl } = require('./utils');
const { loadPullRequests, loadRepositories } = require('./requests');

const MODES = {
	VIEWER: 'viewer',
	REPOSITORY: 'repository',
};

let statusBarItems;

let timer;

function extractTitleText(prTitle, regexPattern) {
	if (!regexPattern) {
		return null;
	}
	try {
		const regex = new RegExp(regexPattern);
		const match = prTitle.match(regex);
		return match && match[1] ? match[1] : null;
	} catch (error) {
		console.warn('Invalid regex pattern for PR title extraction:', error);
		return null;
	}
}

function createStatusBarItem(context, prId, url) {
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	context.subscriptions.push(statusBarItem);
	const disposable = vscode.commands.registerCommand(`mitchells-monitor.openPullRequest.${prId}`, () => {
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	});
	context.subscriptions.push(disposable);
	statusBarItems[prId] = statusBarItem;
}

let pullRequests = [];
let refreshButton;
let noResultsLabel;

async function getPullRequests(context, showError) {
	clearTimeout(timer);
	let overrideRefreshInterval;
	try {
		const mode = context.globalState.get('mode', MODES.VIEWER);
		const repository = context.globalState.get('currentRepository');
		const showMerged = vscode.workspace.getConfiguration('mitchells-monitor').get('showMerged');
		const showClosed = vscode.workspace.getConfiguration('mitchells-monitor').get('showClosed');
		const count = vscode.workspace.getConfiguration('mitchells-monitor').get('count');
		const titleRegex = vscode.workspace.getConfiguration('mitchells-monitor').get('titleRegex');
		// configure custom colors
		const colorConfig = vscode.workspace.getConfiguration('mitchells-monitor').get('colors') || {};
		// configure the URL settings
		const url = getEndpointUrl(vscode.workspace.getConfiguration('mitchells-monitor').get('githubEnterpriseUrl'));
		// configure SSL
		const allowUnsafeSSL = vscode.workspace.getConfiguration('mitchells-monitor').get('allowUnsafeSSL');
		const updatedPullRequests = await loadPullRequests(context.globalState.get('token'), { mode, showMerged, showClosed, repository, showError, count, url, allowUnsafeSSL });
		if (updatedPullRequests.code === 401) {
			refreshButton.command = 'mitchells-monitor.setToken';
			refreshButton.text = '$(key)';
			refreshButton.tooltip = 'Set GitHub token for Pull Request Monitor';
			return;
		}
		if (updatedPullRequests.status === 'error') {
			refreshButton.command = 'mitchells-monitor.refresh.showError';
			refreshButton.text = '$(zap)';
			refreshButton.tooltip = 'Connect Pull Request Monitor';
			overrideRefreshInterval = 15;
		} else {
			refreshButton.command = 'mitchells-monitor.refresh';
			refreshButton.text = '$(sync)';
			refreshButton.tooltip = 'Refresh Pull Request Monitor';
			pullRequests = updatedPullRequests.data;
		}
		if (!statusBarItems) {
			statusBarItems = {};
		} else {
			const prIds = pullRequests.map(pr => `${pr.repository.name}${pr.number}`);
			Object.keys(statusBarItems)
				.forEach(item => !prIds.includes(item) && statusBarItems[item].hide());
		}
		if (pullRequests.length === 0) {
			noResultsLabel.show();
		} else {
			noResultsLabel.hide();
		}
		pullRequests.forEach((pr) => {
			const prId = `${pr.repository.name}${pr.number}`;
			if (!statusBarItems[prId]) {
				createStatusBarItem(context, prId, pr.url);
			}
			const {
				reviewsPassing,
				hasComments,
				hasPendingChangeRequests,
				isApproved,
			} = getReviewState(pr.reviews);
			const mergeableState = getMergeableState(pr, reviewsPassing);
			const closed = mergeableState === 'CLOSED';

			const statusBarItem = statusBarItems[prId];
			const displayText = extractTitleText(pr.title, titleRegex) || pr.number;
			const text = [
				getPullRequestStateIcon(pr.state),
				displayText,
				!pr.merged && !closed && getCommitIcon(pr.commits.nodes[0].commit.status),
				!pr.merged && !closed && getMergeableIcon(pr.mergeable),
				hasComments && '$(comment)',
				hasPendingChangeRequests && '$(thumbsdown)',
				isApproved && '$(thumbsup)',
			];
			statusBarItem.text = text.filter(item => item).join(' ');
			statusBarItem.color = getColor(mergeableState, colorConfig);
			statusBarItem.command = `mitchells-monitor.openPullRequest.${prId}`;
			statusBarItem.tooltip = pr.title;
			statusBarItem.prominentBackground = true;
			statusBarItem.show();
		});
	} catch (e) {
		console.error(e); // eslint-disable-line no-console
		vscode.window.showErrorMessage('Pull Request Monitor error rendering');
	}
	// we store the interval in seconds and prevent the users to set a value lower than 15s
	const userRefreshInterval = overrideRefreshInterval || Number.parseInt(vscode.workspace.getConfiguration('mitchells-monitor').get('refreshInterval'), 10);
	const refreshInterval = userRefreshInterval >= 15 ? userRefreshInterval : 60;
	if (!refreshInterval) return;
	timer = setTimeout(() => getPullRequests(context), refreshInterval * 1000);
}

function setRepository(context, nameWithOwner) {
	const currentRepository = context.globalState.get('currentRepository');
	if (nameWithOwner && (!currentRepository || currentRepository.nameWithOwner !== nameWithOwner)) {
		context.globalState.update('currentRepository', {
			nameWithOwner,
			owner: nameWithOwner.split('/')[0],
			name: nameWithOwner.split('/')[1],
		});
		context.globalState.update('mode', MODES.REPOSITORY);
		getPullRequests(context);
	}
}

function activate(context) {
	noResultsLabel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	noResultsLabel.command = 'mitchells-monitor.selectRepository';
	noResultsLabel.text = 'No PRs';
	noResultsLabel.tooltip = 'Select another repository';
	context.subscriptions.push(noResultsLabel);

	refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	refreshButton.command = 'mitchells-monitor.refresh';
	refreshButton.text = '$(sync)';
	refreshButton.tooltip = 'Refresh Pull Request Monitor';
	refreshButton.show();
	context.subscriptions.push(refreshButton);

	let disposable = vscode.commands.registerCommand('mitchells-monitor.start', (options = {}) => {
		const { silent } = options;
		getPullRequests(context);
		if (!silent) vscode.window.showInformationMessage('Pull Request Monitor started!');
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.stop', () => {
		clearTimeout(timer);
		vscode.window.showInformationMessage('Pull Request Monitor stopped!');
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.refresh', () => {
		getPullRequests(context);
		vscode.window.showInformationMessage('Pull Request Monitor refreshing');
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.refresh.showError', () => {
		getPullRequests(context, true);
		vscode.window.showInformationMessage('Pull Request Monitor refreshing');
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.setMode', async () => {
		const selectedMode = await vscode.window.showQuickPick([MODES.REPOSITORY, MODES.VIEWER], { placeHolder: 'Please select the mode' });
		if (selectedMode && context.globalState.get('mode') !== selectedMode) {
			if (selectedMode === MODES.REPOSITORY && !context.globalState.get('currentRepository')) {
				vscode.commands.executeCommand('mitchells-monitor.selectRepository');
				return;
			}
			context.globalState.update('mode', selectedMode);
			getPullRequests(context);
		}
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.selectRepository', async () => {
		const url = getEndpointUrl(vscode.workspace.getConfiguration('mitchells-monitor').get('githubEnterpriseUrl'));
		const allowUnsafeSSL = vscode.workspace.getConfiguration('mitchells-monitor').get('allowUnsafeSSL');
		const { data: repositories } = await loadRepositories(context.globalState.get('token'), { url, allowUnsafeSSL });
		if (!repositories) {
			return;
		}
		const repositoryNames = repositories.map(repository => repository.nameWithOwner);
		const selectedRepository = await vscode.window.showQuickPick(repositoryNames, { placeHolder: 'Please select the repository' });
		setRepository(context, selectedRepository);
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.enterRepositoryName', async () => {
		const selectedRepository = await vscode.window.showInputBox({ placeHolder: 'Please enter the full repository name, ie: your-team/awesome-project' });
		setRepository(context, selectedRepository);
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('mitchells-monitor.setToken', async () => {
		const token = await vscode.window.showInputBox({ placeHolder: 'Please enter your GitHGub token' });
		if (token) {
			context.globalState.update('token', token);
			getPullRequests(context);
			vscode.window.showInformationMessage('Token saved.');
		}
	});

	context.subscriptions.push(disposable);

	if (vscode.workspace.getConfiguration('mitchells-monitor').get('autostart') && context.globalState.get('token')) {
		vscode.commands.executeCommand('mitchells-monitor.start', { silent: true });
	}
}
exports.activate = activate;

function deactivate() {
	// todo
}
exports.deactivate = deactivate;
