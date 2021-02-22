(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Codemirror = factory());
}(this, (function () { 'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/CodeMirror.svelte generated by Svelte v3.32.3 */

    function create_if_block(ctx) {
    	let pre;
    	let t;

    	return {
    		c() {
    			pre = element("pre");
    			t = text(/*value*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, pre, anchor);
    			append(pre, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*value*/ 1) set_data(t, /*value*/ ctx[0]);
    		},
    		d(detaching) {
    			if (detaching) detach(pre);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let textarea;
    	let t;
    	let if_block_anchor;
    	let if_block = !/*CodeMirror*/ ctx[2] && create_if_block(ctx);

    	return {
    		c() {
    			textarea = element("textarea");
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			textarea.value = /*value*/ ctx[0];
    			attr(textarea, "tabindex", "0");
    			textarea.readOnly = true;
    		},
    		m(target, anchor) {
    			insert(target, textarea, anchor);
    			/*textarea_binding*/ ctx[37](textarea);
    			insert(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*value*/ 1) {
    				textarea.value = /*value*/ ctx[0];
    			}

    			if (!/*CodeMirror*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			/*textarea_binding*/ ctx[37](null);
    			if (detaching) detach(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    const is_browser = typeof window !== "undefined";
    let codemirror_promise;
    let _CodeMirror;

    if (is_browser) {
    	codemirror_promise = import('codemirror');

    	codemirror_promise.then(mod => {
    		_CodeMirror = mod.default;
    	});
    }

    function sleep(ms) {
    	return new Promise(fulfil => setTimeout(fulfil, ms));
    }

    function instance($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { value = "" } = $$props;
    	let { readonly = false } = $$props;
    	let { errorLoc = null } = $$props;
    	let { lineNumbers = true } = $$props;
    	let { tab = true } = $$props;
    	let { cmdEnter = null } = $$props;
    	let { ctrlEnter = null } = $$props;
    	let { shiftEnter = null } = $$props;
    	let { cmdPeriod = null } = $$props;
    	let { ctrlPeriod = null } = $$props;
    	let { cmdHiffen = null } = $$props;
    	let { ctrlHiffen = null } = $$props;
    	let { cmdEqual = null } = $$props;
    	let { ctrlEqual = null } = $$props;
    	let { cmdOpenSquareBracket = null } = $$props;
    	let { ctrlOpenSquareBracket = null } = $$props;
    	let { cmdCloseSquareBracket = null } = $$props;
    	let { ctrlCloseSquareBracket = null } = $$props;
    	let { cmdForwardSlash = null } = $$props;
    	let { ctrlForwardSlash = null } = $$props;

    	async function set(new_value, new_mode, new_theme) {
    		if (new_mode !== mode || new_theme !== theme) {
    			await createEditor(mode = new_mode, theme = new_theme);
    		}

    		$$invalidate(0, value = new_value);
    		updating_externally = true;
    		if (editor) editor.setValue(value);
    		updating_externally = false;
    	}

    	function update(new_value) {
    		$$invalidate(0, value = new_value);

    		if (editor) {
    			const { left, top } = editor.getScrollInfo();
    			editor.setValue($$invalidate(0, value = new_value));
    			editor.scrollTo(left, top);
    		}
    	}

    	function getValue() {
    		if (editor) {
    			return editor.getValue();
    		}
    	}

    	function getLine(lineIndex) {
    		if (editor) {
    			return editor.getLine(lineIndex);
    		}
    	}

    	function getSelection() {
    		if (editor) {
    			let expression = editor.getSelection();

    			if (expression == "") {
    				let cursorInfo = editor.getCursor();
    				expression = editor.getDoc().getLine(cursorInfo.line);
    			}

    			return expression;
    		}
    	}

    	function getCursorPosition() {
    		return editor ? editor.getCursor() : undefined;
    	}

    	function getRange(from, to) {
    		return editor ? editor.getRange(from, to) : undefined;
    	}

    	function commentSelection() {
    		if (editor) {
    			let expression = editor.getSelection();

    			if (expression == "") {
    				let cursorInfo = editor.getCursor();
    				expression = editor.getDoc().getLine(cursorInfo.line);
    			}

    			return expression;
    		}
    	}

    	function getBlock() {
    		if (editor) {
    			let cursorInfo = editor.getCursor();

    			//find post divider
    			let line = cursorInfo.line;

    			let linePost = editor.lastLine();

    			while (line < linePost) {
    				if ((/___+/).test(editor.getLine(line))) {
    					// Test RegEx at least 3 underscores
    					linePost = line - 1;

    					break;
    				}

    				line++;
    			}

    			line = cursorInfo.line;
    			let linePre = -1;

    			while (line >= 0) {
    				// console.log(editor2.getLine(line));
    				if ((/___+/).test(editor.getLine(line))) {
    					linePre = line;
    					break;
    				}

    				line--;
    			}

    			if (linePre > -1) {
    				linePre++;
    			}

    			let code = editor.getRange({ line: linePre, ch: 0 }, { line: linePost + 1, ch: 0 });
    			return code;
    		}
    	}

    	function resize() {
    		editor.refresh();
    	}

    	function focus() {
    		editor.focus();
    	}

    	let w;
    	let h;
    	let mode;
    	let theme;

    	const modes = {
    		js: { name: "javascript", json: false },
    		json: { name: "javascript", json: true },
    		ebnf: { name: "ebnf", base: "text/html" },
    		svelte: { name: "handlebars", base: "text/html" },
    		closure: { name: "clojure", base: "text/x-clojure" },
    		asn: { name: "asn.1", base: "text/x-ttcn-asn" },
    		sema: { name: "sema", base: "text/html" }
    	};

    	const refs = {};
    	let editor;
    	let updating_externally = false;
    	let marker;
    	let error_line;
    	let destroyed = false;
    	let CodeMirror;
    	let previous_error_line;

    	onMount(() => {
    		if (_CodeMirror) {
    			$$invalidate(2, CodeMirror = _CodeMirror);

    			createEditor(mode || "svelte", theme).then(() => {
    				if (editor) editor.setValue(value || "");
    			});
    		} else {
    			codemirror_promise.then(async mod => {
    				$$invalidate(2, CodeMirror = mod.default);
    				await createEditor(mode || "svelte", theme);
    				if (editor) editor.setValue(value || "");
    			});
    		}

    		return () => {
    			destroyed = true;
    			if (editor) editor.toTextArea();
    		};
    	});

    	let first = true;

    	async function createEditor(mode, theme) {
    		if (destroyed || !CodeMirror) return;
    		if (editor) editor.toTextArea();

    		// console.log("createEditor:", theme);
    		const opts = {
    			lineNumbers,
    			lineWrapping: true,
    			indentWithTabs: true,
    			indentUnit: 2,
    			tabSize: 2,
    			value: "",
    			mode: modes[mode] || { name: mode },
    			readOnly: readonly,
    			autoCloseBrackets: true,
    			autoCloseTags: true,
    			extraKeys: {}
    		};

    		if (theme !== undefined) opts.theme = theme;
    		if (!tab) opts.extraKeys = { Tab: tab, "Shift-Tab": tab };
    		if (cmdEnter) opts.extraKeys["Cmd-Enter"] = cmdEnter;
    		if (ctrlEnter) opts.extraKeys["Ctrl-Enter"] = ctrlEnter;
    		if (shiftEnter) opts.extraKeys["Shift-Enter"] = shiftEnter;
    		if (cmdPeriod) opts.extraKeys["Cmd-."] = cmdPeriod;
    		if (ctrlPeriod) opts.extraKeys["Ctrl-."] = ctrlPeriod;
    		if (cmdHiffen) opts.extraKeys["Cmd--"] = cmdHiffen;
    		if (ctrlHiffen) opts.extraKeys["Ctrl--"] = ctrlHiffen;
    		if (cmdEqual) opts.extraKeys["Cmd-="] = cmdEqual;
    		if (ctrlEqual) opts.extraKeys["Cmd-="] = ctrlEqual;
    		if (cmdCloseSquareBracket) opts.extraKeys["Cmd-]"] = cmdCloseSquareBracket;
    		if (cmdOpenSquareBracket) opts.extraKeys["Cmd-["] = cmdOpenSquareBracket;
    		if (ctrlCloseSquareBracket) opts.extraKeys["Ctrl-]"] = ctrlCloseSquareBracket;
    		if (ctrlOpenSquareBracket) opts.extraKeys["Ctrl-["] = ctrlOpenSquareBracket;
    		if (cmdForwardSlash) opts.extraKeys["Cmd-/"] = () => editor.execCommand("toggleComment");
    		if (ctrlForwardSlash) opts.extraKeys["Ctrl-/"] = () => editor.execCommand("toggleComment");

    		// if(ctrlForwardSlash)
    		//   opts.extraKeys["Ctrl-/"] = (ctrlForwardSlash);
    		// if(cmdEnter && !opts.extraKeys["Cmd-Enter"])
    		//   opts.extraKeys["Cmd-Enter"] = (cmdEnter);
    		// Creating a text editor is a lot of work, so we yield
    		// the main thread for a moment. This helps reduce jank
    		if (first) await sleep(50);

    		if (destroyed) return;
    		$$invalidate(33, editor = CodeMirror.fromTextArea(refs.editor, opts));

    		editor.on("change", (instance, changeObj) => {
    			if (!updating_externally) {
    				// const value = instance.getValue();
    				dispatch("change", { changeObj });
    			}
    		});

    		editor.on("focus", (instance, event) => {
    			if (!updating_externally) {
    				dispatch("focus", { event });
    			}
    		});

    		editor.on("blur", (instance, event) => {
    			if (!updating_externally) {
    				dispatch("blur", { event });
    			}
    		});

    		editor.on("refresh", (instance, event) => {
    			if (!updating_externally) {
    				dispatch("refresh", { event });
    			}
    		});

    		editor.on("gutterClick", (instance, line, gutter, clickEvent) => {
    			if (!updating_externally) {
    				dispatch("gutterClick", { line, gutter, clickEvent });
    			}
    		});

    		editor.on("viewportChange", (instance, from, to) => {
    			if (!updating_externally) {
    				dispatch("viewportChange", { from, to });
    			}
    		});

    		if (first) await sleep(50);
    		editor.refresh();
    		first = false;
    	}

    	function textarea_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refs.editor = $$value;
    			$$invalidate(1, refs);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("readonly" in $$props) $$invalidate(3, readonly = $$props.readonly);
    		if ("errorLoc" in $$props) $$invalidate(4, errorLoc = $$props.errorLoc);
    		if ("lineNumbers" in $$props) $$invalidate(5, lineNumbers = $$props.lineNumbers);
    		if ("tab" in $$props) $$invalidate(6, tab = $$props.tab);
    		if ("cmdEnter" in $$props) $$invalidate(7, cmdEnter = $$props.cmdEnter);
    		if ("ctrlEnter" in $$props) $$invalidate(8, ctrlEnter = $$props.ctrlEnter);
    		if ("shiftEnter" in $$props) $$invalidate(9, shiftEnter = $$props.shiftEnter);
    		if ("cmdPeriod" in $$props) $$invalidate(10, cmdPeriod = $$props.cmdPeriod);
    		if ("ctrlPeriod" in $$props) $$invalidate(11, ctrlPeriod = $$props.ctrlPeriod);
    		if ("cmdHiffen" in $$props) $$invalidate(12, cmdHiffen = $$props.cmdHiffen);
    		if ("ctrlHiffen" in $$props) $$invalidate(13, ctrlHiffen = $$props.ctrlHiffen);
    		if ("cmdEqual" in $$props) $$invalidate(14, cmdEqual = $$props.cmdEqual);
    		if ("ctrlEqual" in $$props) $$invalidate(15, ctrlEqual = $$props.ctrlEqual);
    		if ("cmdOpenSquareBracket" in $$props) $$invalidate(16, cmdOpenSquareBracket = $$props.cmdOpenSquareBracket);
    		if ("ctrlOpenSquareBracket" in $$props) $$invalidate(17, ctrlOpenSquareBracket = $$props.ctrlOpenSquareBracket);
    		if ("cmdCloseSquareBracket" in $$props) $$invalidate(18, cmdCloseSquareBracket = $$props.cmdCloseSquareBracket);
    		if ("ctrlCloseSquareBracket" in $$props) $$invalidate(19, ctrlCloseSquareBracket = $$props.ctrlCloseSquareBracket);
    		if ("cmdForwardSlash" in $$props) $$invalidate(20, cmdForwardSlash = $$props.cmdForwardSlash);
    		if ("ctrlForwardSlash" in $$props) $$invalidate(21, ctrlForwardSlash = $$props.ctrlForwardSlash);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*editor*/ 4) {
    			if (editor && w && h) {
    				editor.refresh();
    			}
    		}

    		if ($$self.$$.dirty[0] & /*errorLoc*/ 16 | $$self.$$.dirty[1] & /*marker, editor*/ 12) {
    			{
    				if (marker) marker.clear();

    				if (errorLoc) {
    					const line = errorLoc.line - 1;
    					const ch = errorLoc.column;
    					$$invalidate(34, marker = editor.markText({ line, ch }, { line, ch: ch + 1 }, { className: "error-loc" }));
    					$$invalidate(35, error_line = line);
    				} else {
    					$$invalidate(35, error_line = null);
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*editor, previous_error_line, error_line*/ 52) {
    			if (editor) {
    				if (previous_error_line != null) {
    					editor.removeLineClass(previous_error_line, "wrap", "error-line");
    				}

    				if (error_line && error_line !== previous_error_line) {
    					editor.addLineClass(error_line, "wrap", "error-line");
    					$$invalidate(36, previous_error_line = error_line);
    				}
    			}
    		}
    	};

    	return [
    		value,
    		refs,
    		CodeMirror,
    		readonly,
    		errorLoc,
    		lineNumbers,
    		tab,
    		cmdEnter,
    		ctrlEnter,
    		shiftEnter,
    		cmdPeriod,
    		ctrlPeriod,
    		cmdHiffen,
    		ctrlHiffen,
    		cmdEqual,
    		ctrlEqual,
    		cmdOpenSquareBracket,
    		ctrlOpenSquareBracket,
    		cmdCloseSquareBracket,
    		ctrlCloseSquareBracket,
    		cmdForwardSlash,
    		ctrlForwardSlash,
    		set,
    		update,
    		getValue,
    		getLine,
    		getSelection,
    		getCursorPosition,
    		getRange,
    		commentSelection,
    		getBlock,
    		resize,
    		focus,
    		editor,
    		marker,
    		error_line,
    		previous_error_line,
    		textarea_binding
    	];
    }

    class CodeMirror_1 extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{
    				value: 0,
    				readonly: 3,
    				errorLoc: 4,
    				lineNumbers: 5,
    				tab: 6,
    				cmdEnter: 7,
    				ctrlEnter: 8,
    				shiftEnter: 9,
    				cmdPeriod: 10,
    				ctrlPeriod: 11,
    				cmdHiffen: 12,
    				ctrlHiffen: 13,
    				cmdEqual: 14,
    				ctrlEqual: 15,
    				cmdOpenSquareBracket: 16,
    				ctrlOpenSquareBracket: 17,
    				cmdCloseSquareBracket: 18,
    				ctrlCloseSquareBracket: 19,
    				cmdForwardSlash: 20,
    				ctrlForwardSlash: 21,
    				set: 22,
    				update: 23,
    				getValue: 24,
    				getLine: 25,
    				getSelection: 26,
    				getCursorPosition: 27,
    				getRange: 28,
    				commentSelection: 29,
    				getBlock: 30,
    				resize: 31,
    				focus: 32
    			},
    			[-1, -1]
    		);
    	}

    	get set() {
    		return this.$$.ctx[22];
    	}

    	get update() {
    		return this.$$.ctx[23];
    	}

    	get getValue() {
    		return this.$$.ctx[24];
    	}

    	get getLine() {
    		return this.$$.ctx[25];
    	}

    	get getSelection() {
    		return this.$$.ctx[26];
    	}

    	get getCursorPosition() {
    		return this.$$.ctx[27];
    	}

    	get getRange() {
    		return this.$$.ctx[28];
    	}

    	get commentSelection() {
    		return this.$$.ctx[29];
    	}

    	get getBlock() {
    		return this.$$.ctx[30];
    	}

    	get resize() {
    		return this.$$.ctx[31];
    	}

    	get focus() {
    		return this.$$.ctx[32];
    	}
    }

    return CodeMirror_1;

})));
//# sourceMappingURL=index.js.map
