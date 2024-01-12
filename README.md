# Documentation

Resolve [Wicket's](https://wicket.apache.org/) template hierarchy and render all HTML parts as single static pages.

## Usage

- Install Node.js dependencies by `npm install`.
- Start static server by `npm run serve` or by `node ./node_modules/.bin/wicket-static-server --server`.
- Open [localhost:3000](http://localhost:3000) and browse [pages](/pages), [panels](/panels) or [dialogs](/dialogs).

## Parameters

Use CLI parameters for easy configuration.

- Use `-h, --homepage` to show a specific html or markdown file as homepage.
- Use `-e, --expressRoot` to define a path from which additional static files are served.
- Use `-r` or `--reload` to add <script src="//localhost:[opts.reloadPort]/livereload.js"></script> to all page bodies.
- Use `-c` or `--code` to format code wrapped in `<pre><code class="language-js">…</code></pre>`.
- Use `--reloadPort` to define the port in the livereload script tag.
- Use `-s` or `--server` to start an express server.
- Use `--serverPort` to define the port for the express server.
- Use `-e, --templateRootExpansion` to define which templates are used to extend the templates. It must be a superset of --templateScope.
- Use `-t, --templateRoot` to define which templates should be resolved and listed.
- Use `-v` or `--verbose` to print more information during execution.

# Template Tags

Special comments and Wicket tags are used to complete a page.

- `<wicket:child>` is the placeholder to include successors's HTML.
- `<wicket:head>` content is merged and included once per page.
- `<wicket:extend>` is the part of a template which is passed to its ancestors.
- `<!-- extend-page … -->` is used to define a template's ancestor.
- `<!-- include-panel … -->` is used to include panels.

## Caution

- First load takes a moment to resolve and render all templates.

## Acknowledgment

This package was developed together with [Gridonic](https://gridonic.ch/) to decouple backend and frontend development.
