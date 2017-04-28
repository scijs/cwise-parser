"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const esprima = require("esprima");
const uniq = require("uniq");
let PREFIX_COUNTER = 0;
function isGlobal(identifier) {
    if (identifier === "eval") {
        throw new Error("cwise-parser: eval() not allowed");
    }
    if (typeof window !== "undefined") {
        return identifier in window;
    }
    else if (typeof global !== "undefined") {
        return identifier in global;
    }
    else if (typeof self !== "undefined") {
        return identifier in self;
    }
    else {
        return false;
    }
}
function getArgNames(ast_calee) {
    return ast_calee.params.map((param) => {
        return param.name;
    });
}
function parse(func) {
    const src = ["(", func, ")()"].join("");
    const ast = esprima.parse(src, { range: true });
    const ast_calee = ast.body[0].expression.callee;
    // Compute new prefix
    const prefix = "_inline_" + (PREFIX_COUNTER++) + "_";
    // Parse out arguments
    const argNames = getArgNames(ast_calee);
    const compiledArgs = argNames.map((arg_name, i) => {
        return {
            name: [prefix, "arg", i, "_"].join(""),
            lvalue: false,
            rvalue: false,
            count: 0
        };
    });
    // Create temporary data structure for source rewriting
    const exploded = new Array(src.length);
    for (let i = 0, n = src.length; i < n; ++i) {
        exploded[i] = src.charAt(i);
    }
    // Local variables
    const localVars = [];
    const thisVars = [];
    // Retrieves a local variable
    function createLocal(id) {
        const nstr = prefix + id.replace(/\_/g, "__");
        localVars.push(nstr);
        return nstr;
    }
    // Creates a this variable
    function createThisVar(id) {
        const nstr = "this_" + id.replace(/\_/g, "__");
        thisVars.push(nstr);
        return nstr;
    }
    // Rewrites an ast node
    function rewrite(node, nstr) {
        const range = node.range;
        if (range) {
            const lo = range[0], hi = range[1];
            for (let i = lo + 1; i < hi; ++i) {
                exploded[i] = "";
            }
            exploded[lo] = nstr;
        }
    }
    // Remove any underscores
    function escapeString(str) {
        return "'" + (str.replace(/\_/g, "\\_").replace(/\'/g, "\'")) + "'";
    }
    // Returns the source of an identifier
    function source(node) {
        const range = node.range;
        if (!range) {
            throw new Error("range is null");
        }
        return exploded.slice(range[0], range[1]).join("");
    }
    // Computes the usage of a node
    const LVALUE = 1;
    const RVALUE = 2;
    function getUsage(node) {
        if (node.parent.type === "AssignmentExpression") {
            if (node.parent.left === node) {
                if (node.parent.operator === "=") {
                    return LVALUE;
                }
                return LVALUE | RVALUE;
            }
        }
        if (node.parent.type === "UpdateExpression") {
            return LVALUE | RVALUE;
        }
        return RVALUE;
    }
    // Handle visiting a node
    (function visit(node, parent) {
        node.parent = parent;
        if (node.type === "MemberExpression") {
            // Handle member expression
            if (node.computed) {
                visit(node.object, node);
                visit(node.property, node);
            }
            else if (node.object.type === "ThisExpression") {
                rewrite(node, createThisVar(node.property.name));
            }
            else {
                visit(node.object, node);
            }
        }
        else if (node.type === "ThisExpression") {
            throw new Error("cwise-parser: Computed this is not allowed");
        }
        else if (node.type === "Identifier") {
            // Handle identifier
            const name = node.name;
            const argNo = argNames.indexOf(name);
            if (argNo >= 0) {
                const carg = compiledArgs[argNo];
                const usage = getUsage(node);
                if (usage & LVALUE) {
                    carg.lvalue = true;
                }
                if (usage & RVALUE) {
                    carg.rvalue = true;
                }
                ++carg.count;
                rewrite(node, carg.name);
            }
            else if (isGlobal(name)) {
                // Don't rewrite globals
            }
            else {
                rewrite(node, createLocal(name));
            }
        }
        else if (node.type === "Literal") {
            if (typeof node.value === "string") {
                rewrite(node, escapeString(node.value));
            }
        }
        else if (node.type === "WithStatement") {
            throw new Error("cwise-parser: with() statements not allowed");
        }
        else {
            // Visit all children
            const keys = Object.keys(node);
            keys.forEach((key) => {
                if (key === "parent") {
                    return;
                }
                const value = node[key];
                if (value) {
                    if (value instanceof Array) {
                        value.forEach((val) => {
                            if (val && typeof val.type === "string") {
                                visit(val, node);
                            }
                        });
                    }
                    else if (typeof value.type === "string") {
                        visit(value, node);
                    }
                }
            });
        }
    })(ast_calee.body, undefined);
    // Remove duplicate variables
    uniq(localVars);
    uniq(thisVars);
    // Return body
    return {
        body: source(ast_calee.body),
        args: compiledArgs,
        thisVars: thisVars,
        localVars: localVars
    };
}
exports.parse = parse;
exports.default = parse;
