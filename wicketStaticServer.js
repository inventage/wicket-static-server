/* eslint-disable import/no-extraneous-dependencies */
const express = require('express');
const fs = require('graceful-fs');
const path = require('path');
const glob = require('glob');
const marked = require('marked');
const swig = require('swig-templates');
const timeout = require('connect-timeout');
const bodyParser = require('body-parser');
const serveIndex = require('serve-index');
const serveStatic = require('serve-static');
const http = require('http');
const basicAuth = require('basic-auth');
const extend = require('extend');
const compression = require('compression');
const recursiveReadSync = require('recursive-readdir-sync');

const app = express();

// Add syntax highlighting for styleguide
require('swig-highlight').apply(swig);

const WICKET_ROOT = path.resolve(`${__dirname}/test/templates/package-a/`);
const WICKET_EXTEND_ROOT = path.resolve(`${__dirname}/test/templates/`);
const WEB_ROOT = path.resolve(`${__dirname}/`);

// Caching variables
const filePathsCache = {};

// Setup server options
const opts = require('nomnom')
    .option('reload', {
        flag: true,
        default: false,
        help: 'Add live-reload middleware'
    })
    .option('verbose', {
        flag: true,
        default: false,
        help: 'Should we display some more information during execution?'
    })
    .option('server', {
        flag: true,
        default: false,
        help: 'Should we start an express server? Only needed if the server is used outside of Grunt.'
    })
    .option('auth', {
        flag: true,
        default: false,
        help: 'Should we use basic auth for password protection?'
    })
    .parse();

/**
 * Simple basic auth middleware for use with Express 4.x.
 *
 * @example
 * app.use('/route-requiring-auth', httpBasicAuth('username', 'password'));
 *
 * @param   {string}   username Expected username
 * @param   {string}   password Expected password
 * @returns {function} Express 4 middleware requiring the given credentials
 */
function httpBasicAuth(username, password) {
    return (req, res, next) => {
        const user = basicAuth(req);

        if (!user || user.name !== username || user.pass !== password) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            return res.sendStatus(401);
        }

        return next();
    };
}

/**
 * Returns the contents of the file at the given file path
 * or null if the file was not found or is not a file.
 *
 * @param filePath
 * @return {*}
 */
function readFile(filePath) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return fs.readFileSync(filePath, { encoding: 'utf-8' });
    }

    return null;
}

/**
 * Halts the request when the timeout is reached
 *
 * @param req
 * @param res
 * @param next
 * @link https://github.com/expressjs/timeout#as-top-level-middleware
 */
function haltOnTimeout(req, res, next) {
    if (!req.timedout) {
        next();
    }
}

/**
 * Add livereload middleware of grunt-contrib-watch.
 *
 * @param html
 * @returns {*}
 */
function addLiveReload(html) {
    if (opts.reload === true && html.indexOf('localhost:35729/livereload.js') === -1) {
        // noinspection JSUnresolvedLibraryURL
        return html.replace('</body>', '<script src="//localhost:35729/livereload.js"></script></body>');
    }

    return html;
}

/**
 * Searches for the given filename in the WICKET_EXTEND_ROOT
 * and returns the entire file contents if the file was found.
 *
 * @param fileName
 * @return {*}
 */
function readWicketHtmlFile(fileName) {
    // Do not perform the glob lookup if the file's location
    // was already found before
    if (Object.prototype.hasOwnProperty.call(filePathsCache, fileName)) {
        return readFile(filePathsCache[fileName]);
    }

    const searchPattern = `${WICKET_EXTEND_ROOT}/**/${fileName}`;
    filePathsCache[fileName] = glob.sync(searchPattern)[0];

    return readFile(filePathsCache[fileName]);
}

/**
 * TODO: Document
 *
 * @param html
 * @param additionalHeadElements
 */
function collectAdditionalHeadContent(html, additionalHeadElements) {
    const additionalHeadRegex = /<wicket:head>([\s\S]*)<\/wicket:head>/;
    const found = html.match(additionalHeadRegex);

    if (found) {
        additionalHeadElements.push(found[1]);
    }
}

/**
 * TODO: Document
 *
 * @param html
 * @param additionalHeadElements
 * @return {*}
 */
function includeAdditionalHeadElements(html, additionalHeadElements) {
    const additionalHeadRegex = /<!-- wicket-head -->/;
    const found = html.match(additionalHeadRegex);

    if (!found) {
        return html;
    }

    return html.replace(found[0], additionalHeadElements.join('\n'));
}

/**
 * Start a timer with the given key
 *
 * @param key
 */
function time(key) {
    if (opts.verbose === true) {
        console.time(key);
    }
}

/**
 * End a timer with the given key
 *
 * @param key
 */
function timeEnd(key) {
    if (opts.verbose === true) {
        console.timeEnd(key);
    }
}

