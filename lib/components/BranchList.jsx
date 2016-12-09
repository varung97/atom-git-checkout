'use babel'

import React, {update} from 'react-for-atom';
import classNames from 'classnames';

var BranchList = React.createClass({
  getInitialState: function() {
    return {
      index: 0,
      editable: false
    };
  },
  getDefaultProps: function() {
    return {
      branches: [],
      current: null,
      onValidation: function() {

      },
      onBlur: function() {

      },
      onEscape: function() {

      }
    };
  },
  componentDidMount: function() {
    this.refs.root.onkeydown = this.handleKeys;
    this.listenBlur();
  },
  componentWillUnmount: function() {
    this.resetBlurListener();
  },
  listenBlur: function() {
    if (!this.onBlurActivated) {
      this.onBlurActivated = true;
      this.refs.root.addEventListener('blur', this.onBlur);
    }
  },
  resetBlurListener: function() {
    if (this.onBlurActivated) {
      this.onBlurActivated = false;
      this.refs.root.removeEventListener('blur', this.onBlur);
    }
  },
  moveDown: function() {
    if (this.state.editable)
      this.refs.root.focus();
    this.setState(update(this.state, {
      index: {$set: (this.state.index + 1) % this.getListSize()},
      editable: {$set: false}
    }));
  },
  moveUp: function() {
    if (this.state.editable)
      this.refs.root.focus();
    this.setState(update(this.state, {
      index: {$set: this.state.index == 0 ? this.getListSize() - 1 : this.state.index - 1},
      editable: {$set: false}
    }));
  },
  getListSize: function() {
    return this.props.branches.length + (this.props.custom ? 1 : 0);
  },
  validate: function(i) {
    this.resetBlurListener();
    this.resetCustom();
    if (i === undefined)
      this.props.onValidation(this.props.branches[this.state.index]);
    else
      this.props.onValidation(this.props.branches[i]);
  },
  validateCustomBranch: function(name) {
    this.props.onValidation(name);
    this.resetCustom();
  },
  onEscape: function() {
    this.resetCustom();
    this.resetBlurListener();
    this.props.onEscape();
  },
  onBlur: function() {
    if (this.state.editable === false) {
      this.resetCustom();
      this.props.onBlur();
    }
  },
  askForCustomName: function() {
    this.setState(update(this.state, {
      editable: {$set: true}
    }), () => {this.refs.customName.focus()});
  },
  resetCustom: function() {
    this.setState(update(this.state, {
      editable: {$set: false}
    }));
  },
  focus: function() {
    this.refs.root.focus();
  },
  handleValidation: function(branch, i) {
    if (!this.props.custom || branch)
      this.validate(i);
    else if (this.state.editable === false)
      this.askForCustomName();
    else
      this.validateCustomBranch(this.refs.customName.value);
  },
  handleKeys: function(e) {
    var ctrlDown = e.ctrlKey || e.metaKey;
    e.which = e.which || e.keyCode;
    if (e.which == 13) { //enter
      this.handleValidation(this.props.branches[this.state.index], this.state.index);
    } else if (e.which == 27) {
      this.onEscape();
    } else if (e.which == 38) { //up
      this.moveUp();
    } else if (e.which == 40) { //down
      this.moveDown();
    }
  },
  onItemClick: function(i, branch) {
    return () => {
      this.handleValidation(branch, i)
    };
  },
  render: function() {
    return (
      <div ref="root" tabIndex="1">
        <ul ref="list" className="event" style={{paddingLeft: "10px"}}>
          {this.props.branches.concat(this.props.custom ? ['custom'] : []).map((branch, i) => {
            return (
              <li className={classNames({
                selectablelist: true,
                selected: this.state.index == i,
                current: this.props.current == branch
              })} style={{listStyle: "none", marginTop: "5px", marginBottom: "5px"}}
                  onClick={this.state.editable === false ? this.onItemClick(i, branch) : undefined}>
                <span className="title">
                  {branch == "custom" && this.state.editable ? (<input ref="customName" placeholder="Branch name" type="text" className="native-key-bindings"/>) : branch}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
});

export default BranchList;
