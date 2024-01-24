module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier"
    ],
    "overrides": [
        {
            "env": {
                "node": true
            },
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "parserOptions": {
                "sourceType": "script"
            }
        },
        {
            "files": [ "tests/**/*.spec.ts" ],
            "rules": {
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-unused-vars": "off",
            }
        }
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "rules": {
        // Normally we would want this but we haven't yet figured out what the right balance between `any` and `unknown`
        // is for a library like this. (HTTP requests are one of the few cases where it's customary to probe values to
        // find out what's available, and using `unknown` makes that really hard.)
        "@typescript-eslint/no-explicit-any": "off",

        // We like namespaces
        "@typescript-eslint/no-namespace": "off",
    }
}