/**
 * Syntax for variables in child pages, that should be passed to the parent page
 * is
 *      with="variable1: value, variable2: value"
 *
 * @param existingVariables
 * @param variablesInExtendString
 * @return {{}}
 */
function parseExtendVariables(existingVariables, variablesInExtendString) {
    if (!variablesInExtendString) {
        return existingVariables;
    }

    const variablesRegex = /with="([^"]*)+"/;
    const found = variablesInExtendString.match(variablesRegex);

    if (!found) {
        return existingVariables;
    }

    const variablePairs = found[1].split(',');

    variablePairs.forEach((variablePair) => {
        const variableDefinition = variablePair.split(':');

        if (variableDefinition.length !== 2) {
            throw new Error(`Wrong variable definition in ${variablesInExtendString}`);
        }

        const variableName = variableDefinition[0].trim();
        const variableValue = variableDefinition[1].trim();

        // Only add the variable if not set yet
        if (!Object.prototype.hasOwnProperty.call(existingVariables, variableName)) {
            existingVariables[variableName] = variableValue; // eslint-disable-line no-param-reassign
        }
    });

    return existingVariables;
}

/**
 * TODO: Document
 *
 * @param varsString
 * @return {{}}
 */
function extractVars(varsString) {
    const vars = {};

    if (!varsString) {
        return vars;
    }

    const variablesWithValuesRegex = /((\w+)="([^"]*)")/gi;
    const matches = varsString.match(variablesWithValuesRegex);

    matches.forEach((match) => {
        const variableDefinition = match.split('=');
        vars[variableDefinition[0]] = variableDefinition[1].substr(1, variableDefinition[1].length - 2);
    });

    return vars;
}

/**
 * TODO: Document
 *
 * @param html
 * @param vars
 * @return {*}
 */
function substituteVars(html, vars) {
    return swig.render(html, { locals: vars });
}

/**
 * TODO: Document
 *
 * @param html
 * @return {string}
 */
function stripWicketTags(html) {
    const wicketTagRegex = /<\/?_?wicket:[^>]*>/gi;
    const wicketAttributesRegex = /\s?[^\s]*wicket:\w+(="[^"]*")?/gi;

    let htmlWithoutWicketTags = html.replace(wicketTagRegex, '');
    htmlWithoutWicketTags = htmlWithoutWicketTags.replace(wicketAttributesRegex, '');

    return htmlWithoutWicketTags;
}

/**
 * TODO: Document
 *
 * @param parentPage
 * @param childPage
 * @return {XML|*|string|void}
 */
function extendParentWithChild(parentPage, childPage) {
    const childRegex = /<wicket:child><\/wicket:child>/;
    const found = parentPage.match(childRegex);

    if (!found) {
        throw new Error('Parent page has no <wicket:child></wicket:child>');
    }

    return parentPage.replace(found[0], childPage);
}

/**
 * TODO: Document
 *
 * @param html
 * @param variables
 * @param additionalHeadElements
 * @return {*}
 */
function expandPages(html, variables, additionalHeadElements) {
    const extendPageRegex = /<!-- extend-page="([^"]*)"( with="[^"]*")? -->\r?\n<wicket:(extend|panel|dialog)[^>]*>([\s\S]*)<\/wicket:(extend|panel|dialog)>/;
    const found = html.match(extendPageRegex);

    if (!found) {
        return substituteVars(html, variables);
    }

    const extensionFiles = found[1];
    const extensionVariables = found[2];
    const childPage = found[4];
    const parentPage = readWicketHtmlFile(extensionFiles);

    if (!parentPage) {
        throw new Error(`No parent page found at… ${html.substring(0, 50)}`);
    }

    parseExtendVariables(variables, extensionVariables);

    const parentWithChildPage = extendParentWithChild(parentPage, childPage);

    // Check for <wicket:head> tags and collect its content
    // we will add it to the final page at the end of the building process
    collectAdditionalHeadContent(html, additionalHeadElements);

    return expandPages(parentWithChildPage, variables, additionalHeadElements);
}

/**
 * TODO: Document
 *
 * @param html
 * @param variables
 * @return {*}
 */
function includePanels(html, variables) {
    const includePanelRegex = /<!-- include-panel="([^"]+)"(.*) -->/;
    const found = html.match(includePanelRegex);

    if (!found) {
        return expandPages(html, variables);
    }

    const panelPlaceholder = found[0];
    const panelFilename = found[1];
    const panelVariables = found[2];
    let htmlFileToInclude = readWicketHtmlFile(panelFilename);

    if (htmlFileToInclude === null) {
        throw new Error(`Panel file "${panelFilename}" does not exist`);
    }

    const vars = extractVars(panelVariables);
    htmlFileToInclude = expandPages(htmlFileToInclude, extend(variables, vars), []);
    htmlFileToInclude = substituteVars(htmlFileToInclude, extend(variables, vars));
    const processedHtml = html.replace(panelPlaceholder, htmlFileToInclude);

    return includePanels(processedHtml, variables);
}

