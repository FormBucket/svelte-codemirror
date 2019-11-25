<script context="module">
  const is_browser = typeof window !== "undefined";

  let codemirror_promise;
  let _CodeMirror;

  if (is_browser) {
    codemirror_promise = import("codemirror");

    codemirror_promise.then(mod => {
      _CodeMirror = mod.default;
    });
  }
</script>

<script>
  import { onMount, createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  export let value = "";
  export let readonly = false;
  export let errorLoc = null;
  export const flex = false;
  // export let lineNumbers = true;
  // export let tab = true;

  // Make options a prop 
  export const options = {
    lineNumbers: true,
    lineWrapping: true,
    indentWithTabs: true,
    indentUnit: 2,
    tabSize: 2,
    value: "",
    mode: "javascript",
    readOnly: false,
    autoCloseBrackets: true,
    autoCloseTags: true,
    extraKeys: {
			["Cmd-Enter"]: () => console.log("cmd-enter"),
			["Ctrl-Enter"]: () => console.log("ctrl-enter"),
			["Shift-Enter"]: () => console.log("shift-enter")
		}
  };

  let w;
  let h;
  let mode;

  /**
   * We have to expose set and update methods, rather
   * than making this state-driven through props, 
   * because it's difficult to update an editor
   * without resetting scroll otherwise
 
  export async function set(new_value, new_mode) {
    if (new_mode !== mode) {
      await createEditor((mode = new_mode));
    }

    value = new_value;
    updating_externally = true;
    if (editor) editor.setValue(value);
    updating_externally = false;
  }
   */

  /** 
   * We want to expose the full options list
   */ 
  export async function set(newValue, newOptions) {
    if (options !== newOptions) {
      await createEditor((options = newOptions));
    }

    value = new_value;
    updating_externally = true;
    if (editor) editor.setValue(value);
    updating_externally = false;
  }

  export function update(new_value) {
    value = new_value;

    if (editor) {
      const { left, top } = editor.getScrollInfo();
      editor.setValue((value = new_value));
      editor.scrollTo(left, top);
    }
  }

  export function resize() {
    editor.refresh();
  }

  export function focus() {
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
    },
    ebnf: {
      name: "ebnf",
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

  $: if (editor && w && h) {
    editor.refresh();
  }

  $: {
    if (marker) marker.clear();

    if (errorLoc) {
      const line = errorLoc.line - 1;
      const ch = errorLoc.column;

      marker = editor.markText(
        { line, ch },
        { line, ch: ch + 1 },
        {
          className: "error-loc"
        }
      );

      error_line = line;
    } else {
      error_line = null;
    }
  }

  let previous_error_line;
  $: if (editor) {
    if (previous_error_line != null) {
      editor.removeLineClass(previous_error_line, "wrap", "error-line");
    }

    if (error_line && error_line !== previous_error_line) {
      editor.addLineClass(error_line, "wrap", "error-line");
      previous_error_line = error_line;
    }
  }

  onMount(() => {
    if (_CodeMirror) {
      CodeMirror = _CodeMirror;
      createEditor(mode || "svelte").then(() => {
        if (editor) editor.setValue(value || "");
      });
    } else {
      codemirror_promise.then(async mod => {
        CodeMirror = mod.default;
        await createEditor(mode || "svelte");
        if (editor) editor.setValue(value || "");
      });
    }

    return () => {
      destroyed = true;
      if (editor) editor.toTextArea();
    };
  });

  let first = true;

  /**
   * Extract this to the client 
   */


  /**
   * We want to expose the full options list
   */
  async function createEditor(options) {
    if (destroyed || !CodeMirror) return;

    if (editor) editor.toTextArea();
   
    // Creating a text editor is a lot of work, so we yield
    // the main thread for a moment. This helps reduce jank
    if (first) await sleep(50);

    if (destroyed) return;

    editor = CodeMirror.fromTextArea(refs.editor, options);

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
   


  /** 
   * Ye Olde createEditor, just with 'mode' configurable 

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

    editor = CodeMirror.fromTextArea(refs.editor, opts);

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
  */ 

  function sleep(ms) {
    return new Promise(fulfil => setTimeout(fulfil, ms));
  }
</script>

<style>
  textarea {
    visibility: hidden;
  }

  pre {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    border: none;
    padding: 4px 4px 4px 60px;
    resize: none;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.7;
    user-select: none;
    pointer-events: none;
    color: #ccc;
    tab-size: 2;
    -moz-tab-size: 2;
  }
</style>

<textarea tabindex="0" bind:this={refs.editor} readonly {value} />
{#if !CodeMirror}
  <pre>{value}</pre>
{/if}
