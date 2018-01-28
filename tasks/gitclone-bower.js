module.exports = function (grunt) {
	'use strict';

	grunt.registerTask('gitclone-bower', function () {
		var done = this.async();

		var _ = require('lodash');
		var Promise = require('bluebird');
		var execAsync = Promise.promisify(require('child_process').exec);
		var RegistryClient = require('bower-registry-client');

		var appPrefix = 'src/apps/';
		var promiseArray = [];

		var bowerConfig = grunt.file.readJSON('.bowerrc');
		var bowerFile = grunt.file.readJSON('src/bower.json');
		var appConfig = grunt.file.readJSON('src/config/settings/apps.json');
		var registry = new RegistryClient(bowerConfig);

		_.chain(bowerFile.dependencies)
			.pickBy(function (dependencyPath, dependencyName) {
				return dependencyName !== 'neo-seed';
			})
			.each(function (dependencyPath, dependencyName) {
				if (doDependencyExists(dependencyName)) {
					grunt.log.writeln('Checking out repository "' + dependencyName + '"');

					var checkoutPromise = checkoutRepository(dependencyPath, dependencyName);
					promiseArray.push(checkoutPromise);

				} else {
					grunt.log.writeln('Cloning repository "' + dependencyName + '"');

					var clonePromise = cloneRepository(dependencyName, dependencyPath);
					promiseArray.push(clonePromise);
				}
			})
			.tap(function () {
				Promise
					.all(promiseArray)
					.catch(function (err) {
						grunt.fail.fatal(err);
					})
					.finally(function () {
						done();
					});
			})
			.value();


		function doDependencyExists(dependencyName) {
			return grunt.file.exists(appPrefix + _.find(appConfig, {dependency: dependencyName}).directory);
		}

		function checkoutRepository(dependencyPath, dependencyName) {
			var checkoutTarget = resolveCheckoutTarget(dependencyPath, dependencyName);
			var directory = resolveDependencyDirectory(dependencyName);

			grunt.log.writeln(':: Fetching remote changes from "' + dependencyName + '"... ');

			return execAsync('git fetch --all', {cwd: directory})
				.then(function (stdout) {
					grunt.log.writeln(stdout);
					grunt.log.writeln(':: Resetting local changes of "' + dependencyName + '"... ');

					return execAsync('git reset --hard origin/' + checkoutTarget, {cwd: directory});
				})
				.then(function (stdout) {
					grunt.log.writeln(stdout);
					grunt.log.writeln(':: Pulling changes from "' + dependencyName + '"... ');

					return execAsync('git pull origin ' + checkoutTarget, {cwd: directory})
						.then(function (stdout) {
							grunt.log.writeln(stdout);
						});
				});
		}

		function cloneRepository(dependencyName, dependencyPath) {
			var directory = resolveDependencyDirectory(dependencyName);

			if (isGitRepoPath(dependencyPath)) {
				var repoStrings = dependencyPath.split('#');

				var repository = repoStrings[0];
				var branch = repoStrings[1] || 'HEAD';

				return execAsync('git clone -b ' + branch + ' ' + repository + ' ' + directory);
			} else {
				registry.lookup(dependencyName, function (err, entry) {

					if (err) {
						grunt.log.errorlns(err.message);
						return Promise.reject();
					}

					var config = grunt.file.readJSON('bower_components/' + dependencyName + '/bower.json');
					var repository = entry.url;
					var branch = 'v' + config.version;

					return execAsync('git clone -b ' + branch + ' ' + repository + ' ' + directory);
				});
			}
		}

		function resolveCheckoutTarget(dependencyPath, dependencyName) {
			var checkoutTarget;

			if (isGitRepoPath(dependencyPath)) {
				checkoutTarget = dependencyPath.split('#').pop();
			} else {
				var config = grunt.file.readJSON('bower_components/' + dependencyName + '/bower.json');
				checkoutTarget = 'v' + config.version;
			}

			grunt.log.writeln(':: Resolved repository target to: ' + checkoutTarget);
			return checkoutTarget;
		}

		function isGitRepoPath(path) {
			return _.startsWith(path, 'git');
		}

		function resolveDependencyDirectory(dependencyName) {
			var directory = appPrefix + _.find(appConfig, {dependency: dependencyName}).directory
			grunt.log.writeln(':: Resolved repository directory to: ' + directory);
			return directory;
		}
	});
};
