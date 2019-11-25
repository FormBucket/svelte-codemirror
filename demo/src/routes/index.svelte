<script context="module">
  const is_browser = typeof window !== "undefined";

  import CodeMirror, { set, update } from "svelte-codemirror";
  import "codemirror/lib/codemirror.css";

  if (is_browser) {
    import("../codeMirrorPlugins");
  }
</script>

<script>
  import { onMount } from "svelte";
  let value1 = "const { PORT, NODE_ENV } = process.env; const dev = NODE_ENV === 'development'; export function update(new_value) { value = new_value; let cm1; let cm2; };";
  let value2 = "MD -> MD _ '*' _ E  {% function(d) {return {type: 'M', d:d, v:d[0].v*d[4].v}} %}";

  let cm1, cm2;

  export const options_cm1 = {
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
			["Ctrl-Enter"]: () => console.log("ctrl-enter")
			// ["Shift-Enter"]: () => console.log("shift-enter")
		}
  };

  export const options_cm2 = {
    lineNumbers: true,
    lineWrapping: true,
    indentWithTabs: true,
    indentUnit: 2,
    tabSize: 2,
    value: "",
    mode: "ebnf",
    readOnly: false,
    autoCloseBrackets: true,
    autoCloseTags: true,
    extraKeys: {
			// ["Cmd-Enter"]: () => console.log("cmd-enter"),
			// ["Ctrl-Enter"]: () => console.log("ctrl-enter"),
			["Shift-Enter"]: () => console.log("shift-enter")
		}
  };

	// onMount(async () => {
  //   cm1.set(value1, "ebnf");
  //   cm2.set(value2, "js");
	// });

	onMount(async () => {
    cm1.set(value1, options_cm1);
    cm2.set(value2, options_cm2);
	});


</script>

<style>
  .codemirror-container {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    line-height: 1.5;
    overflow: hidden;
  }

  .codemirror-container :global(.CodeMirror) {
    height: 100%;
    background: transparent;
    font: 400 14px/1.7 var(--font-mono);
    color: var(--base);
  }

  .codemirror-container.flex :global(.CodeMirror) {
    height: auto;
  }

  .codemirror-container.flex :global(.CodeMirror-lines) {
    padding: 0;
  }

  .codemirror-container :global(.CodeMirror-gutters) {
    padding: 0 16px 0 8px;
    border: none;
  }

  .codemirror-container :global(.error-loc) {
    position: relative;
    border-bottom: 2px solid #da106e;
  }

  .codemirror-container :global(.error-line) {
    background-color: rgba(200, 0, 0, 0.05);
  }
</style>

<svelte:head>
  <title>svelte-codemirror example</title>
</svelte:head>

<div class="codemirror-container flex">
  <CodeMirror bind:this={cm1} bind:value={value1} />
  <br>
  <CodeMirror bind:this={cm2} bind:value={value2} />
  <br>
  <button on:click="{ () => { value1 += value1 + '1'; cm2.update(value1); console.log(value1); }}" >Press me!</button>
</div>
