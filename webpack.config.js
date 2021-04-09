const path = require("path");
const childProcess = require('child_process');

const copy = require("copy-webpack-plugin");
const extract = require("mini-css-extract-plugin");
const TerserJSPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const CompressionPlugin = require("compression-webpack-plugin");
const CockpitPoPlugin = require("./src/lib/cockpit-po-plugin");

const webpack = require("webpack");

const nodedir = path.resolve((process.env.SRCDIR || __dirname), "node_modules");

/* A standard nodejs and webpack pattern */
const production = process.env.NODE_ENV === 'production';

// Non-JS files which are copied verbatim to dist/
const copy_files = [
    "./src/index.html",
    "./src/manifest.json",
];

const plugins = [
    new copy({ patterns: copy_files }),
    new extract({filename: "[name].css"}),
    new CockpitPoPlugin(),
];

/* Only minimize when in production mode */
if (production) {
    plugins.unshift(new CompressionPlugin({
        test: /\.(js|html|css)$/,
        deleteOriginalAssets: true
    }));
}

/* check if sassc is available, to avoid unintelligible error messages */
try {
    childProcess.execFileSync('sassc', ['--version'], { stdio: ['pipe', 'inherit', 'inherit'] });
} catch (e) {
    if (e.code === 'ENOENT') {
        console.error("ERROR: You need to install the 'sassc' package to build this project.");
        process.exit(1);
    } else {
        throw e;
    }
}

module.exports = {
    mode: production ? 'production' : 'development',
    resolve: {
        modules: [ nodedir, path.resolve(__dirname, 'src/lib') ],
        alias: { 'font-awesome': path.resolve(nodedir, 'font-awesome-sass/assets/stylesheets') },
    },
    resolveLoader: {
        modules: [ nodedir, path.resolve(__dirname, 'src/lib') ],
    },
    watchOptions: {
        ignored: /node_modules/,
    },
    entry: {
        index: [
            "./src/index.js",
            "./src/machines.scss",
        ]
    },
    // cockpit.js gets included via <script>, everything else should be bundled
    externals: { "cockpit": "cockpit" },
    devtool: "source-map",
    stats: "errors-warnings",

    optimization: {
        minimize: production,
        minimizer: [new TerserJSPlugin({}), new OptimizeCSSAssetsPlugin({})],
    },

    module: {
        rules: [
            {
                enforce: 'pre',
                exclude: /node_modules/,
                loader: 'eslint-loader',
                test: /\.(js|jsx)$/
            },
            {
                exclude: /node_modules/,
                use: "babel-loader",
                test: /\.(js|jsx)$/
            },
            /* HACK: remove unwanted fonts from PatternFly's css */
            {
                test: /patternfly-cockpit.scss$/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: !production,
                            url: false,
                        },
                    },
                    {
                        loader: 'string-replace-loader',
                        options: {
                            multiple: [
                                {
                                    search: /src:url[(]"patternfly-icons-fake-path\/glyphicons-halflings-regular[^}]*/g,
                                    replace: 'font-display:block; src:url("../base1/fonts/glyphicons.woff") format("woff");',
                                },
                                {
                                    search: /src:url[(]"patternfly-fonts-fake-path\/PatternFlyIcons[^}]*/g,
                                    replace: 'src:url("../base1/fonts/patternfly.woff") format("woff");',
                                },
                                {
                                    search: /src:url[(]"patternfly-fonts-fake-path\/fontawesome[^}]*/,
                                    replace: 'font-display:block; src:url("../base1/fonts/fontawesome.woff?v=4.2.0") format("woff");',
                                },
                                {
                                    search: /src:url\("patternfly-icons-fake-path\/pficon[^}]*/g,
                                    replace: 'src:url("../base1/fonts/patternfly.woff") format("woff");',
                                },
                                {
                                    search: /@font-face[^}]*patternfly-fonts-fake-path[^}]*}/g,
                                    replace: '',
                                },
                            ]
                        },
                    },
                    'sassc-loader',
                ]
            },
            {
                test: /patternfly-4-cockpit.scss$/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: !production,
                            url: false,
                        },
                    },
                    {
                        loader: 'string-replace-loader',
                        options: {
                            multiple: [
                                {
                                    search: /src:url\("patternfly-icons-fake-path\/pficon[^}]*/g,
                                    replace: "src:url('fonts/patternfly.woff')format('woff');",
                                },
                                {
                                    search: /@font-face[^}]*patternfly-fonts-fake-path[^}]*}/g,
                                    replace: '',
                                },
                            ]
                        },
                    },
                    'sassc-loader',
                ]
            },
            {
                test: /\.s?css$/,
                exclude: /patternfly-(4-)?cockpit.scss/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: !production,
                            url: false
                        }
                    },
                    'sassc-loader',
                ]
            },
            {
                // See https://github.com/patternfly/patternfly-react/issues/3815 and
                // [Redefine grid breakpoints] section in pkg/lib/_global-variables.scss for more details
                // Components which are using the pf-global--breakpoint-* variables should import scss manually
                // instead off the automatically imported CSS stylesheets
                test: /\.css$/,
                include: stylesheet => {
                    return (
                        stylesheet.includes('@patternfly/react-styles/css/components/Table/') ||
                        stylesheet.includes('@patternfly/react-styles/css/components/Page/') ||
                        stylesheet.includes('@patternfly/react-styles/css/components/Toolbar/')
                    );
                },
                use: ["null-loader"]
            }
        ]
    },
    plugins: plugins
}
