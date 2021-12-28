import HTMLParsedElement from 'html-parsed-element';
import { h, cloneElement, render, hydrate } from 'preact';
import { memo } from 'preact/compat';

export default function register(Component, tagName, propNames, options) {
	function PreactElement() {
		const inst = Reflect.construct(HTMLElement, [], PreactElement);
		inst._vdomComponent = Component;
		inst._hasShadow = options && options.shadow;
		inst._root = inst._hasShadow ? inst.attachShadow({ mode: 'open' }) : inst;
		return inst;
	}
	PreactElement.prototype = Object.create(HTMLElement.prototype);
	PreactElement.prototype.constructor = PreactElement;
	PreactElement.prototype.parsedCallback = parsedCallback;
	PreactElement.prototype.attributeChangedCallback = attributeChangedCallback;
	PreactElement.prototype.disconnectedCallback = disconnectedCallback;

	propNames =
		propNames ||
		Component.observedAttributes ||
		Object.keys(Component.propTypes || {});
	PreactElement.observedAttributes = propNames;

	// Keep DOM properties and Preact props in sync
	propNames.forEach((name) => {
		Object.defineProperty(PreactElement.prototype, name, {
			get() {
				return this._vdom.props[name];
			},
			set(v) {
				if (this._vdom) {
					this.attributeChangedCallback(name, null, v);
				} else {
					if (!this._props) this._props = {};
					this._props[name] = v;
					this.parsedCallback();
				}

				// Reflect property changes to attributes if the value is a primitive
				const type = typeof v;
				if (
					v == null ||
					type === 'string' ||
					type === 'boolean' ||
					type === 'number'
				) {
					this.setAttribute(name, v);
				}
			},
		});
	});

	return customElements.define(
		tagName || Component.tagName || Component.displayName || Component.name,
		HTMLParsedElement.withParsedCallback(PreactElement)
	);
}

function ContextProvider(props) {
	this.getChildContext = () => props.context;
	// eslint-disable-next-line no-unused-vars
	const { context, children, ...rest } = props;
	return cloneElement(children, rest);
}

function parsedCallback() {
	// Obtain a reference to the previous context by pinging the nearest
	// higher up node that was rendered with Preact. If one Preact component
	// higher up receives our ping, it will set the `detail` property of
	// our custom event. This works because events are dispatched
	// synchronously.
	const event = new CustomEvent('_preact', {
		detail: {},
		bubbles: true,
		cancelable: true,
	});
	this.dispatchEvent(event);
	const context = event.detail.context;
	this._vdom = h(
		ContextProvider,
		{ ...this._props, context },
		toVdom(this, this._vdomComponent, this._hasShadow)
	);
	(this.hasAttribute('hydrate') ? hydrate : render)(this._vdom, this._root);
}

function toCamelCase(str) {
	return str.replace(/-(\w)/g, (_, c) => (c ? c.toUpperCase() : ''));
}

function attributeChangedCallback(name, _, newValue) {
	if (!this._vdom) return;
	// Attributes use `null` as an empty value whereas `undefined` is more
	// common in pure JS components, especially with default parameters.
	// When calling `node.removeAttribute()` we'll receive `null` as the new
	// value. See issue #50.
	newValue = newValue == null ? undefined : newValue;
	const props = {};
	props[name] = newValue;
	props[toCamelCase(name)] = newValue;
	this._vdom = cloneElement(this._vdom, props);
	render(this._vdom, this._root);
}

function disconnectedCallback() {
	render((this._vdom = null), this._root);
}

/**
 * Pass an event listener to each `<slot>` that "forwards" the current
 * context value to the rendered child. The child will trigger a custom
 * event, where will add the context value to. Because events work
 * synchronously, the child can immediately pull of the value right
 * after having fired the event.
 */
const forwardContext = (inst, ref, context) => {
	if (!ref) {
		inst.ref.removeEventListener('_preact', inst._listener);
	} else {
		inst.ref = ref;
		if (!inst._listener) {
			inst._listener = (event) => {
				event.stopPropagation();
				event.detail.context = context;
			};
			ref.addEventListener('_preact', inst._listener);
		}
	}
};

function Slot(props, context) {
	return h('slot', {
		...props,
		ref: (ref) => forwardContext(this, ref, context),
	});
}

const FakeSlot = memo(
	function ({ name, el, els }, context) {
		return h('slot', {
			name,
			ref: (ref) => {
				forwardContext(this, ref, context);
				if (!ref) return;
				el ? ref.append(el) : ref.append(...els);
			},
		});
	},
	() => true
);

function toVdom(element, nodeName, hasShadow) {
	if (element.nodeType === 3) return element.data;
	if (element.nodeType !== 1) return null;
	let children = [],
		props = {},
		i = 0,
		a = element.attributes,
		cn = element.childNodes;
	for (i = a.length; i--; ) {
		if (a[i].name !== 'slot') {
			props[a[i].name] = a[i].value;
			props[toCamelCase(a[i].name)] = a[i].value;
		}
	}

	for (i = cn.length; i--; ) {
		// Move slots correctly
		const name = cn[i].slot;
		if (!name && !hasShadow) {
			children.unshift(cn[i]);
			continue;
		}
		props[name] = hasShadow
			? h(Slot, { name })
			: h(FakeSlot, { name, el: cn[i] });
	}

	if (!hasShadow) {
		element.innerHTML = '';
	}

	const wrappedChildren = hasShadow ? h(Slot) : h(FakeSlot, { els: children });
	return h(nodeName || element.nodeName.toLowerCase(), props, wrappedChildren);
}
