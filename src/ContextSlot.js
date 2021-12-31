import { h } from 'preact';
import { forwardContext } from './register';

export function ContextSlot({ children }, context) {
	const ref = (ref) => forwardContext(this, ref, context);

	return h('slot', { ref }, children);
}