/**
 * Renders a wicket page and sends the response.
 * Optionally, a third parameter (boolean) can be passed
 * to inline the css from classes found in the wicket page html.
 *
 * @param req
 * @param res
 */
function serveWicketPage(req, res) {
    time('serveWicketPage');

    const pageWithPath = req.params[0];
    const queryVars = req.query;

    time('readWicketHtmlFile');
    let html = readWicketHtmlFile(pageWithPath);
    timeEnd('readWicketHtmlFile');

    const additionalHeadElements = [];

    if (!html) {
        res.status(404).send('Page not found.');
        return;
    }

    time('expandPages');
    html = expandPages(html, queryVars, additionalHeadElements);
    timeEnd('expandPages');

    time('includePanels');
    html = includePanels(html, queryVars);
    timeEnd('includePanels');

    time('stripWicketTags');
    html = stripWicketTags(html);
    timeEnd('stripWicketTags');

    time('includeAdditionalHeadElements');
    html = includeAdditionalHeadElements(html, additionalHeadElements);
    timeEnd('includeAdditionalHeadElements');

    html = addLiveReload(html);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    timeEnd('serveWicketPage');
}

/**
 * A generic function that reads the content of WICKET_ROOT and composes
 * a listing of all static pages that correspond to the given regex.
 *
 * @param res
 * @param validPageRegex The regex for page names we include in the listing
 * @param pageRoute The route (URI) to use for the page links
 * @param title The listing title
 */
function staticPageListing(res, validPageRegex, pageRoute, title) {
    const pageDirectory = recursiveReadSync(WICKET_ROOT);
    let html = '';

    pageDirectory.forEach((pageFile) => {
        if (pageFile.match(validPageRegex)) {
            const pageFileWithoutRoot = pageFile.replace(`${WICKET_ROOT}/`, '');
            html += `<a href="/${pageRoute}/${pageFileWithoutRoot}">/${pageRoute}/${pageFileWithoutRoot}</a><br>`;
        }
    });

    if (!html) {
        return res
            .status(404)
            .send('No pages found.');
    }

    html = addLiveReload(html);
    html = `<h1>${title}</h1>${html}`;

    res.set('Content-Type', 'text/html');
    return res.send(html);
}

app.use(timeout('10s'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(compression());
app.use(express.static(WEB_ROOT));
app.use(haltOnTimeout);

/**
 * Global logging function
 */
app.use((req, res, next) => {
    console.log('%s %s', req.method, req.url);
    next();
});

/**
 * HTTP basic auth
 */
if (opts.auth === true) {
    app.use('/', httpBasicAuth('user', 'password'));
}

/**
 * Documentation pages
 */
app.use('/doc', serveIndex('./doc', { icons: true }));
app.use('/doc', serveStatic('./doc'));

/**
 * Main route
 */
app.get('/', (req, res) => {
    const readmeFile = readFile(`${__dirname}/README.md`);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(marked(readmeFile));
});

/**
 * List all pages
 */
app.get('/pages', (req, res) => {
    staticPageListing(res, /Page\.html/, 'pages', 'Premium Pages');
});

/**
 * Parse single page
 */
app.get('/pages/*', (req, res) => {
    serveWicketPage(req, res);
});

/**
 * List all panels
 */
app.get('/panels', (req, res) => {
    staticPageListing(res, /Panel\.html/, 'panels', 'Premium Panels');
});

/**
 * Parse single panel
 */
app.get('/panels/*', (req, res) => {
    serveWicketPage(req, res);
});

/**
 * List all dialogs
 */
app.get('/dialogs', (req, res) => {
    staticPageListing(res, /Dialog\.html/, 'dialogs', 'Premium Dialogs');
});

/**
 * Parse single dialog
 */
app.get('/dialogs/*', (req, res) => {
    serveWicketPage(req, res);
});

/**
 * Test route for generic POST calls.
 * Renders the posted variables.
 */
app.all('/test/post', (req, res) => {
    let response = '';
    const params = JSON.stringify(req.params, null, '  ');
    const body = JSON.stringify(req.body, null, '  ');

    response += '<h2>Params</h2>';
    response += `<pre>${params}</pre>`;
    response += '<h2>Body</h2>';
    response += `<pre>${body}</pre>`;

    res.set('Content-Type', 'text/html');
    res.send(response);
});

// Start server if we have the --server flag
if (opts.server === true) {
    const port = process.env.PORT || 3000;

    http
        .createServer(app)
        .listen(port, () => {
            console.log('Static server listening on http://localhost:%s', port);
        });
}

module.exports = app;
