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
  onCheckout: function(branch) {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide();
    this.checkout(branch)
      .then(function(stdout) {
        atom.notifications.addSuccess(`Checkout on ${branch}`, {
          detail: stdout,
          dismissable: true
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
          dismissable: true
        });
      })
      .catch(function(stderr) {
        atom.notifications.addError(`Failed to merge ${branch}`, {
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
          dismissable: true
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
          } else if (command == "remove") {
            cb = (branch) => {this.onRemove(branch)};
          } else
            return;
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
        })
        .catch(function(err) {
          console.log(err);
        });
    }
  },
};
