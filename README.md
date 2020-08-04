# Documentation

Resolve [Wicket's](https://wicket.apache.org/) template hierarchy and render all HTML parts as single static pages.

## Usage

- Install Node.js dependencies by `npm install`.
- Start static server by `npm run serve` or by `node ./node_modules/.bin/wicket-static-server --server`.
- Open [localhost:3000](http://localhost:3000) and browse [pages](/pages), [panels](/panels) or [dialogs](/dialogs).

## Parameters

Use CLI parameters for easy configuration.

- Use `-a` or `--auth` to activate basic auth for password protection.
- Use `--entryPage` to show a specific markdown file as entry page.
- Use `--expressRoot` to define a path from which additional static files are served.
- Use `-r` or `--reload` to add <script src="//localhost:[opts.reloadPort]/livereload.js"></script> to all page bodies.
- Use `--reloadPort` to define the port in the livereload script tag.
- Use `-s` or `--server` to start an express server.
- Use `--serverPort` to define the port for the express server.
- Use `--templateExpansion` to define which templates are used to extend the templates. It must be a superset of --templateScope.
- Use `--templateScope` to define which templates should be resolved and listed.
- Use `-v` or `--verbose` to print more information during execution.

# Template Tags

Special comments and Wicket tags are used to complete a page.

- <wicket:child> is the placeholder to include successors's HTML.
- <wicket:head> content is merged and included once per page.
- <wicket:extend> is the part of a template which is passed to its ancestors.
- &lt;!-- extend-page … --&gt; is used to define a template's ancestor.
- &lt;!-- include-panel … --&gt; is used to include panels.

## Caution

- First load takes a moment to resolve and render all templates.

## Acknowledgment

This package was developed by [Gridonic](https://gridonic.ch/) to decouple backend and frontend development.
[Inventage](https://inventage.com/) has it published as [NPM package](https://www.npmjs.com/package/@inventage/wicket-static-server) for easy reusage.
