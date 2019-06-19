(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.Codemirror = factory());
}(this, function () { 'use strict';

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
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
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
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = current_component;
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
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_binding_callback(fn) {
        binding_callbacks.push(fn);
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.shift()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            while (render_callbacks.length) {
                const callback = render_callbacks.pop();
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_render);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_render.forEach(add_render_callback);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_render } = component.$$;
        fragment.m(target, anchor);
        // onMount happens after the initial afterUpdate. Because
        // afterUpdate callbacks happen in reverse order (inner first)
        // we schedule onMount callbacks before afterUpdate callbacks
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
        after_render.forEach(add_render_callback);
    }
    function destroy(component, detaching) {
        if (component.$$) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal: not_equal$$1,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_render: [],
            after_render: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_render);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro && component.$$.fragment.i)
                component.$$.fragment.i();
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy(this, true);
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
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/CodeMirror.svelte generated by Svelte v3.5.1 */

    function add_css() {
    	var style = element("style");
    	style.id = 'svelte-1jpkv2x-style';
    	style.textContent = "textarea.svelte-1jpkv2x{visibility:hidden}pre.svelte-1jpkv2x{position:absolute;width:100%;height:100%;top:0;left:0;border:none;padding:4px 4px 4px 60px;resize:none;font-family:var(--font-mono);font-size:13px;line-height:1.7;user-select:none;pointer-events:none;color:#ccc;tab-size:2;-moz-tab-size:2}";
    	append(document.head, style);
    }

    // (225:0) {#if !CodeMirror}
    function create_if_block(ctx) {
    	var pre, t;

    	return {
    		c() {
    			pre = element("pre");
    			t = text(ctx.code);
    			pre.className = "svelte-1jpkv2x";
    		},

    		m(target, anchor) {
    			insert(target, pre, anchor);
    			append(pre, t);
    		},

    		p(changed, ctx) {
    			if (changed.code) {
    				set_data(t, ctx.code);
    			}
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(pre);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var textarea, t, if_block_anchor;

    	var if_block = (!ctx.CodeMirror) && create_if_block(ctx);

    	return {
    		c() {
    			textarea = element("textarea");
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			textarea.tabIndex = "0";
    			textarea.readOnly = true;
    			textarea.value = ctx.code;
    			textarea.className = "svelte-1jpkv2x";
    		},

    		m(target, anchor) {
    			insert(target, textarea, anchor);
    			add_binding_callback(() => ctx.textarea_binding(textarea, null));
    			insert(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},

    		p(changed, ctx) {
    			if (changed.items) {
    				ctx.textarea_binding(null, textarea);
    				ctx.textarea_binding(textarea, null);
    			}

    			if (changed.code) {
    				textarea.value = ctx.code;
    			}

    			if (!ctx.CodeMirror) {
    				if (if_block) {
    					if_block.p(changed, ctx);
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
    			if (detaching) {
    				detach(textarea);
    			}

    			ctx.textarea_binding(null, textarea);

    			if (detaching) {
    				detach(t);
    			}

    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
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

      let { code = "", readonly = false, errorLoc = null, flex = false, lineNumbers = true, tab = true } = $$props;

      let w;
      let h;
      let mode;

      // We have to expose set and update methods, rather
      // than making this state-driven through props,
      // because it's difficult to update an editor
      // without resetting scroll otherwise
      async function set(new_code, new_mode) {
        if (new_mode !== mode) {
          await createEditor((mode = new_mode));    }

        $$invalidate('code', code = new_code);
        updating_externally = true;
        if (editor) editor.setValue(code);
        updating_externally = false;
      }

      function update(new_code) {
        $$invalidate('code', code = new_code);

        if (editor) {
          const { left, top } = editor.getScrollInfo();
          editor.setValue((code = new_code)); $$invalidate('code', code);
          editor.scrollTo(left, top);
        }
      }

      function resize() {
        editor.refresh();
      }

      function focus() {
        editor.focus();
      }

      const modes = {
        js: {
          name: "javascript",
          json: false
        },
        json: {
          name: "javascript",
          json: true
        },
        svelte: {
          name: "handlebars",
          base: "text/html"
        }
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
          $$invalidate('CodeMirror', CodeMirror = _CodeMirror);
          createEditor(mode || "svelte").then(() => {
            if (editor) editor.setValue(code || "");
          });
        } else {
          codemirror_promise.then(async mod => {
            $$invalidate('CodeMirror', CodeMirror = mod.default);
            await createEditor(mode || "svelte");
            if (editor) editor.setValue(code || "");
          });
        }

        return () => {
          destroyed = true;
          if (editor) editor.toTextArea();
        };
      });

      let first = true;

      async function createEditor(mode) {
        if (destroyed || !CodeMirror) return;

        if (editor) editor.toTextArea();

        const opts = {
          lineNumbers,
          lineWrapping: true,
          indentWithTabs: true,
          indentUnit: 2,
          tabSize: 2,
          value: "",
          mode: modes[mode] || {
            name: mode
          },
          readOnly: readonly,
          autoCloseBrackets: true,
          autoCloseTags: true
        };

        if (!tab)
          opts.extraKeys = {
            Tab: tab,
            "Shift-Tab": tab
          };

        // Creating a text editor is a lot of work, so we yield
        // the main thread for a moment. This helps reduce jank
        if (first) await sleep(50);

        if (destroyed) return;

        $$invalidate('editor', editor = CodeMirror.fromTextArea(refs.editor, opts));

        editor.on("change", instance => {
          if (!updating_externally) {
            const value = instance.getValue();
            dispatch("change", { value });
          }
        });

        if (first) await sleep(50);
        editor.refresh();

        first = false;
      }

    	function textarea_binding($$node, check) {
    		if ($$node || (!$$node && refs.editor === check)) refs.editor = $$node;
    		$$invalidate('refs', refs);
    	}

    	$$self.$set = $$props => {
    		if ('code' in $$props) $$invalidate('code', code = $$props.code);
    		if ('readonly' in $$props) $$invalidate('readonly', readonly = $$props.readonly);
    		if ('errorLoc' in $$props) $$invalidate('errorLoc', errorLoc = $$props.errorLoc);
    		if ('flex' in $$props) $$invalidate('flex', flex = $$props.flex);
    		if ('lineNumbers' in $$props) $$invalidate('lineNumbers', lineNumbers = $$props.lineNumbers);
    		if ('tab' in $$props) $$invalidate('tab', tab = $$props.tab);
    	};

    	$$self.$$.update = ($$dirty = { editor: 1, w: 1, h: 1, marker: 1, errorLoc: 1, previous_error_line: 1, error_line: 1 }) => {
    		if ($$dirty.editor || $$dirty.w || $$dirty.h) { if (editor && w && h) {
            editor.refresh();
          } }
    		if ($$dirty.marker || $$dirty.errorLoc || $$dirty.editor) { {
            if (marker) marker.clear();
        
            if (errorLoc) {
              const line = errorLoc.line - 1;
              const ch = errorLoc.column;
        
              $$invalidate('marker', marker = editor.markText(
                { line, ch },
                { line, ch: ch + 1 },
                {
                  className: "error-loc"
                }
              ));
        
              $$invalidate('error_line', error_line = line);
            } else {
              $$invalidate('error_line', error_line = null);
            }
          } }
    		if ($$dirty.editor || $$dirty.previous_error_line || $$dirty.error_line) { if (editor) {
            if (previous_error_line != null) {
              editor.removeLineClass(previous_error_line, "wrap", "error-line");
            }
        
            if (error_line && error_line !== previous_error_line) {
              editor.addLineClass(error_line, "wrap", "error-line");
              $$invalidate('previous_error_line', previous_error_line = error_line);
            }
          } }
    	};

    	return {
    		code,
    		readonly,
    		errorLoc,
    		flex,
    		lineNumbers,
    		tab,
    		set,
    		update,
    		resize,
    		focus,
    		refs,
    		CodeMirror,
    		textarea_binding
    	};
    }

    class CodeMirror_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1jpkv2x-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, ["code", "readonly", "errorLoc", "flex", "lineNumbers", "tab", "set", "update", "resize", "focus"]);
    	}

    	get set() {
    		return this.$$.ctx.set;
    	}

    	get update() {
    		return this.$$.ctx.update;
    	}

    	get resize() {
    		return this.$$.ctx.resize;
    	}

    	get focus() {
    		return this.$$.ctx.focus;
    	}
    }

    return CodeMirror_1;

}));
