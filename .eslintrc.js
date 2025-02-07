/*
👋 Hi! This file was autogenerated by tslint-to-eslint-config.
https://github.com/typescript-eslint/tslint-to-eslint-config

It represents the closest reasonable ESLint configuration to this
project's original TSLint configuration.

We recommend eventually switching this configuration to extend from
the recommended rulesets in typescript-eslint. 
https://github.com/typescript-eslint/tslint-to-eslint-config/blob/master/docs/FAQs.md

Happy linting! 💖
*/
module.exports = {
  env: {
    browser: true,
    node: true
  },
  extends: ["plugin:react/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    sourceType: "module"
  },
  plugins: ["eslint-plugin-react", "@typescript-eslint", "@typescript-eslint/tslint"],
  root: true,
  rules: {
    "react/jsx-key": "error",
    "react/jsx-no-bind": "off",
    "react/jsx-wrap-multilines": "off",
    "react/self-closing-comp": "error",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/jsx-boolean-value": "off",
    "react/jsx-no-target-blank": "off",
    "react/no-children-prop": "off"
  }
};
