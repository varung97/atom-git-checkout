'use babel'

var GitCheckoutView = require('./git-checkout-view');
var {CompositeDisposable} = require('atom');
var React = require('react');
var ReactDOM = require('react-dom');
var BranchList = require('./components/BranchList.jsx');
var {exec} = require('child_process');

module.exports = GitCheckout = {
  gitCheckoutView: null,
  modalPanel: null,
  subscriptions: null,

  activate: function(state) {
    this.gitCheckoutView = new GitCheckoutView(state.gitCheckoutViewState);
    this.gitCheckoutViewElement = this.gitCheckoutView.getElement();
    this.modalPanel = atom.workspace.addModalPanel({item: this.gitCheckoutView, visible: false});
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

  deactivate: function() {
    this.modalPanel.destroy()
    this.subscriptions.dispose()
    this.gitCheckoutView.destroy()
  },

  serialize: function() {
    return {gitCheckoutViewState: this.gitCheckoutView.serialize()};
  },
  getRepoPath: function() {
    return atom.workspace.getActivePaneItem().buffer.file.getParent().getPath();
    // return atom.project.getPaths()[0];
  },
  getBranchList: function() {
    return new Promise((resolve, reject) => {
      exec('git branch', {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr)
        else {
          var branchList = stdout.split('\n').filter(lign => lign != "");
          var current = null;
          branchList.forEach(function(branch, i) {
            if (branch[0] == '*') {
              current = branch.split(' ')[1];
              branchList[i] = branch.split(' ')[1];
            }
          })
          resolve({current: current, branches: branchList});
        }
      });
    });
  },
  checkout: function(branch) {
    return new Promise((resolve, reject) => {
      exec(`git checkout ${this.branches.find(b => b == branch) ? '' : '-b'} ${branch}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  merge: function(branch) {
    return new Promise((resolve, reject) => {
      exec(`git merge --no-ff ${branch}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  remove: function(branch) {
    return new Promise((resolve, reject) => {
      exec(`git branch -d ${branch}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  push: function() {
    return new Promise((resolve, reject) => {
      exec(`git push origin ${this.current}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  rebase: function(branch) {
    return new Promise((resolve, reject) => {
      exec(`git rebase ${branch}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  pull: function(rebase) {
    return new Promise((resolve, reject) => {
      exec(`git pull ${rebase ? "--rebase" : ""} ${this.current}`, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
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
          }
        })
        .catch(function(err) {
          console.log(err);
        });
    }
  },
};
