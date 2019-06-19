import svelte from "rollup-plugin-svelte";
import pkg from "./package.json";

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, "$3")
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

export default {
  input: "src/CodeMirror.svelte",
  output: [{ file: pkg.module, format: "es" }],
  plugins: [svelte()]
};
