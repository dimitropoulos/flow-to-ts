const { parse } = require("@babel/parser");
const traverse = require("../babel-traverse/lib/index.js").default;
const generate = require("@babel/generator").default;
const prettier = require("prettier/standalone.js");
const plugins = [require("prettier/parser-typescript.js")];

const transform = require("./transform.js");

const parseOptions = {
  sourceType: "module",
  plugins: [
    // enable jsx and flow syntax
    "jsx",
    "flow",

    "decorators-legacy",

    // handle esnext syntax
    "classProperties",
    "objectRestSpread",
    "dynamicImport",
    "optionalChaining",
    "nullishCoalescingOperator",
    "classPrivateProperties",
    "classPrivateMethods",
  ],
};

const fixComments = (commentsToNodesMap) => {
  for (const [key, value] of commentsToNodesMap) {
    const { leading, trailing } = value;

    if (leading && trailing) {
      trailing.trailingComments = trailing.trailingComments.filter(
        (comment) => {
          if (comment.type === "CommentLine") {
            try {
              if (comment.loc.start.line === trailing.loc.start.line) {
                // Leave this comment as is because it's at the end of a line,
                // e.g. console.log("hello, world"); // print 'hello, world'
                return true;
              }
            } catch (e) {
              console.log(trailing);
            }
          }
          const { start, end } = comment;
          return `${start}:${end}` !== key;
        }
      );
    }
  }
};

const convert = (flowCode, options) => {
  const ast = parse(flowCode, parseOptions);

  // key = startLine:endLine, value = {leading, trailing} (nodes)
  const commentsToNodesMap = new Map();

  const startLineToComments = {};
  for (const comment of ast.comments) {
    startLineToComments[comment.loc.start.line] = comment;
  }

  // apply our transforms, traverse mutates the ast
  const state = {
    usedUtilityTypes: new Set(),
    options: Object.assign({ inlineUtilityTypes: false }, options),
    commentsToNodesMap,
    startLineToComments,
  };
  traverse(ast, transform, null, state);

  fixComments(commentsToNodesMap);

  if (options && options.debug) {
    console.log(JSON.stringify(ast, null, 4));
  }

  // we pass flowCode so that generate can compute source maps
  // if we ever decide to
  let tsCode = generate(ast, flowCode).code;
  for (let i = 0; i < state.trailingLines; i++) {
    tsCode += "\n";
  }

  if (options && options.prettier) {
    const prettierOptions = {
      parser: "typescript",
      plugins,
      ...options.prettierOptions,
    };
    return prettier.format(tsCode, prettierOptions).trim();
  } else {
    return tsCode;
  }
};

module.exports = convert;
module.exports.parseOptions = parseOptions;
