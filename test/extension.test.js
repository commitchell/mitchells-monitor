const assert = require('assert');
const vscode = require('vscode'); // eslint-disable-line import/no-unresolved

suite('Extension Tests', () => {
	test('should be loaded', () => {
		assert.ok(vscode.extensions.getExtension('commitchell.mitchells-monitor'));
	});

	test('should be active', (done) => {
		const extension = vscode.extensions.getExtension('commitchell.mitchells-monitor');
		assert.equal(extension.isActive, true);
		done();
	}).timeout(1000 * 15);

	const expectedCommands = [
		'mitchells-monitor.setToken',
		'mitchells-monitor.start',
		'mitchells-monitor.stop',
		'mitchells-monitor.refresh',
		'mitchells-monitor.refresh.showError',
		'mitchells-monitor.setMode',
		'mitchells-monitor.selectRepository',
		'mitchells-monitor.enterRepositoryName',
	];
	let actualCommands;
	test('should register commands', (done) => {
		vscode.commands.getCommands(true)
			.then(commands => commands.filter(command => command.startsWith('mitchells-monitor.')))
			.then((commands) => {
				assert.equal(commands.length === expectedCommands.length, true);
				actualCommands = commands;
			})
			.then(() => done());
	});

	expectedCommands.forEach(command => test(`should register ${command}`, () => {
		assert.equal(actualCommands.includes(command), true);
	}));

	test('should register configuration', (done) => {
		const actualConfig = vscode.workspace.getConfiguration('mitchells-monitor');
		assert.equal(actualConfig.get('showMerged'), false);
		assert.equal(actualConfig.get('showClosed'), false);
		assert.equal(actualConfig.get('refreshInterval'), 60);
		assert.equal(actualConfig.get('count'), 6);
		done();
	});
});
