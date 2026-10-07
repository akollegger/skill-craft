import { mount } from "svelte";
import App from "./App.svelte";
import "./fonts.ts";
import "./theme.css";

const target = document.getElementById("app");
if (!target) throw new Error("the page has no #app element");
mount(App, { target });
