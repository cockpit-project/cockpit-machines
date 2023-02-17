import fs from "fs";

import copy from "copy-webpack-plugin";
import extract from "mini-css-extract-plugin";
import TerserJSPlugin from 'terser-webpack-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import CompressionPlugin from "compression-webpack-plugin";
import ESLintPlugin from 'eslint-webpack-plugin';
import StylelintPlugin from 'stylelint-webpack-plugin';

import CockpitPoPlugin from "./pkg/lib/cockpit-po-plugin.js";
import CockpitRsyncPlugin from "./pkg/lib/cockpit-rsync-plugin.js";

// Obtain package name from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json'));

/* A standard nodejs and webpack pattern */
const production = process.env.NODE_ENV === 'production';

/* Default to disable csslint for faster production builds */
const stylelint = process.env.STYLELINT ? (process.env.STYLELINT !== '0') : !production;

// Non-JS files which are copied verbatim to dist/
const copy_files = [
    "./src/index.html",
    "./src/manifest.json",
];

const plugins = [
    new copy({ patterns: copy_files }),
    new extract({ filename: "[name].css" }),
    new ESLintPlugin({
        extensions: ["js", "jsx"],
        failOnWarning: true,
    }),
    new CockpitPoPlugin(),
    new CockpitRsyncPlugin({ dest: packageJson.name }),
];

if (stylelint) {
    plugins.push(new StylelintPlugin({
        context: "src/",
    }));
}

/* Only minimize when in production mode */
if (production) {
    plugins.unshift(new CompressionPlugin({
        test: /\.(js|html|css)$/,
        deleteOriginalAssets: true
    }));
}

const config = {
    mode: production ? 'production' : 'development',
    resolve: {
        modules: ['node_modules', 'pkg/lib'],
        alias: { 'font-awesome': 'font-awesome-sass/assets/stylesheets' },
        // TODO: The following fallbacks are needed for ip module - replace this module with one better maintained
        fallback: {
            browser: false,
            os: false,
            buffer: "buffer",
        }
    },
    resolveLoader: {
        modules: ['node_modules', 'pkg/lib'],
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
    devtool: "source-map",
    stats: "errors-warnings",

    optimization: {
        minimize: production,
        minimizer: [
            new TerserJSPlugin({
                extractComments: {
                    condition: true,
                    filename: `[file].LICENSE.txt?query=[query]&filebase=[base]`,
                    banner(licenseFile) {
                        return `License information can be found in ${licenseFile}`;
                    },
                },
            }),
            // https://github.com/patternfly/patternfly-react/issues/5650
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: ['default', { mergeLonghand: false }]
                }
            })
        ],
    },

    module: {
        rules: [
            {
                exclude: /node_modules/,
                use: "babel-loader",
                test: /\.(js|jsx)$/
            },
            /* HACK: remove unwanted fonts from PatternFly's css */
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
                                    replace: 'src:url("../base1/fonts/patternfly.woff") format("woff");',
                                },
                                {
                                    search: /@font-face[^}]*patternfly-fonts-fake-path[^}]*}/g,
                                    replace: '',
                                },
                            ]
                        },
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sourceMap: !production,
                            sassOptions: {
                                quietDeps: true,
                                outputStyle: production ? 'compressed' : undefined,
                            },
                        },
                    },
                ]
            },
            {
                test: /\.s?css$/,
                exclude: /patternfly-4-cockpit.scss/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: !production,
                            url: false
                        }
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sourceMap: !production,
                            sassOptions: {
                                quietDeps: true,
                                outputStyle: production ? 'compressed' : undefined,
                            },
                        },
                    },

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
};

export default config;
