import { Component } from 'react';
import WarningPanel from './WarningPanel.jsx';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <WarningPanel kind="error" title="This page hit an unexpected error">{String(this.state.error.message)}. Your saved data is untouched; check the inputs on the calculator or reload the page.</WarningPanel>;
  }
}
