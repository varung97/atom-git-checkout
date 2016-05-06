'use babel'

var GitCheckoutView = require('./git-checkout-view');
var {CompositeDisposable} = require('atom');
var {React, ReactDOM} = require('react-for-atom');
var BranchList = require('./components/BranchList.jsx');
var {exec} = require('child_process');
var node_ssh = require('node-ssh');

module.exports = GitCheckout = {
  gitCheckoutView: null,
  modalPanel: null,
  subscriptions: null,

  activate: function(state) {
    this.gitCheckoutView = new GitCheckoutView(state.gitCheckoutViewState);
    this.gitCheckoutViewElement = this.gitCheckoutView.getElement();
    this.modalPanel = atom.workspace.addModalPanel({item: this.gitCheckoutView, visible: false});
    this.ssh = new node_ssh();
    //Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();
    //Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:checkout': () => { this.toggle("checkout") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:merge': () => { this.toggle("merge") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:remove': () => { this.toggle("remove") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:push': () => { this.toggle("push") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:pull': () => { this.toggle("pull") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:rebase': () => { this.toggle("rebase") }}));
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-checkout:updateAndRebase': () => { this.toggle("updateAndRebase") }}));

  },

  consumeToolBar: function(toolBar) {
    this.toolBar = toolBar('git-checkout');

    // Adding spacer
    this.toolBar.addSpacer();

    // Using custom icon set (Ionicons)

    var checkoutButton = this.toolBar.addButton({
      icon: 'checkout',
      callback: 'git-checkout:checkout',
      tooltip: 'Checkout',
      iconset: 'icon-git'
    });

    var rebaseButton = this.toolBar.addButton({
      icon: 'rebase',
      callback: 'git-checkout:rebase',
      tooltip: 'Rebase',
      iconset: 'icon-git'
    });

    var mergeButton = this.toolBar.addButton({
      icon: 'mergebranch',
      callback: 'git-checkout:merge',
      tooltip: 'Merge',
      iconset: 'icon-git'
    });

    var removeButton = this.toolBar.addButton({
      icon: 'remove',
      callback: 'git-checkout:remove',
      tooltip: 'Remove',
      iconset: 'icon-git'
    });

    var pushButton = this.toolBar.addButton({
      icon: 'push',
      callback: 'git-checkout:push',
      tooltip: 'Push',
      iconset: 'icon-git'
    });

    var pullButton = this.toolBar.addButton({
      icon: 'pull',
      callback: 'git-checkout:pull',
      tooltip: 'Pull',
      iconset: 'icon-git'
    });

    var updateButton = this.toolBar.addButton({
      icon: 'update',
      callback: 'git-checkout:update',
      tooltip: 'Update',
      iconset: 'icon-git'
    });

    // Adding spacer
    this.toolBar.addSpacer();

    this.toolBar.onDidDestroy = function() {
      this.toolBar = null;
    };
  },

  deactivate: function() {
    this.modalPanel.destroy()
    this.subscriptions.dispose()
    this.gitCheckoutView.destroy()
    if (this.toolBar)
      this.toolBar.removeItems()
  },

  serialize: function() {
    return {gitCheckoutViewState: this.gitCheckoutView.serialize()};
  },
  getRepoPath: function() {
    let parentFolders = [];
    let parentFolder = atom.workspace.getActivePaneItem().buffer.file.getParent();
    while (parentFolder.getBaseName() != "") {
      parentFolders.push(parentFolder);
      parentFolder = parentFolder.getParent();
    }
    let existsPromises = parentFolders.map((path) => new Promise((resolve, reject) => {
      path.getSubdirectory(".git").exists().then((subdirectoryExists) => {
        resolve(subdirectoryExists);
      });
    }));
    return Promise.all(existsPromises).then((results) => {
      return parentFolders[results.findIndex((exists) => exists)].getPath();
    });
    // return atom.project.getPaths()[0];
  },
  getBranchList: function() {
    return new Promise((resolve, reject) => {
      this.execCommandInProject("git branch").then(function(stdout) {
        var branchList = stdout.split('\n').filter(lign => lign != "");
        var current = null;
        branchList.forEach(function(branch, i) {
          if (branch[0] == '*') {
            current = branch.split(' ')[1];
            branchList[i] = branch.split(' ')[1];
          }
        })
        resolve({current: current, branches: branchList});
      }).catch(function(stderr) {
        reject(stderr);
      });
    });
  },
  execCommandInLocalProject: function(command, cwd) {
    return new Promise((resolve, reject) => {
      exec(command, {cwd: cwd}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  execCommandInRemoteProject: function(command, path) {
    var host = path.split("/")[2].split(":")[0];
    var workingPath = "/".concat(path.split("/").slice(3).join("/"));
    var nuclideConfig = atom.packages.config.get("nuclide");
    if (!nuclideConfig) {
      return;
    }
    var profile = nuclideConfig.connectionProfiles.find(profile => profile.params.server == host);
    if (!profile) {
      return;
    }
    var privateKey;
    if (profile.params.authMethod == "PRIVATE_KEY") {
      privateKey = profile.params.pathToPrivateKey;
    } else {
      return;
    }
    var port = profile.params.sshPort;
    var username = profile.params.username;

    return new Promise((resolve, reject) => {
      this.ssh.connect({
        host,
        username,
        privateKey
      }).then(() => {
        this.ssh.execCommand(command, {cwd: workingPath, stream: 'both'}).then(function(result) {
          console.log('STDOUT: ' + result.stdout);
          console.log('STDERR: ' + result.stderr);
          if (result.code != 0)
            reject(result.stderr + " " + result.stdout);
          else {
            resolve(result.stdout);
          }
        });
      }).catch(function(error) {
        this.ssh.end();
        reject(error);
      });
    });
  },
  execCommandInProject: function(command) {
    return this.getRepoPath().then((path) => {
      if (path.startsWith("nuclide")) {
        return this.execCommandInRemoteProject(command, path)
      } else {
        return this.execCommandInLocalProject(command, path);
      }
    });
  },
  checkout: function(branch) {
    return this.execCommandInProject(`git checkout ${this.branches.find(b => b == branch) ? '' : '-b'} ${branch}`);
  },
  merge: function(branch) {
    return this.execCommandInProject(`git merge --no-ff --no-edit ${branch}`);
  },
  remove: function(branch) {
    return this.execCommandInProject(`git branch -d ${branch}`);
  },
  push: function() {
    return this.execCommandInProject(`git push origin ${this.current}`);
  },
  rebase: function(branch) {
    return this.execCommandInProject(`git rebase ${branch}`);
  },
  pull: function(rebase) {
    return this.execCommandInProject(`git pull ${rebase ? "--rebase" : "--no-edit"} origin ${this.current}`);
  },
  updateAndRebase: function(branch) {
    var current = this.current;
    return this.checkout(branch)
      .then(() => this.pull(false))
      .then(() => this.checkout(current))
      .then(() => this.rebase(branch));
  },
  onCheckout: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.checkout(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Checkout on ${branch}`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to checkout on ${branch}`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onMerge: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.merge(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Merged ${branch}`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to merge ${branch}`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onRebase: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.rebase(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Rebased on ${branch}`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to rebase on ${branch}`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onPush: function() {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.push()
      .then(function(stdout) {
        atom.notifications.addSuccess(`Pushed`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to push`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onPull: function(rebase) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.pull(rebase)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Pulled with ${rebase ? "rebase" : "merge"} method`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to pull`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onUpdateAndRebase: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.updateAndRebase(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Rebased on head of  origin/${branch}`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to update / rebase ${branch}`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  onRemove: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.remove(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Removed ${branch}`, {
          detail: stdout,
          dismissable: false
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to remove ${branch}`, {
          detail: stderr,
          dismissable: true
        });
      });
  },
  toggle: function(command) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    else {
      this.getBranchList()
        .then((branchesInfos) => {
          this.branches = branchesInfos.branches;
          this.current = branchesInfos.current;
          var cb;
          if (command == "checkout") {
            cb = (branch) => {this.onCheckout(branch)};
          } else if (command == "merge") {
            cb = (branch) => {this.onMerge(branch)};
          } else if (command == "rebase") {
            cb = (branch) => {this.onRebase(branch)};
          } else if (command == "push") {
            cb = (branch) => {this.onPush()};
          } else if (command == "pull") {
            cb = (branch) => {this.onPull(branch == "rebase" ? true : false)};
          } else if (command == "updateAndRebase") {
            cb = (branch) => {this.onUpdateAndRebase(branch)};
          } else if (command == "remove") {
            cb = (branch) => {this.onRemove(branch)};
          } else
            return;
          if (command != "push" && command != "pull") {
            this.rootComponent = ReactDOM.render(
              (
                <BranchList
                  onValidation={cb}
                  branches={branchesInfos.branches}
                  custom={command == "checkout"}
                  current={branchesInfos.current}
                  onBlur={() => {this.toggle()}}
                  onEscape={() => {this.toggle()}}/>
              ),
              this.gitCheckoutViewElement
            );
            this.modalPanel.show();
            this.rootComponent.refs.root.focus();
          } else if (command == "pull") {
            this.rootComponent = ReactDOM.render(
              (
                <BranchList
                  onValidation={cb}
                  branches={["rebase", "merge"]}
                  custom={false}
                  current={"rebase"}
                  onBlur={() => {this.toggle()}}
                  onEscape={() => {this.toggle()}}/>
              ),
              this.gitCheckoutViewElement
            );
            this.modalPanel.show();
            this.rootComponent.refs.root.focus();
          } else {
            cb();
          }
        })
        .catch(function(err) {
          console.log(err);
        });
    }
  },
};
