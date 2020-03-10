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
  let value1 = `:b:{{1,0.25}imp}\909b;:s:{{1,0.25}imp}\909;:c:{{{1,0.66}imp,{1,0.8}imp}add}\909closed;:o:{{0.25,0.75}imp}\909open`;
  let value2 = "MAIN -> SENTENCE '.' SENTENCE -> SUB _ VERB _ MOD  MD -> MD _ '*' _ E  {% function(d) {return {type: 'M', d:d, v:d[0].v*d[4].v}} %}";

  let cm1, cm2;
 
  let cmdEnter = () => console.log("cmd-Enter");
  let ctrlEnter = () => console.log("ctrl-Enter");
  let cmdPeriod = () => console.log("cmd-.");
  let ctrlPeriod = () => console.log("ctrl-.");
  let cmdForwardSlash = () => {
    console.log("cmd-/"); 
  }
  let ctrlForwardSlash = () => {
    console.log("ctrl-/"); 
  }

	// onMount(async () => {
  //   cm1.set(value1, "ebnf");
  //   cm2.set(value2, "js");
	// });

	onMount(async () => {
    console.log(cm1)
    // cm1.set(value1, options_cm1);
    cm1.set(value1, "js", 'monokai');
    
    // console.log(options_cm2)
    // cm2.set(value2, options_cm2);
    cm2.set(value2, "ebnf");
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
/* 
  .codemirror-container :global(.CodeMirror) {
    height: 100%;
    background: transparent;
    font: 400 14px/1.7 var(--font-mono);
    color: var(--base);
  }

  .codemirror-container-sema {
    height: 100%;
    background: transparent;
    font: 400 14px/1.7 var(--font-mono);
    color: whitesmoke;
    background-color: gray;
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
  } */
</style>

<svelte:head>
  <title>svelte-codemirror example</title>
</svelte:head>

<div class="codemirror-container flex">
  <div class="codemirror-container-sema">
    <CodeMirror bind:this={cm1} 
                bind:value={value1} 
                tab={false} 
                cmdEnter={cmdEnter} 
                cmdPeriod={cmdPeriod} 
                ctrlEnter={ctrlEnter} 
                cmdForwardSlash={cmdForwardSlash}
                ctrlForwardSlash={ctrlForwardSlash}
                />
  </div>
  <br>
  <CodeMirror bind:this={cm2} bind:value={value2} ctrlEnter={ctrlEnter} cmdPeriod={cmdPeriod}/>
  <br>
  <button on:click="{ () => { value1 += value1 + '1'; cm2.update(value1); console.log(value1); }}" >Press me!</button>
</div>
