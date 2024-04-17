#!/usr/bin/env -S deno run -A
import Handlebars from "https://esm.sh/handlebars@4.7.8?dts";

const assetsJsonFile = Deno.args[0];
if (!assetsJsonFile) {
  throw new Error("Assets JSON file not supplied");
}
const target = "scripts/installer.sh";

const template = await Deno.readTextFile("./templates/installer.sh.hbs").then((
  template,
) => Handlebars.compile(template, { strict: true }));

const context = await Deno.readTextFile(assetsJsonFile).then((context) =>
  JSON.parse(context)
);

const rendered = template(context);
await Deno.writeTextFile(target, rendered);
